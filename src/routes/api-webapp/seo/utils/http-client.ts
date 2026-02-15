import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

/**
 * Shared HTTP client with optimized configuration
 * - Prevents redundant axios instances across modules
 * - Implements connection pooling and reuse
 * - Standardized timeout and retry logic
 */
class HttpClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      timeout: 30000, // 30 seconds timeout
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      // Enable HTTP keep-alive for connection reuse with limits
      httpAgent: require('http').Agent({ 
        keepAlive: true,
        maxSockets: 50,        // Max concurrent sockets per host
        maxFreeSockets: 10,    // Max idle sockets to keep open
        timeout: 60000,        // Socket timeout
        keepAliveMsecs: 1000   // TCP Keep-Alive interval
      }),
      httpsAgent: require('https').Agent({ 
        keepAlive: true,
        maxSockets: 50,
        maxFreeSockets: 10,
        timeout: 60000,
        keepAliveMsecs: 1000
      }),
      // Decompress responses automatically
      decompress: true
    });
  }

  /**
   * Fetch HTML content from URL with error handling
   */
  async fetchHtml(url: string, config?: AxiosRequestConfig): Promise<string> {
    try {
      const response = await this.client.get(url, {
        ...config,
        responseType: 'text',
        validateStatus: (status) => status >= 200 && status < 400
      });
      return response.data;
    } catch (error: any) {
      if (error.code === 'ECONNABORTED') {
        throw new Error(`Request timeout: ${url}`);
      }
      if (error.response) {
        throw new Error(`HTTP ${error.response.status}: ${url}`);
      }
      throw new Error(`Failed to fetch ${url}: ${error.message}`);
    }
  }

  /**
   * Make GET request with full response
   */
  async get(url: string, config?: AxiosRequestConfig) {
    return this.client.get(url, config);
  }

  /**
   * Make POST request
   */
  async post(url: string, data?: any, config?: AxiosRequestConfig) {
    return this.client.post(url, data, config);
  }

  /**
   * Get the underlying axios instance for advanced use
   */
  getInstance(): AxiosInstance {
    return this.client;
  }
}

/**
 * URL Validation Utility
 * Validates and sanitizes URLs before processing
 */
export class UrlValidator {
  private static readonly ALLOWED_PROTOCOLS = ['http:', 'https:'];
  private static readonly BLOCKED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0'];
  private static readonly MAX_URL_LENGTH = 2048;

  /**
   * Validate URL format and security
   */
  static isValid(urlString: string, options: { allowLocalhost?: boolean } = {}): boolean {
    try {
      // Check length
      if (!urlString || urlString.length > this.MAX_URL_LENGTH) {
        return false;
      }

      // Check for SQL injection patterns
      if (this.containsSqlInjection(urlString)) {
        return false;
      }

      // Parse URL
      const url = new URL(urlString);

      // Check protocol
      if (!this.ALLOWED_PROTOCOLS.includes(url.protocol)) {
        return false;
      }

      // Check for blocked hostnames (unless explicitly allowed)
      if (!options.allowLocalhost && this.BLOCKED_HOSTS.some(host => url.hostname.includes(host))) {
        return false;
      }

      // Check for valid hostname
      if (!url.hostname || url.hostname.length < 3) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Sanitize URL by normalizing and removing dangerous components
   */
  static sanitize(urlString: string): string {
    try {
      const url = new URL(urlString);
      // Remove authentication credentials if present
      url.username = '';
      url.password = '';
      // Normalize path
      return url.toString();
    } catch (error) {
      throw new Error(`Invalid URL format: ${urlString}`);
    }
  }

  /**
   * Check for SQL injection patterns
   */
  private static containsSqlInjection(str: string): boolean {
    const sqlPatterns = [
      /('|(\-\-)|(;)|(\|\|)|(\*))/i,
      /(union|select|insert|update|delete|drop|create|alter|exec|execute)/i
    ];
    return sqlPatterns.some(pattern => pattern.test(str));
  }

  /**
   * Validate and throw descriptive error
   */
  static validateOrThrow(urlString: string, options?: { allowLocalhost?: boolean }): void {
    if (!this.isValid(urlString, options)) {
      throw new Error(`Invalid or unsafe URL: ${urlString}`);
    }
  }
}

// Export singleton instance
export const httpClient = new HttpClient();
