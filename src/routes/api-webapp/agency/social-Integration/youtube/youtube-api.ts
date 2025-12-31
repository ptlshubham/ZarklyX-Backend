import express, { Request, Response } from "express";
import { generateAuthUrl, exchangeCodeForTokens, listMyChannels, listMyPlaylists, parseScopes, refreshAccessToken, getAccessTokenInfo, createPlaylist } from "../../../../../services/youtube-service";

const router = express.Router();

// GET /youtube/auth/url -> returns Google OAuth consent URL with YouTube scopes
// router.get("/auth/url", async (req: Request, res: Response): Promise<void> => {
//   try {
//     const scopesParam = (req.query.scopes as string) || process.env.YOUTUBE_SCOPES || "https://www.googleapis.com/auth/youtube.readonly";
//     const scopes = scopesParam.split(",").map(s => s.trim()).filter(Boolean);
//     const url = generateAuthUrl(scopes);
//     res.status(200).json({ success: true, url, scopes });
//     return;
//   } catch (error: any) {
//     res.status(500).json({ success: false, message: error.message || "Failed to generate auth URL" });
//     return;
//   }
// });

// // OAuth2 redirect handler (set this as Authorized redirect URI)
// // GET /youtube/oauth2callback?code=...
// router.get("/oauth2callback", async (req: Request, res: Response): Promise<void> => {
//   try {
//     const code = req.query.code as string;
//     if (!code) {
//       res.status(400).json({ success: false, message: "Missing 'code' parameter" });
//       return;
//     }
//     const tokens = await exchangeCodeForTokens(code);

//     // Validate that granted scopes include the required YouTube scopes
//     const requiredScopes = (process.env.YOUTUBE_SCOPES || "https://www.googleapis.com/auth/youtube.readonly").split(",").map(s => s.trim());
//     let tokenInfo: any = undefined;
//     try {
//       if (tokens?.access_token) {
//         tokenInfo = await getAccessTokenInfo(tokens.access_token);
//       }
//     } catch { /* ignore */ }

//     const grantedScopes: string[] = tokenInfo?.scope?.split(" ")?.filter(Boolean) || [];
//     const missing = requiredScopes.filter(rs => !grantedScopes.includes(rs));
//     if (missing.length > 0) {
//       const reconsentUrl = generateAuthUrl(requiredScopes);
//       res.status(400).json({
//         success: false,
//         message: "OAuth succeeded but required YouTube scopes were not granted. Please re-consent using the provided URL.",
//         requiredScopes,
//         tokenInfo,
//         reconsentUrl,
//       });
//       return;
//     }

//     // Option A: return tokens as JSON (for local testing). In production, you may set an httpOnly cookie or redirect to frontend.
//     res.status(200).json({ success: true, tokens, tokenInfo });
//     return;
//   } catch (error: any) {
//     res.status(500).json({ success: false, message: error.message || "OAuth callback failed" });
//     return;
//   }
// });

/* -------------------- GET AUTH URL -------------------- */
router.get("/auth/url", async (req: Request, res: Response) => {
  try {
    const scopes = parseScopes(
      (req.query.scopes as string) || process.env.YOUTUBE_SCOPES
    );

    const url = generateAuthUrl(scopes);
    res.json({ success: true, url, scopes });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/* -------------------- OAUTH CALLBACK -------------------- */
router.get("/oauth2callback", async (req: Request, res: Response): Promise<void> => {
  try {
    const code = req.query.code as string;
    if (!code) {
      res.status(400).json({ success: false, message: "Missing code" });
      return;
    }

    const tokens = await exchangeCodeForTokens(code);

    let tokenInfo: any = null;
    if (tokens?.access_token) {
      try {
        tokenInfo = await getAccessTokenInfo(tokens.access_token);
      } catch (err) {
        // ignore introspection failure, we'll try to derive scopes from tokens
        tokenInfo = null;
      }
    }

    // Prefer scopes returned by tokeninfo (space-separated). If tokeninfo is
    // not available, fallback to scopes present on the exchanged tokens object
    // (some Google token responses include a `scope` field).
    const grantedScopes = (tokenInfo?.scope?.split(" ").filter(Boolean)) || (tokens?.scope ? tokens.scope.split(" ").filter(Boolean) : []);
    const requiredScopes = parseScopes(process.env.YOUTUBE_SCOPES);

    const missing = requiredScopes.filter(
      scope => !grantedScopes.includes(scope)
    );

    if (missing.length > 0) {
       res.status(400).json({
        success: false,
        message:
          "OAuth succeeded but required YouTube scopes were not granted.",
        requiredScopes,
        grantedScopes,
        reconsentUrl: generateAuthUrl(requiredScopes),
      });
      return
    }

    res.json({ success: true, tokens, tokenInfo });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});
// GET /youtube/me/channels -> requires access_token (and optionally refresh_token) via headers or query
router.get("/me/channels", async (req: Request, res: Response): Promise<void> => {
  try {
    const access_token = (req.headers["x-access-token"] as string) || (req.query.access_token as string) || "";
    const refresh_token = (req.headers["x-refresh-token"] as string) || (req.query.refresh_token as string) || undefined;

    if (!access_token && !refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }

    const data = await listMyChannels({ access_token, refresh_token });
    res.status(200).json({ success: true, data });
    return;
  } catch (error: any) {
    // Improve messaging for insufficient scopes
    const status = error?.code || error?.status || error?.response?.status;
    const googleErrors = error?.errors || error?.response?.data?.error?.errors;
    const reason = Array.isArray(googleErrors) && googleErrors.length > 0 ? googleErrors[0]?.reason : undefined;
    if (status === 403 && (reason === "insufficientPermissions" || /insufficient/i.test(error?.message))) {
      const requiredScopes = (process.env.YOUTUBE_SCOPES || "https://www.googleapis.com/auth/youtube.readonly").split(",").map(s => s.trim());
      let tokenInfo: any = undefined;
      try {
        const token = (req.headers["x-access-token"] as string) || (req.query.access_token as string);
        if (token) tokenInfo = await getAccessTokenInfo(token);
      } catch { /* ignore introspection failures */ }
      res.status(403).json({
        success: false,
        message: "Insufficient permission: request had insufficient authentication scopes.",
        requiredScopes,
        tokenInfo
      });
      return;
    }
    res.status(500).json({ success: false, message: error.message || "Failed to fetch channels" });
    return;
  }
});

// GET /youtube/me/playlists -> lists playlists for the authorized channel
router.get("/me/playlists", async (req: Request, res: Response): Promise<void> => {
  try {
    const access_token = (req.headers["x-access-token"] as string) || (req.query.access_token as string) || "";
    const refresh_token = (req.headers["x-refresh-token"] as string) || (req.query.refresh_token as string) || undefined;
    const pageToken = (req.query.pageToken as string) || undefined;

    if (!access_token && !refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }

    const data = await listMyPlaylists({ access_token, refresh_token }, pageToken);
    res.status(200).json({ success: true, data });
    return;
  } catch (error: any) {
    const status = error?.code || error?.status || error?.response?.status;
    const googleErrors = error?.errors || error?.response?.data?.error?.errors;
    const reason = Array.isArray(googleErrors) && googleErrors.length > 0 ? googleErrors[0]?.reason : undefined;
    if (status === 403 && (reason === "insufficientPermissions" || /insufficient/i.test(error?.message))) {
      const requiredScopes = (process.env.YOUTUBE_SCOPES || "https://www.googleapis.com/auth/youtube.readonly").split(",").map(s => s.trim());
      let tokenInfo: any = undefined;
      try {
        const token = (req.headers["x-access-token"] as string) || (req.query.access_token as string);
        if (token) tokenInfo = await getAccessTokenInfo(token);
      } catch { /* ignore */ }
      res.status(403).json({
        success: false,
        message: "Insufficient permission: request had insufficient authentication scopes.",
        requiredScopes,
        tokenInfo
      });
      return;
    }
    res.status(500).json({ success: false, message: error.message || "Failed to fetch playlists" });
    return;
  }
});

// POST /youtube/playlists/create -> create a new playlist
router.post("/playlists/create", async (req: Request, res: Response): Promise<void> => {
  try {
    const access_token = (req.headers["x-access-token"] as string) || (req.query.access_token as string) || (req.body?.access_token as string) || "";
    const refresh_token = (req.headers["x-refresh-token"] as string) || (req.query.refresh_token as string) || (req.body?.refresh_token as string) || undefined;

    if (!access_token && !refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }

    const { title, description, privacyStatus } = req.body || {};
    if (!title || typeof title !== "string") {
      res.status(400).json({ success: false, message: "Missing required field: title" });
      return;
    }

    const data = await createPlaylist({ access_token, refresh_token }, title, description, (privacyStatus as any) || "private");
    res.status(201).json({ success: true, data });
    return;
  } catch (error: any) {
    const status = error?.code || error?.status || error?.response?.status;
    const googleErrors = error?.errors || error?.response?.data?.error?.errors;
    const reason = Array.isArray(googleErrors) && googleErrors.length > 0 ? googleErrors[0]?.reason : undefined;
    if (status === 403 && (reason === "insufficientPermissions" || /insufficient/i.test(error?.message))) {
      const requiredScopes = (process.env.YOUTUBE_SCOPES || "https://www.googleapis.com/auth/youtube.readonly").split(",").map(s => s.trim());
      let tokenInfo: any = undefined;
      try {
        const token = (req.headers["x-access-token"] as string) || (req.query.access_token as string) || (req.body?.access_token as string);
        if (token) tokenInfo = await getAccessTokenInfo(token);
      } catch { /* ignore */ }
      res.status(403).json({
        success: false,
        message: "Insufficient permission: request had insufficient authentication scopes.",
        requiredScopes,
        tokenInfo
      });
      return;
    }
    res.status(500).json({ success: false, message: error.message || "Failed to create playlist" });
    return;
  }
});

// POST /youtube/token/refresh -> exchange refresh_token for a new access_token
router.post("/token/refresh", async (req: Request, res: Response): Promise<void> => {
  try {
    const refresh_token = (req.body?.refresh_token as string) || (req.headers["x-refresh-token"] as string) || (req.query.refresh_token as string);
    if (!refresh_token) {
      res.status(400).json({ success: false, message: "Missing refresh_token" });
      return;
    }
    const creds = await refreshAccessToken(refresh_token);
    res.status(200).json({ success: true, tokens: creds });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to refresh access token" });
    return;
  }
});

// GET /youtube/tokeninfo -> quick token introspection to see granted scopes
router.get("/tokeninfo", async (req: Request, res: Response): Promise<void> => {
  try {
    const access_token = (req.headers["x-access-token"] as string) || (req.query.access_token as string);
    if (!access_token) {
      res.status(400).json({ success: false, message: "Missing access_token (pass via x-access-token header or access_token query)" });
      return;
    }
    const info = await getAccessTokenInfo(access_token);
    res.status(200).json({ success: true, tokenInfo: info });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to inspect token" });
    return;
  }
});

module.exports = router;
