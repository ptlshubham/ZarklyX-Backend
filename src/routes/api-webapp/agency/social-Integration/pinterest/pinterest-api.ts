import express, { Request, Response } from "express";
import {
  generatePinterestAuthUrl,
  exchangePinterestCodeForTokens,
  refreshPinterestAccessToken,
  getPinterestUser,
  listBoards,
  createPin,
} from "../../../../../services/pinterest-service";
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

// GET /pinterest/auth/url
router.get("/auth/url", async (req: Request, res: Response): Promise<void> => {
  try {
    const scopesParam = (req.query.scopes as string) || process.env.PINTEREST_SCOPES || "user_accounts:read";
    const scopes = scopesParam.split(/[ ,]+/).filter(Boolean);
    const { url, state } = generatePinterestAuthUrl(scopes);
    const clientId = process.env.PINTEREST_APP_ID || process.env.PINTEREST_CLIENT_ID || "";
    res.status(200).json({ success: true, url, state, clientId: clientId.slice(0, 10) + "…" });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || "Failed to generate auth URL" });
  }
});

// GET /pinterest/oauth2callback?code=...
router.get("/oauth2callback", async (req: Request, res: Response): Promise<void> => {
  try {
    const err = (req.query.error as string) || "";
    const errDesc = (req.query.error_description as string) || "";
    if (err) { res.status(400).json({ success: false, error: err, error_description: errDesc }); return; }
    const code = req.query.code as string;
    if (!code) { res.status(400).json({ success: false, message: "Missing 'code' parameter" }); return; }
    const tokenRes = await exchangePinterestCodeForTokens(code);

    // Try to fetch profile to persist accountEmail/username
    let accountEmail: string | null = null;
    let accountId: string | null = null;
    try {
      if (tokenRes?.access_token) {
        const user = await getPinterestUser(tokenRes.access_token);
        accountEmail = (user && (user as any).username) || null; // pinterest returns username, not always email
        accountId = (user && (user as any).id) || null;
      }
    } catch { }

    await saveOrUpdateToken({
      accountEmail: accountEmail,
      provider: "pinterest",
      scopes: (process.env.PINTEREST_SCOPES || "user_accounts:read").split(/[ ,]+/).filter(Boolean),
      accessToken: tokenRes?.access_token || null,
      refreshToken: tokenRes?.refresh_token || null,
      expiryDate: tokenRes?.expires_in ? Date.now() + tokenRes.expires_in * 1000 : null,
      tokenType: tokenRes?.token_type || "Bearer",
    });

    res.status(200).json({ success: true, tokens: tokenRes, accountEmail, accountId });
  } catch (e: any) {
    // Provide more detailed error information when available (service sets `info` on errors)
    const info = e?.info || e?.response?.data || e?.message || "OAuth callback failed";
    console.error("Pinterest oauth2callback error:", info);
    res.status(500).json({ success: false, message: info });
  }
});

// POST /pinterest/token/refresh { refresh_token }
router.post("/token/refresh", async (req: Request, res: Response): Promise<void> => {
  try {
    const rt = (req.body?.refresh_token as string) || (req.query.refresh_token as string) || (req.headers["x-refresh-token"] as string);
    if (!rt) { res.status(400).json({ success: false, message: "Missing refresh_token" }); return; }
    const tokens = await refreshPinterestAccessToken(rt);
    res.status(200).json({ success: true, tokens });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.response?.data || e.message || "Failed to refresh token" });
  }
});

// GET /pinterest/me
router.get("/me", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token) { res.status(400).json({ success: false, message: "Provide access_token" }); return; }
    const me = await getPinterestUser(tokens.access_token);
    res.status(200).json({ success: true, me });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.response?.data || e.message || "Failed to fetch profile" });
  }
});

// GET /pinterest/boards
router.get("/boards", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token) { res.status(400).json({ success: false, message: "Provide access_token" }); return; }
    const boards = await listBoards(tokens.access_token);
    res.status(200).json({ success: true, boards });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.response?.data || e.message || "Failed to fetch boards" });
  }
});

// POST /pinterest/pins/create { board_id, title, link?, media_url? }
router.post("/pins/create", async (req: Request, res: Response): Promise<void> => {
  try {
    const board_id = (req.body?.board_id as string) || (req.query.board_id as string);
    const title = (req.body?.title as string) || (req.query.title as string) || "";
    const link = (req.body?.link as string) || (req.query.link as string) || undefined;
    const media_url = (req.body?.media_url as string) || (req.query.media_url as string) || undefined;

    if (!board_id || !title) { res.status(400).json({ success: false, message: "Missing board_id or title" }); return; }

    const tokens = extractTokens(req);
    if (!tokens.access_token) { res.status(400).json({ success: false, message: "Provide access_token" }); return; }

    const result = await createPin(tokens.access_token, board_id, title, link, media_url);
    res.status(201).json({ success: true, result });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.response?.data || e.message || "Failed to create pin" });
  }
});

module.exports = router;
