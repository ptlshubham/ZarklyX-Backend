import express, { Request, Response } from "express";
import { Op } from "sequelize";
import {
  generatePinterestAuthUrl,
  exchangePinterestCodeForTokens,
  refreshPinterestAccessToken,
  getPinterestUser,
  listBoards,
  createPin,
} from "../../../../../services/pinterest-service";
import { saveOrUpdateToken } from "../../../../../services/token-store.service";
import { SocialToken } from "../social-token.model";
import { MetaSocialAccount } from "../meta-social-account.model";
import { PinterestAssignment } from "./pinterest-assignment.model";
import { Clients } from "../../clients/clients-model";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

// Server-side temporary store for OAuth state
const oauthStateStore = new Map<string, { 
  companyId: string
  timestamp: number
  successRedirectUri?: string | null
  errorRedirectUri?: string | null
  intent?: string | null
}>();

// Clean up expired state entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of oauthStateStore.entries()) {
        if (now - value.timestamp > 30 * 60 * 1000) { // 30 minute expiry
            oauthStateStore.delete(key);
        }
    }
}, 5 * 60 * 1000);

const router = express.Router();

/**
 * Helper: Resolve an incoming profile identifier (may be provider accountId or DB id)
 * Returns: { accountId, socialToken } when found, otherwise null
 */
async function resolveProfileIdentifier(companyId: string, profileIdentifier: string) {
  if (!companyId || !profileIdentifier) return null;
  try {
    // First try treating the identifier as provider accountId
    let social = await SocialToken.findOne({ where: { provider: 'pinterest', accountId: profileIdentifier, companyId } , raw: true});
    if (social) return { accountId: social.accountId, socialToken: social };

    // Next try treating it as the DB primary key id
    social = await SocialToken.findOne({ where: { provider: 'pinterest', id: profileIdentifier, companyId }, raw: true });
    if (social) return { accountId: social.accountId, socialToken: social };

    return null;
  } catch (e: any) {
    console.error('[PINTEREST RESOLVE PROFILE] Error resolving profile identifier:', { companyId, profileIdentifier, message: e.message });
    return null;
  }
}

function extractTokens(req: Request) {
  const at = ((req.headers["x-access-token"] as string) || (req.query.access_token as string) || (req.body?.access_token as string) || "").trim();
  const rt = ((req.headers["x-refresh-token"] as string) || (req.query.refresh_token as string) || (req.body?.refresh_token as string) || "").trim();
  const tokens: any = {};
  if (at) tokens.access_token = at;
  if (rt) tokens.refresh_token = rt;
  return tokens;
}

/**
 * Resolve access token for incoming request.
 * Priority: x-access-token / access_token (header/query/body) -> stored SocialToken by companyId
 * Returns: { accessToken?: string, refreshToken?: string, socialToken?: SocialTokenInstance }
 */
async function resolveAccessToken(req: Request) {
  const tokens = extractTokens(req);
  let accessToken = tokens.access_token;
  let refreshToken = tokens.refresh_token;

  if (accessToken) {
    return { accessToken, refreshToken };
  }
  // Prefer explicit accountId when provided. If multiple accounts exist for a
  // company, callers MUST pass `accountId` to select which account to use.
  const companyId = (req.params?.companyId as string) || (req.query.companyId as string) || (req.body?.companyId as string) || undefined;
  const accountId = (req.query.accountId as string) || (req.body?.accountId as string) || (req.params?.accountId as string) || undefined;

  try {
    if (companyId && accountId) {
      const stored = await SocialToken.findOne({ where: { companyId: companyId, provider: 'pinterest', accountId: accountId } });
      if (stored && (stored as any).accessToken) {
        return { accessToken: (stored as any).accessToken, refreshToken: (stored as any).refreshToken, socialToken: stored };
      }
    }

    // If accountId not provided, fall back to company-level behavior:
    if (companyId) {
      const storedList = await SocialToken.findAll({ where: { companyId: companyId, provider: 'pinterest' } });
      if (storedList && storedList.length === 1) {
        const stored = storedList[0];
        return { accessToken: (stored as any).accessToken, refreshToken: (stored as any).refreshToken, socialToken: stored };
      }
      // If multiple accounts found, do not choose one silently; require caller to pass accountId
      if (storedList && storedList.length > 1) {
        console.warn('[PINTEREST TOKEN RESOLVE] Multiple Pinterest accounts found for company; require accountId param');
        return { accessToken: null };
      }
    }
  } catch (dbErr) {
    console.error('[PINTEREST TOKEN RESOLVE] Error querying SocialToken:', dbErr);
  }

  return { accessToken: null };
}

/**
 *  API DOCUMENTATION - PINTEREST INTEGRATION ENDPOINTS
 * ======================================================
 * All endpoints require tokens (access_token or refresh_token) via headers, query params, or body
 * Token sources: x-access-token, x-refresh-token headers OR access_token, refresh_token query params/body
 */

/**
 *  AUTHENTICATION ENDPOINTS
 */

/**
 *  GET /pinterest/auth/url
 * Purpose: Generate OAuth authorization URL for Pinterest authentication
 * Params: 
 *   - companyId (required, query): Company ID to associate with the Pinterest account
 *   - scopes (optional, query): Comma-separated OAuth scopes (default: user_accounts:read,boards:read)
 *   - successRedirectUri (optional, query): URL to redirect to after successful OAuth
 *   - errorRedirectUri (optional, query): URL to redirect to after OAuth error
 * Returns: { success, url, scopes, expectedRedirectUri, clientId, companyId, successRedirectUri, errorRedirectUri }
 * Usage: Frontend redirects user to returned `url` for Pinterest login
 */
router.get("/auth/url", async (req: Request, res: Response): Promise<void> => {
  try {
    const scopesParam =
      (req.query.scopes as string) ||
      process.env.PINTEREST_SCOPES ||
      "user_accounts:read,boards:read,boards:write,pins:read,pins:write";

    const scopes = scopesParam.split(/[ ,]+/).filter(Boolean);
    const companyId = req.query.companyId as string;

    const successRedirectUri = req.query.successRedirectUri as string;
    const errorRedirectUri = req.query.errorRedirectUri as string;

    if (!companyId) {
      res.status(400).json({ success: false, error: "companyId is required" });
      return;
    }

    // Generate unique state
    const stateId = uuidv4();

    // Detect intent (add = connect another account)
    const intent =
      (req.query.intent as string) ||
      (req.query.action as string) ||
      null;

    oauthStateStore.set(stateId, {
      companyId,
      successRedirectUri: successRedirectUri || null,
      errorRedirectUri: errorRedirectUri || null,
      timestamp: Date.now(),
      intent: intent || null,
    });

    // Generate base Pinterest auth URL
    const { url: baseUrl } = generatePinterestAuthUrl(scopes);

    // Replace state with our custom state
    let authUrl = baseUrl.replace(
      /state=[^&]*/,
      `state=${encodeURIComponent(stateId)}`
    );

    // ✅ PRODUCTION-SAFE PROMPT BASED APPROACH
    const shouldForceLogin =
      intent === "add" ||
      req.query.forceReauth === "1" ||
      req.query.force === "1";

    if (shouldForceLogin) {
      const separator = authUrl.includes("?") ? "&" : "?";
      authUrl = `${authUrl}${separator}prompt=login`;
    }

    const expectedRedirectUri =
      process.env.PINTEREST_REDIRECT_URI ||
      `${process.env.API_URL || "http://localhost:9005"}/pinterest/oauth2callback`;

    const defaultSuccessRedirectUri =
      `${process.env.ADMIN_URL || "http://localhost:4200"}/social-integration/pinterest`;

    const defaultErrorRedirectUri =
      `${process.env.ADMIN_URL || "http://localhost:4200"}/social-integration/pinterest?error=true`;

    console.log("[PINTEREST AUTH URL] Generated OAuth URL:", {
      companyId,
      stateId,
      scopes,
      expectedRedirectUri,
      successRedirectUri: successRedirectUri || defaultSuccessRedirectUri,
      errorRedirectUri: errorRedirectUri || defaultErrorRedirectUri,
      intent,
      promptAdded: shouldForceLogin,
    });

    res.status(200).json({
      success: true,
      url: authUrl,
      scopes,
      expectedRedirectUri,
      clientId:
        (process.env.PINTEREST_APP_ID || process.env.PINTEREST_CLIENT_ID || "").slice(0, 10) + "…",
      companyId,
      successRedirectUri: successRedirectUri || defaultSuccessRedirectUri,
      errorRedirectUri: errorRedirectUri || defaultErrorRedirectUri,
    });

    return;
  } catch (error: any) {
    console.error("[PINTEREST AUTH URL] Error generating auth URL:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to generate auth URL",
    });
    return;
  }
});

// Convenience endpoint: Initiate a standard Connect flow (no forced reauth)
router.get("/auth/url/connect", async (req: Request, res: Response): Promise<void> => {
  try {
    // Reuse main auth URL logic but force intent to 'connect'
    const q: any = { ...req.query };
    q.intent = q.intent || 'connect';
    // forward to existing handler logic by delegating to the /auth/url route implementation
    // Build a shallow redirect: call generatePinterestAuthUrl here to avoid duplicate state.
    const scopesParam = (q.scopes as string) || process.env.PINTEREST_SCOPES || "user_accounts:read,boards:read,boards:write,pins:read,pins:write";
    const scopes = (scopesParam as string).split(/[ ,]+/).filter(Boolean);
    const companyId = q.companyId as string;

    if (!companyId) {
      res.status(400).json({ success: false, error: 'companyId is required' });
      return;
    }

    const stateId = uuidv4();
    oauthStateStore.set(stateId, {
      companyId,
      successRedirectUri: (q.successRedirectUri as string) || null,
      errorRedirectUri: (q.errorRedirectUri as string) || null,
      timestamp: Date.now(),
      intent: 'connect'
    });

    const { url: baseUrl } = generatePinterestAuthUrl(scopes);
    const authUrl = baseUrl.replace(/state=[^&]*/, `state=${encodeURIComponent(stateId)}`);

    const defaultSuccessRedirectUri = `${process.env.ADMIN_URL || "http://localhost:4200"}/social-integration/pinterest`;
    const defaultErrorRedirectUri = `${process.env.ADMIN_URL || "http://localhost:4200"}/social-integration/pinterest?error=true`;

    res.status(200).json({
      success: true,
      url: authUrl,
      scopes,
      expectedRedirectUri: process.env.PINTEREST_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/pinterest/oauth2callback`,
      clientId: ((process.env.PINTEREST_APP_ID || process.env.PINTEREST_CLIENT_ID || "") as string).slice(0, 10) + "…",
      companyId,
      successRedirectUri: (q.successRedirectUri as string) || defaultSuccessRedirectUri,
      errorRedirectUri: (q.errorRedirectUri as string) || defaultErrorRedirectUri,
    });
    return;
  } catch (error: any) {
    console.error('[PINTEREST AUTH URL CONNECT] Error generating auth URL:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to generate auth URL' });
    return;
  }
});

// Convenience endpoint: Initiate an Add Profile flow (force re-authentication / prompt=login)
router.get("/auth/url/add", async (req: Request, res: Response): Promise<void> => {
  try {
    const q: any = { ...req.query };
    q.intent = q.intent || 'add';
    const scopesParam = (q.scopes as string) || process.env.PINTEREST_SCOPES || "user_accounts:read,boards:read,boards:write,pins:read,pins:write";
    const scopes = (scopesParam as string).split(/[ ,]+/).filter(Boolean);
    const companyId = q.companyId as string;

    if (!companyId) {
      res.status(400).json({ success: false, error: 'companyId is required' });
      return;
    }

    const stateId = uuidv4();
    oauthStateStore.set(stateId, {
      companyId,
      successRedirectUri: (q.successRedirectUri as string) || null,
      errorRedirectUri: (q.errorRedirectUri as string) || null,
      timestamp: Date.now(),
      intent: 'add'
    });

    const { url: baseUrl } = generatePinterestAuthUrl(scopes);
    const separator = baseUrl.includes('?') ? '&' : '?';
    // force reauthentication prompt
    const authUrl = `${baseUrl.replace(/state=[^&]*/, `state=${encodeURIComponent(stateId)}`)}${separator}prompt=login`;

    const defaultSuccessRedirectUri = `${process.env.ADMIN_URL || "http://localhost:4200"}/social-integration/pinterest`;
    const defaultErrorRedirectUri = `${process.env.ADMIN_URL || "http://localhost:4200"}/social-integration/pinterest?error=true`;

    res.status(200).json({
      success: true,
      url: authUrl,
      scopes,
      expectedRedirectUri: process.env.PINTEREST_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/pinterest/oauth2callback`,
      clientId: ((process.env.PINTEREST_APP_ID || process.env.PINTEREST_CLIENT_ID || "") as string).slice(0, 10) + "…",
      companyId,
      successRedirectUri: (q.successRedirectUri as string) || defaultSuccessRedirectUri,
      errorRedirectUri: (q.errorRedirectUri as string) || defaultErrorRedirectUri,
    });
    return;
  } catch (error: any) {
    console.error('[PINTEREST AUTH URL ADD] Error generating auth URL:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to generate auth URL' });
    return;
  }
});

// POST /pinterest/profiles/save
router.post('/profiles/save', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body || {};
    const companyId = (body.companyId as string) || (req.query.companyId as string) || undefined;
    const accountId = (body.accountId as string) || (body.vendorAccountId as string) || undefined;
    const displayName = body.displayName || body.name || body.accountName || null;
    const accountEmail = body.accountEmail || body.email || null;
    const pictureUrl = body.pictureUrl || (body.picture && (body.picture.data?.url || body.picture.url)) || null;

    if (!companyId || !accountId) {
      res.status(400).json({ success: false, message: 'companyId and accountId are required' });
      return;
    }

    // Upsert into SocialToken using companyId + provider + accountId
    const existing = await SocialToken.findOne({ where: { companyId, provider: 'pinterest', accountId } });
    if (existing) {
      await existing.update({ accountEmail: accountEmail || existing.accountEmail });
      const mapped = {
        id: existing.id,
        accountId: existing.accountId,
        accountEmail: existing.accountEmail,
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt
      };
      res.status(200).json({ success: true, data: mapped });
      return;
    }

    const created = await SocialToken.create({
      companyId,
      provider: 'pinterest',
      accountId,
      accountEmail: accountEmail || null,
      accessToken: null,
      refreshToken: null,
      expiryDate: null,
      tokenType: null,
      scopes: (process.env.PINTEREST_SCOPES || 'user_accounts:read').split(/[ ,]+/).filter(Boolean).join(','),
    });

    const mapped = {
      id: created.id,
      accountId: created.accountId,
      accountEmail: created.accountEmail,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt
    };

    res.status(201).json({ success: true, data: mapped });
    return;
  } catch (err: any) {
    console.error('[PINTEREST PROFILES SAVE] Error saving profile:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to save profile' });
    return;
  }
});


/**
 *  GET /pinterest/oauth2callback
 * Purpose: OAuth callback endpoint - receives auth code from Pinterest and exchanges for tokens
 * Params:
 *   - code (required, query): Authorization code from Pinterest OAuth
 *   - state (required, query): State parameter linking to companyId
 * Returns: Redirects to frontend with success/error message and tokens
 * Stores: Saves tokens to database
 */
router.get("/oauth2callback", async (req: Request, res: Response): Promise<void> => {
  let companyId: string | null = null;
  let successRedirectUri: string | null = null;
  let errorRedirectUri: string | null = null;
  let oauthIntent: string | null = null;

  try {
    console.log("[PINTEREST OAUTH2CALLBACK] Incoming request:", {
      query: req.query
    });

    const error = req.query.error as string;
    const errorDescription = req.query.error_description as string;

    if (error) {
      console.error("[PINTEREST OAUTH ERROR]", error, errorDescription);
      res.status(400).json({
        success: false,
        error,
        error_description: errorDescription
      });
      return;
    }

    let code = (req.query.code as string) || "";
    const state = req.query.state as string;

    if (!code) {
      res.status(400).json({
        success: false,
        message: "Missing authorization code"
      });
      return;
    }

    // Retrieve stored state
    if (state) {
      const stateData = oauthStateStore.get(state);
      if (stateData) {
        companyId = stateData.companyId;
        successRedirectUri = stateData.successRedirectUri || null;
        errorRedirectUri = stateData.errorRedirectUri || null;
        oauthIntent = stateData.intent || null;
        oauthStateStore.delete(state);
      }
    }

    if (!companyId) {
      throw new Error("Invalid or expired OAuth state");
    }

    // Exchange code for tokens
    const tokenRes = await exchangePinterestCodeForTokens(code);

    if (!tokenRes?.access_token) {
      throw new Error("Failed to receive access token from Pinterest");
    }

    // Fetch Pinterest user profile
    const user = await getPinterestUser(tokenRes.access_token);

    const accountId = user?.id;
    const accountEmail = user?.username || null;
    const displayName = user?.username || null;
  const pictureUrl = user?.profile_image?.original?.url || user?.image?.url || user?.profile_image?.url || user?.profile_image_url || null;

    if (!accountId) {
      throw new Error("Unable to retrieve Pinterest account ID");
    }

    console.log("[PINTEREST USER]", {
      companyId,
      accountId,
      accountEmail
    });

    // 🔥 MULTI-ACCOUNT SAFE SAVE LOGIC
    const existingAccount = await SocialToken.findOne({
      where: {
        companyId,
        provider: "pinterest",
        accountId
      }
    });

    if (existingAccount) {
      await existingAccount.update({
        accessToken: tokenRes.access_token,
        refreshToken: tokenRes.refresh_token,
        expiryDate: tokenRes.expires_in
          ? Date.now() + tokenRes.expires_in * 1000
          : null,
        tokenType: tokenRes.token_type || "Bearer",
        accountEmail
      });

      console.log("[PINTEREST] Existing account updated:", accountId);
    } else {
      await SocialToken.create({
        companyId,
        provider: "pinterest",
        accountId,
        accountEmail,
        accessToken: tokenRes.access_token,
        refreshToken: tokenRes.refresh_token,
        expiryDate: tokenRes.expires_in
          ? Date.now() + tokenRes.expires_in * 1000
          : null,
        tokenType: tokenRes.token_type || "Bearer",
        scopes: (process.env.PINTEREST_SCOPES ||
          "user_accounts:read,boards:read").split(/[ ,]+/).filter(Boolean).join(','),
      });

      console.log("[PINTEREST] New account connected:", accountId);
    }

    // Build redirect URL (NO TOKENS SENT TO FRONTEND)
    const defaultSuccessUri =
      `${process.env.ADMIN_URL || "http://localhost:4200"}/social-integration/pinterest`;

    const redirectUri = successRedirectUri || defaultSuccessUri;

    const params = new URLSearchParams({
      success: "true",
      provider: "pinterest",
      source: "pinterest",
      accountId,
      accountEmail: accountEmail || "",
      pictureUrl: pictureUrl || "", // ✅ Include profile picture in redirect params
      intent: oauthIntent || ""
    });

  const finalRedirectUrl = `${redirectUri}?${params.toString()}`;

  console.log("[PINTEREST REDIRECT SUCCESS]", finalRedirectUrl);

  res.redirect(finalRedirectUrl);
  return;

  } catch (error: any) {
    console.error("[PINTEREST OAUTH ERROR]", error);

    const defaultErrorUri =
      `${process.env.ADMIN_URL || "http://localhost:4200"}/social-integration/pinterest`;

    const redirectUri = errorRedirectUri || defaultErrorUri;

    const params = new URLSearchParams({
      success: "false",
      provider: "pinterest",
      error: error.message || "OAuth failed"
    });

    const finalRedirectUrl =
      `${redirectUri}${redirectUri.includes("?") ? "&" : "?"}${params.toString()}`;

    res.redirect(finalRedirectUrl);
    return;
  }
});

// POST /pinterest/token/refresh { refresh_token }
router.post("/token/refresh", async (req: Request, res: Response): Promise<void> => {
  try {
    const rt = (req.body?.refresh_token as string) || (req.query.refresh_token as string) || (req.headers["x-refresh-token"] as string);
    if (!rt) { 
      console.warn("[PINTEREST TOKEN/REFRESH] Missing refresh_token");
      res.status(400).json({ success: false, message: "Missing refresh_token" }); 
      return; 
    }
    
    console.log("[PINTEREST TOKEN/REFRESH] Refreshing access token...");
    const tokens = await refreshPinterestAccessToken(rt);
    
    console.log("[PINTEREST TOKEN/REFRESH] Token refreshed successfully:", {
      access_token: tokens?.access_token?.substring(0, 20) + "...",
      token_type: tokens?.token_type,
      expires_in: tokens?.expires_in,
    });
    
    res.status(200).json({ success: true, tokens });
  } catch (e: any) {
    console.error("[PINTEREST TOKEN/REFRESH] Error refreshing token:", e.message);
    res.status(500).json({ success: false, message: e.response?.data || e.message || "Failed to refresh token" });
  }
});



/**
 *  GET /pinterest/me
 * Purpose: Fetch authenticated Pinterest user profile
 * Params: 
 *   - access_token (required, query/header/body): Pinterest access token
 * Returns: { success, user: { id, username, name, email, picture, ... } }
 */
router.get("/me", async (req: Request, res: Response): Promise<void> => {
    try {
      const resolved = await resolveAccessToken(req);
      const accessToken = resolved.accessToken;

      if (!accessToken) {
        console.warn("[PINTEREST ME] Missing access_token and no stored token for companyId");
        res.status(400).json({ success: false, message: "Provide access_token or companyId with stored token" });
        return;
      }

      console.log("[PINTEREST ME] Token resolved (source: " + (resolved.socialToken ? 'stored' : 'request') + ")", {
        accessToken: accessToken.substring(0, 20) + "...",
      });

      try {
        const me = await getPinterestUser(accessToken);
          
          // If email is not available, generate one from the ID
          const email = me?.email || (me?.id ? `pinterest_${me.id}@pinterest.local` : 'unknown@pinterest.local');
          
          // Try to get displayName from database (stored during OAuth)
          let displayName: string | null = null;
          try {
              const socialToken = await SocialToken.findOne({ where: { provider: 'pinterest' } });
              if (socialToken?.accountEmail) {
                  displayName = socialToken.accountEmail;
              }
          } catch (err) {
              console.error("[PINTEREST ME] Error retrieving accountEmail from database:", err);
          }
          
          // Use displayName from DB, fallback to business_name, then username
          const name = displayName || me?.business_name || me?.username || (me?.id ? `User_${me.id.substring(0, 8)}` : 'Pinterest User');
          
          const userWithEmail = { ...me, email, name };
          
          console.log("[PINTEREST ME] User profile prepared:", {
              id: me?.id,
              name: name,
              email: email,
              emailFromAPI: me?.email || 'not provided - using generated',
              displayNameSource: displayName ? 'database' : 'api'
          });
          res.status(200).json({ success: true, user: userWithEmail });
          return;
      } catch (error: any) {
          const status = error?.response?.status || 500;
          const errorMsg = error?.response?.data?.error?.message || error.message || "Failed to fetch profile";
          
          console.error("[PINTEREST ME] Failed to get profile:", {
            status,
            message: errorMsg,
            retryAfter: error?.response?.headers?.['retry-after']
          });
          
          // Pass through rate limit headers if present
          if (error?.response?.status === 429) {
            const retryAfter = error?.response?.headers?.['retry-after'];
            if (retryAfter) {
              res.set('Retry-After', retryAfter);
            }
          }
          
          res.status(status).json({
              success: false,
              message: errorMsg
          });
          return;
      }
    } catch (err: any) {
      console.error("[PINTEREST ME] Unexpected error:", err.message);
      res.status(500).json({
        success: false,
        message: "Unexpected error fetching profile"
      });
      return;
    }
});

/**
 *  GET /pinterest/me/profile
 * Purpose: Fetch Pinterest user profile with additional details (alias for /pinterest/me)
 * Params: 
 *   - access_token (required, query/header/body): Pinterest access token
 * Returns: { success, user: { id, username, name, email, picture, ... } }
 */
router.get("/me/profile", async (req: Request, res: Response): Promise<void> => {
  try {
    // Use resolveAccessToken to respect companyId/accountId selection and stored tokens
    const resolved = await resolveAccessToken(req);
    let accessToken = resolved.accessToken as string | null | undefined;

    // If no access token resolved, ask caller to provide accountId or access_token
    if (!accessToken) {
      console.warn('[PINTEREST ME/PROFILE] No access token resolved - caller must provide access_token or companyId+accountId');
      res.status(400).json({ success: false, message: 'Provide access_token or companyId+accountId to select a stored token' });
      return;
    }

    console.log('[PINTEREST ME/PROFILE] Using access token (source: ' + (resolved.socialToken ? 'stored' : 'request') + ')', {
      accessPreview: String(accessToken).substring(0, 20) + '...'
    });

    // Try to fetch the Pinterest user. If token expired and we have a refresh token, try refresh once.
    let me: any;
    try {
      me = await getPinterestUser(accessToken as string);
    } catch (err: any) {
      console.warn('[PINTEREST ME/PROFILE] getPinterestUser failed, attempting refresh if possible', { message: err.message, status: err?.response?.status });

      // If we have a stored refresh token, attempt to refresh and retry
      const stored: any = resolved.socialToken || null;
      if (stored && stored.refreshToken) {
        try {
          const refreshed = await refreshPinterestAccessToken(stored.refreshToken);
          if (refreshed?.access_token) {
            // persist refreshed tokens
            try {
              await stored.update({ accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token || stored.refreshToken, expiryDate: refreshed.expires_in ? Date.now() + refreshed.expires_in * 1000 : null });
            } catch (uErr) {
              console.error('[PINTEREST ME/PROFILE] Failed to persist refreshed tokens:', uErr);
            }
            accessToken = refreshed.access_token;
            me = await getPinterestUser(accessToken as string);
          }
        } catch (refreshErr: any) {
          console.error('[PINTEREST ME/PROFILE] Refresh attempt failed:', { message: refreshErr.message, data: refreshErr?.response?.data });
          // continue to throw original error below
        }
      }
      if (!me) throw err;
    }

    // Compose response similar to /me
    const email = me?.email || (me?.id ? `pinterest_${me.id}@pinterest.local` : 'unknown@pinterest.local');

    // Try to get displayName from database (stored during OAuth) for given company/account
    let displayName: string | null = null;
    try {
      // Prefer using resolved.socialToken to avoid ambiguous database lookups
      if (resolved.socialToken) {
        displayName = (resolved.socialToken as any).displayName || null;
      } else {
        const socialToken = await SocialToken.findOne({ where: { provider: 'pinterest' } });
        displayName = socialToken?.accountEmail || null;
      }
    } catch (err) {
      console.error("[PINTEREST ME/PROFILE] Error retrieving accountEmail from database:", err);
    }

    const name = displayName || me?.business_name || me?.username || (me?.id ? `User_${String(me.id).substring(0, 8)}` : 'Pinterest User');
    const avatar = me?.profile_image || me?.profile_image_url || me?.image?.original?.url || me?.image?.url || null;

    const userWithEmail = { ...me, email, name, avatar };

    console.log("[PINTEREST ME/PROFILE] User profile prepared:", { id: me?.id, name, email, avatar: avatar || 'none' });

    res.status(200).json({ success: true, user: userWithEmail });
    return;
  } catch (error: any) {
    const status = error?.response?.status || 500;
    const errorMsg = error?.response?.data?.error?.message || error?.response?.data || error.message || "Failed to get profile";
    console.error("[PINTEREST ME/PROFILE] Failed to get profile:", { 
      status,
      message: errorMsg,
      retryAfter: error?.response?.headers?.['retry-after']
    });
    
    // Pass through rate limit headers if present
    if (error?.response?.status === 429) {
      const retryAfter = error?.response?.headers?.['retry-after'];
      if (retryAfter) {
        res.set('Retry-After', retryAfter);
      }
    }
    
    res.status(status).json({
      success: false,
      message: errorMsg
    });
    return;
  }
});

// GET /pinterest/boards - Get current user's boards
router.get("/boards", async (req: Request, res: Response): Promise<void> => {
  try {
    const resolved = await resolveAccessToken(req);
    const accessToken = resolved.accessToken;
    if (!accessToken) {
      console.warn("[PINTEREST BOARDS] Missing access_token and no stored token for companyId");
      res.status(400).json({ success: false, message: "Provide access_token or companyId with stored token" });
      return;
    }
    console.log("[PINTEREST BOARDS] Fetching user boards (token source: " + (resolved.socialToken ? 'stored' : 'request') + ")");
    const boardsResponse = await listBoards(accessToken);
    
    // Pinterest API returns { items: [...] } or direct array
    const boardsList = Array.isArray(boardsResponse) ? boardsResponse : (boardsResponse?.items || []);
    
    console.log("[PINTEREST BOARDS] Boards fetched successfully:", {
      count: boardsList?.length || 0,
      responseType: Array.isArray(boardsResponse) ? 'array' : typeof boardsResponse,
      boards: boardsList?.map((b: any) => ({ id: b.id, name: b.name })) || [],
    });
    
    res.status(200).json({ success: true, boards: boardsList });
  } catch (e: any) {
    console.error("[PINTEREST BOARDS] Error fetching boards:", {
      message: e.message,
      status: e.response?.status,
      data: e.response?.data,
      error: e.response?.data?.error || e.response?.data?.errors,
    });
    res.status(e.response?.status || 500).json({ 
      success: false, 
      message: e.response?.data?.error?.message || e.response?.data || e.message || "Failed to fetch boards",
      error: e.response?.data?.error || undefined,
    });
  }
});

// POST /pinterest/pins/create { board_id, title, link?, media_url? }
router.post("/pins/create", async (req: Request, res: Response): Promise<void> => {
  try {
    const board_id = (req.body?.board_id as string) || (req.query.board_id as string);
    const title = (req.body?.title as string) || (req.query.title as string) || "";
    const link = (req.body?.link as string) || (req.query.link as string) || undefined;
    const media_url = (req.body?.media_url as string) || (req.query.media_url as string) || undefined;

    if (!board_id || !title) { 
      console.warn("[PINTEREST PINS/CREATE] Missing required parameters:", { board_id, title });
      res.status(400).json({ success: false, message: "Missing board_id or title" }); 
      return; 
    }

    const resolved = await resolveAccessToken(req);
    const accessToken = resolved.accessToken;
    if (!accessToken) {
      console.warn("[PINTEREST PINS/CREATE] Missing access_token and no stored token for companyId");
      res.status(400).json({ success: false, message: "Provide access_token or companyId with stored token" });
      return;
    }

    console.log("[PINTEREST PINS/CREATE] Creating pin with params:", {
      board_id,
      title,
      link: link || 'not provided',
      media_url: media_url || 'not provided',
    });

  const result = await createPin(accessToken, board_id, title, link, media_url);
    
    console.log("[PINTEREST PINS/CREATE] Pin created successfully:", {
      pinId: result?.id,
      title: result?.title,
      boardId: result?.board_id,
    });

    res.status(201).json({ success: true, result });
  } catch (e: any) {
    console.error("[PINTEREST PINS/CREATE] Error creating pin:", e.message);
    res.status(500).json({ success: false, message: e.response?.data || e.message || "Failed to create pin" });
  }
});

/**
 * DELETE /pinterest/disconnect
 * Purpose: Disconnect/remove Pinterest account connection
 * Params: companyId (required, query)
 * Returns: { success, message }
 */
router.delete('/disconnect', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.query.companyId as string;

    if (!companyId) {
      res.status(400).json({ success: false, message: "companyId is required" });
      return;
    }

    console.log("[PINTEREST DISCONNECT] Disconnecting Pinterest for company:", companyId);

    // Delete the token from database
    const result = await SocialToken.destroy({
      where: {
        companyId: companyId,
        provider: 'pinterest'
      }
    });

    if (result === 0) {
      console.log("[PINTEREST DISCONNECT] No Pinterest connection found for company:", companyId);
      res.status(404).json({
        success: false,
        message: "No Pinterest connection found"
      });
      return;
    }

    console.log("[PINTEREST DISCONNECT] Pinterest disconnected successfully for company:", companyId);

    res.status(200).json({
      success: true,
      message: "Pinterest account disconnected successfully"
    });
    return;
  } catch (error: any) {
    console.error("[PINTEREST DISCONNECT] Error disconnecting:", {
      message: error.message
    });
    res.status(500).json({
      success: false,
      message: error.message || "Failed to disconnect Pinterest account"
    });
    return;
  }
});

/**
 *  GET /pinterest/insights/:companyId
 * Purpose: Get Pinterest profile insights and account information
 * Params:
 *   - companyId (required, params): Company ID to fetch Pinterest profile for
 * Returns: { success, data: { id, username, website, profile_image, ... } }
 */
router.get('/insights/:companyId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;

    if (!companyId) {
      console.warn("[PINTEREST INSIGHTS] Missing companyId");
      res.status(400).json({ success: false, error: "Missing companyId" });
      return;
    }

    console.log("[PINTEREST INSIGHTS] Fetching Pinterest profile insights for company:", companyId);

    // Resolve access token: accept header token or stored token for companyId
    const resolved = await resolveAccessToken(req);
    const accessToken = resolved.accessToken;

    if (!accessToken) {
      console.warn("[PINTEREST INSIGHTS] No access token available for company:", companyId);
      res.status(404).json({ 
        success: false, 
        error: "Pinterest account not connected for this company or no access token provided" 
      });
      return;
    }

    console.log('[PINTEREST INSIGHTS] Using access token (source: ' + (resolved.socialToken ? 'stored' : 'request') + ') to fetch profile');

    // Get user profile information from Pinterest API
    const profileResponse = await axios.get('https://api-sandbox.pinterest.com/v5/user_account', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log("[PINTEREST INSIGHTS] Profile fetched successfully:", {
      userId: profileResponse.data?.id,
      username: profileResponse.data?.username,
      hasProfileImage: !!profileResponse.data?.profile_image
    });

    res.status(200).json({
      success: true,
      data: profileResponse.data
    });
    return;
  } catch (error: any) {
    console.error("[PINTEREST INSIGHTS] Error fetching profile insights:", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      companyId: req.params.companyId
    });
    res.status(error.response?.status || 500).json({ 
      success: false,
      error: error.response?.data?.error?.message || error.message || "Failed to fetch profile insights"
    });
    return;
  }
});

/**
 * GET /pinterest/accounts?companyId=...
 * List connected Pinterest accounts for a company
 */
router.get('/accounts', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.query.companyId as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'companyId is required' });
      return;
    }

    const accounts = await SocialToken.findAll({ where: { companyId: companyId, provider: 'pinterest' } });
    const mapped = accounts.map((a: any) => ({
      id: a.id,
      accountId: a.accountId,
      accountEmail: a.accountEmail,
      displayName: a.displayName,
      pictureUrl: (a as any).pictureUrl || null,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      isActive: true
    }));

    res.status(200).json({ success: true, data: mapped });
    return;
  } catch (err: any) {
    console.error('[PINTEREST ACCOUNTS] Error listing accounts:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to list accounts' });
    return;
  }
});

/**
 * DELETE /pinterest/accounts/:id?companyId=...
 * Remove/deactivate a connected Pinterest account row
 */
router.delete('/accounts/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const companyId = req.query.companyId as string;
    if (!id || !companyId) {
      res.status(400).json({ success: false, message: 'id and companyId are required' });
      return;
    }

    const found = await SocialToken.findOne({ where: { id: id, companyId: companyId, provider: 'pinterest' } });
    if (!found) {
      res.status(404).json({ success: false, message: 'Account not found' });
      return;
    }

    // Soft delete: remove row
    await SocialToken.destroy({ where: { id: id } });

    res.status(200).json({ success: true, message: 'Account removed' });
    return;
  } catch (err: any) {
    console.error('[PINTEREST ACCOUNTS] Error deleting account:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to delete account' });
    return;
  }
});

// Backwards-compatible endpoints used by frontend
router.get('/profiles/list', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.query.companyId as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'companyId is required' });
      return;
    }

    const accounts = await SocialToken.findAll({ where: { companyId: companyId, provider: 'pinterest' } });
    const mapped = accounts.map((a: any) => ({
      id: a.id,
      accountId: a.accountId,
      accountEmail: a.accountEmail,
      displayName: a.displayName,
      pictureUrl: (a as any).pictureUrl || null,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      isActive: true
    }));

    res.status(200).json({ success: true, data: mapped });
    return;
  } catch (err: any) {
    console.error('[PINTEREST PROFILES] Error listing profiles:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to list profiles' });
    return;
  }
});

router.delete('/profiles/delete/:id', async (req: Request, res: Response): Promise<void> => {
  // Reuse /accounts/:id deletion
  const id = req.params.id;
  // Construct a fake req to reuse handler: call the accounts delete logic directly
  try {
    const companyId = req.query.companyId as string;
    if (!id || !companyId) {
      res.status(400).json({ success: false, message: 'id and companyId are required' });
      return;
    }
    const found = await SocialToken.findOne({ where: { id: id, companyId: companyId, provider: 'pinterest' } });
    if (!found) {
      res.status(404).json({ success: false, message: 'Account not found' });
      return;
    }
    await SocialToken.destroy({ where: { id: id } });
    res.status(200).json({ success: true, message: 'Account removed' });
    return;
  } catch (err:any) {
    console.error('[PINTEREST PROFILES] Error deleting profile:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to delete profile' });
    return;
  }
});

/**
 *  GET /pinterest/clients/available
 * Purpose: Fetch all available clients for the company (for modal client list display)
 * Params: companyId (required, query)
 * Returns: { success, clients: [ { id, name, email, phone, isActive, isApprove } ], count, message }
 */
router.get("/clients/available", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.query.companyId as string;

    if (!companyId) {
      console.log("[PINTEREST CLIENTS AVAILABLE] Missing companyId parameter");
      res.status(400).json({
        success: false,
        error: "companyId is required",
        code: "MISSING_COMPANY_ID"
      });
      return;
    }

    console.log("[PINTEREST CLIENTS AVAILABLE] Fetching clients for company:", {
      companyId,
      type: typeof companyId
    });

    // Fetch all clients for the company
    const clients = await Clients.findAll({
      where: {
        companyId: companyId
      },
      attributes: [
        "id",
        "clientfirstName",
        "clientLastName",
        "businessEmail",
        "userId",
        "companyId",
        "businessContact",
        "isActive",
        "isApprove",
        "profileStatus",
        "createdAt",
        "updatedAt"
      ],
      raw: true,
      logging: false // Disable query logging for production
    } as any);

    console.log("[PINTEREST CLIENTS AVAILABLE] Query completed successfully:", {
      companyId,
      totalClients: clients?.length || 0
    });

    if (!clients || clients.length === 0) {
      console.warn("[PINTEREST CLIENTS AVAILABLE] No clients found for company:", companyId);
      res.status(200).json({
        success: true,
        clients: [],
        count: 0,
        message: `No clients found for company ${companyId}`
      });
      return;
    }

    console.log("[PINTEREST CLIENTS AVAILABLE] Clients retrieved:", {
      companyId,
      totalClients: clients.length,
      clients: clients.map((c: any) => ({
        id: c.id,
        name: `${c.clientfirstName} ${c.clientLastName}`,
        email: c.businessEmail,
        isActive: c.isActive
      }))
    });

    // Transform clients to include full name and format for modal display
    const transformedClients = clients.map((c: any) => ({
      id: c.id,
      name: `${c.clientfirstName || ""} ${c.clientLastName || ""}`.trim(),
      email: c.businessEmail || "",
      phone: c.businessContact || "",
      avatar: null, // Can be extended to fetch from gravatar or profile service
      isActive: c.isActive || true,
      isApprove: c.isApprove || false,
      profileStatus: c.profileStatus || false,
      userId: c.userId,
      companyId: c.companyId
    }));

    res.status(200).json({
      success: true,
      clients: transformedClients,
      count: transformedClients.length,
      message: `Found ${transformedClients.length} clients for company ${companyId}`
    });
    return;
  } catch (error: any) {
    console.error("[PINTEREST CLIENTS AVAILABLE] Error fetching clients:", {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      message: "Failed to fetch available clients",
      error: error.message || "Unknown error",
      code: error.code || "INTERNAL_ERROR",
      debug: process.env.NODE_ENV === "development" ? {
        originalError: error.message,
        stack: error.stack
      } : undefined
    });
    return;
  }
});

/**
 *  GET /pinterest/assignments
 * Purpose: Fetch all board assignments for a company (to display who manages each board)
 * Params: companyId (required, query)
 * Returns: { success, assignments: [ { boardId, boardName, clientId, clientName, clientEmail, connectedAt } ], count }
 */
router.get("/assignments", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.query.companyId as string;

    if (!companyId) {
      console.log("[PINTEREST ASSIGNMENTS] Missing companyId parameter");
      res.status(400).json({
        success: false,
        error: "companyId is required",
        code: "MISSING_COMPANY_ID"
      });
      return;
    }

    console.log("[PINTEREST ASSIGNMENTS] Fetching assignments:", {
      companyId
    });

    // Fetch all assignments for the company
    const assignments = await PinterestAssignment.findAll({
      where: {
        companyId: companyId
      },
      order: [["connectedAt", "DESC"]]
    });

    console.log("[PINTEREST ASSIGNMENTS] Assignments retrieved:", {
      count: assignments.length,
      assignments: assignments.map((a: any) => ({
        boardId: a.boardId,
        boardName: a.pinterestBoardName,
        clientName: a.clientName
      }))
    });

    res.status(200).json({
      success: true,
      assignments: assignments.map((a: any) => ({
        id: a.id,
        boardId: a.boardId,
        boardName: a.pinterestBoardName,
        boardPrivacy: a.boardPrivacy,
        clientId: a.clientId,
        clientName: a.clientName,
        clientEmail: a.clientEmail,
        connectedAt: a.connectedAt,
        updatedAt: a.updatedAt
      })),
      count: assignments.length,
      message: `Found ${assignments.length} assignment(s) for company ${companyId}`
    });
    return;
  } catch (error: any) {
    console.error("[PINTEREST ASSIGNMENTS] Error fetching assignments:", {
      message: error.message
    });
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch board assignments"
    });
    return;
  }
});

/**
 *  POST /pinterest/:profileId/assign-client
 * Purpose: Assign Pinterest profile to a specific client
 * Params:
 *   - profileId (required, params): Pinterest user ID (profile/account ID)
 * Body:
 *   - companyId (required): Company ID
 *   - clientId (required): Client ID to assign profile to
 * Returns: { success, message, assignment }
 * Usage: Called from modal when user clicks "Assign" button in Assign Clients column
 */
router.post("/:profileId/assign-client", async (req: Request, res: Response): Promise<void> => {
  try {
    const { profileId } = req.params;
    const { companyId, clientId } = req.body;

    // Validation - profileId
    if (!profileId) {
      console.log("[PINTEREST ASSIGN] Missing profileId parameter");
      res.status(400).json({
        success: false,
        error: "profileId is required",
        code: "MISSING_PROFILE_ID"
      });
      return;
    }

    // Validation - companyId
    if (!companyId) {
      console.log("[PINTEREST ASSIGN] Missing companyId parameter");
      res.status(400).json({
        success: false,
        error: "companyId is required",
        code: "MISSING_COMPANY_ID"
      });
      return;
    }

    // Validation - clientId
    if (!clientId) {
      console.log("[PINTEREST ASSIGN] Missing clientId parameter");
      res.status(400).json({
        success: false,
        error: "clientId is required",
        code: "MISSING_CLIENT_ID"
      });
      return;
    }

    console.log("[PINTEREST ASSIGN] Starting profile assignment:", {
      profileId,
      companyId,
      clientId
    });

    // Fetch client details to verify they exist and get their info
    const client = await Clients.findOne({
      where: { id: clientId, companyId: companyId },
      raw: true,
    });

    if (!client) {
      console.log("[PINTEREST ASSIGN] Client not found:", { clientId, companyId });
      res.status(404).json({
        success: false,
        error: `Client ${clientId} not found for company ${companyId}`,
        code: "CLIENT_NOT_FOUND"
      });
      return;
    }

    console.log("[PINTEREST ASSIGN] Client verified:", {
      id: client.id,
      name: `${client.clientfirstName} ${client.clientLastName}`,
      email: client.businessEmail
    });

    // Resolve Pinterest user/profile details. Accept either provider accountId or DB id.
    let resolvedProfile: any = null;
    try {
  resolvedProfile = await resolveProfileIdentifier(String(companyId), String(profileId));
    } catch (resolveErr: any) {
      console.error('[PINTEREST ASSIGN] Error while resolving profile identifier:', { profileId, companyId, message: resolveErr?.message, stack: resolveErr?.stack });
      res.status(500).json({ success: false, error: 'Failed to resolve profile identifier. Check server logs.', code: 'RESOLVE_ERROR' });
      return;
    }

    if (!resolvedProfile) {
      console.log("[PINTEREST ASSIGN] Pinterest account not found for identifier:", { profileId, companyId });
      res.status(404).json({
        success: false,
        error: "Pinterest account not connected",
        code: "PINTEREST_NOT_CONNECTED"
      });
      return;
    }

    const socialToken: any = resolvedProfile.socialToken || {};
    // canonical provider account id
    const canonicalAccountId = String(resolvedProfile.accountId || socialToken.accountId || profileId);

    console.log("[PINTEREST ASSIGN] Pinterest account resolved:", {
      providedIdentifier: profileId,
      accountId: canonicalAccountId,
      accountEmail: socialToken.accountEmail,
      displayName: socialToken.displayName
    });

    // Fetch profile info from Pinterest API
    let profileName = socialToken.displayName || socialToken.accountEmail || profileId;
    let profileImage = null;

    try {
      const profileResponse = await axios.get(
        'https://api-sandbox.pinterest.com/v5/user_account',
        {
          headers: {
            'Authorization': `Bearer ${socialToken.accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 5000 // Add timeout
        }
      );

      profileName = socialToken.displayName || profileResponse.data?.username || profileId;
      profileImage = profileResponse.data?.profile_image || null;

      console.log("[PINTEREST ASSIGN] Profile details fetched:", {
        profileId,
        profileName,
        hasProfileImage: !!profileImage
      });
    } catch (profileFetchError: any) {
      console.warn("[PINTEREST ASSIGN] Could not fetch profile details from API (this is OK):", {
        profileId,
        status: profileFetchError.response?.status,
        message: profileFetchError.message
      });
      // Continue with stored profile info - this is not a blocking error
      // The token may have limited permissions, but we can still assign the profile
    }

  // Construct full client name and email
    const clientFullName = `${client.clientfirstName || ""} ${client.clientLastName || ""}`.trim();
    const clientEmail = client.businessEmail || "unknown@email.com";

    console.log("[PINTEREST ASSIGN] Client info constructed:", {
      clientFullName,
      clientEmail
    });

    // Create or update assignment record in PinterestAssignment
  // For profile assignment, we use a special boardId format: "PROFILE:{accountId}"
  // Use the canonical provider accountId when building the boardId
  const profileAssignmentBoardId = `PROFILE:${canonicalAccountId}`;

    let existingAssignment: any = null;
    try {
      existingAssignment = await PinterestAssignment.findOne({
        where: {
          companyId: companyId,
          boardId: profileAssignmentBoardId
        },
        raw: true
      });
    } catch (findError: any) {
      // Check if error is due to table not existing
      if (findError.message && findError.message.includes("doesn't exist")) {
        console.error("[PINTEREST ASSIGN] ❌ CRITICAL: pinterest_assignments table does not exist!");
        console.error("[PINTEREST ASSIGN] The model has been added to init-control-db, but the database table hasn't been synced yet.");
        console.error("[PINTEREST ASSIGN] Solution: Please restart the backend server to trigger database synchronization.");
        throw new Error("Pinterest assignments table not found. Please restart the backend server to synchronize the database.");
      }
      console.warn("[PINTEREST ASSIGN] Could not find existing assignment (model might not be synced):", {
        message: findError.message
      });
      // Continue without existing assignment
    }

    let created = false;
    let assignment: any;

    if (existingAssignment) {
      // Update existing assignment with new client
      try {
        await PinterestAssignment.update(
          {
            clientId: clientId,
            clientName: clientFullName,
            clientEmail: clientEmail,
            pinterestBoardName: profileName as string,
            pinterestBoardDescription: null,
            boardPrivacy: "PROFILE",
            collaboratorCount: null,
            isSaved: true,
            connectedAt: new Date(),
            assignedAt: new Date(),
            updatedAt: new Date(),
          },
          {
            where: {
              companyId: companyId,
              boardId: `PROFILE:${canonicalAccountId}`
            }
          }
        );
        created = false;

        console.log("[PINTEREST ASSIGN] ✏️ Profile assignment UPDATED to client ${clientId}:", {
          oldClient: existingAssignment.clientId,
          newClient: clientId,
          clientName: clientFullName
        });
      } catch (updateError: any) {
        console.error("[PINTEREST ASSIGN] Error updating assignment:", updateError.message, updateError.stack);
        // Return a clear error response instead of throwing so frontend receives actionable info
        res.status(500).json({
          success: false,
          error: 'Failed to update existing assignment',
          detail: updateError.message,
          code: 'ASSIGNMENT_UPDATE_FAILED'
        });
        return;
      }

      assignment = {
        id: existingAssignment.id,
        profileId: canonicalAccountId,
        profileName,
        profileImage,
        clientId,
        clientName: clientFullName,
        clientEmail: clientEmail,
        isNew: false,
        connectedAt: new Date().toISOString()
      };
    } else {
      // Create new assignment
      try {
        const newAssignment = await PinterestAssignment.create({
          companyId: companyId,
          pinterestUserId: canonicalAccountId,
          boardId: profileAssignmentBoardId,
          clientId: clientId,
          pinterestBoardName: profileName,
          pinterestBoardDescription: null,
          boardPrivacy: "PROFILE",
          collaboratorCount: null,
          clientName: clientFullName || clientId,
          clientEmail: clientEmail,
          isSaved: true,
          connectedAt: new Date(),
          assignedAt: new Date(),
        } as any);
        created = true;

        console.log("[PINTEREST ASSIGN] ✅ Profile assignment CREATED for client ${clientId}:", {
          clientName: clientFullName
        });

        assignment = {
          id: (newAssignment as any).id,
          profileId: canonicalAccountId,
          profileName,
          profileImage,
          clientId,
          clientName: clientFullName,
          clientEmail: clientEmail,
          isNew: true,
          connectedAt: new Date().toISOString()
        };
      } catch (createError: any) {
        // Check if error is due to table not existing
        if (createError.message && createError.message.includes("doesn't exist")) {
          console.error("[PINTEREST ASSIGN] ❌ CRITICAL: pinterest_assignments table does not exist!", createError.stack);
          console.error("[PINTEREST ASSIGN] The model has been added to init-control-db, but the database table hasn't been synced yet.");
          console.error("[PINTEREST ASSIGN] Solution: Please restart the backend server to trigger database synchronization.");
          res.status(500).json({
            success: false,
            error: 'Pinterest assignments table not found. Please restart the backend server to synchronize the database.',
            code: 'DB_TABLE_MISSING'
          });
          return;
        }
        console.error("[PINTEREST ASSIGN] Error creating assignment:", createError.message, createError.stack);
        res.status(500).json({
          success: false,
          error: 'Failed to create assignment',
          detail: createError.message,
          code: 'ASSIGNMENT_CREATE_FAILED'
        });
        return;
      }
    }

    console.log("[PINTEREST ASSIGN] Profile assignment complete:", {
      profileId,
      clientId,
      clientName: clientFullName,
      isNew: created
    });

    res.status(created ? 201 : 200).json({
      success: true,
      message: created 
        ? `Profile "${profileName}" assigned to client ${clientFullName}`
        : `Profile "${profileName}" reassigned to client ${clientFullName}`,
      assignment
    });
    return;
  } catch (error: any) {
    console.error("[PINTEREST ASSIGN] Error assigning profile:", {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      error: error.message || "Failed to assign profile",
      code: "ASSIGNMENT_ERROR"
    });
    return;
  }
});

/**
 *  DELETE /pinterest/:assignmentId/remove-client
 * Purpose: Remove assignment of Pinterest profile from client
 * Params:
 *   - assignmentId (required, params): Assignment record ID to remove
 * Returns: { success, message, removedAssignment }
 * Usage: Called when user clicks "Disconnect" or removes assignment from data grid
 */
router.delete("/:assignmentId/remove-client", async (req: Request, res: Response): Promise<void> => {
  try {
    const { assignmentId } = req.params;

    // Validation - assignmentId
    if (!assignmentId) {
      console.log("[PINTEREST REMOVE] Missing assignmentId parameter");
      res.status(400).json({
        success: false,
        error: "assignmentId is required",
        code: "MISSING_ASSIGNMENT_ID"
      });
      return;
    }

    console.log("[PINTEREST REMOVE] Removing assignment:", { assignmentId });

    // Find the assignment to get details before deleting
    const assignment = await PinterestAssignment.findOne({
      where: { id: assignmentId },
      raw: true
    });

    if (!assignment) {
      console.log("[PINTEREST REMOVE] Assignment not found:", { assignmentId });
      res.status(404).json({
        success: false,
        error: `Assignment ${assignmentId} not found`,
        code: "ASSIGNMENT_NOT_FOUND"
      });
      return;
    }

    console.log("[PINTEREST REMOVE] Assignment found:", {
      profileId: assignment.pinterestUserId,
      clientId: assignment.clientId,
      profileName: assignment.pinterestBoardName
    });

    // Delete the assignment
    const deletedCount = await PinterestAssignment.destroy({
      where: { id: assignmentId }
    });

    if (deletedCount === 0) {
      console.log("[PINTEREST REMOVE] Failed to delete assignment:", { assignmentId });
      res.status(500).json({
        success: false,
        error: "Failed to delete assignment",
        code: "DELETION_FAILED"
      });
      return;
    }

    console.log("[PINTEREST REMOVE] ✅ Assignment removed successfully:", {
      assignmentId,
      profileId: assignment.pinterestUserId,
      clientName: assignment.clientName
    });

    res.status(200).json({
      success: true,
      message: `Profile "${assignment.pinterestBoardName}" is no longer assigned to ${assignment.clientName}`,
      removedAssignment: {
        id: assignmentId,
        profileId: assignment.pinterestUserId,
        profileName: assignment.pinterestBoardName,
        clientId: assignment.clientId,
        clientName: assignment.clientName,
        removedAt: new Date().toISOString()
      }
    });
    return;
  } catch (error: any) {
    console.error("[PINTEREST REMOVE] Error removing assignment:", {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      error: error.message || "Failed to remove assignment",
      code: "REMOVAL_ERROR"
    });
    return;
  }
});

/**
 * GET /profiles/get-assignment
 * GET /api/profiles/get-assignment
 * 
 * Fetch current assignment for a specific profile
 * Used when clicking Edit to pre-fill modal with current client
 * 
 * Query Params:
 *   - companyId: string (required)
 *   - profileId: string (required)
 * 
 * Example:
 *   GET http://localhost:9005/pinterest/profiles/get-assignment?companyId=xxx&profileId=yyy
 */

router.get("/profiles/get-assignment", async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId, profileId } = req.query;

    // Validation
    if (!companyId || typeof companyId !== 'string') {
      res.status(400).json({
        success: false,
        error: "companyId is required and must be a string",
        code: "INVALID_COMPANY_ID"
      });
      return;
    }

    if (!profileId || typeof profileId !== 'string') {
      res.status(400).json({
        success: false,
        error: "profileId is required and must be a string",
        code: "INVALID_PROFILE_ID"
      });
      return;
    }

    console.log("[PINTEREST GET ASSIGNMENT] Fetching assignment:", { companyId, profileId });

    // Resolve incoming profile identifier (may be DB id or provider accountId)
    const resolved = await resolveProfileIdentifier(String(companyId), String(profileId));
    if (!resolved) {
      console.log('[PINTEREST GET ASSIGNMENT] Could not resolve profile identifier:', { companyId, profileId });
      res.status(404).json({ success: false, error: 'Profile not found', code: 'PROFILE_NOT_FOUND' });
      return;
    }

    const canonicalAccountId = resolved.accountId;
    // Search in PinterestAssignment table using special boardId format: "PROFILE:{accountId}"
    const profileAssignmentBoardId = `PROFILE:${canonicalAccountId}`;
    
    let assignment = await PinterestAssignment.findOne({
      where: {
        companyId: companyId,
        boardId: profileAssignmentBoardId
      },
      raw: true
    });

    // Fallbacks: try legacy boardId (PROFILE:{providedId}) or pinterestUserId directly
    if (!assignment) {
      const altBoardId = `PROFILE:${profileId}`;
      assignment = await PinterestAssignment.findOne({ where: { companyId: companyId, boardId: altBoardId }, raw: true });
    }
    if (!assignment) {
      assignment = await PinterestAssignment.findOne({ where: { companyId: companyId, pinterestUserId: profileId }, raw: true });
    }

    if (!assignment) {
      console.log("[PINTEREST GET ASSIGNMENT] No assignment found for profile:", profileId);
      res.status(404).json({
        success: false,
        error: "Profile not assigned to any client",
        code: "NOT_FOUND"
      });
      return;
    }

    console.log("[PINTEREST GET ASSIGNMENT] Assignment found:", {
      clientId: assignment.clientId,
      clientName: assignment.clientName,
      profileId: profileId
    });

    res.status(200).json({
      success: true,
      profileId: assignment.pinterestUserId,
      profileName: assignment.pinterestBoardName,
      profileCategory: assignment.boardPrivacy,
      currentClientId: assignment.clientId,
      currentClientName: assignment.clientName,
      currentClientEmail: assignment.clientEmail,
      assignedAt: assignment.connectedAt,
      connectedAt: assignment.connectedAt
    });
    return;
  } catch (error: any) {
    console.error("[PINTEREST GET ASSIGNMENT] Error:", error.message);
    res.status(500).json({
      success: false,
      message: error.message,
      code: "INTERNAL_SERVER_ERROR"
    });
    return;
  }
});

/**
 * PUT /profiles/update-client-assignment
 * PUT /api/profiles/update-client-assignment
 * 
 * Update the client assignment for a profile WITHOUT reassigning the profile
 * Used when editing - simply changes which client the profile is assigned to
 * 
 * Body:
 *   - companyId: string (required)
 *   - profileId: string (required)
 *   - newClientId: string (required) - the NEW client to assign to
 *   - oldClientId?: string (optional) - for validation
 * 
 * Example:
 *   PUT http://localhost:9005/pinterest/profiles/update-client-assignment
 *   {
 *     "companyId": "company-uuid",
 *     "profileId": "894738788377699066",
 *     "newClientId": "new-client-uuid",
 *     "oldClientId": "old-client-uuid"
 *   }
 */

router.put("/profiles/update-client-assignment", async (req: Request, res: Response): Promise<void> => {
  try {
    let { companyId, profileId, newClientId, oldClientId } = req.body;

    // Validation
    if (!companyId) {
      res.status(400).json({
        success: false,
        error: "companyId is required",
        code: "MISSING_COMPANY_ID"
      });
      return;
    }

    if (!profileId) {
      res.status(400).json({
        success: false,
        error: "profileId is required",
        code: "MISSING_PROFILE_ID"
      });
      return;
    }

    if (!newClientId) {
      res.status(400).json({
        success: false,
        error: "newClientId is required",
        code: "MISSING_NEW_CLIENT_ID"
      });
      return;
    }

    console.log("[PINTEREST UPDATE ASSIGNMENT] Starting update:", {
      companyId,
      profileId,
      oldClientId,
      newClientId,
      newClientIdType: typeof newClientId,
      oldClientIdType: typeof oldClientId
    });

    // Try to locate an existing assignment row first using the provided profileId (legacy rows may exist
    // without a corresponding SocialToken). This lets us update assignments even when a SocialToken
    // record for the profile isn't present.
    let currentAssignment = await PinterestAssignment.findOne({ where: { companyId: companyId, boardId: `PROFILE:${profileId}` }, raw: true });

    if (!currentAssignment) {
      // Try matching pinterestUserId column directly (some legacy rows stored the profile id there)
      currentAssignment = await PinterestAssignment.findOne({ where: { companyId: companyId, pinterestUserId: profileId }, raw: true });
    }

    let canonicalAccountId: string | null = null;

    if (currentAssignment) {
      // If we found an existing assignment row, prefer the pinterestUserId stored there as canonical id
      canonicalAccountId = currentAssignment.pinterestUserId || String(profileId);
      console.log('[PINTEREST UPDATE ASSIGNMENT] Found existing assignment for provided profileId, will update that row', { profileId, canonicalAccountId });
    } else {
      // Resolve incoming profile identifier (accountId or DB id) to canonical provider accountId
      const resolved = await resolveProfileIdentifier(String(companyId), String(profileId));
      if (!resolved) {
        console.log('[PINTEREST UPDATE ASSIGNMENT] Could not resolve profile identifier:', { companyId, profileId });
        res.status(404).json({ success: false, error: 'Profile not found', code: 'PROFILE_NOT_FOUND' });
        return;
      }

      canonicalAccountId = resolved.accountId;

      // Find current assignment using special boardId format: "PROFILE:{accountId}"
      const profileAssignmentBoardId = `PROFILE:${canonicalAccountId}`;
      currentAssignment = await PinterestAssignment.findOne({ where: { companyId: companyId, boardId: profileAssignmentBoardId }, raw: true });

      // Fallbacks for legacy rows: if not found using canonical accountId, try using provided profileId as boardId
      if (!currentAssignment) {
        const altBoardId = `PROFILE:${profileId}`;
        currentAssignment = await PinterestAssignment.findOne({ where: { companyId: companyId, boardId: altBoardId }, raw: true });
      }

      // Another fallback: match pinterestUserId column directly (legacy stored different id)
      if (!currentAssignment) {
        currentAssignment = await PinterestAssignment.findOne({ where: { companyId: companyId, pinterestUserId: profileId }, raw: true });
      }
    }

    if (!currentAssignment) {
      console.log("[PINTEREST UPDATE ASSIGNMENT] Assignment not found:", { companyId, profileId });
      res.status(404).json({
        success: false,
        error: "Profile assignment not found",
        code: "ASSIGNMENT_NOT_FOUND"
      });
      return;
    }

    console.log("[PINTEREST UPDATE ASSIGNMENT] Current assignment found:", {
      clientId: currentAssignment.clientId,
      clientIdType: typeof currentAssignment.clientId,
      clientName: currentAssignment.clientName
    });

    // Optional: Verify oldClientId matches (for extra validation)
    if (oldClientId && currentAssignment.clientId !== String(oldClientId) && currentAssignment.clientId !== oldClientId) {
      console.log("[PINTEREST UPDATE ASSIGNMENT] Old client ID mismatch:", {
        expected: oldClientId,
        actual: currentAssignment.clientId
      });
      res.status(409).json({
        success: false,
        error: "Current assignment doesn't match oldClientId. It may have been changed by another user.",
        code: "CONFLICT"
      });
      return;
    }

    // Fetch new client to get their details - handle both string and number IDs
    console.log("[PINTEREST UPDATE ASSIGNMENT] Fetching client:", {
      id: newClientId,
      companyId: companyId,
      idType: typeof newClientId
    });

    const newClient = await Clients.findOne({
      where: { 
        id: newClientId,
        companyId: companyId 
      },
      raw: true
    });

    if (!newClient) {
      console.log("[PINTEREST UPDATE ASSIGNMENT] New client not found:", { 
        newClientId, 
        companyId,
        attemptedType: typeof newClientId
      });
      
      // Try with string conversion if number failed
      if (typeof newClientId === 'number') {
        const newClientRetry = await Clients.findOne({
          where: { 
            id: String(newClientId),
            companyId: companyId 
          },
          raw: true
        });
        
        if (!newClientRetry) {
          res.status(404).json({
            success: false,
            error: `Client ${newClientId} not found in company ${companyId}`,
            code: "NEW_CLIENT_NOT_FOUND"
          });
          return;
        }
        
        // Use retry result
        const newClientName = `${newClientRetry.clientfirstName || ""} ${newClientRetry.clientLastName || ""}`.trim();
        const newClientEmail = newClientRetry.businessEmail || "unknown@email.com";

        console.log("[PINTEREST UPDATE ASSIGNMENT] New client verified (after retry):", {
          newClientId,
          newClientName,
          newClientEmail
        });

        // Update the assignment
        await PinterestAssignment.update(
          {
            clientId: String(newClientId),
            clientName: newClientName,
            clientEmail: newClientEmail,
            updatedAt: new Date()
          },
          {
            where: {
              companyId: companyId,
              boardId: `PROFILE:${canonicalAccountId}`
            }
          }
        );

        console.log("[PINTEREST UPDATE ASSIGNMENT] Assignment updated successfully:", {
          profileId,
          oldClientId: currentAssignment.clientId,
          newClientId: newClientId,
          oldClientName: currentAssignment.clientName,
          newClientName: newClientName
        });

        res.status(200).json({
          success: true,
          profileId: canonicalAccountId,
          profileName: currentAssignment.pinterestBoardName,
          oldClientId: currentAssignment.clientId,
          oldClientName: currentAssignment.clientName,
          newClientId: String(newClientId),
          newClientName: newClientName,
          message: "Assignment updated successfully",
          updatedAt: new Date().toISOString()
        });
        return;
      }
      
      res.status(404).json({
        success: false,
        error: `Client ${newClientId} not found`,
        code: "NEW_CLIENT_NOT_FOUND"
      });
      return;
    }

    const newClientName = `${newClient.clientfirstName || ""} ${newClient.clientLastName || ""}`.trim();
    const newClientEmail = newClient.businessEmail || "unknown@email.com";

    console.log("[PINTEREST UPDATE ASSIGNMENT] New client verified:", {
      newClientId,
      newClientName,
      newClientEmail
    });

    // Update the assignment - ensure consistent type for clientId
    await PinterestAssignment.update(
      {
        clientId: String(newClientId),
        clientName: newClientName,
        clientEmail: newClientEmail,
        updatedAt: new Date()
      },
      {
        where: {
          companyId: companyId,
          boardId: `PROFILE:${canonicalAccountId}`
        }
      }
    );

    console.log("[PINTEREST UPDATE ASSIGNMENT] Assignment updated successfully:", {
      profileId,
      oldClientId: currentAssignment.clientId,
      newClientId: newClientId,
      oldClientName: currentAssignment.clientName,
      newClientName: newClientName
    });

    res.status(200).json({
      success: true,
      profileId: canonicalAccountId,
      profileName: currentAssignment.pinterestBoardName,
      oldClientId: currentAssignment.clientId,
      oldClientName: currentAssignment.clientName,
      newClientId: String(newClientId),
      newClientName: newClientName,
      message: "Assignment updated successfully",
      updatedAt: new Date().toISOString()
    });
    return;
  } catch (error: any) {
    console.error("[PINTEREST UPDATE ASSIGNMENT] Error:", error.message);
    res.status(500).json({
      success: false,
      message: error.message,
      code: "INTERNAL_SERVER_ERROR"
    });
    return;
  }
});

/**
 * DELETE /pinterest/profiles/:profileId
 * Purpose: Delete an added Pinterest profile (SocialToken record)
 * Used when user deletes a profile they added via stepper
 * Removes from database and all related assignments
 */
router.delete('/profiles/:profileId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { profileId } = req.params;
    const companyId = (req.query.companyId as string) || (req.body?.companyId as string);

    if (!profileId || !companyId) {
      res.status(400).json({ 
        success: false, 
        message: 'profileId and companyId are required' 
      });
      return;
    }

    console.log('[PINTEREST DELETE PROFILE] Deleting profile:', { profileId, companyId });

    // Find the social token record
    const socialToken = await SocialToken.findOne({
      where: { 
        id: profileId,
        companyId: companyId,
        provider: 'pinterest'
      }
    });

    if (!socialToken) {
      console.log('[PINTEREST DELETE PROFILE] Profile not found:', { profileId, companyId });
      res.status(404).json({ 
        success: false, 
        message: 'Profile not found' 
      });
      return;
    }

    const accountId = (socialToken as any).accountId;
    console.log('[PINTEREST DELETE PROFILE] Found profile with accountId:', accountId);

    // Delete related assignments for this profile
    const deletedAssignments = await PinterestAssignment.destroy({
      where: {
        companyId: companyId,
        boardId: `PROFILE:${accountId}` // Profile-based boardId format
      }
    });

    console.log('[PINTEREST DELETE PROFILE] Deleted assignments:', deletedAssignments);

    // Delete the social token record
    await SocialToken.destroy({
      where: {
        id: profileId,
        companyId: companyId,
        provider: 'pinterest'
      }
    });

    console.log('[✅ PINTEREST DELETE PROFILE] Profile deleted successfully:', { profileId, companyId, accountId });

    res.status(200).json({
      success: true,
      message: 'Profile deleted successfully',
      profileId: profileId,
      accountId: accountId,
      assignmentsDeleted: deletedAssignments
    });
    return;

  } catch (err: any) {
    console.error('[❌ PINTEREST DELETE PROFILE] Error deleting profile:', {
      error: err.message,
      details: err
    });
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to delete profile'
    });
    return;
  }
});

module.exports = router;
