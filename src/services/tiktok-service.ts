import axios from "axios";
import crypto from "crypto";

function getClient() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY || "";
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET || "";
  const redirectUri = process.env.TIKTOK_REDIRECT_URI || "";

  if (!clientKey) throw new Error("TIKTOK_CLIENT_KEY missing");
  if (!clientSecret) throw new Error("TIKTOK_CLIENT_SECRET missing");
  if (!redirectUri) throw new Error("TIKTOK_REDIRECT_URI missing");

  return { clientKey, clientSecret, redirectUri };
}

/**
 * STEP 1: Generate TikTok Login URL
 * (Browser redirect only)
 */
export function generateTikTokAuthUrl() {
  const { clientKey, redirectUri } = getClient();
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_key: clientKey,
    response_type: "code",
    scope: "user.info.basic", // ✅ ONLY allowed scope
    redirect_uri: redirectUri,
    state,
  });

  // ✅ ONLY VALID TikTok authorize endpoint (Login Kit v2)
  const url = `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;

  return { url, state };
}

/**
 * STEP 2: Exchange authorization code → access token
 */
export async function exchangeCodeForTokens(code: string) {
  const { clientKey, clientSecret, redirectUri } = getClient();

  const params = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const res = await axios.post(
    "https://open.tiktokapis.com/v2/oauth/token/",
    params.toString(),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }
  );

  return res.data;
}

/**
 * STEP 3: Fetch TikTok user profile
 */
export async function getUserInfo(accessToken: string) {
  if (!accessToken) throw new Error("accessToken required");

  const res = await axios.get(
    "https://open.tiktokapis.com/v2/user/info/",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        fields: "open_id,union_id,avatar_url,display_name",
      },
    }
  );

  return res.data;
}
