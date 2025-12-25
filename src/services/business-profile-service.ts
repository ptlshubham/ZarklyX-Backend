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
  const oauth2Client = getBusinessOAuthClient();
  const scopeList = scopes && scopes.length > 0
    ? scopes
    : (process.env.GOOGLE_BUSINESS_SCOPES || "https://www.googleapis.com/auth/business.manage").split(",").map(s => s.trim()).filter(Boolean);

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopeList,
  });
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

export async function listBusinessAccounts(tokens: any) {
  const mba = getMyBusinessAccountClient(tokens);
  const res = await mba.accounts.list({});
  return res.data;
}

export async function listBusinessLocations(tokens: any, accountName: string) {
  const oauth2Client = getBusinessOAuthClient();
  oauth2Client.setCredentials(tokens);
  const mbl = google.mybusinesslodging({ version: "v1", auth: oauth2Client });
  // Some Business Profile endpoints are under different discovery; for basic list, use My Business Business Information
  const mbbi = google.mybusinessbusinessinformation({ version: "v1", auth: oauth2Client });
  const res = await mbbi.accounts.locations.list({ parent: accountName, pageSize: 20 });
  return res.data;
}

export async function getBusinessLocation(tokens: any, locationName: string) {
  const oauth2Client = getBusinessOAuthClient();
  oauth2Client.setCredentials(tokens);
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
