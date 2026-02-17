import axios from "axios";

function getRedirectUri() {
  return (
    process.env.INSTAGRAM_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/instagram/oauth2callback`
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

export function generateInstagramAuthUrl(scopes?: string[]) {
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

export async function exchangeInstagramCodeForTokens(code: string) {
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

export async function getPageAdminIgAccounts(accessToken: string) {
  const url = `https://graph.facebook.com/me?fields=id,name,email,accounts{id,name,category,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count}},businesses{id,name,picture{url},owned_pages{id,name,category,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count}}}`
  const res = await axios.get(url,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  return res.data;
}

function splitAccountsAndBusinesses(response: any) {
  const accounts = response?.accounts?.data || [];
  const businesses = response?.businesses?.data || [];

  const businessPageIds = new Set<string>();

  businesses.forEach((business: any) => {
    const ownedPages = business.owned_pages?.data || [];
    ownedPages.forEach((page: any) => {
      if (page?.id) {
        businessPageIds.add(page.id);
      }
    });
  });

  return accounts.filter((account: any) => {
    const hasInstagramBusiness = !!account.instagram_business_account;
    const isInBusiness = businessPageIds.has(account.id);
    return hasInstagramBusiness && !isInBusiness;
  });
}


function buildBusinessAccounts(response: any) {
  const businesses = response?.businesses?.data || [];

  return businesses
    .filter((business: any) => {
      const pages = business.owned_pages?.data || [];
      return pages.some((page: any) => page.instagram_business_account);
    })
    .map((business: any) => {
      const pages = business.owned_pages?.data || [];

      const igAccounts = pages
        .filter((page: any) => page.instagram_business_account)
        .map((page: any) => ({
          id: page.instagram_business_account.id,
          username: page.instagram_business_account.username,
          name: page.instagram_business_account.name || null,
          profile_pic: page.instagram_business_account.profile_picture_url,
          followers_count: page.instagram_business_account.followers_count,
          media_count: page.instagram_business_account.media_count || 0
        }));

      return {
        id: business.id,
        name: business.name,
        businessPic: business.picture?.data?.url || null,
        igAccounts
      };
    });
}

export async function getIgAccountsAndBusinesses(accessToken: string) {
  const url = `https://graph.facebook.com/me?fields=id,name,email,accounts{id,name,category,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}},businesses{id,name,picture{url},owned_pages{id,name,category,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}}}`;

  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const accounts = splitAccountsAndBusinesses(res.data);
  const businesses = buildBusinessAccounts(res.data);

  return {
    accounts,
    businesses
  };
}

export async function getAddedIgAccountDetails(accessToken: string, igAccounts: any[]) {
  const { accounts, businesses } = await getIgAccountsAndBusinesses(accessToken);

  const dbIgMap = new Map(
    igAccounts.map(acc => [acc.instagramBusinessId || acc.id, acc])
  );

  const result: any[] = [];
  const foundDbAccountIds = new Set<string>(); // Track found accounts

  // From direct Instagram accounts
  accounts.forEach((acc: any) => {
    const ig = acc.instagram_business_account;
    if (ig && dbIgMap.has(ig.id)) {
      const dbAcc = dbIgMap.get(ig.id);
      foundDbAccountIds.add(dbAcc.id); // Mark as found

      result.push({
        id: dbAcc.id,
        igId: ig.id,
        profilePic: ig.profile_picture_url,
        name: ig.name,
        username: ig.username,
        followersCount: ig.followers_count,
        mediaCount: ig.media_count || 0,
        accountType: "Page Admin",
        status: true, // Found in both DB and API
        assignedClientId: dbAcc?.assignedClientId || null,
        assignedClientName: dbAcc?.client
          ? `${dbAcc.client.clientfirstName} ${dbAcc.client.clientLastName}`
          : null,
        assignedClientPic: dbAcc?.client?.logo || null
      });
    }
  });

  // From Business Manager IG accounts
  businesses.forEach((business: any) => {
    business.igAccounts.forEach((ig: any) => {
      if (dbIgMap.has(ig.id)) {
        const dbAcc = dbIgMap.get(ig.id);
        foundDbAccountIds.add(dbAcc.id); // Mark as found

        result.push({
          id: dbAcc.id,
          igId: ig.id,
          profilePic: ig.profile_pic,
          name: ig.name,
          username: ig.username,
          followersCount: ig.followers_count || null,
          mediaCount: ig.media_count || 0,
          accountType: "Business Account",
          status: true, // Found in both DB and API
          assignedClientId: dbAcc?.assignedClientId || null,
          assignedClientName: dbAcc?.client
            ? `${dbAcc.client.clientfirstName} ${dbAcc.client.clientLastName}`
            : null,
          assignedClientPic: dbAcc?.client?.logo || null
        });
      }
    });
  });

  // Add DB accounts that were NOT found in API response with null API fields
  igAccounts.forEach((dbAcc: any) => {
    if (!foundDbAccountIds.has(dbAcc.id)) {
      result.push({
        id: dbAcc.id,
        igId: null,
        profilePic: null,
        name: null,
        username: dbAcc.accountName || null, // Use accountName from DB as username
        followersCount: null,
        mediaCount: null,
        accountType: null,
        status: false, // Found only in DB, not in API
        assignedClientId: dbAcc?.assignedClientId || null,
        assignedClientName: dbAcc?.client
          ? `${dbAcc.client.clientfirstName} ${dbAcc.client.clientLastName}`
          : null,
        assignedClientPic: dbAcc?.client?.logo || null
      });
    }
  });

  return result;
}

export async function getBusinessIgAccounts(accessToken: string) {
  const url = `https://graph.facebook.com/me?fields=id,name,emai,businesses{id,name,profile_picture_uri,owned_pages{instagram_business_account{id,username,profile_picture_url}}}`
  const res = await axios.get(url,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  return res.data;
}

export async function getFacebookUser(accessToken: string) {
  const url = `https://graph.facebook.com/me?fields=id,name,email` + `&access_token=${encodeURIComponent(accessToken)}`;
  const res = await axios.get(url);
  return res.data;
}

export async function fetchInstagramAccountDetails(
  instagramBusinessId: string,
  pageAccessToken: string
) {
  const url = `https://graph.facebook.com/v19.0/${instagramBusinessId}`;
  let response = null;
  try {
    response = await axios.get(url, {
      params: {
        fields: "id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website",
        access_token: pageAccessToken,
      },
    });
  } catch (error) {
    throw new Error("access token expire")
  }

  return response?.data || null;
}


type InstagramData = {
  token: string;
  platformUserId: string;
};

type PublishType = "feed" | "story" | "reel";
type MediaType = "IMAGE" | "VIDEO";

type CreatePublishParams = {
  igUserId: string;
  token: string;
  mediaUrl: string | string[]; // Supports both single and multiple media URLs
  caption?: string;
  mediaType?: MediaType;
  publishType?: PublishType;
  userTags?: any[];
};

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForVideoProcessing(
  token: string,
  containerId: string,
  timeout: number = 120000,
  isVideo: boolean = false
): Promise<boolean> {
  const start = Date.now();
  const checkInterval = isVideo ? 5000 : 3000; // Longer interval for videos

  while (Date.now() - start < timeout) {
    try {
      const res = await axios.get<any>(
        `https://graph.facebook.com/v19.0/${containerId}`,
        {
          params: {
            fields: "status_code",
            access_token: token
          }
        }
      );

      if (res.data.status_code === "FINISHED") {
        console.log("[INSTAGRAM SERVICE] Media processing finished");
        return true;
      }
      if (res.data.status_code === "ERROR") {
        console.error("[INSTAGRAM SERVICE] Media processing error detected");
        throw new Error("Media processing failed");
      }

    } catch (error: any) {
      if (error.message === "Media processing failed") throw error;
      // console.log("[INSTAGRAM SERVICE] Media status:", res.data.status_code);
    }

    await delay(checkInterval);
  }

  throw new Error("Media processing timeout");
}

async function createAndPublish({
  igUserId,
  token,
  mediaUrl,
  caption,
  mediaType = "IMAGE",
  publishType = "feed",
  userTags = []
}: CreatePublishParams): Promise<any> {
  const payload: any = { access_token: token };

  if (publishType === "story") payload.media_type = "STORIES";
  if (publishType === "reel") payload.media_type = "REELS";

  // Handle carousel/multiple images
  const urls = Array.isArray(mediaUrl) ? mediaUrl : [mediaUrl];

  // If multiple images with tags, post individually instead of carousel (carousel doesn't support tags)
  if (urls.length > 1 && userTags.length > 0 && publishType === "feed") {
    const results: any[] = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const result = await createAndPublish({
        igUserId,
        token,
        mediaUrl: url,
        caption: i === 0 ? caption : undefined, // Only add caption to first image
        mediaType,
        publishType,
        userTags: i === 0 ? userTags : [] // Only tag first image
      });

      results.push(result);
      if (i < urls.length - 1) {
        await delay(1000); // Delay between posts to avoid rate limiting
      }
    }

    return results.length > 0 ? results[0] : {}; // Return first result
  }

  if (urls.length > 1 && publishType === "feed") {
    // Create carousel post with mixed media (images and videos as separate items)
    // Instagram carousel supports up to 10 items, mix of images and videos
    const children: any[] = [];

    for (const url of urls) {
      // Detect if this URL is a video
      const isVideo = url.toLowerCase().includes('.mp4') ||
        url.toLowerCase().includes('.mov') ||
        url.toLowerCase().includes('.webm') ||
        url.toLowerCase().includes('.mpeg');

      const childPayload: any = {
        is_carousel_item: true, // Required for carousel child items
        access_token: token
      };

      // Set appropriate field based on media type
      if (isVideo) {
        childPayload.video_url = url;
        childPayload.media_type = "VIDEO"; // Must specify VIDEO for carousel video items
      } else {
        childPayload.image_url = url;
      }

      try {
        const childRes = await axios.post<any>(
          `https://graph.facebook.com/v19.0/${igUserId}/media`,
          childPayload
        );

        const childId = childRes.data.id;

        // Wait for video processing if it's a video
        if (isVideo) {
          await waitForVideoProcessing(token, childId, 120000, true);
        }

        children.push(childId);

        // Small delay between uploads
        await delay(500);
      } catch (error: any) {
        console.error("[INSTAGRAM SERVICE] Carousel media creation failed:", error.message);
        throw error;
      }
    }

    // Create carousel container
    const carouselPayload: any = {
      media_type: "CAROUSEL",
      children,
      access_token: token
    };

    if (caption) {
      carouselPayload.caption = caption;
    }

    try {
      const containerRes = await axios.post<any>(
        `https://graph.facebook.com/v19.0/${igUserId}/media`,
        carouselPayload
      );

      const containerId = containerRes.data.id;

      // Wait for carousel to be ready before publishing
      await waitForVideoProcessing(token, containerId);

      const publishRes = await axios.post<any>(
        `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
        {
          creation_id: containerId,
          access_token: token
        }
      );

      return publishRes.data;
    } catch (error: any) {
      throw error;
    }
  }

  // Single image/video post
  const mediaUr = urls[0];

  // Detect if single media is a video based on URL extension
  const isSingleVideo = mediaUr.toLowerCase().includes('.mp4') ||
    mediaUr.toLowerCase().includes('.mov') ||
    mediaUr.toLowerCase().includes('.webm') ||
    mediaUr.toLowerCase().includes('.mpeg');

  // For STORIES: Set the correct URL field based on actual media type
  if (publishType === "story") {
    if (isSingleVideo) {
      payload.video_url = mediaUr;
    } else {
      payload.image_url = mediaUr;
    }
    // media_type is already set to "STORIES" above
  } else if (isSingleVideo) {
    // For feed/reel with video
    payload.video_url = mediaUr;
    payload.media_type = "REELS";
  } else {
    // For feed with image
    payload.image_url = mediaUr;
  }

  if (caption && publishType !== "story") {
    // Sanitize caption - Instagram has 2,200 character limit
    let sanitizedCaption = caption;
    if (sanitizedCaption.length > 2200) {
      sanitizedCaption = sanitizedCaption.substring(0, 2197) + '...';
    }
    payload.caption = sanitizedCaption;
  }

  // Add user tags if provided (only for feed posts, not stories)
  // Note: Tags work for images and carousel posts, but NOT for single video REELS
  let tagStats = { requested: 0, allowed: 0, notAllowed: 0, reason: "" };

  const canApplyTags = userTags && userTags.length > 0 && publishType !== "story" && !isSingleVideo;

  // OPTIONAL: Tag people in the post (mention/tag people by username)
  // Uncomment the code below when you want to mention/tag people in your posts
  // Note: Instagram allows maximum 20 tags per post
  // Tags work for images and carousel posts, but NOT for single video REELS or STORIES
  /*
  if (userTags && userTags.length > 0 && publishType !== "story") {
    if (isSingleVideo) {
      tagStats.requested = userTags.length;
      tagStats.notAllowed = userTags.length;
      tagStats.reason = "Tags not supported for single video REELS";
      console.warn("[INSTAGRAM SERVICE] User tags not applied - Instagram REELS do not support user tags");
    } else {
      // Instagram allows maximum 20 tags per post
      const MAX_TAGS = 20;
      tagStats.requested = userTags.length;

      if (userTags.length > MAX_TAGS) {
        tagStats.notAllowed = userTags.length - MAX_TAGS;
        tagStats.reason = `Exceeded limit of ${MAX_TAGS} tags`;
        console.warn(`[INSTAGRAM SERVICE] Tag limit exceeded. Instagram allows max ${MAX_TAGS} tags. Using first ${MAX_TAGS} tags only. Skipped ${tagStats.notAllowed} tags.`);
      }

      const formattedTags = userTags
        .slice(0, MAX_TAGS) // Limit to MAX_TAGS
        .map((username: string) => {
          console.log("[INSTAGRAM SERVICE] Processing tag:", { username, position: { x: 0.5, y: 0.5 } });

          return {
            username: username,
            x: 0.5, // Default to center
            y: 0.5
          };
        }).filter((tag: any) => tag.username); // Filter out empty usernames

      tagStats.allowed = formattedTags.length;

      if (formattedTags.length > 0) {
        payload.user_tags = JSON.stringify(formattedTags);
        payload._tagStats = tagStats; // Attach for later use
        console.log("[INSTAGRAM SERVICE] User tags added to payload:", { count: formattedTags.length, maxAllowed: MAX_TAGS, tagStats, tags: formattedTags });
      }
    }
  }
  */

  // Add collaborators to the post (co-authors who will be credited)
  // Collaborators are different from tags - they are credited as co-authors on the post
  // Note: Instagram allows up to 5 collaborators per post
  if (userTags && userTags.length > 0 && publishType !== "story") {
    const MAX_COLLABS = 5;
    const safeCollaborators = userTags
      .slice(0, MAX_COLLABS)
      .filter((u: string) => typeof u === "string" && u.trim().length > 0);

    if (safeCollaborators.length > 0) {
      // First verify collaborators are accessible (optional - helps debug issues)
      // Uncomment if you want to pre-check collaborator accessibility
      /*
      try {
        const accessibleCollaborators: string[] = [];
        
        for (const username of safeCollaborators) {
          try {
            const igUsername = await searchInstagramUserByUsername(token, username.trim());
            if (igUsername) {
              accessibleCollaborators.push(username);
              console.log(`[INSTAGRAM SERVICE] Collaborator accessible: ${username}`);
            } else {
              console.warn(`[INSTAGRAM SERVICE] Collaborator not found or not accessible: ${username}`);
            }
          } catch (err) {
            console.warn(`[INSTAGRAM SERVICE] Failed to verify collaborator ${username}:`, err);
          }
        }
        
        if (accessibleCollaborators.length > 0) {
          payload.collaborators = JSON.stringify(accessibleCollaborators);
          console.log("[INSTAGRAM SERVICE] Collaborators (verified accessible) added from userTags:", {
            count: accessibleCollaborators.length,
            collaborators: accessibleCollaborators,
            skipped: safeCollaborators.length - accessibleCollaborators.length
          });
        } else {
          console.warn("[INSTAGRAM SERVICE] No accessible collaborators found");
        }
      } catch (verifyErr: any) {
        console.warn("[INSTAGRAM SERVICE] Collaborator verification skipped, proceeding with all:", safeCollaborators);
        payload.collaborators = JSON.stringify(safeCollaborators);
      }
      */
      
      // For now, use all collaborators as-is (Instagram will filter inaccessible ones)
      payload.collaborators = JSON.stringify(safeCollaborators);

      console.log("[INSTAGRAM SERVICE] Collaborators added from userTags:", {
        count: safeCollaborators.length,
        collaborators: safeCollaborators,
        CRITICAL_API_LIMITATION: "⚠️ Instagram Graph API ONLY accepts PUBLIC accounts as collaborators",
        api_restriction: "Even private accounts WITH mutual follow, collaboration enabled, and all permissions will be REJECTED by Instagram API",
        what_works: "Only PUBLIC accounts can be added as collaborators via API",
        workaround_options: [
          "Option 1: Ask collaborator to make their account PUBLIC (for collaboration)",
          "Option 2: Use USER TAGS instead of COLLABORATORS (different feature, allows private accounts)",
          "Option 3: Use only public accounts as collaborators"
        ],
        public_vs_private: {
          public_account: "✅ Will work as collaborator via API",
          private_account: "❌ Will be rejected with error 110 subcode 2207018, even with all conditions met",
          reason: "Instagram API enforces account privacy restrictions - private accounts cannot be co-authors via API"
        }
      });
    }
  }


  // Validate media URL is accessible
  try {
    const headCheck = await axios.head(mediaUr, { timeout: 5000 });
    if (headCheck.status !== 200) {
      throw new Error(`Media URL returned status ${headCheck.status}`);
    }
  } catch (urlError: any) {
    // URL validation failed, but continue with request
  }

  try {
    const containerRes = await axios.post<any>(
      `https://graph.facebook.com/v19.0/${igUserId}/media`,
      payload
    );

    const containerId: string = containerRes.data.id;
    // Wait for media to be ready - use longer timeout and different interval for videos
    await waitForVideoProcessing(token, containerId, mediaType === "VIDEO" ? 120000 : 90000, mediaType === "VIDEO");

    const publishRes = await axios.post<any>(
      `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
      {
        creation_id: containerId,
        access_token: token
      }
    );

    return publishRes.data;
  } catch (error: any) {
    // If image_url validation failed (error 9004), retry without it
    const errorCode = error.response?.data?.error?.code;
    const hasImageUrl = payload.image_url && payload.image_url.includes("placeholder");
    const hasUserTags = payload.user_tags && payload.user_tags.length > 0;
    const savedTagStats = payload._tagStats;

    // Handle image_url failure (placeholder image)
    if (hasImageUrl && errorCode === 9004) {

      // Remove placeholder image_url and retry
      delete payload.image_url;

      try {
        const retryContainerRes = await axios.post<any>(
          `https://graph.facebook.com/v19.0/${igUserId}/media`,
          payload
        );

        const containerId: string = retryContainerRes.data.id;

        await waitForVideoProcessing(token, containerId, mediaType === "VIDEO" ? 120000 : 90000, mediaType === "VIDEO");

        const publishRes = await axios.post<any>(
          `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
          {
            creation_id: containerId,
            access_token: token
          }
        );

        return publishRes.data;
      } catch (retryError: any) {
        throw retryError;
      }
    }

    const isCollaboratorError = error.response?.data?.error?.error_subcode === 2207018;
    const hasCollaborators = payload.collaborators !== undefined;
    
    if ((hasUserTags || (isCollaboratorError && hasCollaborators)) && errorCode === 110) {
      const errorType = isCollaboratorError ? "collaborators" : "tags";
      const failedItems = isCollaboratorError 
        ? JSON.parse(payload.collaborators || "[]")
        : JSON.parse(payload.user_tags);
      
      // For collaborator errors, try to identify which specific collaborators failed
      // Private accounts WITH follow relationship should work, so we need to be selective
      let collaboratorsToRemove = failedItems;
      let validCollaborators: any[] = [];
      
      if (isCollaboratorError && hasCollaborators) {
        const errorMsg = error.response?.data?.error?.error_user_msg || "";
        const allCollaborators = JSON.parse(payload.collaborators || "[]");
        const failedUsersMatch = errorMsg.match(/cannot be accessed:\s*(.+?)(?:\.|$)/);
        const failedUsernames = failedUsersMatch 
          ? failedUsersMatch[1].split(",").map((u: string) => u.trim().toLowerCase())
          : [];
        
        // Separate valid from invalid collaborators
        validCollaborators = failedUsernames.length > 0
          ? allCollaborators.filter((collab: any) => 
              !failedUsernames.includes(String(collab || "").toLowerCase())
            )
          : []; // If we can't parse, remove all (safer approach)
        
        if (validCollaborators.length > 0) {
          collaboratorsToRemove = validCollaborators;
        }
      }
      


      // Update payload based on what we're retrying with
      if (isCollaboratorError && validCollaborators.length > 0) {
        payload.collaborators = JSON.stringify(validCollaborators);
      } else {
        // Remove tags/collaborators and retry without them
        delete payload.user_tags;
        delete payload.collaborators;
      }
      delete payload._tagStats;

      try {
        const retryContainerRes = await axios.post<any>(
          `https://graph.facebook.com/v19.0/${igUserId}/media`,
          payload
        );

        const containerId: string = retryContainerRes.data.id;

        await waitForVideoProcessing(token, containerId, mediaType === "VIDEO" ? 120000 : 90000, mediaType === "VIDEO");

        const publishRes = await axios.post<any>(
          `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
          {
            creation_id: containerId,
            access_token: token
          }
        );

        return {
          ...publishRes.data,
          tagsApplied: false,
          tagsSkipped: true,
          collaboratorsApplied: validCollaborators.length > 0,
          collaboratorsSkipped: isCollaboratorError && validCollaborators.length < failedItems.length,
          reason: validCollaborators.length > 0 
            ? `Posted with ${validCollaborators.length} valid collaborators`
            : "Invalid or private account (no follow relationship)",
          failedItems: isCollaboratorError && validCollaborators.length > 0 ? failedItems : failedItems,
          validCollaborators,
          failureType: errorType,
          collaboratorDebugInfo: isCollaboratorError && validCollaborators.length === 0 ? {
            allAttemptedAccounts: failedItems,
            reason: "All collaborator accounts are either:",
            reasons: [
              "1. Personal accounts (must be Business/Creator accounts)",
              "2. Private with no follow relationship",
              "3. Have collaboration disabled in privacy settings",
              "4. Account restrictions or deactivation",
              "5. Invalid or non-existent username"
            ],
            solution: "Verify these accounts are Business/Creator accounts and ensure mutual follows exist"
          } : undefined,
          tagStats: { ...savedTagStats, applied: validCollaborators.length > 0 ? validCollaborators.length : 0, failed: failedItems.length }
        };
      } catch (retryError: any) {
        throw retryError;
      }
    }

    throw error;
  }

}

export async function addInstagramPost(
  instagramData: InstagramData,
  mediaUrl: string | string[],
  caption: string,
  mediaType: MediaType = "IMAGE",
  userTags: any[] = []
): Promise<any> {
  console.log("[INSTAGRAM SERVICE] Adding Instagram post...", { tagsCount: userTags.length });
  const result = await createAndPublish({
    igUserId: instagramData.platformUserId,
    token: instagramData.token,
    mediaUrl,
    caption,
    mediaType,
    publishType: "feed",
    userTags
  });
  console.log("[INSTAGRAM SERVICE] Instagram post added successfully");
  return result;
}

export async function addInstagramReel(
  instagramData: InstagramData,
  mediaUrl: string | string[],
  caption: string,
  mediaType: MediaType = "VIDEO",
  userTags: any[] = []
): Promise<any> {
  console.log("[INSTAGRAM SERVICE] Adding Instagram reel...", { tagsCount: userTags.length });
  const result = await createAndPublish({
    igUserId: instagramData.platformUserId,
    token: instagramData.token,
    mediaUrl,
    caption,
    mediaType,
    publishType: "reel",
    userTags
  });
  console.log("[INSTAGRAM SERVICE] Instagram reel added successfully");
  return result;
}

export async function addInstagramStory(
  instagramData: InstagramData,
  mediaUrl: string | string[],
  mediaType: MediaType = "IMAGE"
): Promise<any> {
  console.log("[INSTAGRAM SERVICE] Adding Instagram story/stories...");

  // Handle multiple stories
  const urls = Array.isArray(mediaUrl) ? mediaUrl : [mediaUrl];
  const results: any[] = [];

  for (let i = 0; i < urls.length; i++) {
    try {
      console.log(`[INSTAGRAM SERVICE] Uploading story ${i + 1} of ${urls.length}`);
      const result = await createAndPublish({
        igUserId: instagramData.platformUserId,
        token: instagramData.token,
        mediaUrl: urls[i],
        mediaType,
        publishType: "story"
      });
      results.push({ success: true, ...result });
      console.log(`[INSTAGRAM SERVICE] Instagram story ${i + 1} added successfully`);

      // Add delay between stories to avoid rate limiting
      if (i < urls.length - 1) {
        await delay(500);
      }
    } catch (error: any) {
      console.error(`[INSTAGRAM SERVICE] Failed to add story ${i + 1}:`, error.message);
      results.push({ success: false, error: error.message, index: i });
    }
  }

  // Return success if at least one story was added
  const successCount = results.filter((r: any) => r.success).length;
  if (successCount > 0) {
    return {
      success: true,
      storiesAdded: successCount,
      totalStories: urls.length,
      results
    };
  } else {
    throw new Error("Failed to add any stories");
  }
}

export async function addFeedAndStory(
  instagramData: InstagramData,
  mediaUrl: string | string[],
  caption: string,
  mediaType: MediaType = "IMAGE",
  userTags: any[] = []
): Promise<{ feed: any; story: any }> {
  const feed = await addInstagramPost(instagramData, mediaUrl, caption, mediaType, userTags);
  await delay(3000);

  // For stories, always use single images
  const storyUrls = Array.isArray(mediaUrl) ? mediaUrl : [mediaUrl];
  for (const url of storyUrls) {
    await addInstagramStory(instagramData, url, mediaType);
  }

  console.log("[INSTAGRAM SERVICE] Feed and story added successfully");
  return { feed, story: storyUrls.length };
}

export async function addInstagramComment(
  instagramData: InstagramData,
  mediaId: string,
  commentText: string
): Promise<any> {
  console.log("[INSTAGRAM SERVICE] Adding comment to Instagram post...");

  try {
    const url = `https://graph.facebook.com/v18.0/${mediaId}/comments`;

    const response = await axios.post(url, {
      message: commentText,
      access_token: instagramData.token
    });

    console.log("[INSTAGRAM SERVICE] Comment added successfully:", response.data);
    return response.data;
  } catch (error: any) {
    console.error("[INSTAGRAM SERVICE] Failed to add comment:", error.message);
    throw error;
  }
}

export async function searchInstagramUserByUsername(igBusinessId: string, username: string, accessToken: string) {
  // const fields = `
  //     business_discovery.username(${username}){
  //       followers_count,
  //       media_count,
  //       profile_picture_url,
  //       biography,
  //       username,
  //       media{
  //         caption,
  //         comments_count,
  //         like_count,
  //         media_type,
  //         media_url,
  //         timestamp
  //       }
  //     }
  //   `.replace(/\s+/g, ""); // remove spaces/newlines

    const fields = `
      business_discovery.username(${username}){
        followers_count,
        profile_picture_url,
        username,
        name
      }
    `.replace(/\s+/g, "");

  const url = `https://graph.facebook.com/v24.0/${igBusinessId}`;

  // Call Meta Graph API using axios with params like other functions
  const response = await axios.get(url, {
    params: {
      fields: fields,
      access_token: accessToken
    }
  });

  return response.data.business_discovery || null;
}

export async function checkInstagramAccountPermissions(
  token: string,
  igUserId: string
): Promise<any> {
  try {
    const response = await axios.get(
      `https://graph.instagram.com/v18.0/${igUserId}/`,
      {
        params: {
          fields: 'id,name,username,ig_metadata',
          access_token: token
        }
      }
    );

    console.log("[INSTAGRAM SERVICE] Account info:", response.data);
    return response.data;
  } catch (error: any) {
    console.error("[INSTAGRAM SERVICE] Failed to check account:", error.response?.data || error.message);
    throw error;
  }
}

/**
 * Fetch post details from Instagram Graph API
 * Returns post media (children/images) with URLs
 */
export async function getInstagramPostChildren(
  token: string,
  postId: string
): Promise<Array<{ url: string; type: any; id: string }>> {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/v19.0/${postId}`,
      {
        params: {
          fields: 'id,media_type,media_url,children{id,media_type,media_url}',
          access_token: token
        }
      }
    );

    const postData = response.data;
    const mediaItems: Array<{ url: string; type: any; id: string }> = [];

    // If it's a carousel, get all children
    if (postData.children && Array.isArray(postData.children.data)) {
      postData.children.data.forEach((child: any) => {
        if (child.media_url) {
          mediaItems.push({
            id: child.id,
            url: child.media_url,
            type: child.media_type === 'VIDEO' ? 'video' : 'image'
          });
        }
      });
    } else if (postData.media_url) {
      // Single image/video post
      mediaItems.push({
        id: postData.id,
        url: postData.media_url,
        type: postData.media_type === 'VIDEO' ? 'video' : 'image'
      });
    }

    console.log("[INSTAGRAM SERVICE] Fetched post children:", {
      postId,
      childrenCount: mediaItems.length,
      types: mediaItems.map(m => m.type)
    });

    return mediaItems;
  } catch (error: any) {
    console.error("[INSTAGRAM SERVICE] Failed to fetch post children:", {
      postId,
      error: error.response?.data || error.message
    });
    throw error;
  }
}

/**
 * Fetch story media details from Instagram Graph API
 * Gets all stories for a user/business account and filters recently created stories
 * @param token - Access token
 * @param igUserId - Instagram business account ID (user who posted the story)
 * @param createdAfterTimestamp - Only return stories created after this timestamp (helps filter to just-posted stories)
 * @param isStoryFeed - If true, only return feed URLs (for feed_story posts)
 */
export async function getInstagramStoryMedia(
  token: string,
  igUserId: string,
  createdAfterTimestamp?: number,
  isStoryFeed: boolean = false
): Promise<Array<{ url: string; type: any; id: string }>> {
  try {
    // Fetch all stories for this user/business account
    const response = await axios.get(
      `https://graph.facebook.com/v19.0/${igUserId}/stories`,
      {
        params: {
          fields: 'id,media_type,media_url,permalink,timestamp',
          access_token: token
        }
      }
    );

    const stories = response.data?.data || [];
    const mediaItems: Array<{ url: string; type: any; id: string }> = [];

    console.log("[INSTAGRAM SERVICE] Total stories fetched from API:", {
      igUserId,
      totalStoriesInResponse: stories.length,
      hasCreatedAfterTimestamp: !!createdAfterTimestamp,
      createdAfterTimestamp
    });

    if (Array.isArray(stories) && stories.length > 0) {
      stories.forEach((story: any, idx: number) => {
        const storyTimestamp = new Date(story.timestamp).getTime() / 1000;
        const isWithinTimeframe = !createdAfterTimestamp || storyTimestamp >= createdAfterTimestamp;

        console.log(`[INSTAGRAM SERVICE] Story ${idx + 1}:`, {
          storyId: story.id,
          timestamp: story.timestamp,
          timestampSeconds: storyTimestamp,
          withinTimeframe: isWithinTimeframe,
          hasMediaUrl: !!story.media_url,
          hasPermalink: !!story.permalink
        });

        // Filter by timestamp if provided (to get only recently created stories)
        if (createdAfterTimestamp && storyTimestamp < createdAfterTimestamp) {
          console.log(`[INSTAGRAM SERVICE] Skipping story ${story.id} - created before timestamp`);
          return; // Skip stories created before the timestamp
        }

        // For feed_story, only store feed URLs (skip story media)
        if (isStoryFeed) {
          if (story.permalink) {
            mediaItems.push({
              id: story.id,
              url: story.permalink,
              type: 'feed_url'
            });
          }
        } else {
          // For regular stories, store all media
          if (story.media_url) {
            mediaItems.push({
              id: story.id,
              url: story.media_url,
              type: story.media_type === 'VIDEO' ? 'video' : 'image'
            });
          }
        }
      });
    }

    console.log("[INSTAGRAM SERVICE] Fetched story media summary:", {
      igUserId,
      mediaCount: mediaItems.length,
      isStoryFeed,
      types: mediaItems.map(m => m.type),
      mediaIds: mediaItems.map(m => m.id)
    });

    return mediaItems;
  } catch (error: any) {
    console.warn("[INSTAGRAM SERVICE] Failed to fetch story media:", {
      igUserId,
      error: error.response?.data || error.message
    });
    // Don't throw, return empty array gracefully
    return [];
  }
}
