import express, { Request, Response } from "express";
import { generateDriveAuthUrl, exchangeDriveCodeForTokens, listMyDriveFiles, getDriveFileMetadata, refreshDriveAccessToken, getDriveAccessTokenInfo, downloadDriveFileStream, exportDriveFileStream, uploadDriveFile, createDriveFolder, listDriveFolderChildren, moveDriveFile, setDriveFilePermission, readDriveFileAsBase64 } from "../../../../../services/drive-service";
import { sendEmailWithAttachments } from "../../../../../services/gmail-service";
import multer from "multer";
import { saveOrUpdateToken, updateAccessToken } from "../../../../../services/token-store.service";

const router = express.Router();

// Helper: extract tokens from headers/query
function extractTokens(req: Request) {
  const access_token = ((req.headers["x-access-token"] as string) || (req.query.access_token as string) || (req.body?.access_token as string) || "").trim();
  const refresh_token = ((req.headers["x-refresh-token"] as string) || (req.query.refresh_token as string) || (req.body?.refresh_token as string) || "").trim();
  const tokens: any = {};
  if (access_token) tokens.access_token = access_token;
  if (refresh_token) tokens.refresh_token = refresh_token;
  return tokens;
}

// Multer memory upload for sending data directly to Drive
const memoryUpload = multer({ storage: multer.memoryStorage() });

// GET /drive/auth/url
router.get("/auth/url", async (req: Request, res: Response): Promise<void> => {
  try {
    // Prefer unified GOOGLE_SCOPES, then DRIVE_SCOPES; allow override via ?scopes=csv
    const scopesParam =
      (req.query.scopes as string) ||
      process.env.GOOGLE_SCOPES ||
      process.env.DRIVE_SCOPES ||
      "https://www.googleapis.com/auth/drive.readonly";
    const scopes = scopesParam.split(",").map(s => s.trim()).filter(Boolean);
    const url = generateDriveAuthUrl(scopes);
    const expectedRedirectUri = (
      process.env.DRIVE_REDIRECT_URI ||
      process.env.GOOGLE_REDIRECT_URI ||
      `${process.env.API_URL || "http://localhost:9005"}/drive/oauth2callback`
    );
    res.status(200).json({ success: true, url, scopes, expectedRedirectUri, clientId: (process.env.GOOGLE_CLIENT_ID || "").slice(0,10) + "…" });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to generate auth URL" });
    return;
  }
});

// GET /drive/oauth2callback
router.get("/oauth2callback", async (req: Request, res: Response): Promise<void> => {
  try {
    const code = req.query.code as string;
    if (!code) {
      res.status(400).json({ success: false, message: "Missing 'code' parameter" });
      return;
    }
    const tokens = await exchangeDriveCodeForTokens(code);

    // Validate against the unified scopes if configured
    const requiredScopes = (
      process.env.GOOGLE_SCOPES ||
      process.env.DRIVE_SCOPES ||
      "https://www.googleapis.com/auth/drive.readonly"
    )
      .split(",")
      .map(s => s.trim());
    let tokenInfo: any = undefined;
    try {
      if (tokens?.access_token) tokenInfo = await getDriveAccessTokenInfo(tokens.access_token);
    } catch {}
    const grantedScopes: string[] = tokenInfo?.scope?.split(" ")?.filter(Boolean) || [];
    const missing = requiredScopes.filter(rs => !grantedScopes.includes(rs));
    if (missing.length > 0) {
      const reconsentUrl = generateDriveAuthUrl(requiredScopes);
      res.status(400).json({ success: false, message: "OAuth succeeded but required Drive scopes were not granted. Please re-consent.", requiredScopes, tokenInfo, reconsentUrl });
      return;
    }

    // Persist Drive tokens
    const accountEmail = (req.query.accountEmail as string) || (req.headers["x-account-email"] as string) || null;
    await saveOrUpdateToken({
      accountEmail,
      provider: "drive",
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

// GET /drive/me/files
router.get("/me/files", async (req: Request, res: Response): Promise<void> => {
  try {
    const { access_token, refresh_token } = extractTokens(req);
    const pageToken = (req.query.pageToken as string) || undefined;
    const pageSize = parseInt((req.query.pageSize as string) || "25", 10);
    const q = (req.query.q as string) || undefined; // optional search query

    if (!access_token && !refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }

    const data = await listMyDriveFiles({ access_token, refresh_token }, pageToken, pageSize, q);
    res.status(200).json({ success: true, data });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to list Drive files" });
    return;
  }
});

// GET /drive/file/:id
router.get("/file/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const access_token = (req.headers["x-access-token"] as string) || (req.query.access_token as string) || "";
    const refresh_token = (req.headers["x-refresh-token"] as string) || (req.query.refresh_token as string) || undefined;
    const fileId = req.params.id;
    if (!fileId) {
      res.status(400).json({ success: false, message: "Missing file id" });
      return;
    }
    const data = await getDriveFileMetadata({ access_token, refresh_token }, fileId);
    res.status(200).json({ success: true, data });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to get file metadata" });
    return;
  }
});

// POST /drive/token/refresh
router.post("/token/refresh", async (req: Request, res: Response): Promise<void> => {
  try {
    const refresh_token = (req.body?.refresh_token as string) || (req.headers["x-refresh-token"] as string) || (req.query.refresh_token as string);
    if (!refresh_token) {
      res.status(400).json({ success: false, message: "Missing refresh_token" });
      return;
    }
    const creds = await refreshDriveAccessToken(refresh_token);
    // Optionally update store
    const accountEmail = (req.body?.accountEmail as string) || (req.headers["x-account-email"] as string) || (req.query.accountEmail as string) || null;
    if (accountEmail) {
      await updateAccessToken("drive", accountEmail, creds.access_token!, creds.expiry_date || null, creds.token_type || null);
    }
    res.status(200).json({ success: true, tokens: creds });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to refresh access token" });
    return;
  }
});

// GET /drive/tokeninfo
router.get("/tokeninfo", async (req: Request, res: Response): Promise<void> => {
  try {
    const access_token = (req.headers["x-access-token"] as string) || (req.query.access_token as string);
    if (!access_token) {
      res.status(400).json({ success: false, message: "Missing access_token" });
      return;
    }
    const info = await getDriveAccessTokenInfo(access_token);
    res.status(200).json({ success: true, tokenInfo: info });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to inspect token" });
    return;
  }
});

// POST /drive/me/files/upload  (multipart/form-data; field "file")
router.post("/me/files/upload", memoryUpload.single("file"), async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ success: false, message: "Missing file" });
      return;
    }
    const parentsParam = (req.body?.parentId as string) || (req.query?.parentId as string);
    const parents = parentsParam ? [parentsParam] : undefined;
    const uploaded = await uploadDriveFile(tokens, {
      name: file.originalname,
      mimeType: file.mimetype || "application/octet-stream",
      data: file.buffer,
      parents,
    });
    res.status(200).json({ success: true, file: uploaded });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to upload file" });
  }
});

// POST /drive/me/folders  { name, parentId? }
router.post("/me/folders", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    const name = (req.body?.name as string) || (req.query?.name as string);
    const parentId = (req.body?.parentId as string) || (req.query?.parentId as string) || undefined;
    if (!name) {
      res.status(400).json({ success: false, message: "Missing folder name" });
      return;
    }
    const folder = await createDriveFolder(tokens, name, parentId);
    res.status(200).json({ success: true, folder });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to create folder" });
  }
});

// GET /drive/me/folders/:id/children
router.get("/me/folders/:id/children", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    const folderId = req.params.id;
    const pageToken = (req.query.pageToken as string) || undefined;
    const pageSize = parseInt((req.query.pageSize as string) || "25", 10);
    const q = (req.query.q as string) || undefined;
    const data = await listDriveFolderChildren(tokens, folderId, pageToken, pageSize, q);
    res.status(200).json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to list folder children" });
  }
});

// POST /drive/me/files/:id/move  { newParentId }
router.post("/me/files/:id/move", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    const fileId = req.params.id;
    const newParentId = (req.body?.newParentId as string) || (req.query?.newParentId as string);
    if (!fileId || !newParentId) {
      res.status(400).json({ success: false, message: "Missing file id or newParentId" });
      return;
    }
    const result = await moveDriveFile(tokens, fileId, newParentId);
    res.status(200).json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to move file" });
  }
});

// POST /drive/me/files/:id/share  { role, type, emailAddress?, domain?, allowFileDiscovery? }
router.post("/me/files/:id/share", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    const fileId = req.params.id;
    const { role, type, emailAddress, domain, allowFileDiscovery } = req.body || {};
    if (!fileId || !role || !type) {
      res.status(400).json({ success: false, message: "Missing fileId, role or type" });
      return;
    }
    const perm = await setDriveFilePermission(tokens, fileId, { role, type, emailAddress, domain, allowFileDiscovery }, false);
    res.status(200).json({ success: true, permission: perm });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to share file" });
  }
});

// POST /drive/me/files/:id/send-email
// Body: { from, to, subject, text?, html? }
// Headers: x-gmail-access-token/x-gmail-refresh-token OR generic x-access-token/x-refresh-token with Gmail scopes
router.post("/me/files/:id/send-email", async (req: Request, res: Response): Promise<void> => {
  try {
    // Drive tokens for reading the file (fallback to generic)
    const driveTokens = {
      access_token: ((req.headers["x-drive-access-token"] as string) || (req.query["drive_access_token"] as string) || (req.headers["x-access-token"] as string) || (req.query["access_token"] as string) || "").trim(),
      refresh_token: ((req.headers["x-drive-refresh-token"] as string) || (req.query["drive_refresh_token"] as string) || (req.headers["x-refresh-token"] as string) || (req.query["refresh_token"] as string) || "").trim(),
    } as any;

    if (!driveTokens.access_token && !driveTokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide Drive access_token or refresh_token" });
      return;
    }

    // Gmail tokens for sending
    const gmailTokens = {
      access_token: ((req.headers["x-gmail-access-token"] as string) || (req.query["gmail_access_token"] as string) || (req.headers["x-access-token"] as string) || (req.query["access_token"] as string) || "").trim(),
      refresh_token: ((req.headers["x-gmail-refresh-token"] as string) || (req.query["gmail_refresh_token"] as string) || (req.headers["x-refresh-token"] as string) || (req.query["refresh_token"] as string) || "").trim(),
    } as any;

    const fileId = req.params.id;
    const { from, to, subject, text, html } = req.body || {};
    if (!fileId || !from || !to || !subject) {
      res.status(400).json({ success: false, message: "Missing fileId, from, to or subject" });
      return;
    }

    const fileData = await readDriveFileAsBase64(driveTokens, fileId);
    const resp = await sendEmailWithAttachments(gmailTokens, {
      from, to, subject, text, html,
      attachments: [{ filename: fileData.name, mimeType: fileData.mimeType, base64: fileData.base64 }],
    });
    res.status(200).json({ success: true, messageId: resp.id, labelIds: resp.labelIds });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to send email with Drive file" });
  }
});

// Convenience: export a Google Doc to PDF quickly
router.get("/me/files/export-pdf/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    const fileId = req.params.id;
    const { stream } = await exportDriveFileStream(tokens, fileId, "application/pdf");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${(req.query.filename as string) || fileId}.pdf"`);
    stream.on("error", (err) => {
      if (!res.headersSent) res.status(500).json({ success: false, message: err?.message || "Stream error" });
    });
    stream.pipe(res);
  } catch (error: any) {
    if (!res.headersSent) res.status(500).json({ success: false, message: error.message || "Failed to export PDF" });
  }
});

// GET /drive/me/files/download/:id?disposition=inline|attachment&filename=...
router.get("/me/files/download/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    const fileId = req.params.id;
    if (!fileId) {
      res.status(400).json({ success: false, message: "Missing file id" });
      return;
    }
    const meta = await getDriveFileMetadata(tokens, fileId);
    // Google Docs types must be exported instead of downloaded
    if ((meta.mimeType || "").startsWith("application/vnd.google-apps")) {
      res.status(400).json({ success: false, message: "This is a Google Docs type. Use /drive/me/files/export/:id?mimeType=..." , meta });
      return;
    }
    const { stream } = await downloadDriveFileStream(tokens, fileId);
    const filename = (req.query.filename as string) || meta.name || `${fileId}`;
    const disposition = (req.query.disposition as string) || "inline";
    res.setHeader("Content-Type", meta.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `${disposition}; filename="${filename.replace(/"/g, '')}"`);
    stream.on("error", (err) => {
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: err?.message || "Stream error" });
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  } catch (error: any) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: error.message || "Failed to download file" });
    }
  }
});

// GET /drive/me/files/export/:id?mimeType=application/pdf&disposition=attachment&filename=
// drive/me/files/export/15fVKkZa7bfmg5Tcw-y-H0MiVqZv6USoC?mineType=text/x-sql/pdf&disposition=attachment&filename=company.sql
router.get("/me/files/export/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    const fileId = req.params.id;
    const mimeType = (req.query.mimeType as string) || "";
    if (!fileId || !mimeType) {
      res.status(400).json({ success: false, message: "Missing file id or mimeType" });
      return;
    }
    const meta = await getDriveFileMetadata(tokens, fileId);
    const { stream } = await exportDriveFileStream(tokens, fileId, mimeType);
    const filename = (req.query.filename as string) || `${meta?.name || fileId}`;
    const disposition = (req.query.disposition as string) || "inline";
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `${disposition}; filename="${filename.replace(/"/g, '')}"`);
    stream.on("error", (err) => {
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: err?.message || "Stream error" });
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  } catch (error: any) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: error.message || "Failed to export file" });
    }
  }
});

// GET /drive/debug -> show effective config
router.get("/debug", async (_req: Request, res: Response): Promise<void> => {
  try {
    const expectedRedirectUri = (
      process.env.DRIVE_REDIRECT_URI ||
      process.env.GOOGLE_REDIRECT_URI ||
      `${process.env.API_URL || "http://localhost:9005"}/drive/oauth2callback`
    );
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const scopes = (process.env.GOOGLE_SCOPES || process.env.DRIVE_SCOPES || "https://www.googleapis.com/auth/drive.readonly")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    res.status(200).json({ success: true, expectedRedirectUri, clientIdStart: clientId.slice(0,10)+"…", scopes });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || "Failed to read config" });
  }
});

module.exports = router;
