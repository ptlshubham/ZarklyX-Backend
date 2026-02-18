import axios from "axios";

function getRedirectUri() {
  return (
    process.env.PINTEREST_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/pinterest/oauth2callback`
  );
}

function getClient() {
  const clientId = process.env.PINTEREST_APP_ID || process.env.PINTEREST_CLIENT_ID || "";
  const clientSecret = process.env.PINTEREST_APP_SECRET || process.env.PINTEREST_CLIENT_SECRET || "";
  const redirectUri = getRedirectUri();
  return { clientId, clientSecret, redirectUri };
}

export function generatePinterestAuthUrl(scopes?: string[]) {
  const { clientId, redirectUri } = getClient();
  if (!clientId) throw new Error("Pinterest client id is not configured (PINTEREST_APP_ID)");
  // Pinterest expects scopes to be space-separated in the auth URL
  const scopeList = scopes?.length ? scopes : (process.env.PINTEREST_SCOPES || "user_accounts:read").split(/[ ,]+/).filter(Boolean);
  const scopeParam = scopeList.join(" ");
  const state = Math.random().toString(36).slice(2);
  const url =
    `https://www.pinterest.com/oauth/` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scopeParam)}` +
    `&state=${encodeURIComponent(state)}`;
  return { url, state };
}

export async function exchangePinterestCodeForTokens(code: string) {
  const { clientId, clientSecret, redirectUri } = getClient();
  if (!clientId || !clientSecret) throw new Error("Pinterest client id/secret not configured (PINTEREST_APP_ID / PINTEREST_APP_SECRET)");
  const url = `https://api.pinterest.com/v5/oauth/token`;
  // Some Pinterest apps expect JSON body, others expect form-encoded data.
  // Try JSON first, then fall back to application/x-www-form-urlencoded.
  const jsonPayload = {
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  };

  try {
    // Try JSON with client credentials in Authorization header (Basic) first.
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    try {
      const res = await axios.post(url, { grant_type: "authorization_code", code, redirect_uri: redirectUri }, { headers: { "Content-Type": "application/json", "Accept": "application/json", Authorization: `Basic ${basicAuth}` }, timeout: 10000 });
      return res.data;
    } catch (jsonAuthErr: any) {
      // If that fails, fall back to previous JSON attempt including client_id/secret in body
      try {
        const res = await axios.post(url, jsonPayload, { headers: { "Content-Type": "application/json", "Accept": "application/json" }, timeout: 10000 });
        return res.data; // { access_token, refresh_token, expires_in, token_type }
      } catch (err: any) {
        // Keep err for form fallback below
        throw err;
      }
    }
  } catch (err: any) {
    console.error("Pinterest token exchange JSON attempt failed:", { status: err?.response?.status, data: err?.response?.data });
    // If JSON fails, try form-encoded as a fallback
    try {
      // Try form-encoded with Authorization header (no client_id/secret in body)
      const basicAuth2 = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const bodyAuth = new URLSearchParams();
      bodyAuth.append("grant_type", "authorization_code");
      bodyAuth.append("code", code);
      bodyAuth.append("redirect_uri", redirectUri);
      try {
        const res2 = await axios.post(url, bodyAuth.toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json", Authorization: `Basic ${basicAuth2}` }, timeout: 10000 });
        return res2.data;
      } catch (formAuthErr: any) {
        // final fallback: form-encoded with client_id/client_secret in body (older style)
        const body = new URLSearchParams();
        body.append("grant_type", "authorization_code");
        body.append("code", code);
        body.append("client_id", clientId);
        body.append("client_secret", clientSecret);
        body.append("redirect_uri", redirectUri);
        const res3 = await axios.post(url, body.toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" }, timeout: 10000 });
        return res3.data;
      }
    } catch (err2: any) {
      // log both responses to server console for debugging
      console.error("Pinterest token exchange form-encoded attempt failed:", { jsonAttempt: { status: err?.response?.status, data: err?.response?.data }, formAttempt: { status: err2?.response?.status, data: err2?.response?.data } });
      // throw the more informative response if available
      const info = err2?.response?.data || err?.response?.data || err2?.message || err?.message;
      const e: any = new Error("Pinterest token exchange failed");
      e.info = info;
      throw e;
    }
  }
}

export async function refreshPinterestAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = getClient();
  const url = `https://api.pinterest.com/v5/oauth/token`;
  const jsonPayload = {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  };

  // Try JSON with Authorization header first
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  try {
    try {
      const res = await axios.post(url, { grant_type: "refresh_token", refresh_token: refreshToken }, { headers: { "Content-Type": "application/json", "Accept": "application/json", Authorization: `Basic ${basicAuth}` }, timeout: 10000 });
      return res.data;
    } catch (jsonAuthErr: any) {
      // fallback to JSON with client creds in body
      const res = await axios.post(url, jsonPayload, { headers: { "Content-Type": "application/json", "Accept": "application/json" }, timeout: 10000 });
      return res.data;
    }
  } catch (err: any) {
    console.error("Pinterest token refresh JSON attempt failed:", { status: err?.response?.status, data: err?.response?.data });
    try {
      // Try form-encoded with Authorization header
      const basicAuth2 = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const bodyAuth = new URLSearchParams();
      bodyAuth.append("grant_type", "refresh_token");
      bodyAuth.append("refresh_token", refreshToken);
      const res2 = await axios.post(url, bodyAuth.toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json", Authorization: `Basic ${basicAuth2}` }, timeout: 10000 });
      return res2.data;
    } catch (err2: any) {
      // final fallback: form-encoded with client_id/client_secret in body
      try {
        const body = new URLSearchParams();
        body.append("grant_type", "refresh_token");
        body.append("refresh_token", refreshToken);
        body.append("client_id", clientId);
        body.append("client_secret", clientSecret);
        const res3 = await axios.post(url, body.toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" }, timeout: 10000 });
        return res3.data;
      } catch (err3: any) {
        console.error("Pinterest token refresh form attempt failed:", { jsonAttempt: { status: err?.response?.status, data: err?.response?.data }, formAttempt: { status: err2?.response?.status, data: err2?.response?.data }, finalAttempt: { status: err3?.response?.status, data: err3?.response?.data } });
        const info = err3?.response?.data || err2?.response?.data || err?.response?.data || err3?.message || err2?.message || err?.message;
        const e: any = new Error("Pinterest token refresh failed");
        e.info = info;
        throw e;
      }
    }
  }
}

/**
 * Make a rate-limit aware request to Pinterest API with retry logic for 429 (Too Many Requests)
 * @param url - The Pinterest API endpoint URL
 * @param config - Axios request config
 * @param maxRetries - Maximum number of retries for 429 errors (default: 3)
 * @returns Response data
 */
async function makePinterestRequest(url: string, config: any, maxRetries = 3) {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await axios.get(url, config);
      return res.data;
    } catch (err: any) {
      lastError = err;
      const status = err?.response?.status;
      const retryAfter = err?.response?.headers?.['retry-after'];
      
      // If 429 (rate limit) or 503 (service unavailable), retry with backoff
      if ((status === 429 || status === 503) && attempt < maxRetries) {
        // Use Retry-After header if available, otherwise exponential backoff
        let delayMs = retryAfter ? parseInt(retryAfter) * 1000 : (1000 * Math.pow(2, attempt)); // 1s, 2s, 4s, 8s
        
        console.log(`[PINTEREST API] Rate limited (429/503). Retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
        
        // Add jitter to prevent thundering herd
        delayMs += Math.random() * 1000;
        
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue; // Retry
      }
      
      // For other errors, throw immediately
      throw err;
    }
  }
  
  // All retries exhausted
  throw lastError;
}

export async function getPinterestUser(accessToken: string) {
  // Request profile_image to ensure we get the user's picture
  const url = `https://api.pinterest.com/v5/user_account?fields=id,username,name,email,profile_image`;
  
  return makePinterestRequest(
    url,
    { 
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 15000 // Increase timeout to allow for retries
    },
    3 // Allow 3 retries for rate limiting
  );
}

export async function listBoards(accessToken: string) {
  try {
    // Check if using Personal Access Token (PAT) or OAuth token
    const isPersonalAccessToken = accessToken.startsWith('pina_');
    console.log("[PINTEREST SERVICE] listBoards - Token type:", isPersonalAccessToken ? "Personal Access Token (PAT)" : "OAuth Token");
    
    let userAccountId: string | undefined;
    
    if (isPersonalAccessToken) {
      // For Personal Access Tokens, use /v5/user_account (singular) endpoint
      console.log("[PINTEREST SERVICE] listBoards - Using /user_account endpoint for PAT");
      const userUrl = `https://api.pinterest.com/v5/user_account?fields=id,username`;
      
      const userRes = await makePinterestRequest(
        userUrl,
        { 
          headers: { 
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        },
        3 // Retry on rate limit
      );
      
      console.log("[PINTEREST SERVICE] listBoards - User response (PAT):", {
        data: userRes
      });
      
      // For PAT, the response is direct (not in items array)
      userAccountId = userRes?.id;
    } else {
      // For OAuth tokens, use /v5/user_accounts (plural) endpoint
      console.log("[PINTEREST SERVICE] listBoards - Using /user_accounts endpoint for OAuth");
      const userUrl = `https://api.pinterest.com/v5/user_accounts?fields=id,username`;
      
      const userRes = await makePinterestRequest(
        userUrl,
        { 
          headers: { 
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        },
        3 // Retry on rate limit
      );
      
      console.log("[PINTEREST SERVICE] listBoards - User response (OAuth):", {
        data: userRes
      });
      
      // For OAuth, response is in items array
      userAccountId = userRes?.items?.[0]?.id;
    }
    
    console.log("[PINTEREST SERVICE] listBoards - User account ID:", userAccountId);
    
    if (!userAccountId) {
      throw new Error("Could not retrieve user account ID from Pinterest API");
    }
    
    // Now get boards for this user account
    const boardsUrl = `https://api.pinterest.com/v5/boards?owner=${userAccountId}&fields=id,name,description,privacy,collaborator_count,creator,media_count,url`;
    console.log("[PINTEREST SERVICE] listBoards - Calling boards endpoint:", boardsUrl);
    
    const boardsRes = await makePinterestRequest(
      boardsUrl,
      { 
        headers: { 
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      },
      3 // Retry on rate limit
    );
    
    console.log("[PINTEREST SERVICE] listBoards - Boards Response:", {
      itemsCount: boardsRes?.items?.length || 0,
      data: boardsRes
    });
    
    return boardsRes; // { items: [...] }
  } catch (error: any) {
    console.error("[PINTEREST SERVICE] listBoards - Error:", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      url: error.config?.url
    });
    throw error;
  }
}

export async function createPin(accessToken: string, board_id: string, title: string, link?: string, media_url?: string) {
  // Use sandbox API for apps with Trial access, production API for full access
  const url = `https://api-sandbox.pinterest.com/v5/pins`;
  const body: any = { board_id, title };
  if (link) body.link = link;
  if (media_url) body.media = [{ media_type: "image", original_url: media_url }];

  const res = await axios.post(url, body, { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } });
  return res.data;
}

export default {};
