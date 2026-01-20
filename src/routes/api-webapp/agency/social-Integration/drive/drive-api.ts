import express, { Request, Response } from "express";
import { generateDriveAuthUrl, exchangeDriveCodeForTokens, listMyDriveFiles, getDriveFileMetadata, refreshDriveAccessToken, getDriveAccessTokenInfo, downloadDriveFileStream, exportDriveFileStream, uploadDriveFile, createDriveFolder, listDriveFolderChildren, moveDriveFile, setDriveFilePermission, readDriveFileAsBase64, getGoogleUser, updateFolderColor, updateItemStarred, renameDriveItem, moveItemToFolder } from "../../../../../services/drive-service";
import { getPreviewStream } from "../../../../../services/drive-preview.service";
import jwt from "jsonwebtoken";
import axios from "axios";
import JSZip from "jszip";
import { sendEmailWithAttachments } from "../../../../../services/gmail-service";
import multer from "multer";
import { saveOrUpdateToken, updateAccessToken, getConnectedDrivesByCompanyId, deleteTokensByCompanyIdAndProvider } from "../../../../../services/token-store.service";
import { notifySocialConnectionAdded, notifySocialConnectionRemoved } from "../../../../../services/socket-service";
import { v4 as uuidv4 } from "uuid";

// Server-side temporary store for OAuth state (alternative to session)
const oauthStateStore = new Map<string, { companyId: string; timestamp: number }>();

// Clean up expired state entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of oauthStateStore.entries()) {
    if (now - value.timestamp > 30 * 60 * 1000) { // 30 minute expiry
      oauthStateStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

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

// Helper: Ensure access token is valid, refresh if needed
async function ensureValidAccessToken(tokens: any): Promise<void> {
  if (!tokens.access_token && tokens.refresh_token) {
    console.log('🔄 No access token, attempting to refresh using refresh token...');
    try {
      const refreshed = await refreshDriveAccessToken(tokens.refresh_token);
      tokens.access_token = refreshed.access_token;
    } catch (error: any) {
      console.error('❌ Failed to refresh token:', error.message);
      throw new Error('Failed to refresh access token');
    }
  }
}

// Helper: Download multiple files with concurrency control
async function downloadFilesInParallel(
  files: Array<{ id: string; name: string; mimeType?: string }>,
  tokens: any,
  concurrency: number = 15
): Promise<Array<{ name: string; buffer: Buffer }>> {
  const results: Array<{ name: string; buffer: Buffer }> = [];
  const fileQueue = [...files];
  const activeDownloads: Promise<void>[] = [];

  // Map Google Docs types to Microsoft formats
  const googleToMicrosoftMap: { [key: string]: { mimeType: string; extension: string; name: string } } = {
    'application/vnd.google-apps.document': {
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extension: '.docx',
      name: 'Word Document'
    },
    'application/vnd.google-apps.spreadsheet': {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: '.xlsx',
      name: 'Excel Spreadsheet'
    },
    'application/vnd.google-apps.presentation': {
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      extension: '.pptx',
      name: 'PowerPoint Presentation'
    },
    'application/vnd.google-apps.drawing': {
      mimeType: 'application/pdf',
      extension: '.pdf',
      name: 'PDF Drawing'
    },
    'application/vnd.google-apps.form': {
      mimeType: 'application/pdf',
      extension: '.pdf',
      name: 'PDF Form'
    }
  };

  const downloadFile = async (file: { id: string; name: string; mimeType?: string }) => {
    try {
      const fileName = file.name;
      const mimeType = file.mimeType || "";
      
      // Check if it's a Google Docs type
      if (mimeType.startsWith("application/vnd.google-apps")) {
        const exportConfig = googleToMicrosoftMap[mimeType] || {
          mimeType: 'application/pdf',
          extension: '.pdf',
          name: 'PDF'
        };
        
        const { stream } = await exportDriveFileStream(tokens, file.id, exportConfig.mimeType);
        const finalName = fileName.replace(/\.[^.]*$/, '') + exportConfig.extension;
        const chunks: Buffer[] = [];

        return new Promise<void>((resolve, reject) => {
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", () => {
            const fileBuffer = Buffer.concat(chunks);
            results.push({ name: finalName, buffer: fileBuffer });
            resolve();
          });
          stream.on("error", reject);
        });
      }
      
      // Regular file download
      const { stream } = await downloadDriveFileStream(tokens, file.id);
      const chunks: Buffer[] = [];

      return new Promise<void>((resolve, reject) => {
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => {
          const fileBuffer = Buffer.concat(chunks);
          results.push({ name: fileName, buffer: fileBuffer });
          resolve();
        });
        stream.on("error", reject);
      });
    } catch (error: any) {
      console.warn(`⚠️ Failed to download ${file.name}: ${error.message}`);
      // Continue with other files
    }
  };

  // Process files with concurrency limit
  while (fileQueue.length > 0 || activeDownloads.length > 0) {
    // Start new downloads if under concurrency limit
    while (activeDownloads.length < concurrency && fileQueue.length > 0) {
      const file = fileQueue.shift()!;
      const downloadPromise = downloadFile(file).then(() => {
        activeDownloads.splice(activeDownloads.indexOf(downloadPromise), 1);
      }).catch((error) => {
        console.error(`❌ Error downloading ${file.name}:`, error.message);
        activeDownloads.splice(activeDownloads.indexOf(downloadPromise), 1);
      });
      activeDownloads.push(downloadPromise);
    }

    // Wait for at least one download to complete before continuing
    if (activeDownloads.length > 0) {
      await Promise.race(activeDownloads);
    }
  }

  return results;
}


// Multer memory upload for sending data directly to Drive
const memoryUpload = multer({ storage: multer.memoryStorage() });



/**
 * 📋 API DOCUMENTATION - GOOGLE DRIVE INTEGRATION ENDPOINTS
 * ========================================================
 * All endpoints require tokens (access_token or refresh_token) via headers, query params, or body
 * Token sources: x-access-token, x-refresh-token headers OR access_token, refresh_token query params/body
 */

/**
 * 🔐 AUTHENTICATION ENDPOINTS
 */

/**
 * ✅ GET /drive/auth/url
 * Purpose: Generate OAuth authorization URL for Google Drive authentication
 * Params: 
 *   - companyId (required, query): Company ID to associate with the drive account
 *   - scopes (optional, query): Comma-separated OAuth scopes (default: drive.readonly)
 * Returns: { success, url, scopes, expectedRedirectUri, clientId, companyId }
 * Usage: Frontend redirects user to returned 'url' for Google login
 */
router.get("/auth/url", async (req: Request, res: Response): Promise<void> => {
  try {
    // Prefer unified GOOGLE_SCOPES, then DRIVE_SCOPES; allow override via ?scopes=csv
    const scopesParam =
      (req.query.scopes as string) ||
      process.env.GOOGLE_SCOPES ||
      process.env.DRIVE_SCOPES ||
      "https://www.googleapis.com/auth/drive.readonly";
    const scopes = scopesParam.split(",").map(s => s.trim()).filter(Boolean);

    // Capture companyId from query params to pass through OAuth flow
    const companyId = req.query.companyId as string;

    if (!companyId) {
      res.status(400).json({ error: "companyId is required" });
      return;
    }

    // Generate unique state identifier
    const stateId = uuidv4();

    // Store companyId in server-side state store (more reliable than session for OAuth)
    oauthStateStore.set(stateId, {
      companyId: companyId,
      timestamp: Date.now()
    });

    const url = generateDriveAuthUrl(scopes, stateId, "offline", "consent");

    const expectedRedirectUri = (
      process.env.DRIVE_REDIRECT_URI ||
      process.env.GOOGLE_REDIRECT_URI ||
      `${process.env.API_URL || "http://localhost:9005"}/drive/oauth2callback`
    );

    res.status(200).json({
      success: true,
      url,
      scopes,
      expectedRedirectUri,
      clientId: (process.env.GOOGLE_CLIENT_ID || "").slice(0, 10) + "…",
      companyId: companyId || null
    });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to generate auth URL" });
    return;
  }
});

/**
 * ✅ GET /drive/oauth2callback
 * Purpose: OAuth callback endpoint - receives auth code from Google and exchanges for tokens
 * Params:
 *   - code (required, query): Authorization code from Google OAuth
 *   - state (required, query): State parameter linking to companyId
 * Returns: Redirects to frontend with tokens in URL parameters
 * Stores: Saves tokens to database and broadcasts connection to company users
 * Note: Automatically handles token extraction and company notification
 */
router.get("/oauth2callback", async (req: Request, res: Response): Promise<void> => {
  try {
    const code = req.query.code as string;
    const state = req.query.state as string;

    if (!code) {
      res.status(400).json({ success: false, message: "Missing code" });
      return;
    }

    const tokens = await exchangeDriveCodeForTokens(code);

    let accountEmail: string | null = null;
    let accountId: string | null = null;

    if (tokens.id_token) {
      const decoded: any = jwt.decode(tokens.id_token);
      accountEmail = decoded?.email || null;
      accountId = decoded?.sub || null;
    }

    if (!accountEmail && tokens.access_token) {
      const userinfo = await axios.get(
        "https://openidconnect.googleapis.com/v1/userinfo",
        {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        }
      );
      accountEmail = userinfo.data.email;
      accountId = userinfo.data.sub;
    }

    if (!accountEmail) {
      res.status(400).json({
        success: false,
        message: "Failed to resolve Google account email",
      });
      return;
    }

    // Retrieve companyId from state store (more reliable than session for OAuth)
    let companyId: string | null = null;

    if (state) {
      if (oauthStateStore.has(state)) {
        const stateData = oauthStateStore.get(state);
        if (stateData) {
          const timestamp = stateData.timestamp;

          // Check if state data is still valid (within 30 minutes)
          if (Date.now() - timestamp < 30 * 60 * 1000) {
            companyId = stateData.companyId;
          } else {
            console.warn("⚠️ [OAUTH2CALLBACK] State data expired in store");
          }
        }

        // Clean up state after use
        oauthStateStore.delete(state);
      } else {
        console.warn("⚠️ [OAUTH2CALLBACK] State NOT FOUND in store. State:", state);
      }
    } else {
      console.warn("⚠️ [OAUTH2CALLBACK] No state parameter in URL");
    }

    // Save tokens with companyId for multiple drives support
    await saveOrUpdateToken({
      provider: "google",
      accountEmail,
      accountId,
      companyId,
      scopes: (process.env.GOOGLE_SCOPES || "").split(","),
      accessToken: tokens.access_token || null,
      refreshToken: tokens.refresh_token || null,
      expiryDate: tokens.expiry_date || null,
      tokenType: tokens.token_type || "Bearer",
    });

    // 🔥 BROADCAST: Notify all company users about the new drive connection
    if (companyId) {
      notifySocialConnectionAdded(companyId, {
        provider: "google-drive",
        accountEmail,
        accountId: accountId || undefined,
        accountName: accountEmail.split("@")[0],
      });
    }

    // Redirect to frontend with tokens in URL parameters
    const frontendCallback = `${process.env.ADMIN_URL || 'http://localhost:4200'}/auth/oauth2callback?accessToken=${encodeURIComponent(tokens.access_token || '')}&refreshToken=${encodeURIComponent(tokens.refresh_token || '')}&expiryDate=${tokens.expiry_date || ''}&tokenType=${tokens.token_type || 'Bearer'}&success=true`;
    res.redirect(frontendCallback);

  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 👤 USER/PROFILE ENDPOINTS
 */

/**
 * ✅ GET /drive/me/profile
 * Purpose: Get authenticated user's Google Drive profile and storage quota info
 * Params: Tokens via headers/query (x-access-token, x-refresh-token)
 * Returns: { success, user: {displayName, emailAddress, ...}, storageQuota: {limit, usage} }
 * Auto-refresh: Automatically refreshes expired access tokens using refresh_token
 * Usage: Display user info and storage usage in frontend dashboard
 */
router.get("/me/profile", async (req: Request, res: Response): Promise<void> => {
  try {
    let { access_token, refresh_token } = extractTokens(req);

    if (!access_token && !refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }

    try {
      // Try to call Google Drive API with current token
      const userinfo = await axios.get(
        "https://www.googleapis.com/drive/v3/about?fields=user,storageQuota",
        {
          headers: { Authorization: `Bearer ${access_token}` },
        }
      );

      res.status(200).json({
        success: true,
        user: userinfo.data.user,
        storageQuota: userinfo.data.storageQuota
      });
    } catch (apiError: any) {
      // If token expired (401), try to refresh it
      if (apiError.response?.status === 401 && refresh_token) {
        console.log('Access token expired, attempting to refresh...');

        try {
          const refreshed = await refreshDriveAccessToken(refresh_token);
          access_token = refreshed.access_token;

          // Retry the API call with refreshed token
          const userinfo = await axios.get(
            "https://www.googleapis.com/drive/v3/about?fields=user,storageQuota",
            {
              headers: { Authorization: `Bearer ${access_token}` },
            }
          );

          res.status(200).json({
            success: true,
            user: userinfo.data.user,
            storageQuota: userinfo.data.storageQuota,
            tokenRefreshed: true
          });
        } catch (refreshError: any) {
          console.error('Token refresh failed:', refreshError.message);
          
          // Check if this is an invalid_grant error (revoked/expired refresh token)
          const errorMsg = refreshError.message || '';
          if (errorMsg.includes('invalid_grant')) {
            res.status(401).json({
              success: false,
              message: "Your Google Drive connection has expired. Please reconnect.",
              errorCode: 'INVALID_GRANT',
              requiresReauth: true
            });
          } else {
            res.status(401).json({
              success: false,
              message: "Token expired and refresh failed. Please re-authenticate.",
              requiresReauth: true
            });
          }
        }
      } else {
        throw apiError;
      }
    }
  } catch (error: any) {
    console.error('Failed to get profile:', error.message);
    res.status(500).json({ success: false, message: error.message || "Failed to get profile" });
  }
});

/**
 * 📁 FILE/FOLDER LISTING ENDPOINTS
 */

/**
 * ✅ GET /drive/me/files
 * Purpose: List all files in user's Google Drive with pagination and search
 * Params:
 *   - Tokens: x-access-token, x-refresh-token (headers/query)
 *   - pageToken (optional, query): Token for next page of results
 *   - pageSize (optional, query): Number of files per page (default: 25)
 *   - q (optional, query): Search query to filter files
 * Returns: { success, data: {files: [], nextPageToken?, ...} }
 * Logic: Smart pagination - prioritize folders first, then files. Total = pageSize items.
 * Usage: Display file list, implement pagination, search functionality
 */
router.get("/me/files", async (req: Request, res: Response): Promise<void> => {
  try {
    const { access_token, refresh_token } = extractTokens(req);
    const pageToken = (req.query.pageToken as string) || undefined;
    const pageSize = parseInt((req.query.pageSize as string) || "25", 10);
    let q = (req.query.q as string) || undefined; // optional search query

    if (!access_token && !refresh_token) {
      res.status(401).json({ success: false, message: "No access token provided" });
      return;
    }

    // If query includes mimeType filter, it's a specific request (folders or files only)
    // Use it as-is for pagination
    if (q && q.includes("mimeType")) {
      const data = await listMyDriveFiles({ access_token, refresh_token }, pageToken, pageSize, q);
      res.status(200).json({ success: true, data });
      return;
    }

    // Smart pagination: prioritize folders first, then files
    // Total result = pageSize items (e.g., if 10 folders fit, show 10 folders + 40 files)
    if (!pageToken && !q) {
      try {
        // Get folders for this page (no pageToken - fresh start)
        const folderQuery = "trashed=false and mimeType='application/vnd.google-apps.folder' and 'root' in parents";
        const foldersData = await listMyDriveFiles({ access_token, refresh_token }, undefined, pageSize, folderQuery);
        const folders = foldersData.files || [];

        // Calculate how many files we need to reach pageSize
        const remainingSlots = Math.max(0, pageSize - folders.length);
        // console.log('📊 Folders:', folders.length, '+ Files needed:', remainingSlots, '= Total:', pageSize);

        let files: any[] = [];
        let nextPageToken: string | undefined = undefined;

        // If we have remaining slots, fetch files
        if (remainingSlots > 0) {
          const fileQuery = "trashed=false and mimeType!='application/vnd.google-apps.folder' and 'root' in parents";
          const filesData = await listMyDriveFiles({ access_token, refresh_token }, undefined, remainingSlots, fileQuery);
          files = filesData.files || [];
          nextPageToken = filesData.nextPageToken || undefined;
        }

        // Combine: folders first, then files (total = pageSize)
        const combinedFiles = [...folders, ...files].slice(0, pageSize);

        res.status(200).json({
          success: true,
          data: {
            files: combinedFiles,
            nextPageToken: nextPageToken,
            kind: "drive#fileList"
          }
        });
        return;
      } catch (error: any) {
        console.error("❌ Error in smart pagination:", error.message);
        // Fallback to natural pagination
        const data = await listMyDriveFiles({ access_token, refresh_token }, pageToken, pageSize, q);
        res.status(200).json({ success: true, data });
        return;
      }
    }

    // If has pageToken or search query, use natural pagination (no folder prioritization)
    const data = await listMyDriveFiles({ access_token, refresh_token }, pageToken, pageSize, q);
    res.status(200).json({ success: true, data });
    return;
  } catch (error: any) {
    console.error('❌ Failed to list files:', error.message);
    
    // Check if this is an invalid_grant error (revoked/expired refresh token)
    const errorMsg = error.message || '';
    if (errorMsg.includes('invalid_grant')) {
      res.status(401).json({
        success: false,
        message: "Your Google Drive connection has expired. Please reconnect.",
        errorCode: 'INVALID_GRANT',
        requiresReauth: true
      });
    } else {
      res.status(500).json({ success: false, message: error.message || "Failed to list Drive files" });
    }
    return;
  }
});

/**
 * ✅ GET /drive/me/files/preview/:id
 * Purpose: Proxy image preview from Google Drive with intelligent fallback (solves CORS issues)
 * Params:
 *   - id (required, URL): File ID to get preview for
 *   - Tokens: x-access-token, x-refresh-token (headers/query)
 * Returns: Binary image stream with CORS headers
 * Strategy: thumbnailLink > webContentLink > MIME-type icon
 */
router.get("/me/files/preview/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    let fileId = req.params.id;
    if (Array.isArray(fileId)) fileId = fileId[0];

    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(401).json({ success: false, message: "No access token provided" });
      return;
    }

    if (!fileId) {
      res.status(400).json({ success: false, message: "Missing file id" });
      return;
    }

    const { data, mimeType } = await getPreviewStream(tokens as any, fileId);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(data);
  } catch (error: any) {
    console.error('Preview endpoint error:', error.message);
    
    // Check if this is an invalid_grant error (revoked/expired refresh token)
    const errorMsg = error.message || '';
    if (errorMsg.includes('invalid_grant')) {
      res.status(401).json({
        success: false,
        message: "Your Google Drive connection has expired. Please reconnect.",
        errorCode: 'INVALID_GRANT',
        requiresReauth: true
      });
    } else {
      res.status(500).json({ success: false, message: error.message || "Failed to generate preview", debug: process.env.NODE_ENV === 'development' ? error.toString() : undefined });
    }
  }
});

/**
 * ✅ GET /drive/file/:id
 * Purpose: Get metadata of a specific file by ID
 * Params:
 *   - id (required, URL): File ID
 *   - Tokens: x-access-token, x-refresh-token (headers/query)
 * Returns: { success, data: {id, name, mimeType, size, createdTime, modifiedTime, ...} }
 * Usage: Fetch file details before download/share operations
 */
router.get("/file/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const access_token = (req.headers["x-access-token"] as string) || (req.query.access_token as string) || "";
    const refresh_token = (req.headers["x-refresh-token"] as string) || (req.query.refresh_token as string) || undefined;
    let fileId = req.params.id;
    if (Array.isArray(fileId)) fileId = fileId[0];
    if (!fileId) {
      res.status(400).json({ success: false, message: "Missing file id" });
      return;
    }
    const data = await getDriveFileMetadata({ access_token, refresh_token }, fileId);
    res.status(200).json({ success: true, data });
    return;
  } catch (error: any) {
    console.error('Failed to get file metadata:', error.message);
    
    // Check if this is an invalid_grant error (revoked/expired refresh token)
    const errorMsg = error.message || '';
    if (errorMsg.includes('invalid_grant')) {
      res.status(401).json({
        success: false,
        message: "Your Google Drive connection has expired. Please reconnect.",
        errorCode: 'INVALID_GRANT',
        requiresReauth: true
      });
    } else {
      res.status(500).json({ success: false, message: error.message || "Failed to get file metadata" });
    }
    return;
  }
});

/**
 * 🔄 TOKEN MANAGEMENT ENDPOINTS
 */

/**
 * ✅ POST /drive/token/refresh
 * Purpose: Refresh expired access token using refresh_token
 * Params:
 *   - refresh_token (required): Token from body, headers, or query
 *   - accountEmail (optional): Account email to update in token store
 * Returns: { success, tokens: {access_token, refresh_token?, expiry_date, token_type} }
 * Usage: Manual token refresh when access_token expires
 */
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
    // Check if this is an invalid_grant error (revoked/expired refresh token)
    const errorMsg = error.message || '';
    if (errorMsg.includes('invalid_grant')) {
      
      // Extract company ID from request context if available
      const companyId = (req.body?.companyId as string) || (req.headers["x-company-id"] as string) || (req.query.companyId as string);
      
      // Clear invalid tokens from database
      if (companyId) {
        try {
          // @ts-ignore - deleteTokensByCompanyIdAndProvider may exist in your DB service
          if (typeof deleteTokensByCompanyIdAndProvider === 'function') {
            await deleteTokensByCompanyIdAndProvider(companyId, "drive");
            console.log('🗑️ Invalid tokens cleared for company:', companyId);
          }
        } catch (dbError: any) {
          console.warn('⚠️ Failed to clear tokens from DB:', dbError.message);
        }
      }
      
      res.status(401).json({
        success: false,
        message: "Your Google Drive connection has expired. Please reconnect.",
        errorCode: 'INVALID_GRANT',
        shouldReauth: true
      });
      return;
    }
    
    // Generic error handling
    res.status(500).json({ success: false, message: error.message || "Failed to refresh access token" });
    return;
  }
});

/**
 * ✅ GET /drive/tokeninfo
 * Purpose: Get detailed information about an access token (scope, expiry, user)
 * Params:
 *   - access_token (required): Token from headers or query (x-access-token)
 * Returns: { success, tokenInfo: {issued_at, expires_in, scope, token_type, ...} }
 * Usage: Verify token validity before operations
 */
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

/**
 * 📤 FILE UPLOAD/CREATE ENDPOINTS
 */

/**
 * ✅ POST /drive/me/files/upload
 * Purpose: Upload a file to user's Google Drive
 * Params:
 *   - file (required, multipart): File in form field 'file'
 *   - parentId (optional): Folder ID to upload file into
 *   - Tokens: x-access-token, x-refresh-token (headers/query)
 * Content-Type: multipart/form-data
 * Returns: { success, file: {id, name, mimeType, webViewLink, ...} }
 * Usage: Upload documents, images, or any file to Drive
 */
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

/**
 * ✅ POST /drive/me/folders
 * Purpose: Create a new folder in Google Drive
 * Params:
 *   - name (required, body/query): Folder name
 *   - parentId (optional, body/query): Parent folder ID (default: root)
 *   - Tokens: x-access-token, x-refresh-token (headers/query)
 * Body: { name, parentId? }
 * Returns: { success, folder: {id, name, webViewLink, ...} }
 * Usage: Create folder structure for organizing files
 */
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

/**
 * ✅ GET /drive/me/folders/:id/children
 * Purpose: List contents (files/folders) inside a specific folder
 * Params:
 *   - id (required, URL): Folder ID
 *   - pageToken (optional, query): For pagination
 *   - pageSize (optional, query): Items per page (default: 25)
 *   - q (optional, query): Search filter
 *   - Tokens: x-access-token, x-refresh-token (headers/query)
 * Returns: { success, data: {files: [...], nextPageToken?, ...} }
 * Usage: Browse folder contents, implement file tree navigation
 */
router.get("/me/folders/:id/children", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    let folderId = req.params.id;
    if (Array.isArray(folderId)) folderId = folderId[0];
    const pageToken = (req.query.pageToken as string) || undefined;
    const pageSize = parseInt((req.query.pageSize as string) || "25", 10);
    const q = (req.query.q as string) || undefined;
    const data = await listDriveFolderChildren(tokens, folderId, pageToken, pageSize, q);
    res.status(200).json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to list folder children" });
  }
});

/**
 * 🔧 FILE MANAGEMENT ENDPOINTS
 */

/**
 * ✅ POST /drive/me/files/:id/move
 * Purpose: Move a file or folder to a different location
 * Params:
 *   - id (required, URL): File/Folder ID to move
 *   - newParentId (required, body/query): Destination folder ID
 *   - Tokens: x-access-token, x-refresh-token (headers/query)
 * Body: { newParentId }
 * Returns: { success, result: {id, parents, ...} }
 * Usage: Reorganize files, move files between folders
 */
router.post("/me/files/:id/move", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    let fileId = req.params.id;
    if (Array.isArray(fileId)) fileId = fileId[0];
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

/**
 * 🔗 FILE SHARING ENDPOINTS
 */

/**
 * ✅ POST /drive/me/files/:id/share
 * Purpose: Share a file with specific users/groups/domain
 * Params:
 *   - id (required, URL): File ID to share
 *   - role (required, body): 'viewer', 'commenter', or 'writer'
 *   - type (required, body): 'user', 'group', 'domain', or 'anyone'
 *   - emailAddress (optional, body): Email for user/group type
 *   - domain (optional, body): Domain for domain type
 *   - allowFileDiscovery (optional, body): Allow file discovery via search
 *   - Tokens: x-access-token, x-refresh-token (headers/query)
 * Body: { role, type, emailAddress?, domain?, allowFileDiscovery? }
 * Returns: { success, permission: {id, type, role, ...} }
 * Usage: Share files with team members, external users, or entire domain
 */
router.post("/me/files/:id/share", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    let fileId = req.params.id;
    if (Array.isArray(fileId)) fileId = fileId[0];
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

/**
 * ✅ POST /drive/me/files/:id/send-email
 * Purpose: Send a Drive file as email attachment via Gmail
 * Params:
 *   - id (required, URL): File ID to attach and send
 *   - from (required, body): Sender email
 *   - to (required, body): Recipient email(s)
 *   - subject (required, body): Email subject
 *   - text (optional, body): Plain text email body
 *   - html (optional, body): HTML email body
 * Headers:
 *   - Drive tokens: x-drive-access-token, x-drive-refresh-token (for reading file)
 *   - Gmail tokens: x-gmail-access-token, x-gmail-refresh-token (for sending)
 *   - Fallback: x-access-token, x-refresh-token if specific headers not provided
 * Body: { from, to, subject, text?, html? }
 * Returns: { success, messageId, labelIds }
 * Usage: Send Drive files via email, automated document distribution
 */
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

    let fileId = req.params.id;
    if (Array.isArray(fileId)) fileId = fileId[0];
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

/**
 * 📥 FILE DOWNLOAD/EXPORT ENDPOINTS
 */

/**
 * ✅ GET /drive/me/files/export-pdf/:id
 * Purpose: Quickly export a Google Doc (Docs, Sheets, Slides, etc.) as PDF
 * Params:
 *   - id (required, URL): Google Docs file ID
 *   - filename (optional, query): Output filename (default: fileId)
 *   - Tokens: x-access-token, x-refresh-token (headers/query)
 * Returns: Binary PDF file stream
 * Content-Type: application/pdf
 * Usage: Export Google Docs/Sheets/Slides to PDF format
 */
router.get("/me/files/export-pdf/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    let fileId = req.params.id;
    if (Array.isArray(fileId)) fileId = fileId[0];
    const { stream } = await exportDriveFileStream(tokens, fileId, "application/pdf");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${(req.query.filename as string) || fileId}.pdf"`);
    stream.on("error", (err) => {
      if (!res.headersSent) res.status(500).json({ success: false, message: err?.message || "Stream error" });
    });
    stream.pipe(res);
  } catch (error: any) {
    console.error('Failed to export PDF:', error.message);
    
    // Check if this is an invalid_grant error (revoked/expired refresh token)
    const errorMsg = error.message || '';
    if (errorMsg.includes('invalid_grant')) {
      if (!res.headersSent) {
        res.status(401).json({
          success: false,
          message: "Your Google Drive connection has expired. Please reconnect.",
          errorCode: 'INVALID_GRANT',
          requiresReauth: true
        });
      }
    } else if (!res.headersSent) {
      res.status(500).json({ success: false, message: error.message || "Failed to export PDF" });
    }
  }
});

/**
 * ✅ GET /drive/files/:id
 * Purpose: Direct file download (optimized for single file downloads, no progress notification needed)
 * Params:
 *   - id (required, URL): File ID to download
 *   - Tokens: x-access-token, x-refresh-token (headers/query)
 * Returns: Binary file stream with appropriate Content-Type
 * Headers: Content-Disposition set to 'attachment' for automatic download
 * Content-Type: Set dynamically based on file MIME type
 * Note: This is optimized for direct downloads (no drawer/progress notification)
 *       For metadata-heavy operations, use /drive/me/files/download/:id instead
 * Usage: Download individual files directly without progress notification
 */
router.get("/files/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    // Extract tokens using same pattern as /file/:id endpoint
    const access_token = (req.headers["x-access-token"] as string) || (req.query.access_token as string) || "";
    const refresh_token = (req.headers["x-refresh-token"] as string) || (req.query.refresh_token as string) || undefined;

    if (!access_token && !refresh_token) {
      console.error('❌ No tokens found in request');
      res.status(401).json({
        success: false,
        message: "Authentication required: Provide access_token or refresh_token in headers (x-access-token, x-refresh-token) or query params"
      });
      return;
    }

    let fileId = req.params.id;
    if (Array.isArray(fileId)) fileId = fileId[0];
    if (!fileId) {
      res.status(400).json({ success: false, message: "Missing file id" });
      return;
    }


    // Get file metadata for name and type check
    const meta = await getDriveFileMetadata({ access_token, refresh_token }, fileId);

    // Map Google Docs types to Microsoft formats
    const googleToMicrosoftMap: { [key: string]: { mimeType: string; extension: string; name: string } } = {
      'application/vnd.google-apps.document': {
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extension: '.docx',
        name: 'Word Document'
      },
      'application/vnd.google-apps.spreadsheet': {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        extension: '.xlsx',
        name: 'Excel Spreadsheet'
      },
      'application/vnd.google-apps.presentation': {
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        extension: '.pptx',
        name: 'PowerPoint Presentation'
      },
      'application/vnd.google-apps.drawing': {
        mimeType: 'application/pdf',
        extension: '.pdf',
        name: 'PDF Drawing'
      },
      'application/vnd.google-apps.form': {
        mimeType: 'application/pdf',
        extension: '.pdf',
        name: 'PDF Form'
      }
    };

    // Google Docs types must be exported instead of downloaded
    const mimeType = meta.mimeType || "";
    if (mimeType.startsWith("application/vnd.google-apps")) {
      const exportConfig = googleToMicrosoftMap[mimeType] || {
        mimeType: 'application/pdf',
        extension: '.pdf',
        name: 'PDF'
      };

      
      // Export Google Docs as Microsoft format
      const { stream } = await exportDriveFileStream({ access_token, refresh_token }, fileId, exportConfig.mimeType);
      const filename = (meta.name || fileId) + exportConfig.extension;

      res.setHeader("Content-Type", exportConfig.mimeType);
      res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/"/g, '')}"`);
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

      // console.log(`✅ Starting export stream: ${filename}`);

      stream.on("error", (err) => {
        console.error(`❌ Stream error for file ${fileId}:`, err.message);
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: err?.message || "Stream error" });
        } else {
          res.end();
        }
      });

      stream.pipe(res);
      return;
    }

    // Download regular file (not Google Docs)
    const { stream } = await downloadDriveFileStream({ access_token, refresh_token }, fileId);
    const filename = meta.name || fileId;

    // Set headers for direct download (attachment disposition)
    res.setHeader("Content-Type", meta.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/"/g, '')}"`);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");


    // Handle stream errors
    stream.on("error", (err) => {
      console.error(`❌ Stream error for file ${fileId}:`, err.message);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: err?.message || "Stream error" });
      } else {
        res.end();
      }
    });

    // Pipe the file stream to response
    stream.pipe(res);
  } catch (error: any) {
    console.error('❌ File download error:', {
      message: error.message,
      code: error.code,
      errorCode: error?.error?.code,
      errorMessage: error?.error?.message,
      stack: error.stack?.split('\n')[0]
    });

    // Special handling for fileNotDownloadable error (Google Docs)
    if (error?.error?.code === 403 && error?.error?.errors?.[0]?.reason === 'fileNotDownloadable') {
      console.error('⚠️ File is not directly downloadable - likely a Google Docs file. Should export instead.');
      if (!res.headersSent) {
        res.status(400).json({ 
          success: false, 
          message: "This file type requires export. File was likely misidentified as downloadable.",
          errorCode: 'fileNotDownloadable',
          suggestion: 'The file may be a Google Docs type that needs to be exported'
        });
      }
      return;
    }

    // Check if this is an invalid_grant error (revoked/expired refresh token)
    const errorMsg = error.message || '';
    if (errorMsg.includes('invalid_grant')) {
      if (!res.headersSent) {
        res.status(401).json({
          success: false,
          message: "Your Google Drive connection has expired. Please reconnect.",
          errorCode: 'INVALID_GRANT',
          requiresReauth: true
        });
      }
      return;
    }

    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to download file",
        errorCode: error.code
      });
    }
  }
});

/**
 * ✅ GET /drive/me/files/download/:id
 * Purpose: Download a regular file from Google Drive (not Google Docs types)
 * Params:
 *   - id (required, URL): File ID to download
 *   - disposition (optional, query): 'inline' or 'attachment' (default: inline)
 *   - filename (optional, query): Custom filename for download
 *   - Tokens: x-access-token, x-refresh-token (headers/query)
 * Returns: Binary file stream with appropriate Content-Type
 * Headers: Content-Disposition, Content-Type set dynamically
 * Note: For Google Docs types, use /export endpoint instead
 * Usage: Download regular files (.pdf, .docx, .xlsx, .png, etc.)
 */
router.get("/me/files/download/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    let fileId = req.params.id;
    if (Array.isArray(fileId)) fileId = fileId[0];
    if (!fileId) {
      res.status(400).json({ success: false, message: "Missing file id" });
      return;
    }
    const meta = await getDriveFileMetadata(tokens, fileId);
    // Google Docs types must be exported instead of downloaded
    if ((meta.mimeType || "").startsWith("application/vnd.google-apps")) {
      res.status(400).json({ success: false, message: "This is a Google Docs type. Use /drive/me/files/export/:id?mimeType=...", meta });
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
    console.error('Failed to download file:', error.message);
    
    // Check if this is an invalid_grant error (revoked/expired refresh token)
    const errorMsg = error.message || '';
    if (errorMsg.includes('invalid_grant')) {
      if (!res.headersSent) {
        res.status(401).json({
          success: false,
          message: "Your Google Drive connection has expired. Please reconnect.",
          errorCode: 'INVALID_GRANT',
          requiresReauth: true
        });
      }
    } else if (!res.headersSent) {
      res.status(500).json({ success: false, message: error.message || "Failed to download file" });
    }
  }
});

/**
 * ✅ GET /drive/me/files/export/:id
 * Purpose: Export Google Docs types to custom format (PDF, XLSX, DOCX, TXT, etc.)
 * Params:
 *   - id (required, URL): Google Docs file ID
 *   - mimeType (required, query): Target MIME type (e.g., application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document)
 *   - disposition (optional, query): 'inline' or 'attachment' (default: inline)
 *   - filename (optional, query): Custom output filename
 *   - Tokens: x-access-token, x-refresh-token (headers/query)
 * Returns: Binary file stream in requested format
 * Example: /drive/me/files/export/15fVKkZa7bfmg5Tcw-y-H0MiVqZv6USoC?mimeType=text/plain&disposition=attachment&filename=doc.txt
 * Usage: Convert Google Docs to various formats, export with custom filenames
 */
router.get("/me/files/export/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    let fileId = req.params.id;
    if (Array.isArray(fileId)) fileId = fileId[0];
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
    console.error('Failed to export file:', error.message);
    
    // Check if this is an invalid_grant error (revoked/expired refresh token)
    const errorMsg = error.message || '';
    if (errorMsg.includes('invalid_grant')) {
      if (!res.headersSent) {
        res.status(401).json({
          success: false,
          message: "Your Google Drive connection has expired. Please reconnect.",
          errorCode: 'INVALID_GRANT',
          requiresReauth: true
        });
      }
    } else if (!res.headersSent) {
      res.status(500).json({ success: false, message: error.message || "Failed to export file" });
    }
  }
});

/**
 * � ZIP DOWNLOAD ENDPOINTS
 */

/**
 * ✅ GET /drive/folders/:folderId/download-zip
 * Purpose: Download a folder and all its contents as a ZIP file
 * Params:
 *   - folderId (required, URL): Folder ID to download as ZIP
 *   - Tokens: x-access-token, x-refresh-token (headers/query)
 * Returns: Binary ZIP file stream
 * Content-Type: application/zip
 * Usage: Download entire folders with all nested contents
 */
router.get("/folders/:folderId/download-zip", async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  
  try {
    let tokens = extractTokens(req);
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(401).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }

    // Ensure we have a valid access token
    await ensureValidAccessToken(tokens);

    let folderId = req.params.folderId;
    if (Array.isArray(folderId)) folderId = folderId[0];
    if (!folderId) {
      res.status(400).json({ success: false, message: "Missing folderId" });
      return;
    }

    // Get folder metadata
    const folderMeta = await getDriveFileMetadata(tokens, folderId);
    const folderName = folderMeta?.name || "folder";

    // Create new ZIP instance (JSZip is already imported at top)
    const zip = new JSZip();

    // Recursive function to add files to ZIP with retry logic
    const addFolderToZip = async (parentId: string, zipFolder: any, parentPath: string = ""): Promise<void> => {
      try {
        // List all files in this folder
        let response;
        
        try {
          response = await axios.get(
            "https://www.googleapis.com/drive/v3/files",
            {
              headers: { Authorization: `Bearer ${tokens.access_token}` },
              params: {
                q: `'${parentId}' in parents and trashed=false`,
                spaces: "drive",
                fields: "files(id, name, mimeType, size)",
                pageSize: 1000,
              },
            }
          );
        } catch (apiError: any) {
          // If token expired, try to refresh and retry
          if (apiError.response?.status === 401 && tokens.refresh_token) {
            console.log('🔄 Access token expired during folder fetch, attempting to refresh...');
            try {
              const refreshed = await refreshDriveAccessToken(tokens.refresh_token);
              tokens.access_token = refreshed.access_token;
              response = await axios.get(
                "https://www.googleapis.com/drive/v3/files",
                {
                  headers: { Authorization: `Bearer ${tokens.access_token}` },
                  params: {
                    q: `'${parentId}' in parents and trashed=false`,
                    spaces: "drive",
                    fields: "files(id, name, mimeType, size)",
                    pageSize: 1000,
                  },
                }
              );
            } catch (refreshError: any) {
              console.error('❌ Failed to refresh token:', refreshError.message);
              throw apiError; // Throw original error if refresh fails
            }
          } else {
            throw apiError;
          }
        }

        const files = response.data.files || [];

        // Separate files and folders
        const filesToDownload: Array<{ id: string; name: string; mimeType?: string }> = [];
        const subFolders: Array<{ id: string; name: string; path: string }> = [];

        for (const file of files) {
          const filePath = parentPath ? `${parentPath}/${file.name}` : file.name;
          if (file.mimeType === "application/vnd.google-apps.folder") {
            subFolders.push({ id: file.id, name: file.name, path: filePath });
          } else {
            filesToDownload.push({ id: file.id, name: file.name, mimeType: file.mimeType });
          }
        }

        // Download all files in parallel (up to 15 concurrent downloads)
        if (filesToDownload.length > 0) {
          const downloadedFiles = await downloadFilesInParallel(filesToDownload, tokens, 15);
          
          // Add downloaded files to ZIP
          for (const { name, buffer } of downloadedFiles) {
            zipFolder.file(name, buffer);
          }
        }

        // Process subfolders recursively
        for (const subfolder of subFolders) {
          const subFolder = zipFolder.folder(subfolder.name);
          await addFolderToZip(subfolder.id, subFolder, subfolder.path);
        }
      } catch (error: any) {
        console.error(`❌ Error processing folder ${parentId}:`, error.message);
        throw error;
      }
    };

    // Build ZIP structure
    let localFolderId = folderId;
    if (Array.isArray(localFolderId)) localFolderId = localFolderId[0];
    await addFolderToZip(localFolderId, zip);

    // Generate ZIP buffer (STORE = no compression for speed)
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });

    // Send ZIP file
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${folderName}.zip"`);
    res.setHeader("Content-Length", zipBuffer.length);
    res.send(zipBuffer);

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
  } catch (error: any) {
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    console.error(`❌ Failed to create folder ZIP after ${duration}s:`, error.message || error);
    console.error("Stack trace:", error.stack);
    
    // Check if this is an invalid_grant error (revoked/expired refresh token)
    const errorMsg = error.message || '';
    if (errorMsg.includes('invalid_grant')) {
      if (!res.headersSent) {
        res.status(401).json({
          success: false,
          message: "Your Google Drive connection has expired. Please reconnect.",
          errorCode: 'INVALID_GRANT',
          requiresReauth: true
        });
      }
    } else if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to create ZIP",
        error: process.env.NODE_ENV === 'development' ? error.toString() : undefined
      });
    }
  }
});

/**
 * ✅ POST /drive/items/download-zip
 * Purpose: Download multiple files/folders as a single ZIP file
 * Params:
 *   - itemIds (required, body): Array of file/folder IDs to download
 *   - Tokens: x-access-token, x-refresh-token (headers/query)
 * Body: { itemIds: ["id1", "id2", ...] }
 * Returns: Binary ZIP file stream
 * Content-Type: application/zip
 * Usage: Download multiple selected items at once
 */
router.post("/items/download-zip", async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  
  try {
    let tokens = extractTokens(req);
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(401).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }

    // Ensure we have a valid access token
    await ensureValidAccessToken(tokens);

    const itemIds = (req.body?.itemIds as string[]) || [];
    if (!itemIds || itemIds.length === 0) {
      res.status(400).json({ success: false, message: "Missing itemIds in request body" });
      return;
    }

    // Create new ZIP instance (JSZip is already imported at top)
    const zip = new JSZip();

    // Map Google Docs types to Microsoft formats
    const googleToMicrosoftMap: { [key: string]: { mimeType: string; extension: string; name: string } } = {
      'application/vnd.google-apps.document': {
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extension: '.docx',
        name: 'Word Document'
      },
      'application/vnd.google-apps.spreadsheet': {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        extension: '.xlsx',
        name: 'Excel Spreadsheet'
      },
      'application/vnd.google-apps.presentation': {
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        extension: '.pptx',
        name: 'PowerPoint Presentation'
      },
      'application/vnd.google-apps.drawing': {
        mimeType: 'application/pdf',
        extension: '.pdf',
        name: 'PDF Drawing'
      },
      'application/vnd.google-apps.form': {
        mimeType: 'application/pdf',
        extension: '.pdf',
        name: 'PDF Form'
      }
    };

    // Helper function to add files recursively
    const addItemToZip = async (itemId: string, zipFolder: any): Promise<void> => {
      try {
        const itemMeta = await getDriveFileMetadata(tokens, itemId);
        const itemName = itemMeta?.name || itemId;
        const mimeType = itemMeta?.mimeType || "";

        if (mimeType === "application/vnd.google-apps.folder") {
          // It's a folder - recursively add contents
          const subFolder = zipFolder.folder(itemName);
          
          let response;
          try {
            response = await axios.get(
              "https://www.googleapis.com/drive/v3/files",
              {
                headers: { Authorization: `Bearer ${tokens.access_token}` },
                params: {
                  q: `'${itemId}' in parents and trashed=false`,
                  spaces: "drive",
                  fields: "files(id, name, mimeType)",
                  pageSize: 1000,
                },
              }
            );
          } catch (apiError: any) {
            // If token expired, try to refresh and retry
            if (apiError.response?.status === 401 && tokens.refresh_token) {
              try {
                const refreshed = await refreshDriveAccessToken(tokens.refresh_token);
                tokens.access_token = refreshed.access_token;
                
                response = await axios.get(
                  "https://www.googleapis.com/drive/v3/files",
                  {
                    headers: { Authorization: `Bearer ${tokens.access_token}` },
                    params: {
                      q: `'${itemId}' in parents and trashed=false`,
                      spaces: "drive",
                      fields: "files(id, name, mimeType)",
                      pageSize: 1000,
                    },
                  }
                );
              } catch (refreshError: any) {
                console.error('❌ Failed to refresh token:', refreshError.message);
                throw apiError; // Throw original error if refresh fails
              }
            } else {
              throw apiError;
            }
          }

          const files = response.data.files || [];
          
          // Process each file/folder in the parent folder
          for (const file of files) {
            await addItemToZip(file.id, subFolder);
          }
        } else if (mimeType.startsWith("application/vnd.google-apps")) {
          // Google Docs type - export to Microsoft format
          const exportConfig = googleToMicrosoftMap[mimeType] || {
            mimeType: 'application/pdf',
            extension: '.pdf',
            name: 'PDF'
          };

          try {
            const { stream } = await exportDriveFileStream(tokens, itemId, exportConfig.mimeType);
            const finalName = itemName.replace(/\.[^.]*$/, '') + exportConfig.extension;
            const chunks: Buffer[] = [];

            await new Promise<void>((resolve, reject) => {
              stream.on("data", (chunk: Buffer) => chunks.push(chunk));
              stream.on("end", () => {
                const fileBuffer = Buffer.concat(chunks);
                zipFolder.file(finalName, fileBuffer);
                console.log(`✅ Exported ${finalName} (${exportConfig.name})`);
                resolve();
              });
              stream.on("error", reject);
            });
          } catch (fileError: any) {
            console.warn(`⚠️ Failed to export file ${itemName}:`, fileError.message);
          }
        } else {
          // Regular file - download and add to ZIP
          try {
            console.log(`📥 Downloading file: ${itemName}`);
            const { stream } = await downloadDriveFileStream(tokens, itemId);
            const chunks: Buffer[] = [];

            await new Promise((resolve, reject) => {
              stream.on("data", (chunk: Buffer) => chunks.push(chunk));
              stream.on("end", resolve);
              stream.on("error", reject);
            });

            const fileBuffer = Buffer.concat(chunks);
            zipFolder.file(itemName, fileBuffer);
          } catch (fileError: any) {
            console.warn(`⚠️ Failed to download file ${itemName}:`, fileError.message);
          }
        }
      } catch (error: any) {
        console.error(`❌ Error processing item ${itemId}:`, error.message);
        throw error;
      }
    };

    // Process all items in parallel when possible
    // For top-level items, we can process multiple in parallel
    const topLevelPromises = itemIds.map(itemId => addItemToZip(itemId, zip));
    await Promise.all(topLevelPromises);

    // Generate ZIP buffer (STORE = no compression for speed)
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });

    // Send ZIP file
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="download.zip"`);
    res.setHeader("Content-Length", zipBuffer.length);
    res.send(zipBuffer);

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    console.log(`✅ ZIP created and sent successfully: download.zip (${zipBuffer.length} bytes) containing ${itemIds.length} item(s) in ${duration}s`);
  } catch (error: any) {
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    console.error(`❌ Failed to create items ZIP after ${duration}s:`, error.message || error);
    console.error("Stack trace:", error.stack);
    
    // Check if this is an invalid_grant error (revoked/expired refresh token)
    const errorMsg = error.message || '';
    if (errorMsg.includes('invalid_grant')) {
      if (!res.headersSent) {
        res.status(401).json({
          success: false,
          message: "Your Google Drive connection has expired. Please reconnect.",
          errorCode: 'INVALID_GRANT',
          requiresReauth: true
        });
      }
    } else if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to create ZIP",
        error: process.env.NODE_ENV === 'development' ? error.toString() : undefined
      });
    }
  }
});

/**
 * �🔧 UTILITY/DEBUG ENDPOINTS
 */

/**
 * ✅ GET /drive/debug
 * Purpose: Display current OAuth and API configuration (for debugging)
 * Params: None
 * Returns: { success, expectedRedirectUri, clientIdStart, scopes }
 * Usage: Verify OAuth configuration is correct before integration
 */
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
    res.status(200).json({ success: true, expectedRedirectUri, clientIdStart: clientId.slice(0, 10) + "…", scopes });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || "Failed to read config" });
  }
});

/**
 * ✅ PATCH /drive/me/files/:id/color
 * Purpose: Update a folder's color in Google Drive
 * Params:
 *   - id (required, URL): Folder ID to change color
 *   - color (required, body): Color name ('slate', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink')
 *   - Tokens: x-access-token, x-refresh-token (headers/query)
 * Body: { color }
 * Returns: { success, result: {id, name, folderColorRgb} }
 * Usage: Update folder color in Drive view to help organize folders
 */
router.patch("/me/files/:id/color", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token && !tokens.refresh_token) {
      console.error('❌ No tokens provided');
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }

    await ensureValidAccessToken(tokens);

    let folderId = req.params.id;
    if (Array.isArray(folderId)) folderId = folderId[0];
    const { color } = req.body || {};

    if (!folderId || !color) {
      console.error('❌ Missing folder id or color');
      res.status(400).json({ success: false, message: "Missing folder id or color" });
      return;
    }

    const result = await updateFolderColor(tokens, folderId, color);
    res.status(200).json({ success: true, result });
  } catch (error: any) {
    console.error('❌ Error updating folder color:', error.message);
    res.status(500).json({ success: false, message: error.message || "Failed to update folder color" });
  }
});

/**
 * ✅ PATCH /drive/me/files/:id/starred
 * Purpose: Toggle star/unstar status for files and folders in Google Drive
 * Params:
 *   - id (required, URL): File/Folder ID to star/unstar
 *   - starred (required, body): Boolean value (true to star, false to unstar)
 *   - Tokens: x-access-token, x-refresh-token (headers/query)
 * Body: { starred: true|false }
 * Returns: { success, result: {id, name, starred} }
 * Usage: Star/unstar files and folders to mark them as important in Drive view
 */
router.patch("/me/files/:id/starred", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token && !tokens.refresh_token) {
      console.error('❌ No tokens provided');
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }

    await ensureValidAccessToken(tokens);

    let fileId = req.params.id;
    if (Array.isArray(fileId)) fileId = fileId[0];
    const { starred } = req.body || {};

    if (!fileId || starred === undefined || starred === null) {
      console.error('❌ Missing file id or starred value');
      res.status(400).json({ success: false, message: "Missing file id or starred value" });
      return;
    }

    const result = await updateItemStarred(tokens, fileId, starred);
    res.status(200).json({ success: true, result });
  } catch (error: any) {
    console.error('❌ Error updating item starred status:', error.message);
    res.status(500).json({ success: false, message: error.message || "Failed to update starred status" });
  }
});

/**
 * 🏢 COMPANY/MULTI-USER ENDPOINTS
 */

/**
 * ✅ GET /drive/company/:companyId/drives
 * Purpose: Get all connected Google Drive accounts for a specific company
 * Params:
 *   - companyId (required, URL): Company ID
 * Returns: { success, data: [...connected drives...], message }
 * Data includes: accountEmail, accountId, expiryDate, scopes for each connected drive
 * Usage: List all company's connected Google Drive accounts in admin panel
 */
router.get("/company/:companyId/drives", async (req: Request, res: Response): Promise<void> => {
  try {
    let companyId = req.params.companyId;
    if (Array.isArray(companyId)) companyId = companyId[0];

    if (!companyId) {
      res.status(400).json({ success: false, message: "Missing companyId" });
      return;
    }

    // Fetch all connected drives for this company from database
    const drives = await getConnectedDrivesByCompanyId(companyId);

    res.status(200).json({
      success: true,
      data: drives || [],
      message: drives && drives.length > 0 ? "Connected drives found" : "No connected drives"
    });
    return;
  } catch (error: any) {
    console.error('Failed to fetch company drives:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch company drives"
    });
    return;
  }
});

/**
 * ✅ POST /drive/company/:companyId/disconnect
 * Purpose: Disconnect and remove all Google Drive connections for a company
 * Params:
 *   - companyId (required, URL): Company ID whose drives to disconnect
 * Returns: { success, message, disconnectedCount }
 * Side effects: Deletes all Google Drive tokens for company, broadcasts disconnect notification
 * Usage: Remove company's Drive access during offboarding, revoke permissions
 */
router.post("/company/:companyId/disconnect", async (req: Request, res: Response): Promise<void> => {
  try {
    let companyId = req.params.companyId;
    if (Array.isArray(companyId)) companyId = companyId[0];

    if (!companyId) {
      res.status(400).json({ success: false, message: "Missing companyId" });
      return;
    }

    // Get all connected drives for this company first
    const drives = await getConnectedDrivesByCompanyId(companyId);

    if (!drives || drives.length === 0) {
      res.status(200).json({
        success: true,
        message: "No connected drives to disconnect"
      });
      return;
    }

    // Delete all token records for this company where provider is 'google'
    const deletedCount = await deleteTokensByCompanyIdAndProvider(companyId, "google");

    // 🔥 BROADCAST: Notify all company users about the drive disconnection
    notifySocialConnectionRemoved(companyId, "google-drive");

    res.status(200).json({
      success: true,
      message: "Google Drive disconnected successfully",
      disconnectedCount: deletedCount || drives.length
    });
    return;
  } catch (error: any) {
    console.error('Failed to disconnect Google Drive:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to disconnect Google Drive"
    });
    return;
  }
});

/**
 * ✅ POST /drive/me/files/:id/rename
 * Purpose: Rename a file or folder on Google Drive
 * Params:
 *   - id (required, URL): File/Folder ID to rename
 *   - newName (required, body): New name for the file/folder
 * Returns: { success, data: { id, name, mimeType, iconLink }, message }
 * Usage: User renames a file/folder from the UI
 */
router.post("/me/files/:id/rename", async (req: Request, res: Response): Promise<void> => {
  try {
    const fileId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { newName } = req.body;

    if (!fileId || !newName) {
      res.status(400).json({ 
        success: false, 
        message: "Missing fileId or newName" 
      });
      return;
    }

    // Extract tokens from headers or query
    const tokens = extractTokens(req);
    
    // Ensure valid access token
    await ensureValidAccessToken(tokens);

    if (!tokens.access_token) {
      res.status(401).json({ 
        success: false, 
        message: "No valid access token found" 
      });
      return;
    }

    // Rename the file/folder
    const result = await renameDriveItem(tokens, fileId, newName);

    console.log(`✅ File/Folder ${fileId} renamed to ${newName}`);

    res.status(200).json({
      success: true,
      data: result,
      message: "File/Folder renamed successfully"
    });
    return;
  } catch (error: any) {
    console.error('❌ Failed to rename file/folder:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to rename file/folder"
    });
    return;
  }
});

// Move multiple files/folders to a target folder
router.post("/me/files/move", async (req: any, res: any) => {
  try {
    const { itemIds, targetFolderId } = req.body;

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0 || !targetFolderId) {
      res.status(400).json({
        success: false,
        message: "Missing itemIds array or targetFolderId"
      });
      return;
    }

    // Extract tokens from headers or query
    const tokens = extractTokens(req);

    // Ensure valid access token
    await ensureValidAccessToken(tokens);

    if (!tokens.access_token) {
      res.status(401).json({
        success: false,
        message: "No valid access token found"
      });
      return;
    }

    // Move each item to the target folder
    const movePromises = itemIds.map(itemId =>
      moveItemToFolder(tokens, itemId, targetFolderId)
    );

    const results = await Promise.all(movePromises);

    console.log(`✅ ${results.length} item(s) moved successfully to folder ${targetFolderId}`);

    res.status(200).json({
      success: true,
      data: results,
      message: `${results.length} item(s) moved successfully`
    });
    return;
  } catch (error: any) {
    console.error('❌ Failed to move items:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to move items"
    });
    return;
  }
});

module.exports = router;

