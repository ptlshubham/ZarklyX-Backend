/**
 * Redis Service for Caching
 * 
 * Provides caching capabilities for SEO analysis results to improve performance
 * and reduce redundant API calls and browser automation.
 * 
 * Features:
 * - Connection management with auto-reconnect
 * - Key-value caching with TTL
 * - JSON serialization/deserialization
 * - Cache invalidation patterns
 * - Health monitoring
 * - Graceful shutdown
 */

import Redis from 'ioredis';

/**
 * Cache key prefixes for different analysis types
 */
export enum CachePrefix {
  LIGHTHOUSE = 'seo:lighthouse:',
  SECURITY = 'seo:security:',
  TECH_JS = 'seo:tech-js:',
  PAGINATION = 'seo:pagination:',
  KEYWORD = 'seo:keyword:',
  ALL_ISSUES = 'seo:all-issues:',
  COMPREHENSIVE = 'seo:comprehensive:',
}

/**
 * Default TTL values (in seconds)
 */
export const DEFAULT_TTL = {
  LIGHTHOUSE: 3600,      // 1 hour
  SECURITY: 1800,        // 30 minutes
  TECH_JS: 3600,         // 1 hour
  PAGINATION: 1800,      // 30 minutes
  KEYWORD: 7200,         // 2 hours
  ALL_ISSUES: 1800,      // 30 minutes
  COMPREHENSIVE: 1800,   // 30 minutes
  SHORT: 300,            // 5 minutes
  MEDIUM: 1800,          // 30 minutes
  LONG: 3600,            // 1 hour
  VERY_LONG: 86400,      // 24 hours
};

/**
 * Redis Cache Service
 * Singleton pattern for managing Redis connection
 */
class RedisService {
  private client: Redis | null = null;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize Redis connection
   */
  private initialize(): void {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0'),
      retryStrategy: (times: number) => {
        if (times > this.maxReconnectAttempts) {
          console.error('❌ Redis: Max reconnection attempts reached');
          return null;
        }
        const delay = Math.min(times * 100, 3000);
        console.log(`🔄 Redis: Reconnecting in ${delay}ms (attempt ${times}/${this.maxReconnectAttempts})`);
        return delay;
      },
      lazyConnect: true, // Don't connect immediately, wait for explicit connect()
    };

    try {
      this.client = new Redis(redisConfig);

      // Event handlers
      this.client.on('connect', () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        console.log('✅ Redis: Connected successfully');
      });

      this.client.on('ready', () => {
        console.log('✅ Redis: Ready to accept commands');
      });

      this.client.on('error', (error) => {
        this.isConnected = false;
        console.error('❌ Redis: Connection error:', error.message);
      });

      this.client.on('close', () => {
        this.isConnected = false;
        console.warn('⚠️ Redis: Connection closed');
      });

      this.client.on('reconnecting', () => {
        this.reconnectAttempts++;
        console.log(`🔄 Redis: Reconnecting (attempt ${this.reconnectAttempts})`);
      });

      // Attempt initial connection
      this.connect();
    } catch (error) {
      console.error('❌ Redis: Failed to initialize:', error);
    }
  }

  /**
   * Connect to Redis (gracefully handles failures)
   */
  private async connect(): Promise<void> {
    try {
      if (this.client && !this.isConnected) {
        await this.client.connect();
      }
    } catch (error) {
      console.error('❌ Redis: Failed to connect:', error);
      // Don't throw - allow app to run without Redis
    }
  }

  /**
   * Check if Redis is available
   */
  public isAvailable(): boolean {
    return this.client !== null && this.isConnected;
  }

  /**
   * Get a value from cache
   * @param key Cache key
   * @returns Parsed value or null
   */
  public async get<T = any>(key: string): Promise<T | null> {
    if (!this.isAvailable()) {
      console.warn('⚠️ Redis: Not available, skipping cache read');
      return null;
    }

    try {
      const value = await this.client!.get(key);
      if (!value) return null;

      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`❌ Redis: Failed to get key "${key}":`, error);
      return null;
    }
  }

  /**
   * Set a value in cache with TTL
   * @param key Cache key
   * @param value Value to cache (will be JSON stringified)
   * @param ttl Time to live in seconds (default: 1 hour)
   */
  public async set(key: string, value: any, ttl: number = DEFAULT_TTL.MEDIUM): Promise<boolean> {
    if (!this.isAvailable()) {
      console.warn('⚠️ Redis: Not available, skipping cache write');
      return false;
    }

    try {
      const serialized = JSON.stringify(value);
      await this.client!.setex(key, ttl, serialized);
      return true;
    } catch (error) {
      console.error(`❌ Redis: Failed to set key "${key}":`, error);
      return false;
    }
  }

  /**
   * Delete a specific key from cache
   * @param key Cache key
   */
  public async delete(key: string): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      await this.client!.del(key);
      return true;
    } catch (error) {
      console.error(`❌ Redis: Failed to delete key "${key}":`, error);
      return false;
    }
  }

  /**
   * Delete all keys matching a pattern
   * @param pattern Pattern to match (e.g., "seo:lighthouse:*")
   */
  public async deletePattern(pattern: string): Promise<number> {
    if (!this.isAvailable()) {
      return 0;
    }

    try {
      const keys = await this.client!.keys(pattern);
      if (keys.length === 0) return 0;

      await this.client!.del(...keys);
      console.log(`✅ Redis: Deleted ${keys.length} keys matching pattern "${pattern}"`);
      return keys.length;
    } catch (error) {
      console.error(`❌ Redis: Failed to delete pattern "${pattern}":`, error);
      return 0;
    }
  }

  /**
   * Check if a key exists in cache
   * @param key Cache key
   */
  public async exists(key: string): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const result = await this.client!.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`❌ Redis: Failed to check existence of key "${key}":`, error);
      return false;
    }
  }

  /**
   * Get TTL of a key
   * @param key Cache key
   * @returns TTL in seconds, or -1 if key has no expiry, or -2 if key doesn't exist
   */
  public async getTTL(key: string): Promise<number> {
    if (!this.isAvailable()) {
      return -2;
    }

    try {
      return await this.client!.ttl(key);
    } catch (error) {
      console.error(`❌ Redis: Failed to get TTL for key "${key}":`, error);
      return -2;
    }
  }

  /**
   * Extend TTL of an existing key
   * @param key Cache key
   * @param ttl New TTL in seconds
   */
  public async extendTTL(key: string, ttl: number): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      await this.client!.expire(key, ttl);
      return true;
    } catch (error) {
      console.error(`❌ Redis: Failed to extend TTL for key "${key}":`, error);
      return false;
    }
  }

  /**
   * Flush entire cache (use with caution!)
   */
  public async flushAll(): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      await this.client!.flushdb();
      console.log('✅ Redis: Cache flushed successfully');
      return true;
    } catch (error) {
      console.error('❌ Redis: Failed to flush cache:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  public async getStats(): Promise<{
    connected: boolean;
    keys: number;
    memory: string;
    uptime: number;
  } | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const info = await this.client!.info();
      const dbsize = await this.client!.dbsize();
      
      // Parse info string
      const lines = info.split('\r\n');
      const stats: any = {};
      lines.forEach(line => {
        const [key, value] = line.split(':');
        if (key && value) {
          stats[key] = value;
        }
      });

      return {
        connected: this.isConnected,
        keys: dbsize,
        memory: stats.used_memory_human || 'N/A',
        uptime: parseInt(stats.uptime_in_seconds) || 0,
      };
    } catch (error) {
      console.error('❌ Redis: Failed to get stats:', error);
      return null;
    }
  }

  /**
   * Graceful shutdown
   */
  public async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        console.log('✅ Redis: Disconnected gracefully');
      } catch (error) {
        console.error('❌ Redis: Error during disconnect:', error);
      }
    }
  }

  /**
   * Generate cache key with prefix
   * @param prefix Cache prefix
   * @param identifier Unique identifier (usually URL)
   * @param suffix Optional suffix (e.g., device type, options hash)
   */
  public static generateKey(prefix: CachePrefix, identifier: string, suffix?: string): string {
    const sanitized = identifier.replace(/[^a-zA-Z0-9-._]/g, '_');
    return suffix ? `${prefix}${sanitized}:${suffix}` : `${prefix}${sanitized}`;
  }
}

// Export singleton instance
const redisService = new RedisService();

// Graceful shutdown on process termination
process.on('SIGINT', async () => {
  await redisService.disconnect();
});

process.on('SIGTERM', async () => {
  await redisService.disconnect();
});

export default redisService;
export { RedisService };
