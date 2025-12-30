import express from "express";
import { successResponse, serverError } from "../../../../../utils/responseHandler";
import {
  generateTikTokAuthUrl,
  exchangeCodeForTokens,
  getUserInfo,
} from "../../../../../services/tiktok-service";
import { saveOrUpdateToken } from "../../../../../services/token-store.service";

const router = express.Router();

/**
 * STEP 1: Generate TikTok authorize URL
 */
router.get("/authorize", async (_req: any, res: any): Promise<any>=> {
  try {
    const data = generateTikTokAuthUrl();
    return successResponse(res, "TikTok auth url generated", data);
  } catch (err: any) {
    return serverError(res, err?.message || "Failed to generate TikTok auth URL");
  }
});

/**
 * STEP 2: Exchange code manually (optional API)
 */
router.post("/exchange", async (req: any, res: any): Promise<any>=> {
  try {
    const { code } = req.body || {};
    if (!code) return serverError(res, "code is required");

    const tokens = await exchangeCodeForTokens(code);

    let providerUserId: string | null = null;
    let profile: any = null;

    const accessToken = tokens?.data?.access_token;
    if (accessToken) {
      try {
        profile = await getUserInfo(accessToken);
        providerUserId = profile?.data?.open_id || null;
      } catch {
        // ignore profile failure
      }
    }

    await saveOrUpdateToken({
      accountEmail: null,
      provider: "tiktok",
      scopes: tokens?.data?.scope?.split(" ") || [],
      accessToken: tokens?.data?.access_token || null,
      refreshToken: tokens?.data?.refresh_token || null,
      expiryDate: tokens?.data?.expires_in
        ? Date.now() + Number(tokens.data.expires_in) * 1000
        : null,
      tokenType: tokens?.data?.token_type || null,
    });

    return successResponse(res, "Exchanged code for tokens", {
      providerUserId,
      profile,
    });
  } catch (err: any) {
    return serverError(
      res,
      err?.response?.data || err?.message || "Token exchange failed"
    );
  }
});

/**
 * STEP 3: TikTok OAuth callback (ONLY ONE)
 * Registered in TikTok Developer Console
 */
router.get("/auth/tiktok/callback", async (req: any, res: any) => {
  try {
    console.log("[TikTok Callback]", req.query);

    const { code, error } = req.query || {};
    if (error) return serverError(res, `TikTok OAuth error: ${error}`);
    if (!code) return serverError(res, "Missing code");

    const tokens = await exchangeCodeForTokens(String(code));

    let providerUserId: string | null = null;
    let profile: any = null;

    const accessToken = tokens?.data?.access_token;
    if (accessToken) {
      try {
        profile = await getUserInfo(accessToken);
        providerUserId = profile?.data?.open_id || null;
      } catch {
        // ignore
      }
    }

    await saveOrUpdateToken({
      accountEmail: null,
      provider: "tiktok",
      scopes: tokens?.data?.scope?.split(" ") || [],
      accessToken: tokens?.data?.access_token || null,
      refreshToken: tokens?.data?.refresh_token || null,
      expiryDate: tokens?.data?.expires_in
        ? Date.now() + Number(tokens.data.expires_in) * 1000
        : null,
      tokenType: tokens?.data?.token_type || null,
    });

    const frontendSuccess =
      process.env.TIKTOK_FRONTEND_SUCCESS_URL ||
      "http://localhost:4200/auth/tiktok/success";

    return res.redirect(
      `${frontendSuccess}?provider=tiktok&providerUserId=${providerUserId || ""}`
    );
  } catch (err: any) {
    return serverError(
      res,
      err?.response?.data || err?.message || "TikTok callback failed"
    );
  }
});

/**
 * Debug endpoint (keep this)
 */
router.get("/debug", async (_req: any, res: any): Promise<any>=> {
  try {
    const data = generateTikTokAuthUrl();
    return successResponse(res, "TikTok debug", {
      authorizeUrl: data.url,
      redirectUri: process.env.TIKTOK_REDIRECT_URI,
    });
  } catch (err: any) {
    return serverError(res, err?.message);
  }
});

export default router;
