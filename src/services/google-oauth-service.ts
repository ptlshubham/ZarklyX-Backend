import { google } from "googleapis";

function getRedirectUri() {
    return (
  process.env.GOOGLE_REDIRECT_URI ||
  `${process.env.API_URL || "http://localhost:9005"}/google/oauth2callback`
);
//   return process.env.GOOGLE_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/auth/google/callback`;
}

export function getGenericOAuthClient(redirectUri?: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const redirect = redirectUri || getRedirectUri();
  return new google.auth.OAuth2(clientId, clientSecret, redirect);
}

export function generateGenericAuthUrl(scopes: string[], accessType: "online" | "offline" = "offline", prompt: "consent" | "none" = "consent") {
  const oauth2Client = getGenericOAuthClient();
   return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
  });
}

export async function exchangeGenericCodeForTokens(code: string, redirectUri?: string) {
  const oauth2Client = getGenericOAuthClient(redirectUri);
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

export async function getGenericTokenInfo(accessToken: string) {
//   const oauth2Client = getGenericOAuthClient();
  const oauth2 = google.oauth2("v2");
const res = await oauth2.tokeninfo({ access_token: accessToken });
return res.data;
}
