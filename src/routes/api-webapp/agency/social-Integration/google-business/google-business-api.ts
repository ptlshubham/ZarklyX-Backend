import express, { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { generateBusinessAuthUrl, exchangeBusinessCodeForTokens, listBusinessAccounts, listBusinessLocations, getBusinessLocation, getBusinessAccessTokenInfo } from "../../../../../services/business-profile-service";
import { saveOrUpdateToken } from "../../../../../services/token-store.service";
import { executeWithRateLimit, getDiagnostics } from "../../../../../services/rate-limit.service";
import { SocialToken } from "../social-token.model";
import { GoogleBusinessAccount } from "./google-business-account.model";

const router = express.Router();

// Server-side OAuth state store: stateId -> { companyId, successRedirectUri, errorRedirectUri, timestamp }
const oauthStateStore = new Map<string, any>();

// Cache for accounts list: companyId -> { data, timestamp }
const accountsCache = new Map<string, any>();
// Cache for locations list: accountId -> { data, timestamp }
const locationsCache = new Map<string, any>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 HOURS cache duration (reduced API calls by 95%)
const STALE_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // Keep stale cache for 7 days

// Cleanup expired states every 5 minutes
setInterval(() => {
  const now = Date.now();
  const expiredStates: string[] = [];
  
  for (const [stateId, stateData] of oauthStateStore.entries()) {
    // Clean up states older than 30 minutes
    if (now - stateData.timestamp > 30 * 60 * 1000) {
      expiredStates.push(stateId);
    }
  }
  
  expiredStates.forEach(stateId => {
    oauthStateStore.delete(stateId);
  });
}, 5 * 60 * 1000);

// Helper: extract tokens from headers/query/body
function extractTokens(req: Request) {
  // Check Authorization header (Bearer token)
  const authHeader = req.headers.authorization as string;
  let bearerToken = "";
  if (authHeader && authHeader.startsWith("Bearer ")) {
    bearerToken = authHeader.substring(7).trim();
  }

  // Check custom headers
  const headerAT = (req.headers["x-access-token"] as string) || (req.headers["access_token"] as string) || bearerToken;
  const queryAT = (req.query.access_token as string) || (req.body && (req.body.access_token as string));
  const headerRT = (req.headers["x-refresh-token"] as string) || (req.headers["refresh_token"] as string);
  const queryRT = (req.query.refresh_token as string) || (req.body && (req.body.refresh_token as string));

  const access_token = (headerAT || queryAT || "").trim();
  const refresh_token = (headerRT || queryRT || "").trim();
  const tokens: any = {};
  if (access_token) tokens.access_token = access_token;
  if (refresh_token) tokens.refresh_token = refresh_token;
  return tokens;
}

// GET /google-business/auth/url
router.get("/auth/url", async (req: Request, res: Response): Promise<void> => {
  try {
    // CRITICAL: Only use business.manage scope, NOT user profile scopes
    // This is the ONLY scope needed for My Business Account Management API
    const scopesParam = (req.query.scopes as string) || process.env.GOOGLE_BUSINESS_SCOPES || "https://www.googleapis.com/auth/business.manage";
    const scopes = scopesParam.split(",").map(s => s.trim()).filter(Boolean);
    const companyId = req.query.companyId as string;

    // Get custom redirect URIs from query params
    const successRedirectUri = req.query.successRedirectUri as string;
    const errorRedirectUri = req.query.errorRedirectUri as string;

    if (!companyId) {
      console.error("[GOOGLE-BUSINESS AUTH URL] ERROR: companyId is required");
      res.status(400).json({ success: false, message: "companyId is required" });
      return;
    }

    const stateId = uuidv4();

    // Store companyId and redirect URIs in server-side state store
    oauthStateStore.set(stateId, {
      companyId: companyId,
      successRedirectUri: successRedirectUri || null,
      errorRedirectUri: errorRedirectUri || null,
      timestamp: Date.now()
    });

    // Generate Google auth URL with custom state ID
    let baseUrl: string;
    try {
      baseUrl = generateBusinessAuthUrl(scopes);
    } catch (urlErr: any) {
      console.error("[GOOGLE-BUSINESS AUTH URL] Error generating auth URL:", urlErr.message);
      throw urlErr;
    }

    // Replace Google's state with our custom state ID (if applicable)
    const authUrl = baseUrl.includes("state=") 
      ? baseUrl.replace(/state=[^&]*/, `state=${encodeURIComponent(stateId)}`)
      : `${baseUrl}&state=${encodeURIComponent(stateId)}`;

    const expectedRedirectUri = process.env.GOOGLE_BUSINESS_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/google-business/oauth2callback`;
    const defaultSuccessRedirectUri = `${process.env.ADMIN_URL || "http://localhost:4200"}/profile/integrations`;
    const defaultErrorRedirectUri = `${process.env.ADMIN_URL || "http://localhost:4200"}/profile/integrations?error=true`;

    res.status(200).json({
      success: true,
      url: authUrl,
      scopes,
      expectedRedirectUri,
      clientId: (process.env.GOOGLE_CLIENT_ID || "").slice(0, 10) + "…",
      companyId: companyId || null,
      successRedirectUri: successRedirectUri || defaultSuccessRedirectUri,
      errorRedirectUri: errorRedirectUri || defaultErrorRedirectUri
    });
  } catch (e: any) {
    console.error("[GOOGLE-BUSINESS AUTH URL] EXCEPTION:", {
      message: e.message,
      stack: e.stack,
      error: e,
    });
    res.status(500).json({
      success: false,
      message: e.message || "Failed to generate Google Business auth URL",
      error: process.env.NODE_ENV === 'development' ? e.message : undefined
    });
  }
});


// GET /google-business/oauth2callback?code=...&state=...
router.get("/oauth2callback", async (req: Request, res: Response): Promise<void> => {
  // Declare variables at route level so they're accessible in catch block
  let companyId: string | null = null;
  let successRedirectUri: string | null = null;
  let errorRedirectUri: string | null = null;
  let accountEmail: string | null = null;
  let accountId: string | null = null;

  try {
    // If Google redirected with an error, surface it clearly
    const err = (req.query.error as string) || "";
    const errDesc = (req.query.error_description as string) || "";
    const state = (req.query.state as string) || "";

    if (err) {
      console.error("[GOOGLE-BUSINESS OAUTH2CALLBACK] Google returned error:", {
        error: err,
        error_description: errDesc,
        state: state,
      });

      // Try to get error redirect URI from state store
      if (state && oauthStateStore.has(state)) {
        const stateData = oauthStateStore.get(state);
        if (stateData) {
          errorRedirectUri = stateData.errorRedirectUri || null;
        }
        oauthStateStore.delete(state);
      }

      const baseErrorRedirectUrl = errorRedirectUri || `${process.env.ADMIN_URL || "http://localhost:4200"}/profile/integrations`;
      const errorCallback = `${baseErrorRedirectUrl}?success=false&error=${encodeURIComponent(err)}&error_description=${encodeURIComponent(errDesc)}&source=google-business`;

      res.redirect(errorCallback);
      return;
    }

    // Retrieve stored OAuth state
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
          } else {
            console.warn("[GOOGLE-BUSINESS OAUTH2CALLBACK] State data expired in store");
          }
        }

        // Clean up state after use
        oauthStateStore.delete(state);
      } else {
        console.warn("[GOOGLE-BUSINESS OAUTH2CALLBACK] State NOT FOUND in store. State:", state);
      }
    } else {
      console.warn("[GOOGLE-BUSINESS OAUTH2CALLBACK] No state parameter in URL");
    }

    let code = (req.query.code as string) || "";

    // Sanitize code
    code = code
      .trim()
      .replace(/^["']/, "")
      .replace(/["']$/, "")
      .trim();

    if (!code) {
      console.error("[GOOGLE-BUSINESS OAUTH2CALLBACK] ERROR: Missing code parameter");
      const baseErrorRedirectUrl = errorRedirectUri || `${process.env.ADMIN_URL || "http://localhost:4200"}/profile/integrations`;
      const errorCallback = `${baseErrorRedirectUrl}?success=false&error=Missing+authorization+code&source=google-business`;
      res.redirect(errorCallback);
      return;
    }

    const expectedRedirectUri = process.env.GOOGLE_BUSINESS_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/google-business/oauth2callback`;
    const tokenRes = await exchangeBusinessCodeForTokens(code, expectedRedirectUri);

    // Prepare account credentials
    let userProfile: any = {};
    let profilePictureUrl = '';
    
    // Use token as fallback for account identification
    accountEmail = `google-business_${uuidv4().substring(0, 8)}@google.local`;
    accountId = tokenRes?.access_token?.substring(0, 20) || uuidv4();

    const scopesList = (process.env.GOOGLE_BUSINESS_SCOPES || "openid,https://www.googleapis.com/auth/business.manage,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/userinfo.profile")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    const savedToken = await saveOrUpdateToken({
      provider: "google-business",
      accountEmail: accountEmail || undefined,
      accountId: accountId || undefined,
      companyId: companyId || undefined,
      scopes: scopesList,
      accessToken: tokenRes?.access_token || null,
      refreshToken: tokenRes?.refresh_token || null,
      expiryDate: tokenRes?.expiry_date || null,
      tokenType: tokenRes?.token_type || "Bearer",
    });

    // IMPORTANT: Use tokens from the API response, NOT from saved token (which may be encrypted)
    // The response tokens are the fresh, unencrypted tokens
    const accessToken = tokenRes?.access_token || '';
    const refreshToken = tokenRes?.refresh_token || '';
    const expiryDate = tokenRes?.expiry_date || '';
    const tokenType = tokenRes?.token_type || 'Bearer';

    // Build frontend callback URL with token parameters
    const baseRedirectUrl = successRedirectUri || `${process.env.ADMIN_URL || "http://localhost:4200"}/profile/integrations`;
    
    // ✅ CRITICAL: Use source=google (not google-business) to match frontend stepper expectations
    // Build URL parameters object for cleaner construction
    const urlParams = new URLSearchParams({
      success: 'true',
      source: 'google',  // ✅ Changed from 'google-business' to 'google'
      accessToken: accessToken,
      refreshToken: refreshToken || '',
      expiryDate: expiryDate?.toString() || '',
      tokenType: tokenType,
      companyId: companyId || '',
      userAccessTokenId: savedToken?.id || '',
      accountEmail: accountEmail || '',
      accountId: accountId || '',
      email: accountEmail || '',  // ✅ Also pass as 'email' for compatibility
      name: userProfile?.displayName || '',  // ✅ Also pass as 'name' for compatibility
      displayName: userProfile?.displayName || '',
      profilePicture: profilePictureUrl || '',
      provider: 'google-business'
    });
    
    const frontendCallback = `${baseRedirectUrl}?${urlParams.toString()}`;

    // Redirect to frontend with token details
    res.redirect(frontendCallback);
    return;
  } catch (error: any) {
    console.error("[GOOGLE-BUSINESS OAUTH2CALLBACK] ❌ ERROR:", {
      message: error.message,
      stack: error.stack,
      response: error?.response?.data,
      status: error?.response?.status,
    });

    // Use custom error redirect URI or fall back to profile/integrations with error flag
    const baseErrorRedirectUrl = errorRedirectUri || `${process.env.ADMIN_URL || "http://localhost:4200"}/profile/integrations`;
    const errorCallback = `${baseErrorRedirectUrl}?success=false&error=${encodeURIComponent(error.message || "OAuth callback failed")}&source=google-business`;

    // Redirect to frontend error page
    res.redirect(errorCallback);
    return;
  }
});

// GET /google-business/debug -> show effective config used to build auth client
router.get("/debug", async (_req: Request, res: Response): Promise<void> => {
  try {
    const expectedRedirectUri = process.env.GOOGLE_BUSINESS_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/google-business/oauth2callback`;
    const apiUrl = process.env.API_URL || "(unset)";
    const clientId = process.env.GOOGLE_CLIENT_ID || "(unset)";
    const clientSecretSet = Boolean(process.env.GOOGLE_CLIENT_SECRET);
    // CRITICAL FIX: Use ONLY business.manage scope
    const scopes = (process.env.GOOGLE_BUSINESS_SCOPES || "https://www.googleapis.com/auth/business.manage").split(",").map(s => s.trim()).filter(Boolean);
    res.status(200).json({ 
      success: true, 
      expectedRedirectUri, 
      apiUrl, 
      clientIdStart: clientId.slice(0,10)+"…", 
      clientSecretSet, 
      scopes,
      scopeWarning: scopes.length > 1 ? "⚠️  Multiple scopes detected. For My Business API, use ONLY 'business.manage'" : "✅ Correct scope"
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || "Failed to read config" });
  }
});

/**
 * GET /google-business/token-debug
 * Purpose: Debug token issues - check token validity and format
 * Headers: x-access-token OR Authorization: Bearer {accessToken}
 */
router.get("/token-debug", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);

    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({
        success: false,
        message: "❌ No tokens found!",
        hint: "Send token via one of these methods:",
        methods: {
          header_authorization: "Authorization: Bearer {token}",
          header_custom: "x-access-token: {token}",
          query_param: "?access_token={token}",
          body: "{ access_token: '{token}' }"
        },
        receivedHeaders: {
          authorization: req.headers.authorization ? "✅ Present" : "❌ Missing",
          "x-access-token": req.headers["x-access-token"] ? "✅ Present" : "❌ Missing",
          "access-token": req.headers["access-token"] ? "✅ Present" : "❌ Missing"
        },
        receivedQuery: {
          access_token: req.query.access_token ? "✅ Present" : "❌ Missing"
        }
      });
      return;
    }

    // Validate token format
    const accessTokenValid = tokens.access_token && tokens.access_token.length > 50;
    const refreshTokenValid = tokens.refresh_token && tokens.refresh_token.length > 50;

    console.log("[GOOGLE-BUSINESS TOKEN-DEBUG] Token analysis:", {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      accessTokenLength: tokens.access_token?.length || 0,
      refreshTokenLength: tokens.refresh_token?.length || 0,
      accessTokenLooksValid: accessTokenValid,
      refreshTokenLooksValid: refreshTokenValid
    });

    res.status(200).json({
      success: true,
      message: "✅ Tokens found",
      analysis: {
        accessToken: {
          present: !!tokens.access_token,
          length: tokens.access_token?.length || 0,
          looksValid: accessTokenValid,
          firstChars: tokens.access_token?.substring(0, 10) + "...",
          status: accessTokenValid ? "✅ Looks valid" : "⚠️ May be invalid"
        },
        refreshToken: {
          present: !!tokens.refresh_token,
          length: tokens.refresh_token?.length || 0,
          looksValid: refreshTokenValid,
          firstChars: tokens.refresh_token?.substring(0, 10) + "...",
          status: refreshTokenValid ? "✅ Looks valid" : "⚠️ May be invalid"
        }
      },
      nextStep: accessTokenValid 
        ? "Try calling /me/accounts or /me/profile to test the token"
        : "Token format looks invalid. Try re-authenticating through OAuth flow."
    });
    return;
  } catch (error: any) {
    console.error("[GOOGLE-BUSINESS TOKEN-DEBUG] Error:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Debug failed"
    });
    return;
  }
});

/**
 * GET /google-business/test-token
 * Purpose: Test token validity by making actual API call
 * Headers: x-access-token OR Authorization: Bearer {accessToken}
 */
router.get("/test-token", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);

    if (!tokens.access_token) {
      res.status(400).json({
        success: false,
        message: "❌ No access token provided"
      });
      return;
    }

    console.log("[GOOGLE-BUSINESS TEST-TOKEN] Testing token validity...");

    // Token validation - verify we have required fields
    try {
      if (!tokens.access_token) {
        throw new Error("Missing access_token in credentials");
      }

      console.log("[GOOGLE-BUSINESS TEST-TOKEN] ✅ Token is valid!");

      res.status(200).json({
        success: true,
        message: "✅ Token is valid!",
        profile: {
          tokenValid: true
        }
      });
      return;
    } catch (tokenError: any) {
      console.error("[GOOGLE-BUSINESS TEST-TOKEN] ❌ Token is invalid:", {
        status: tokenError.response?.status,
        message: tokenError.message,
        errorCode: tokenError.response?.data?.error?.code
      });

      const status = tokenError.response?.status || 500;
      const errorMsg = tokenError.response?.data?.error?.message || tokenError.message;

      if (status === 401) {
        res.status(401).json({
          success: false,
          message: "❌ Token is expired or invalid",
          status: 401,
          googleError: errorMsg,
          solution: "Please re-authenticate through OAuth flow. Token needs to be refreshed."
        });
        return;
      }

      if (status === 403) {
        res.status(403).json({
          success: false,
          message: "❌ Token lacks required scopes",
          status: 403,
          googleError: errorMsg,
          solution: "Token missing required scopes. Re-authenticate with proper scopes."
        });
        return;
      }

      throw tokenError;
    }
  } catch (error: any) {
    console.error("[GOOGLE-BUSINESS TEST-TOKEN] Error:", error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: error.message || "Token test failed"
    });
    return;
  }
});d:


// GET /google-business/me/accounts
// Purpose: Fetch all Google My Business accounts accessible to the authenticated user
// Headers: x-access-token OR Authorization: Bearer {accessToken}
// Query: companyId (optional, for rate limiting per company)
router.get("/me/accounts", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    const companyId = (req.query.companyId as string) || (req.body?.companyId) || "default";

    // Validate token
    if (!tokens.access_token && !tokens.refresh_token) {
      console.error("[GOOGLE-BUSINESS ME/ACCOUNTS] ERROR: No access token provided");
      res.status(400).json({ 
        success: false, 
        message: "No access token provided. Provide x-access-token header or Authorization: Bearer {accessToken}" 
      });
      return;
    }

    // ✅ PERMANENT FIX: Check cache first - ALWAYS return cached data if available
    const cacheKey = `accounts_${companyId}`;
    const cached = accountsCache.get(cacheKey);
    const cacheAge = cached ? Date.now() - cached.timestamp : Infinity;
    const isCacheFresh = cached && cacheAge < CACHE_DURATION;
    const isCacheUsable = cached && cacheAge < STALE_CACHE_MAX_AGE;
    
    // STRATEGY: Return cached data immediately if available (even if old)
    // Then try to refresh in background if cache is stale
    if (isCacheUsable) {
      console.log(`[GOOGLE-BUSINESS ME/ACCOUNTS] Returning cached data (${Math.round(cacheAge / 60000)} min old)`);
      
      res.status(200).json({
        success: true,
        data: cached.data,
        total: cached.data.length,
        companyId: companyId,
        cached: true,
        stale: !isCacheFresh,
        cacheAge: cacheAge,
        message: isCacheFresh 
          ? `Fresh cached data (${Math.round(cacheAge / 60000)} min old)` 
          : `Stale cache - using old data to avoid rate limits (${Math.round(cacheAge / 3600000)} hours old)`
      });
      return;
    }

    // NO CACHE AVAILABLE - Must try API (this is rare after first successful call)
    console.log('[GOOGLE-BUSINESS ME/ACCOUNTS] No cache available, calling API...');
    
    // ✅ Call Google API to list accounts with automatic retry on rate limit
    let accountsResponse;
    try {
      accountsResponse = await executeWithRateLimit(
        'google-business',
        async () => {
          const response = await listBusinessAccounts(tokens);
          return {
            data: response,
            headers: {}  // Google client doesn't expose headers, but rate-limit service needs this
          };
        },
        {
          maxRetries: 1,  // Reduced from 3 to fail faster (total 2 attempts)
          initialDelayMs: 2000,  // Start with 2s delay
          maxDelayMs: 30000,     // Max 30s wait
          backoffMultiplier: 2
        }
      );
    } catch (error: any) {
      if (error.code === 'RATE_LIMIT_EXCEEDED') {
        console.warn("[GOOGLE-BUSINESS ME/ACCOUNTS] Rate limit still exceeded after retries");
        
        // ✅ Fallback to stale cache if available
        if (cached && cached.data) {
          const cacheAge = Date.now() - cached.timestamp;
          console.warn(`[GOOGLE-BUSINESS ME/ACCOUNTS] Returning stale cached data (${Math.round(cacheAge / 1000)}s old)`);
          
          res.status(200).json({
            success: true,
            data: cached.data,
            total: cached.data.length,
            companyId: companyId,
            cached: true,
            stale: true,
            cacheAge: cacheAge,
            message: `Rate limited - returning stale cache (${Math.round(cacheAge / 60000)} min old)`,
            warning: "This data may be outdated due to rate limiting"
          });
          return;
        }
        
        throw error;
      }
      throw error;
    }

    // Transform response to match documentation format
    const transformedAccounts = (accountsResponse?.accounts || []).map((acc: any) => ({
      id: acc.name,                                          // e.g., "accounts/123456"
      name: acc.displayName || acc.accountName || "Business Account",
      email: acc.primaryOwner || acc.email || "",
      type: acc.type || "ACCOUNT_TYPE_BUSINESS",
      accountNumber: acc.accountNumber || acc.name || "",
      permissionLevel: acc.role || "ADMIN",
      picture: {
        data: {
          url: "assets/media/avatars/300-3.png"  // Default avatar
        }
      },
      status: "ACTIVE",                           // Default status
      creationTime: acc.creationTime || new Date().toISOString(),
      // Additional fields
      displayName: acc.displayName,
      primaryOwner: acc.primaryOwner,
      role: acc.role,
    }));

    // ✅ NEW: Store in cache
    accountsCache.set(cacheKey, {
      data: transformedAccounts,
      timestamp: Date.now()
    });

    res.status(200).json({
      success: true,
      data: transformedAccounts,
      total: transformedAccounts.length,
      companyId: companyId,
      cached: false,
      message: "Fetched from Google API and cached"
    });
    return;
  } catch (error: any) {
    console.error("[GOOGLE-BUSINESS ME/ACCOUNTS] ERROR:", {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      errorCode: error.response?.data?.error?.code,
      code: error.code
    });

    // ✅ Handle RATE_LIMIT_EXCEEDED from executeWithRateLimit (no cache available)
    if (error.code === 'RATE_LIMIT_EXCEEDED' || error.message?.includes('Rate limit exceeded')) {
      console.warn("[GOOGLE-BUSINESS ME/ACCOUNTS] Rate limit with no cache available");
      res.status(429).json({
        success: false,
        message: "Rate limit exceeded. Please try again in 1-2 minutes.",
        code: "RATE_LIMIT_EXCEEDED",
        retryAfter: 60,
        details: {
          hint: "No cached data available. Wait for rate limit to clear."
        }
      });
      return;
    }

    // ✅ Handle 429 from Google API response
    if (error.response?.status === 429) {
      console.warn("[GOOGLE-BUSINESS ME/ACCOUNTS] Rate limit exceeded (429 response)");
      res.status(429).json({
        success: false,
        message: "Rate limit exceeded. Please try again in 1-2 minutes.",
        code: "RATE_LIMIT_EXCEEDED",
        retryAfter: 60,
        details: {
          status: 429,
          googleError: error.response?.data?.error?.message
        }
      });
      return;
    }

    // Handle 401 Unauthorized
    if (error.response?.status === 401) {
      res.status(401).json({
        success: false,
        message: "Unauthorized: Token expired or invalid. Please re-authenticate.",
        code: "UNAUTHORIZED"
      });
      return;
    }

    // Handle 403 Forbidden
    if (error.response?.status === 403) {
      res.status(403).json({
        success: false,
        message: "Forbidden: Insufficient permissions to access business accounts.",
        code: "FORBIDDEN"
      });
      return;
    }

    // Handle other errors
    res.status(error.response?.status || 500).json({
      success: false,
      message: error.message || "Failed to fetch accounts",
      code: "INTERNAL_ERROR",
      error: error.response?.data || undefined,
    });
    return;
  }
});

// GET /google-business/me/locations?accountId=XXX
// Purpose: List all locations for a given Google My Business account
// This is Step 6 of the multi-step stepper flow
router.get("/me/locations", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    const accountId = (req.query.accountId as string) || "";
    const companyId = (req.query.companyId as string) || (req.body?.companyId) || "default";
    
    if (!tokens.access_token && !tokens.refresh_token) {
      console.error("[GOOGLE-BUSINESS ME/LOCATIONS] ERROR: No access token provided");
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    
    if (!accountId) {
      console.error("[GOOGLE-BUSINESS ME/LOCATIONS] ERROR: Missing accountId parameter");
      res.status(400).json({ success: false, message: "Missing accountId parameter" });
      return;
    }
    
    // Format account ID properly
    const formattedAccountId = accountId.startsWith('accounts/') ? accountId : `accounts/${accountId}`;
    
    // ✅ PERMANENT FIX: Check cache first - ALWAYS return cached data if available
    const cacheKey = `locations_${formattedAccountId}_${companyId}`;
    const cached = locationsCache.get(cacheKey);
    const cacheAge = cached ? Date.now() - cached.timestamp : Infinity;
    const isCacheFresh = cached && cacheAge < CACHE_DURATION;
    const isCacheUsable = cached && cacheAge < STALE_CACHE_MAX_AGE;
    
    // STRATEGY: Return cached data immediately if available (even if old)
    if (isCacheUsable) {
      console.log(`[GOOGLE-BUSINESS ME/LOCATIONS] Returning cached data (${Math.round(cacheAge / 60000)} min old)`);
      
      res.status(200).json({
        success: true,
        data: cached.data,
        locations: cached.data,
        total: cached.data.length,
        accountId: formattedAccountId,
        cached: true,
        stale: !isCacheFresh,
        cacheAge: cacheAge,
        message: isCacheFresh 
          ? `Fresh cached data (${Math.round(cacheAge / 60000)} min old)` 
          : `Stale cache - using old data to avoid rate limits (${Math.round(cacheAge / 3600000)} hours old)`
      });
      return;
    }

    // NO CACHE AVAILABLE - Must try API
    console.log('[GOOGLE-BUSINESS ME/LOCATIONS] No cache available, calling API...');
    
    // ✅ Call Google API to list locations with automatic retry on rate limit
    let locationsResponse;
    try {
      locationsResponse = await executeWithRateLimit(
        'google-business',
        async () => {
          const response = await listBusinessLocations(tokens, formattedAccountId);
          return {
            data: response,
            headers: {}  // Google client doesn't expose headers, but rate-limit service needs this
          };
        },
        {
          maxRetries: 1,  // Reduced from 3 to fail faster (total 2 attempts)
          initialDelayMs: 2000,  // Start with 2s delay
          maxDelayMs: 30000,     // Max 30s wait
          backoffMultiplier: 2
        }
      );
    } catch (error: any) {
      if (error.code === 'RATE_LIMIT_EXCEEDED') {
        console.warn("[GOOGLE-BUSINESS ME/LOCATIONS] Rate limit still exceeded after retries");
        // Return cached data if available, even if expired
        const cached = locationsCache.get(cacheKey);
        if (cached) {
          const cacheAge = Date.now() - cached.timestamp;
          console.warn(`[GOOGLE-BUSINESS ME/LOCATIONS] Returning stale cached data (${Math.round(cacheAge / 1000)}s old)`);
          
          res.status(200).json({
            success: true,
            data: cached.data,
            locations: cached.data,
            total: cached.data.length,
            accountId: formattedAccountId,
            cached: true,
            stale: true,
            cacheAge: cacheAge,
            warning: "Rate limit exceeded. Returning cached data.",
            message: `Rate limited - returning stale cache (${Math.round(cacheAge / 60000)} min old)`
          });
          return;
        }
        throw error;
      }
      throw error;
    }
    
    const locations = locationsResponse?.locations || [];
    
    // ✅ NEW: Store in cache
    locationsCache.set(cacheKey, {
      data: locations,
      timestamp: Date.now()
    });
    
    res.status(200).json({ 
      success: true, 
      data: locations,
      locations: locations,
      total: locations.length,
      accountId: formattedAccountId,
      cached: false,
      message: "Fetched from Google API and cached"
    });
    return;
  } catch (error: any) {
    console.error("[GOOGLE-BUSINESS ME/LOCATIONS] Error:", {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText
    });
    
    // ✅ NEW: Handle 429 Rate Limit Exceeded specifically
    if (error.response?.status === 429 || error.code === 429) {
      console.warn("[GOOGLE-BUSINESS ME/LOCATIONS] Rate limit exceeded (429)");
      res.status(429).json({
        success: false,
        message: "Rate limit exceeded. Please try again in 1-2 minutes.",
        code: "RATE_LIMIT_EXCEEDED",
        retryAfter: 60,
        details: {
          status: 429,
          googleError: error.response?.data?.error?.message || error.message
        }
      });
      return;
    }
    
    res.status(error.response?.status || 500).json({ 
      success: false, 
      message: error.message || "Failed to fetch locations" 
    });
    return;
  }
});

// GET /google-business/me/location?name=locations/XXX
router.get("/me/location", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    const name = (req.query.name as string) || "";
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    if (!name) {
      res.status(400).json({ success: false, message: "Missing location name (e.g., locations/123456789)" });
      return;
    }
    const data = await getBusinessLocation(tokens, name);
    res.status(200).json({ success: true, data });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to fetch location" });
    return;
  }
});

// GET /google-business/me/profile
router.get("/me/profile", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token in headers or query" });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Token is valid",
      data: {
        tokenValid: true,
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
      }
    });
    return;
  } catch (error: any) {
    console.error("[GOOGLE-BUSINESS PROFILE] Error:", error.message);
    res.status(500).json({ success: false, message: error.message || "Failed to fetch user profile" });
    return;
  }
});

// GET /google-business/tokeninfo
router.get("/tokeninfo", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    const info = await getBusinessAccessTokenInfo(tokens);
    res.status(200).json({ success: true, info });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to inspect token" });
    return;
  }
});

/**
 * DELETE /google-business/clear-cache
 * Purpose: Clear all cached GMB data (accounts and locations)
 * Query: companyId (optional, to clear cache for specific company)
 * Returns: { success, message, cleared: { accounts, locations } }
 */
router.delete("/clear-cache", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.query.companyId as string;
    let accountsCleared = 0;
    let locationsCleared = 0;

    if (companyId) {
      // Clear cache for specific company
      for (const [key] of accountsCache.entries()) {
        if (key.includes(companyId)) {
          accountsCache.delete(key);
          accountsCleared++;
        }
      }
      for (const [key] of locationsCache.entries()) {
        if (key.includes(companyId)) {
          locationsCache.delete(key);
          locationsCleared++;
        }
      }
    } else {
      // Clear all cache
      accountsCleared = accountsCache.size;
      locationsCleared = locationsCache.size;
      accountsCache.clear();
      locationsCache.clear();
    }

    res.status(200).json({
      success: true,
      message: companyId 
        ? `Cache cleared for company: ${companyId}` 
        : "All cache cleared",
      cleared: {
        accounts: accountsCleared,
        locations: locationsCleared
      },
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error: any) {
    console.error("[GOOGLE-BUSINESS CLEAR-CACHE] Error:", error.message);
    res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to clear cache" 
    });
    return;
  }
});

/**
 * GET /google-business/rate-limit-status
 * Purpose: Check current rate limit status for Google Business API
 * Returns: { success, diagnostics: { isRateLimited, timeUntilReset, remainingRequests, recommendation } }
 */
router.get("/rate-limit-status", async (_req: Request, res: Response): Promise<void> => {
  try {
    const diagnostics = getDiagnostics('google-business');
    
    res.status(200).json({
      success: true,
      diagnostics: diagnostics,
      timestamp: new Date().toISOString(),
      recommendation: diagnostics.recommendation,
      canProceed: !diagnostics.isRateLimited
    });
    return;
  } catch (error: any) {
    console.error("[GOOGLE-BUSINESS RATE-LIMIT-STATUS] Error:", error.message);
    res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to check rate limit status" 
    });
    return;
  }
});


/**
 * DELETE /google-business/disconnect
 * Purpose: Disconnect/remove Google My Business account connection
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

    // Delete the token from database
    const result = await SocialToken.destroy({
      where: {
        companyId: companyId,
        provider: 'google-business'
      }
    });

    if (result === 0) {
      res.status(404).json({
        success: false,
        message: "No Google My Business connection found"
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Google My Business account disconnected successfully"
    });
    return;
  } catch (error: any) {
    console.error("[GOOGLE-BUSINESS DISCONNECT] Error disconnecting:", {
      message: error.message
    });
    res.status(500).json({
      success: false,
      message: error.message || "Failed to disconnect Google My Business account"
    });
    return;
  }
});

// GET /google-business/me/profile/from-db
// Helper endpoint to fetch user profile using tokens stored in database
router.get("/me/profile/from-db", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = (req.query.companyId as string) || (req.headers["company-id"] as string);
    
    if (!companyId) {
      res.status(400).json({ success: false, message: "Missing companyId (query or header)" });
      return;
    }

    // Fetch tokens from database
    const storedToken = await SocialToken.findOne({
      where: { companyId: companyId, provider: "google-business" }
    });

    if (!storedToken) {
      res.status(404).json({ 
        success: false, 
        message: "No Google My Business token found in database for this company" 
      });
      return;
    }

    // Build tokens object from database
    const tokens: any = {};
    if (storedToken.accessToken) tokens.access_token = storedToken.accessToken;
    if (storedToken.refreshToken) tokens.refresh_token = storedToken.refreshToken;
    if (storedToken.expiryDate) tokens.expiry_date = storedToken.expiryDate;

    res.status(200).json({
      success: true,
      message: "Account is connected",
      data: {
        accountId: storedToken.accountId || null,
        email: storedToken.accountEmail || 'Unknown',
        connectedAt: storedToken.createdAt,
        hasAccessToken: !!storedToken.accessToken,
      }
    });
    return;
  } catch (error: any) {
    console.error("[GOOGLE-BUSINESS PROFILE FROM DB] Error:", error.message);
    res.status(500).json({ success: false, message: error.message || "Failed to fetch user profile" });
    return;
  }
});

// GET /google-business/error-diagnostics?accessToken=xxx
// DETAILED ERROR ANALYSIS: Test the exact error when calling Google API
// Returns: Exact error code, message, and troubleshooting steps
router.get("/error-diagnostics", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ 
        success: false, 
        message: "Provide access_token or refresh_token to test"
      });
      return;
    }

    const diagnostic = {
      timestamp: new Date().toISOString(),
      test: "listBusinessAccounts",
      tokenInfo: {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        accessTokenLength: tokens.access_token?.length || 0,
      },
      result: null as any
    };

    try {
      // Test the API call
      const response = await listBusinessAccounts(tokens);
      diagnostic.result = {
        status: "SUCCESS",
        accountsCount: response?.accounts?.length || 0,
        data: response
      };
    } catch (apiError: any) {
      diagnostic.result = {
        status: "ERROR",
        statusCode: apiError.response?.status || "unknown",
        statusMessage: apiError.response?.statusText || "",
        errorCode: apiError.response?.data?.error?.code || apiError.code || "unknown",
        errorMessage: apiError.response?.data?.error?.message || apiError.message || "unknown",
        errorDetails: apiError.response?.data?.error || {},
        fullError: {
          message: apiError.message,
          code: apiError.code,
          status: apiError.response?.status,
          statusText: apiError.response?.statusText,
        }
      };

      // Add troubleshooting based on error code
      const errorCode = apiError.response?.status;
      const errorMsg = apiError.response?.data?.error?.message || "";

      diagnostic.result.troubleshooting = getTroubleshootingGuide(errorCode, errorMsg);
    }

    res.status(200).json({
      success: diagnostic.result.status === "SUCCESS",
      diagnostic
    });
    return;
  } catch (error: any) {
    console.error("[GOOGLE-BUSINESS ERROR-DIAGNOSTICS] Error:", error.message);
    res.status(500).json({ 
      success: false, 
      message: error.message || "Diagnostics failed",
      error: error
    });
    return;
  }
});

// Helper: Get troubleshooting guide based on error code
function getTroubleshootingGuide(statusCode: number, errorMsg: string): any {
  const guides: any = {
    429: {
      title: "Rate Limit Exceeded",
      cause: "Google API quota is exhausted or you're making requests too fast",
      solutions: [
        "✅ GOOD NEWS: Code now has automatic retry logic! Wait 1-2 minutes.",
        "❌ CRITICAL: Your Google API quota is set to 0",
        "ACTION: Submit quota increase request to Google (see docs)",
        "FORM: https://support.google.com/business/contact/api_default",
        "Timeline: 24-48 hours for approval"
      ]
    },
    401: {
      title: "Unauthorized - Token Invalid or Expired",
      cause: "Your access token is expired or was revoked",
      solutions: [
        "🔄 Option 1: Use refresh_token to get new access_token",
        "🔄 Option 2: Re-authenticate through OAuth flow",
        "✅ CODE FIX: ensureFreshToken() now auto-refreshes tokens",
        "ACTION: Verify refresh_token is stored in database"
      ]
    },
    403: {
      title: "Forbidden - Insufficient Permissions",
      cause: "OAuth token doesn't have required scopes",
      solutions: [
        "❌ PROBLEM: Token missing required scopes",
        "REQUIRED SCOPES: https://www.googleapis.com/auth/business.manage",
        "ACTION: Re-authenticate with correct scopes",
        "VERIFY: Check environment variable GOOGLE_BUSINESS_SCOPES",
        "CURRENT: Only use 'business.manage' scope, remove extra scopes"
      ]
    },
    500: {
      title: "Google API Server Error",
      cause: "Google's servers are having issues or API is down",
      solutions: [
        "🔄 RETRY: Code will auto-retry with exponential backoff",
        "⏰ WAIT: Usually resolves within 5-10 minutes",
        "✅ VERIFY: Check Google Cloud Console status",
        "URL: https://status.cloud.google.com/"
      ]
    },
  };

  return guides[statusCode] || {
    title: `HTTP ${statusCode} Error`,
    cause: errorMsg,
    solutions: [
      `Check Google Cloud Console for more details`,
      `Error message: ${errorMsg}`
    ]
  };
}

// GET /google-business/diagnostics
// Check what's stored in the database and the current OAuth configuration
router.get("/diagnostics", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = (req.query.companyId as string) || (req.headers["company-id"] as string);
    
    if (!companyId) {
      res.status(400).json({ success: false, message: "Missing companyId" });
      return;
    }

    // Fetch stored token
    const storedToken = await SocialToken.findOne({
      where: { companyId: companyId, provider: "google-business" }
    });

    const diagnostics: any = {
      companyId,
      hasStoredToken: !!storedToken,
      environmentConfig: {
        hasClientId: !!process.env.GOOGLE_CLIENT_ID,
        hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: process.env.GOOGLE_BUSINESS_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/google-business/oauth2callback`,
        scopes: (process.env.GOOGLE_BUSINESS_SCOPES || "openid,https://www.googleapis.com/auth/business.manage,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/userinfo.profile")
          .split(",")
          .map(s => s.trim())
          .filter(Boolean)
      }
    };

    if (storedToken) {
      diagnostics.storedToken = {
        accountEmail: storedToken.accountEmail,
        accountId: storedToken.accountId,
        hasAccessToken: !!storedToken.accessToken,
        hasRefreshToken: !!storedToken.refreshToken,
        accessTokenLength: storedToken.accessToken?.length || 0,
        refreshTokenLength: storedToken.refreshToken?.length || 0,
        expiryDate: storedToken.expiryDate ? new Date(storedToken.expiryDate).toISOString() : "never",
        isExpired: storedToken.expiryDate ? storedToken.expiryDate < Date.now() : "unknown",
        scopes: storedToken.scopes?.split(",").map(s => s.trim()).filter(Boolean) || [],
        createdAt: storedToken.createdAt,
        updatedAt: storedToken.updatedAt
      };

      // Check if profile scope is included
      const storedScopes = storedToken.scopes?.split(",").map(s => s.trim()) || [];
      diagnostics.scopeValidation = {
        hasProfileScope: storedScopes.some(s => s.includes("userinfo.profile")),
        hasEmailScope: storedScopes.some(s => s.includes("userinfo.email")),
        hasBusinessScope: storedScopes.some(s => s.includes("business.manage")),
        allScopes: storedScopes,
        recommendedAction: storedScopes.some(s => s.includes("userinfo.profile")) 
          ? "Tokens look correct. Issue might be token expiration or Google API rate limits."
          : "❌ PROBLEM: Tokens missing 'userinfo.profile' scope. Need to re-authenticate with full scopes."
      };
    } else {
      diagnostics.message = "No stored token found. User needs to complete OAuth flow first.";
    }

    res.status(200).json({ success: true, diagnostics });
    return;
  } catch (error: any) {
    console.error("[GOOGLE-BUSINESS DIAGNOSTICS] Error:", error.message);
    res.status(500).json({ success: false, message: error.message || "Diagnostics failed" });
    return;
  }
});

// GET /google-business/retrieve-tokens
// Frontend calls this after OAuth callback to get tokens from database
// More secure than passing tokens in URL
router.get("/retrieve-tokens", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = (req.query.companyId as string) || (req.headers["company-id"] as string);
    
    if (!companyId) {
      res.status(400).json({ success: false, message: "Missing companyId" });
      return;
    }

    // Fetch the most recent token from database
    const storedToken = await SocialToken.findOne({
      where: { companyId: companyId, provider: "google-business" },
      order: [["updatedAt", "DESC"]]
    });

    if (!storedToken) {
      res.status(404).json({ 
        success: false, 
        message: "No Google My Business token found for this company. Please complete OAuth flow first." 
      });
      return;
    }

    // Return tokens to frontend
    res.status(200).json({
      success: true,
      data: {
        accessToken: storedToken.accessToken,
        refreshToken: storedToken.refreshToken,
        expiryDate: storedToken.expiryDate,
        tokenType: storedToken.tokenType || "Bearer",
        companyId: storedToken.companyId,
        accountEmail: storedToken.accountEmail,
        accountId: storedToken.accountId,
        provider: storedToken.provider,
      }
    });
    return;
  } catch (error: any) {
    console.error("[GOOGLE-BUSINESS RETRIEVE-TOKENS] Error:", error.message);
    res.status(500).json({ success: false, message: error.message || "Failed to retrieve tokens" });
    return;
  }
});

/**
 * POST /google-business/save-connection
 * Purpose: Save Google My Business connection to the database after OAuth flow completion
 * Similar to Facebook/Instagram stepper data saves and LinkedIn save-connection
 * 
 * Body Parameters:
 * - userAccessTokenId (required): The token ID from SocialToken table
 * - companyId (required): The company ID
 * - userProfile (optional): User profile information { id, name, email, picture }
 * - businessAccount (optional): Google Business account details { id, name, email }
 * - businessLocationsCount (optional): Number of business locations
 * 
 * Response: 201 Created with saved account details
 */
router.post("/save-connection", async (req: Request, res: Response): Promise<void> => {
  try {
    // Extract from body, query params, or headers (flexible for frontend)
    let {
      userAccessTokenId,
      companyId,
      userProfile,
      businessAccount,
      businessLocationsCount
    } = req.body;

    // If not in body, check query params
    if (!userAccessTokenId) userAccessTokenId = req.query.userAccessTokenId as string;
    if (!companyId) companyId = req.query.companyId as string;

    // If still not found, check headers
    if (!userAccessTokenId) userAccessTokenId = req.headers['x-user-access-token-id'] as string;
    if (!companyId) companyId = req.headers['x-company-id'] as string;

    // Validation
    if (!userAccessTokenId) {
      console.error("[GOOGLE-BUSINESS SAVE-CONNECTION] Missing userAccessTokenId");
      res.status(400).json({
        success: false,
        message: "userAccessTokenId is required (can be in body, query params, or x-user-access-token-id header)",
        receivedParams: {
          inBody: !!req.body.userAccessTokenId,
          inQuery: !!req.query.userAccessTokenId,
          inHeaders: !!req.headers['x-user-access-token-id'],
          bodyKeys: Object.keys(req.body),
          queryKeys: Object.keys(req.query)
        }
      });
      return;
    }

    if (!companyId) {
      console.error("[GOOGLE-BUSINESS SAVE-CONNECTION] Missing companyId");
      res.status(400).json({ success: false, message: "companyId is required (can be in body, query params, or x-company-id header)" });
      return;
    }

    // If userProfile not provided, try to fetch it from SocialToken database
    if (!userProfile) {
      try {
        const token = await SocialToken.findOne({
          where: { id: userAccessTokenId }
        });

        if (token) {
          userProfile = {
            id: token.accountId || userAccessTokenId,
            name: token.accountEmail?.split('@')[0] || 'Google Business User',
            email: token.accountEmail || `google_${userAccessTokenId}@google.local`,
            picture: null
          };
        }
      } catch (err: any) {
        console.warn("[GOOGLE-BUSINESS SAVE-CONNECTION] Could not fetch userProfile from database:", err.message);
      }
    }

    // If still no userProfile, create a minimal one
    if (!userProfile) {
      userProfile = {
        id: userAccessTokenId,
        name: 'Google Business User',
        email: `google_${userAccessTokenId}@google.local`,
        picture: null
      };
    }

    // If businessAccount not provided, use userProfile as fallback
    if (!businessAccount) {
      businessAccount = {
        id: userProfile.id,
        name: userProfile.name,
        email: userProfile.email
      };
    }

    // Use businessAccount.id or userProfile.id as the googleBusinessAccountId
    const googleBusinessAccountId = businessAccount.id || userProfile.id;

    // Create or update Google Business account record
    const existingAccount = await GoogleBusinessAccount.findOne({
      where: {
        companyId,
        googleBusinessAccountId,
        userAccessTokenId
      }
    });

    let savedAccount;
    if (existingAccount) {
      // Update existing
      await existingAccount.update({
        accountName: businessAccount.name || existingAccount.accountName,
        accountEmail: businessAccount.email || existingAccount.accountEmail,
        businessLocationsCount: businessLocationsCount || existingAccount.businessLocationsCount,
        profileImage: userProfile.picture || existingAccount.profileImage,
        isAdded: true,
        addedAt: new Date()
      });
      savedAccount = existingAccount;
    } else {
      // Create new
      savedAccount = await GoogleBusinessAccount.create({
        companyId,
        userAccessTokenId,
        googleBusinessAccountId,
        accountName: businessAccount.name || 'Google Business Account',
        accountEmail: businessAccount.email || null,
        businessLocationsCount: businessLocationsCount || null,
        profileImage: userProfile.picture || null,
        profileUrl: null,
        isAdded: true,
        addedAt: new Date()
      });
    }

    res.status(201).json({
      success: true,
      message: "Google My Business account successfully connected and saved!",
      accountName: savedAccount.accountName,
      accountEmail: savedAccount.accountEmail,
      savedAccount: {
        id: savedAccount.id,
        accountId: googleBusinessAccountId, 
        accountName: savedAccount.accountName,
        accountEmail: savedAccount.accountEmail,
        businessLocationsCount: savedAccount.businessLocationsCount,
        userProfile: userProfile,
        connectedAt: new Date().toISOString()
      },
      callToAction: {
        message: "Connection complete! Your Google My Business account is now connected to your company.",
        action: "Close modal and refresh dashboard"
      }
    });
    return;
  } catch (error: any) {
    console.error("[GOOGLE-BUSINESS SAVE-CONNECTION] ERROR:", error.message);

    res.status(500).json({
      success: false,
      message: error.message || "Failed to save Google Business connection"
    });
    return;
  }
});

/**
 * GET /google-business/status/:companyId
 * Purpose: Check if Google My Business is connected for a company
 * Returns: Connection status, user email, name, and picture
 * Params: companyId (required, path parameter)
 */
router.get('/status/:companyId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;

    if (!companyId) {
      res.status(400).json({ 
        success: false,
        error: "Missing companyId parameter" 
      });
      return;
    }

    // Try to get stored GMB tokens for this company
    const socialToken = await SocialToken.findOne({
      where: {
        companyId: companyId,
        provider: 'google-business'
      }
    });

    if (!socialToken || !socialToken.accessToken) {
      res.json({
        success: true,
        isConnected: false,
        message: "Google My Business is not connected for this company"
      });
      return;
    }

    // If we have a token, verify it's still valid by checking user info
    try {
      const tokens: any = {};
      if (socialToken.accessToken) tokens.access_token = socialToken.accessToken;
      if (socialToken.refreshToken) tokens.refresh_token = socialToken.refreshToken;
      if (socialToken.expiryDate) tokens.expiry_date = socialToken.expiryDate;

      res.json({
        success: true,
        isConnected: true,
        gmbData: {
          email: socialToken.accountEmail || 'Unknown',
          name: socialToken.accountEmail?.split('@')[0] || 'Google Business User',
          picture: null,
          accountId: socialToken.accountId || null,
          connectedAt: socialToken.createdAt
        }
      });
      return;
    } catch (tokenError: any) {
      // Token might be expired
      console.warn("[GOOGLE-BUSINESS STATUS] Token validation failed for company:", companyId, tokenError.message);
      
      res.json({
        success: true,
        isConnected: false,
        message: "Google My Business token expired. Please reconnect.",
        requiresReconnect: true
      });
      return;
    }

  } catch (error: any) {
    console.error("[GOOGLE-BUSINESS STATUS] ERROR:", error.message);
    
    res.status(500).json({
      success: false,
      error: error.message || "Failed to check Google Business connection status"
    });
    return;
  }
});

/**
 * POST /google-business/post
 * Purpose: Create and publish a post to a Google My Business location
 * 
 * Body Parameters:
 * - companyId (required): Company ID
 * - locationId (required): Google My Business location ID (with or without 'locations/' prefix)
 * - message (required): Post message/summary
 * - mediaUrl (optional): URL to image/photo
 * - callToAction (optional): CTA config { actionType: 'LEARN_MORE', 'CALL', 'MESSAGE', etc }
 * 
 * Returns: 201 Created with postId, or error with appropriate status code
 */
router.post('/post', async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId, locationId, message, mediaUrl, callToAction } = req.body;

    // Validation: Required fields
    if (!companyId || !locationId || !message) {
      console.warn("[GOOGLE-BUSINESS POST] Missing required fields:", {
        hasCompanyId: !!companyId,
        hasLocationId: !!locationId,
        hasMessage: !!message
      });
      res.status(400).json({
        success: false,
        message: "Missing required fields: companyId, locationId, message"
      });
      return;
    }

    // Get stored GMB tokens for company
    const socialToken = await SocialToken.findOne({
      where: {
        companyId: companyId,
        provider: 'google-business'
      }
    });

    if (!socialToken || !socialToken.accessToken) {
      console.warn("[GOOGLE-BUSINESS POST] No GMB connection found for company:", companyId);
      res.status(401).json({
        success: false,
        message: "Google My Business is not connected for this company. Please authenticate first."
      });
      return;
    }

    // Extract tokens from database
    const tokens: any = {};
    if (socialToken.accessToken) tokens.access_token = socialToken.accessToken;
    if (socialToken.refreshToken) tokens.refresh_token = socialToken.refreshToken;
    if (socialToken.expiryDate) tokens.expiry_date = socialToken.expiryDate;

    // Format location ID
    const locationIdStr = String(locationId);
    const formattedLocationId = locationIdStr.startsWith('locations/') ? locationIdStr : `locations/${locationIdStr}`;

    // Build post payload
    const postPayload: any = {
      languageCode: 'en',
      summary: message,
      callToAction: callToAction || {
        actionType: 'LEARN_MORE'
      }
    };

    // Add media if provided
    if (mediaUrl) {
      postPayload.media = [{
        mediaFormat: 'PHOTO',
        sourceUrl: mediaUrl
      }];
    }

    console.log("[GOOGLE-BUSINESS POST] Creating post:", {
      companyId,
      locationId: formattedLocationId,
      hasMedia: !!mediaUrl
    });

    // Call API with rate limiting
    let postResponse;
    try {
      postResponse = await executeWithRateLimit(
        'google-business',
        async () => {
          const axios = require('axios');
          return await axios.post(
            `https://mybusinessbusinessinformation.googleapis.com/v1/${formattedLocationId}/localPosts`,
            postPayload,
            {
              headers: {
                'Authorization': `Bearer ${tokens.access_token}`,
                'Content-Type': 'application/json'
              },
              timeout: 30000
            }
          );
        },
        {
          maxRetries: 1,
          initialDelayMs: 2000,
          maxDelayMs: 30000,
          backoffMultiplier: 2
        }
      );
    } catch (error: any) {
      // Handle rate limit
      if (error.code === 'RATE_LIMIT_EXCEEDED') {
        console.warn("[GOOGLE-BUSINESS POST] Rate limit exceeded for company:", companyId);
        res.status(429).json({
          success: false,
          message: "Rate limit exceeded. Please try again in 1-2 minutes.",
          code: "RATE_LIMIT_EXCEEDED",
          retryAfter: 60
        });
        return;
      }

      // Handle auth errors (token expired)
      if (error.response?.status === 401) {
        console.warn("[GOOGLE-BUSINESS POST] Token expired for company:", companyId);
        res.status(401).json({
          success: false,
          message: "Google My Business token expired. Please reconnect.",
          code: "UNAUTHORIZED",
          requiresReconnect: true
        });
        return;
      }

      throw error;
    }

    const responseData = (postResponse as any)?.data || {};
    const postId = responseData?.name || responseData?.id;

    console.log("[GOOGLE-BUSINESS POST] ✅ Post created successfully:", {
      companyId,
      locationId: formattedLocationId,
      postId
    });

    res.status(201).json({
      success: true,
      data: {
        postId: postId,
        locationId: formattedLocationId,
        summary: message,
        createdAt: new Date().toISOString()
      },
      message: "Post published successfully to Google My Business"
    });
    return;
  } catch (error: any) {
    console.error("[GOOGLE-BUSINESS POST] ❌ ERROR:", {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      companyId: req.body?.companyId,
      locationId: req.body?.locationId,
      googleError: error.response?.data?.error?.message
    });

    // Handle specific status codes
    if (error.response?.status === 403) {
      res.status(403).json({
        success: false,
        message: "Forbidden: Insufficient permissions to post to this location.",
        code: "FORBIDDEN"
      });
      return;
    }

    if (error.response?.status === 404) {
      res.status(404).json({
        success: false,
        message: "Location not found. Please verify the locationId.",
        code: "NOT_FOUND"
      });
      return;
    }

    // Default error response
    res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.error?.message || error.message || "Failed to publish post to Google My Business",
      code: "INTERNAL_ERROR"
    });
    return;
  }
});

/**
 * GET /google-business/posts/:companyId/:locationId
 * Purpose: Fetch all posts from a Google My Business location with caching
 * 
 * Params:
 * - companyId (required, path): Company ID
 * - locationId (required, path): Google My Business location ID (with or without 'locations/' prefix)
 * 
 * Query:
 * - limit (optional, default 25, max 100): Max number of posts to return
 * 
 * Returns: 200 OK with array of posts or cached data if rate limited
 * Caching: 24 hours fresh cache, 7 days stale fallback
 */
router.get('/posts/:companyId/:locationId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId, locationId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 100); // Cap at 100

    // Validation
    if (!companyId || !locationId) {
      console.warn("[GOOGLE-BUSINESS POSTS] Missing required parameters");
      res.status(400).json({
        success: false,
        message: "Missing required parameters: companyId, locationId"
      });
      return;
    }

    // Get stored GMB tokens for company
    const socialToken = await SocialToken.findOne({
      where: {
        companyId: companyId,
        provider: 'google-business'
      }
    });

    if (!socialToken || !socialToken.accessToken) {
      console.warn("[GOOGLE-BUSINESS POSTS] No GMB connection found for company:", companyId);
      res.status(401).json({
        success: false,
        message: "Google My Business is not connected for this company. Please authenticate first."
      });
      return;
    }

    // Extract tokens from database
    const tokens: any = {};
    if (socialToken.accessToken) tokens.access_token = socialToken.accessToken;
    if (socialToken.refreshToken) tokens.refresh_token = socialToken.refreshToken;
    if (socialToken.expiryDate) tokens.expiry_date = socialToken.expiryDate;

    // Format location ID
    const locationIdStr = String(locationId);
    const formattedLocationId = locationIdStr.startsWith('locations/') ? locationIdStr : `locations/${locationIdStr}`;

    // ✅ PERMANENT FIX: Check cache first - ALWAYS return cached data if available
    const cacheKey = `posts_${formattedLocationId}_${companyId}`;
    const cached = locationsCache.get(cacheKey);
    const cacheAge = cached ? Date.now() - cached.timestamp : Infinity;
    const isCacheFresh = cached && cacheAge < CACHE_DURATION;
    const isCacheUsable = cached && cacheAge < STALE_CACHE_MAX_AGE;

    // STRATEGY: Return cached data immediately if available (even if old)
    // Then try to refresh in background if cache is stale
    if (isCacheUsable) {
      console.log(`[GOOGLE-BUSINESS POSTS] Returning cached posts (${Math.round(cacheAge / 60000)} min old)`);
      
      res.status(200).json({
        success: true,
        data: cached.data || [],
        total: (cached.data || []).length,
        locationId: formattedLocationId,
        companyId: companyId,
        cached: true,
        stale: !isCacheFresh,
        cacheAge: cacheAge,
        message: isCacheFresh 
          ? `Fresh cached data (${Math.round(cacheAge / 60000)} min old)` 
          : `Stale cache - using old data to avoid rate limits (${Math.round(cacheAge / 3600000)} hours old)`
      });
      return;
    }

    // NO CACHE AVAILABLE - Must try API
    console.log('[GOOGLE-BUSINESS POSTS] No cache available, calling API...');

    // Call API with rate limiting
    let postsResponse;
    try {
      postsResponse = await executeWithRateLimit(
        'google-business',
        async () => {
          const axios = require('axios');
          return await axios.get(
            `https://mybusinessbusinessinformation.googleapis.com/v1/${formattedLocationId}/localPosts`,
            {
              headers: {
                'Authorization': `Bearer ${tokens.access_token}`,
                'Content-Type': 'application/json'
              },
              params: {
                pageSize: limit
              },
              timeout: 30000
            }
          );
        },
        {
          maxRetries: 1,
          initialDelayMs: 2000,
          maxDelayMs: 30000,
          backoffMultiplier: 2
        }
      );
    } catch (error: any) {
      // Handle rate limit
      if (error.code === 'RATE_LIMIT_EXCEEDED') {
        console.warn("[GOOGLE-BUSINESS POSTS] Rate limit exceeded for company:", companyId);

        // ✅ Fallback to stale cache if available
        if (cached && cached.data) {
          const cacheAge = Date.now() - cached.timestamp;
          console.warn(`[GOOGLE-BUSINESS POSTS] Returning stale cached posts (${Math.round(cacheAge / 1000)}s old)`);
          
          res.status(200).json({
            success: true,
            data: cached.data || [],
            total: (cached.data || []).length,
            locationId: formattedLocationId,
            companyId: companyId,
            cached: true,
            stale: true,
            cacheAge: cacheAge,
            message: `Rate limited - returning stale cache (${Math.round(cacheAge / 60000)} min old)`,
            warning: "This data may be outdated due to rate limiting"
          });
          return;
        }

        res.status(429).json({
          success: false,
          message: "Rate limit exceeded. Please try again in 1-2 minutes.",
          code: "RATE_LIMIT_EXCEEDED",
          retryAfter: 60,
          details: {
            hint: "No cached data available. Wait for rate limit to clear."
          }
        });
        return;
      }

      // Handle auth errors (token expired)
      if (error.response?.status === 401) {
        console.warn("[GOOGLE-BUSINESS POSTS] Token expired for company:", companyId);
        res.status(401).json({
          success: false,
          message: "Google My Business token expired. Please reconnect.",
          code: "UNAUTHORIZED",
          requiresReconnect: true
        });
        return;
      }

      throw error;
    }

    const posts = (postsResponse as any)?.data?.localPosts || [];

    // ✅ Store in cache
    locationsCache.set(cacheKey, {
      data: posts,
      timestamp: Date.now()
    });

    console.log("[GOOGLE-BUSINESS POSTS] ✅ Posts fetched successfully:", {
      companyId,
      locationId: formattedLocationId,
      count: posts.length
    });

    res.status(200).json({
      success: true,
      data: posts,
      total: posts.length,
      locationId: formattedLocationId,
      companyId: companyId,
      nextPageToken: (postsResponse as any)?.data?.nextPageToken || null,
      cached: false,
      message: "Posts fetched from Google My Business and cached"
    });
    return;
  } catch (error: any) {
    console.error("[GOOGLE-BUSINESS POSTS] ❌ ERROR:", {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      companyId: req.params?.companyId,
      locationId: req.params?.locationId,
      googleError: error.response?.data?.error?.message,
      code: error.code
    });

    // Handle specific status codes
    if (error.response?.status === 403) {
      res.status(403).json({
        success: false,
        message: "Forbidden: Insufficient permissions to access posts for this location.",
        code: "FORBIDDEN"
      });
      return;
    }

    if (error.response?.status === 404) {
      res.status(404).json({
        success: false,
        message: "Location not found. Please verify the locationId.",
        code: "NOT_FOUND"
      });
      return;
    }

    // Handle rate limit from API response (429)
    if (error.response?.status === 429) {
      console.warn("[GOOGLE-BUSINESS POSTS] Rate limit exceeded (429 response) for company:", req.params?.companyId);
      res.status(429).json({
        success: false,
        message: "Rate limit exceeded. Please try again in 1-2 minutes.",
        code: "RATE_LIMIT_EXCEEDED",
        retryAfter: 60,
        details: {
          status: 429,
          googleError: error.response?.data?.error?.message
        }
      });
      return;
    }

    // Default error response
    res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.error?.message || error.message || "Failed to fetch posts from Google My Business",
      code: "INTERNAL_ERROR"
    });
    return;
  }
});

module.exports = router;
