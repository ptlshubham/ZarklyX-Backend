import { google } from "googleapis";

function getRedirectUri() {
  return process.env.GOOGLE_BUSINESS_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/google-business/oauth2callback`;
}

export function getBusinessOAuthClient(redirectUri?: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const redirect = redirectUri || getRedirectUri();
  return new google.auth.OAuth2(clientId, clientSecret, redirect);
}

export function generateBusinessAuthUrl(scopes?: string[]) {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  
  if (!clientId || !clientSecret) {
    throw new Error("Missing Google OAuth credentials: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set in .env");
  }

  const oauth2Client = getBusinessOAuthClient();
  const scopeList = scopes && scopes.length > 0
    ? scopes
    : (process.env.GOOGLE_BUSINESS_SCOPES || "openid,https://www.googleapis.com/auth/business.manage,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/userinfo.profile").split(",").map(s => s.trim()).filter(Boolean);

  try {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: scopeList,
    });
    return authUrl;
  } catch (err: any) {
    console.error("[BUSINESS-PROFILE-SERVICE] Error generating auth URL:", {
      error: err.message,
      clientId: clientId?.substring(0, 10) + "...",
      hasClientSecret: !!clientSecret,
      scopesCount: scopeList?.length,
    });
    throw new Error(`Failed to generate Google Business auth URL: ${err.message}`);
  }
}

export async function exchangeBusinessCodeForTokens(code: string, redirectUri?: string) {
  const oauth2Client = getBusinessOAuthClient(redirectUri);
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

export function getMyBusinessAccountClient(tokens: any) {
  const oauth2Client = getBusinessOAuthClient();
  oauth2Client.setCredentials(tokens);
  return google.mybusinessaccountmanagement({ version: "v1", auth: oauth2Client });
}

/**
 * Ensure token is fresh - refresh if expired or only refresh_token available
 * @param tokens OAuth tokens with potential expiry
 * @returns Fresh tokens with valid access_token
 */
export async function ensureFreshToken(tokens: any) {
  const oauth2Client = getBusinessOAuthClient();
  oauth2Client.setCredentials(tokens);
  
  // Check if token is expired or missing access_token
  const now = Date.now();
  const isExpired = tokens.expiry_date && tokens.expiry_date < now + 60000; // 1 minute buffer
  const hasBothTokens = !!tokens.access_token && !!tokens.refresh_token;
  
  if (isExpired || (!tokens.access_token && tokens.refresh_token)) {
    console.log("[BUSINESS-PROFILE-SERVICE] Token refresh needed:", {
      isExpired: isExpired,
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
    });
    
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      console.log("[BUSINESS-PROFILE-SERVICE] Token refreshed successfully");
      return credentials;
    } catch (err: any) {
      console.error("[BUSINESS-PROFILE-SERVICE] Token refresh failed:", {
        message: err.message,
        code: err.code,
      });
      throw new Error("Token refresh failed: " + err.message);
    }
  }
  
  return tokens;
}

export async function listBusinessAccounts(tokens: any) {
  // CRITICAL: Ensure token is fresh before making API call
  const freshTokens = await ensureFreshToken(tokens);
  
  const mba = getMyBusinessAccountClient(freshTokens);
  const res = await mba.accounts.list({});
  return res.data;
}

export async function listBusinessLocations(tokens: any, accountName: string) {
  // CRITICAL: Ensure token is fresh before making API call
  const freshTokens = await ensureFreshToken(tokens);
  
  const oauth2Client = getBusinessOAuthClient();
  oauth2Client.setCredentials(freshTokens);
  const mbl = google.mybusinesslodging({ version: "v1", auth: oauth2Client });
  // Some Business Profile endpoints are under different discovery; for basic list, use My Business Business Information
  const mbbi = google.mybusinessbusinessinformation({ version: "v1", auth: oauth2Client });
  const res = await mbbi.accounts.locations.list({ parent: accountName, pageSize: 20 });
  return res.data;
}

export async function getBusinessLocation(tokens: any, locationName: string) {
  // CRITICAL: Ensure token is fresh before making API call
  const freshTokens = await ensureFreshToken(tokens);
  
  const oauth2Client = getBusinessOAuthClient();
  oauth2Client.setCredentials(freshTokens);
  const mbbi = google.mybusinessbusinessinformation({ version: "v1", auth: oauth2Client });
  const res = await mbbi.locations.get({ name: locationName });
  return res.data;
}

export async function getBusinessAccessTokenInfo(tokens: any) {
  const oauth2Client = getBusinessOAuthClient();
  oauth2Client.setCredentials(tokens);
  // getAccessToken() will refresh if refresh_token is present and access_token missing/expired
  const at = await oauth2Client.getAccessToken();
  const tokenStr = at?.token || tokens?.access_token || "";
  if (!tokenStr) {
    throw new Error("No access_token available; provide access_token or refresh_token");
  }
  const info = await oauth2Client.getTokenInfo(tokenStr);
  return info;
}

/**
 * Get the authenticated user's profile information including picture
 * @param tokens OAuth tokens (access_token or refresh_token)
 * @returns User profile data including picture URL
 */
export async function getUserProfile(tokens: any) {
  const oauth2Client = getBusinessOAuthClient();
  
  // Set credentials - if only refresh_token, it will auto-refresh
  oauth2Client.setCredentials(tokens);

  try {
    console.log("[BUSINESS-PROFILE-SERVICE] Getting user profile with tokens:", {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      accessTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : "unknown",
    });

    // If we only have refresh_token, try to get a fresh access_token
    if (!tokens.access_token && tokens.refresh_token) {
      console.log("[BUSINESS-PROFILE-SERVICE] Only refresh_token available, refreshing access_token...");
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
      console.log("[BUSINESS-PROFILE-SERVICE] Access token refreshed successfully");
    }

    const people = google.people({ version: "v1", auth: oauth2Client });
    const res = await people.people.get({
      resourceName: "people/me",
      personFields: "names,emailAddresses,photos,metadata",
    });

    const profile = {
      name: res.data.names?.[0]?.displayName || "Unknown User",
      email: res.data.emailAddresses?.[0]?.value || "",
      picture: res.data.photos?.[0]?.url || "", // Profile picture URL
      displayName: res.data.names?.[0]?.displayName || "",
      givenName: res.data.names?.[0]?.givenName || "",
      familyName: res.data.names?.[0]?.familyName || "",
      resourceName: res.data.resourceName || "",
    };

    console.log("[BUSINESS-PROFILE-SERVICE] User profile retrieved:", {
      displayName: profile.displayName,
      email: profile.email,
      hasPicture: !!profile.picture,
      pictureUrl: profile.picture?.substring(0, 50) + "..." || "none",
    });

    return profile;
  } catch (err: any) {
    console.error("[BUSINESS-PROFILE-SERVICE] Error fetching user profile:", {
      message: err.message,
      status: err.status,
      code: err.code,
    });
    throw new Error(`Failed to fetch user profile: ${err.message}`);
  }
}
