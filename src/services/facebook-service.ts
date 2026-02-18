import axios from "axios";
import FormData from 'form-data';
import https from 'https';
import http from 'http';
import { Readable } from 'stream';

function getRedirectUri() {
  return (
    process.env.FACEBOOK_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/facebook/oauth2callback`
  );
}

function getClient() {
  // prefer the `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` names from the .env
  // but fall back to older `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` if present
  const clientId = process.env.FACEBOOK_APP_ID || process.env.FACEBOOK_CLIENT_ID || "";
  const clientSecret = process.env.FACEBOOK_APP_SECRET || process.env.FACEBOOK_CLIENT_SECRET || "";
  const redirectUri = getRedirectUri();
  return { clientId, clientSecret, redirectUri };
}

export async function getFacebookClient(companyId: string) {
  const { getToken } = await import('./token-store.service');
  const token = await getToken('facebook', companyId);
  if (!token || !token.accessToken) {
    throw new Error(`No Facebook token found for company ${companyId}`);
  }
  return { accessToken: token.accessToken, refreshToken: token.refreshToken };
}
export function generateFacebookAuthUrl(scopes?: string[]) {
  const { clientId, redirectUri } = getClient();
  if (!clientId) throw new Error("Facebook client id is not configured (FACEBOOK_APP_ID)");
  const scopeList = scopes?.length ? scopes : (process.env.FACEBOOK_SCOPES || "email,public_profile,pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_engagement").split(/[ ,]+/).filter(Boolean);
  const scopeParam = scopeList.join(",");
  const state = Math.random().toString(36).slice(2);
  const url =
    `https://www.facebook.com/v16.0/dialog/oauth` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}` +
    `&scope=${encodeURIComponent(scopeParam)}` +
    `&response_type=code`;
  return { url, state };
}

export async function exchangeFacebookCodeForTokens(code: string) {
  const { clientId, clientSecret, redirectUri } = getClient();
  if (!clientId || !clientSecret) throw new Error("Facebook client id/secret not configured (FACEBOOK_APP_ID / FACEBOOK_APP_SECRET)");
  const url = `https://graph.facebook.com/v16.0/oauth/access_token` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&client_secret=${encodeURIComponent(clientSecret)}` +
    `&code=${encodeURIComponent(code)}`;
  const res = await axios.get(url);
  return res.data; // { access_token, token_type, expires_in }
}

export async function exchangeShortLivedForLongLived(accessToken: string) {
  const { clientId, clientSecret } = getClient();
  const url = `https://graph.facebook.com/v16.0/oauth/access_token` +
    `?grant_type=fb_exchange_token` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&client_secret=${encodeURIComponent(clientSecret)}` +
    `&fb_exchange_token=${encodeURIComponent(accessToken)}`;
  const res = await axios.get(url);
  return res.data; // { access_token, token_type, expires_in }
}

export async function getFacebookUser(accessToken: string) {
  const url = `https://graph.facebook.com/me?fields=id,name,email,picture{url}` + `&access_token=${encodeURIComponent(accessToken)}`;
  const res = await axios.get(url);
  return res.data;
}

// export async function getFacebookPages(accessToken: string) {
//   const url = `https://graph.facebook.com/me/accounts?access_token=${encodeURIComponent(accessToken)}`;
//   const res = await axios.get(url);
//   return res.data; // { data: [ { id, name, access_token, ... } ] }
// }

// export async function postToFacebookPage(pageId: string, pageAccessToken: string, message: string) {
//   const url = `https://graph.facebook.com/${encodeURIComponent(pageId)}/feed`;
//   const body = new URLSearchParams({ message, access_token: pageAccessToken });
//   const res = await axios.post(url, body.toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
//   return res.data;
// }

export async function getFacebookPages(accessToken: string) {

  // const url = https://graph.facebook.com/me/accounts?access_token=${encodeURIComponent(accessToken)};
  // Requesting business_manager permission - may fail if user doesn't have proper access
  const url = `https://graph.facebook.com/me/accounts?fields=id,name,access_token,picture{url},followers_count,category,category_list,business`;
  
  try {
    const res = await axios.get(url,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    return res.data; // { data: [ { id, name, access_token, ... } ] }
  } catch (error: any) {
    // If business_manager permission fails, fallback to simpler fields
    if (error?.response?.status === 400 || error?.response?.status === 403) {
      console.warn("[FACEBOOK SERVICE] Business manager permission denied, falling back to basic fields");
      
      const fallbackUrl = `https://graph.facebook.com/me/accounts?fields=id,name,access_token,picture{url},followers_count,category`;
      const fallbackRes = await axios.get(fallbackUrl,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      return fallbackRes.data;
    }
    
    // Re-throw other errors
    throw error;
  }
}


// Get the businesses the user manages, along with their owned pages
export async function getFacebookBusinesses(accessToken: string) {
  const url = `https://graph.facebook.com/me/businesses?fields=id,name,picture{url},owned_pages{id,name,username,emails,category,followers_count,picture{url},access_token}`;
  const res = await axios.get(url,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  return res.data
}

// Delay function to avoid rate limiting
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Type definitions
type FacebookData = {
  token: string;
  pageId: string;
  pageAccessToken?: string;
};

type MediaType = "IMAGE" | "VIDEO";

// Get page access token from user access token
export async function getPageAccessToken(userAccessToken: string, pageId: string): Promise<string | null> {
  try {
    const url = `https://graph.facebook.com/me/accounts?fields=id,access_token`;
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${userAccessToken}` }
    });
    
    const pages = res.data?.data || [];
    const page = pages.find((p: any) => p.id === pageId);
    
    if (page && page.access_token) {
      return page.access_token;
    }
    
    // Also check businesses for page access token
    const businessUrl = `https://graph.facebook.com/me/businesses?fields=owned_pages{id,access_token}`;
    const businessRes = await axios.get(businessUrl, {
      headers: { Authorization: `Bearer ${userAccessToken}` }
    });
    
    const businesses = businessRes.data?.data || [];
    for (const business of businesses) {
      const ownedPages = business.owned_pages?.data || [];
      const businessPage = ownedPages.find((p: any) => p.id === pageId);
      if (businessPage && businessPage.access_token) {
        return businessPage.access_token;
      }
    }
    
    return null;
  } catch (error: any) {
    console.error("[FACEBOOK SERVICE] Error getting page access token:", error.message);
    return null;
  }
}

// Post text message to Facebook page feed
export async function postToFacebookPage(pageId: string, pageAccessToken: string, message: string) {
  const url = `https://graph.facebook.com/${pageId}/feed`;
  const body = new URLSearchParams({ message, access_token: pageAccessToken });
  return axios.post(url, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });
}

// Post media to Facebook - handles single/multiple images/videos
export async function postPhotoToFacebookPage(
  pageId: string, 
  pageAccessToken: string, 
  imageUrl: string, 
  caption?: string
): Promise<any> {
  console.log("[FACEBOOK SERVICE] Posting photo to page:", { pageId });
  
  const url = `https://graph.facebook.com/v19.0/${pageId}/photos`;
  const res = await axios.post(url, {
    url: imageUrl,
    access_token: pageAccessToken,
    caption: caption
  });
  
  return res.data;
}

// Post video to Facebook page with audio preservation
export async function postVideoToFacebookPage(
  pageId: string,
  pageAccessToken: string,
  videoUrl: string,
  caption?: string
): Promise<any> {
  console.log("[FACEBOOK SERVICE] Posting video to page:", { pageId, videoUrl });
  
  try {
    // Download video from CDN
    const videoStream = await downloadFile(videoUrl);
    
    // Create multipart form data with video file
    const form = new FormData();
    form.append('source', videoStream, 'video.mp4');
    form.append('access_token', pageAccessToken);
    if (caption) {
      form.append('description', caption);
    }
    
    const url = `https://graph.facebook.com/v19.0/${pageId}/videos`;
    const res = await axios.post(url, form, {
      headers: form.getHeaders()
    });
    
    console.log("[FACEBOOK SERVICE] Video posted successfully with audio");
    return res.data;
  } catch (error: any) {
    console.error("[FACEBOOK SERVICE] Video posting error:", error.message);
    // Fallback to file_url method if multipart fails
    console.log("[FACEBOOK SERVICE] Falling back to file_url method...");
    const url = `https://graph.facebook.com/v19.0/${pageId}/videos`;
    const res = await axios.post(url, {
      file_url: videoUrl,
      access_token: pageAccessToken,
      description: caption
    });
    return res.data;
  }
}

// Helper function to download file from URL
async function downloadFile(fileUrl: string): Promise<Readable> {
  return new Promise((resolve, reject) => {
    const protocol = fileUrl.startsWith('https') ? https : http;
    
    protocol.get(fileUrl, { timeout: 30000 }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        // Handle redirects
        downloadFile(response.headers.location).then(resolve).catch(reject);
      } else if (response.statusCode === 200) {
        resolve(response);
      } else {
        reject(new Error(`Failed to download file: HTTP ${response.statusCode}`));
      }
    }).on('error', reject);
  });
}

// Upload media unpublished for carousel/album
async function uploadMediaUnpublished(
  pageId: string,
  pageAccessToken: string,
  mediaUrl: string,
  mediaType: "VIDEO" | "IMAGE"
): Promise<string> {
  try {
    if (mediaType === "VIDEO") {
      // For videos, use multipart form-data to preserve audio
      const videoStream = await downloadFile(mediaUrl);
      const form = new FormData();
      form.append('source', videoStream, 'video.mp4');
      form.append('published', 'false');
      form.append('access_token', pageAccessToken);
      
      const endpoint = `https://graph.facebook.com/v19.0/${pageId}/videos`;
      const res = await axios.post(endpoint, form, {
        headers: form.getHeaders()
      });
      
      console.log("[FACEBOOK SERVICE] Video uploaded unpublished with audio preserved");
      return res.data.id;
    } else {
      // For images, use simple URL method
      const endpoint = `https://graph.facebook.com/v19.0/${pageId}/photos`;
      const res = await axios.post(endpoint, {
        url: mediaUrl,
        published: false,
        access_token: pageAccessToken
      });
      return res.data.id;
    }
  } catch (error: any) {
    console.error("[FACEBOOK SERVICE] Media upload error:", error.message);
    // Fallback to file_url for videos if multipart fails
    if (mediaType === "VIDEO") {
      const endpoint = `https://graph.facebook.com/v19.0/${pageId}/videos`;
      const res = await axios.post(endpoint, {
        file_url: mediaUrl,
        published: false,
        access_token: pageAccessToken
      });
      return res.data.id;
    }
    throw error;
  }
}

// Create carousel/album post from unpublished media
async function createAlbumPost(
  pageId: string,
  pageAccessToken: string,
  mediaIds: string[],
  caption?: string
): Promise<any> {
  const feedUrl = `https://graph.facebook.com/v19.0/${pageId}/feed`;
  
  const res = await axios.post(feedUrl, {
    attached_media: mediaIds.map(id => ({ media_fbid: id })),
    message: caption,
    access_token: pageAccessToken
  });
  
  return res.data;
}

// Main unified function - posts single or multiple media (photos AND videos together)
export async function addFacebookPost(
  facebookData: FacebookData,
  mediaUrls: string | string[],
  caption: string,
  mediaType: MediaType = "IMAGE"
): Promise<any> {
  const urls = Array.isArray(mediaUrls) ? mediaUrls : [mediaUrls];
  const token = facebookData.pageAccessToken || facebookData.token;
  const pageId = facebookData.pageId;

  console.log("[FACEBOOK SERVICE] Posting to Facebook:", { pageId, filesCount: urls.length, mediaType });

  // Detect media types for each URL
  const mediaInfo = urls.map(url => {
    const isVideo = url.toLowerCase().includes('.mp4') || 
                   url.toLowerCase().includes('.mov') || 
                   url.toLowerCase().includes('.webm') ||
                   url.toLowerCase().includes('.mpeg') ||
                   url.toLowerCase().includes('.avi');
    return { url, isVideo };
  });
  
  const hasVideos = mediaInfo.some(m => m.isVideo);
  const hasImages = mediaInfo.some(m => !m.isVideo);
  const hasMixedMedia = hasVideos && hasImages;
  
  console.log("[FACEBOOK SERVICE] Media analysis:", { 
    totalFiles: urls.length, 
    hasVideos, 
    hasImages, 
    hasMixedMedia,
    videos: mediaInfo.filter(m => m.isVideo).length,
    images: mediaInfo.filter(m => !m.isVideo).length
  });

  try {
    // Single media - post directly
    if (urls.length === 1) {
      const singleMedia = mediaInfo[0];
      if (singleMedia.isVideo || mediaType === "VIDEO") {
        return await postVideoToFacebookPage(pageId, token, urls[0], caption);
      } else {
        return await postPhotoToFacebookPage(pageId, token, urls[0], caption);
      }
    }

    // Multiple media - Facebook has different approaches:
    // 1. Multiple IMAGES only: Use photo album (attached_media)
    // 2. Multiple VIDEOS only: Post each separately (Facebook doesn't support multi-video album)
    // 3. MIXED photos+videos: Post photos as album, videos separately
    
    if (!hasVideos) {
      // All images - create photo album
      console.log("[FACEBOOK SERVICE] Creating photo album with", urls.length, "images...");
      return await createPhotoAlbumPost(pageId, token, urls, caption);
    }
    
    if (!hasImages) {
      // All videos - post first video with caption, others without
      console.log("[FACEBOOK SERVICE] Posting", urls.length, "videos (Facebook doesn't support multi-video posts)...");
      const results = [];
      for (let i = 0; i < urls.length; i++) {
        const result = await postVideoToFacebookPage(pageId, token, urls[i], i === 0 ? caption : undefined);
        results.push(result);
        if (i < urls.length - 1) await delay(500);
      }
      return { 
        success: true, 
        posts: results, 
        message: "Videos posted individually (Facebook doesn't support multi-video albums)",
        id: results[0]?.id || results[0]?.post_id
      };
    }
    
    // Mixed media - post images as album, then videos separately
    console.log("[FACEBOOK SERVICE] Mixed media detected - posting images as album, videos separately...");
    const imageUrls = mediaInfo.filter(m => !m.isVideo).map(m => m.url);
    const videoUrls = mediaInfo.filter(m => m.isVideo).map(m => m.url);
    
    const results: any[] = [];
    
    // Post images as album first
    if (imageUrls.length > 0) {
      if (imageUrls.length === 1) {
        const imgResult = await postPhotoToFacebookPage(pageId, token, imageUrls[0], caption);
        results.push({ type: "photo", ...imgResult });
      } else {
        const albumResult = await createPhotoAlbumPost(pageId, token, imageUrls, caption);
        results.push({ type: "album", ...albumResult });
      }
      await delay(500);
    }
    
    // Post videos separately (without caption since album has it)
    for (let i = 0; i < videoUrls.length; i++) {
      const videoResult = await postVideoToFacebookPage(pageId, token, videoUrls[i], imageUrls.length === 0 && i === 0 ? caption : undefined);
      results.push({ type: "video", ...videoResult });
      if (i < videoUrls.length - 1) await delay(500);
    }
    
    return {
      success: true,
      posts: results,
      message: "Mixed media posted (images as album, videos separately)",
      id: results[0]?.id || results[0]?.post_id
    };

  } catch (error: any) {
    console.error("[FACEBOOK SERVICE] Facebook posting error:", error.message);
    throw error;
  } finally {
    await delay(1000); // Delay before next operation
  }
}

// Create photo album post from multiple image URLs
async function createPhotoAlbumPost(
  pageId: string,
  pageAccessToken: string,
  imageUrls: string[],
  caption?: string
): Promise<any> {
  console.log("[FACEBOOK SERVICE] Creating photo album with", imageUrls.length, "images...");
  
  try {
    // Upload images as unpublished first
    const mediaIds: string[] = [];
    
    for (let i = 0; i < imageUrls.length; i++) {
      try {
        const mediaId = await uploadMediaUnpublished(pageId, pageAccessToken, imageUrls[i], "IMAGE");
        mediaIds.push(mediaId);
        console.log(`[FACEBOOK SERVICE] Image ${i + 1}/${imageUrls.length} uploaded`);
        if (i < imageUrls.length - 1) await delay(300);
      } catch (error: any) {
        console.error(`[FACEBOOK SERVICE] Failed to upload image ${i + 1}:`, error.message);
        throw error;
      }
    }
    
    // Create album post with all images
    const result = await createAlbumPost(pageId, pageAccessToken, mediaIds, caption);
    console.log("[FACEBOOK SERVICE] Photo album created successfully");
    return result;
    
  } catch (albumError: any) {
    // If album creation fails, try posting images individually
    console.warn("[FACEBOOK SERVICE] Album creation failed, posting images individually:", albumError.message);
    
    const results = [];
    for (let i = 0; i < imageUrls.length; i++) {
      try {
        const result = await postPhotoToFacebookPage(pageId, pageAccessToken, imageUrls[i], i === 0 ? caption : undefined);
        results.push(result);
        if (i < imageUrls.length - 1) await delay(300);
      } catch (e: any) {
        console.error(`[FACEBOOK SERVICE] Failed to post image ${i + 1}:`, e.message);
        throw e;
      }
    }
    
    return { 
      success: true, 
      posts: results, 
      message: "Posted individually (album creation failed)", 
      fallback: true,
      id: results[0]?.id || results[0]?.post_id
    };
  }
}

// Search for Facebook users by name/email
// export async function searchFacebookUsers(
//   token: string,
//   searchQuery: string
// ): Promise<any> {
//   console.log("[FACEBOOK SERVICE] Searching Facebook users:", { searchQuery });
//   try {
//     const url = `https://graph.facebook.com/v19.0/search`;
//     const res = await axios.get(url, {
//       params: {
//         q: searchQuery,
//         type: "user",
//         fields: "id,name,email,picture.width(100).height(100)",
//         access_token: token,
//         limit: 20
//       }
//     });
    
//     console.log("[FACEBOOK SERVICE] Search results:", { count: res.data.data?.length });
//     return res.data.data;
//   } catch (error: any) {
//     console.error("[FACEBOOK SERVICE] Search error:", error.message);
//     throw error;
//   }
// }

// Get Facebook page followers (fans)
// export async function getFacebookPageFollowers(
//   token: string,
//   pageId: string,
//   limit: number = 50
// ): Promise<any> {
//   console.log("[FACEBOOK SERVICE] Fetching Facebook page followers...");
//   try {
//     const url = `https://graph.facebook.com/v19.0/${pageId}/followers`;
//     const res = await axios.get(url, {
//       params: {
//         fields: "id,name,email,picture.width(100).height(100)",
//         access_token: token,
//         limit
//       }
//     });
    
//     console.log("[FACEBOOK SERVICE] Followers fetched:", { count: res.data.data?.length });
//     return res.data.data;
//   } catch (error: any) {
//     console.error("[FACEBOOK SERVICE] Followers fetch error:", error.message);
//     throw error;
//   }
// }

// Tag users in Facebook post
// export async function tagUsersInFacebookPost(
//   token: string,
//   postId: string,
//   userIds: string[]
// ): Promise<any> {
//   console.log("[FACEBOOK SERVICE] Tagging users in post:", { postId, userIds });
//   try {
//     const url = `https://graph.facebook.com/v19.0/${postId}`;
//     const res = await axios.post(url, {
//       tags: userIds.join(","),
//       access_token: token
//     });
    
//     console.log("[FACEBOOK SERVICE] Users tagged successfully");
//     return res.data;
//   } catch (error: any) {
//     console.error("[FACEBOOK SERVICE] Tag users error:", error.message);
//     throw error;
//   }
// }

// Add collaborators to Facebook post (can edit before publish)
export async function addFacebookCollaborators(
  token: string,
  postId: string,
  collaboratorIds: string[]
): Promise<any> {
  console.log("[FACEBOOK SERVICE] Adding collaborators to post:", { postId, collaboratorIds });
  try {
    const url = `https://graph.facebook.com/v19.0/${postId}`;
    const res = await axios.post(url, {
      collaborators: collaboratorIds.join(","),
      access_token: token
    });
    
    console.log("[FACEBOOK SERVICE] Collaborators added successfully");
    return res.data;
  } catch (error: any) {
    console.error("[FACEBOOK SERVICE] Add collaborators error:", error.message);
    throw error;
  }
}

export async function getFacebookDebugToken(inputToken: string, appToken?: string) {
  // appToken can be {app_id}|{app_secret}
  const { clientId, clientSecret } = getClient();
  const appAccessToken = appToken || `${clientId}|${clientSecret}`;
  const url = `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(inputToken)}&access_token=${encodeURIComponent(appAccessToken)}`;
  const res = await axios.get(url);
  return res.data;
}

/**
 * Get all available clients from the database
 * Returns: Array of clients with their information
 */
export async function getAvailableClients() {
  try {
    const { SocialToken } = await import('../routes/api-webapp/agency/social-Integration/social-token.model');
    
    // Get all unique Facebook accounts (providers = 'facebook')
    const clients = await SocialToken.findAll({
      where: { provider: 'facebook' },
      attributes: ['id', 'accountId', 'accountEmail', 'companyId', 'createdAt'],
      raw: true,
    });

    return clients;
  } catch (error: any) {
    throw error;
  }
}

/**
 * Assign Facebook pages to a specific client
 * @param clientId - Facebook account/client ID
 * @param pageIds - Array of Facebook page IDs to assign
 * Returns: { success, assignedPages, failedPages }
 */
export async function assignPagesToClient(clientId: string, pageIds: string[]) {
  try {
    const { SocialToken } = await import('../routes/api-webapp/agency/social-Integration/social-token.model');
    
    if (!clientId || !pageIds || pageIds.length === 0) {
      throw new Error("clientId and pageIds array are required");
    }

    const assignedPages = [];
    const failedPages = [];

    for (const pageId of pageIds) {
      try {
        // Find or create assignment
        const [assignment, created] = await SocialToken.findOrCreate({
          where: {
            provider: 'facebook_page',
            accountId: pageId,
          },
          defaults: {
            provider: 'facebook_page',
            accountId: pageId,
            accountEmail: pageId,
            companyId: clientId,
            tokenType: 'Bearer',
          },
        } as any);

        // If exists, update the companyId (reassign)
        if (!created) {
          await assignment.update({ companyId: clientId });
        }

        assignedPages.push({
          pageId,
          clientId,
          assigned: true,
        });
      } catch (pageError: any) {
        failedPages.push({
          pageId,
          error: pageError.message,
        });
      }
    }

    return {
      success: true,
      assignedPages,
      failedPages,
      message: `Assigned ${assignedPages.length} pages, ${failedPages.length} failed`,
    };
  } catch (error: any) {
    throw error;
  }
}

/**
 * Get all page assignments for a specific page
 * @param pageId - Facebook page ID
 * Returns: Array of assignments with client information
 */
export async function getPageAssignments(pageId: string) {
  try {
    const { SocialToken } = await import('../routes/api-webapp/agency/social-Integration/social-token.model');
    
    if (!pageId) {
      throw new Error("pageId is required");
    }

    // Find all assignments for this page
    const assignments = await SocialToken.findAll({
      where: {
        provider: 'facebook_page',
        accountId: pageId,
      },
      attributes: ['id', 'companyId', 'accountId', 'createdAt', 'updatedAt'],
      raw: true,
    });

    return assignments;
  } catch (error: any) {
    throw error;
  }
}

/**
 * Update page assignment from one client to another
 * @param pageId - Facebook page ID
 * @param oldClientId - Current client ID
 * @param newClientId - New client ID to assign to
 * Returns: { success, pageId, oldClientId, newClientId }
 */
export async function updatePageAssignment(pageId: string, oldClientId: string, newClientId: string) {
  try {
    const { SocialToken } = await import('../routes/api-webapp/agency/social-Integration/social-token.model');
    
    if (!pageId || !oldClientId || !newClientId) {
      throw new Error("pageId, oldClientId, and newClientId are required");
    }

    // Find the assignment
    const assignment = await SocialToken.findOne({
      where: {
        provider: 'facebook_page',
        accountId: pageId,
        companyId: oldClientId,
      },
    } as any);

    if (!assignment) {
      throw new Error(`No assignment found for page ${pageId} with client ${oldClientId}`);
    }

    // Update the assignment
    await assignment.update({ companyId: newClientId });

    return {
      success: true,
      pageId,
      oldClientId,
      newClientId,
      updatedAt: assignment.updatedAt,
    };
  } catch (error: any) {
    throw error;
  }
}

/**
 * Remove a page assignment from a specific client
 * @param pageId - Facebook page ID
 * @param clientId - Client ID to remove assignment from
 * Returns: { success, pageId, clientId, removedAt }
 */
export async function removePageAssignment(pageId: string, clientId: string) {
  try {
    const { SocialToken } = await import('../routes/api-webapp/agency/social-Integration/social-token.model');
    
    if (!pageId || !clientId) {
      throw new Error("pageId and clientId are required");
    }

    // Find and delete the assignment
    const deletedCount = await SocialToken.destroy({
      where: {
        provider: 'facebook_page',
        accountId: pageId,
        companyId: clientId,
      },
    } as any);

    if (deletedCount === 0) {
      throw new Error(`No assignment found for page ${pageId} with client ${clientId}`);
    }

    return {
      success: true,
      pageId,
      clientId,
      removedAt: new Date(),
      message: `Assignment removed successfully`,
    };
  } catch (error: any) {
    throw error;
  }
}

function splitAccountsAndBusinesses(response: any) {
  const accounts = response?.accounts?.data || [];
  const businesses = response?.businesses?.data || [];

  const businessPageIds = new Set<string>();

  // collect all business-owned page ids
  businesses.forEach((business: any) => {
    const ownedPages = business.owned_pages?.data || [];
    ownedPages.forEach((page: any) => {
      if (page?.id) {
        businessPageIds.add(page.id);
      }
    });
  });

  // return admin standalone pages (not already in businesses)
  // Accept both ADMINISTER and MANAGE tasks since Facebook uses both
  return accounts.filter((page: any) => {
    const isAdmin = page.tasks?.includes("ADMINISTER") || page.tasks?.includes("MANAGE");
    const isBusinessPage = businessPageIds.has(page.id);
    return isAdmin && !isBusinessPage;
  });
}

function buildBusinessAccounts(response: any) {
  const businesses = response?.businesses?.data || [];

  const result = businesses
    .map((business: any) => {
      // Business pages may not have tasks field, so include all pages with proper data
      const pages = (business.owned_pages?.data || [])
        .filter((page: any) => page.id && page.name) // Just ensure basic required fields
        .map((page: any) => ({
          id: page.id,
          name: page.name,
          category: page.category || "Facebook Page",
          accessToken: page.access_token || null, // May not have accessToken initially
          profilePhoto: page.picture?.data?.url || page.picture || null,
        }));

      return {
        id: business.id,
        name: business.name,
        businessPic: business.picture?.data?.url || null,
        pages
      };
    })
    .filter((business: any) => business.pages.length > 0);

  return result;
}

export async function getFacebookPagesAndBusinesses(accessToken: string) {
  const url = `https://graph.facebook.com/me?fields=id,name,email,accounts{id,name,category,tasks,access_token,picture{url}},businesses{id,name,picture{url},owned_pages{id,name,category,tasks,access_token,picture{url}}}`;

  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const pages = splitAccountsAndBusinesses(res.data);
  const businesses = buildBusinessAccounts(res.data);

  console.log("[FACEBOOK SERVICE] Pages and Businesses Retrieved:", {
    standalonePages: pages.length,
    businesses: businesses.length,
    totalBusinessPages: businesses.reduce((sum: number, b: any) => sum + b.pages.length, 0)
  });

  return {
    pages,
    businesses
  };
}

function splitIGAccountsAndBusinesses(response: any) {
  const accounts = response?.accounts?.data || [];
  const businesses = response?.businesses?.data || [];

  const businessIGIds = new Set<string>();

  // collect all business-owned IG account ids
  businesses.forEach((business: any) => {
    const igAccounts = business.instagram_business_accounts?.data || [];
    igAccounts.forEach((account: any) => {
      if (account?.id) {
        businessIGIds.add(account.id);
      }
    });
  });

  // return only standalone IG accounts (not already in businesses)
  return accounts
    .filter((account: any) => account.instagram_business_account?.id && !businessIGIds.has(account.instagram_business_account.id))
    .map((account: any) => ({
      id: account.id,
      name: account.name,
      category: account.category || "Instagram Business",
      access_token: account.access_token,
      instagram_business_account: {
        id: account.instagram_business_account.id,
        username: account.instagram_business_account.username,
        name: account.instagram_business_account.name,
        profile_picture_url: account.instagram_business_account.profile_picture_url,
        followers_count: account.instagram_business_account.followers_count
      }
    }));
}

function buildIGBusinessAccounts(response: any) {
  const businesses = response?.businesses?.data || [];

  const result = businesses
    .map((business: any) => {
      const igAccounts = (business.instagram_business_accounts?.data || [])
        .map((account: any) => ({
          id: account.id,
          username: account.username,
          name: account.name,
          profile_picture_url: account.profile_picture_url,
          followers_count: account.followers_count
        }));

      return {
        id: business.id,
        name: business.name,
        businessPic: business.picture?.data?.url || null,
        igAccounts
      };
    })
    .filter((business: any) => business.igAccounts.length > 0);

  return result;
}

export async function addFacebookComment(
  postId: string,
  pageAccessToken: string,
  commentText: string
): Promise<any> {
  console.log("[FACEBOOK SERVICE] Adding comment to Facebook post...");
  
  try {
    const url = `https://graph.facebook.com/v18.0/${postId}/comments`;
    
    const response = await axios.post(url, {
      message: commentText,
      access_token: pageAccessToken
    });
    
    console.log("[FACEBOOK SERVICE] Comment added successfully:", response.data);
    return response.data;
  } catch (error: any) {
    console.error("[FACEBOOK SERVICE] Failed to add comment:", error.message);
    throw error;
  }
}

export async function getFacebookIGAccountsAndBusinesses(accessToken: string) {
  const url = `https://graph.facebook.com/me?fields=id,name,accounts{id,name,category,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count}},businesses{id,name,picture{url},instagram_business_accounts{id,username,name,profile_picture_url,followers_count}}`;

  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const igAccounts = splitIGAccountsAndBusinesses(res.data);
  const igBusinesses = buildIGBusinessAccounts(res.data);

  console.log("[FACEBOOK SERVICE] IG Accounts and Businesses Retrieved:", {
    standaloneIGAccounts: igAccounts,
    igBusinesses: igBusinesses,
    totalBusinessIGAccounts: igBusinesses.reduce((sum: number, b: any) => sum + b.igAccounts.length, 0)
  });

  return {
    igAccounts,
    igBusinesses
  };
}

/**
 * Fetch carousel/album children images from Facebook Graph API
 * Returns all images in the carousel/album post
 */
export async function getFacebookCarouselChildren(
  token: string,
  postId: string,
  pageId?: string
): Promise<Array<{ url: string; type: any; id: string }>> {
  const mediaItems: Array<{ url: string; type: any; id: string }> = [];

  try {
    // 1) First try: assume it's a POST and fetch attachments
    try {
      const postResp = await axios.get(
        `https://graph.facebook.com/v18.0/${postId}/attachments`,
        {
          params: {
            fields: 'type,media,media_type,url,subattachments{type,media,media_type,url}',
            access_token: token
          }
        }
      );

      const attachments = postResp.data?.data;

      if (Array.isArray(attachments) && attachments.length > 0) {
        for (const att of attachments) {
          // Check for carousel/album (subattachments) FIRST
          if (att.subattachments?.data && Array.isArray(att.subattachments.data) && att.subattachments.data.length > 0) {
            // Only extract subattachments, skip main attachment for carousel posts
            for (const sub of att.subattachments.data) {
              if (sub.media?.image?.src) {
                mediaItems.push({
                  id: sub.media.id || `${postId}_sub`,
                  url: sub.media.image.src,
                  type: 'image'
                });
              } else if (sub.media?.source) {
                mediaItems.push({
                  id: sub.media.id || `${postId}_sub`,
                  url: sub.media.source,
                  type: 'video'
                });
              }
            }
          } else {
            // No subattachments, extract main attachment
            if (att.media?.image?.src) {
              mediaItems.push({
                id: att.media.id || postId,
                url: att.media.image.src,
                type: 'image'
              });
            } else if (att.media?.source) {
              mediaItems.push({
                id: att.media.id || postId,
                url: att.media.source,
                type: 'video'
              });
            }
          }
        }

        if (mediaItems.length > 0) {
          // Try to fetch permalink_url for the post and attach to each child
          try {
            const permalinkResp = await axios.get(`https://graph.facebook.com/${postId}`, { params: { fields: 'permalink_url', access_token: token } });
            const permalinkUrl = permalinkResp.data?.permalink_url || permalinkResp.data?.permalink;
            if (permalinkUrl) {
              mediaItems.forEach(mi => (mi as any).permalink = permalinkUrl);
            }
          } catch (e: any) {
            // ignore permalink fetch errors
          }

          console.log("[FACEBOOK SERVICE] Fetched carousel children from post attachments:", {
            postId,
            childrenCount: mediaItems.length
          });
          return mediaItems;
        }
      }
    } catch (e: any) {
      // Ignore and try as Photo/Video node below
      console.warn("[FACEBOOK SERVICE] Attachments fetch failed, trying Photo/Video node:", e.message);
    }

    // 2) Fallback: maybe it's a PHOTO or VIDEO node
    const nodeResp = await axios.get(
      `https://graph.facebook.com/v18.0/${postId}`,
      {
        params: {
          fields: 'images,source,picture',
          access_token: token
        }
      }
    );

    // PHOTO node - get highest quality image (first in images array)
    if (Array.isArray(nodeResp.data?.images) && nodeResp.data.images.length > 0) {
      const permalinkUrl = nodeResp.data?.permalink_url || nodeResp.data?.permalink;
      mediaItems.push({
        id: postId,
        url: nodeResp.data.images[0].source, // highest quality
        type: 'image',
        permalink: permalinkUrl
      } as any);
      console.log("[FACEBOOK SERVICE] Fetched carousel children from Photo node:", {
        postId,
        url: nodeResp.data.images[0].source
      });
      return mediaItems;
    }

    // VIDEO node
    if (nodeResp.data?.source) {
      const permalinkUrl = nodeResp.data?.permalink_url || nodeResp.data?.permalink;
      mediaItems.push({
        id: postId,
        url: nodeResp.data.source,
        type: 'video',
        permalink: permalinkUrl
      } as any);
      console.log("[FACEBOOK SERVICE] Fetched carousel children from Video node:", {
        postId,
        url: nodeResp.data.source
      });
      return mediaItems;
    }

    return mediaItems;
  } catch (error: any) {
    console.warn("[FACEBOOK SERVICE] Failed to fetch carousel children:", {
      postId,
      error: error.message
    });
    return [];
  }
}

/**
 * Fetch post details from Facebook Graph API
 * Returns post media (images/videos) with URLs - only children if carousel
 */
export async function getFacebookPostMedia(
  token: string,
  postId: string,
  pageId?: string
): Promise<Array<{ url: string; type: any; id: string }>> {
  const mediaItems: Array<{ url: string; type: any; id: string }> = [];

  try {
    // 1) First try: assume it's a POST and fetch attachments
    try {
      const postResp = await axios.get(
        `https://graph.facebook.com/v18.0/${postId}/attachments`,
        {
          params: {
            fields: 'type,media,media_type,url,subattachments{type,media,media_type,url}',
            access_token: token
          }
        }
      );

      const attachments = postResp.data?.data;

      if (Array.isArray(attachments) && attachments.length > 0) {
        for (const att of attachments) {
          // Check for carousel/album (subattachments) FIRST
          if (att.subattachments?.data && Array.isArray(att.subattachments.data) && att.subattachments.data.length > 0) {
            // Only extract subattachments, skip main attachment for carousel posts
            for (const sub of att.subattachments.data) {
              if (sub.media?.image?.src) {
                mediaItems.push({
                  id: sub.media.id || `${postId}_sub`,
                  url: sub.media.image.src,
                  type: 'image'
                });
              } else if (sub.media?.source) {
                mediaItems.push({
                  id: sub.media.id || `${postId}_sub`,
                  url: sub.media.source,
                  type: 'video'
                });
              }
            }
          } else {
            // No subattachments, extract main attachment
            if (att.media?.image?.src) {
              mediaItems.push({
                id: att.media.id || postId,
                url: att.media.image.src,
                type: 'image'
              });
            } else if (att.media?.source) {
              mediaItems.push({
                id: att.media.id || postId,
                url: att.media.source,
                type: 'video'
              });
            }
          }
        }

        if (mediaItems.length > 0) {
          // Try to fetch permalink_url for the post and attach to each child
          try {
            const permalinkResp = await axios.get(`https://graph.facebook.com/${postId}`, { params: { fields: 'permalink_url', access_token: token } });
            const permalinkUrl = permalinkResp.data?.permalink_url || permalinkResp.data?.permalink;
            if (permalinkUrl) {
              mediaItems.forEach(mi => (mi as any).permalink = permalinkUrl);
            }
          } catch (e: any) {
            // ignore permalink fetch errors
          }

          console.log("[FACEBOOK SERVICE] Fetched post media from attachments:", {
            postId,
            mediaCount: mediaItems.length
          });
          return mediaItems;
        }
      }
    } catch (e: any) {
      // Ignore and try as Photo/Video node below
      console.warn("[FACEBOOK SERVICE] Attachments endpoint failed, trying Photo/Video node:", e.message);
    }

    // 2) Fallback: maybe it's a PHOTO or VIDEO node
    const nodeResp = await axios.get(
      `https://graph.facebook.com/v18.0/${postId}`,
      {
        params: {
          fields: 'images,source,picture',
          access_token: token
        }
      }
    );

    // PHOTO node - get highest quality image (first in images array)
    if (Array.isArray(nodeResp.data?.images) && nodeResp.data.images.length > 0) {
      const permalinkUrl = nodeResp.data?.permalink_url || nodeResp.data?.permalink;
      mediaItems.push({
        id: postId,
        url: nodeResp.data.images[0].source, // highest quality
        type: 'image',
        permalink: permalinkUrl
      } as any);
      console.log("[FACEBOOK SERVICE] Fetched post media from Photo node:", {
        postId,
        resolution: `${nodeResp.data.images[0].width}x${nodeResp.data.images[0].height}`
      });
      return mediaItems;
    }

    // VIDEO node
    if (nodeResp.data?.source) {
      const permalinkUrl = nodeResp.data?.permalink_url || nodeResp.data?.permalink;
      mediaItems.push({
        id: postId,
        url: nodeResp.data.source,
        type: 'video',
        permalink: permalinkUrl
      } as any);
      console.log("[FACEBOOK SERVICE] Fetched post media from Video node:", {
        postId,
        type: 'video'
      });
      return mediaItems;
    }

    return mediaItems;
  } catch (error: any) {
    console.warn("[FACEBOOK SERVICE] Failed to fetch post media:", {
      postId,
      error: error.message
    });
    return [];
  }
}

/**
 * Fetch simple engagement metrics for a Facebook post: likes (reactions), comments, and (when available) video views.
 * token: page access token or user access token (if user token provided and pageId available, service will try to resolve page token)
 */
export async function getFacebookPostMetrics(token: string | undefined, postId: string, pageId?: string) {
  try {
    if (!token) throw new Error('No access token provided');
    console.log("[FACEBOOK SERVICE] Fetching post metrics...", { postId, pageId, tokenProvided: !!token });

    // If the token looks like a user token and a pageId is provided, try to fetch a page access token
    let accessToken = token;
    if (pageId && token && token.length > 0 && token.indexOf('|') === -1) {
      // attempt to resolve page token (best-effort)
      try {
        const pageToken = await getPageAccessToken(token, pageId);
        if (pageToken) accessToken = pageToken;
      } catch (e) {
        // ignore and continue with provided token
      }
    }

    // Basic counts using summary fields
    const fields = 'reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)';
    const resp = await axios.get(`https://graph.facebook.com/v16.0/${postId}`, {
      params: {
        fields,
        access_token: accessToken,
      }
    });

    const likes = resp.data?.reactions?.summary?.total_count ?? 0;
    const comments = resp.data?.comments?.summary?.total_count ?? 0;

    // Try to fetch video views (best-effort) if available
    let views: number | null = null;
    try {
      const insightsResp = await axios.get(`https://graph.facebook.com/v16.0/${postId}/insights`, {
        params: {
          metric: 'post_video_views',
          access_token: accessToken,
        }
      });
      const data = insightsResp.data?.data || [];
      if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0].values) && data[0].values.length > 0) {
        views = Number(data[0].values[0].value) || null;
      }
    } catch (e) {
      // ignore insight errors
      views = null;
    }

    return { likes: Number(likes), comments: Number(comments), views };
  } catch (error: any) {
    console.warn('[FACEBOOK SERVICE] getFacebookPostMetrics failed:', error.message);
    throw error;
  }
}

export default {};
