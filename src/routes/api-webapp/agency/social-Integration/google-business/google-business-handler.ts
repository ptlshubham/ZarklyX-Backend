import { SocialToken } from "../social-token.model";
import { GoogleBusinessAccount } from "./google-business-account.model";
import { getUserProfile } from "../../../../../services/business-profile-service";
import { executeWithRateLimit } from "../../../../../services/rate-limit.service";
import axios from "axios";

// Custom error class for GMB operations
export class GMBError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code: string = "INTERNAL_ERROR",
    public details?: any
  ) {
    super(message);
    this.name = "GMBError";
  }
}

// Cache management
const locationsCache = new Map<string, any>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours fresh cache
const STALE_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days stale fallback

/**
 * Get GMB connection status for a company
 * Verifies if tokens exist and are still valid
 * @param companyId - Company ID to check
 * @returns Connection status and user info if connected
 */
export const getGMBConnectionStatus = async (companyId: string) => {
  try {
    if (!companyId) {
      throw new Error("Missing companyId parameter");
    }

    // Get stored GMB tokens for this company
    const socialToken = await SocialToken.findOne({
      where: {
        companyId: companyId,
        provider: 'google-business'
      }
    });

    if (!socialToken || !socialToken.accessToken) {
      return {
        success: true,
        isConnected: false,
        message: "Google My Business is not connected for this company"
      };
    }

    // Verify token is still valid by checking user info
    try {
      const tokens: any = {};
      if (socialToken.accessToken) tokens.access_token = socialToken.accessToken;
      if (socialToken.refreshToken) tokens.refresh_token = socialToken.refreshToken;
      if (socialToken.expiryDate) tokens.expiry_date = socialToken.expiryDate;

      const userResponse = await getUserProfile(tokens);

      return {
        success: true,
        isConnected: true,
        gmbData: {
          email: userResponse?.email || socialToken.accountEmail || 'Unknown',
          name: userResponse?.displayName || socialToken.displayName || 'Unknown',
          picture: userResponse?.picture || null,
          accountId: socialToken.accountId || null,
          connectedAt: socialToken.createdAt
        }
      };
    } catch (tokenError: any) {
      console.warn("[GMB HANDLER] Token validation failed for company:", companyId, tokenError.message);
      
      return {
        success: true,
        isConnected: false,
        message: "Google My Business token expired. Please reconnect.",
        requiresReconnect: true
      };
    }
  } catch (error: any) {
    console.error("[GMB HANDLER] Error checking GMB connection:", error.message);
    throw error;
  }
};

/**
 * Create and publish a post to GMB location
 * @param companyId - Company ID
 * @param locationId - GMB location ID (with or without 'locations/' prefix)
 * @param message - Post message/summary
 * @param mediaUrl - Optional media URL
 * @param callToAction - Optional CTA config
 * @returns Post creation response with postId
 */
export const createGMBPost = async (
  companyId: string,
  locationId: string,
  message: string,
  mediaUrl?: string,
  callToAction?: any
) => {
  try {
    // Validation: Required fields
    if (!companyId || !locationId || !message) {
      throw new Error("Missing required fields: companyId, locationId, message");
    }

    // Get stored GMB tokens for company
    const socialToken = await SocialToken.findOne({
      where: {
        companyId: companyId,
        provider: 'google-business'
      }
    });

    if (!socialToken || !socialToken.accessToken) {
      const error: any = new Error("Google My Business is not connected for this company");
      error.statusCode = 401;
      error.code = "UNAUTHORIZED";
      throw error;
    }

    // Extract tokens from database
    const tokens: any = {};
    if (socialToken.accessToken) tokens.access_token = socialToken.accessToken;
    if (socialToken.refreshToken) tokens.refresh_token = socialToken.refreshToken;
    if (socialToken.expiryDate) tokens.expiry_date = socialToken.expiryDate;

    // Format location ID
    const locationIdStr = String(locationId);
    const formattedLocationId = locationIdStr.startsWith('locations/') 
      ? locationIdStr 
      : `locations/${locationIdStr}`;

    // Build post payload
    const postPayload: any = {
      languageCode: 'en',
      summary: message,
      callToAction: callToAction || {
        actionType: 'LEARN_MORE'
      }
    };

    // Add media if provided
    if (mediaUrl) {
      postPayload.media = [{
        mediaFormat: 'PHOTO',
        sourceUrl: mediaUrl
      }];
    }

    console.log("[GMB HANDLER] Creating post:", {
      companyId,
      locationId: formattedLocationId,
      hasMedia: !!mediaUrl
    });

    // Call API with rate limiting
    const postResponse = await executeWithRateLimit(
      'google-business',
      async () => {
        return await axios.post(
          `https://mybusinessbusinessinformation.googleapis.com/v1/${formattedLocationId}/localPosts`,
          postPayload,
          {
            headers: {
              'Authorization': `Bearer ${tokens.access_token}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );
      },
      {
        maxRetries: 1,
        initialDelayMs: 2000,
        maxDelayMs: 30000,
        backoffMultiplier: 2
      }
    );

    const responseData = (postResponse as any)?.data || {};
    const postId = responseData?.name || responseData?.id;

    console.log("[GMB HANDLER] ✅ Post created successfully:", {
      companyId,
      locationId: formattedLocationId,
      postId
    });

    return {
      success: true,
      data: {
        postId: postId,
        locationId: formattedLocationId,
        summary: message,
        createdAt: new Date().toISOString()
      },
      message: "Post published successfully to Google My Business"
    };
  } catch (error: any) {
    console.error("[GMB HANDLER] Error creating post:", {
      message: error.message,
      status: error.response?.status,
      code: error.code
    });

    // Re-throw with context
    error.handler = "createGMBPost";
    throw error;
  }
};

/**
 * Fetch all posts from a GMB location with caching
 * Returns fresh cache if available, otherwise calls API
 * Falls back to stale cache if rate limited
 * @param companyId - Company ID
 * @param locationId - GMB location ID
 * @param limit - Max posts to return (default 25, max 100)
 * @returns Posts array with caching metadata
 */
export const getGMBPosts = async (
  companyId: string,
  locationId: string,
  limit: number = 25
) => {
  try {
    // Validation
    if (!companyId || !locationId) {
      throw new Error("Missing required parameters: companyId, locationId");
    }

    // Cap limit at 100
    const pageSize = Math.min(limit, 100);

    // Get stored GMB tokens for company
    const socialToken = await SocialToken.findOne({
      where: {
        companyId: companyId,
        provider: 'google-business'
      }
    });

    if (!socialToken || !socialToken.accessToken) {
      const error: any = new Error("Google My Business is not connected for this company");
      error.statusCode = 401;
      error.code = "UNAUTHORIZED";
      throw error;
    }

    // Extract tokens from database
    const tokens: any = {};
    if (socialToken.accessToken) tokens.access_token = socialToken.accessToken;
    if (socialToken.refreshToken) tokens.refresh_token = socialToken.refreshToken;
    if (socialToken.expiryDate) tokens.expiry_date = socialToken.expiryDate;

    // Format location ID
    const locationIdStr = String(locationId);
    const formattedLocationId = locationIdStr.startsWith('locations/') 
      ? locationIdStr 
      : `locations/${locationIdStr}`;

    // Check cache first - ALWAYS return cached data if available
    const cacheKey = `posts_${formattedLocationId}_${companyId}`;
    const cached = locationsCache.get(cacheKey);
    const cacheAge = cached ? Date.now() - cached.timestamp : Infinity;
    const isCacheFresh = cached && cacheAge < CACHE_DURATION;
    const isCacheUsable = cached && cacheAge < STALE_CACHE_MAX_AGE;

    // STRATEGY: Return cached data immediately if available (even if old)
    // Then try to refresh in background if cache is stale
    if (isCacheUsable) {
      console.log(`[GMB HANDLER] Returning cached posts (${Math.round(cacheAge / 60000)} min old)`);
      
      return {
        success: true,
        data: cached.data || [],
        total: (cached.data || []).length,
        locationId: formattedLocationId,
        companyId: companyId,
        cached: true,
        stale: !isCacheFresh,
        cacheAge: cacheAge,
        message: isCacheFresh 
          ? `Fresh cached data (${Math.round(cacheAge / 60000)} min old)` 
          : `Stale cache - using old data to avoid rate limits (${Math.round(cacheAge / 3600000)} hours old)`
      };
    }

    // NO CACHE AVAILABLE - Must try API
    console.log('[GMB HANDLER] No cache available, calling API...');

    // Call API with rate limiting
    let postsResponse;
    try {
      postsResponse = await executeWithRateLimit(
        'google-business',
        async () => {
          return await axios.get(
            `https://mybusinessbusinessinformation.googleapis.com/v1/${formattedLocationId}/localPosts`,
            {
              headers: {
                'Authorization': `Bearer ${tokens.access_token}`,
                'Content-Type': 'application/json'
              },
              params: {
                pageSize: pageSize
              },
              timeout: 30000
            }
          );
        },
        {
          maxRetries: 1,
          initialDelayMs: 2000,
          maxDelayMs: 30000,
          backoffMultiplier: 2
        }
      );
    } catch (error: any) {
      // Handle rate limit
      if (error.code === 'RATE_LIMIT_EXCEEDED') {
        console.warn("[GMB HANDLER] Rate limit exceeded for company:", companyId);

        // Fallback to stale cache if available
        if (cached && cached.data) {
          const cacheAge = Date.now() - cached.timestamp;
          console.warn(`[GMB HANDLER] Returning stale cached posts (${Math.round(cacheAge / 1000)}s old)`);
          
          return {
            success: true,
            data: cached.data || [],
            total: (cached.data || []).length,
            locationId: formattedLocationId,
            companyId: companyId,
            cached: true,
            stale: true,
            cacheAge: cacheAge,
            message: `Rate limited - returning stale cache (${Math.round(cacheAge / 60000)} min old)`,
            warning: "This data may be outdated due to rate limiting"
          };
        }

        const rateLimitError: any = new Error("Rate limit exceeded. Please try again in 1-2 minutes.");
        rateLimitError.statusCode = 429;
        rateLimitError.code = "RATE_LIMIT_EXCEEDED";
        rateLimitError.retryAfter = 60;
        throw rateLimitError;
      }

      // Handle auth errors (token expired)
      if (error.response?.status === 401) {
        console.warn("[GMB HANDLER] Token expired for company:", companyId);
        const authError: any = new Error("Google My Business token expired. Please reconnect.");
        authError.statusCode = 401;
        authError.code = "UNAUTHORIZED";
        authError.requiresReconnect = true;
        throw authError;
      }

      throw error;
    }

    const posts = (postsResponse as any)?.data?.localPosts || [];

    // Store in cache
    locationsCache.set(cacheKey, {
      data: posts,
      timestamp: Date.now()
    });

    console.log("[GMB HANDLER] ✅ Posts fetched successfully:", {
      companyId,
      locationId: formattedLocationId,
      count: posts.length
    });

    return {
      success: true,
      data: posts,
      total: posts.length,
      locationId: formattedLocationId,
      companyId: companyId,
      nextPageToken: (postsResponse as any)?.data?.nextPageToken || null,
      cached: false,
      message: "Posts fetched from Google My Business and cached"
    };
  } catch (error: any) {
    console.error("[GMB HANDLER] Error fetching posts:", {
      message: error.message,
      status: error.response?.status,
      code: error.code
    });

    error.handler = "getGMBPosts";
    throw error;
  }
};

/**
 * Clear cache for a specific location or all posts cache
 * @param locationId - Optional location ID to clear specific cache
 * @returns Cache clear status
 */
export const clearGMBPostsCache = (locationId?: string) => {
  try {
    if (locationId) {
      // Clear specific location cache
      const cacheKeys = Array.from(locationsCache.keys())
        .filter(key => key.includes(locationId));
      
      cacheKeys.forEach(key => locationsCache.delete(key));
      
      console.log(`[GMB HANDLER] Cleared cache for location:`, locationId);
      return {
        success: true,
        cleared: cacheKeys.length,
        message: `Cleared ${cacheKeys.length} cache entries for location ${locationId}`
      };
    } else {
      // Clear all posts cache
      const totalSize = locationsCache.size;
      locationsCache.clear();
      
      console.log('[GMB HANDLER] Cleared all posts cache');
      return {
        success: true,
        cleared: totalSize,
        message: `Cleared all ${totalSize} cache entries`
      };
    }
  } catch (error: any) {
    console.error("[GMB HANDLER] Error clearing cache:", error.message);
    throw error;
  }
};

/**
 * Get cache status and statistics
 * @returns Cache statistics
 */
export const getGMBCacheStatus = () => {
  try {
    const entries = Array.from(locationsCache.entries()).map(([key, value]) => ({
      key,
      cacheAge: Math.round((Date.now() - value.timestamp) / 60000) + ' min',
      postsCount: (value.data || []).length,
      fresh: (Date.now() - value.timestamp) < CACHE_DURATION,
      usable: (Date.now() - value.timestamp) < STALE_CACHE_MAX_AGE
    }));

    return {
      success: true,
      totalEntries: locationsCache.size,
      entries: entries,
      cacheDurationMinutes: Math.round(CACHE_DURATION / 60000),
      staleCacheDurationHours: Math.round(STALE_CACHE_MAX_AGE / 3600000)
    };
  } catch (error: any) {
    console.error("[GMB HANDLER] Error getting cache status:", error.message);
    throw error;
  }
};

/**
 * Validate and format location ID
 * @param locationId - Location ID with or without 'locations/' prefix
 * @returns Formatted location ID with 'locations/' prefix
 */
export const formatLocationId = (locationId: string): string => {
  const locationIdStr = String(locationId);
  return locationIdStr.startsWith('locations/') 
    ? locationIdStr 
    : `locations/${locationIdStr}`;
};

/**
 * Extract and prepare tokens for API calls
 * @param socialToken - SocialToken database record
 * @returns Token object with access_token, refresh_token, expiry_date
 */
export const prepareGMBTokens = (socialToken: any): any => {
  const tokens: any = {};
  if (socialToken.accessToken) tokens.access_token = socialToken.accessToken;
  if (socialToken.refreshToken) tokens.refresh_token = socialToken.refreshToken;
  if (socialToken.expiryDate) tokens.expiry_date = socialToken.expiryDate;
  return tokens;
};


