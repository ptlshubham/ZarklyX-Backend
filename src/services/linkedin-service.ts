import axios from "axios";
import {
  getScopesForMode,
  formatScopesForOAuth,
  LinkedInMode,
  logScopeConfiguration
} from "./linkedin-scope-manager";

function getRedirectUri() {
  return process.env.LINKEDIN_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/linkedin/oauth2callback`;
}

function getClient() {
  const clientId = process.env.LINKEDIN_CLIENT_ID || "";
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET || "";
  const redirectUri = getRedirectUri();
  return { clientId, clientSecret, redirectUri };
}

/**
 * Generate LinkedIn OAuth URL with flexible scopes
 * 
 * @param scopes - Optional override scopes. If not provided, uses current mode scopes
 * @param mode - Optional mode override (defaults to LINKEDIN_MODE env var)
 * @returns Object with { url, state, usedScopes } for debugging
 */
export function generateLinkedInAuthUrl(scopes?: string[], mode?: LinkedInMode) {
  const { clientId, redirectUri } = getClient();

  // Use provided scopes, or default to current mode scopes
  const scopeList = scopes?.length ? scopes : getScopesForMode(mode);
  const scopeParam = formatScopesForOAuth(mode);


  const state = Math.random().toString(36).slice(2);

  const url =
    `https://www.linkedin.com/oauth/v2/authorization` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scopeParam)}` +
    `&state=${state}`;

  return { url, state, usedScopes: scopeList };
}

export async function exchangeLinkedInCodeForTokens(code: string) {
  const { clientId, clientSecret, redirectUri } = getClient();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await axios.post("https://www.linkedin.com/oauth/v2/accessToken", body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return res.data; // { access_token, expires_in, refresh_token?, refresh_token_expires_in? }
}

export async function refreshLinkedInAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = getClient();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await axios.post("https://www.linkedin.com/oauth/v2/accessToken", body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return res.data; // { access_token, expires_in }
}

function authHeader(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}`, "X-Restli-Protocol-Version": "2.0.0" } as const;
}

export async function getLinkedInUserInfo(accessToken: string) {
  const res = await axios.get(
    "https://api.linkedin.com/v2/userinfo",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  return res.data;
}

export async function getLinkedInEmail(accessToken: string) {
  const url = "https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))";
  const res = await axios.get(url, { headers: authHeader(accessToken) });
  return res.data;
}

export async function createLinkedInShare(accessToken: string, authorPersonUrn: string, text: string) {
  const url = "https://api.linkedin.com/v2/ugcPosts";
  const body = {
    author: authorPersonUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "NONE",
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };
  const res = await axios.post(url, body, { headers: { ...authHeader(accessToken), "Content-Type": "application/json" } });
  return res.data;
}
