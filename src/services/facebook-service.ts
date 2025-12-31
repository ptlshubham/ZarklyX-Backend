import axios from "axios";

function getRedirectUri() {
  return (
    process.env.FACEBOOK_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/facebook/oauth2callback`
  );
}

function getClient() {
  // prefer the `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` names from the .env
  // but fall back to older `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` if present
  const clientId = process.env.FACEBOOK_APP_ID || process.env.FACEBOOK_CLIENT_ID || "";
  const clientSecret = process.env.FACEBOOK_APP_SECRET || process.env.FACEBOOK_CLIENT_SECRET || "";
  const redirectUri = getRedirectUri();
  return { clientId, clientSecret, redirectUri };
}

export function generateFacebookAuthUrl(scopes?: string[]) {
  const { clientId, redirectUri } = getClient();
  if (!clientId) throw new Error("Facebook client id is not configured (FACEBOOK_APP_ID)");
  const scopeList = scopes?.length ? scopes : (process.env.FACEBOOK_SCOPES || "email,public_profile,pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_engagement").split(/[ ,]+/).filter(Boolean);
  const scopeParam = scopeList.join(",");
  const state = Math.random().toString(36).slice(2);
  const url =
    `https://www.facebook.com/v16.0/dialog/oauth` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}` +
    `&scope=${encodeURIComponent(scopeParam)}` +
    `&response_type=code`;
  return { url, state };
}

export async function exchangeFacebookCodeForTokens(code: string) {
  const { clientId, clientSecret, redirectUri } = getClient();
  if (!clientId || !clientSecret) throw new Error("Facebook client id/secret not configured (FACEBOOK_APP_ID / FACEBOOK_APP_SECRET)");
  const url = `https://graph.facebook.com/v16.0/oauth/access_token` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&client_secret=${encodeURIComponent(clientSecret)}` +
    `&code=${encodeURIComponent(code)}`;
  const res = await axios.get(url);
  return res.data; // { access_token, token_type, expires_in }
}

export async function exchangeShortLivedForLongLived(accessToken: string) {
  const { clientId, clientSecret } = getClient();
  const url = `https://graph.facebook.com/v16.0/oauth/access_token` +
    `?grant_type=fb_exchange_token` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&client_secret=${encodeURIComponent(clientSecret)}` +
    `&fb_exchange_token=${encodeURIComponent(accessToken)}`;
  const res = await axios.get(url);
  return res.data; // { access_token, token_type, expires_in }
}

export async function getFacebookUser(accessToken: string) {
  const url = `https://graph.facebook.com/me?fields=id,name,email` + `&access_token=${encodeURIComponent(accessToken)}`;
  const res = await axios.get(url);
  return res.data;
}

export async function getFacebookPages(accessToken: string) {
  const url = `https://graph.facebook.com/me/accounts?access_token=${encodeURIComponent(accessToken)}`;
  const res = await axios.get(url);
  return res.data; // { data: [ { id, name, access_token, ... } ] }
}

// export async function postToFacebookPage(pageId: string, pageAccessToken: string, message: string) {
//   const url = `https://graph.facebook.com/${encodeURIComponent(pageId)}/feed`;
//   const body = new URLSearchParams({ message, access_token: pageAccessToken });
//   const res = await axios.post(url, body.toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
//   return res.data;
// }

export async function postToFacebookPage(pageId: string, pageAccessToken: string, message: string) {
  const url = `https://graph.facebook.com/${pageId}/feed`;
  const body = new URLSearchParams({ message, access_token: pageAccessToken });
  return axios.post(url, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });
}
export async function getFacebookDebugToken(inputToken: string, appToken?: string) {
  // appToken can be {app_id}|{app_secret}
  const { clientId, clientSecret } = getClient();
  const appAccessToken = appToken || `${clientId}|${clientSecret}`;
  const url = `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(inputToken)}&access_token=${encodeURIComponent(appAccessToken)}`;
  const res = await axios.get(url);
  return res.data;
}

export default {};
