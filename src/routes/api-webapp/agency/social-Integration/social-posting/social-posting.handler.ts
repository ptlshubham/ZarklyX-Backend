import { v4 as uuidv4 } from "uuid";
import dbInstance from '../../../../../db/core/control-db';
import Sequelize from "sequelize";
import { PostDetails } from "./post-details.model";
import { PostSchedule } from "./post-schedule.model";
import { PostMediaFiles } from "./post-media-files.model";
import { MetaSocialAccount } from "../meta-social-account.model";
import { SocialToken } from "../social-token.model";
import { Clients } from "../../clients/clients-model";
import { MakeQuery } from "../../../../../services/model-service";
import { deleteFromGitHub } from "../../../../../services/image-uploader";
import { getFacebookPostMetrics } from '../../../../../services/facebook-service';
import { getInstagramPostMetrics } from '../../../../../services/instagram-service';

/**
 * Helper: Create PostMediaFiles record with uploaded URLs
 */
export const createPostMediaFilesRecord = async (
  mediaUrls: Array<{ url: string; type: any }>,
  refCount: number
): Promise<string> => {
  try {
    const mediaFilesRecord = await PostMediaFiles.create({
      id: uuidv4(),
      urls: mediaUrls,
      refCount: refCount,
      status: "active",
    });

    console.log(`[SOCIAL-POSTING HANDLER] Created PostMediaFiles record: ${mediaFilesRecord.id} with refCount=${refCount}`);
    return mediaFilesRecord.id;
  } catch (error: any) {
    console.error("[SOCIAL-POSTING HANDLER] Failed to create PostMediaFiles record:", error.message);
    throw new Error(`Failed to create media file record: ${error.message}`);
  }
};

/**
 * Helper: Increment refCount for PostMediaFiles
 */
export const incrementRefCount = async (mediaFilesId: string, increment: number = 1): Promise<void> => {
  try {
    await PostMediaFiles.increment('refCount', {
      by: increment,
      where: { id: mediaFilesId }
    });
    console.log(`[SOCIAL-POSTING HANDLER] Incremented refCount for ${mediaFilesId} by ${increment}`);
  } catch (error: any) {
    console.warn("[SOCIAL-POSTING HANDLER] Failed to increment refCount:", error.message);
  }
};

/**
 * Helper: Decrement refCount and delete if zero
 * When refCount reaches 0, deletes all files from GitHub and removes the PostMediaFiles record
 */
export const decrementRefCountAndCleanup = async (mediaFilesId: string): Promise<void> => {
  try {
    const mediaFile = await PostMediaFiles.findByPk(mediaFilesId);
    if (!mediaFile) return;

    // Decrement refCount first
    await mediaFile.decrement('refCount');
    const updatedRefCount = mediaFile.refCount - 1;

    // Check if refCount is now zero
    if (updatedRefCount <= 0) {
      // Delete from GitHub - extract urls from media file
      let urls = mediaFile.urls as any;
      
      // Handle JSON strings from database
      if (typeof urls === 'string') {
        try {
          urls = JSON.parse(urls);
        } catch (e) {
          console.warn(`[SOCIAL-POSTING HANDLER] Failed to parse URLs JSON:`, e);
          urls = [];
        }
      }
      
      if (urls && Array.isArray(urls) && urls.length > 0) {
        for (const urlItem of urls) {
          // Handle both object format {url: string, type: string} and string format
          const urlToDelete = typeof urlItem === 'object' && urlItem?.url ? urlItem.url : urlItem;
          
          if (!urlToDelete || typeof urlToDelete !== 'string') {
            console.warn(`[SOCIAL-POSTING HANDLER] Skipping invalid URL item:`, urlItem);
            continue;
          }
          
          try {
            await deleteFromGitHub(urlToDelete);
            console.log(`[SOCIAL-POSTING HANDLER] Deleted from GitHub: ${urlToDelete}`);
          } catch (err: any) {
            console.warn(`[SOCIAL-POSTING HANDLER] Failed to delete from GitHub (${urlToDelete}):`, err.message);
          }
        }
      } else {
        console.warn(`[SOCIAL-POSTING HANDLER] No valid URLs found in media file`, mediaFile.urls);
      }
      
      // Delete record
      await mediaFile.destroy();
      console.log(`[SOCIAL-POSTING HANDLER] Deleted PostMediaFiles record: ${mediaFilesId}`);
    } else {
      console.log(`[SOCIAL-POSTING HANDLER] Decremented refCount for ${mediaFilesId}, new count: ${updatedRefCount}`);
    }
  } catch (error: any) {
    console.warn("[SOCIAL-POSTING HANDLER] Failed to decrement refCount:", error.message);
  }
};

/**
 * Get account data from database for publishing (BATCH)
 * Fetches MULTIPLE accounts in a SINGLE database query
 * Returns raw data - API layer handles token refresh
 */
export const getBatchAccountTokensForPublishing = async (metaSocialAccountIds: string[], companyId: string) => {
  try {
    if (!metaSocialAccountIds || metaSocialAccountIds.length === 0) {
      return [];
    }

    const socialAccounts = await MetaSocialAccount.findAll({
      where: {
        id: metaSocialAccountIds,
        companyId: companyId,
      },
      include: [
        {
          model: SocialToken,
          as: "userAccessTokenData",
        }
      ],
    });

    if (socialAccounts.length === 0) {
      throw new Error(`No social accounts found for the provided IDs`);
    }

    // Map results
    const results: any[] = [];
    const foundIds = new Set<string>();

    for (const socialAccount of socialAccounts) {
      foundIds.add(socialAccount.id);

      const token = socialAccount.userAccessTokenData;
      if (!token) {
        console.warn(`[GET-BATCH-ACCOUNT-TOKENS] No access token found for account ${socialAccount.id}`);
        continue;
      }

      // Map platform-specific data
      const platform = socialAccount.platform?.toLowerCase() || token.provider?.toLowerCase();

      const result: any = {
        platform,
        modelId: socialAccount.id,
        companyId,
        accountName: socialAccount.accountName,
        accessToken: token.accessToken,
      };

      // Return platform-specific account IDs and data
      if (platform === "instagram") {
        result.accountId = socialAccount.instagramBusinessId;
        result.instagramBusinessId = socialAccount.instagramBusinessId;
      } else if (platform === "facebook") {
        result.accountId = socialAccount.facebookPageId;
        result.facebookPageId = socialAccount.facebookPageId;
        result.userAccessToken = token.accessToken; // User token for fetching page token
        result.storedPageAccessToken = socialAccount.pageAccessToken; // Fallback
      } else if (platform === "linkedin") {
        result.accountId = socialAccount.facebookUserId;
      }

      results.push(result);
    }

    // Check for missing accounts
    const missingIds = metaSocialAccountIds.filter(id => !foundIds.has(id));
    if (missingIds.length > 0) {
      console.warn(`[GET-BATCH-ACCOUNT-TOKENS] Missing accounts: ${missingIds.join(", ")}`);
    }

    return results;
  } catch (error: any) {
    console.error("[GET-BATCH-ACCOUNT-TOKENS HANDLER] Error:", error.message);
    throw error;
  }
};

/**
 * Get account data from database for publishing
 * Returns raw data - API layer handles token refresh
 */
export const getAccountTokensForPublishing = async (metaSocialAccountId: string, companyId: string) => {
  try {
    // Fetch the social account
    const socialAccount = await MetaSocialAccount.findByPk(metaSocialAccountId, {
      include: [
        {
          model: SocialToken,
          as: "userAccessTokenData",
        }
      ],
    });

    if (!socialAccount) {
      throw new Error(`Social account not found with ID: ${metaSocialAccountId}`);
    }

    if (socialAccount.companyId !== companyId) {
      throw new Error("Unauthorized: Social account does not belong to this company");
    }

    const token = socialAccount.userAccessTokenData;
    if (!token) {
      throw new Error("Access token not found for this account");
    }

    // Map platform-specific data
    const platform = socialAccount.platform?.toLowerCase() || token.provider?.toLowerCase();

    const result: any = {
      platform,
      modelId: metaSocialAccountId,
      companyId,
      accountName: socialAccount.accountName,
      accessToken: token.accessToken,
    };

    // Return platform-specific account IDs and data
    if (platform === "instagram") {
      result.accountId = socialAccount.instagramBusinessId;
      result.instagramBusinessId = socialAccount.instagramBusinessId;
    } else if (platform === "facebook") {
      result.accountId = socialAccount.facebookPageId;
      result.facebookPageId = socialAccount.facebookPageId;
      result.userAccessToken = token.accessToken; // User token for fetching page token
      result.storedPageAccessToken = socialAccount.pageAccessToken; // Fallback
    } else if (platform === "linkedin") {
      result.accountId = socialAccount.facebookUserId;
    }

    console.log("[GET-ACCOUNT-TOKENS] Fetched from database:", {
      platform,
      accountName: socialAccount.accountName,
      accountId: result.accountId,
    });

    return result;
  } catch (error: any) {
    console.error("[GET-ACCOUNT-TOKENS HANDLER] Error:", error.message);
    throw error;
  }
};

/**
 * Schedule a post for publishing
 * 
 * Uses DB transaction to ensure atomicity:
 * 1. Create post_details record
 * 2. Create post_schedule (queue entry)
 * 3. Commit or rollback entirely
 * 
 * Note: feed_story is stored as-is and handled by scheduler to post to both feed and story
 */
export const schedulePost = async (data: {
  companyId: string;
  createdBy: string | null;
  assignedClientId: number | null;
  socialAccountId: string;
  platform: "facebook" | "instagram" | "linkedin";
  postType: "feed" | "story" | "feed_story" | "reel" | "carousel" | "article";
  caption: string | null;
  firstComment: string | null;
  taggedPeople: Array<string>;
  collaborators: Array<string>;
  mediaUrlId: string;
  scheduleAt: Date;
}) => {
  // Start transaction
  const transaction = await dbInstance.transaction();

  try {
    // 1. Verify social account exists
    const socialAccount = await MetaSocialAccount.findByPk(data.socialAccountId, {
      transaction,
    });

    if (!socialAccount) {
      throw new Error("Social account not found");
    }

    if (socialAccount.companyId !== data.companyId) {
      throw new Error("Unauthorized: Social account does not belong to this company");
    }

    // 2. Verify assigned client exists (if provided)
    console.log("[SCHEDULE-POST HANDLER] Verifying assigned client", {
      assignedClientId: data.assignedClientId,
    });
    if (data.assignedClientId) {
      const client = await Clients.findByPk(data.assignedClientId, {
        transaction,
      });

      if (!client) {
        throw new Error(`Client with ID ${data.assignedClientId} not found`);
      }

      if (client.companyId !== data.companyId) {
        throw new Error("Unauthorized: Client does not belong to this company");
      }
    }

    // 3. Create post_details (single entry - scheduler handles feed_story)
    // Media will be populated from server (Instagram/Facebook) after post is published
    // GitHub URLs are stored only in PostMediaFiles for upload purposes
    const postDetailId = uuidv4();
    await PostDetails.create(
      {
        id: postDetailId,
        companyId: data.companyId,
        createdBy: data.createdBy,
        socialAccountId: data.socialAccountId,
        platform: data.platform,
        postType: data.postType,
        caption: data.caption,
        firstComment: data.firstComment,
        taggedPeople: data.taggedPeople,
        collaborators: data.collaborators,
        media: [],  // Will be populated with server URLs after publishing
        mediaUrlId: data.mediaUrlId,
        status: "pending",
        attempts: 0,
        isImmediatelyPublished: false,
        scheduledAt: data.scheduleAt,
        publishedAt: null,
      },
      { transaction }
    );

    // 4. Create post_schedule (queue entry)
    const postScheduleId = uuidv4();
    await PostSchedule.create(
      {
        id: postScheduleId,
        postDetailId: postDetailId,
        runAt: data.scheduleAt,
        status: "pending",
        attempts: 0,
      },
      { transaction }
    );

    // Commit transaction
    await transaction.commit();

    console.log("[SCHEDULE-POST HANDLER] Post scheduled successfully", {
      postDetailId,
      postScheduleId,
      scheduledFor: data.scheduleAt,
      platform: data.platform,
      postType: data.postType,
    });

    return {
      postDetailId,
      postScheduleId,
      scheduledFor: data.scheduleAt,
    };
  } catch (error: any) {
    // Rollback on error
    await transaction.rollback();
    console.error("[SCHEDULE-POST HANDLER] Error scheduling post:", error.message);
    throw error;
  }
};

/**
 * Create an immediate PostDetails record and return its id.
 * Returns `string | null` (null on failure).
 */
export const createImmediatePostDetail = async (data: {
  companyId: string;
  createdBy?: string | null;
  socialAccountId: string;
  platform: "facebook" | "instagram" | "linkedin";
  postType: "feed" | "story" | "feed_story" | "reel" | "carousel" | "article";
  caption?: string | null;
  firstComment?: string | null;
  taggedPeople?: Array<string>;
  collaborators?: Array<string>;
  mediaUrlId?: string;
  initialStatus?: "pending" | "processing" | "published" | "failed" | "cancelled";
  attempts?: number;
  externalPostId?: string | null;
  errorMessage?: string | null;
  scheduledAt?: Date | null;
}) => {
  const t = await dbInstance.transaction();
  try {
    const id = uuidv4();

    // Media will be populated from server (Instagram/Facebook) after post is published
    // We store GitHub URLs only for upload purposes, not in media field
    await PostDetails.create(
      {
        id,
        companyId: data.companyId,
        createdBy: data.createdBy || null,
        socialAccountId: data.socialAccountId,
        platform: data.platform,
        postType: data.postType,
        caption: data.caption || null,
        firstComment: data.firstComment || null,
        taggedPeople: data.taggedPeople || [],
        collaborators: data.collaborators || [],
        media: [],  // Will be populated with server URLs after publishing
        mediaUrlId: data.mediaUrlId || null,
        status: data.initialStatus || "processing",
        attempts: typeof data.attempts === "number" ? data.attempts : 0,
        externalPostId: data.externalPostId || null,
        errorMessage: data.errorMessage || null,
        isImmediatelyPublished: true,
        scheduledAt: data.scheduledAt || null,
        publishedAt: data.initialStatus === "published" ? new Date() : null,
      },
      { transaction: t }
    );

    console.log(`[SOCIAL-POSTING HANDLER] Created PostDetail ${id} - media will be populated from server after publishing`);
    await t.commit();
    return id;
  } catch (error: any) {
    if (t) await t.rollback();
    console.warn("[SOCIAL-POSTING HANDLER] createImmediatePostDetail failed:", error.message);
    return null;
  }
};

/**
 * Bulk create immediate PostDetails for multiple accounts/postTypes.
 * Returns maps: preCreatedMap (key: `${socialAccountId}::${postType}` -> id)
 * and platformIdMap (platform -> [ids])
 */
export const createImmediatePostDetailsBulk = async (params: {
  accountsData: any[];
  postingConfig: any;
  companyId: string;
  caption?: string | null;
  firstComment?: string | null;
  taggedPeopleList?: string[];
  collaboratorsList?: string[];
  mediaUrlId?: string;
  scheduledAt?: Date | null;
}) => {
  const preCreatedMap: Map<string, string> = new Map();
  const platformIdMap: Record<string, string[]> = {};

  try {
    // Media will be populated from server (Instagram/Facebook) after posts are published
    // GitHub URLs are stored only in PostMediaFiles for upload purposes
    const bulkPayloads: any[] = [];

    for (let i = 0; i < params.accountsData.length; i++) {
      const account = params.accountsData[i];
      const platform = account.platform;

      const postTypes = params.postingConfig[platform];
      const typesToPost = Array.isArray(postTypes) ? postTypes : (postTypes ? [postTypes] : ["feed"]);

      for (const postType of typesToPost) {
        const id = uuidv4();
        bulkPayloads.push({
          id,
          companyId: params.companyId,
          createdBy: null,
          socialAccountId: account.modelId,
          platform: platform,
          postType: postType,
          caption: params.caption || null,
          firstComment: params.firstComment || null,
          taggedPeople: params.taggedPeopleList || [],
          collaborators: params.collaboratorsList || [],
          media: [],  // Will be populated with server URLs after publishing
          mediaUrlId: params.mediaUrlId || null,
          status: "processing",
          attempts: 0,
          isImmediatelyPublished: true,
          scheduledAt: params.scheduledAt || null,
          publishedAt: null,
        });
      }
    }

    if (bulkPayloads.length === 0) {
      return { preCreatedMap, platformIdMap };
    }

    await dbInstance.transaction(async (t: any) => {
      await PostDetails.bulkCreate(bulkPayloads, { transaction: t });
    });

    console.log(`[SOCIAL-POSTING HANDLER] Created ${bulkPayloads.length} bulk PostDetails - media will be populated from server after publishing`);

    for (const payload of bulkPayloads) {
      const key = `${payload.socialAccountId}::${payload.postType}`;
      preCreatedMap.set(key, payload.id);
      platformIdMap[payload.platform] = platformIdMap[payload.platform] || [];
      platformIdMap[payload.platform].push(payload.id);
    }

    return { preCreatedMap, platformIdMap };
  } catch (error: any) {
    console.warn("[SOCIAL-POSTING HANDLER] createImmediatePostDetailsBulk failed:", error.message);
    return { preCreatedMap, platformIdMap };
  }
};

/**
 * Update a PostDetails record. Returns true on success, false on failure.
 */
export const updatePostDetail = async (postDetailId: string, updates: any) => {
  try {
    await PostDetails.update(updates, { where: { id: postDetailId } });
    return true;
  } catch (error: any) {
    console.warn("[SOCIAL-POSTING HANDLER] updatePostDetail failed:", error.message);
    return false;
  }
};

/**
 * Delete a post (hard delete) only if it's not published.
 * Decrements media refcount and deletes media if refcount reaches zero.
 * Returns { success, message } object.
 */
export const deletePostDetail = async (postDetailId: string): Promise<{ success: boolean; message: string }> => {
  try {
    const post = await PostDetails.findByPk(postDetailId);
    if (!post) return { success: false, message: 'Post not found' };
    if (post.status === 'published' || post.externalPostId) return { success: false, message: 'Cannot delete published posts' };
    
    // Decrement media refcount and cleanup if zero
    if ((post as any).mediaUrlId) {
      await decrementRefCountAndCleanup((post as any).mediaUrlId);
    }
    
    // Delete related PostSchedule records
    await PostSchedule.destroy({ where: { postDetailId } });
    
    // Delete the PostDetails record (hard delete)
    await PostDetails.destroy({ where: { id: postDetailId } });
    
    console.log(`[SOCIAL-POSTING HANDLER] Hard-deleted post ${postDetailId}`);
    return { success: true, message: 'Post deleted permanently' };
  } catch (error: any) {
    console.error("[SOCIAL-POSTING HANDLER] deletePostDetail failed:", error.message);
    return { success: false, message: error.message || 'Failed to delete post' };
  }
};

/**
 * Get all social accounts for a company
 */
export const getMetaSocialAccounts = async (query: any) => {
  try {
    const accounts = await MetaSocialAccount.findAll({
      where: { companyId: query.companyId },
      order: [["createdAt", "DESC"]],
    });

    return accounts;
  } catch (error: any) {
    console.error("[GET-META-SOCIAL-ACCOUNTS HANDLER] Error:", error.message);
    throw error;
  }
};

/**
 * Get all clients for a company with their social accounts
 */
export const getAllAgencyClients = async (query: any) => {
  try {
    const { modelOption, orderBy, attributes } = MakeQuery({
      query,
      Model: Clients,
    });

    const result = await Clients.findAndCountAll({
      where: { companyId: query.companyId },
      // Include basic client details so frontend can display them
      attributes: [
        "id",
        "userId",
        "clientfirstName",
        "clientLastName",
        "businessName",
        "businessWebsite",
        "businessEmail",
        "businessContact",
        "email",
        "contact",
        "country",
        "state",
        "city",
        "logo",
        "profile",
      ],
      order: orderBy || [["createdAt", "DESC"]],
      raw: false,
      include: [
        {
          model: MetaSocialAccount,
          as: "metaSocialAccounts",
          required: false,
          where: { isAdded: true }, // Only include accounts that are added
        },
      ],
    });

    return result;
  } catch (error: any) {
    console.error("[GET-AGENCY-CLIENTS HANDLER] Error:", error.message);
    throw error;
  }
};

/**
 * Get pending jobs for processing
 * 
 * Fetches jobs where run_at <= NOW() and locks them atomically
 * Returns jobs ready for processing
 */
export const getPendingPostsForSchedule = async (workerId: string, limit = 5) => {
  const transaction = await dbInstance.transaction();

  try {
    // Get pending posts that are ready to run
    const now = new Date();

    /**
     * PRODUCTION FIX: Use SKIP LOCKED for multi-worker safety
     * ALSO: Only fetch scheduled posts (not immediately published)
     * 
     * - lock: Transaction.LOCK.UPDATE = SELECT ... FOR UPDATE
     * - skipLocked: true = SKIP LOCKED (skip rows locked by other workers)
     * - isImmediatelyPublished: false = only get scheduled posts
     * 
     * This prevents:
     * - Workers blocking each other on the same rows
     * - Duplicate processing of posts
     * - Scheduler touching immediate posts
     * - Deadlocks between concurrent workers
     */
    const schedules = await PostSchedule.findAll(
      {
        where: {
          status: "pending",
          runAt: { [Sequelize.Op.lte]: now },
        },
        include: [
          {
            model: PostDetails,
            as: "postDetail",
            where: {
              /**
               * CRITICAL: Only process scheduled posts
               * Immediate posts from /publish should NEVER be queued in post_schedule
               * This is a safety check in case any immediate post somehow gets here
               */
              isImmediatelyPublished: false,
            },
            include: [
              {
                model: MetaSocialAccount,
                as: "socialAccount",
              },
            ],
          },
        ],
        order: [["runAt", "ASC"]],
        limit,
        transaction,
        lock: transaction.LOCK.UPDATE,
        skipLocked: true,
        raw: false,
      } as any
    );

    // Update to processing status
    const scheduleIds = schedules.map((s) => s.id);

    if (scheduleIds.length > 0) {
      await PostSchedule.update(
        {
          status: "processing",
          lockedAt: new Date(),
          workerId,
          attempts: Sequelize.literal("attempts + 1"),
        },
        {
          where: { id: scheduleIds },
          transaction,
        }
      );
    }

    await transaction.commit();

    return schedules;
  } catch (error: any) {
    await transaction.rollback();
    console.error("[GET-PENDING-POSTS HANDLER] Error:", error.message);
    throw error;
  }
};

/**
 * Mark post as published
 */
export const markPostAsPublished = async (
  postDetailId: string,
  externalPostId: string
) => {
  try {
    const transaction = await dbInstance.transaction();

    // Update post_details
    await PostDetails.update(
      {
        status: "published",
        externalPostId,
      },
      {
        where: { id: postDetailId },
        transaction,
      }
    );

    // Mark schedule as done
    await PostSchedule.update(
      {
        status: "done",
      },
      {
        where: { postDetailId },
        transaction,
      }
    );

    await transaction.commit();

    console.log("[MARK-POST-PUBLISHED] Post published successfully", {
      postDetailId,
      externalPostId,
    });
  } catch (error: any) {
    console.error("[MARK-POST-PUBLISHED] Error:", error.message);
    throw error;
  }
};

/**
 * Mark post as failed
 */
export const markPostAsFailed = async (
  postDetailId: string,
  errorMessage: string,
  attempts: number
) => {
  try {
    const transaction = await dbInstance.transaction();

    // Update post_details
    await PostDetails.update(
      {
        status: attempts >= 3 ? "failed" : "pending",
        errorMessage: attempts >= 3 ? errorMessage : null,
        attempts: Sequelize.literal("attempts + 1"),
      },
      {
        where: { id: postDetailId },
        transaction,
      }
    );

    // Update schedule
    if (attempts >= 3) {
      // Mark as failed if max attempts reached
      await PostSchedule.update(
        {
          status: "failed",
          lockedAt: null,
          workerId: null,
        },
        {
          where: { postDetailId },
          transaction,
        }
      );
    } else {
      // Unlock for retry
      await PostSchedule.update(
        {
          status: "pending",
          lockedAt: null,
          workerId: null,
        },
        {
          where: { postDetailId },
          transaction,
        }
      );
    }

    await transaction.commit();

    console.log("[MARK-POST-FAILED] Post marked as failed", {
      postDetailId,
      errorMessage,
      attempts,
      maxAttemptsReached: attempts >= 3,
    });
  } catch (error: any) {
    console.error("[MARK-POST-FAILED] Error:", error.message);
    throw error;
  }
};

/**
 * Recover stuck jobs
 * 
 * Unlocks jobs that have been processing for > 10 minutes
 * Typically called on worker startup
 */
export const recoverStuckJobs = async () => {
  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const result = await PostSchedule.update(
      {
        status: "pending",
        lockedAt: null,
        workerId: null,
      },
      {
        where: {
          status: "processing",
          lockedAt: { [Sequelize.Op.lt]: tenMinutesAgo },
        },
      }
    );

    const recoveredCount = result[0];

    if (recoveredCount > 0) {
      console.log("[RECOVER-STUCK-JOBS] Recovered", recoveredCount, "jobs");
    }

    return recoveredCount;
  } catch (error: any) {
    console.error("[RECOVER-STUCK-JOBS] Error:", error.message);
    throw error;
  }
};

/**
 * Update PostDetails with fetched media children from Instagram
 * Stores all media URLs and types that were published
 */
export const updatePostWithMediaChildren = async (
  postDetailId: string,
  mediaChildren: Array<{ url: string; type: any; id: string }>
): Promise<void> => {
  try {
    const postDetail = await PostDetails.findByPk(postDetailId);
    if (!postDetail) {
      console.warn(`[UPDATE-POST-MEDIA] PostDetail not found: ${postDetailId}`);
      return;
    }

    // Format media for storage
    const formattedMedia = mediaChildren.map(child => ({
      url: child.url,
      type: child.type,
      externalId: child.id
    }));

    // Update the post detail with fetched media
    await postDetail.update({
      media: formattedMedia
    });

    console.log(`[UPDATE-POST-MEDIA] Updated PostDetail ${postDetailId} with ${formattedMedia.length} media items`);
  } catch (error: any) {
    console.error("[UPDATE-POST-MEDIA] Failed to update post with media:", {
      postDetailId,
      error: error.message
    });
  }
};

/**
 * Get published post details with media and social account info
 * Used for displaying published posts with their media
 */
export const getPublishedPostDetails = async (postDetailId: string): Promise<any> => {
  try {
    const post = await PostDetails.findByPk(postDetailId, {
      include: [
        {
          model: MetaSocialAccount,
          as: 'socialAccount',
          attributes: ['id', 'accountName', 'platform', 'companyId', 'assignedClientId']
        },
        {
          model: PostSchedule,
          as: 'schedule',
          attributes: ['id', 'runAt', 'status'],
          required: false,
        }
      ]
    });

    if (!post) {
      return null;
    }

    // Prepare base response
    const response: any = {
      id: post.id,
      companyId: post.companyId,
      platform: post.platform,
      postType: post.postType,
      caption: post.caption,
      firstComment: (post as any).firstComment || null,
      status: post.status,
      externalPostId: post.externalPostId,
      media: post.media || [], // media as stored (usually contains server URLs and external ids)
      mediaUrlId: (post as any).mediaUrlId || null, // reference to PostMediaFiles if uploads were used
      socialAccount: post.socialAccount,
      taggedPeople: (post as any).taggedPeople || [],
      publishedAt: post.publishedAt,
      createdAt: post.createdAt,
      postSchedule: (post as any).schedule
        ? { runAt: (post as any).schedule.runAt, status: (post as any).schedule.status }
        : null,
    };

    // If there is a PostMediaFiles reference, fetch the stored upload URLs and status
    try {
      const mediaUrlId = response.mediaUrlId;
      if (mediaUrlId) {
        const mediaRecord = await PostMediaFiles.findByPk(mediaUrlId);
        let urls: any = [];
        let status: any = null;

        if (mediaRecord) {
          urls = (mediaRecord as any).urls;
          if (typeof urls === 'string') {
            try {
              urls = JSON.parse(urls);
            } catch (e) {
              urls = [];
            }
          }
          status = (mediaRecord as any).status || null;
        }

        response.mediaFiles = Array.isArray(urls) ? urls : [];
        response.mediaFilesStatus = status;
      } else {
        response.mediaFiles = [];
        response.mediaFilesStatus = null;
      }
    } catch (err: any) {
      console.warn('[GET-PUBLISHED-POST] Failed to fetch PostMediaFiles:', err?.message || err);
      response.mediaFiles = [];
      response.mediaFilesStatus = null;
    }

    // If the post has an assigned client id on the socialAccount, fetch client details
    try {
      const assignedClientId = response.socialAccount?.assignedClientId || null;
      if (assignedClientId) {
        const client = await Clients.findByPk(assignedClientId);
        if (client) {
          // Include minimal client details for frontend convenience
          const clientPlain: any = typeof client.toJSON === 'function' ? client.toJSON() : client;
          response.client = {
            id: clientPlain.id,
            clientfirstName: clientPlain.clientfirstName || null,
            clientLastName: clientPlain.clientLastName || null,
            businessName: clientPlain.businessName || null,
            logo: clientPlain.logo || null,
            businessEmail: clientPlain.businessEmail || null,
            businessContact: clientPlain.businessContact || null,
          };
        } else {
          response.client = null;
        }
      } else {
        response.client = null;
      }
    } catch (err: any) {
      console.warn('[GET-PUBLISHED-POST] Failed to fetch assigned client details:', err?.message || err);
      response.client = null;
    }

    return response;
  } catch (error: any) {
    console.error("[GET-PUBLISHED-POST] Error:", error.message);
    throw error;
  }
};

/**
 * Update status for PostMediaFiles
 */
export const updatePostMediaFilesStatus = async (mediaUrlId: string, status: string) => {
  try {
    await PostMediaFiles.update({ status }, { where: { id: mediaUrlId } });
    console.log(`[SOCIAL-POSTING HANDLER] Updated PostMediaFiles ${mediaUrlId} -> ${status}`);
    return true;
  } catch (error: any) {
    console.warn(`[SOCIAL-POSTING HANDLER] Failed to update PostMediaFiles status:`, error.message);
    return false;
  }
};

/**
 * Cancel a scheduled post (API wrapper)
 */
export const cancelScheduledPost = async (postDetailId: string, companyId?: string) => {
  try {
    const post = await PostDetails.findByPk(postDetailId);
    if (!post) throw new Error('Post not found');

    if (companyId && post.companyId !== companyId) {
      throw new Error('Unauthorized: post does not belong to this company');
    }

    if (post.status !== 'pending') {
      throw new Error(`Cannot cancel post with status '${post.status}'`);
    }

    await post.update({ status: 'cancelled' });
    await PostSchedule.update({ status: 'failed' }, { where: { postDetailId } });

    console.log(`[SOCIAL-POSTING HANDLER] Cancelled scheduled post ${postDetailId}`);
    return true;
  } catch (error: any) {
    console.error('[SOCIAL-POSTING HANDLER] cancelScheduledPost error:', error.message);
    throw error;
  }
};

/**
 * Fetch scheduled posts (used by API)
 */
export const getScheduledPosts = async (params: { companyId: string; status?: string; month?: string; clientId?: string }) => {
  try {
    const { companyId, status, month, clientId } = params;

    const whereClause: any = { companyId };
    const scheduleWhereClause: any = {};
    if (status) scheduleWhereClause.status = status;

    if (month) {
      const monthStr = String(month);
      let startDate: Date;
      let endDate: Date;

      if (monthStr.includes('-')) {
        const [year, monthNum] = monthStr.split('-');
        startDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
        endDate = new Date(parseInt(year), parseInt(monthNum), 0, 23, 59, 59, 999);
      } else {
        const currentYear = new Date().getFullYear();
        const monthNum = parseInt(monthStr);
        startDate = new Date(currentYear, monthNum - 1, 1);
        endDate = new Date(currentYear, monthNum, 0, 23, 59, 59, 999);
      }

      scheduleWhereClause.runAt = { [Sequelize.Op.between]: [startDate, endDate] };
    }

    // If a clientId is provided, require the join to MetaSocialAccount and filter by assignedClientId
    const socialAccountInclude: any = {
      model: MetaSocialAccount,
      as: 'socialAccount',
      attributes: ['id', 'accountName', 'profilePhoto', 'platform', 'assignedClientId'],
      required: false,
    };

    if (clientId) {
      socialAccountInclude.where = { assignedClientId: clientId };
      socialAccountInclude.required = true;
    }

    const posts = await PostDetails.findAll({
      where: whereClause,
      include: [
        {
          model: PostSchedule,
          as: 'schedule',
          where: Object.keys(scheduleWhereClause).length > 0 ? scheduleWhereClause : undefined,
          required: false,
        },
        socialAccountInclude,
      ],
      order: [['createdAt', 'DESC']],
      limit: 100,
    });

    // Enrich each post with its PostMediaFiles.urls (if mediaUrlId exists)
    const enriched: any[] = [];
    for (const post of posts) {
      // convert to plain object (use `any` to allow attaching extra fields)
      const plain: any = typeof post.toJSON === 'function' ? post.toJSON() : (post as any);

      try {
        if (plain.mediaUrlId) {
          const mediaRecord = await PostMediaFiles.findByPk(plain.mediaUrlId);

          let urls: any = [];
          let status: any = null;

          if (mediaRecord) {
            urls = (mediaRecord as any).urls;
            // Some DB drivers return JSON columns as strings; parse if necessary
            if (typeof urls === 'string') {
              try {
                urls = JSON.parse(urls);
              } catch (e:any) {
                console.warn('[SOCIAL-POSTING HANDLER] Failed to parse mediaRecord.urls JSON:', e?.message || e);
                urls = [];
              }
            }

            status = (mediaRecord as any).status || null;
          }

          plain.mediaFiles = Array.isArray(urls) ? urls : [];
          plain.mediaFilesStatus = status;
        } else {
          plain.mediaFiles = [];
          plain.mediaFilesStatus = null;
        }
      } catch (err: any) {
        console.warn('[SOCIAL-POSTING HANDLER] Failed to fetch PostMediaFiles for', plain.mediaUrlId, err?.message || err);
        plain.mediaFiles = [];
        plain.mediaFilesStatus = null;
      }

      enriched.push(plain);
    }

    return enriched;
  } catch (error: any) {
    console.error('[SOCIAL-POSTING HANDLER] getScheduledPosts error:', error.message);
    throw error;
  }
};

/**
 * Fetch engagement metrics (likes, comments, views) for published posts
 * Accepts array of `postDetailId`s and returns per-post metrics.
 */
export const fetchPostEngagements = async (postDetailIds: string[] | string) => {
  const ids = Array.isArray(postDetailIds) ? postDetailIds : [postDetailIds];
  const out: any[] = [];

  for (const id of ids) {
    try {
      const post = await getPublishedPostDetails(String(id));
      if (!post) {
        out.push({ postDetailId: id, success: false, error: 'Post not found' });
        continue;
      }

      const platform = (post.platform || '').toLowerCase();
      const externalId = post.externalPostId || null;

      if (!externalId) {
        out.push({ postDetailId: id, success: false, error: 'externalPostId missing on PostDetails' });
        continue;
      }

      try {
        if (platform === 'facebook') {
          // Need page/user token and page id - try to fetch account tokens from DB
          const accountTokens = await getAccountTokensForPublishing(post.socialAccount?.id, String(post.companyId));
          const pageId = accountTokens.accountId || undefined;
          const token = accountTokens.storedPageAccessToken || accountTokens.userAccessToken || accountTokens.accessToken;

          const metrics = await getFacebookPostMetrics(token as string, String(externalId), pageId);
          out.push({ postDetailId: id, success: true, platform: 'facebook', metrics, externalPostId: externalId });
        } else if (platform === 'instagram') {
          // For IG, account access token is needed
          const accountTokens = await getAccountTokensForPublishing(post.socialAccount?.id, String(post.companyId));
          const token = accountTokens.accessToken;
          const metrics = await getInstagramPostMetrics(token as string, String(externalId));
          out.push({ postDetailId: id, success: true, platform: 'instagram', metrics, externalPostId: externalId });
        } else {
          // Unsupported platform - return stored data only
          out.push({ postDetailId: id, success: false, error: `Unsupported platform: ${platform}` });
        }
      } catch (err: any) {
        out.push({ postDetailId: id, success: false, error: err?.message || String(err) });
      }
    } catch (error: any) {
      out.push({ postDetailId: id, success: false, error: error?.message || String(error) });
    }
  }

  return out;
};