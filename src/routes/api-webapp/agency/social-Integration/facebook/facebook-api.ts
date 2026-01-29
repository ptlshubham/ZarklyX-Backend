import express, { Request, Response } from "express";
import {
  generateFacebookAuthUrl,
  exchangeFacebookCodeForTokens,
  exchangeShortLivedForLongLived,
  getFacebookUser,
  getFacebookPages,
  postToFacebookPage,
  getFacebookDebugToken,
} from "../../../../../services/facebook-service";
import { saveOrUpdateToken } from "../../../../../services/token-store.service";

const router = express.Router();

function extractTokens(req: Request) {
  const at = ((req.headers["x-access-token"] as string) || (req.query.access_token as string) || (req.body?.access_token as string) || "").trim();
  const rt = ((req.headers["x-refresh-token"] as string) || (req.query.refresh_token as string) || (req.body?.refresh_token as string) || "").trim();
  const tokens: any = {};
  if (at) tokens.access_token = at;
  if (rt) tokens.refresh_token = rt;
  return tokens;
}

// GET /facebook/auth/url
router.get("/auth/url", async (req: Request, res: Response): Promise<void> => {
  try {
    const scopesParam = (req.query.scopes as string) || process.env.FACEBOOK_SCOPES || "email,public_profile,pages_show_list,pages_read_engagement,pages_manage_posts";
    const scopes = scopesParam.split(/[ ,]+/).filter(Boolean);
    const { url, state } = generateFacebookAuthUrl(scopes);
    const expectedRedirectUri = process.env.FACEBOOK_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/facebook/oauth2callback`;
    // prefer FACEBOOK_APP_ID but fall back to FACEBOOK_CLIENT_ID for backwards compatibility
    const clientId = process.env.FACEBOOK_APP_ID || process.env.FACEBOOK_CLIENT_ID || "";
    res.status(200).json({ success: true, url, state, expectedRedirectUri, clientId: clientId.slice(0, 10) + "…" });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || "Failed to generate auth URL" });
  }
});

// GET /facebook/oauth2callback?code=...
router.get("/oauth2callback", async (req: Request, res: Response): Promise<void> => {
  try {
    const err = (req.query.error as string) || "";
    const errDesc = (req.query.error_description as string) || "";
    if (err) {
      res.status(400).json({ success: false, error: err, error_description: errDesc });
      return;
    }
    const code = req.query.code as string;
    if (!code) { res.status(400).json({ success: false, message: "Missing 'code' parameter" }); return; }
    const tokenRes = await exchangeFacebookCodeForTokens(code);

    // Optionally exchange for a long-lived token
    let finalToken = tokenRes;
    try {
      finalToken = await exchangeShortLivedForLongLived(tokenRes.access_token);
    } catch (e) {
      // ignore exchange failure, continue with short-lived token
    }

    // Try to fetch profile/email to persist with accountEmail
    let email: string | null = null;
    try {
      if (finalToken?.access_token) {
        const u = await getFacebookUser(finalToken.access_token);
        email = (u && (u as any).email) || null;
      }
    } catch { }

    await saveOrUpdateToken({
      accountEmail: email,
      provider: "facebook",
      scopes: (process.env.FACEBOOK_SCOPES || "email,public_profile,pages_show_list,pages_read_engagement,pages_manage_posts").split(/[ ,]+/).filter(Boolean),
      accessToken: finalToken?.access_token || null,
      refreshToken: null,
      expiryDate: finalToken?.expires_in ? Date.now() + finalToken.expires_in * 1000 : null,
      tokenType: finalToken?.token_type || "Bearer",
    });

    res.status(200).json({ success: true, tokens: finalToken, accountEmail: email });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.response?.data || e.message || "OAuth callback failed" });
  }
});

// POST /facebook/token/refresh { access_token }
router.post("/token/refresh", async (req: Request, res: Response): Promise<void> => {
  try {
    const at = (req.body?.access_token as string) || (req.query.access_token as string) || (req.headers["x-access-token"] as string);
    if (!at) { res.status(400).json({ success: false, message: "Missing access_token" }); return; }
    const tokens = await exchangeShortLivedForLongLived(at);
    res.status(200).json({ success: true, tokens });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.response?.data || e.message || "Failed to refresh token" });
  }
});

// GET /facebook/me
router.get("/me", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token) { res.status(400).json({ success: false, message: "Provide access_token" }); return; }
    const me = await getFacebookUser(tokens.access_token);
    res.status(200).json({ success: true, me });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.response?.data || e.message || "Failed to fetch profile" });
  }
});

// GET /facebook/pages
router.get("/pages", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token) { res.status(400).json({ success: false, message: "Provide access_token" }); return; }
    const pages = await getFacebookPages(tokens.access_token);
    res.status(200).json({ success: true, pages });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.response?.data || e.message || "Failed to fetch pages" });
  }
});

// POST /facebook/pages/:pageId/post { message, page_access_token? }
router.post("/pages/:pageId/post", async (req: Request, res: Response): Promise<void> => {
  try {
    const pageId = req.params.pageId;
    const text = (req.body?.message as string) || (req.query?.message as string);
    const providedPageToken = (req.body?.page_access_token as string) || (req.query?.page_access_token as string);

    if (!text) { res.status(400).json({ success: false, message: "Missing message" }); return; }

    let pageToken = providedPageToken || null;
    if (!pageToken) {
      const tokens = extractTokens(req);
      if (!tokens.access_token) { res.status(400).json({ success: false, message: "Provide access_token or page_access_token" }); return; }
      const pages = await getFacebookPages(tokens.access_token);
      const data = pages?.data || [];
      const match = data.find((p: any) => String(p.id) === String(pageId));
      pageToken = match?.access_token || null;
    }

    if (!pageToken) { res.status(400).json({ success: false, message: "Could not determine page access token" }); return; }

    const result = await postToFacebookPage(pageId, pageToken, text);
    res.status(200).json({ success: true, result });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.response?.data || e.message || "Failed to post to page" });
  }
});

// GET /facebook/debug?token=...
router.get("/debug", async (req: Request, res: Response): Promise<void> => {
  try {
    const inputToken = (req.query.token as string) || (req.query.access_token as string) || "";
    const debug = inputToken ? await getFacebookDebugToken(inputToken) : null;
    const expectedRedirectUri = process.env.FACEBOOK_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/facebook/oauth2callback`;
    const clientId = process.env.FACEBOOK_APP_ID || process.env.FACEBOOK_CLIENT_ID || "";
    const scopes = (process.env.FACEBOOK_SCOPES || "email,public_profile,pages_show_list,pages_read_engagement,pages_manage_posts").split(/[ ,]+/).filter(Boolean);
    res.status(200).json({ success: true, expectedRedirectUri, clientIdStart: clientId.slice(0, 10) + "…", scopes, debug });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || "Failed to read config" });
  }
});

module.exports = router;
