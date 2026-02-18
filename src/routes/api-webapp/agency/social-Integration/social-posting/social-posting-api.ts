import axios from "axios";
import express, { Request, Response } from "express";
import {
  getAllAgencyClients,
  getBatchAccountTokensForPublishing,
  incrementRefCount,
  decrementRefCountAndCleanup,
  createPostMediaFilesRecord,
  getPublishedPostDetails,
  schedulePost,
  updatePostMediaFilesStatus,
  cancelScheduledPost,
  getScheduledPosts,
  getMetaSocialAccounts,
  createImmediatePostDetail,
  createImmediatePostDetailsBulk,
  updatePostDetail,
  deletePostDetail,
  updatePostWithMediaChildren
  , fetchPostEngagements
} from "./social-posting.handler";
import { addFeedAndStory, addInstagramPost, addInstagramStory, addInstagramComment, addInstagramReel, getInstagramPostChildren, getInstagramStoryMedia } from "../../../../../services/instagram-service";
import { uploadToGitHub } from "../../../../../services/image-uploader";
import { postToFacebookPage, addFacebookPost, getPageAccessToken, addFacebookComment, getFacebookPostMedia, getFacebookCarouselChildren } from "../../../../../services/facebook-service";
import { createLinkedInShare } from "../../../../../services/linkedin-service";
import { getIO } from "../../../../../services/socket-service";
import { upload, detectMediaType } from "./multer-config";
import { PostDetails } from "./post-details.model";
import { PostMediaFiles } from "./post-media-files.model";
import { PostSchedule } from "./post-schedule.model";
import dbInstance from '../../../../../db/core/control-db';
import { v4 as uuidv4 } from 'uuid';
import Sequelize from 'sequelize';

const router = express.Router();

router.get('/get-clients', async (req: Request, res: Response) => {
  try {
    const {
      companyId,
    } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId is required",
      });
    }

    const result = await getAllAgencyClients({ companyId });

    res.status(200).json({
      success: true,
      data: result,
      message: "Clients retrieved successfully",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve clients",
    });
  }
});

router.post("/publish", upload.array("files", 10), async (req: Request, res: Response) => {
  try {
    const {
      metaSocialAccountId,
      companyId,
      caption,
      firstComment,
      taggedPeople,
      collaborators,
      socketId
    } = req.body;

    // Support both single ID and array of IDs
    let metaSocialAccountIds: string[] = [];
    
    if (metaSocialAccountId && typeof metaSocialAccountId === 'string') {
      metaSocialAccountIds = [metaSocialAccountId];
    } else if (req.body.metaSocialAccountIds) {
      const ids = req.body.metaSocialAccountIds;
      metaSocialAccountIds = typeof ids === 'string' ? JSON.parse(ids) : (Array.isArray(ids) ? ids : []);
    }

    const postingConfig = JSON.parse(req.body.postingConfig || '{}');
    const files = req.files as Express.Multer.File[];

    // Parse taggedPeople if it's a string and extract only usernames for Instagram
    let taggedPeopleList: string[] = [];
    if (taggedPeople) {
      try {
        let parsed = typeof taggedPeople === 'string' ? JSON.parse(taggedPeople) : taggedPeople;
        if (Array.isArray(parsed)) {
          // Extract usernames from objects or use strings directly
          taggedPeopleList = parsed.map((item: any) => {
            if (typeof item === 'string') return item;
            if (typeof item === 'object' && item.username) return item.username;
            return null;
          }).filter((username: string | null) => username);
        }
      } catch (e) {
        console.warn("[SOCIAL POSTING API] Failed to parse taggedPeople");
        taggedPeopleList = [];
      }
    }

    // Parse collaborators if it's a string and extract only usernames for Instagram
    let collaboratorsList: string[] = [];
    if (collaborators) {
      try {
        let parsed = typeof collaborators === 'string' ? JSON.parse(collaborators) : collaborators;
        if (Array.isArray(parsed)) {
          // Extract usernames from objects or use strings directly
          collaboratorsList = parsed.map((item: any) => {
            if (typeof item === 'string') return item;
            if (typeof item === 'object' && item.username) return item.username;
            return null;
          }).filter((username: string | null) => username);
        }
      } catch (e) {
        console.warn("[SOCIAL POSTING API] Failed to parse collaborators");
        collaboratorsList = [];
      }
    }

    // Log request
    console.log("[SOCIAL POSTING API] Publish request:", {
      companyId: companyId || "MISSING",
      metaSocialAccountIds,
      caption: caption ? caption.substring(0, 50) + "..." : "MISSING",
      taggedPeopleCount: taggedPeopleList.length,
      collaboratorsCount: collaboratorsList.length,
      postingConfig,
      filesCount: files?.length || 0,
    });

    // Get socket instance for progress updates
    const io = getIO();
    const emitProgress = (data: any) => {
      if (io && socketId) {
        io.to(socketId).emit('publish:progress', data);
      }
    };

    // Validation
    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: companyId is required"
      });
    }

    if (!metaSocialAccountIds || metaSocialAccountIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "metaSocialAccountIds is required (array of MetaSocialAccount primary keys)"
      });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No files uploaded"
      });
    }

    try {
      // ============ FETCH ACCOUNT DATA FROM DATABASE (SINGLE QUERY) ============
      console.log(`[SOCIAL POSTING API] Fetching accounts for ${metaSocialAccountIds.length} ID(s)...`);

      try {
        // OPTIMIZED: Single database query for all accounts
        var accountsData = await getBatchAccountTokensForPublishing(metaSocialAccountIds, companyId);
      } catch (error: any) {
        console.error(`[SOCIAL POSTING API] Failed to fetch accounts from DB:`, error.message);
        return res.status(400).json({
          success: false,
          error: "Failed to fetch account data from database",
          details: error.message
        });
      }

      if (accountsData.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No accounts found for the provided IDs"
        });
      }

      console.log(`[SOCIAL POSTING API] Successfully fetched ${accountsData.length} account(s) from database in SINGLE QUERY`);

      // Emit: Starting upload
      emitProgress({
        step: 'uploading',
        message: 'Uploading media files to CDN...',
        progress: 10,
        platform: 'all'
      });

      // Upload all files to GitHub and get CDN URLs
      const cdnUrls: string[] = [];
      const mediaUrls: Array<{ url: string; type: any }> = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const cdnUrl = await uploadToGitHub(file.path, "social-posts");
        if (cdnUrl) {
          cdnUrls.push(cdnUrl);
          const videoMimes = ["video/mp4", "video/quicktime", "video/mpeg", "video/webm", "video/x-msvideo", "video/x-ms-wmv"];
          const mediaType = videoMimes.includes(file.mimetype) ? "video" : "image";
          mediaUrls.push({ url: cdnUrl, type: mediaType });
        }
        // Emit progress for each file upload
        emitProgress({
          step: 'uploading',
          message: `Uploaded file ${i + 1} of ${files.length}`,
          progress: 10 + Math.round(((i + 1) / files.length) * 20),
          platform: 'all'
        });
      }

      if (cdnUrls.length === 0) {
        emitProgress({
          step: 'error',
          message: 'Failed to upload files to CDN',
          progress: 0,
          platform: 'all'
        });
        return res.status(500).json({ error: "Failed to upload files to GitHub" });
      }

      console.log(`[SOCIAL POSTING API] Uploaded ${cdnUrls.length} file(s) to CDN`);

      // ============ CREATE POST MEDIA FILES RECORD ============
      // Calculate refCount based on total platforms we'll post to
      let totalRefCount = 0;
      for (const account of accountsData) {
        const postTypes = postingConfig[account.platform];
        const typesToPost = Array.isArray(postTypes) ? postTypes : (postTypes ? [postTypes] : ["feed"]);
        totalRefCount += typesToPost.length;
      }

      let mediaUrlId: string;
      try {
        mediaUrlId = await createPostMediaFilesRecord(mediaUrls, totalRefCount);
        console.log(`[SOCIAL POSTING API] Created PostMediaFiles with ID: ${mediaUrlId}`);
      } catch (error: any) {
        console.error("[SOCIAL POSTING API] Failed to create PostMediaFiles:", error.message);
        return res.status(500).json({ error: "Failed to store media files", details: error.message });
      }

      const results: any[] = [];
      const platforms: Set<string> = new Set();
      let currentProgress = 30;

      // Pre-create PostDetails for all accounts/postTypes so we have IDs to return immediately
      const preCreatedMap: Map<string, string> = new Map(); // key: `${account.modelId}::${postType}` -> postDetailId
      const platformIdMap: Record<string, string[]> = {}; // platform -> [ids]

      // Use handler to create PostDetails in bulk and get back maps
      let createResult: any = { preCreatedMap: new Map(), platformIdMap: {} };
      try {
        createResult = await createImmediatePostDetailsBulk({
          accountsData,
          postingConfig,
          companyId,
          caption,
          firstComment,
          taggedPeopleList,
          collaboratorsList,
          mediaUrlId, // Pass mediaUrlId instead of mediaUrls
        });
      } catch (e: any) {
        console.warn("[SOCIAL POSTING API] createImmediatePostDetailsBulk failed:", e.message);
      }

      // Replace local maps with handler output
      for (const [k, v] of createResult.preCreatedMap || []) {
        preCreatedMap.set(k, v);
      }
      Object.assign(platformIdMap, createResult.platformIdMap || {});

      // Pre-created PostDetails IDs are available in `platformIdMap`.
      // NOTE: We intentionally do NOT send an immediate response here —
      // the API will respond after processing completes to provide final results.

      // Calculate progress increments based on number of accounts
      const progressPerAccount = Math.floor(60 / accountsData.length);

      // ============ POST TO EACH ACCOUNT ============
      for (let i = 0; i < accountsData.length; i++) {
        const account = accountsData[i];
        const platform = account.platform;

        platforms.add(platform);

        console.log(`[SOCIAL POSTING API] Posting to ${platform} account ${i + 1}/${accountsData.length}: ${account.accountName}`);

        emitProgress({
          step: 'posting',
          message: `Posting to ${platform}...`,
          progress: currentProgress,
          platform: platform
        });

        try {
          // Get post types for this platform from postingConfig
          const postTypes = postingConfig[platform];
          const typesToPost = Array.isArray(postTypes) ? postTypes : (postTypes ? [postTypes] : ["feed"]);

          console.log(`[SOCIAL POSTING API] Post types for ${platform}:`, typesToPost);

          for (const postType of typesToPost) {
            let postDetailId: string | null = null;
            try {
              // Use pre-created id if available
              const key = `${account.modelId}::${postType}`;
              if (preCreatedMap.has(key)) {
                postDetailId = preCreatedMap.get(key) || null;
              }
              // ============ INSTAGRAM ============
              if (platform === "instagram") {
                const instagramData = {
                  token: account.accessToken,
                  platformUserId: account.accountId,
                };

                const mediaType = detectMediaType(files);

                if (postType === "feed") {
                  // create PostDetails record (processing)
                  if (!postDetailId) {
                    postDetailId = await createImmediatePostDetail({
                    companyId: companyId,
                    createdBy: null,
                    socialAccountId: account.modelId,
                    platform: "instagram",
                    postType: "feed",
                    caption: caption || null,
                    firstComment: firstComment || null,
                    taggedPeople: taggedPeopleList,
                    mediaUrlId, // Use mediaUrlId instead of media
                    initialStatus: "processing",
                    attempts: 0,
                    });
                    // Increment refCount for actual post
                    await incrementRefCount(mediaUrlId);
                  }
                  if (!postDetailId) {
                    console.warn("[SOCIAL POSTING API] Failed to ensure PostDetails for instagram feed: postDetailId is null");
                  }

                  const result = await addInstagramPost(instagramData, cdnUrls, caption, mediaType, taggedPeopleList, collaboratorsList);
                  results.push({ platform: "instagram", type: "feed", account: account.accountName, filesCount: cdnUrls.length, success: true, ...result });
                  console.log(`[SOCIAL POSTING API]  Instagram feed posted`);

                  // update PostDetails to published
                  try {
                    if (postDetailId) {
                      await updatePostDetail(postDetailId, {
                        status: "published",
                        externalPostId: result?.id || null,
                        publishedAt: new Date(),
                        attempts: Sequelize.literal("attempts + 1"),
                      });

                      // Fetch Instagram post children and update media
                      if (result?.id) {
                        try {
                          const mediaChildren = await getInstagramPostChildren(instagramData.token, result.id);
                          await updatePostWithMediaChildren(postDetailId, mediaChildren);
                          console.log(`[SOCIAL POSTING API] Updated post with ${mediaChildren.length} media children from Instagram`);
                        } catch (childError: any) {
                          console.warn(`[SOCIAL POSTING API] Failed to fetch Instagram post children:`, childError.message);
                          // Don't fail the post if children fetch fails - post was successful
                        }
                      }

                      // Decrement refCount and delete files if needed
                      await decrementRefCountAndCleanup(mediaUrlId);
                    }
                  } catch (uerr: any) {
                    console.warn("[SOCIAL POSTING API] Failed to update PostDetails for instagram feed:", uerr.message);
                  }

                  if (firstComment && result?.id) {
                    try {
                      await addInstagramComment(instagramData, result.id, firstComment);
                      console.log(`[SOCIAL POSTING API] First comment added to Instagram feed`);
                    } catch (commentError: any) {
                      console.warn(`[SOCIAL POSTING API] Failed to add first comment:`, commentError.message);
                    }
                  }
                } else if (postType === "story") {
                  // create PostDetails record (processing)
                  if (!postDetailId) {
                    postDetailId = await createImmediatePostDetail({
                    companyId: companyId,
                    createdBy: null,
                    socialAccountId: account.modelId,
                    platform: "instagram",
                    postType: "story",
                    caption: caption || null,
                    firstComment: firstComment || null,
                    taggedPeople: taggedPeopleList,
                    mediaUrlId, // Use mediaUrlId instead of media
                    initialStatus: "processing",
                    attempts: 0,
                    });
                    // Increment refCount for actual post
                    await incrementRefCount(mediaUrlId);
                  }
                  if (!postDetailId) {
                    console.warn("[SOCIAL POSTING API] Failed to ensure PostDetails for instagram story: postDetailId is null");
                  }

                  const result = await addInstagramStory(instagramData, cdnUrls, mediaType);
                  results.push({ platform: "instagram", type: "story", account: account.accountName, filesCount: cdnUrls.length, success: true, ...result });
                  console.log(`[SOCIAL POSTING API]  Instagram story posted`);

                  // update PostDetails to published and fetch story media
                  try {
                    if (postDetailId) {
                      await updatePostDetail(postDetailId, {
                        status: "published",
                        externalPostId: null,
                        publishedAt: new Date(),
                        attempts: Sequelize.literal("attempts + 1"),
                      });

                      // Fetch and store Instagram story media
                      if (result?.results && Array.isArray(result.results)) {
                        try {
                          let mediaChildren: any[] = [];
                          
                          // Log story posting results
                          const successfulStories = result.results.filter((r: any) => r.success && r.id);
                          const failedStories = result.results.filter((r: any) => !r.success);
                          console.log(`[SOCIAL POSTING API] Story posting results:`, {
                            totalAttempted: result.results.length,
                            successful: successfulStories.length,
                            failed: failedStories.length,
                            successfulIds: successfulStories.map((r: any) => r.id),
                            failedReasons: failedStories.map((r: any) => r.error)
                          });
                          
                          // Get stories for this user, created after request started (so we get only the ones we just posted)
                          const storyTimestamp = Math.floor(Date.now() / 1000) - 60; // 60 seconds before now (larger buffer for processing)
                          const userStories = await getInstagramStoryMedia(instagramData.token, instagramData.platformUserId, storyTimestamp, false);
                          
                          console.log(`[SOCIAL POSTING API] Stories fetched from API:`, {
                            countFromApi: userStories.length,
                            storyIds: userStories.map((s: any) => s.id),
                            urls: userStories.map((s: any) => s.url)
                          });
                          
                          // Filter to only stories that were successfully posted
                          const successfulStoryIds = new Set(
                            successfulStories.map((r: any) => r.id)
                          );
                          
                          // Match fetched stories with the ones we posted
                          mediaChildren = userStories.filter((story: any) => {
                            const isMatch = successfulStoryIds.has(story.id);
                            console.log(`[SOCIAL POSTING API] Story ${story.id} match: ${isMatch}`);
                            return isMatch;
                          });

                          console.log(`[SOCIAL POSTING API] Final media to store:`, {
                            matchedCount: mediaChildren.length,
                            mediaIds: mediaChildren.map((m: any) => m.id)
                          });

                          if (mediaChildren.length > 0) {
                            await updatePostWithMediaChildren(postDetailId, mediaChildren);
                            console.log(`[SOCIAL POSTING API] Stored ${mediaChildren.length} story media URLs`);
                          } else if (successfulStories.length > 0) {
                            // If no media matched but stories were posted, store original URLs as fallback
                            const fallbackMedia = cdnUrls.map((url: string, idx: number) => ({
                              id: `fallback_${idx}`,
                              url: url,
                              type: mediaType === "VIDEO" ? 'video' : 'image'
                            }));
                            await updatePostWithMediaChildren(postDetailId, fallbackMedia);
                            console.log(`[SOCIAL POSTING API] No story media matched, storing ${fallbackMedia.length} original uploaded URLs as fallback`);
                          } else {
                            console.log(`[SOCIAL POSTING API] All stories failed, leaving media field empty`);
                          }
                        } catch (storyMediaError: any) {
                          console.warn(`[SOCIAL POSTING API] Failed to fetch story media:`, storyMediaError.message);
                          // Fallback to original URLs
                          if (cdnUrls.length > 0) {
                            const fallbackMedia = cdnUrls.map((url: string, idx: number) => ({
                              id: `fallback_${idx}`,
                              url: url,
                              type: mediaType === "VIDEO" ? 'video' : 'image'
                            }));
                            await updatePostWithMediaChildren(postDetailId, fallbackMedia);
                            console.log(`[SOCIAL POSTING API] Story media fetch error, storing ${fallbackMedia.length} original uploaded URLs as fallback`);
                          }
                        }
                      } else if (cdnUrls.length > 0) {
                        // Fallback to original uploaded URLs if result.results is missing
                        const fallbackMedia = cdnUrls.map((url: string, idx: number) => ({
                          id: `fallback_${idx}`,
                          url: url,
                          type: mediaType === "VIDEO" ? 'video' : 'image'
                        }));
                        await updatePostWithMediaChildren(postDetailId, fallbackMedia);
                        console.log(`[SOCIAL POSTING API] No results data, storing ${fallbackMedia.length} original uploaded URLs as fallback`);
                      }

                      // Decrement refCount and delete files if needed
                      await decrementRefCountAndCleanup(mediaUrlId);
                    }
                  } catch (uerr: any) {
                    console.warn("[SOCIAL POSTING API] Failed to update PostDetails for instagram story:", uerr.message);
                  }
                } else if (postType === "feed_story") {
                  // create PostDetails record (processing)
                  if (!postDetailId) {
                    postDetailId = await createImmediatePostDetail({
                    companyId: companyId,
                    createdBy: null,
                    socialAccountId: account.modelId,
                    platform: "instagram",
                    postType: "feed_story",
                    caption: caption || null,
                    firstComment: firstComment || null,
                    taggedPeople: taggedPeopleList,
                    mediaUrlId, // Use mediaUrlId instead of media
                    initialStatus: "processing",
                    attempts: 0,
                    });
                    // Increment refCount for actual post
                    await incrementRefCount(mediaUrlId);
                  }
                  if (!postDetailId) {
                    console.warn("[SOCIAL POSTING API] Failed to ensure PostDetails for instagram feed_story: postDetailId is null");
                  }

                  const feedResult = await addFeedAndStory(instagramData, cdnUrls, caption, mediaType, taggedPeopleList, collaboratorsList);
                  results.push({ platform: "instagram", type: "feed_story", account: account.accountName, filesCount: cdnUrls.length, success: true, ...feedResult });
                  console.log(`[SOCIAL POSTING API]  Instagram feed_story posted`);

                  // update PostDetails to published
                  try {
                    if (postDetailId) {
                      await updatePostDetail(postDetailId, {
                        status: "published",
                        externalPostId: feedResult?.feed?.id || null,
                        publishedAt: new Date(),
                        attempts: Sequelize.literal("attempts + 1"),
                      });

                      // Fetch Instagram post children (feed URLs) - for story_feed, we only store feed URLs
                      if (feedResult?.feed?.id) {
                        try {
                          const mediaChildren = await getInstagramPostChildren(instagramData.token, feedResult.feed.id);
                          
                          if (mediaChildren.length > 0) {
                            await updatePostWithMediaChildren(postDetailId, mediaChildren);
                            console.log(`[SOCIAL POSTING API] Updated post with ${mediaChildren.length} feed media URLs (story_feed)`);
                          } else if (cdnUrls.length > 0) {
                            // Fallback to original uploaded URLs if feed post children fetch failed
                            const fallbackMedia = cdnUrls.map((url: string, idx: number) => ({
                              id: `fallback_${idx}`,
                              url: url,
                              type: mediaType === "VIDEO" ? 'video' : 'image'
                            }));
                            await updatePostWithMediaChildren(postDetailId, fallbackMedia);
                            console.log(`[SOCIAL POSTING API] Feed media fetch failed, storing ${fallbackMedia.length} original uploaded URLs as fallback`);
                          }
                        } catch (childError: any) {
                          console.warn(`[SOCIAL POSTING API] Failed to fetch Instagram feed media:`, childError.message);
                          // Fallback to original URLs
                          if (cdnUrls.length > 0) {
                            const fallbackMedia = cdnUrls.map((url: string, idx: number) => ({
                              id: `fallback_${idx}`,
                              url: url,
                              type: mediaType === "VIDEO" ? 'video' : 'image'
                            }));
                            await updatePostWithMediaChildren(postDetailId, fallbackMedia);
                            console.log(`[SOCIAL POSTING API] Feed media error, storing ${fallbackMedia.length} original uploaded URLs as fallback`);
                          }
                        }
                      }

                      // Decrement refCount and delete files if needed
                      await decrementRefCountAndCleanup(mediaUrlId);
                    }
                  } catch (uerr: any) {
                    console.warn("[SOCIAL POSTING API] Failed to update PostDetails for instagram feed_story:", uerr.message);
                  }

                  if (firstComment && feedResult?.feed?.id) {
                    try {
                      await addInstagramComment(instagramData, feedResult.feed.id, firstComment);
                      console.log(`[SOCIAL POSTING API] First comment added to Instagram feed_story`);
                    } catch (commentError: any) {
                      console.warn(`[SOCIAL POSTING API] Failed to add first comment:`, commentError.message);
                    }
                  }
                } else if (postType === "reel") {
                  // create PostDetails record (processing)
                  if (!postDetailId) {
                    postDetailId = await createImmediatePostDetail({
                    companyId: companyId,
                    createdBy: null,
                    socialAccountId: account.modelId,
                    platform: "instagram",
                    postType: "reel",
                    caption: caption || null,
                    firstComment: firstComment || null,
                    taggedPeople: taggedPeopleList,
                    mediaUrlId, // Use mediaUrlId instead of media
                    initialStatus: "processing",
                    attempts: 0,
                    });
                    // Increment refCount for actual post
                    await incrementRefCount(mediaUrlId);
                  }
                  if (!postDetailId) {
                    console.warn("[SOCIAL POSTING API] Failed to ensure PostDetails for instagram reel: postDetailId is null");
                  }

                  const result = await addInstagramReel(instagramData, cdnUrls, caption, "VIDEO", taggedPeopleList, collaboratorsList);
                  results.push({ platform: "instagram", type: "reel", account: account.accountName, filesCount: cdnUrls.length, success: true, ...result });
                  console.log(`[SOCIAL POSTING API]  Instagram reel posted`);

                  // update PostDetails to published
                  try {
                    if (postDetailId) {
                      await updatePostDetail(postDetailId, {
                        status: "published",
                        externalPostId: result?.id || null,
                        publishedAt: new Date(),
                        attempts: Sequelize.literal("attempts + 1"),
                      });

                      // Fetch Instagram post children and update media
                      if (result?.id) {
                        try {
                          const mediaChildren = await getInstagramPostChildren(instagramData.token, result.id);
                          await updatePostWithMediaChildren(postDetailId, mediaChildren);
                          console.log(`[SOCIAL POSTING API] Updated post with ${mediaChildren.length} media children from Instagram`);
                        } catch (childError: any) {
                          console.warn(`[SOCIAL POSTING API] Failed to fetch Instagram post children:`, childError.message);
                          // Don't fail the post if children fetch fails - post was successful
                        }
                      }

                      // Decrement refCount and delete files if needed
                      await decrementRefCountAndCleanup(mediaUrlId);
                    }
                  } catch (uerr: any) {
                    console.warn("[SOCIAL POSTING API] Failed to update PostDetails for instagram reel:", uerr.message);
                  }

                  if (firstComment && result?.id) {
                    try {
                      await addInstagramComment(instagramData, result.id, firstComment);
                      console.log(`[SOCIAL POSTING API] First comment added to Instagram reel`);
                    } catch (commentError: any) {
                      console.warn(`[SOCIAL POSTING API] Failed to add first comment:`, commentError.message);
                    }
                  }
                } else if (postType === "carousel") {
                  // create PostDetails record (processing)
                  if (!postDetailId) {
                    postDetailId = await createImmediatePostDetail({
                    companyId: companyId,
                    createdBy: null,
                    socialAccountId: account.modelId,
                    platform: "instagram",
                    postType: "carousel",
                    caption: caption || null,
                    firstComment: firstComment || null,
                    taggedPeople: taggedPeopleList,
                    mediaUrlId, // Use mediaUrlId instead of media
                    initialStatus: "processing",
                    attempts: 0,
                    });
                    // Increment refCount for actual post
                    await incrementRefCount(mediaUrlId);
                  }
                  if (!postDetailId) {
                    console.warn("[SOCIAL POSTING API] Failed to ensure PostDetails for instagram carousel: postDetailId is null");
                  }

                  const result = await addInstagramPost(instagramData, cdnUrls, caption, mediaType, taggedPeopleList, collaboratorsList);
                  results.push({ platform: "instagram", type: "carousel", account: account.accountName, filesCount: cdnUrls.length, success: true, ...result });
                  console.log(`[SOCIAL POSTING API]  Instagram carousel posted`);

                  // update PostDetails to published
                  try {
                    if (postDetailId) {
                      await updatePostDetail(postDetailId, {
                        status: "published",
                        externalPostId: result?.id || null,
                        publishedAt: new Date(),
                        attempts: Sequelize.literal("attempts + 1"),
                      });

                      // Fetch Instagram post children and update media
                      if (result?.id) {
                        try {
                          const mediaChildren = await getInstagramPostChildren(instagramData.token, result.id);
                          await updatePostWithMediaChildren(postDetailId, mediaChildren);
                          console.log(`[SOCIAL POSTING API] Updated post with ${mediaChildren.length} media children from Instagram`);
                        } catch (childError: any) {
                          console.warn(`[SOCIAL POSTING API] Failed to fetch Instagram post children:`, childError.message);
                          // Don't fail the post if children fetch fails - post was successful
                        }
                      }

                      // Decrement refCount and delete files if needed
                      await decrementRefCountAndCleanup(mediaUrlId);
                    }
                  } catch (uerr: any) {
                    console.warn("[SOCIAL POSTING API] Failed to update PostDetails for instagram carousel:", uerr.message);
                  }

                  if (firstComment && result?.id) {
                    try {
                      await addInstagramComment(instagramData, result.id, firstComment);
                      console.log(`[SOCIAL POSTING API] First comment added to Instagram carousel`);
                    } catch (commentError: any) {
                      console.warn(`[SOCIAL POSTING API] Failed to add first comment:`, commentError.message);
                    }
                  }
                }
              }
              // ============ FACEBOOK ============
              else if (platform === "facebook") {
                console.log(`[SOCIAL POSTING API] Getting fresh Facebook page token for page ${account.accountId}...`);

                // Get fresh page access token from Facebook API
                let fbPageToken = account.storedPageAccessToken;
                try {
                  const freshToken = await getPageAccessToken(account.userAccessToken, account.accountId);
                  if (freshToken) {
                    fbPageToken = freshToken;
                    console.log(`[SOCIAL POSTING API]  Got fresh Facebook page token`);
                  } else {
                    console.warn(`[SOCIAL POSTING API] ⚠ Could not get fresh token, using stored token as fallback`);
                  }
                } catch (fbError: any) {
                  console.warn(`[SOCIAL POSTING API] ⚠ Error getting fresh FB token:`, fbError.message);
                }

                if (!fbPageToken) {
                  throw new Error(`No Facebook page token available for page ${account.accountId}`);
                }

                const facebookData = {
                  token: account.userAccessToken,
                  pageId: account.accountId,
                  pageAccessToken: fbPageToken
                };

                const mediaType = detectMediaType(files);

                // create PostDetails record (processing)
                if (!postDetailId) {
                  postDetailId = await createImmediatePostDetail({
                  companyId: companyId,
                  createdBy: null,
                  socialAccountId: account.modelId,
                  platform: "facebook",
                  postType: "feed",
                  caption: caption || null,
                  firstComment: firstComment || null,
                  taggedPeople: taggedPeopleList,
                  mediaUrlId, // Use mediaUrlId instead of media
                  initialStatus: "processing",
                  attempts: 0,
                  });
                  // Increment refCount for actual post
                  await incrementRefCount(mediaUrlId);
                }
                if (!postDetailId) {
                  console.warn("[SOCIAL POSTING API] Failed to ensure PostDetails for facebook: postDetailId is null");
                }

                const result = await addFacebookPost(facebookData, cdnUrls, caption, mediaType);
                results.push({
                  platform: "facebook",
                  type: "feed",
                  account: account.accountName,
                  filesCount: cdnUrls.length,
                  postId: result?.id || result?.post_id,
                  success: true,
                  ...result
                });
                console.log(`[SOCIAL POSTING API]  Facebook post created`);

                // Add first comment if provided
                if (firstComment && (result?.id || result?.post_id)) {
                  try {
                    const postId = result.id || result.post_id;
                    await addFacebookComment(postId, fbPageToken, firstComment);
                    console.log(`[SOCIAL POSTING API] First comment added to Facebook post`);
                  } catch (commentError: any) {
                    console.error(`[SOCIAL POSTING API] Failed to add first comment:`, commentError.message);
                  }
                }

                // update PostDetails to published
                try {
                  if (postDetailId) {
                    await updatePostDetail(postDetailId, {
                      status: "published",
                      externalPostId: result?.id || result?.post_id || null,
                      publishedAt: new Date(),
                      attempts: Sequelize.literal("attempts + 1"),
                    });

                    // Fetch Facebook post media and update PostDetails
                    if (result?.id || result?.post_id) {
                      try {
                        const facebookPostId = result.id || result.post_id;
                        let mediaChildren: any[] = [];

                        // For carousel/album posts (multiple images), try carousel children first
                        if (cdnUrls.length > 1 && mediaType === "IMAGE") {
                          try {
                            mediaChildren = await getFacebookCarouselChildren(fbPageToken, facebookPostId, account.accountId);
                            if (mediaChildren.length > 0) {
                              console.log(`[SOCIAL POSTING API] Fetched ${mediaChildren.length} images from Facebook carousel`);
                            }
                          } catch (carouselError: any) {
                            console.warn(`[SOCIAL POSTING API] Failed to fetch carousel children:`, carouselError.message);
                          }
                        }

                        // If carousel method didn't work or single media, try general media fetch
                        if (mediaChildren.length === 0) {
                          mediaChildren = await getFacebookPostMedia(fbPageToken, facebookPostId, account.accountId);
                        }

                        // Store media: prioritize Facebook URLs, fallback to original uploaded URLs if fetch failed
                        if (mediaChildren.length > 0) {
                          await updatePostWithMediaChildren(postDetailId, mediaChildren);
                          console.log(`[SOCIAL POSTING API] Stored ${mediaChildren.length} Facebook media URLs`);
                        } else if (cdnUrls.length > 0) {
                          // Fallback to original uploaded URLs if Facebook fetch failed
                          const fallbackMedia = cdnUrls.map((url, idx) => ({
                            id: `fallback_${idx}`,
                            url: url,
                            type: mediaType === "VIDEO" ? "video" : "image"
                          }));
                          await updatePostWithMediaChildren(postDetailId, fallbackMedia);
                          console.log(`[SOCIAL POSTING API] Facebook media fetch failed, storing ${fallbackMedia.length} original uploaded URLs as fallback`);
                        } else {
                          console.log(`[SOCIAL POSTING API] No Facebook media found, leaving media field empty`);
                        }
                      } catch (childError: any) {
                        console.warn(`[SOCIAL POSTING API] Failed to fetch Facebook post media:`, childError.message);
                        // Don't fail the post if media fetch fails - post was successful
                      }
                    }

                    // Decrement refCount and delete files if needed
                    await decrementRefCountAndCleanup(mediaUrlId);
                  }
                } catch (derr: any) {
                  console.warn("[SOCIAL POSTING API] Failed to update PostDetails for facebook:", derr.message);
                }
              }
              // ============ LINKEDIN ============
              else if (platform === "linkedin") {
                const linkedinCaption = cdnUrls.length > 0
                  ? `${caption || "Check this out!"}\n\n${cdnUrls.join('\n')}`
                  : (caption || "Check this out!");

                // create PostDetails record (processing)
                if (!postDetailId) {
                  postDetailId = await createImmediatePostDetail({
                  companyId: companyId,
                  createdBy: null,
                  socialAccountId: account.modelId,
                  platform: "linkedin",
                  postType: "feed",
                  caption: caption || null,
                  firstComment: firstComment || null,
                  taggedPeople: taggedPeopleList,
                  mediaUrlId, // Use mediaUrlId instead of media
                  initialStatus: "processing",
                  attempts: 0,
                  });
                  // Increment refCount for actual post
                  await incrementRefCount(mediaUrlId);
                }
                if (!postDetailId) {
                  console.warn("[SOCIAL POSTING API] Failed to ensure PostDetails for linkedin: postDetailId is null");
                }

                const result = await createLinkedInShare(account.accessToken, account.accountId, linkedinCaption);
                results.push({
                  platform: "linkedin",
                  type: "feed",
                  account: account.accountName,
                  success: true,
                  postId: result.id,
                  ...result
                });
                console.log(`[SOCIAL POSTING API]  LinkedIn post created`);

                // update PostDetails to published
                try {
                  if (postDetailId) {
                    await updatePostDetail(postDetailId, {
                      status: "published",
                      externalPostId: result?.id || null,
                      publishedAt: new Date(),
                      attempts: Sequelize.literal("attempts + 1"),
                    });
                    // Decrement refCount and delete files if needed
                    await decrementRefCountAndCleanup(mediaUrlId);
                  }
                } catch (derr: any) {
                  console.warn("[SOCIAL POSTING API] Failed to update PostDetails for linkedin:", derr.message);
                }
              }

              console.log(`[SOCIAL POSTING API]  Posted to ${platform} as ${postType}`);
            } catch (postError: any) {
              console.error(`[SOCIAL POSTING API] Failed to post ${postType} to ${platform}:`, postError.message);
              results.push({
                platform,
                type: postType,
                account: account.accountName,
                success: false,
                error: postError.message
              });

              // Update failed PostDetails record if we created one earlier, otherwise create a new failed record
              try {
                if (postDetailId) {
                  await updatePostDetail(postDetailId, {
                    status: "failed",
                    errorMessage: postError.message || String(postError),
                    attempts: Sequelize.literal("attempts + 1"),
                  });
                } else {
                  const createdFailedId = await createImmediatePostDetail({
                    companyId: companyId,
                    createdBy: null,
                    socialAccountId: account.modelId,
                    platform: platform as any,
                    postType: postType as any,
                    caption: caption || null,
                    firstComment: firstComment || null,
                    taggedPeople: taggedPeopleList,
                    mediaUrlId, // Use mediaUrlId instead of media
                    initialStatus: "failed",
                    externalPostId: null,
                    errorMessage: postError.message || String(postError),
                    attempts: 1,
                  });
                  if (!createdFailedId) {
                    console.warn("[SOCIAL POSTING API] Failed to create failed PostDetails for error case: createImmediatePostDetail returned null");
                  }
                }
              } catch (derr: any) {
                console.warn("[SOCIAL POSTING API] Failed to save/update failed PostDetails:", derr.message);
              }
            }
          }

          emitProgress({
            step: 'posted',
            message: `Successfully posted to ${platform}!`,
            progress: currentProgress + progressPerAccount,
            platform: platform
          });
        } catch (error: any) {
          console.error(`[SOCIAL POSTING API] Account error for ${platform}:`, error.message);
          results.push({
            platform,
            account: account.accountName,
            success: false,
            error: error.message
          });
          emitProgress({
            step: 'error',
            message: `Failed to post to ${platform}: ${error.message}`,
            progress: currentProgress + progressPerAccount,
            platform: platform
          });
        }

        currentProgress += progressPerAccount;
      }

      // Final progress update
      const successfulPosts = results.filter(r => r.success);
      const failedPosts = results.filter(r => !r.success);

      emitProgress({
        step: 'complete',
        message: `Publishing complete! ${successfulPosts.length} successful, ${failedPosts.length} failed`,
        progress: 100,
        platform: 'all',
        results: {
          successful: successfulPosts.length,
          failed: failedPosts.length
        }
      });

      console.log(`[SOCIAL POSTING API] Completed: ${successfulPosts.length} successful, ${failedPosts.length} failed`);

      if (!res.headersSent) {
        return res.json({
          success: failedPosts.length === 0,
          platforms: Array.from(platforms),
          filesCount: cdnUrls.length,
          totalPostsCreated: results.length,
          successfulPosts: successfulPosts.length,
          failedPosts: failedPosts.length,
          postingConfig,
          cdnUrls,
          data: results,
        });
      }
    } catch (error: any) {
      console.error("[SOCIAL POSTING API] Error:", error.message);
      emitProgress({
        step: 'error',
        message: `Publishing failed: ${error.message}`,
        progress: 0,
        platform: 'all'
      });
      throw error;
    }
  } catch (error: any) {
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: error?.response?.data?.error?.message || error.message,
      });
    } else {
      console.error('[SOCIAL POSTING API] Error after response sent:', error.message);
      return;
    }
  }
});

// ============ SCHEDULE POST ENDPOINTS ============

/**
 * POST /schedule-post
 * 
 * Upload files and schedule a post to be published at a specific time
 * Supports multiple platforms (destinations array)
 */
router.post("/schedule-post", upload.array("files", 10), async (req: Request, res: Response) => {
  try {
    const {
      companyId,
      createdBy,
      caption,
      firstComment,
      tagPeople,
      collaborators,
      socketId,
      destinations, // NEW: Array of platforms to post to
      // Legacy single-platform support
      assignedClientId,
      socialAccountId,
      platform,
      postType = "post",
    } = req.body;
    
    const files = req.files as Express.Multer.File[];

    // Parse tagPeople if it's a string and extract only usernames for Instagram
    let tagPeopleList: string[] = [];
    if (tagPeople) {
      try {
        let parsed = typeof tagPeople === 'string' ? JSON.parse(tagPeople) : tagPeople;
        if (Array.isArray(parsed)) {
          // Extract usernames from objects or use strings directly
          tagPeopleList = parsed.map((item: any) => {
            if (typeof item === 'string') return item;
            if (typeof item === 'object' && item.username) return item.username;
            return null;
          }).filter((username: string | null) => username);
        }
      } catch (e) {
        console.warn("[SCHEDULE-POST API] Failed to parse tagPeople");
        tagPeopleList = [];
      }
    }

    // Parse collaborators if it's a string and extract only usernames for Instagram
    let collaboratorsList: string[] = [];
    if (collaborators) {
      try {
        let parsed = typeof collaborators === 'string' ? JSON.parse(collaborators) : collaborators;
        if (Array.isArray(parsed)) {
          // Extract usernames from objects or use strings directly
          collaboratorsList = parsed.map((item: any) => {
            if (typeof item === 'string') return item;
            if (typeof item === 'object' && item.username) return item.username;
            return null;
          }).filter((username: string | null) => username);
        }
      } catch (e) {
        console.warn("[SCHEDULE-POST API] Failed to parse collaborators");
        collaboratorsList = [];
      }
    }

    // Get socket instance for progress updates
    const io = getIO();
    const emitProgress = (data: any) => {
      if (io && socketId) {
        io.to(socketId).emit('schedule:progress', data);
      }
    };

    // ============ VALIDATION ============
    const errors: string[] = [];

    if (!companyId) {
      errors.push("companyId is required");
    }

    if (!createdBy) {
      errors.push("createdBy (userId) is required");
    }

    if (!files || files.length === 0) {
      errors.push("At least one file is required");
    }

    // Parse destinations array (multi-platform support)
    let destinationsArray: any[] = [];

    if (destinations) {
      try {
        destinationsArray = typeof destinations === 'string' ? JSON.parse(destinations) : destinations;

        if (!Array.isArray(destinationsArray) || destinationsArray.length === 0) {
          errors.push("destinations must be a non-empty array");
        }
      } catch (e: any) {
        errors.push(`Failed to parse destinations: ${e.message}`);
      }
    } else if (socialAccountId && platform) {
      // Legacy single-platform mode
      destinationsArray = [{
        platform,
        socialAccountId,
        assignedClientId: assignedClientId || null,
        postType: postType || "post",
        destination: "feed",
      }];
    } else {
      errors.push("Either 'destinations' array or 'socialAccountId' + 'platform' is required");
    }

    // Validate each destination
    const validPostTypes: Record<string, string[]> = {
      instagram: ["feed", "story", "feed_story", "reel", "post", "carousel"],
      facebook: ["feed", "post"],
      linkedin: ["feed", "article"],
    };

    for (let i = 0; i < destinationsArray.length; i++) {
      const dest = destinationsArray[i];

      if (!dest.platform || !["facebook", "instagram", "linkedin"].includes(dest.platform)) {
        errors.push(`destinations[${i}].platform must be one of: facebook, instagram, linkedin`);
      }

      if (!dest.socialAccountId) {
        errors.push(`destinations[${i}].socialAccountId is required`);
      }

      const platformPostTypes = dest.platform ? validPostTypes[dest.platform] : [];
      if (!dest.postType || !platformPostTypes.includes(dest.postType)) {
        errors.push(`destinations[${i}].postType must be one of: ${platformPostTypes.join(", ")} for ${dest.platform}`);
      }

      // Normalize "post" to "feed"
      if (dest.postType === "post") {
        dest.postType = "feed";
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    try {
      // ============ UPLOAD FILES TO GITHUB CDN ============
      emitProgress({
        step: 'uploading',
        message: 'Uploading media files to CDN...',
        progress: 10,
        platform: 'all'
      });

      console.log(`[SCHEDULE-POST API] Starting to upload ${files.length} file(s) to CDN`);

      const mediaUrls: Array<{ url: string; type: any }> = [];
      const cdnUrls: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        try {
          const cdnUrl = await uploadToGitHub(file.path, "social-posts");

          if (cdnUrl) {
            // Determine media type
            const videoMimes = ["video/mp4", "video/quicktime", "video/mpeg", "video/webm", "video/x-msvideo", "video/x-ms-wmv"];
            const mediaType = videoMimes.includes(file.mimetype) ? "video" : "image";

            mediaUrls.push({
              url: cdnUrl,
              type: mediaType,
            });
            cdnUrls.push(cdnUrl);

            console.log(`[SCHEDULE-POST API] Uploaded file ${i + 1}/${files.length}:`, cdnUrl);
          }

          // Emit progress for each file upload
          emitProgress({
            step: 'uploading',
            message: `Uploaded file ${i + 1} of ${files.length}`,
            progress: 10 + Math.round(((i + 1) / files.length) * 20),
            platform: 'all'
          });
        } catch (uploadError: any) {
          console.error(`[SCHEDULE-POST API] Failed to upload file ${i + 1}:`, uploadError.message);
          errors.push(`Failed to upload file ${i + 1}: ${uploadError.message}`);
        }
      }

      if (mediaUrls.length === 0) {
        emitProgress({
          step: 'error',
          message: 'Failed to upload any files to CDN',
          progress: 0,
          platform: 'all'
        });
        return res.status(500).json({
          success: false,
          error: "Failed to upload files to CDN",
          errors,
        });
      }

      console.log(`[SCHEDULE-POST API] Successfully uploaded ${mediaUrls.length} file(s) to CDN`);

      // ============ CREATE POST MEDIA FILES RECORD ============
      let mediaUrlId: string;
      try {
        mediaUrlId = await createPostMediaFilesRecord(mediaUrls, destinationsArray.length);
        console.log(`[SCHEDULE-POST API] Created PostMediaFiles with ID: ${mediaUrlId}`);
      } catch (error: any) {
        console.error("[SCHEDULE-POST API] Failed to create PostMediaFiles:", error.message);
        return res.status(500).json({
          success: false,
          error: "Failed to store media files",
          details: error.message,
        });
      }

      // ============ VALIDATE SCHEDULE TIME ============
      const { scheduleAt } = req.body;
      let scheduledDate: Date | null = null;

      if (!scheduleAt) {
        errors.push("scheduleAt (ISO datetime in UTC) is required");
      } else if (typeof scheduleAt === 'string') {
        try {
          scheduledDate = new Date(scheduleAt);

          if (isNaN(scheduledDate.getTime())) {
            errors.push("scheduleAt must be a valid ISO datetime string (e.g., 2026-02-13T10:42:00.000Z)");
          } else {
            // Validate that the time is in the future (allowing 1 minute buffer for processing)
            const now = new Date();
            if (scheduledDate.getTime() < now.getTime() - 60000) {
              errors.push("Schedule time must be in the future");
            }

            console.log(`[SCHEDULE-POST API] Parsed scheduleAt (UTC): ${scheduledDate.toISOString()}`);
          }
        } catch (e: any) { 
          errors.push(`Failed to parse scheduleAt: ${e.message}`);
        }
      } else {
        errors.push("scheduleAt must be a string (ISO format: 2026-02-13T10:42:00.000Z)");
      }

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          errors,
        });
      }

      // Ensure scheduledDate is set (safeguard after validation)
      if (!scheduledDate) {
        return res.status(400).json({
          success: false,
          errors: ['Schedule date could not be determined'],
        });
      }

      // ============ SCHEDULE POST ============
      emitProgress({
        step: 'scheduling',
        message: `Scheduling post for ${destinationsArray.length} platform(s)...`,
        progress: 35,
        platform: 'all'
      });

      // Schedule post for EACH destination (multi-platform support)
      const scheduledPosts: any[] = [];

      for (let i = 0; i < destinationsArray.length; i++) {
        const dest = destinationsArray[i];

        console.log(`[SCHEDULE-POST API] Scheduling for platform ${i + 1}/${destinationsArray.length}:`, {
          platform: dest.platform,
          postType: dest.postType,
          socialAccountId: dest.socialAccountId,
        });

        try {
          const result = await schedulePost({
            companyId,
            createdBy: createdBy || null,
            assignedClientId: dest.assignedClientId ? parseInt(dest.assignedClientId) : null,
            socialAccountId: dest.socialAccountId,
            platform: dest.platform,
            postType: dest.postType,
            caption: caption || null,
            firstComment: firstComment || null,
            taggedPeople: tagPeopleList,
            collaborators: collaboratorsList,
            mediaUrlId, // Pass mediaUrlId instead of mediaUrls
            scheduleAt: scheduledDate,
          });

          scheduledPosts.push({
            platform: dest.platform,
            postType: dest.postType,
            postDetailId: result.postDetailId,
            postScheduleId: result.postScheduleId,
            scheduledFor: result.scheduledFor,
            success: true,
          });

          console.log(`[SCHEDULE-POST API]  Scheduled for ${dest.platform}: ${result.postDetailId}`);
        } catch (error: any) {
          console.error(`[SCHEDULE-POST API] Failed to schedule for ${dest.platform}:`, error.message);

          scheduledPosts.push({
            platform: dest.platform,
            postType: dest.postType,
            success: false,
            error: error.message,
          });
        }

        // Update progress
        emitProgress({
          step: 'scheduling',
          message: `Scheduled ${i + 1} of ${destinationsArray.length} platforms`,
          progress: 35 + Math.round(((i + 1) / destinationsArray.length) * 60),
          platform: dest.platform
        });
      }

      const successfulSchedules = scheduledPosts.filter(p => p.success);
      const failedSchedules = scheduledPosts.filter(p => !p.success);

      // ============ UPDATE POSTMEDIAFILES STATUS ============
      // Keep files on GitHub until worker successfully publishes and refCount reaches 0
      // Files will be deleted by decrementRefCountAndCleanup() after successful publish
      try {
        await updatePostMediaFilesStatus(mediaUrlId, 'scheduled');
      } catch (error: any) {
        console.warn(`[SCHEDULE-POST API] Failed to update PostMediaFiles status via handler:`, error.message);
      }

      emitProgress({
        step: 'complete',
        message: `Post scheduled for ${successfulSchedules.length}/${destinationsArray.length} platform(s)!`,
        progress: 100,
        platform: 'all',
        data: {
          scheduled: scheduledPosts,
          successful: successfulSchedules.length,
          failed: failedSchedules.length,
        }
      });

      console.log(`[SCHEDULE-POST API] Scheduling complete:`, {
        total: destinationsArray.length,
        successful: successfulSchedules.length,
        failed: failedSchedules.length,
        filesCount: mediaUrls.length,
        scheduledFor: scheduledDate.toISOString(),
      });

      return res.status(201).json({
        success: failedSchedules.length === 0,
        message: failedSchedules.length === 0
          ? `Post scheduled successfully for ${successfulSchedules.length} platform(s)`
          : `Post scheduled for ${successfulSchedules.length} platform(s), ${failedSchedules.length} failed`,
        data: {
          totalPlatforms: destinationsArray.length,
          successfulSchedules: successfulSchedules.length,
          failedSchedules: failedSchedules.length,
          scheduledFor: scheduledDate.toISOString(),
          filesCount: mediaUrls.length,
          posts: scheduledPosts,
        },
      });
    } catch (error: any) {
      console.error("[SCHEDULE-POST API] Error:", error.message);
      emitProgress({
        step: 'error',
        message: `Scheduling failed: ${error.message}`,
        progress: 0,
        platform: 'all'
      });
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to schedule post",
      });
    }
  } catch (error: any) {
    console.error("[SCHEDULE-POST API] Unexpected error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to schedule post",
    });
  }
});

/**
 * GET /social-accounts
 */
router.get("/social-accounts", async (req: Request, res: Response) => {
  try {
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: "companyId is required",
      });
    }

    const accounts = await getMetaSocialAccounts({ companyId: String(companyId) });

    return res.status(200).json({
      success: true,
      data: accounts,
    });
  } catch (error: any) {
    console.error("[SOCIAL-ACCOUNTS API] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch social accounts",
    });
  }
});

/**
 * GET /clients
 */
router.get("/clients", async (req: Request, res: Response) => {
  try {
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: "companyId is required",
      });
    }

    const result = await getAllAgencyClients({ companyId: String(companyId) });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("[CLIENTS API] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch clients",
    });
  }
});

/**
 * GET /scheduled-posts
 * Supports optional `clientId` query to filter posts assigned to a specific client.
 * Supports `status=all` to return posts of any status.
 */
router.get("/scheduled-posts", async (req: Request, res: Response) => {
  try {
    const { companyId, status, month, clientId } = req.query;

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'companyId is required' });
    }

    // Normalize status: treat 'all' as no status filter
    let statusParam: string | undefined = status ? String(status) : undefined;
    if (statusParam === 'all') statusParam = undefined;

    const posts = await getScheduledPosts({
      companyId: String(companyId),
      status: statusParam,
      month: month ? String(month) : undefined,
      clientId: clientId ? String(clientId) : undefined,
    });

    return res.status(200).json({ success: true, data: posts });
  } catch (error: any) {
    console.error("[SCHEDULED-POSTS API] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch scheduled posts",
    });
  }
});

/**
 * DELETE /scheduled-posts/:postDetailId
 */
router.delete("/scheduled-posts/:postDetailId", async (req: Request, res: Response) => {
  try {
    const { postDetailId } = req.params;
    const postId = Array.isArray(postDetailId) ? postDetailId[0] : postDetailId;
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: "companyId is required",
      });
    }
    try {
      await cancelScheduledPost(postDetailId as string, String(companyId));
      return res.status(200).json({ success: true, message: 'Post cancelled successfully' });
    } catch (err: any) {
      console.error('[CANCEL-POST API] Error cancelling via handler:', err.message);
      return res.status(400).json({ success: false, error: err.message });
    }
  } catch (error: any) {
    console.error("[CANCEL-POST API] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to cancel post",
    });
  }
});

/**
 * GET /published-post/:postDetailId
 * Get published post details with media and children
 */
router.get("/published-post/:postDetailId", async (req: Request, res: Response) => {
  try {
    const { postDetailId } = req.params;

    if (!postDetailId) {
      return res.status(400).json({
        success: false,
        error: "postDetailId is required"
      });
    }

    // Backward-compatible: accept optional filters via query params
    const { companyId, userId, clientId } = req.query;

    const postDetails = await getPublishedPostDetails(postDetailId as string);

    if (!postDetails) {
      return res.status(404).json({
        success: false,
        error: "Post not found"
      });
    }

    // If filters were provided, perform ownership checks; otherwise return the post directly
    if (companyId) {
      if (String(postDetails.companyId) !== String(companyId)) {
        return res.status(403).json({ success: false, error: 'Unauthorized: post does not belong to this company' });
      }
    }

    if (clientId) {
      const assignedClient = postDetails.socialAccount?.assignedClientId || null;
      if (!assignedClient || String(assignedClient) !== String(clientId)) {
        return res.status(403).json({ success: false, error: 'Unauthorized: post does not belong to this client' });
      }
    }

    return res.status(200).json({
      success: true,
      data: postDetails,
      message: "Post details retrieved successfully"
    });
  } catch (error: any) {
    console.error("[GET-PUBLISHED-POST API] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch post details"
    });
  }
});

/**
 * POST /published-post
 * Accepts JSON body with { postDetailId, companyId, userId, clientId } and returns the same data as GET
 */
router.post("/published-post", async (req: Request, res: Response) => {
  try {
    const { postDetailId, companyId, userId, clientId } = req.body;

    if (!postDetailId || !companyId || !userId || !clientId) {
      return res.status(400).json({ success: false, error: 'postDetailId, companyId, userId and clientId are required in body' });
    }

    const postDetails = await getPublishedPostDetails(String(postDetailId));

    if (!postDetails) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    if (String(postDetails.companyId) !== String(companyId)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: post does not belong to this company' });
    }

    const assignedClient = postDetails.socialAccount?.assignedClientId || null;
    if (!assignedClient || String(assignedClient) !== String(clientId)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: post does not belong to this client' });
    }

    return res.status(200).json({ success: true, data: postDetails, message: 'Post details retrieved successfully' });
  } catch (error: any) {
    console.error('[POST-PUBLISHED-POST API] Error:', error.message);
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch post details' });
  }
});

/**
 * POST /post-engagements
 * Body: { postDetailIds: string[] | string }
 * Returns likes/comments/views for each requested post
 */
router.post("/post-engagements", async (req: Request, res: Response) => {
  try {
    const { postDetailIds } = req.body;

    if (!postDetailIds) {
      return res.status(400).json({ success: false, error: 'postDetailIds is required in body' });
    }

    const ids = Array.isArray(postDetailIds) ? postDetailIds : [postDetailIds];

    const results = await fetchPostEngagements(ids);

    return res.status(200).json({ success: true, data: results });
  } catch (error: any) {
    console.error('[POST-ENGAGEMENTS API] Error:', error.message);
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch engagements' });
  }
});

/**
 * PUT /post/:postDetailId
 * Update editable fields for a post (caption, scheduled time, taggedPeople, assignedClientId, etc.)
 * Images/media are not updated via this endpoint.
 */
router.put('/post/:postDetailId', async (req: Request, res: Response) => {
  try {
    const { postDetailId } = req.params;
    const postId = Array.isArray(postDetailId) ? postDetailId[0] : postDetailId;
    const { companyId } = req.body;

    if (!postId || !companyId) {
      return res.status(400).json({ success: false, error: 'postDetailId and companyId are required' });
    }

    // Only allow specific updatable fields
    const allowed: any = {};
    const { caption, firstComment, scheduledAt, taggedPeople, assignedClientId, postType } = req.body;
    if (caption !== undefined) allowed.caption = caption;
    if (firstComment !== undefined) allowed.firstComment = firstComment;
    if (scheduledAt !== undefined) allowed.scheduledAt = scheduledAt;
    if (taggedPeople !== undefined) allowed.taggedPeople = taggedPeople;
    if (assignedClientId !== undefined) allowed.assignedClientId = assignedClientId;
    if (postType !== undefined) allowed.postType = postType;

    const success = await updatePostDetail(postId as string, allowed);
    if (!success) {
      return res.status(500).json({ success: false, error: 'Failed to update post' });
    }

    // If scheduledAt was updated, also update PostSchedule.runAt so the scheduler
    // picks up the new time and the GET response reflects the change.
    if (scheduledAt !== undefined) {
      try {
        await PostSchedule.update(
          { runAt: new Date(scheduledAt) },
          { where: { postDetailId: postId as string } }
        );
      } catch (schedErr: any) {
        console.warn('[UPDATE-POST API] Failed to update PostSchedule.runAt:', schedErr?.message || schedErr);
      }
    }

    return res.status(200).json({ success: true, message: 'Post updated' });
  } catch (error: any) {
    console.error('[UPDATE-POST API] Error:', error.message);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update post' });
  }
});

/**
 * DELETE /post/:postDetailId
 * Permanently delete a post and all its details ONLY if it's not published
 */
router.delete('/post/:postDetailId', async (req: Request, res: Response) => {
  try {
    const { postDetailId } = req.params;
    const postId = Array.isArray(postDetailId) ? postDetailId[0] : postDetailId;

    if (!postDetailId) {
      return res.status(400).json({ success: false, error: 'postDetailId is required' });
    }

    const result = await deletePostDetail(postId as string);
    
    if (!result.success) {
      return res.status(result.message === 'Cannot delete published posts' ? 403 : 500).json({ 
        success: false, 
        error: result.message 
      });
    }

    return res.status(200).json({ success: true, message: result.message });
  } catch (error: any) {
    console.error('[DELETE-POST API] Error:', error.message);
    return res.status(500).json({ success: false, error: error.message || 'Failed to delete post' });
  }
});


module.exports = router;