import { google } from "googleapis";
import { Readable } from "stream";
import axios from "axios";

// Prefer unified GOOGLE_SCOPES if provided, otherwise fall back to DRIVE_SCOPES, then readonly
const DEFAULT_SCOPES = (
  process.env.GOOGLE_SCOPES ||
  process.env.DRIVE_SCOPES ||
  "https://www.googleapis.com/auth/drive.readonly"
)
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

function getRedirectUri() {
  return (
    process.env.DRIVE_REDIRECT_URI ||
    process.env.GOOGLE_REDIRECT_URI ||
    `${process.env.API_URL || "http://localhost:9005"}/drive/oauth2callback`
  );
}

export function getDriveOAuthClient(redirectUri?: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const redirect = redirectUri || getRedirectUri();
  return new google.auth.OAuth2(clientId, clientSecret, redirect);
}

export function generateDriveAuthUrl(
  scopes: string[] = DEFAULT_SCOPES,
  state?: string,
  accessType: "online" | "offline" = "offline",
  prompt: "consent" | "none" = "consent"
) {
  const oauth2Client = getDriveOAuthClient();
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: accessType,
    scope: scopes,
    prompt,
    state
  });
  return authUrl;
}

export async function exchangeDriveCodeForTokens(code: string, redirectUri?: string) {
  const oauth2Client = getDriveOAuthClient(redirectUri);
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

export type DriveTokens = { access_token?: string; refresh_token?: string; expiry_date?: number; token_type?: string };

export function getDriveClientFromTokens(tokens: DriveTokens) {
  const oauth2Client = getDriveOAuthClient();
  oauth2Client.setCredentials(tokens);
  return google.drive({ version: "v3", auth: oauth2Client });
}

export async function listMyDriveFiles(tokens: DriveTokens, pageToken?: string, pageSize: number = 25, q?: string) {
  const drive = getDriveClientFromTokens(tokens);
  const res = await drive.files.list({ pageSize, pageToken, q, orderBy: "name", fields: "files(id,name,mimeType,modifiedTime,size,owners,webViewLink,webContentLink,thumbnailLink,folderColorRgb,starred,iconLink),nextPageToken" });
  return res.data;
}

export async function getDriveFileMetadata(tokens: DriveTokens, fileId: string) {
  const drive = getDriveClientFromTokens(tokens);
  const folder = await drive.files.get({ fileId, fields: "id,name,mimeType,size,modifiedTime,owners,webViewLink,webContentLink,thumbnailLink,folderColorRgb,starred,iconLink" });
  return folder.data;
}

export async function refreshDriveAccessToken(refreshToken: string) {
  try {
    const oauth2Client = getDriveOAuthClient();
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await oauth2Client.refreshAccessToken();
    return credentials;
  } catch (error: any) {
    // Provide detailed error messages for common OAuth failures
    const errorCode = error.message || error.error || '';
    
    if (errorCode.includes('invalid_grant')) {
      throw new Error('Token refresh failed: invalid_grant - The refresh token has been revoked or is invalid. User needs to re-authenticate.');
    }
    
    if (errorCode.includes('invalid_client')) {
      throw new Error('Token refresh failed: invalid_client - OAuth client credentials are invalid.');
    }
    
    throw new Error(`Token refresh failed: ${error.message || error.error || 'Unknown error'}`);
  }
}

export async function getDriveAccessTokenInfo(accessToken: string) {
  const oauth2Client = getDriveOAuthClient();
  const oauth2 = google.oauth2("v2");
  const info = await oauth2.tokeninfo({ access_token: accessToken });
  return info.data;
}

// Download a binary file (non-Google Docs types) as a stream
export async function downloadDriveFileStream(tokens: DriveTokens, fileId: string): Promise<{ stream: Readable }> {
  const drive = getDriveClientFromTokens(tokens);
  const res: any = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" as any }
  );
  return { stream: res.data as Readable };
}

// Export a Google Docs-type file to a given mimeType (e.g., application/pdf)
export async function exportDriveFileStream(tokens: DriveTokens, fileId: string, mimeType: string): Promise<{ stream: Readable }> {
  const drive = getDriveClientFromTokens(tokens);
  const res: any = await drive.files.export(
    { fileId, mimeType },
    { responseType: "stream" as any }
  );
  return { stream: res.data as Readable };
}

// Helper: ensure a Readable stream from Buffer or Readable
function toReadable(data: Buffer | Readable): Readable {
  if (data instanceof Readable) return data;
  return Readable.from(data);
}

// Upload a file to Drive
export async function uploadDriveFile(
  tokens: DriveTokens,
  params: { name: string; mimeType: string; data: Buffer | Readable; parents?: string[] }
) {
  const drive = getDriveClientFromTokens(tokens);
  const res = await drive.files.create({
    requestBody: { name: params.name, parents: params.parents },
    media: { mimeType: params.mimeType, body: toReadable(params.data) as any },
    fields: "id,name,mimeType,webViewLink,webContentLink,parents",
  });
  return res.data;
}

// Create a folder
export async function createDriveFolder(tokens: DriveTokens, name: string, parentId?: string) {
  const drive = getDriveClientFromTokens(tokens);
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id,name,mimeType,parents,webViewLink",
  });
  return res.data;
}

// List children of a folder
export async function listDriveFolderChildren(tokens: DriveTokens, folderId: string, pageToken?: string, pageSize: number = 25, q?: string) {
  const drive = getDriveClientFromTokens(tokens);
  const base = `'${folderId}' in parents and trashed = false`;
  const query = q ? `${base} and (${q})` : base;
  const res = await drive.files.list({ q: query, pageSize, pageToken, orderBy: "name", fields: "files(id,name,mimeType,modifiedTime,size,owners,webViewLink,webContentLink,thumbnailLink,folderColorRgb,starred),nextPageToken" });
  return res.data;
}

// Move a file to a new parent (adds new parent and removes old parents)
export async function moveDriveFile(tokens: DriveTokens, fileId: string, newParentId: string) {
  const drive = getDriveClientFromTokens(tokens);
  const file = await drive.files.get({ fileId, fields: "parents" });
  const previousParents = (file.data.parents || []).join(",");
  const res = await drive.files.update({
    fileId,
    addParents: newParentId,
    removeParents: previousParents || undefined,
    fields: "id, parents",
  });
  return res.data;
}

// Set a permission on a file
export async function setDriveFilePermission(
  tokens: DriveTokens,
  fileId: string,
  permission: { role: "owner" | "organizer" | "fileOrganizer" | "writer" | "commenter" | "reader"; type: "user" | "group" | "domain" | "anyone"; emailAddress?: string; domain?: string; allowFileDiscovery?: boolean },
  sendNotificationEmail: boolean = false
) {
  const drive = getDriveClientFromTokens(tokens);
  const res = await drive.permissions.create({
    fileId,
    requestBody: permission as any,
    sendNotificationEmail,
    fields: "id, type, role, emailAddress",
  });
  return res.data;
}

// Read a Drive file fully into base64 (for email attachment)
export async function readDriveFileAsBase64(tokens: DriveTokens, fileId: string): Promise<{ base64: string; mimeType: string; name: string }> {
  const meta = await getDriveFileMetadata(tokens, fileId);
  // For Google Docs types, export to PDF by default
  const isDocs = (meta.mimeType || "").startsWith("application/vnd.google-apps");
  const targetMime = isDocs ? "application/pdf" : (meta.mimeType || "application/octet-stream");
  const { stream } = isDocs
    ? await exportDriveFileStream(tokens, fileId, targetMime)
    : await downloadDriveFileStream(tokens, fileId);
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });
  const buf = Buffer.concat(chunks);
  return { base64: buf.toString("base64"), mimeType: targetMime, name: meta.name || fileId };
}

// Update folder color
export async function updateFolderColor(tokens: DriveTokens, folderId: string, color: string) {
  try {
    const drive = getDriveClientFromTokens(tokens);
    const hexColor = getColorHex(color);
    
    const res = await drive.files.update({
      fileId: folderId,
      requestBody: {
        folderColorRgb: hexColor
      },
      fields: "id,name,folderColorRgb",
    });
    
    return res.data;
  } catch (error: any) {
    console.error('❌ Error updating folder color:', error.message);
    throw error;
  }
}

// Update item starred status
export async function updateItemStarred(tokens: DriveTokens, fileId: string, starred: boolean) {
  try {
    const drive = getDriveClientFromTokens(tokens);
    
    const res = await drive.files.update({
      fileId: fileId,
      requestBody: {
        starred: starred
      },
      fields: "id,name,starred",
    });
    
    console.log(`✅ Item ${fileId} starred status updated to ${starred}`);
    return res.data;
  } catch (error: any) {
    console.error('❌ Error updating item starred status:', error.message);
    throw error;
  }
}

// Helper: Convert color name to hex value for Google Drive
// All 25 official Google Drive folder colors
function getColorHex(color: string): string {
  const colorMap: { [key: string]: string } = {
    'chocolate': '#ac725e',         // Chocolate Ice Cream
    'brick': '#d06c63',             // Old Red Brick
    'fire': '#f83a22',              // Fire Engine
    'strawberry': '#fa573c',        // Wild Strawberry
    'orange': '#ff6d04',            // Orange Juice
    'autumn': '#f7bc04',            // Autumn Leaves
    'desert': '#fb8500',            // Desert Sand
    'custard': '#ffd60a',           // Custard
    'rainy': '#51cff0',             // Rainy Sky
    'denim': '#3f7ce3',             // Denim
    'pool': '#09d3ac',              // Pool
    'seafoam': '#16a76a',           // Sea Foam
    'spearmint': '#0fa156',         // Spearmint
    'meadow': '#5fb878',            // Spring Meadow
    'asparagus': '#7bd148',         // Asparagus
    'lime': '#c6d937',              // Lime Green
    'mouse': '#9e9e9e',             // Mouse (default)
    'gray': '#8f8f8f',              // Mountain Gray
    'earthworm': '#9dc3c3',         // Earthworm
    'bubblegum': '#f691b2',         // Bubblegum
    'purple': '#a4bdfc',            // Purple Rain
    'aubergine': '#5b4c8a',         // Black Aubergine
    'velvet': '#8764d8',            // Blue Velvet
    'orchid': '#b99aff'             // Orchid
  };
  return colorMap[color] || colorMap['mouse']; // Default to mouse if not found
}

export async function getGoogleUser(accessToken: string) {
  const url = "https://openidconnect.googleapis.com/v1/userinfo";
  const res = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return res.data;
}