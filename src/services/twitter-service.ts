import axios from "axios";
import crypto from "crypto";

function base64UrlEncode(buffer: Buffer) {
  return buffer.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function sha256(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest();
}

export function generateCodeVerifier() {
  // 128 chars is allowed by spec; keep it reasonably long
  return base64UrlEncode(crypto.randomBytes(64));
}

export function generateCodeChallenge(verifier: string) {
  const challenge = sha256(Buffer.from(verifier));
  return base64UrlEncode(challenge);
}

function getClient() {
  const clientId = process.env.TWITTER_API_KEY || ""; // on Twitter this is the client id
  const clientSecret = process.env.TWITTER_API_SECRET_KEY || "";
  const redirectUri = process.env.TWITTER_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/twitter/oauth2callback`;
  return { clientId, clientSecret, redirectUri };
}

export function generateTwitterAuthUrl(scopes?: string[]) {
  const { clientId, redirectUri } = getClient();
  if (!clientId) throw new Error("Twitter client id is not configured (TWITTER_API_KEY)");
  const scopeList = scopes?.length
    ? scopes
    : (process.env.TWITTER_SCOPES || "tweet.read tweet.write users.read offline.access").split(/[ ,]+/).filter(Boolean);
  const scopeParam = scopeList.join(" ");
  const state = Math.random().toString(36).slice(2);
  const code = Math.random().toString(36).slice(2);
  const code_verifier = generateCodeVerifier();
  const code_challenge = generateCodeChallenge(code_verifier);

  const url =
    `https://twitter.com/i/oauth2/authorize` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scopeParam)}` +
    `&state=${encodeURIComponent(state)}` +
    `&code=${encodeURIComponent(code)}` +
    `&code_challenge=${encodeURIComponent(code_challenge)}` +
    `&code_challenge_method=S256`;

  return { url, state, code ,code_verifier };
}

export async function exchangeCodeForTokens(code: string, code_verifier?: string) {
  const { clientId, clientSecret, redirectUri } = getClient();
  if (!clientId) throw new Error("Twitter client id not configured");

  const params = new URLSearchParams();
  params.append("grant_type", "authorization_code");
  params.append("code", code);
  params.append("redirect_uri", redirectUri);
  if (code_verifier) params.append("code_verifier", code_verifier);
  // for PKCE we include client_id, no client_secret in body
  params.append("client_id", clientId);

  const headers: any = { "Content-Type": "application/x-www-form-urlencoded" };

  // If client secret present, include Basic auth header (some Twitter apps may require it)
  if (clientSecret) {
    const token = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    headers["Authorization"] = `Basic ${token}`;
  }

  const res = await axios.post("https://api.twitter.com/2/oauth2/token", params.toString(), { headers });
  return res.data; // contains access_token, refresh_token, expires_in, scope, token_type
}

export async function refreshAccessToken(refresh_token: string) {
  const { clientId, clientSecret } = getClient();
  const params = new URLSearchParams();
  params.append("grant_type", "refresh_token");
  params.append("refresh_token", refresh_token);
  params.append("client_id", clientId);

  const headers: any = { "Content-Type": "application/x-www-form-urlencoded" };
  if (clientSecret) {
    const token = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    headers["Authorization"] = `Basic ${token}`;
  }

  const res = await axios.post("https://api.twitter.com/2/oauth2/token", params.toString(), { headers });
  return res.data;
}

export async function getUserByUsername(username: string, bearerToken?: string) {
  const token = bearerToken || process.env.TWITTER_BEARER_TOKEN;
  if (!token) throw new Error("Twitter bearer token not configured (TWITTER_BEARER_TOKEN)");
  const url = `https://api.twitter.com/2/users/by/username/${encodeURIComponent(username)}?user.fields=id,name,username,profile_image_url,verified`;
  const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
  return res.data;
}

export async function postTweet(text: string, accessToken: string) {
  if (!accessToken) throw new Error("User access token required to post tweets");
  const url = `https://api.twitter.com/2/tweets`;
  const body = { text };
  const res = await axios.post(url, body, { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } });
  return res.data;
}

export default {};