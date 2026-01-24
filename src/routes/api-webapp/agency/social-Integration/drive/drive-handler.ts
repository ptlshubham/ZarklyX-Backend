import { Request } from "express";
import {
    generateDriveAuthUrl,
    exchangeDriveCodeForTokens,
    listMyDriveFiles,
    getDriveFileMetadata,
    refreshDriveAccessToken,
    getDriveAccessTokenInfo,
    downloadDriveFileStream,
    exportDriveFileStream,
    uploadDriveFile,
    createDriveFolder,
    listDriveFolderChildren,
    moveDriveFile,
    setDriveFilePermission,
    getGoogleUser,
    updateFolderColor,
    updateItemStarred,
    renameDriveItem,
    moveItemToFolder,
    getDriveClientFromTokens,
    moveFileToTrash,
} from "../../../../../services/drive-service";
import { getPreviewStream } from "../../../../../services/drive-preview.service";
import {
    saveOrUpdateToken,
    updateAccessToken,
    getConnectedDrivesByCompanyId,
    deleteTokensByCompanyIdAndProvider,
} from "../../../../../services/token-store.service";
import {
    notifySocialConnectionAdded,
    notifySocialConnectionRemoved,
} from "../../../../../services/socket-service";

/**
 * 🔐 TOKEN EXTRACTION & VALIDATION HANDLERS
 */

/**
 * Extract tokens from request headers, query, or body
 * @param req - Express Request object
 * @returns Object containing access_token and refresh_token
 */
export function extractTokens(req: Request) {
    const access_token = (
        (req.headers["x-access-token"] as string) ||
        (req.query.access_token as string) ||
        (req.body?.access_token as string) ||
        ""
    ).trim();
    const refresh_token = (
        (req.headers["x-refresh-token"] as string) ||
        (req.query.refresh_token as string) ||
        (req.body?.refresh_token as string) ||
        ""
    ).trim();
    const tokens: any = {};
    if (access_token) tokens.access_token = access_token;
    if (refresh_token) tokens.refresh_token = refresh_token;
    return tokens;
}

/**
 * Ensure access token is valid, refresh if needed
 * @param tokens - Token object with access_token and refresh_token
 */
export async function ensureValidAccessToken(tokens: any): Promise<void> {
    if (!tokens.access_token && tokens.refresh_token) {
        try {
            const refreshed = await refreshDriveAccessToken(tokens.refresh_token);
            tokens.access_token = refreshed.access_token;
            if (refreshed.refresh_token) {
                tokens.refresh_token = refreshed.refresh_token;
            }
        } catch (error: any) {
            console.error("❌ Failed to refresh token:", error.message);
            throw new Error("Failed to refresh access token");
        }
    } else if (tokens.access_token && tokens.refresh_token) {
        try {
            const verifyUrl =
                "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=" +
                tokens.access_token;
            const verifyResponse = await fetch(verifyUrl);

            if (!verifyResponse.ok) {
                const refreshed = await refreshDriveAccessToken(tokens.refresh_token);
                tokens.access_token = refreshed.access_token;
                if (refreshed.refresh_token) {
                    tokens.refresh_token = refreshed.refresh_token;
                }
            }
        } catch (error: any) {
            try {
                const refreshed = await refreshDriveAccessToken(tokens.refresh_token);
                tokens.access_token = refreshed.access_token;
                if (refreshed.refresh_token) {
                    tokens.refresh_token = refreshed.refresh_token;
                }
            } catch (refreshError: any) {
                console.error("❌ Failed to refresh token:", refreshError.message);
                throw new Error("Failed to refresh access token");
            }
        }
    }
}

/**
 * 🔐 AUTHENTICATION HANDLERS
 */

/**
 * Generate OAuth authorization URL for Google Drive
 * @param companyId - Company ID to associate with drive account
 * @param scopes - OAuth scopes (comma-separated string)
 * @returns OAuth URL
 */
export async function generateAuthUrl(
    companyId: string,
    scopes?: string
): Promise<string> {
    // Convert comma-separated scopes to array
    const scopeArray = scopes ? scopes.split(',').map(s => s.trim()) : undefined;
    const result = await generateDriveAuthUrl(scopeArray, companyId);
    return result;
}

/**
 * Exchange OAuth code for tokens and save to database
 * @param code - Authorization code from Google
 * @param state - State parameter linking to companyId
 * @returns Token object with access_token, refresh_token, and user info
 */
export async function handleOAuthCallback(
    code: string,
    state: string
): Promise<{
    tokens: any;
    companyId: string;
    accountEmail: string;
    accountId: string;
}> {
    const tokens = await exchangeDriveCodeForTokens(code);

    // Get user profile
    if (!tokens.access_token) {
        throw new Error("No access token received from OAuth");
    }
    const userProfile = await getGoogleUser(tokens.access_token);
    const accountEmail = userProfile.emailAddress;
    const accountId = userProfile.permissionId;

    // Extract companyId from state (you'll need to implement state storage)
    const companyId = state; // Simplified - implement proper state management

    // Save tokens to database
    await saveOrUpdateToken({
        companyId,
        provider: "google-drive",
        accountEmail,
        accountId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || "",
        expiryDate: tokens.expiry_date || Date.now() + 3600 * 1000,
        scopes: tokens.scope?.split(" ") || [],
    });

    // Notify company users about connection
    notifySocialConnectionAdded(companyId, {
        provider: "google-drive",
        accountEmail,
        accountId,
    });

    return { tokens, companyId, accountEmail, accountId };
}

/**
 * 👤 USER PROFILE HANDLERS
 */

/**
 * Get authenticated user's Google Drive profile and storage quota
 * @param tokens - Token object with access_token and refresh_token
 * @returns User profile and storage quota information
 */
export async function getUserProfile(tokens: any): Promise<{
    user: any;
    storageQuota: any;
}> {
    await ensureValidAccessToken(tokens);

    const drive = getDriveClientFromTokens(tokens);

    const aboutResponse = await drive.about.get({
        fields:
            "user,storageQuota,importFormats,exportFormats,maxImportSizes,maxUploadSize",
    });

    return {
        user: aboutResponse.data.user,
        storageQuota: aboutResponse.data.storageQuota,
    };
}

/**
 * 📁 FILE/FOLDER LISTING HANDLERS
 */

/**
 * List files in Google Drive with pagination and search
 * @param tokens - Token object
 * @param pageToken - Token for next page
 * @param pageSize - Number of items per page
 * @param searchQuery - Search query to filter files
 * @returns Files list with pagination info
 */
export async function listFiles(
    tokens: any,
    pageToken?: string,
    pageSize: number = 25,
    searchQuery?: string
): Promise<any> {
    await ensureValidAccessToken(tokens);
    return await listMyDriveFiles(tokens, pageToken, pageSize, searchQuery);
}

/**
 * Get metadata of a specific file by ID
 * @param tokens - Token object
 * @param fileId - File ID
 * @returns File metadata
 */
export async function getFileMetadata(
    tokens: any,
    fileId: string
): Promise<any> {
    await ensureValidAccessToken(tokens);
    return await getDriveFileMetadata(tokens, fileId);
}

/**
 * List contents inside a specific folder
 * @param tokens - Token object
 * @param folderId - Folder ID
 * @param pageToken - Pagination token
 * @param pageSize - Items per page
 * @param searchQuery - Search filter
 * @returns Folder contents
 */
export async function listFolderChildren(
    tokens: any,
    folderId: string,
    pageToken?: string,
    pageSize: number = 25,
    searchQuery?: string
): Promise<any> {
    await ensureValidAccessToken(tokens);
    return await listDriveFolderChildren(
        tokens,
        folderId,
        pageToken,
        pageSize,
        searchQuery
    );
}

/**
 * 📤 FILE UPLOAD/CREATE HANDLERS
 */

/**
 * Upload a file to Google Drive
 * @param tokens - Token object
 * @param fileBuffer - File buffer
 * @param fileName - File name
 * @param mimeType - File MIME type
 * @param parentId - Parent folder ID (optional)
 * @returns Uploaded file metadata
 */
export async function uploadFile(
    tokens: any,
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    parentId?: string
): Promise<any> {
    await ensureValidAccessToken(tokens);
    // uploadDriveFile expects specific params object
    return await uploadDriveFile(tokens, {
        name: fileName,
        mimeType: mimeType,
        data: fileBuffer,
        parents: parentId ? [parentId] : undefined,
    });
}

/**
 * Create a new folder in Google Drive
 * @param tokens - Token object
 * @param folderName - Folder name
 * @param parentId - Parent folder ID (optional)
 * @returns Created folder metadata
 */
export async function createFolder(
    tokens: any,
    folderName: string,
    parentId?: string
): Promise<any> {
    await ensureValidAccessToken(tokens);
    return await createDriveFolder(tokens, folderName, parentId);
}

/**
 * 🔧 FILE MANAGEMENT HANDLERS
 */

/**
 * Move a file or folder to a different location
 * @param tokens - Token object
 * @param fileId - File/Folder ID to move
 * @param newParentId - Destination folder ID
 * @returns Updated file metadata
 */
export async function moveFile(
    tokens: any,
    fileId: string,
    newParentId: string
): Promise<any> {
    await ensureValidAccessToken(tokens);
    return await moveDriveFile(tokens, fileId, newParentId);
}

/**
 * Move multiple files/folders to a target folder
 * @param tokens - Token object
 * @param fileIds - Array of file/folder IDs
 * @param targetFolderId - Destination folder ID
 * @returns Array of move results
 */
export async function moveMultipleFiles(
    tokens: any,
    fileIds: string[],
    targetFolderId: string
): Promise<any[]> {
    await ensureValidAccessToken(tokens);

    const results = [];
    for (const fileId of fileIds) {
        try {
            const result = await moveItemToFolder(tokens, fileId, targetFolderId);
            results.push({ fileId, success: true, result });
        } catch (error: any) {
            results.push({ fileId, success: false, error: error.message });
        }
    }
    return results;
}

/**
 * Rename a file or folder
 * @param tokens - Token object
 * @param fileId - File/Folder ID
 * @param newName - New name
 * @returns Updated file metadata
 */
export async function renameFile(
    tokens: any,
    fileId: string,
    newName: string
): Promise<any> {
    await ensureValidAccessToken(tokens);
    return await renameDriveItem(tokens, fileId, newName);
}

/**
 * Update folder color
 * @param tokens - Token object
 * @param folderId - Folder ID
 * @param color - Color name
 * @returns Updated folder metadata
 */
export async function updateFolderColorHandler(
    tokens: any,
    folderId: string,
    color: string
): Promise<any> {
    await ensureValidAccessToken(tokens);
    return await updateFolderColor(tokens, folderId, color);
}

/**
 * Toggle star/unstar status for files and folders
 * @param tokens - Token object
 * @param itemId - File/Folder ID
 * @param starred - Boolean value (true to star, false to unstar)
 * @returns Updated item metadata
 */
export async function updateItemStarredHandler(
    tokens: any,
    itemId: string,
    starred: boolean
): Promise<any> {
    await ensureValidAccessToken(tokens);
    return await updateItemStarred(tokens, itemId, starred);
}

/**
 * Move file/folder to trash
 * @param tokens - Token object
 * @param fileId - File/Folder ID
 * @returns Updated file metadata
 */
export async function trashFile(
    tokens: any,
    fileId: string
): Promise<any> {
    await ensureValidAccessToken(tokens);
    return await moveFileToTrash(tokens, fileId);
}

/**
 * Move multiple files/folders to trash
 * @param tokens - Token object
 * @param fileIds - Array of file/folder IDs
 * @returns Array of trash results
 */
export async function trashMultipleFiles(
    tokens: any,
    fileIds: string[]
): Promise<any[]> {
    await ensureValidAccessToken(tokens);

    const results = [];
    for (const fileId of fileIds) {
        try {
            const result = await moveFileToTrash(tokens, fileId);
            results.push({ fileId, success: true, result });
        } catch (error: any) {
            results.push({ fileId, success: false, error: error.message });
        }
    }
    return results;
}

/**
 * 🔗 FILE SHARING HANDLERS
 */

/**
 * Get all share information for a file/folder
 * @param tokens - Token object
 * @param fileId - File ID
 * @returns Share information including users, access level, and link
 */
export async function getFileShareInfo(
    tokens: any,
    fileId: string
): Promise<{
    sharedUsers: any[];
    accessLevel: string;
    shareLink: string;
}> {
    await ensureValidAccessToken(tokens);

    const drive = getDriveClientFromTokens(tokens);

    // Get file metadata
    const fileResponse = await drive.files.get({
        fileId,
        fields: "webViewLink, permissions",
    });

    const shareLink =
        fileResponse.data.webViewLink ||
        `https://drive.google.com/file/d/${fileId}/view`;

    // Get permissions
    const permissionsResponse = await drive.permissions.list({
        fileId,
        fields: "permissions(id, type, role, emailAddress, displayName)",
    });

    const permissions = permissionsResponse.data.permissions || [];

    // Separate shared users from access level permissions
    const sharedUsers = permissions
        .filter((p) => p.type === "user" && p.role !== "owner")
        .map((p) => ({
            permissionId: p.id,
            email: p.emailAddress,
            displayName: p.displayName || p.emailAddress?.split("@")[0] || "Unknown",
            role: p.role,
        }));

    // Determine access level
    let accessLevel = "restricted";
    const hasAnyonePermission = permissions.some((p) => p.type === "anyone");
    const hasDomainPermission = permissions.some((p) => p.type === "domain");

    if (hasAnyonePermission) {
        accessLevel = "anyone";
    } else if (hasDomainPermission) {
        accessLevel = "organization";
    }

    return { sharedUsers, accessLevel, shareLink };
}

/**
 * Share a file with a specific user
 * @param tokens - Token object
 * @param fileId - File ID
 * @param email - User email to share with
 * @param role - Access role ('viewer' or 'editor')
 * @returns Permission details
 */
export async function shareFileWithUser(
    tokens: any,
    fileId: string,
    email: string,
    role: string
): Promise<{ permissionId: string; displayName: string }> {
    await ensureValidAccessToken(tokens);

    const drive = getDriveClientFromTokens(tokens);

    const permissionResponse = await drive.permissions.create({
        fileId,
        requestBody: {
            type: "user",
            role: role,
            emailAddress: email,
        },
        sendNotificationEmail: false,
        fields: "id, displayName",
    });

    return {
        permissionId: permissionResponse.data.id!,
        displayName: permissionResponse.data.displayName || email.split("@")[0],
    };
}

/**
 * Remove a user from file sharing
 * @param tokens - Token object
 * @param fileId - File ID
 * @param permissionId - Permission ID to remove
 */
export async function removeFileSharing(
    tokens: any,
    fileId: string,
    permissionId: string
): Promise<void> {
    await ensureValidAccessToken(tokens);

    const drive = getDriveClientFromTokens(tokens);

    await drive.permissions.delete({
        fileId,
        permissionId,
    });
}

/**
 * Update user's role in file sharing
 * @param tokens - Token object
 * @param fileId - File ID
 * @param permissionId - Permission ID to update
 * @param role - New role ('viewer' or 'editor')
 */
export async function updateFileSharingRole(
    tokens: any,
    fileId: string,
    permissionId: string,
    role: string
): Promise<void> {
    await ensureValidAccessToken(tokens);

    const drive = getDriveClientFromTokens(tokens);

    await drive.permissions.update({
        fileId,
        permissionId,
        requestBody: {
            role: role,
        },
    });
}

/**
 * Update access level for a file/folder
 * @param tokens - Token object
 * @param fileId - File ID
 * @param accessLevel - Access level ('restricted', 'organization', or 'anyone')
 */
export async function updateFileAccessLevel(
    tokens: any,
    fileId: string,
    accessLevel: string
): Promise<void> {
    await ensureValidAccessToken(tokens);

    const drive = getDriveClientFromTokens(tokens);

    // Remove existing public/domain permissions
    const permissionsResponse = await drive.permissions.list({
        fileId,
        fields: "permissions(id, type)",
    });

    const permissions = permissionsResponse.data.permissions || [];
    for (const perm of permissions) {
        if (perm.type === "anyone" || perm.type === "domain") {
            await drive.permissions.delete({
                fileId,
                permissionId: perm.id!,
            });
        }
    }

    // Add new permission based on accessLevel
    if (accessLevel === "anyone") {
        await drive.permissions.create({
            fileId,
            requestBody: {
                role: "reader",
                type: "anyone",
            },
        });
    } else if (accessLevel === "organization") {
        const userProfile = await drive.about.get({
            fields: "user",
        });

        const domain = userProfile.data.user?.emailAddress?.split("@")[1];

        if (domain) {
            await drive.permissions.create({
                fileId,
                requestBody: {
                    role: "reader",
                    type: "domain",
                    domain,
                },
            });
        }
    }
}

/**
 * 🔄 TOKEN MANAGEMENT HANDLERS
 */

/**
 * Refresh expired access token
 * @param refreshToken - Refresh token
 * @param accountEmail - Account email (optional)
 * @returns New tokens
 */
export async function refreshToken(
    refreshToken: string,
    accountEmail?: string
): Promise<any> {
    const tokens = await refreshDriveAccessToken(refreshToken);

    // Update token in database if accountEmail provided
    if (accountEmail && tokens.access_token) {
        await updateAccessToken(
            "google-drive",
            accountEmail,
            tokens.access_token,
            tokens.expiry_date || Date.now() + 3600 * 1000
        );
    }

    return tokens;
}

/**
 * Get token information
 * @param accessToken - Access token
 * @returns Token information
 */
export async function getTokenInfo(accessToken: string): Promise<any> {
    return await getDriveAccessTokenInfo(accessToken);
}

/**
 * 🏢 COMPANY/MULTI-USER HANDLERS
 */

/**
 * Get all connected Google Drive accounts for a company
 * @param companyId - Company ID
 * @returns Array of connected drives
 */
export async function getCompanyDrives(companyId: string): Promise<any[]> {
    return await getConnectedDrivesByCompanyId(companyId);
}

/**
 * Disconnect all Google Drive connections for a company
 * @param companyId - Company ID
 * @returns Number of disconnected drives
 */
export async function disconnectCompanyDrives(
    companyId: string
): Promise<number> {
    const deletedCount = await deleteTokensByCompanyIdAndProvider(
        companyId,
        "google-drive"
    );

    // Notify company users about disconnection
    notifySocialConnectionRemoved(companyId, "google-drive");

    return deletedCount;
}

/**
 * 📥 FILE DOWNLOAD/EXPORT HANDLERS
 */

/**
 * Get file download stream
 * @param tokens - Token object
 * @param fileId - File ID
 * @returns File stream and metadata
 */
export async function getFileDownloadStream(
    tokens: any,
    fileId: string
): Promise<{ stream: any; metadata: any }> {
    await ensureValidAccessToken(tokens);

    const metadata = await getDriveFileMetadata(tokens, fileId);
    const stream = await downloadDriveFileStream(tokens, fileId);

    return { stream, metadata };
}

/**
 * Get file export stream (for Google Docs types)
 * @param tokens - Token object
 * @param fileId - File ID
 * @param mimeType - Target MIME type
 * @returns Export stream and metadata
 */
export async function getFileExportStream(
    tokens: any,
    fileId: string,
    mimeType: string
): Promise<{ stream: any; metadata: any }> {
    await ensureValidAccessToken(tokens);

    const metadata = await getDriveFileMetadata(tokens, fileId);
    const stream = await exportDriveFileStream(tokens, fileId, mimeType);

    return { stream, metadata };
}

/**
 * Get file preview stream
 * @param tokens - Token object
 * @param fileId - File ID
 * @returns Preview stream
 */
export async function getFilePreviewStream(
    tokens: any,
    fileId: string
): Promise<any> {
    await ensureValidAccessToken(tokens);
    return await getPreviewStream(tokens, fileId);
}

/**
 * 📥 FILE DOWNLOAD HELPERS
 */

/**
 * Download multiple files with concurrency control
 * @param files - Array of files to download
 * @param tokens - Token object
 * @param concurrency - Maximum concurrent downloads (default: 15)
 * @returns Array of downloaded files with name and buffer
 */
export async function downloadFilesInParallel(
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
