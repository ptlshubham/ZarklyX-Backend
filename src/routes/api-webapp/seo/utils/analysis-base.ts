import browserPool from '../../../../services/browser-pool.service';
import { Page } from 'puppeteer';

/**
 * Base class for SEO analysis operations that require browser automation
 * Provides common browser management patterns using the browser pool
 */
export class BrowserAnalyzer {
  protected timeout: number = 30000;

  /**
   * Execute analysis with automatic browser acquisition and release
   */
  protected async executeWithBrowser<T>(
    fn: (page: Page) => Promise<T>
  ): Promise<T> {
    return browserPool.executeWithPage(fn);
  }

  /**
   * Navigate to URL with standard settings
   */
  protected async navigateToUrl(page: Page, url: string): Promise<void> {
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: this.timeout,
    });
  }

  /**
   * Get page content with error handling
   */
  protected async getPageContent(page: Page): Promise<string> {
    return await page.content();
  }

  /**
   * Evaluate JavaScript in page context
   */
  protected async evaluateInPage<T>(
    page: Page,
    pageFunction: () => T
  ): Promise<T> {
    return await page.evaluate(pageFunction);
  }

  /**
   * Set viewport with standard responsive dimensions
   */
  protected async setStandardViewport(page: Page): Promise<void> {
    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
    });
  }

  /**
   * Set mobile viewport
   */
  protected async setMobileViewport(page: Page): Promise<void> {
    await page.setViewport({
      width: 375,
      height: 667,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
  }

  /**
   * Get headers from page response
   */
  protected async getResponseHeaders(
    page: Page,
    url: string
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};

    page.on('response', async (response) => {
      if (response.url() === url) {
        const responseHeaders = response.headers();
        Object.keys(responseHeaders).forEach((key) => {
          headers[key.toLowerCase()] = responseHeaders[key];
        });
      }
    });

    return headers;
  }
}

/**
 * Base class for save operations to database
 * Provides standardized error handling and logging
 */
export class AnalysisSaver {
  /**
   * Save analysis with standardized error handling
   */
  protected async saveWithErrorHandling<T>(
    modelName: string,
    url: string,
    saveFn: () => Promise<T>
  ): Promise<void> {
    try {
      await saveFn();
      console.log(`✅ ${modelName} analysis saved for URL: ${url}`);
    } catch (error) {
      console.error(`❌ Failed to save ${modelName} analysis:`, error);
      // Don't throw - we don't want to fail the analysis if saving fails
    }
  }

  /**
   * Parse and stringify JSON safely
   * Returns undefined for compatibility with Sequelize optional fields
   */
  protected safeStringify(data: any): string | undefined {
    if (!data) return undefined;
    try {
      return JSON.stringify(data);
    } catch (error) {
      console.error('Failed to stringify data:', error);
      return undefined;
    }
  }

  /**
   * Calculate score safely
   */
  protected calculateScore(passed: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((passed / total) * 100);
  }
}

/**
 * Common analysis metadata interface
 */
export interface AnalysisMetadata {
  url: string;
  timestamp: string;
  processingTime: string;
}

/**
 * Create standard analysis metadata
 */
export function createAnalysisMetadata(
  url: string,
  startTime: number
): AnalysisMetadata {
  const processingTime = Date.now() - startTime;
  return {
    url,
    timestamp: new Date().toISOString(),
    processingTime: `${processingTime}ms`,
  };
}

/**
 * Standard response format for all SEO analyses
 */
export interface StandardAnalysisResponse<T = any> {
  success: boolean;
  url: string;
  timestamp: string;
  processingTime: string;
  data?: T;
  error?: string;
}

/**
 * Create success response with metadata
 */
export function createAnalysisSuccessResponse<T>(
  url: string,
  startTime: number,
  data: T
): StandardAnalysisResponse<T> {
  return {
    success: true,
    ...createAnalysisMetadata(url, startTime),
    data,
  };
}

/**
 * Create error response with metadata
 */
export function createAnalysisErrorResponse(
  url: string,
  startTime: number,
  error: Error | string
): StandardAnalysisResponse {
  return {
    success: false,
    ...createAnalysisMetadata(url, startTime),
    error: typeof error === 'string' ? error : error.message,
  };
}

/**
 * ============================================================
 * CACHING UTILITIES
 * ============================================================
 * 
 * NOTE: Redis caching is now implemented directly in workers (seo-workers.ts)
 * using RedisService.generateKey() static method.
 * 
 * The CachedAnalysisSaver class was removed as it used incorrect patterns
 * and was never actually used in the codebase.
 * 
 * For caching implementation examples, see:
 * - src/routes/api-webapp/seo/workers/seo-workers.ts (comprehensiveWorker)
 * - src/services/redis.service.ts (RedisService class)
 */
