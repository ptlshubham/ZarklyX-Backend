import puppeteer, { Browser, Page } from 'puppeteer';

/**
 * Browser Pool Service
 * Manages a pool of Puppeteer browser instances for reuse
 * Reduces startup overhead from 3-5 seconds per analysis to milliseconds
 */
class BrowserPool {
  private pool: Browser[] = [];
  private maxPoolSize: number = 5;
  private minPoolSize: number = 1;
  private creatingBrowsers: Promise<Browser>[] = [];
  private isShuttingDown: boolean = false;

  constructor(maxSize: number = 5, minSize: number = 1) {
    this.maxPoolSize = maxSize;
    this.minPoolSize = minSize;
    this.initialize();
  }

  /**
   * Initialize the pool with minimum number of browsers
   */
  private async initialize(): Promise<void> {
    console.log(`🚀 Initializing browser pool (min: ${this.minPoolSize}, max: ${this.maxPoolSize})...`);
    
    try {
      // Pre-create minimum browsers
      const browsers = await Promise.all(
        Array(this.minPoolSize).fill(null).map(() => this.createBrowser())
      );
      this.pool.push(...browsers);
      console.log(`✅ Browser pool initialized with ${this.pool.length} browser(s)`);
    } catch (error) {
      console.error('❌ Failed to initialize browser pool:', error);
    }
  }

  /**
   * Create a new browser instance
   */
  private async createBrowser(): Promise<Browser> {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080',
        '--disable-web-security', // For CORS issues
      ],
    });

    // Handle browser disconnect
    browser.on('disconnected', () => {
      const index = this.pool.indexOf(browser);
      if (index > -1) {
        this.pool.splice(index, 1);
        console.log(`⚠️ Browser disconnected. Pool size: ${this.pool.length}`);
      }
    });

    return browser;
  }

  /**
   * Acquire a browser from the pool
   * If pool is empty, creates a new browser
   */
  async acquire(): Promise<Browser> {
    if (this.isShuttingDown) {
      throw new Error('Browser pool is shutting down');
    }

    // Check if we have available browsers
    if (this.pool.length > 0) {
      const browser = this.pool.pop()!;
      
      // Verify browser is still connected
      if (browser.isConnected()) {
        console.log(`📤 Browser acquired from pool. Remaining: ${this.pool.length}`);
        return browser;
      } else {
        console.log('⚠️ Browser in pool was disconnected, creating new one');
      }
    }

    // No available browsers, create a new one
    console.log(`📤 Pool empty, creating new browser. Pool size: ${this.pool.length}/${this.maxPoolSize}`);
    return await this.createBrowser();
  }

  /**
   * Release a browser back to the pool
   * If pool is full, closes the browser
   */
  async release(browser: Browser): Promise<void> {
    if (this.isShuttingDown) {
      await browser.close();
      return;
    }

    try {
      // Check if browser is still connected
      if (!browser.isConnected()) {
        console.log('⚠️ Attempted to release disconnected browser');
        return;
      }

      // Close all pages to clean up memory
      const pages = await browser.pages();
      await Promise.all(
        pages.slice(1).map(page => page.close()) // Keep first page (about:blank)
      );

      // If pool has space, return browser to pool
      if (this.pool.length < this.maxPoolSize) {
        this.pool.push(browser);
        console.log(`📥 Browser returned to pool. Pool size: ${this.pool.length}/${this.maxPoolSize}`);
      } else {
        // Pool is full, close the browser
        await browser.close();
        console.log(`🗑️ Pool full, browser closed. Pool size: ${this.pool.length}/${this.maxPoolSize}`);
      }
    } catch (error) {
      console.error('❌ Error releasing browser:', error);
      try {
        await browser.close();
      } catch (closeError) {
        // Ignore close errors
      }
    }
  }

  /**
   * Execute a function with a browser from the pool
   * Automatically handles acquire/release
   */
  async execute<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
    const browser = await this.acquire();
    try {
      const result = await fn(browser);
      await this.release(browser);
      return result;
    } catch (error) {
      // On error, close the browser (don't return to pool)
      try {
        await browser.close();
      } catch (closeError) {
        // Ignore close errors
      }
      throw error;
    }
  }

  /**
   * Execute a function with a page from a pooled browser
   * Automatically handles browser acquire/release and page creation/cleanup
   */
  async executeWithPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    return this.execute(async (browser) => {
      const page = await browser.newPage();
      try {
        const result = await fn(page);
        await page.close();
        return result;
      } catch (error) {
        await page.close();
        throw error;
      }
    });
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      available: this.pool.length,
      maxSize: this.maxPoolSize,
      minSize: this.minPoolSize,
      utilization: ((this.maxPoolSize - this.pool.length) / this.maxPoolSize) * 100,
    };
  }

  /**
   * Shutdown the pool and close all browsers
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down browser pool...');
    this.isShuttingDown = true;

    // Close all browsers in pool
    await Promise.all(
      this.pool.map(async (browser) => {
        try {
          await browser.close();
        } catch (error) {
          console.error('Error closing browser during shutdown:', error);
        }
      })
    );

    this.pool = [];
    console.log('✅ Browser pool shutdown complete');
  }

  /**
   * Health check - ensures pool has minimum browsers
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Remove disconnected browsers
      this.pool = this.pool.filter(browser => browser.isConnected());

      // Ensure we have minimum browsers
      while (this.pool.length < this.minPoolSize) {
        const browser = await this.createBrowser();
        this.pool.push(browser);
      }

      return true;
    } catch (error) {
      console.error('❌ Browser pool health check failed:', error);
      return false;
    }
  }
}

// Singleton instance
export const browserPool = new BrowserPool(5, 1);

// Cleanup on process exit
process.on('SIGINT', async () => {
  await browserPool.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await browserPool.shutdown();
  process.exit(0);
});

export default browserPool;
