import express, { Request, Response } from "express";
import { Op } from "sequelize";
import {
  generateFacebookAuthUrl,
  exchangeFacebookCodeForTokens,
  exchangeShortLivedForLongLived,
  getFacebookUser,
  getFacebookPages,
  postToFacebookPage,
  getFacebookDebugToken,
  getFacebookBusinesses,
  getFacebookClient,
  getFacebookPagesAndBusinesses
} from "../../../../../services/facebook-service";
import {
  saveOrUpdateToken,
} from "../../../../../services/token-store.service";
import { SocialToken } from "../social-token.model";
import { Clients } from "../../clients/clients-model";
import { FacebookAssignment } from "../facebook-assignment.model";
import { notifySocialConnectionAdded } from "../../../../../services/socket-service";
import axios from "axios";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { MetaSocialAccount } from "../meta-social-account.model";
import { saveFacebookAccountsToDb } from "./facebook-handler";

// Server-side temporary store for OAuth state (alternative to session)
const oauthStateStore = new Map<string, {
  companyId: string
  timestamp: number
  successRedirectUri?: string | null
  errorRedirectUri?: string | null
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

// Helper: extract tokens from headers/query
function extractTokens(req: Request) {
  const access_token = ((req.headers["x-access-token"] as string) || (req.query.access_token as string) || (req.body?.access_token as string) || "").trim();
  const refresh_token = ((req.headers["x-refresh-token"] as string) || (req.query.refresh_token as string) || (req.body?.refresh_token as string) || "").trim();
  const tokens: any = {};
  if (access_token) tokens.access_token = access_token;
  if (refresh_token) tokens.refresh_token = refresh_token;
  return tokens;
}

/**
 *  API DOCUMENTATION - FACEBOOK INTEGRATION ENDPOINTS
 * ======================================================
 * All endpoints require tokens (access_token or refresh_token) via headers, query params, or body
 * Token sources: x-access-token, x-refresh-token headers OR access_token, refresh_token query params/body
 */

/**
 *  AUTHENTICATION ENDPOINTS
 */

/**
 *  GET /facebook/auth/url
 * Purpose: Generate OAuth authorization URL for Facebook authentication
 * Params: 
 *   - companyId (required, query): Company ID to associate with the Facebook account
 *   - scopes (optional, query): Comma-separated OAuth scopes (default: email,public_profile,pages_show_list,pages_read_engagement,pages_manage_posts)
 *   - successRedirectUri (optional, query): URL to redirect to after successful OAuth (default: ADMIN_URL/dashboard)
 *   - errorRedirectUri (optional, query): URL to redirect to after OAuth error (default: ADMIN_URL/auth/error)
 * Returns: { success, url, scopes, expectedRedirectUri, clientId, companyId, successRedirectUri, errorRedirectUri }
 * Usage: Frontend redirects user to returned `url` for Facebook login
 */
router.get("/auth/url", async (req: Request, res: Response): Promise<void> => {
  try {
    // Prefer FACEBOOK_SCOPES; allow override via ?scopes=csv
    const scopesParam =
      (req.query.scopes as string) ||
      process.env.FACEBOOK_SCOPES ||
      "email,public_profile,pages_show_list,pages_read_engagement,pages_manage_posts";
    const scopes = scopesParam.split(/[ ,]+/).filter(Boolean);
    const url = generateFacebookAuthUrl(scopes);
    // Capture companyId from query params to pass through OAuth flow
    const companyId = req.query.companyId as string;

    // Get custom redirect URIs from query params
    const successRedirectUri = req.query.successRedirectUri as string;
    const errorRedirectUri = req.query.errorRedirectUri as string;

    if (!companyId) {
      res.status(400).json({ success: false, error: "companyId is required" });
      return;
    }

    // Generate unique state identifier
    const stateId = uuidv4();

    // Store companyId and redirect URIs in server-side state store
    oauthStateStore.set(stateId, {
      companyId: companyId,
      successRedirectUri: successRedirectUri || null,
      errorRedirectUri: errorRedirectUri || null,
      timestamp: Date.now()
    });

    // Generate Facebook auth URL with our custom state ID
    const { url: baseUrl, state: fbState } = generateFacebookAuthUrl(scopes);
    // Replace Facebook's generated state with our custom state ID
    const authUrl = baseUrl.replace(/state=[^&]*/, `state=${encodeURIComponent(stateId)}`);

    const expectedRedirectUri = (
      process.env.FACEBOOK_REDIRECT_URI ||
      `${process.env.API_URL || "http://localhost:9005"}/facebook/oauth2callback`
    );

    const defaultSuccessRedirectUri = `${process.env.ADMIN_URL || "http://localhost:4200"}/social-integration/facebook`;
    const defaultErrorRedirectUri = `${process.env.ADMIN_URL || "http://localhost:4200"}/social-integration/facebook?error=true`;

    console.log("[FACEBOOK AUTH URL] Generated OAuth URL:", {
      companyId: companyId,
      stateId: stateId,
      scopes: scopes,
      expectedRedirectUri: expectedRedirectUri,
      successRedirectUri: successRedirectUri || defaultSuccessRedirectUri,
      errorRedirectUri: errorRedirectUri || defaultErrorRedirectUri,
      fbGeneratedState: fbState,
      customState: stateId,
    });

    res.status(200).json({
      success: true,
      url: authUrl,
      scopes,
      expectedRedirectUri,
      clientId: (process.env.FACEBOOK_APP_ID || "").slice(0, 10) + "",
      companyId: companyId || null,
      successRedirectUri: successRedirectUri || defaultSuccessRedirectUri,
      errorRedirectUri: errorRedirectUri || defaultErrorRedirectUri
    });
    return;
  } catch (error: any) {
    console.error("[FACEBOOK AUTH URL] Error generating auth URL:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to generate auth URL" });
    return;
  }
});

/**
 *  GET /facebook/oauth2callback
 * Purpose: OAuth callback endpoint - receives auth code from Facebook and exchanges for tokens
 * Params:
 *   - code (required, query): Authorization code from Facebook OAuth
 *   - state (required, query): State parameter linking to companyId
 * Returns: Redirects to frontend with success/error message
 * Stores: Saves tokens to database and broadcasts connection to company users
 * Note: Automatically handles token extraction, exchange, and company notification
 */
router.get("/oauth2callback", async (req: Request, res: Response): Promise<void> => {
  // Declare variables at route level so they're accessible in catch block
  let companyId: string | null = null;
  let successRedirectUri: string | null = null;
  let errorRedirectUri: string | null = null;
  let accountEmail: string | null = null;
  let accountId: string | null = null;

  try {
    console.log("[FACEBOOK OAUTH2CALLBACK] Received callback request:", {
      fullUrl: req.originalUrl,
      queryParams: req.query,
      code: req.query.code,
      state: req.query.state,
      allParams: Object.keys(req.query),
    });

    let code = (req.query.code as string) || "";
    const state = req.query.state as string;

    // Sanitize code - remove extra quotes that might be added by frontend
    code = code
      .trim()
      .replace(/^["']/, "")      // Remove leading quote or double-quote
      .replace(/["']$/, "")      // Remove trailing quote or double-quote
      .trim();

    console.log("[FACEBOOK OAUTH2CALLBACK] Code sanitized:", {
      originalCode: req.query.code,
      cleanedCode: code,
      codeLength: code.length,
    });

    if (!code) {
      console.error("[FACEBOOK OAUTH2CALLBACK] ERROR: Missing code parameter. Query params:", req.query);
      res.status(400).json({
        success: false,
        message: "Missing code parameter",
        received: {
          code: code || null,
          state: state || null,
          allParams: req.query,
        }
      });
      return;
    }

    // Exchange short-lived auth code for short-lived token
    const shortToken = await exchangeFacebookCodeForTokens(code);
    console.log("[FACEBOOK OAUTH2CALLBACK] Short-lived token received:", {
      access_token: shortToken.access_token?.substring(0, 20) + "...",
      token_type: shortToken.token_type,
      expires_in: shortToken.expires_in,
    });

    // Exchange short-lived token for long-lived token (valid for ~60 days)
    const longToken = await exchangeShortLivedForLongLived(shortToken.access_token);
    console.log("[FACEBOOK OAUTH2CALLBACK] Long-lived token received:", {
      access_token: longToken.access_token?.substring(0, 20) + "...",
      token_type: longToken.token_type,
      expires_in: longToken.expires_in,
      refresh_token: longToken.refresh_token ? longToken.refresh_token.substring(0, 20) + "..." : null,
    });

    console.log("[FACEBOOK OAUTH2CALLBACK] Step 1: Fetching user info from Facebook...");

    // Fetch user info using the long-lived token
    const userinfo = await axios.get("https://graph.facebook.com/me?fields=id,name,email,picture", {
      headers: { Authorization: `Bearer ${longToken.access_token}` },
    });
    accountEmail = userinfo.data.email || null;
    accountId = userinfo.data.id || null;

    console.log("[FACEBOOK OAUTH2CALLBACK] Step 2: User info retrieved:", {
      accountId: accountId,
      accountEmail: accountEmail,
      userName: userinfo.data.name,
      emailFromAPI: userinfo.data.email || 'not provided - will use generated email',
    });

    if (!accountId) {
      console.error("[FACEBOOK OAUTH2CALLBACK] ERROR: No accountId returned from Facebook");
      res.status(400).json({
        success: false,
        message: "Failed to resolve Facebook account ID",
      });
      return;
    }

    // If no email, use a generated email from Facebook ID
    if (!accountEmail) {
      accountEmail = `facebook_${accountId}@facebook.local`;
      console.log("[FACEBOOK OAUTH2CALLBACK] Generated email for account:", accountEmail);
    }

    // Retrieve companyId and redirect URIs from state store (more reliable than session for OAuth)
    console.log("[FACEBOOK OAUTH2CALLBACK] Step 3: Retrieving companyId and redirect URIs from state store...");

    if (state) {
      if (oauthStateStore.has(state)) {
        const stateData = oauthStateStore.get(state);
        if (stateData) {
          const timestamp = stateData.timestamp;

          // Check if state data is still valid (within 30 minutes)
          if (Date.now() - timestamp < 30 * 60 * 1000) {
            companyId = stateData.companyId;
            successRedirectUri = stateData.successRedirectUri || null;
            errorRedirectUri = stateData.errorRedirectUri || null;
            console.log("[FACEBOOK OAUTH2CALLBACK] Found companyId and redirects in state store:", {
              companyId,
              successRedirectUri: successRedirectUri || `${process.env.ADMIN_URL || "http://localhost:4200"}/dashboard`,
              errorRedirectUri: errorRedirectUri || `${process.env.ADMIN_URL || "http://localhost:4200"}/auth/error`
            });
          } else {
            console.warn(" [FACEBOOK OAUTH2CALLBACK] State data expired in store");
          }
        }

        // Clean up state after use
        oauthStateStore.delete(state);
        console.log("[FACEBOOK OAUTH2CALLBACK] Cleaned up state from store");
      } else {
        console.warn(" [FACEBOOK OAUTH2CALLBACK] State NOT FOUND in store. State:", state);
      }
    } else {
      console.warn(" [FACEBOOK OAUTH2CALLBACK] No state parameter in URL");
    }

    console.log("[FACEBOOK OAUTH2CALLBACK] Step 4: Fetching Facebook pages...");

    // Fetch pages linked to this account
    const pagesResponse = await getFacebookPages(longToken.access_token);
    const pages = pagesResponse?.data || [];

    console.log("[FACEBOOK OAUTH2CALLBACK] Step 5: Pages fetched. Count:", pages.length);

    // Save tokens with companyId for multiple accounts support
    console.log("[FACEBOOK OAUTH2CALLBACK] Step 6: Saving token to database...");

    const savedToken = await saveOrUpdateToken({
      provider: "facebook",
      accountEmail,
      accountId,
      companyId,
      scopes: (process.env.FACEBOOK_SCOPES || "").split(/[ ,]+/).filter(Boolean),
      accessToken: longToken.access_token || null,
      refreshToken: longToken.refresh_token || null,
      expiryDate: longToken.expires_in ? Date.now() + longToken.expires_in * 1000 : null,
      tokenType: longToken.token_type || "Bearer",
      //   meta: {
      //     pages: pages.map((p: any) => ({ id: p.id, name: p.name, category: p.category })),
      //   }
    });

    console.log("[FACEBOOK OAUTH2CALLBACK] Token saved to database:", {
      id: savedToken?.id,
      provider: savedToken?.provider,
      accountEmail: savedToken?.accountEmail,
      accountId: savedToken?.accountId,
      companyId: savedToken?.companyId,
      accessToken: savedToken?.accessToken?.substring(0, 20) + "...",
      tokenType: savedToken?.tokenType,
      expiryDate: savedToken?.expiryDate,
      createdAt: savedToken?.createdAt,
    });

    console.log("[FACEBOOK OAUTH2CALLBACK] Step 7: Notifying users of connection...");

    // Notify company users of successful connection
    if (companyId) {
      try {
        await notifySocialConnectionAdded(companyId, {
          provider: "facebook",
          accountEmail: accountEmail ?? undefined,
          accountId: accountId ?? undefined,
          accountName: accountEmail.split("@")[0],
        });
        console.log("[FACEBOOK OAUTH2CALLBACK] Users notified successfully");
      } catch (err: any) {
        console.warn("[FACEBOOK OAUTH2CALLBACK] Failed to notify social connection added:", err.message);
      }
    } else {
      console.log("[FACEBOOK OAUTH2CALLBACK] No companyId, skipping notification");
    }

    console.log("[FACEBOOK OAUTH2CALLBACK] Step 8: Preparing redirect with token parameters...");

    // Get the saved token to pass to frontend
    const accessToken = savedToken?.accessToken || longToken.access_token || '';
    const refreshToken = savedToken?.refreshToken || longToken.refresh_token || '';
    const expiryDate = savedToken?.expiryDate || (longToken.expires_in ? Date.now() + longToken.expires_in * 1000 : '');
    const tokenType = savedToken?.tokenType || longToken.token_type || 'Bearer';

    // Build frontend callback URL with token parameters
    const baseRedirectUrl = successRedirectUri || `${process.env.ADMIN_URL || "http://localhost:4200"}/profile/integrations`;
    const frontendCallback = `${baseRedirectUrl}?accessToken=${encodeURIComponent(accessToken)}&refreshToken=${encodeURIComponent(refreshToken)}&expiryDate=${expiryDate}&tokenType=${encodeURIComponent(tokenType)}&success=true&page=4&source=facebook&accountEmail=${encodeURIComponent(accountEmail || '')}&accountId=${accountId || ''}&provider=facebook&facebookUserId=${encodeURIComponent(accountId)}&userAccessTokenId=${encodeURIComponent(savedToken.id)}`;

    console.log("[FACEBOOK OAUTH2CALLBACK] Step 8: Redirecting to frontend with token parameters");
    console.log("[FACEBOOK OAUTH2CALLBACK] Redirect URL:", frontendCallback);

    // Redirect to frontend with token details
    res.redirect(frontendCallback);
    return;
  } catch (error: any) {
    console.error("[FACEBOOK OAUTH2CALLBACK] ❌ ERROR:", {
      message: error.message,
      stack: error.stack,
      response: error?.response?.data,
      status: error?.response?.status,
    });

    console.log("[FACEBOOK OAUTH2CALLBACK] Building error redirect URL");

    // Use custom error redirect URI or fall back to profile/integrations with error flag
    const baseErrorRedirectUrl = errorRedirectUri || `${process.env.ADMIN_URL || "http://localhost:4200"}/profile/integrations`;
    const errorCallback = `${baseErrorRedirectUrl}?success=false&error=${encodeURIComponent(error.message || "OAuth callback failed")}&source=facebook&page=4`;

    console.log("[FACEBOOK OAUTH2CALLBACK] Redirecting to error page:", errorCallback);

    // Redirect to frontend error page
    res.redirect(errorCallback);
    return;
  }
});

/**
 *  USER & PAGE INFORMATION ENDPOINTS
 */

/**
 *  GET /facebook/me
 * Purpose: Fetch authenticated Facebook user profile
 * Params: 
 *   - access_token (required, query/header/body): Facebook access token
 * Returns: { success, me: { id, name, email, ... } }
 */
router.get("/facebook/me", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    const accessToken = tokens.access_token;

    if (!accessToken) {
      res.status(400).json({ success: false, message: "Provide access_token" });
      return;
    }

    console.log("[FACEBOOK ME] Token extracted:", {
      accessToken: accessToken.substring(0, 20) + "...",
    });

    const me = await getFacebookUser(accessToken);

    // If email is not available, generate one from the ID
    const email = me?.email || (me?.id ? `facebook_${me.id}@facebook.local` : 'unknown@facebook.local');
    const userWithEmail = { ...me, email };

    console.log("[FACEBOOK ME] User profile retrieved:", {
      id: me?.id,
      name: me?.name,
      email: email,
      emailFromAPI: me?.email || 'not provided - using generated',
    });
    res.status(200).json({ success: true, me: userWithEmail });
    return;
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.response?.data?.error?.message || error.message || "Failed to fetch profile"
    });
    return;
  }
});

/**
 *  GET /facebook/me/profile
 * Purpose: Fetch Facebook user profile with additional details (alias for /facebook/me)
 * Params: 
 *   - access_token (required, query/header/body): Facebook access token
 * Returns: { success, me: { id, name, email, picture, ... } }
 */
router.get("/me/profile", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    const accessToken = tokens.access_token;

    if (!accessToken) {
      res.status(400).json({ success: false, message: "Provide access_token" });
      return;
    }

    console.log("[FACEBOOK ME/PROFILE] Token extracted:", {
      accessToken: accessToken.substring(0, 20) + "...",
    });

    // ✅ Use the same helper function as /facebook/me endpoint for consistency
    const me = await getFacebookUser(accessToken);

    // If email is not available, generate one from the ID
    const email = me?.email || (me?.id ? `facebook_${me.id}@facebook.local` : 'unknown@facebook.local');
    const userWithEmail = { ...me, email };

    console.log("[FACEBOOK ME/PROFILE] User profile retrieved:", {
      id: me?.id,
      name: me?.name,
      email: email,
      emailFromAPI: me?.email || 'not provided - using generated',
    });

    res.status(200).json({
      success: true,
      user: userWithEmail  // ✅ Changed key from 'me' to 'user' for consistency
    });
    return;
  } catch (error: any) {
    console.error("[FACEBOOK ME/PROFILE] Failed to get profile:", error.message);
    res.status(500).json({
      success: false,
      message: error?.response?.data?.error?.message || error.message || "Failed to get profile"
    });
    return;
  }
});

/**
 *  GET /facebook/pages
 * Purpose: List all Facebook pages accessible by authenticated user
 * Params: 
 *   - access_token (required, query/header/body): Facebook access token
 * Returns: { success, pages: { data: [ { id, name, access_token, ... } ] } }
 */
router.get("/pages", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    const accessToken = tokens.access_token;

    if (!accessToken) {
      res.status(400).json({ success: false, message: "Provide access_token" });
      return;
    }

    console.log("[FACEBOOK PAGES] Token extracted:", {
      accessToken: accessToken.substring(0, 20) + "...",
    });

    try {
      // Try to get pages with business details
      const pages = await getFacebookPages(accessToken);
      console.log("[FACEBOOK PAGES] Pages retrieved:", {
        pageCount: pages?.data?.length || 0,
        pages: pages?.data?.map((p: any) => ({ id: p.id, name: p.name })) || [],
      });
      // console.log("facebook pages", pages);
      // console.log("[FACEBOOK PAGES] Saving pages to database...");

      const { companyId, facebookUserId, userAccessTokenId } = req.query;

      if (!companyId || !facebookUserId || !userAccessTokenId) {
        res.status(400).json({
          success: false,
          message: "companyId, facebookUserId, and userAccessTokenId are required"
        });
        return;
      }

      // search user access token in db for 

      const { pages: accounts, businesses } = await getFacebookPagesAndBusinesses(accessToken);
      console.log("accounts and businesses", accounts, businesses)

      await saveFacebookAccountsToDb(
        { accounts, businesses },
        String(companyId),
        String(facebookUserId),
        String(userAccessTokenId),
      );

      res.status(200).json({ success: true, pages });
      return;
    } catch (apiError: any) {
      console.warn("[FACEBOOK PAGES] Business manager permission error, trying simple accounts endpoint:", {
        error: apiError?.response?.data?.error?.message || apiError.message
      });

      // Fallback: Try simple accounts endpoint without business details
      const fallbackUrl = `https://graph.facebook.com/me/accounts?fields=id,name,access_token,picture{url},followers_count,category`;
      const fallbackPages = await axios.get(fallbackUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      console.log("[FACEBOOK PAGES] Fallback pages retrieved:", {
        pageCount: fallbackPages.data?.data?.length || 0,
        pages: fallbackPages.data?.data?.map((p: any) => ({ id: p.id, name: p.name })) || [],
      });

      res.status(200).json({ success: true, pages: fallbackPages.data });
      return;
    }
  } catch (error: any) {
    console.error("[FACEBOOK PAGES] ❌ ERROR:", {
      message: error.message,
      status: error?.response?.status,
      fbError: error?.response?.data?.error?.message,
    });
    res.status(500).json({
      success: false,
      message: error?.response?.data?.error?.message || error.message || "Failed to fetch pages",
      error: error?.response?.data?.error,
    });
    return;
  }
});

/**
 *  PAGE POSTING ENDPOINTS
 */

/**
 *  POST /facebook/pages/:pageId/post
 * Purpose: Create a new post on a specific Facebook page
 * Params: 
 *   - pageId (required, path): Facebook page ID
 *   - message (required, body/query): Message text to post
 *   - page_access_token (optional, body/query): Direct page access token
 *   - access_token (optional, query/header/body): User access token (required if page_access_token not provided)
 * Returns: { success, result: { id, message, ... } }
 */
router.post("/pages/:pageId/post", async (req: Request, res: Response): Promise<void> => {
  try {
    const pageId = req.params.pageId;
    const text = (req.body?.message as string) || (req.query?.message as string);
    const providedPageToken = (req.body?.page_access_token as string) || (req.query?.page_access_token as string);

    if (!text) {
      res.status(400).json({ success: false, message: "Missing message parameter" });
      return;
    }

    let pageToken = providedPageToken || null;

    // If no page token provided, try to derive it from user`s pages
    if (!pageToken) {
      const tokens = extractTokens(req);
      if (!tokens.access_token) {
        res.status(400).json({ success: false, message: "Provide access_token or page_access_token" });
        return;
      }

      console.log("[FACEBOOK POST] User access token extracted:", {
        accessToken: tokens.access_token.substring(0, 20) + "...",
      });

      const pages = await getFacebookPages(tokens.access_token);
      const pagesList = pages?.data || [];
      const match = pagesList.find((p: any) => String(p.id) === String(pageId));
      pageToken = match?.access_token || null;

      if (pageToken) {
        console.log("[FACEBOOK POST] Page token derived from user pages:", {
          pageId: pageId,
          pageToken: pageToken.substring(0, 20) + "...",
        });
      }
    } else {
      console.log("[FACEBOOK POST] Page token provided directly:", {
        pageId: pageId,
        pageToken: pageToken.substring(0, 20) + "...",
      });
    }

    if (!pageToken) {
      res.status(400).json({ success: false, message: "Could not determine page access token" });
      return;
    }

    const result = await postToFacebookPage(pageId.toString(), pageToken, text);
    console.log("[FACEBOOK POST] Post created successfully:", {
      pageId: pageId,
      postId: result.data?.id,
      message: text.substring(0, 50) + "...",
    });

    res.status(200).json({ success: true, result: result.data });
    return;
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.response?.data?.error?.message || error.message || "Failed to post to page"
    });
    return;
  }
});

/**
 *  PAGE SAVING ENDPOINTS
 */

/**
 *  POST /facebook/pages/save
 * Purpose: Save/register Facebook pages to a company account (stepper completion)
 * Params:
 *   - companyId (required, body): Company ID to associate pages with
 *   - facebookUserId (required, body): Facebook user ID
 *   - userAccessTokenId (required, body): ID of saved OAuth token in social_tokens
 *   - pages (required, body): Array of page objects [ { id, name, access_token, category } ]
 * Returns: { success, savedPages, savedToDb, message }
 */

// ✅ CORRECTED: Backend POST /facebook/pages/save - Fixed Version

router.post("/pages/save", async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId, pages, facebookUserId, userAccessTokenId } = req.body;

    if (!companyId || !pages || !Array.isArray(pages) || pages.length === 0) {
      res.status(400).json({
        success: false,
        message: "companyId and pages array are required",
      });
      return;
    }

    // Validate page objects
    const validPages = pages.filter((page: any) => page.id && page.name);
    if (validPages.length === 0) {
      res.status(400).json({
        success: false,
        message: "Each page must have 'id' and 'name' properties",
      });
      return;
    }

    console.log("[FACEBOOK PAGES SAVE] Starting stepper data save:", {
      companyId,
      pageCount: validPages.length,
      facebookUserId: facebookUserId || "not-provided",
      userAccessTokenId: userAccessTokenId || "not-provided",
    });

    // Save pages to token store with metadata
    const savedPages = [];
    for (const page of validPages) {
      try {
        const savedToken = await saveOrUpdateToken({
          provider: "facebook_page",
          accountId: page.id,
          accountEmail: page.name,
          companyId: companyId,
          scopes: (process.env.FACEBOOK_SCOPES || "").split(/[ ,]+/).filter(Boolean),
          accessToken: page.access_token || null,
          refreshToken: null,
          expiryDate: null,
          tokenType: "Bearer",
        });

        console.log(`[FACEBOOK PAGES SAVE] Page token saved for ${page.id}:`, {
          pageId: page.id,
          pageName: page.name,
          companyId: companyId,
          accessToken: page.access_token?.substring(0, 20) + "...",
          tokenId: savedToken?.id,
        });

        savedPages.push({
          id: page.id,
          name: page.name,
          category: page.category || null,
          saved: true,
        });
      } catch (pageError: any) {
        console.error(`[FACEBOOK PAGES SAVE] Failed to save page ${page.id}:`, pageError.message);
        savedPages.push({
          id: page.id,
          name: page.name,
          category: page.category || null,
          saved: false,
          error: pageError.message,
        });
      }
    }

    // ✅ FIXED: Save to meta_social_accounts table
    // Only require companyId - userAccessTokenId can be null
    let savedToDb = 0;
    try {
      console.log("[FACEBOOK PAGES SAVE] Preparing to save pages to meta_social_accounts:", {
        companyId,
        pageCount: validPages.length,
        facebookUserId: facebookUserId || null,
        userAccessTokenId: userAccessTokenId || null,
      });

      // Transform pages for meta_social_accounts
      const metaAccounts = validPages.map((page: any) => {
        const record: any = {
          companyId,
          userAccessTokenId: userAccessTokenId || null,  // ← CAN BE NULL
          assignedClientId: null,  // Not assigned to client yet
          platform: "facebook",
          facebookUserId: facebookUserId || null,       // ← CAN BE NULL
          facebookPageId: page.id,
          facebookBusinessId: null,
          instagramBusinessId: null,
          accountName: page.name,
          pageAccessToken: page.access_token || null,
          isAdded: true,  // Marked as added from stepper
          isAssigned: false,
        };
        return record;
      });

      console.log("[FACEBOOK PAGES SAVE] Records to insert:", {
        count: metaAccounts.length,
        sample: metaAccounts[0],
      });

      // Bulk create with ignoreDuplicates
      const created = await MetaSocialAccount.bulkCreate(metaAccounts as any, {
        ignoreDuplicates: true,
      });

      savedToDb = created.length;

      console.log("[FACEBOOK PAGES SAVE] ✅ Successfully saved to meta_social_accounts:", {
        count: savedToDb,
        companyId,
        pages: created.map((p: any) => ({
          facebookPageId: p.facebookPageId,
          accountName: p.accountName,
        })),
      });
    } catch (dbError: any) {
      console.error("[FACEBOOK PAGES SAVE] ❌ Error saving to meta_social_accounts:", dbError.message);
      console.error("[FACEBOOK PAGES SAVE] Stack:", dbError.stack);
    }

    const successCount = savedPages.filter((p: any) => p.saved).length;

    res.status(200).json({
      success: true,
      message: `Successfully saved ${successCount} out of ${savedPages.length} pages`,
      savedPages,
      savedToDb,
      dbMessage: savedToDb > 0 ? `✅ Stored ${savedToDb} pages in database` : "⚠️ Database storage attempted",
    });
    return;
  } catch (error: any) {
    console.error("Facebook pages save failed:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to save Facebook pages",
    });
    return;
  }
});

/**
 *  DELETE /facebook/pages/delete/:pageId
 * Purpose: Delete/unregister a Facebook page from a company account
 * Params:
 *   - pageId (required, path): Facebook page ID to delete
 *   - companyId (optional, query): Company ID for filtering (if provided, only deletes if page belongs to this company)
 * Returns: { success, message, pageId, deletedCount }
 */
router.delete("/pages/delete/:pageId", async (req: Request, res: Response): Promise<void> => {
  try {
    const { pageId } = req.params;
    const companyId = (req.query.companyId as string) || null;

    if (!pageId) {
      res.status(400).json({
        success: false,
        message: "pageId is required",
      });
      return;
    }

    // Verify page exists before deletion
    const pageToken = await SocialToken.findOne({
      where: {
        provider: "facebook_page",
        accountId: pageId,
        ...(companyId && { companyId: companyId }),
      },
    } as any);

    if (!pageToken) {
      res.status(404).json({
        success: false,
        message: `Page ${pageId} not found${companyId ? ` for company ${companyId}` : ""}`,
      });
      return;
    }

    // Delete the page record
    const deletedCount = await SocialToken.destroy({
      where: {
        provider: "facebook_page",
        accountId: pageId,
        ...(companyId && { companyId: companyId }),
      },
    } as any);

    if (deletedCount === 0) {
      res.status(500).json({
        success: false,
        message: "Failed to delete page",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: `Successfully deleted Facebook page ${pageId}`,
      pageId,
      deletedCount,
    });
    return;
  } catch (error: any) {
    console.error("Facebook page delete failed:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to delete Facebook page",
    });
    return;
  }
});

/**
 *  PUT /facebook/pages/update-status
 * Purpose: Update the status/metadata of a saved Facebook page
 * Params:
 *   - pageId (required, body): Facebook page ID to update
 *   - companyId (required, body): Company ID that owns the page
 *   - status (optional, body): Page status (e.g., 'active', 'inactive', 'archived')
 *   - isActive (optional, body): Boolean to mark page as active/inactive
 *   - metadata (optional, body): Additional metadata object to store with page
 * Returns: { success, message, pageId, updatedPage }
 */
router.put("/pages/update-status", async (req: Request, res: Response): Promise<void> => {
  try {
    const { pageId, companyId, status, isActive, metadata } = req.body;

    if (!pageId || !companyId) {
      res.status(400).json({
        success: false,
        message: "pageId and companyId are required",
      });
      return;
    }

    // Find the page token
    const pageToken = await SocialToken.findOne({
      where: {
        provider: "facebook_page",
        accountId: pageId,
        companyId: companyId,
      },
    } as any);

    if (!pageToken) {
      res.status(404).json({
        success: false,
        message: `Page ${pageId} not found for company ${companyId}`,
      });
      return;
    }

    // Update page metadata/status
    // Store status and isActive information by updating token fields
    if (status !== undefined || isActive !== undefined || metadata) {
      // Update isActive status using tokenType field
      if (isActive !== undefined) {
        pageToken.tokenType = isActive ? "Bearer" : "Inactive";
      }
    }

    await pageToken.save();

    res.status(200).json({
      success: true,
      message: `Successfully updated Facebook page ${pageId} status`,
      pageId,
      updatedPage: {
        id: pageToken.accountId,
        name: pageToken.accountEmail,
        provider: pageToken.provider,
        companyId: pageToken.companyId,
        status: status || "updated",
        isActive: isActive !== undefined ? isActive : true,
        updatedAt: pageToken.updatedAt,
      },
    });
    return;
  } catch (error: any) {
    console.error("Facebook page status update failed:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update Facebook page status",
    });
    return;
  }
});

/**
 *  PAGE POSTS ENDPOINTS
 */

/**
 *  GET /facebook/posts/:companyId/:pageId
 * Purpose: Fetch posts from a specific Facebook page associated with a company
 * Params: 
 *   - companyId (required, path): Company ID
 *   - pageId (required, path): Facebook page ID
 *   - limit (optional, query): Number of posts to fetch (default: 25)
 * Returns: { success, page: { id, name }, posts: [ ... ], paging: { cursors, next } }
 */
router.get("/posts/:companyId/:pageId", async (req: Request, res: Response): Promise<void> => {
  const { companyId, pageId } = req.params;
  const limit = Number(req.query.limit) || 25;

  if (!companyId || !pageId) {
    res.status(400).json({
      success: false,
      message: "companyId and pageId are required",
    });
    return;
  }

  try {
    // Get stored Facebook token for company
    const facebookToken = await getFacebookClient(companyId.toString());

    // Fetch pages linked to the user
    const pagesResponse = await axios.get("https://graph.facebook.com/v19.0/me/accounts", {
      params: { access_token: facebookToken.accessToken },
    });

    const pages = pagesResponse.data?.data || [];

    // Find target page
    const targetPage = pages.find((page: any) => page.id === pageId);

    if (!targetPage || !targetPage.access_token) {
      res.status(404).json({
        success: false,
        message: "Page not found or missing page access token",
      });
      return;
    }

    // Fetch page posts
    const postsResponse = await axios.get(`https://graph.facebook.com/v19.0/${pageId}/posts`, {
      params: {
        access_token: targetPage.access_token,
        fields: "id,message,created_time,likes.summary(true),comments.summary(true),shares",
        limit,
      },
    });

    // Success response
    res.status(200).json({
      success: true,
      page: {
        id: targetPage.id,
        name: targetPage.name,
      },
      posts: postsResponse.data.data,
      paging: postsResponse.data.paging,
    });
    return;
  } catch (error: any) {
    console.error("Facebook posts fetch failed:", {
      companyId,
      pageId,
      error: error?.response?.data || error.message,
    });

    res.status(500).json({
      success: false,
      message: error?.response?.data?.error?.message || "Failed to fetch Facebook posts",
    });
    return;
  }
});

/**
 *  GET /facebook/test-flow
 * Purpose: Test the complete OAuth flow and verify configuration
 * Returns: Configuration and debugging information
 */
router.get("/test-flow", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = "test-company-" + Math.random().toString(36).slice(7);

    // Step 1: Get auth URL
    const authUrlResponse = await axios.get(`http://localhost:${process.env.PORT || 9005}/facebook/auth/url?companyId=${companyId}`);
    const authUrl = authUrlResponse.data.url;

    console.log("[FACEBOOK TEST FLOW] Configuration check:", {
      FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID ? "✓ Set" : "✗ Missing",
      FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET ? "✓ Set" : "✗ Missing",
      FACEBOOK_REDIRECT_URI: process.env.FACEBOOK_REDIRECT_URI || `http://localhost:9005/facebook/oauth2callback`,
      API_URL: process.env.API_URL || "http://localhost:9005",
      FACEBOOK_SCOPES: process.env.FACEBOOK_SCOPES || "default scopes",
    });

    res.status(200).json({
      success: true,
      message: "Configuration is ready. Use the URL below to test OAuth flow.",
      step1_generateAuthUrl: {
        endpoint: "GET /facebook/auth/url?companyId={companyId}",
        response: authUrlResponse.data,
        nextStep: "Copy the 'url' value and visit it in your browser"
      },
      step2_userAuthorizes: {
        description: "User will see Facebook login page and authorize your app"
      },
      step3_facebookRedirects: {
        description: "Facebook will redirect to: " + authUrlResponse.data.expectedRedirectUri,
        parameters: "?code=AUTH_CODE&state=STATE_ID"
      },
      configuration: {
        appId: process.env.FACEBOOK_APP_ID?.substring(0, 10) + "...",
        redirectUri: process.env.FACEBOOK_REDIRECT_URI || `http://localhost:9005/facebook/oauth2callback`,
        scopes: (process.env.FACEBOOK_SCOPES || "email,public_profile").split(","),
      },
      testAuthUrl: authUrl,
    });
  } catch (error: any) {
    console.error("[FACEBOOK TEST FLOW] Error:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to generate test flow",
      error: error.response?.data || error.message,
    });
  }
});

/**
 *  UTILITY ENDPOINTS
 */

/**
 *  GET /facebook/debug
 * Purpose: Debug and display Facebook OAuth configuration and token information
 * Params:
 *   - token (optional, query): Token to debug
 *   - access_token (optional, query): Token to debug
 * Returns: { success, expectedRedirectUri, clientIdStart, scopes, debug }
 */
router.get("/debug", async (req: Request, res: Response): Promise<void> => {
  try {
    const inputToken = (req.query.token as string) || (req.query.access_token as string) || "";
    const debug = inputToken ? await getFacebookDebugToken(inputToken) : null;

    console.log("[FACEBOOK DEBUG] Token debug info:", {
      hasToken: !!inputToken,
      tokenLength: inputToken?.length || 0,
      tokenPreview: inputToken?.substring(0, 20) + "..." || "no token",
      debugInfo: debug,
    });

    const expectedRedirectUri =
      process.env.FACEBOOK_REDIRECT_URI ||
      `${process.env.API_URL || "http://localhost:9005"}/facebook/oauth2callback`;

    const clientId = process.env.FACEBOOK_APP_ID || process.env.FACEBOOK_CLIENT_ID || "";
    const scopes = (process.env.FACEBOOK_SCOPES || "email,public_profile,pages_show_list,pages_read_engagement,pages_manage_posts")
      .split(/[ ,]+/)
      .filter(Boolean);

    res.status(200).json({
      success: true,
      expectedRedirectUri,
      clientIdStart: clientId.slice(0, 10) + "",
      scopes,
      debug
    });
    return;
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to read config"
    });
    return;
  }
});

//GET /facebook/business-manager 
router.get('/business-manager', async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token) { res.status(400).json({ success: false, message: "Provide access_token" }); return; }
    const pages = await getFacebookBusinesses(tokens.access_token);
    res.status(200).json({ success: true, pages });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.response?.data || e.message || "Failed to fetch pages" });
  }
});

/**
 * GET /facebook/user-profile
 * Purpose: Get connected Facebook user profile (name, email, picture) for UI display
 * Params: companyId (required, query)
 * Returns: { success, facebookConnected, user: { name, email, picture } }
 */
router.get('/user-profile', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.query.companyId as string;

    if (!companyId) {
      res.status(400).json({ success: false, message: "companyId is required" });
      return;
    }

    console.log("[FACEBOOK USER PROFILE] Fetching user profile for company:", companyId);

    // Get the saved token from database
    const token = await SocialToken.findOne({
      where: {
        companyId: companyId,
        provider: 'facebook'
      }
    });

    if (!token || !token.accessToken) {
      console.log("[FACEBOOK USER PROFILE] No Facebook token found for company:", companyId);
      res.status(200).json({
        success: true,
        facebookConnected: false,
        user: null
      });
      return;
    }

    console.log("[FACEBOOK USER PROFILE] Found Facebook token, fetching user info...");

    // Fetch user info from Facebook
    const userInfo = await axios.get('https://graph.facebook.com/me?fields=id,name,email,picture.type(large)', {
      headers: { Authorization: `Bearer ${token.accessToken}` }
    });

    const user = {
      name: userInfo.data.name || 'Unknown User',
      email: userInfo.data.email || token.accountEmail || 'No email provided',
      picture: userInfo.data.picture?.data?.url || null,
      accountId: userInfo.data.id
    };

    console.log("[FACEBOOK USER PROFILE] User info retrieved:", {
      name: user.name,
      email: user.email,
      hasPicture: !!user.picture
    });

    res.status(200).json({
      success: true,
      facebookConnected: true,
      user: user,
      connectedAt: token.createdAt
    });
    return;
  } catch (error: any) {
    console.error("[FACEBOOK USER PROFILE] Error fetching user profile:", {
      message: error.message,
      status: error?.response?.status
    });
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch user profile"
    });
    return;
  }
});

/**
 * DELETE /facebook/disconnect
 * Purpose: Disconnect/remove Facebook account connection
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

    console.log("[FACEBOOK DISCONNECT] Disconnecting Facebook for company:", companyId);

    // Delete the token from database
    const result = await SocialToken.destroy({
      where: {
        companyId: companyId,
        provider: 'facebook'
      }
    });

    if (result === 0) {
      console.log("[FACEBOOK DISCONNECT] No Facebook connection found for company:", companyId);
      res.status(404).json({
        success: false,
        message: "No Facebook connection found"
      });
      return;
    }

    console.log("[FACEBOOK DISCONNECT] Facebook disconnected successfully for company:", companyId);

    res.status(200).json({
      success: true,
      message: "Facebook account disconnected successfully"
    });
    return;
  } catch (error: any) {
    console.error("[FACEBOOK DISCONNECT] Error disconnecting:", {
      message: error.message
    });
    res.status(500).json({
      success: false,
      message: error.message || "Failed to disconnect Facebook account"
    });
    return;
  }
});

/**
 * GET /facebook/connection-status
 * Purpose: Check if Facebook account is connected and active
 * Params: companyId (required, query)
 * Returns: { success, isConnected, isActive, accountEmail, accountId, connectedSince }
 */
router.get('/connection-status', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.query.companyId as string;

    if (!companyId) {
      res.status(400).json({ success: false, message: "companyId is required" });
      return;
    }

    console.log("[FACEBOOK CONNECTION STATUS] Checking connection for company:", companyId);

    // Check if token exists in database
    const token = await SocialToken.findOne({
      where: {
        companyId: companyId,
        provider: 'facebook'
      }
    });

    if (!token) {
      res.status(200).json({
        success: true,
        isConnected: false,
        isActive: false,
        accountEmail: null,
        accountId: null,
        connectedSince: null
      });
      return;
    }

    // Check if token is expired
    const isExpired = token.expiryDate && new Date(token.expiryDate) < new Date();

    res.status(200).json({
      success: true,
      isConnected: true,
      isActive: !isExpired,
      accountEmail: token.accountEmail,
      accountId: token.accountId,
      connectedSince: token.createdAt,
      expiresAt: token.expiryDate,
      isExpired: isExpired
    });
    return;
  } catch (error: any) {
    console.error("[FACEBOOK CONNECTION STATUS] Error checking status:", {
      message: error.message
    });
    res.status(500).json({
      success: false,
      message: error.message || "Failed to check connection status"
    });
    return;
  }
});

/**
 * PUT /facebook/toggle-status
 * Purpose: Activate or deactivate Facebook connection (archiving)
 * Params: companyId (required, query), active (required, body: boolean)
 * Returns: { success, message, isActive }
 */
router.put('/toggle-status', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.query.companyId as string;
    const { active } = req.body;

    if (!companyId) {
      res.status(400).json({ success: false, message: "companyId is required" });
      return;
    }

    if (typeof active !== 'boolean') {
      res.status(400).json({ success: false, message: "active (boolean) is required in body" });
      return;
    }

    console.log("[FACEBOOK TOGGLE STATUS] Toggling status for company:", companyId, "Active:", active);

    // For now, this endpoint could be used to soft-delete or archive
    // You can extend this to set an isActive flag in the database
    const token = await SocialToken.findOne({
      where: {
        companyId: companyId,
        provider: 'facebook'
      }
    });

    if (!token) {
      res.status(404).json({
        success: false,
        message: "No Facebook connection found"
      });
      return;
    }

    console.log("[FACEBOOK TOGGLE STATUS] Status toggled successfully for company:", companyId);

    res.status(200).json({
      success: true,
      message: `Facebook connection is now ${active ? 'active' : 'inactive'}`,
      isActive: active
    });
    return;
  } catch (error: any) {
    console.error("[FACEBOOK TOGGLE STATUS] Error toggling status:", {
      message: error.message
    });
    res.status(500).json({
      success: false,
      message: error.message || "Failed to toggle connection status"
    });
    return;
  }
});

/**
 * GET /facebook/avatar
 * Purpose: Get Facebook profile picture URL
 * Params: companyId (required, query)
 * Returns: { success, picture, url }
 */
router.get('/avatar', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.query.companyId as string;

    if (!companyId) {
      res.status(400).json({ success: false, message: "companyId is required" });
      return;
    }

    console.log("[FACEBOOK AVATAR] Fetching avatar for company:", companyId);

    // Get the saved token from database
    const token = await SocialToken.findOne({
      where: {
        companyId: companyId,
        provider: 'facebook'
      }
    });

    if (!token || !token.accessToken) {
      res.status(404).json({
        success: false,
        message: "No Facebook connection found"
      });
      return;
    }

    // Fetch user picture from Facebook
    const picResponse = await axios.get('https://graph.facebook.com/me/picture?type=large&redirect=false', {
      headers: { Authorization: `Bearer ${token.accessToken}` }
    });

    const pictureUrl = picResponse.data.data?.url || null;

    console.log("[FACEBOOK AVATAR] Avatar URL retrieved:", !!pictureUrl);

    res.status(200).json({
      success: true,
      picture: pictureUrl,
      url: pictureUrl
    });
    return;
  } catch (error: any) {
    console.error("[FACEBOOK AVATAR] Error fetching avatar:", {
      message: error.message
    });
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch avatar"
    });
    return;
  }
});

/**
 * GET /pages/assignments
 * GET /api/pages/assignments (alias)
 * Purpose: Fetch all page assignments for a company (to display who manages each page)
 * Params: companyId (required, query), pageId (optional, query - filter by single page)
 * Returns: { success, assignments: [ { pageId, pageName, clientId, clientName, clientEmail, assignedAt } ], count }
 * 
 * Full URLs:
 *   http://localhost:9005/facebook/pages/assignments?companyId=xxx
 *   http://localhost:9005/facebook/api/pages/assignments?companyId=xxx (alias)
 */
router.get(["/pages/assignments", "/api/pages/assignments"], async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.query.companyId as string;
    const pageId = req.query.pageId as string;

    if (!companyId) {
      console.log("[PAGE ASSIGNMENTS] Missing companyId parameter");
      res.status(400).json({
        success: false,
        error: "companyId is required"
      });
      return;
    }

    console.log("[PAGE ASSIGNMENTS] Fetching assignments:", {
      companyId,
      pageId: pageId || "all pages"
    });

    // Build query filter
    const where: any = { companyId: companyId };
    if (pageId) {
      where.pageId = pageId;
    }

    // Fetch all assignments for the company
    const assignments = await FacebookAssignment.findAll({
      where,
      raw: true,
      order: [["assignedAt", "DESC"]]
    });

    console.log("[PAGE ASSIGNMENTS] Assignments retrieved:", {
      companyId,
      totalAssignments: assignments.length,
      assignments: assignments.map((a: any) => ({
        pageId: a.pageId,
        pageName: a.facebookPageName,
        clientId: a.clientId,
        clientName: a.clientName
      }))
    });

    res.status(200).json({
      success: true,
      assignments: assignments.map((a: any) => ({
        pageId: a.pageId,
        pageName: a.facebookPageName,
        pageCategory: a.facebookPageCategory,
        clientId: a.clientId,
        clientName: a.clientName,
        clientEmail: a.clientEmail,
        assignedAt: a.assignedAt,
        updatedAt: a.updatedAt
      })),
      count: assignments.length,
      message: `Found ${assignments.length} assignment(s) for company ${companyId}`
    });
    return;
  } catch (error: any) {
    console.error("[PAGE ASSIGNMENTS] Error fetching assignments:", {
      message: error.message
    });
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch page assignments"
    });
    return;
  }
});

/**
 * PUT /pages/update-category
 * PUT /api/pages/update-category (alias)
 * Purpose: Update the category for a Facebook page assignment
 * Body: pageId (required), companyId (required), category (required)
 * Returns: { success, message, pageId, category }
 */
router.put(["/pages/update-category", "/api/pages/update-category"], async (req: Request, res: Response): Promise<void> => {
  try {
    const { pageId, companyId, category } = req.body;

    if (!pageId || !companyId || !category) {
      console.log("[PAGE UPDATE CATEGORY] Missing required parameters");
      res.status(400).json({
        success: false,
        error: "pageId, companyId, and category are required"
      });
      return;
    }

    console.log("[PAGE UPDATE CATEGORY] Updating category:", {
      pageId,
      companyId,
      category
    });

    // Update the assignment with the category
    const [updated] = await FacebookAssignment.update(
      { facebookPageCategory: category },
      {
        where: {
          pageId: pageId,
          companyId: companyId
        }
      }
    );

    if (updated === 0) {
      console.log("[PAGE UPDATE CATEGORY] No assignment found to update");
      res.status(404).json({
        success: false,
        error: "Assignment not found"
      });
      return;
    }

    console.log("[PAGE UPDATE CATEGORY] Category updated successfully");

    res.status(200).json({
      success: true,
      message: `Category updated to "${category}" for page ${pageId}`,
      pageId,
      category
    });
    return;
  } catch (error: any) {
    console.error("[PAGE UPDATE CATEGORY] Error updating category:", {
      message: error.message
    });
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update page category"
    });
    return;
  }
});

/**
 * GET /clients/available
 * GET /api/clients/available (alias)
 * Purpose: Fetch all available clients for the company (for modal client list display)
 * Params: companyId (required, query)
 * Returns: { success, clients: [ { id, name, email, phone, avatar, status } ], count, message }
 * 
 * Full URLs:
 *   http://localhost:9005/facebook/clients/available?companyId=xxx
 *   http://localhost:9005/facebook/api/clients/available?companyId=xxx (alias)
 */
router.get(["/clients/available", "/api/clients/available"], async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.query.companyId as string;

    if (!companyId) {
      console.log("[CLIENTS AVAILABLE] Missing companyId parameter");
      res.status(400).json({
        success: false,
        error: "companyId is required",
        code: "MISSING_COMPANY_ID"
      });
      return;
    }

    console.log("[CLIENTS AVAILABLE] Fetching clients for company:", {
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

    console.log("[CLIENTS AVAILABLE] Query completed successfully:", {
      companyId,
      totalClients: clients?.length || 0,
      clientsData: clients
    });

    if (!clients || clients.length === 0) {
      console.warn("[CLIENTS AVAILABLE] No clients found for company:", companyId);
      res.status(200).json({
        success: true,
        clients: [],
        count: 0,
        message: `No clients found for company ${companyId}`
      });
      return;
    }

    console.log("[CLIENTS AVAILABLE] Clients retrieved:", {
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
    console.error("[CLIENTS AVAILABLE] ❌ Error fetching clients:", {
      message: error.message,
      code: error.code,
      stack: error.stack,
      name: error.name,
      fullError: error
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
 * POST /pages/assign-to-client
 * POST /api/pages/assign-to-client (alias)
 * Purpose: Assign one or multiple Facebook pages to a specific client
 * Body:
 *   - companyId (required): Company ID
 *   - clientId (required): Client ID to assign pages to
 *   - pageIds (required): Array of Facebook page IDs to assign (can be single item array)
 * Returns: { success, assigned, failed, assignedPages, failedPages, message }
 * Usage: Called from modal when user clicks "Assign Client" button
 * 
 * Full URLs:
 *   POST http://localhost:9005/facebook/pages/assign-to-client
 *   POST http://localhost:9005/facebook/api/pages/assign-to-client (alias)
 */
router.post(["/pages/assign-to-client", "/api/pages/assign-to-client"], async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId, clientId, pageIds, pageType } = req.body;

    // Validation - companyId
    if (!companyId) {
      console.log("[PAGES ASSIGN] Missing companyId parameter");
      res.status(400).json({
        success: false,
        error: "companyId is required",
        code: "MISSING_COMPANY_ID"
      });
      return;
    }

    // Validation - clientId
    if (!clientId) {
      console.log("[PAGES ASSIGN] Missing clientId parameter");
      res.status(400).json({
        success: false,
        error: "clientId is required",
        code: "MISSING_CLIENT_ID"
      });
      return;
    }

    // Validation - pageIds array
    if (!pageIds || !Array.isArray(pageIds) || pageIds.length === 0) {
      console.log("[PAGES ASSIGN] Missing or invalid pageIds parameter");
      res.status(400).json({
        success: false,
        error: "pageIds array is required and must contain at least one page ID",
        code: "INVALID_PAGE_IDS"
      });
      return;
    }

    console.log("[PAGES ASSIGN] Starting page assignment:", {
      companyId,
      clientId,
      pageCount: pageIds.length,
      pageType: pageType || "all",
      pageIds
    });

    // Fetch client details to verify they exist and get their info
    const client = await Clients.findOne({
      where: { id: clientId, companyId: companyId },
      raw: true,
    });

    if (!client) {
      console.log("[PAGES ASSIGN] Client not found:", { clientId, companyId });
      res.status(404).json({
        success: false,
        error: `Client ${clientId} not found for company ${companyId}`,
        code: "CLIENT_NOT_FOUND"
      });
      return;
    }

    console.log("[PAGES ASSIGN] Client verified:", {
      id: client.id,
      name: `${client.clientfirstName} ${client.clientLastName}`,
      email: client.businessEmail
    });

    const assignedPages = [];
    const failedPages = [];

    // Construct full client name and email
    const clientFullName = `${client.clientfirstName || ""} ${client.clientLastName || ""}`.trim();
    const clientEmail = client.businessEmail || "unknown@email.com";

    console.log("[PAGES ASSIGN] Client info constructed:", {
      clientFullName,
      clientEmail
    });

    // Assign each page to the client
    for (const pageId of pageIds) {
      try {
        // Try to find the page in meta_social_accounts (business pages)
        let pageRecord = await MetaSocialAccount.findOne({
          where: {
            companyId: companyId,
            platform: "facebook",
            facebookPageId: pageId
          },
          raw: true
        });

        let pageSource = "business";
        let pageName = "";
        let pageCategory = "";
        let metaAccountId = null;

        if (pageRecord) {
          // Business page found
          pageName = pageRecord.accountName || pageId;
          pageCategory = "Business Page";
          metaAccountId = pageRecord.id;

          console.log(`[PAGES ASSIGN] Found business page ${pageId}:`, {
            name: pageName,
            metaAccountId: metaAccountId,
            hasAccessToken: !!pageRecord.pageAccessToken
          });

          // Update meta_social_accounts to mark as assigned
          await MetaSocialAccount.update(
            {
              // isAssigned: true,
              assignedClientId: clientId,
              updatedAt: new Date(),
            },
            {
              where: { id: pageRecord.id }
            }
          );

          console.log(`[PAGES ASSIGN] Business page ${pageId} marked as assigned in meta_social_accounts`);

        } else {
          // If not found in meta_social_accounts, check FacebookAssignment (already assigned)
          const existingAssignment = await FacebookAssignment.findOne({
            where: {
              companyId: companyId,
              pageId: pageId
            },
            raw: true
          });

          if (existingAssignment) {
            pageSource = "existing_assignment";
            pageName = existingAssignment.facebookPageName || pageId;
            pageCategory = existingAssignment.facebookPageCategory || "Facebook Page";
            metaAccountId = existingAssignment.metaAccountId;

            console.log(`[PAGES ASSIGN] Found existing assignment for page ${pageId}:`, {
              name: pageName,
              category: pageCategory,
              metaAccountId: metaAccountId,
              currentClientId: existingAssignment.clientId
            });
          } else {
            // Page not found in either table
            console.log(`[PAGES ASSIGN] ❌ Page ${pageId} not found in meta_social_accounts or facebook_assignments`);
            failedPages.push({
              pageId,
              clientId,
              error: `Page not found - ensure page is added to business pages first`,
              code: "PAGE_NOT_FOUND",
              timestamp: new Date().toISOString()
            });
            continue;
          }
        }

        // Validate that we have a metaAccountId (CRITICAL for foreign key constraint)
        if (!metaAccountId) {
          console.error(`[PAGES ASSIGN] ❌ Missing metaAccountId for page ${pageId} - cannot create assignment`);
          failedPages.push({
            pageId,
            clientId,
            error: `Unable to find page metadata - page may not be properly linked`,
            code: "MISSING_META_ACCOUNT",
            timestamp: new Date().toISOString()
          });
          continue;
        }

        // Create or update assignment record in FacebookAssignment
        const existingAssignment = await FacebookAssignment.findOne({
          where: {
            companyId: companyId,
            pageId: pageId
          },
          raw: true
        });

        let created = false;

        if (existingAssignment) {
          // Update existing assignment with new client
          await FacebookAssignment.update(
            {
              clientId: clientId,
              clientName: clientFullName,
              clientEmail: clientEmail,
              facebookPageName: pageName,
              facebookPageCategory: pageCategory,
              isSaved: true,
              assignedAt: new Date(),
              updatedAt: new Date(),
            },
            {
              where: {
                companyId: companyId,
                pageId: pageId
              }
            }
          );
          created = false;

          console.log(`[PAGES ASSIGN] ✏️ Page ${pageId} assignment UPDATED to client ${clientId}:`, {
            oldClient: existingAssignment.clientId,
            newClient: clientId,
            clientName: clientFullName
          });
        } else {
          // Create new assignment
          await FacebookAssignment.create({
            companyId: companyId,
            pageId: pageId,
            clientId: clientId,
            metaAccountId: metaAccountId,
            facebookPageName: pageName,
            facebookPageCategory: pageCategory,
            clientName: clientFullName || clientId,
            clientEmail: clientEmail,
            isSaved: true,
            assignedAt: new Date(),
          } as any);
          created = true;

          console.log(`[PAGES ASSIGN] ✅ Page ${pageId} assignment CREATED for client ${clientId}:`, {
            clientName: clientFullName
          });
        }

        // Add to success list with full details for frontend
        assignedPages.push({
          pageId,
          pageName,
          pageCategory,
          pageSource,
          clientId,
          clientName: clientFullName,
          clientEmail: clientEmail,
          assigned: true,
          isNew: created,
          timestamp: new Date().toISOString()
        });
      } catch (pageError: any) {
        console.error(`[PAGES ASSIGN] ❌ Failed to assign page ${pageId}:`, {
          message: pageError.message,
          code: pageError.code,
          stack: pageError.stack
        });
        failedPages.push({
          pageId,
          clientId,
          error: pageError.message || "Unknown error during assignment",
          code: pageError.code || "ASSIGNMENT_FAILED",
          timestamp: new Date().toISOString()
        });
      }
    }

    console.log("[PAGES ASSIGN] Assignment complete:", {
      companyId,
      clientId,
      totalAssigned: assignedPages.length,
      totalFailed: failedPages.length
    });

    // Determine overall success status
    const overallSuccess = assignedPages.length > 0 && failedPages.length === 0;

    res.status(overallSuccess ? 200 : 207).json({
      success: overallSuccess,
      assigned: assignedPages.length,
      failed: failedPages.length,
      assignedPages,
      failedPages,
      message: failedPages.length === 0
        ? `Successfully assigned ${assignedPages.length} page(s) to client`
        : `Assigned ${assignedPages.length} page(s), ${failedPages.length} failed`,
      clientId: clientId,
      clientName: clientFullName
    });
    return;
  } catch (error: any) {
    console.error("[PAGES ASSIGN] Critical error during page assignment:", {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: error.message || "Failed to assign pages to client",
      code: "INTERNAL_SERVER_ERROR",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
    return;
  }
});

/**
 * GET /pages/debug/:pageId
 * DEBUG ENDPOINT: Check if page exists in database
 * Used for troubleshooting why assignment fails
 * 
 * Query Params:
 *   - companyId: string (required)
 *   - pageId: string (required)
 * 
 * Returns: { exists, inMetaSocialAccount, inFacebookAssignment, details }
 */
router.get(["/pages/debug/:pageId", "/api/pages/debug/:pageId"], async (req: Request, res: Response): Promise<void> => {
  try {
    const { pageId } = req.params;
    const { companyId } = req.query as any;

    if (!companyId) {
      res.status(400).json({ success: false, error: "companyId is required" });
      return;
    }

    console.log("[DEBUG PAGE] Checking page existence:", { companyId, pageId });

    // Check in MetaSocialAccount
    const inMeta = await MetaSocialAccount.findOne({
      where: {
        companyId: companyId,
        platform: "facebook",
        facebookPageId: pageId
      },
      raw: true
    });

    // Check in FacebookAssignment
    const inAssignment = await FacebookAssignment.findOne({
      where: {
        companyId: companyId,
        pageId: pageId
      },
      raw: true
    });

    res.status(200).json({
      success: true,
      pageId,
      companyId,
      exists: !!inMeta || !!inAssignment,
      inMetaSocialAccount: !!inMeta,
      inFacebookAssignment: !!inAssignment,
      metaDetails: inMeta ? { id: inMeta.id, name: inMeta.accountName } : null,
      assignmentDetails: inAssignment ? { id: inAssignment.id, name: inAssignment.facebookPageName, clientId: inAssignment.clientId } : null,
      message: inMeta || inAssignment ? "Page found in database" : "⚠️ Page NOT found - needs to be saved first!"
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /pages/get-assignment
 * GET /api/pages/get-assignment
 * 
 * Fetch current assignment for a specific page
 * Used when clicking Edit to pre-fill modal with current client
 * 
 * Query Params:
 *   - companyId: string (required)
 *   - pageId: string (required)
 * 
 * Example:
 *   GET http://localhost:9005/facebook/pages/get-assignment?companyId=xxx&pageId=yyy
 */

router.get(["/pages/get-assignment", "/api/pages/get-assignment"], async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId, pageId } = req.query;

    // Validation
    if (!companyId || typeof companyId !== 'string') {
      res.status(400).json({
        success: false,
        error: "companyId is required and must be a string",
        code: "INVALID_COMPANY_ID"
      });
      return;
    }

    if (!pageId || typeof pageId !== 'string') {
      res.status(400).json({
        success: false,
        error: "pageId is required and must be a string",
        code: "INVALID_PAGE_ID"
      });
      return;
    }

    console.log("[GET ASSIGNMENT] Fetching assignment:", { companyId, pageId });

    // Search in FacebookAssignment table
    const assignment = await FacebookAssignment.findOne({
      where: {
        companyId: companyId,
        pageId: pageId
      },
      raw: true
    });

    if (!assignment) {
      console.log("[GET ASSIGNMENT] No assignment found for page:", pageId);
      res.status(404).json({
        success: false,
        error: "Page not assigned to any client",
        code: "NOT_FOUND"
      });
      return;
    }

    console.log("[GET ASSIGNMENT] Assignment found:", {
      clientId: assignment.clientId,
      clientName: assignment.clientName,
      pageId: pageId
    });

    res.status(200).json({
      success: true,
      pageId: assignment.pageId,
      pageName: assignment.facebookPageName,
      pageCategory: assignment.facebookPageCategory,
      currentClientId: assignment.clientId,
      currentClientName: assignment.clientName,
      currentClientEmail: assignment.clientEmail,
      assignedAt: assignment.assignedAt,
      metaAccountId: assignment.metaAccountId
    });
    return;
  } catch (error: any) {
    console.error("[GET ASSIGNMENT] Error:", error.message);
    res.status(500).json({
      success: false,
      message: error.message,
      code: "INTERNAL_SERVER_ERROR"
    });
    return;
  }
});

/**
 * PUT /pages/update-client-assignment
 * PUT /api/pages/update-client-assignment
 * 
 * Update the client assignment for a page WITHOUT reassigning the page
 * Used when editing - simply changes which client the page is assigned to
 * 
 * Body:
 *   - companyId: string (required)
 *   - pageId: string (required)
 *   - newClientId: string (required) - the NEW client to assign to
 *   - oldClientId?: string (optional) - for validation
 * 
 * Example:
 *   PUT http://localhost:9005/facebook/pages/update-client-assignment
 *   {
 *     "companyId": "company-uuid",
 *     "pageId": "123456789",
 *     "newClientId": "new-client-uuid",
 *     "oldClientId": "old-client-uuid"
 *   }
 */

router.put(["/pages/update-client-assignment", "/api/pages/update-client-assignment"], async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId, pageId, newClientId, oldClientId } = req.body;

    // Validation
    if (!companyId) {
      res.status(400).json({
        success: false,
        error: "companyId is required",
        code: "MISSING_COMPANY_ID"
      });
      return;
    }

    if (!pageId) {
      res.status(400).json({
        success: false,
        error: "pageId is required",
        code: "MISSING_PAGE_ID"
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

    console.log("[UPDATE ASSIGNMENT] Starting update:", {
      companyId,
      pageId,
      oldClientId,
      newClientId
    });

    // Find current assignment
    const currentAssignment = await FacebookAssignment.findOne({
      where: {
        companyId: companyId,
        pageId: pageId
      },
      raw: true
    });

    if (!currentAssignment) {
      console.log("[UPDATE ASSIGNMENT] Assignment not found:", { companyId, pageId });
      res.status(404).json({
        success: false,
        error: "Page assignment not found",
        code: "ASSIGNMENT_NOT_FOUND"
      });
      return;
    }

    // Optional: Verify oldClientId matches (for extra validation)
    if (oldClientId && currentAssignment.clientId !== oldClientId) {
      console.log("[UPDATE ASSIGNMENT] Old client ID mismatch:", {
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

    // Fetch new client to get their details
    const newClient = await Clients.findOne({
      where: { id: newClientId, companyId: companyId },
      raw: true
    });

    if (!newClient) {
      console.log("[UPDATE ASSIGNMENT] New client not found:", { newClientId, companyId });
      res.status(404).json({
        success: false,
        error: `Client ${newClientId} not found`,
        code: "NEW_CLIENT_NOT_FOUND"
      });
      return;
    }

    const newClientName = `${newClient.clientfirstName || ""} ${newClient.clientLastName || ""}`.trim();
    const newClientEmail = newClient.businessEmail || "unknown@email.com";

    console.log("[UPDATE ASSIGNMENT] New client verified:", {
      newClientId,
      newClientName,
      newClientEmail
    });

    // Update the assignment
    await FacebookAssignment.update(
      {
        clientId: newClientId,
        clientName: newClientName,
        clientEmail: newClientEmail,
        updatedAt: new Date()
      },
      {
        where: {
          companyId: companyId,
          pageId: pageId
        }
      }
    );

    console.log("[UPDATE ASSIGNMENT] Assignment updated successfully:", {
      pageId,
      oldClientId: currentAssignment.clientId,
      newClientId: newClientId,
      oldClientName: currentAssignment.clientName,
      newClientName: newClientName
    });

    res.status(200).json({
      success: true,
      pageId: pageId,
      pageName: currentAssignment.facebookPageName,
      oldClientId: currentAssignment.clientId,
      oldClientName: currentAssignment.clientName,
      newClientId: newClientId,
      newClientName: newClientName,
      message: "Assignment updated successfully",
      updatedAt: new Date().toISOString()
    });
    return;
  } catch (error: any) {
    console.error("[UPDATE ASSIGNMENT] Error:", error.message);
    res.status(500).json({
      success: false,
      message: error.message,
      code: "INTERNAL_SERVER_ERROR"
    });
    return;
  }
});

/**
 * POST /pages/save-and-assign
 * POST /api/pages/save-and-assign
 * 
 * HELPER ENDPOINT: Save a page to FacebookAssignment table and assign it to a client
 * Used when a page exists in Facebook but hasn't been saved to the database yet
 * 
 * Body:
 *   - companyId: string (required)
 *   - pageId: string (required)
 *   - pageName: string (optional) - Facebook page name
 *   - pageCategory: string (optional) - Facebook page category
 *   - clientId: string (required) - Client ID to assign to
 * 
 * Returns: { success, message, assignment }
 */
router.post(["/pages/save-and-assign", "/api/pages/save-and-assign"], async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId, pageId, pageName, pageCategory, clientId } = req.body;

    // Validation
    if (!companyId || !pageId || !clientId) {
      res.status(400).json({
        success: false,
        error: "companyId, pageId, and clientId are required",
        code: "MISSING_FIELDS"
      });
      return;
    }

    console.log("[SAVE AND ASSIGN] Saving and assigning page:", {
      companyId,
      pageId,
      pageName,
      clientId
    });

    // Fetch client details
    const client = await Clients.findOne({
      where: { id: clientId, companyId: companyId },
      raw: true
    });

    if (!client) {
      res.status(404).json({
        success: false,
        error: `Client ${clientId} not found`,
        code: "CLIENT_NOT_FOUND"
      });
      return;
    }

    const clientName = `${client.clientfirstName || ""} ${client.clientLastName || ""}`.trim();
    const clientEmail = client.businessEmail || "unknown@email.com";

    // Create or update assignment
    const [assignment, created] = await FacebookAssignment.findOrCreate({
      where: {
        companyId: companyId,
        pageId: pageId
      },
      defaults: {
        companyId: companyId,
        pageId: pageId,
        clientId: clientId,
        facebookPageName: pageName || `Page ${pageId}`,
        facebookPageCategory: pageCategory || "Facebook Page",
        clientName: clientName,
        clientEmail: clientEmail,
        isSaved: true,
        assignedAt: new Date()
      } as any
    });

    // If exists, update
    if (!created) {
      await assignment.update({
        clientId: clientId,
        clientName: clientName,
        clientEmail: clientEmail,
        facebookPageName: pageName || assignment.facebookPageName,
        facebookPageCategory: pageCategory || assignment.facebookPageCategory,
        isSaved: true,
        assignedAt: new Date(),
        updatedAt: new Date()
      });
    }

    console.log("[SAVE AND ASSIGN] Page saved and assigned successfully");

    res.status(201).json({
      success: true,
      message: "Page saved and assigned successfully",
      assignment: {
        pageId: assignment.pageId,
        pageName: assignment.facebookPageName,
        clientId: assignment.clientId,
        clientName: assignment.clientName,
        isNew: created
      }
    });
    return;
  } catch (error: any) {
    console.error("[SAVE AND ASSIGN] Error:", error.message);
    res.status(500).json({
      success: false,
      message: error.message,
      code: "INTERNAL_SERVER_ERROR"
    });
    return;
  }
});

/**
 * POST /social/post/facebook
 * Purpose: Create a new post on a specific Facebook page
 * Body:
 *   - facebookPageId (required): Facebook page ID
 *   - userAccessToken (required): User access token with permission to post
 *   - message (required): Message text to post
 *   - imageUrl (optional): Image URL to include in the post
 * Returns: { success, postId, response }
 */
router.post("/social/post/facebook", async (req: Request, res: Response): Promise<void> => {
  try {
    const { facebookPageId, userAccessToken, message, imageUrl } = req.body;

    if (!facebookPageId || !userAccessToken || !message) {
      res.status(400).json({
        success: false,
        message: "facebookPageId, userAccessToken, and message are required"
      });
      return;
    }

    const createPostUrl = `https://graph.facebook.com/v19.0/${facebookPageId}/feed`;

    const postRes = await axios.post(createPostUrl, {
      message: message,
      picture: imageUrl || undefined,
      access_token: userAccessToken
    });

    res.json({
      success: true,
      platform: "facebook",
      postId: postRes.data.id,
      response: postRes.data
    });
    return;
  } catch (error: any) {
    console.error("Facebook Post Error:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      platform: "facebook",
      error: error.response?.data || error.message
    });
    return;
  }
});

/**
 *  GET /facebook/pages/save
 * Purpose: Fetch saved Facebook pages for the configuration panel
 * Params: companyId (required, query)
 * Returns: { success, data: [ { pageId, pageName, category } ] }
 */
router.get("/fetchPages/save", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.query.companyId as string; // Explicitly cast to string

    if (!companyId) {
      res.status(400).json({ success: false, message: "companyId is required" });
      return;
    }

    // Fetch pages with Page Admin Access
    const adminAccessPages = await FacebookAssignment.findAll({
      where: {
        companyId,
        isSaved: true // Ensure only saved pages are fetched
      },
      attributes: [
        "pageId",
        "facebookPageName",
        "facebookPageCategory",
        "createdAt"
      ]
    });

    // Fetch pages with Business Manager Access
    const businessManagerPages = await MetaSocialAccount.findAll({
      where: {
        companyId,
        platform: "facebook",
        isAdded: true // Ensure only added pages are fetched
      },
      attributes: [
        "facebookPageId",
        "accountName",
        "pageAccessToken",
        "facebookUserId",
        "createdAt"
      ]
    });

    // Transform admin access pages to frontend format
    const transformedAdminPages = adminAccessPages.map((page: any) => ({
      id: page.pageId,
      name: page.facebookPageName,
      category: page.facebookPageCategory,
      created: page.createdAt || new Date().toISOString()
    }));

    // Transform business manager pages to frontend format
    const transformedBusinessPages = businessManagerPages.map((page: any) => ({
      id: page.facebookPageId,
      name: page.accountName,
      access_token: page.pageAccessToken,
      userId: page.facebookUserId,
      created: page.createdAt || new Date().toISOString()
    }));

    res.status(200).json({
      success: true,
      adminAccessPages: transformedAdminPages,
      businessManagerPages: transformedBusinessPages,
      count: transformedAdminPages.length + transformedBusinessPages.length,
      message: "Pages fetched successfully"
    });
  } catch (error: any) {
    console.error("Error fetching pages:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to fetch pages" });
  }
});

/**
 * POST /facebook/switch-account
 * Purpose: Switch Facebook account - Clear old tokens and prepare for new connection
 * Params: companyId (required, query or body)
 * Returns: { success, message, authUrl }
 * 
 * Flow:
 * 1. Clear old Facebook tokens from SocialToken table
 * 2. Clear selected pages from meta_social_accounts table
 * 3. Generate new OAuth URL for new account
 * 4. Return authUrl for frontend to redirect to
 */
router.post('/switch-account', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = (req.query.companyId as string) || (req.body.companyId as string);

    if (!companyId) {
      console.log("[FACEBOOK SWITCH] Missing companyId parameter");
      res.status(400).json({
        success: false,
        message: "companyId is required",
        code: "MISSING_COMPANY_ID"
      });
      return;
    }

    console.log("[FACEBOOK SWITCH] Starting account switch process for company:", companyId);

    // Step 1: Get current Facebook token info before deletion
    const oldToken = await SocialToken.findOne({
      where: {
        companyId: companyId,
        provider: 'facebook'
      },
      raw: true
    });

    if (oldToken) {
      console.log("[FACEBOOK SWITCH] Found old token to replace:", {
        accountEmail: oldToken.accountEmail,
        accountId: oldToken.accountId
      });
    }

    // Step 2: Delete old Facebook user token from SocialToken table
    const tokenDeleteResult = await SocialToken.destroy({
      where: {
        companyId: companyId,
        provider: 'facebook'
      }
    });

    console.log("[FACEBOOK SWITCH] Deleted old tokens:", {
      count: tokenDeleteResult,
      companyId
    });

    // Step 3: Delete selected pages from meta_social_accounts for this company
    // This clears the page selections so user can select new pages from new account
    const pagesDeleteResult = await MetaSocialAccount.destroy({
      where: {
        companyId: companyId,
        platform: 'facebook'
      }
    });

    console.log("[FACEBOOK SWITCH] Cleared selected pages:", {
      count: pagesDeleteResult,
      companyId
    });

    // Step 4: Also clear page assignments if needed (optional - based on your business logic)
    // You might want to keep assignments and just clear the tokens
    // Comment out this section if you want to preserve assignments
    const assignmentDeleteResult = await FacebookAssignment.destroy({
      where: {
        companyId: companyId,
        // Add specific condition if you don't want to delete all assignments
      }
    });

    console.log("[FACEBOOK SWITCH] Cleared page assignments:", {
      count: assignmentDeleteResult,
      companyId
    });

    // Step 5: Generate new OAuth URL for the same company
    const state = Buffer.from(JSON.stringify({ companyId })).toString('base64');

    const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?` +
      `client_id=${process.env.FACEBOOK_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(process.env.FACEBOOK_REDIRECT_URI || `http://localhost:9005/facebook/oauth2callback`)}` +
      `&scope=${encodeURIComponent(process.env.FACEBOOK_SCOPES || 'email,public_profile,pages_show_list,pages_read_engagement,pages_manage_posts')}` +
      `&state=${state}` +
      `&auth_type=rerequest`; // Force re-authentication to allow account switch

    console.log("[FACEBOOK SWITCH] Generated new OAuth URL for switch:", {
      companyId,
      state
    });

    // Step 6: Return success with auth URL
    res.status(200).json({
      success: true,
      message: "Old account disconnected. Ready to connect new account.",
      companyId: companyId,
      authUrl: authUrl,
      cleared: {
        oldTokens: tokenDeleteResult,
        selectedPages: pagesDeleteResult,
        pageAssignments: assignmentDeleteResult
      },
      nextStep: "Redirect user to authUrl to connect new Facebook account"
    });
    return;
  } catch (error: any) {
    console.error("[FACEBOOK SWITCH] Error during account switch:", {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: error.message || "Failed to switch Facebook account",
      code: "SWITCH_FAILED"
    });
    return;
  }
});

/**
 * GET /facebook/switch-account/info
 * Purpose: Get info about current Facebook account for display in UI
 * Params: companyId (required, query)
 * Returns: { success, currentAccount: { name, email, picture }, canSwitch }
 */
router.get('/switch-account/info', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.query.companyId as string;

    if (!companyId) {
      res.status(400).json({
        success: false,
        message: "companyId is required"
      });
      return;
    }

    console.log("[FACEBOOK SWITCH INFO] Getting account info for company:", companyId);

    // Get current token
    const token = await SocialToken.findOne({
      where: {
        companyId: companyId,
        provider: 'facebook'
      },
      raw: true
    });

    if (!token) {
      console.log("[FACEBOOK SWITCH INFO] No Facebook connection found");
      res.status(200).json({
        success: true,
        currentAccount: null,
        canSwitch: false,
        message: "No Facebook account connected"
      });
      return;
    }

    // Get user profile with picture
    try {
      const userInfo = await axios.get('https://graph.facebook.com/me?fields=id,name,email,picture.type(large)', {
        headers: { Authorization: `Bearer ${token.accessToken}` }
      });

      res.status(200).json({
        success: true,
        currentAccount: {
          id: userInfo.data.id,
          name: userInfo.data.name || 'Unknown User',
          email: userInfo.data.email || token.accountEmail || 'No email',
          picture: userInfo.data.picture?.data?.url || null
        },
        canSwitch: true,
        message: "Current account retrieved successfully"
      });
      return;
    } catch (apiError: any) {
      console.warn("[FACEBOOK SWITCH INFO] Failed to fetch user info from API, using stored data:", apiError.message);

      res.status(200).json({
        success: true,
        currentAccount: {
          id: token.accountId,
          name: 'Unknown User',
          email: token.accountEmail || 'No email',
          picture: null
        },
        canSwitch: true,
        message: "Account info retrieved from database"
      });
      return;
    }
  } catch (error: any) {
    console.error("[FACEBOOK SWITCH INFO] Error getting account info:", {
      message: error.message
    });
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get account info",
      code: "INFO_FETCH_FAILED"
    });
    return;
  }
});

/**
 * POST /facebook/switch-account/clear-all
 * Purpose: HARD RESET - Clear all Facebook data for company (including assignments)
 * Params: companyId (required, body or query)
 * Returns: { success, message, cleared }
 * WARNING: This deletes all related data - use with caution!
 */
router.post('/switch-account/clear-all', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = (req.query.companyId as string) || (req.body.companyId as string);

    if (!companyId) {
      res.status(400).json({
        success: false,
        message: "companyId is required"
      });
      return;
    }

    console.log("[FACEBOOK SWITCH CLEAR ALL] Starting complete reset for company:", companyId);

    // Delete tokens
    const tokenDeleted = await SocialToken.destroy({
      where: {
        companyId: companyId,
        provider: 'facebook'
      }
    });

    // Delete meta_social_accounts
    const metaDeleted = await MetaSocialAccount.destroy({
      where: {
        companyId: companyId,
        platform: 'facebook'
      }
    });

    // Delete assignments
    const assignmentsDeleted = await FacebookAssignment.destroy({
      where: {
        companyId: companyId
      }
    });

    console.log("[FACEBOOK SWITCH CLEAR ALL] Complete reset performed:", {
      tokensDeleted: tokenDeleted,
      pagesDeleted: metaDeleted,
      assignmentsDeleted: assignmentsDeleted,
      companyId
    });

    res.status(200).json({
      success: true,
      message: "All Facebook data cleared for company",
      cleared: {
        tokens: tokenDeleted,
        pages: metaDeleted,
        assignments: assignmentsDeleted
      },
      warning: "All Facebook connections and data have been removed"
    });
    return;
  } catch (error: any) {
    console.error("[FACEBOOK SWITCH CLEAR ALL] Error during reset:", {
      message: error.message
    });
    res.status(500).json({
      success: false,
      message: error.message || "Failed to clear Facebook data",
      code: "CLEAR_ALL_FAILED"
    });
    return;
  }
});

module.exports = router;

