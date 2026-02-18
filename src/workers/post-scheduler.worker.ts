import os from "os";
import { PostSchedule } from "../routes/api-webapp/agency/social-Integration/social-posting/post-schedule.model";
import { PostDetails } from "../routes/api-webapp/agency/social-Integration/social-posting/post-details.model";
import { PostMediaFiles } from "../routes/api-webapp/agency/social-Integration/social-posting/post-media-files.model";
import { SocialToken } from "../routes/api-webapp/agency/social-Integration/social-token.model";
import {
  recoverStuckJobs,
  getPendingPostsForSchedule,
  markPostAsPublished,
  markPostAsFailed,
  decrementRefCountAndCleanup,
  updatePostWithMediaChildren,
} from "../routes/api-webapp/agency/social-Integration/social-posting/social-posting.handler";
import { Sequelize, Op } from "sequelize";
import { addInstagramPost, addInstagramStory, addInstagramReel, addFeedAndStory, addInstagramComment, getInstagramPostChildren, getInstagramStoryMedia } from "../services/instagram-service";
import { addFacebookComment, addFacebookPost, getPageAccessToken, getFacebookPostMedia, getFacebookCarouselChildren } from "../services/facebook-service";
import { createLinkedInShare } from "../services/linkedin-service";
import { sendEmail } from "../services/mailService";
import { User } from "../routes/api-webapp/authentication/user/user-model";
import { Company } from "../routes/api-webapp/company/company-model";
import { MetaSocialAccount } from "../routes/api-webapp/agency/social-Integration/meta-social-account.model";
import { Clients } from "../routes/api-webapp/agency/clients/clients-model";

// Worker configuration
const WORKER_ID = process.env.WORKER_ID || os.hostname();
const MAX_RETRIES = 3;
const BATCH_SIZE = 5;
const MAX_IDLE_CYCLES_BEFORE_FULL_CHECK = 5;
const CRASH_RECOVERY_THRESHOLD_MINUTES = 30;

/**
 * PRODUCTION FIX: Controlled concurrency for API calls
 * Prevents overwhelming platform APIs while still parallelizing
 * Recommended: 2-3 concurrent API calls per worker
 */
const CONCURRENCY_LIMIT = 2;

// Worker state
let consecutiveIdleCycles = 0;
let isShuttingDown = false;
let activeProcessing = false;

/**
 * PRODUCTION FIX: In-memory token cache
 * Avoids repeated DB queries for the same social account's token
 * Cache is per-worker-process (ephemeral, clears on worker exit)
 */
const tokenCache = new Map<string, { token: string; cachedAt: number }>();
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get access token with caching
 */
async function getCachedAccessToken(socialAccount: any): Promise<string> {
  const cacheKey = socialAccount.userAccessTokenId;
  
  if (!cacheKey) {
    throw new Error(`No userAccessTokenId linked to social account ${socialAccount.id}`);
  }

  // Check cache
  const cached = tokenCache.get(cacheKey);
  if (cached && (Date.now() - cached.cachedAt) < TOKEN_CACHE_TTL_MS) {
    console.log(`[WORKER] Using cached token for ${socialAccount.accountName}`);
    return cached.token;
  }

  // Fetch from DB
  const socialToken = await SocialToken.findByPk(cacheKey);
  if (!socialToken || !socialToken.accessToken) {
    throw new Error(`Access token not found for social account ${socialAccount.id}`);
  }

  // Cache it
  tokenCache.set(cacheKey, {
    token: socialToken.accessToken,
    cachedAt: Date.now(),
  });

  console.log(`[WORKER] Fetched and cached token for ${socialAccount.accountName}`);
  return socialToken.accessToken;
}

/**
 * Simple p-limit implementation for controlled concurrency
 * Limits how many promises run in parallel
 */
function pLimit(concurrency: number) {
  const queue: Array<() => void> = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      queue.shift()!();
    }
  };

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      const run = async () => {
        activeCount++;
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          next();
        }
      };

      if (activeCount < concurrency) {
        run();
      } else {
        queue.push(run);
      }
    });
  };
}

/**
 * Graceful shutdown - release locks before exit
 */
export async function gracefulShutdown(): Promise<void> {
  console.log(`[WORKER] Graceful shutdown initiated on ${WORKER_ID}`);
  isShuttingDown = true;

  const maxWait = 30000;
  const startWait = Date.now();
  
  while (activeProcessing && (Date.now() - startWait) < maxWait) {
    console.log(`[WORKER] Waiting for active processing to complete...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  try {
    const releasedCount = await PostSchedule.update(
      { status: "pending", lockedAt: null, workerId: null },
      { where: { workerId: WORKER_ID, status: "processing" } }
    );
    console.log(`[WORKER] Released ${releasedCount[0]} locked jobs on shutdown`);
  } catch (error: any) {
    console.error(`[WORKER] Error releasing locks on shutdown:`, error.message);
  }
}

/**
 * Mark posts that missed their schedule time as failed (server downtime recovery)
 */
export async function markMissedPostsAsFailed(): Promise<number> {
  try {
    const thresholdTime = new Date();
    thresholdTime.setMinutes(thresholdTime.getMinutes() - CRASH_RECOVERY_THRESHOLD_MINUTES);

    const missedSchedules = await PostSchedule.findAll({
      where: {
        status: "pending",
        runAt: { [Op.lt]: thresholdTime },
      },
      include: [{ model: PostDetails, as: "postDetail" }],
    });

    if (missedSchedules.length === 0) return 0;

    console.log(`[WORKER] Found ${missedSchedules.length} missed posts to mark as failed`);

    for (const schedule of missedSchedules) {
      const postDetail = (schedule as any).postDetail;
      if (postDetail) {
        await markPostAsFailed(
          postDetail.id,
          `Post missed scheduled time due to server downtime. Scheduled for: ${schedule.runAt}`,
          MAX_RETRIES
        );
        console.log(`[WORKER] Marked missed post ${postDetail.id} as failed`);
      }
    }

    return missedSchedules.length;
  } catch (error: any) {
    console.error(`[WORKER] Error marking missed posts as failed:`, error.message);
    return 0;
  }
}

/**
 * Quick count of pending posts (lightweight query)
 */
async function getQuickPendingCount(): Promise<number> {
  try {
    return await PostSchedule.count({
      where: {
        status: "pending",
        runAt: { [Op.lte]: new Date() },
      },
    });
  } catch (error: any) {
    console.error(`[WORKER] Error in quick pending count:`, error.message);
    return -1;
  }
}

/**
 * Detect media type from URLs
 */
function detectMediaTypeFromUrl(mediaUrls: Array<{ url: string; type: string }>): "IMAGE" | "VIDEO" {
  if (!mediaUrls || mediaUrls.length === 0) return "IMAGE";

  const videoExtensions = [".mp4", ".mov", ".mpeg", ".webm", ".avi", ".wmv"];
  const hasVideo = mediaUrls.some(media => 
    videoExtensions.some(ext => media.url.toLowerCase().includes(ext))
  );

  return hasVideo ? "VIDEO" : "IMAGE";
}

/**
 * Call platform API to publish post
 */
async function callPlatformAPI(
  platform: "facebook" | "instagram" | "linkedin",
  socialAccount: any,
  postDetail: any
): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    let mediaUrls = postDetail.media || [];
    if (typeof mediaUrls === 'string') {
      try {
        mediaUrls = JSON.parse(mediaUrls);
      } catch (e) {
        console.warn(`[WORKER] Failed to parse media JSON:`, e);
        mediaUrls = [];
      }
    }
    
    if (!Array.isArray(mediaUrls)) mediaUrls = [];
    
    const caption = postDetail.caption || "";
    const firstComment = postDetail.firstComment || "";
    let taggedPeople: string[] = postDetail.taggedPeople || [];
    let collaborators: string[] = postDetail.collaborators || [];
    const postType = postDetail.postType || "post";
    const accessToken = socialAccount.accessToken;

    // Ensure taggedPeople is a string array (Instagram only)
    if (typeof taggedPeople === 'string') {
      try {
        const parsed = JSON.parse(taggedPeople);
        taggedPeople = Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.warn(`[WORKER] Failed to parse taggedPeople JSON:`, e);
        taggedPeople = [];
      }
    }
    if (!Array.isArray(taggedPeople)) {
      taggedPeople = [];
    }
    taggedPeople = taggedPeople.filter((item: any) => typeof item === 'string');

    if (typeof collaborators === 'string') {
      try {
        const parsed = JSON.parse(collaborators);
        collaborators = Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.warn(`[WORKER] Failed to parse collaborators JSON:`, e);
        collaborators = [];
      }
    }
    if (!Array.isArray(collaborators)) {
      collaborators = [];
    }
    collaborators = collaborators.filter((item: any) => typeof item === 'string');

    console.log(`[WORKER] Publishing to ${platform}:`, {
      account: socialAccount.accountName,
      mediaCount: mediaUrls.length,
      postType,
      hasFirstComment: !!firstComment,
      tagCount: taggedPeople.length,
      collaboratorsCount: collaborators.length,
    });

    switch (platform) {
      case "instagram":
        return await publishToInstagram(socialAccount, mediaUrls, caption, postType, accessToken, firstComment, taggedPeople, collaborators);
      case "facebook":
        return await publishToFacebook(socialAccount, mediaUrls, caption, accessToken, firstComment);
      case "linkedin":
        return await publishToLinkedIn(socialAccount, mediaUrls, caption, accessToken, firstComment);
      default:
        return { success: false, error: `Unknown platform: ${platform}` };
    }
  } catch (error: any) {
    console.error(`[WORKER] API error for ${platform}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Publish to Instagram
 */
async function publishToInstagram(
  socialAccount: any,
  mediaUrls: Array<{ url: string; type: string }>,
  caption: string,
  postType: string,
  accessToken: string,
  firstComment: string = "",
  taggedPeople: Array<string> = [],
  collaborators: Array<string> = []
) {
  try {
    const instagramData = {
      token: accessToken,
      platformUserId: socialAccount.instagramBusinessId || socialAccount.accountId,
    };

    const cdnUrls = mediaUrls.map((m: any) => m.url);
    const mediaType = detectMediaTypeFromUrl(mediaUrls);
    let result;

    if (postType === "reel") {
      result = await addInstagramReel(instagramData, cdnUrls, caption, mediaType, taggedPeople, collaborators);
      console.log("[WORKER] [INSTAGRAM] Reel published:", result.id);
      
      // Add first comment if provided
      if (firstComment && result?.id) {
        try {
          await addInstagramComment(instagramData, result.id, firstComment);
          console.log("[WORKER] [INSTAGRAM] First comment added to reel");
        } catch (commentError: any) {
          console.warn("[WORKER] [INSTAGRAM] Failed to add first comment:", commentError.message);
        }
      }
    } else if (postType === "story") {
      result = await addInstagramStory(instagramData, cdnUrls, mediaType);
      console.log("[WORKER] [INSTAGRAM] Story published");
    } else if (postType === "feed_story") {
      result = await addFeedAndStory(instagramData, cdnUrls, caption, mediaType, taggedPeople, collaborators);
      console.log("[WORKER] [INSTAGRAM] Feed + Story published:", result.feed.id);
      
      // Add first comment to feed post if provided
      if (firstComment && result?.feed?.id) {
        try {
          await addInstagramComment(instagramData, result.feed.id, firstComment);
          console.log("[WORKER] [INSTAGRAM] First comment added to feed_story feed");
        } catch (commentError: any) {
          console.warn("[WORKER] [INSTAGRAM] Failed to add first comment:", commentError.message);
        }
      }
    } else if (postType === "carousel") {
      result = await addInstagramPost(instagramData, cdnUrls, caption, mediaType, taggedPeople, collaborators);
      console.log("[WORKER] [INSTAGRAM] Carousel published:", result.id);
      
      // Add first comment if provided
      if (firstComment && result?.id) {
        try {
          await addInstagramComment(instagramData, result.id, firstComment);
          console.log("[WORKER] [INSTAGRAM] First comment added to carousel");
        } catch (commentError: any) {
          console.warn("[WORKER] [INSTAGRAM] Failed to add first comment:", commentError.message);
        }
      }
    } else {
      result = await addInstagramPost(instagramData, cdnUrls, caption, mediaType, taggedPeople, collaborators);
      console.log("[WORKER] [INSTAGRAM] Feed post published:", result.id);
      
      // Add first comment if provided
      if (firstComment && result?.id) {
        try {
          await addInstagramComment(instagramData, result.id, firstComment);
          console.log("[WORKER] [INSTAGRAM] First comment added to feed post");
        } catch (commentError: any) {
          console.warn("[WORKER] [INSTAGRAM] Failed to add first comment:", commentError.message);
        }
      }
    }

    return { success: true, postId: result.id || result.feed?.id };
  } catch (error: any) {
    return { success: false, error: `Instagram error: ${error.message}` };
  }
}

/**
 * Publish to Facebook
 */
async function publishToFacebook(
  socialAccount: any,
  mediaUrls: Array<{ url: string; type: string }>,
  caption: string,
  accessToken: string,
  firstComment: string = ""
) {
  try {
    const facebookData = {
      token: accessToken,
      pageId: socialAccount.facebookPageId || socialAccount.accountId,
      pageAccessToken: socialAccount.pageAccessToken,
    };

    if (!facebookData.pageAccessToken && facebookData.token) {
      console.log(`[WORKER] Fetching Facebook page access token...`);
      facebookData.pageAccessToken = await getPageAccessToken(facebookData.token, facebookData.pageId);
    }

    if (!facebookData.pageAccessToken) {
      throw new Error("Could not get Facebook page access token");
    }

    const cdnUrls = mediaUrls.map((m: any) => m.url);
    const mediaType = detectMediaTypeFromUrl(mediaUrls);
    const result = await addFacebookPost(facebookData, cdnUrls, caption, mediaType);

    console.log("[WORKER] [FACEBOOK] Post published:", result.id || result.post_id);
    
    // Add first comment if provided
    if (firstComment && (result?.id || result?.post_id)) {
      try {
        const postId = result.id || result.post_id;
        await addFacebookComment(postId, facebookData.pageAccessToken, firstComment);
        console.log("[WORKER] [FACEBOOK] First comment added");
      } catch (commentError: any) {
        console.warn("[WORKER] [FACEBOOK] Failed to add first comment:", commentError.message);
      }
    }

    return { success: true, postId: result.id || result.post_id };
  } catch (error: any) {
    return { success: false, error: `Facebook error: ${error.message}` };
  }
}

/**
 * Publish to LinkedIn
 */
async function publishToLinkedIn(
  socialAccount: any,
  mediaUrls: Array<{ url: string; type: string }>,
  caption: string,
  accessToken: string,
  firstComment: string = ""
) {
  try {
    const personUrn = socialAccount.linkedinPersonUrn || socialAccount.linkedinURN;

    if (!accessToken || !personUrn) {
      throw new Error("LinkedIn token or person URN is missing");
    }

    const cdnUrls = mediaUrls.map((m: any) => m.url);
    const linkedinCaption = cdnUrls.length > 0 ? `${caption}\n\n${cdnUrls.join('\n')}` : caption;
    const result = await createLinkedInShare(accessToken, personUrn, linkedinCaption);

    console.log("[WORKER] [LINKEDIN] Post published:", result.id);
    
    // Note: LinkedIn API has limited support for comments via API
    // First comment could be added via UI or through native LinkedIn functionality
    if (firstComment) {
      console.log("[WORKER] [LINKEDIN] Note: First comment feature not yet supported for LinkedIn via API");
    }

    return { success: true, postId: result.id };
  } catch (error: any) {
    return { success: false, error: `LinkedIn error: ${error.message}` };
  }
}

/**
 * Send email notifications for post success/failure
 * Sends to: User (creator), Company, and Assigned Client
 */
async function sendPostNotificationEmail(
  postDetail: any,
  status: 'success' | 'failed',
  errorMessage?: string,
  externalPostId?: string,
  postLink?: string,
  platform?: string
): Promise<void> {
  try {
    // Prepare recipient emails and friendly names
    let creatorEmail: string | undefined;
    let creatorName = '';
    let companyEmail: string | undefined;
    let companyName = '';
    let clientEmail: string | undefined;
    let clientName = '';

    // Creator
    if (postDetail.createdBy) {
      try {
        const user = await User.findByPk(postDetail.createdBy, {
          attributes: ['id', 'firstName', 'lastName', 'email']
        });
        if (user && user.email) {
          creatorEmail = user.email;
          creatorName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
          console.log(`[WORKER] Creator email: ${creatorEmail}`);
        }
      } catch (userErr: any) {
        console.warn(`[WORKER] Failed to fetch creator user:`, userErr.message);
      }
    }

    // Company (agency)
    if (postDetail.companyId) {
      try {
        const company = await Company.findByPk(postDetail.companyId, {
          attributes: ['id', 'name', 'email']
        } as any);
        if (company && (company as any).email) {
          companyEmail = (company as any).email;
          companyName = (company as any).name || companyEmail || '';
          console.log(`[WORKER] Company (agency) email: ${companyEmail}`);
        }
      } catch (companyErr: any) {
        console.warn(`[WORKER] Failed to fetch company:`, companyErr.message);
      }
    }

    // Client
    if (postDetail.socialAccount?.client?.email) {
      clientEmail = postDetail.socialAccount.client.email;
      clientName = postDetail.socialAccount.client.businessName || clientEmail || '';
      console.log(`[WORKER] Client email: ${clientEmail}`);
    }

    // If client not attached on the joined socialAccount, try to resolve via MetaSocialAccount.assignedClientId
    if (!clientEmail && postDetail.socialAccountId) {
      try {
        const metaAccount = await MetaSocialAccount.findByPk(postDetail.socialAccountId, { attributes: ['id', 'assignedClientId'] });
        if (metaAccount && (metaAccount as any).assignedClientId) {
          const assignedClientId = (metaAccount as any).assignedClientId;
          try {
            const clientRecord = await Clients.findByPk(assignedClientId, { attributes: ['id', 'email', 'businessName'] });
            if (clientRecord && (clientRecord as any).email) {
              clientEmail = (clientRecord as any).email;
              clientName = (clientRecord as any).businessName || clientEmail || '';
              console.log(`[WORKER] Resolved client via MetaSocialAccount.assignedClientId: ${clientEmail}`);
            }
          } catch (clientFetchErr: any) {
            console.warn(`[WORKER] Failed to fetch client record for assignedClientId ${assignedClientId}:`, clientFetchErr.message);
          }
        }
      } catch (metaErr: any) {
        console.warn(`[WORKER] Failed to lookup MetaSocialAccount ${postDetail.socialAccountId}:`, metaErr.message);
      }
    }

    // If neither agency nor client email is available, try creator as fallback
    if (!companyEmail && !clientEmail && !creatorEmail) {
      console.warn(`[WORKER] No recipient emails found for post ${postDetail.id}`);
      return;
    }

    const sentEmails: Array<{ role: string; to: string; template: string }> = [];

    // Helper to send and record
    const sendAndRecord = async (to: string, template: string, subject: string, replacements: any) => {
      try {
        await sendEmail({ to, subject, htmlFile: template, replacements } as any);
        sentEmails.push({ role: template.includes('Client') ? 'client' : 'agency', to, template });
        console.log(`[WORKER] Email sent to ${to} using template ${template}`);
      } catch (emailErr: any) {
        console.error(`[WORKER] Failed to send email to ${to}:`, emailErr.message);
      }
    };

    // Prepare common replacement values
    const commonReplacements = {
      Post_Link: postLink || externalPostId || '',
      Platform: platform || postDetail.platform || '',
      External_Post_Id: externalPostId || ''
    };

    if (status === 'success') {
      // Send client email (client-specific template)
      if (clientEmail) {
        await sendAndRecord(clientEmail, 'Post_Uploaded_Successfully_Client', `Your ${platform || postDetail.platform} post is live`, {
          Client_Name: clientName || creatorName || 'Client',
          Platform: commonReplacements.Platform,
          Post_Link: commonReplacements.Post_Link
        });
      }

      // Send agency email (agency-specific template) to company and/or creator
      if (companyEmail) {
        await sendAndRecord(companyEmail, 'Post_Uploaded_Successfully_Agency', `Social Media Post Successfully Uploaded - ${commonReplacements.Platform}`, {
          Agency_Name: companyName || 'Agency',
          Platform: commonReplacements.Platform,
          Post_Link: commonReplacements.Post_Link
        });
      } else if (creatorEmail) {
        // If no company email, notify creator with agency template
        await sendAndRecord(creatorEmail, 'Post_Uploaded_Successfully_Agency', `Social Media Post Successfully Uploaded - ${commonReplacements.Platform}`, {
          Agency_Name: creatorName || 'User',
          Platform: commonReplacements.Platform,
          Post_Link: commonReplacements.Post_Link
        });
      }
    } else if (status === 'failed') {
      // On failure send agency-style notification to agency and client (if present)
      const failureReplacements = {
        Agency_Name: companyName || creatorName || 'Agency',
        Error_Message: errorMessage || 'Unknown error occurred',
        Platform: commonReplacements.Platform
      };

      if (companyEmail) {
        await sendAndRecord(companyEmail, 'Post_Failed_to_Upload_Agency', `Social Media Post Upload Failed - ${commonReplacements.Platform}`, failureReplacements);
      } else if (creatorEmail) {
        await sendAndRecord(creatorEmail, 'Post_Failed_to_Upload_Agency', `Social Media Post Upload Failed - ${commonReplacements.Platform}`, failureReplacements);
      }

      if (clientEmail) {
        // Inform client as well using the same agency failure template
        await sendAndRecord(clientEmail, 'Post_Failed_to_Upload_Agency', `Social Media Post Upload Failed - ${commonReplacements.Platform}`, failureReplacements);
      }
    }

    // Log a concise table of what was sent
    if (sentEmails.length > 0) {
      try {
        console.log('[WORKER] Sent email summary:');
        console.table(sentEmails);
      } catch (tableErr: any) {
        console.log('[WORKER] Sent emails:', JSON.stringify(sentEmails));
      }
    }
  } catch (error: any) {
    console.error(`[WORKER] Error in sendPostNotificationEmail:`, error.message);
    // Don't throw - email failure shouldn't fail the post processing
  }
}

/**
 * Process a single scheduled post
 */
async function processPost(schedule: any): Promise<void> {
  const postDetail = schedule.postDetail;
  const socialAccount = postDetail.socialAccount;

  console.log(`[WORKER] Processing post ${postDetail.id}:`, {
    platform: postDetail.platform,
    account: socialAccount?.accountName || "unknown",
    attempt: schedule.attempts,
  });

  try {
    let resolvedPostLink: string | undefined;
    if (!socialAccount) {
      throw new Error("Social account not found for this post");
    }

    // Fetch media from PostMediaFiles if mediaUrlId exists
    if (postDetail.mediaUrlId) {
      const mediaFile = await PostMediaFiles.findByPk(postDetail.mediaUrlId);
      if (mediaFile && mediaFile.urls) {
        postDetail.media = mediaFile.urls;
      } else {
        throw new Error("Media file record not found or has no URLs");
      }
    } else if (!postDetail.media || postDetail.media.length === 0) {
      throw new Error("No media found for this post");
    }

    /**
     * PRODUCTION FIX: Use cached access token
     * Reduces DB queries when processing multiple posts from same account
     */
    const accessToken = await getCachedAccessToken(socialAccount);

    const socialAccountWithToken = Object.assign(
      Object.create(Object.getPrototypeOf(socialAccount)), 
      socialAccount, 
      { accessToken }
    );
    
    const apiResult = await callPlatformAPI(
      postDetail.platform as "facebook" | "instagram" | "linkedin",
      socialAccountWithToken,
      postDetail
    );

    if (apiResult.success && apiResult.postId) {
      await markPostAsPublished(postDetail.id, apiResult.postId);
      
      // Update publishedAt timestamp
      await PostDetails.update(
        { publishedAt: new Date() },
        { where: { id: postDetail.id } }
      );
      
      // For Instagram posts, fetch and store media children
      if (postDetail.platform === 'instagram') {
        try {
          let mediaChildren: any[] = [];

          if (postDetail.postType === 'story') {
            // For stories, fetch story media from user's stories
            try {
              // Use timestamp filter to get only recently created stories
              const storyTimestamp = Math.floor(Date.now() / 1000) - 30; // Last 30 seconds
              const userStories = await getInstagramStoryMedia(accessToken, socialAccount.instagramBusinessId || socialAccount.accountId, storyTimestamp, false);
              
              if (userStories.length > 0) {
                mediaChildren = userStories;
                console.log(`[WORKER] Fetched ${mediaChildren.length} story media`);
              } else if (postDetail.media && Array.isArray(postDetail.media) && postDetail.media.length > 0) {
                // Fallback to original uploaded URLs
                mediaChildren = postDetail.media.map((url: string, idx: number) => ({
                  id: `fallback_${idx}`,
                  url: url,
                  type: 'image'
                }));
                console.log(`[WORKER] Story media fetch failed, using ${mediaChildren.length} original uploaded URLs`);
              }
            } catch (storyError: any) {
              console.warn(`[WORKER] Failed to fetch story media:`, storyError.message);
              if (postDetail.media && Array.isArray(postDetail.media) && postDetail.media.length > 0) {
                // Fallback to original uploaded URLs
                mediaChildren = postDetail.media.map((url: string, idx: number) => ({
                  id: `fallback_${idx}`,
                  url: url,
                  type: 'image'
                }));
                console.log(`[WORKER] Story media error, using ${mediaChildren.length} original uploaded URLs`);
              }
            }
          } else if (postDetail.postType === 'feed_story') {
            // For feed_story, fetch only feed post media (skip story wrapper media)
            if (apiResult.postId) {
              try {
                mediaChildren = await getInstagramPostChildren(accessToken, apiResult.postId);
                if (mediaChildren.length > 0) {
                  console.log(`[WORKER] Fetched ${mediaChildren.length} feed media from feed_story`);
                } else if (postDetail.media && Array.isArray(postDetail.media) && postDetail.media.length > 0) {
                  // Fallback to original uploaded URLs
                  mediaChildren = postDetail.media.map((url: string, idx: number) => ({
                    id: `fallback_${idx}`,
                    url: url,
                    type: 'image'
                  }));
                  console.log(`[WORKER] Feed media fetch failed, using ${mediaChildren.length} original uploaded URLs`);
                }
              } catch (feedError: any) {
                console.warn(`[WORKER] Failed to fetch feed media from feed_story:`, feedError.message);
                if (postDetail.media && Array.isArray(postDetail.media) && postDetail.media.length > 0) {
                  // Fallback to original uploaded URLs
                  mediaChildren = postDetail.media.map((url: string, idx: number) => ({
                    id: `fallback_${idx}`,
                    url: url,
                    type: 'image'
                  }));
                  console.log(`[WORKER] Feed media error, using ${mediaChildren.length} original uploaded URLs`);
                }
              }
            }
          } else {
            // For regular posts, carousels, reels - fetch post children
            mediaChildren = await getInstagramPostChildren(accessToken, apiResult.postId);
          }

          if (mediaChildren.length > 0) {
            // prefer permalink from fetched children if present
            const childWithPermalink = mediaChildren.find((m: any) => m.permalink || m.permalink_url);
            if (childWithPermalink) resolvedPostLink = childWithPermalink.permalink || childWithPermalink.permalink_url;

            await updatePostWithMediaChildren(postDetail.id, mediaChildren);
            console.log(`[WORKER] Updated post with ${mediaChildren.length} media children from Instagram`);
          }
        } catch (childError: any) {
          console.warn(`[WORKER] Failed to fetch Instagram post media:`, childError.message);
          // Don't fail the post if children fetch fails - post was successful
        }
      }

      // For Facebook posts, fetch and store media
      if (postDetail.platform === 'facebook') {
        try {
          let mediaChildren: any[] = [];
          const pageId = socialAccount?.accountId;

          // For carousel posts, try carousel children first
          if (postDetail.postType === 'carousel') {
            try {
              mediaChildren = await getFacebookCarouselChildren(accessToken, apiResult.postId, pageId);
              if (mediaChildren.length > 0) {
                console.log(`[WORKER] Fetched ${mediaChildren.length} images from Facebook carousel`);
              }
            } catch (carouselError: any) {
              console.warn(`[WORKER] Failed to fetch carousel children:`, carouselError.message);
            }
          }

          // If carousel method didn't work or not a carousel, try general media fetch
          if (mediaChildren.length === 0) {
            mediaChildren = await getFacebookPostMedia(accessToken, apiResult.postId, pageId);
          }

          // Store media: prioritize Facebook URLs, fallback to original uploaded URLs if fetch failed
          if (mediaChildren.length > 0) {
            // prefer permalink from fetched children/post if present
            const childWithPermalink = mediaChildren.find((m: any) => m.permalink || m.permalink_url);
            if (childWithPermalink) resolvedPostLink = childWithPermalink.permalink || childWithPermalink.permalink_url;

            await updatePostWithMediaChildren(postDetail.id, mediaChildren);
            console.log(`[WORKER] Stored ${mediaChildren.length} Facebook media URLs`);
          } else if (postDetail.media && Array.isArray(postDetail.media) && postDetail.media.length > 0) {
            // Fallback to original uploaded URLs if Facebook fetch failed
            const fallbackMedia = postDetail.media.map((url: string, idx: number) => ({
              id: `fallback_${idx}`,
              url: url,
              type: postDetail.postType === 'video' ? 'video' : 'image'
            }));
            await updatePostWithMediaChildren(postDetail.id, fallbackMedia);
            console.log(`[WORKER] Facebook media fetch failed, storing ${fallbackMedia.length} original uploaded URLs as fallback`);
          } else {
            console.log(`[WORKER] No Facebook media found, leaving media field empty`);
          }
        } catch (childError: any) {
          console.warn(`[WORKER] Failed to fetch Facebook post media:`, childError.message);
          // Don't fail the post if media fetch fails - post was successful
        }
      }
      
      // Decrement refCount and delete files if needed
      if (postDetail.mediaUrlId) {
        await decrementRefCountAndCleanup(postDetail.mediaUrlId);
      }
      
      console.log(`[WORKER] ✓ Post published successfully:`, {
        postId: postDetail.id,
        externalPostId: apiResult.postId,
        platform: postDetail.platform,
      });

      // Send success notification email (include external post id/link/platform when available)
      try {
        const externalId = apiResult.postId;
        const pf = postDetail.platform;
        // prefer resolvedPostLink collected from media children, otherwise fall back to heuristic
        let postLink = resolvedPostLink;
        if (!postLink && externalId) {
          if (pf === 'facebook') {
            const pageId = socialAccount.facebookPageId || socialAccount.accountId;
            if (pageId) {
              const idPart = typeof externalId === 'string' && externalId.includes('_') ? externalId.split('_').slice(1).join('_') : externalId;
              postLink = `https://www.facebook.com/${pageId}/posts/${idPart}`;
            } else {
              postLink = `https://www.facebook.com/${externalId}`;
            }
          } else if (pf === 'instagram') {
            postLink = `https://www.instagram.com/p/${externalId}`;
          } else if (pf === 'linkedin') {
            postLink = `https://www.linkedin.com/feed/update/${externalId}`;
          }
        }

        await sendPostNotificationEmail(schedule.postDetail, 'success', undefined, externalId, postLink, pf);
      } catch (emailNotifyErr: any) {
        console.warn('[WORKER] Failed to send success notification email:', emailNotifyErr.message);
      }
    } else {
      const errorMsg = apiResult.error || "Unknown API error";
      await markPostAsFailed(postDetail.id, errorMsg, schedule.attempts);

      if (schedule.attempts < MAX_RETRIES) {
        console.log(`[WORKER] ⚠ Post failed, scheduling for retry:`, {
          postId: postDetail.id,
          attempt: schedule.attempts,
          error: errorMsg,
        });
      } else {
        console.error(`[WORKER] ✗ Post failed permanently after ${MAX_RETRIES} retries:`, {
          postId: postDetail.id,
          error: errorMsg,
        });

        // Send failure notification email only on final failure (include platform)
        await sendPostNotificationEmail(schedule.postDetail, 'failed', errorMsg, undefined, undefined, postDetail.platform);
      }
    }
  } catch (error: any) {
    console.error(`[WORKER] Unexpected error processing post:`, {
      postId: postDetail.id,
      error: error.message,
    });

    await markPostAsFailed(postDetail.id, `Unexpected error: ${error.message}`, schedule.attempts);

    // Send failure notification email on unexpected error
    if (schedule.attempts >= MAX_RETRIES) {
      await sendPostNotificationEmail(schedule.postDetail, 'failed', error.message, undefined, undefined, postDetail.platform);
    }
  }
}

/**
 * Main worker cycle - called every minute by cron
 */
export async function runPostSchedulerWorker(sequelize: Sequelize) {
  if (isShuttingDown) {
    console.log(`[WORKER] Skipping cycle - shutdown in progress`);
    return;
  }

  const startTime = Date.now();
  console.log(`\n[WORKER] Starting post scheduler cycle at ${new Date().toISOString()}`);

  try {
    activeProcessing = true;

    // Quick pending count check
    const quickCount = await getQuickPendingCount();
    
    if (quickCount === 0) {
      consecutiveIdleCycles++;
      
      // Every N idle cycles, do a full recovery check
      if (consecutiveIdleCycles >= MAX_IDLE_CYCLES_BEFORE_FULL_CHECK) {
        console.log(`[WORKER] Periodic recovery check (every ${MAX_IDLE_CYCLES_BEFORE_FULL_CHECK} idle cycles)`);
        await recoverStuckJobs();
        consecutiveIdleCycles = 0;
      } else {
        console.log(`[WORKER] No pending jobs (quick check), idle cycle ${consecutiveIdleCycles}/${MAX_IDLE_CYCLES_BEFORE_FULL_CHECK}`);
      }
      
      const duration = Date.now() - startTime;
      console.log(`[WORKER] Idle cycle completed in ${duration}ms\n`);
      activeProcessing = false;
      return;
    }

    consecutiveIdleCycles = 0;

    // Step 1: Recovery - unlock stuck jobs
    console.log("[WORKER] Step 1/3: Recovering stuck jobs...");
    const recoveredCount = await recoverStuckJobs();

    // Step 2: Fetch pending jobs
    console.log("[WORKER] Step 2/3: Fetching pending jobs...");
    const pendingSchedules = await getPendingPostsForSchedule(WORKER_ID, BATCH_SIZE);

    if (pendingSchedules.length === 0) {
      console.log("[WORKER] No pending jobs after full fetch");
      console.log(`[WORKER] Cycle completed in ${Date.now() - startTime}ms\n`);
      activeProcessing = false;
      return;
    }

    console.log(`[WORKER] Found ${pendingSchedules.length} pending jobs to process`);

    // Step 3: Process jobs with controlled parallelism
    console.log(`[WORKER] Step 3/3: Processing jobs (concurrency: ${CONCURRENCY_LIMIT})...`);
    let successCount = 0;
    let failureCount = 0;

    /**
     * PRODUCTION FIX: Parallel processing with controlled concurrency
     * - Uses p-limit to cap concurrent API calls
     * - Prevents overwhelming platform APIs
     * - Much faster than sequential processing
     */
    const limit = pLimit(CONCURRENCY_LIMIT);
    
    const processingPromises = pendingSchedules.map(schedule => 
      limit(async () => {
        if (isShuttingDown) {
          console.log(`[WORKER] Shutdown detected, skipping job ${schedule.id}`);
          return { success: false, skipped: true };
        }

        try {
          await processPost(schedule);
          return { success: true };
        } catch (jobError: any) {
          console.error(`[WORKER] Failed to process job ${schedule.id}:`, jobError.message);
          return { success: false };
        }
      })
    );

    const results = await Promise.all(processingPromises);
    successCount = results.filter(r => r.success).length;
    failureCount = results.filter(r => !r.success && !r.skipped).length;

    console.log(`[WORKER] Cycle Summary:`, {
      recovered: recoveredCount,
      processed: pendingSchedules.length,
      successful: successCount,
      failed: failureCount,
      durationMs: Date.now() - startTime,
    });

    console.log(`[WORKER] Cycle completed in ${Date.now() - startTime}ms\n`);
  } catch (error: any) {
    console.error("[WORKER] CRITICAL ERROR in worker cycle:", error.message);
    console.error(error.stack);
  } finally {
    activeProcessing = false;
  }
}

/**
 * Initialize worker - call on server startup
 */
export async function initializePostSchedulerWorker(): Promise<void> {
  console.log(`[WORKER] Initializing Post Scheduler Worker on ${WORKER_ID}`);
  
  try {
    // Release stale locks from previous session
    const releasedLocks = await PostSchedule.update(
      { status: "pending", lockedAt: null, workerId: null },
      { where: { workerId: WORKER_ID, status: "processing" } }
    );
    console.log(`[WORKER] Released ${releasedLocks[0]} stale locks from previous session`);

    // Mark missed posts as failed
    const missedCount = await markMissedPostsAsFailed();
    if (missedCount > 0) {
      console.log(`[WORKER] Marked ${missedCount} missed posts as failed`);
    }

    // Recover stuck jobs from other workers
    const recoveredCount = await recoverStuckJobs();
    console.log(`[WORKER] Recovered ${recoveredCount} stuck jobs from other workers`);

    console.log(`[WORKER] Initialization complete`);
  } catch (error: any) {
    console.error(`[WORKER] Initialization error:`, error.message);
  }
}

console.log(`[WORKER] Post Scheduler Worker initialized on ${WORKER_ID}`);
