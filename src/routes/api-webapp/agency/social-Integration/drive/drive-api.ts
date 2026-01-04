import express, { Request, Response } from "express";
import { generateDriveAuthUrl, exchangeDriveCodeForTokens, listMyDriveFiles, getDriveFileMetadata, refreshDriveAccessToken, getDriveAccessTokenInfo, downloadDriveFileStream, exportDriveFileStream, uploadDriveFile, createDriveFolder, listDriveFolderChildren, moveDriveFile, setDriveFilePermission, readDriveFileAsBase64, getGoogleUser } from "../../../../../services/drive-service";
import jwt from "jsonwebtoken";
import axios from "axios";
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
          res.status(401).json({ 
            success: false, 
            message: "Token expired and refresh failed. Please re-authenticate.",
            requiresReauth: true
          });
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
 * Logic: If query has mimeType filter, use it as-is. Otherwise, fetch folders first, then files.
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
      console.log('📄 Specific query detected (has mimeType filter):', q);
      const data = await listMyDriveFiles({ access_token, refresh_token }, pageToken, pageSize, q);
      res.status(200).json({ success: true, data });
      return;
    }

    // If no mimeType filter and no pageToken, do two-stage loading: folders first, then files
    if (!pageToken && !q) {
      console.log('📂 Two-stage loading: folders first, then files');
      try {
        // Stage 1: Get all folders (root level only)
        const folderQuery = "trashed=false and mimeType='application/vnd.google-apps.folder' and 'root' in parents";
        console.log('📂 Stage 1 - Fetching FOLDERS:', folderQuery);
        const foldersData = await listMyDriveFiles({ access_token, refresh_token }, undefined, 500, folderQuery);
        const folders = foldersData.files || [];
        console.log('✅ Received FOLDERS:', folders.length);

        // Stage 2: Get files (root level only)
        const fileQuery = "trashed=false and mimeType!='application/vnd.google-apps.folder'";
        console.log('📄 Stage 2 - Fetching FILES:', fileQuery);
        const filesData = await listMyDriveFiles({ access_token, refresh_token }, undefined, pageSize, fileQuery);
        const files = filesData.files || [];
        console.log('✅ Received FILES:', files.length);

        // Combine: folders first, then files
        const combinedFiles = [...folders, ...files];
        console.log('📊 Combined result:', `${folders.length} folders + ${files.length} files = ${combinedFiles.length} total`);

        res.status(200).json({
          success: true,
          data: {
            files: combinedFiles,
            nextPageToken: filesData.nextPageToken || undefined,
            kind: "drive#fileList"
          }
        });
        return;
      } catch (error: any) {
        console.error("❌ Error in two-stage loading:", error.message);
        // Fallback to regular listing if two-stage fails
        const data = await listMyDriveFiles({ access_token, refresh_token }, pageToken, pageSize, q);
        res.status(200).json({ success: true, data });
        return;
      }
    }

    // If has pageToken or search query, use regular pagination
    console.log('📄 Regular pagination: pageToken or search query provided');
    const data = await listMyDriveFiles({ access_token, refresh_token }, pageToken, pageSize, q);
    res.status(200).json({ success: true, data });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to list Drive files" });
    return;
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
    const fileId = req.params.id;
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
    if (!res.headersSent) {
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

/**
 * 🔧 UTILITY/DEBUG ENDPOINTS
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
    const companyId = req.params.companyId;

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
    const companyId = req.params.companyId;

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

module.exports = router;
