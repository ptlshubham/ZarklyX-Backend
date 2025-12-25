import express, { Request, Response } from "express";
import { generateGenericAuthUrl, exchangeGenericCodeForTokens, getGenericTokenInfo } from "../../../../../services/google-oauth-service";
import { saveOrUpdateToken, getToken } from "../../../../../services/token-store.service";

const router = express.Router();

// GET /google/auth/url -> unified auth using GOOGLE_SCOPES
router.get("/auth/url", async (req: Request, res: Response): Promise<void> => {
  try {
    const scopesParam = (req.query.scopes as string) || process.env.GOOGLE_SCOPES || "";
    const scopes = scopesParam.split(",").map(s => s.trim()).filter(Boolean);
    if (scopes.length === 0) {
      res.status(400).json({ success: false, message: "No scopes provided. Set GOOGLE_SCOPES in env or pass ?scopes=..." });
      return;
    }
    const url = generateGenericAuthUrl(scopes);
    res.status(200).json({ success: true, url, scopes });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to generate auth URL" });
    return;
  }
});

// GET /google/oauth2callback
router.get("/oauth2callback", async (req: Request, res: Response): Promise<void> => {
  try {
    const code = req.query.code as string;
    if (!code) {
      res.status(400).json({ success: false, message: "Missing 'code' parameter" });
      return;
    }
    const tokens = await exchangeGenericCodeForTokens(code);
    let tokenInfo: any = undefined;
    try {
      if (tokens?.access_token) tokenInfo = await getGenericTokenInfo(tokens.access_token);
    } catch {}
    const requiredScopes = (process.env.GOOGLE_SCOPES || "").split(",").map(s => s.trim()).filter(Boolean);
    const grantedScopes: string[] = tokenInfo?.scope?.split(" ")?.filter(Boolean) || [];
    const missing = requiredScopes.filter(rs => !grantedScopes.includes(rs));
    if (requiredScopes.length > 0 && missing.length > 0) {
      const reconsentUrl = generateGenericAuthUrl(requiredScopes);
      res.status(400).json({ success: false, message: "OAuth succeeded but required scopes were not granted. Please re-consent.", requiredScopes, tokenInfo, reconsentUrl });
      return;
    }

    // Persist tokens (optional identifier: accountEmail via query/header)
    const accountEmail = (req.query.accountEmail as string) || (req.headers["x-account-email"] as string) || null;
    await saveOrUpdateToken({
      accountEmail,
      provider: "google",
      scopes: grantedScopes.length ? grantedScopes : requiredScopes,
      accessToken: tokens.access_token || null,
      refreshToken: tokens.refresh_token || null,
      expiryDate: tokens.expiry_date || null,
      tokenType: tokens.token_type || null,
    });
    res.status(200).json({ success: true, tokens, tokenInfo });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "OAuth callback failed" });
    return;
  }
});

// GET /google/tokens -> fetch stored token by provider and optional accountEmail
router.get("/tokens", async (req: Request, res: Response): Promise<void> => {
  try {
    const provider = (req.query.provider as string) || "google";
    const accountEmail = (req.query.accountEmail as string) || null;
    const token = await getToken(provider, accountEmail);
    res.status(200).json({ success: true, token });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to fetch token" });
    return;
  }
});

// GET /google/tokeninfo -> inspect token scopes
router.get("/tokeninfo", async (req: Request, res: Response): Promise<void> => {
  try {
    const access_token = (req.headers["x-access-token"] as string) || (req.query.access_token as string);
    if (!access_token) {
      res.status(400).json({ success: false, message: "Missing access_token (header x-access-token or query access_token)" });
      return;
    }
    const info = await getGenericTokenInfo(access_token);
    res.status(200).json({ success: true, tokenInfo: info });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to inspect token" });
    return;
  }
});

module.exports = router;
