/**
 * Rate Limit Service
 * Handles rate limiting with exponential backoff, caching, and request queuing
 * Specifically designed for Google My Business API
 */

interface RateLimitConfig {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

interface RateLimitState {
  remainingRequests: number;
  resetTime: number;
  retryAfter: number;
  quotaExhausted: boolean;
}

// Global rate limit tracking per provider
const rateLimitStates = new Map<string, RateLimitState>();
const requestQueues = new Map<string, any[]>();

// Default config for Google APIs
const DEFAULT_CONFIG: RateLimitConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,     // 1 second
  maxDelayMs: 60000,        // 60 seconds
  backoffMultiplier: 2,     // Exponential backoff
};

/**
 * Get current rate limit state for a provider
 */
export function getRateLimitState(provider: string): RateLimitState {
  return rateLimitStates.get(provider) || {
    remainingRequests: Infinity,
    resetTime: 0,
    retryAfter: 0,
    quotaExhausted: false,
  };
}

/**
 * Update rate limit state based on API response headers
 */
export function updateRateLimitState(
  provider: string,
  responseHeaders: any,
  statusCode: number
): void {
  const state = rateLimitStates.get(provider) || {
    remainingRequests: Infinity,
    resetTime: 0,
    retryAfter: 0,
    quotaExhausted: false,
  };

  // Check if we hit rate limit
  if (statusCode === 429) {
    // Extract retry-after header (in seconds)
    const retryAfter = parseInt(responseHeaders['retry-after'] || '60', 10);
    state.retryAfter = retryAfter;
    state.quotaExhausted = true;
    state.resetTime = Date.now() + retryAfter * 1000;

    console.warn(`[RATE-LIMIT] ${provider} hit rate limit. Retry after ${retryAfter}s`);
  } else {
    // Update remaining quota from headers if available
    const remaining = responseHeaders['x-ratelimit-remaining'];
    if (remaining !== undefined) {
      state.remainingRequests = parseInt(remaining, 10);
    }

    const resetTime = responseHeaders['x-ratelimit-reset'];
    if (resetTime !== undefined) {
      state.resetTime = parseInt(resetTime, 10) * 1000;
    }

    // If we're at 0 quota, mark as exhausted
    if (state.remainingRequests === 0) {
      state.quotaExhausted = true;
      console.warn(`[RATE-LIMIT] ${provider} quota exhausted (0 remaining)`);
    } else if (state.remainingRequests > 0) {
      state.quotaExhausted = false;
    }
  }

  rateLimitStates.set(provider, state);
}

/**
 * Check if we should wait before making a request
 */
export function shouldWaitBeforeRequest(provider: string): { should: boolean; waitMs: number } {
  const state = getRateLimitState(provider);

  if (!state.quotaExhausted) {
    return { should: false, waitMs: 0 };
  }

  const now = Date.now();
  const waitMs = Math.max(0, state.resetTime - now);

  return {
    should: waitMs > 0,
    waitMs,
  };
}

/**
 * Exponential backoff delay calculator
 */
function getBackoffDelay(
  attempt: number,
  config: RateLimitConfig = DEFAULT_CONFIG
): number {
  const initialDelay = config.initialDelayMs || DEFAULT_CONFIG.initialDelayMs!;
  const maxDelay = config.maxDelayMs || DEFAULT_CONFIG.maxDelayMs!;
  const multiplier = config.backoffMultiplier || DEFAULT_CONFIG.backoffMultiplier!;

  const delay = initialDelay * Math.pow(multiplier, attempt);
  return Math.min(delay, maxDelay);
}

/**
 * Add jitter to delay (±20%)
 */
function addJitter(delayMs: number): number {
  const jitterPercent = 0.2;
  const jitterAmount = delayMs * jitterPercent;
  return delayMs + (Math.random() * jitterAmount * 2 - jitterAmount);
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute API call with retry logic and rate limit handling
 */
export async function executeWithRateLimit<T>(
  provider: string,
  apiCall: () => Promise<{ data: T; headers: any }>,
  config: RateLimitConfig = DEFAULT_CONFIG
): Promise<T> {
  const maxRetries = config.maxRetries || DEFAULT_CONFIG.maxRetries!;
  let lastError: any = null;

  // Check if we need to wait due to rate limit
  const { should: shouldWait, waitMs } = shouldWaitBeforeRequest(provider);
  if (shouldWait) {
    console.warn(
      `[RATE-LIMIT] Waiting ${Math.ceil(waitMs / 1000)}s before requesting ${provider}`
    );
    await sleep(waitMs + 500); // Add 500ms buffer
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `[RATE-LIMIT] Attempt ${attempt + 1}/${maxRetries + 1} for ${provider}`
      );

      const response = await apiCall();

      // Update rate limit state from response headers
      updateRateLimitState(provider, response.headers, 200);

      return response.data;
    } catch (error: any) {
      lastError = error;

      const statusCode = error.response?.status;
      const responseHeaders = error.response?.headers || {};

      // Update rate limit state from error response
      updateRateLimitState(provider, responseHeaders, statusCode);

      if (statusCode === 429) {
        // Rate limited - this is expected
        if (attempt < maxRetries) {
          const retryAfter = parseInt(responseHeaders['retry-after'] || '60', 10);
          const backoffDelay = Math.max(
            getBackoffDelay(attempt, config),
            retryAfter * 1000
          );
          const delayWithJitter = addJitter(backoffDelay);

          console.warn(
            `[RATE-LIMIT] Got 429 on attempt ${attempt + 1}. Waiting ${Math.ceil(
              delayWithJitter / 1000
            )}s before retry`
          );
          await sleep(delayWithJitter);
          continue;
        } else {
          console.error(
            `[RATE-LIMIT] Failed after ${maxRetries + 1} attempts due to rate limit`
          );
          throw {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Rate limit exceeded. Please try again in 1-2 minutes.',
            retryAfter: parseInt(responseHeaders['retry-after'] || '60', 10),
            statusCode: 429,
          };
        }
      } else if (statusCode === 401 || statusCode === 403) {
        // Authentication/permission errors - don't retry
        throw error;
      } else if (statusCode >= 500) {
        // Server errors - retry with backoff
        if (attempt < maxRetries) {
          const backoffDelay = getBackoffDelay(attempt, config);
          const delayWithJitter = addJitter(backoffDelay);

          console.warn(
            `[RATE-LIMIT] Got ${statusCode} on attempt ${attempt + 1}. Waiting ${Math.ceil(
              delayWithJitter / 1000
            )}s before retry`
          );
          await sleep(delayWithJitter);
          continue;
        }
      }

      // If we're here and retries are exhausted, throw the last error
      if (attempt === maxRetries) {
        throw error;
      }
    }
  }

  throw lastError;
}

/**
 * Batch execute multiple API calls with rate limit awareness
 * Processes them sequentially to respect rate limits
 */
export async function executeBatchWithRateLimit<T>(
  provider: string,
  apiCalls: Array<() => Promise<{ data: T; headers: any }>>,
  delayBetweenCalls: number = 100,
  config: RateLimitConfig = DEFAULT_CONFIG
): Promise<T[]> {
  const results: T[] = [];

  for (let i = 0; i < apiCalls.length; i++) {
    const apiCall = apiCalls[i];

    try {
      const result = await executeWithRateLimit(provider, apiCall, config);
      results.push(result);

      // Add delay between calls to avoid hitting rate limit
      if (i < apiCalls.length - 1) {
        await sleep(delayBetweenCalls);
      }
    } catch (error) {
      console.error(`[RATE-LIMIT] Batch call ${i + 1} failed:`, error);
      throw error;
    }
  }

  return results;
}

/**
 * Get diagnostic info about rate limit state
 */
export function getDiagnostics(provider: string): {
  provider: string;
  isRateLimited: boolean;
  timeUntilReset: number;
  remainingRequests: number;
  recommendation: string;
} {
  const state = getRateLimitState(provider);
  const now = Date.now();
  const timeUntilReset = Math.max(0, state.resetTime - now);

  let recommendation = 'OK - Proceed with requests';
  if (state.quotaExhausted) {
    recommendation = `⚠️ RATE LIMITED - Wait ${Math.ceil(
      timeUntilReset / 1000
    )}s before retrying`;
  } else if (state.remainingRequests < 10 && state.remainingRequests !== Infinity) {
    recommendation = `⚠️ LOW QUOTA - Only ${state.remainingRequests} requests remaining`;
  }

  return {
    provider,
    isRateLimited: state.quotaExhausted,
    timeUntilReset: timeUntilReset,
    remainingRequests: state.remainingRequests,
    recommendation,
  };
}

/**
 * Reset rate limit state (useful for testing or manual resets)
 */
export function resetRateLimitState(provider: string): void {
  rateLimitStates.delete(provider);
  console.log(`[RATE-LIMIT] Reset rate limit state for ${provider}`);
}

/**
 * Clear all rate limit states
 */
export function clearAllRateLimitStates(): void {
  rateLimitStates.clear();
  console.log('[RATE-LIMIT] Cleared all rate limit states');
}

export default {
  getRateLimitState,
  updateRateLimitState,
  shouldWaitBeforeRequest,
  executeWithRateLimit,
  executeBatchWithRateLimit,
  getDiagnostics,
  resetRateLimitState,
  clearAllRateLimitStates,
};
