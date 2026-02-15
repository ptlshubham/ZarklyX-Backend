/**
 * Job Queue Service using BullMQ
 * 
 * Provides background job processing for SEO analyses to:
 * - Offload long-running analysis tasks from HTTP requests
 * - Enable parallel processing of multiple analyses
 * - Provide job retry and failure handling
 * - Track job progress and status
 * 
 * Features:
 * - Multiple queues for different analysis types
 * - Configurable concurrency and priority
 * - Job retry with exponential backoff
 * - Progress tracking
 * - Job result storage
 * - Graceful shutdown
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import Redis from 'ioredis';

/**
 * Queue names for different analysis types
 */
export enum QueueName {
  LIGHTHOUSE = 'seo-lighthouse',
  SECURITY = 'seo-security',
  TECH_JS = 'seo-tech-js',
  PAGINATION = 'seo-pagination',
  ALL_ISSUES = 'seo-all-issues',
  BATCH = 'seo-batch',
  COMPREHENSIVE = 'seo-comprehensive',
}

/**
 * Job data interfaces
 */
export interface LighthouseJobData {
  url: string;
  options?: {
    category?: string[];
    strategy?: 'mobile' | 'desktop';
  };
  userId?: string;
  requestId?: string;
}

export interface SecurityJobData {
  url: string;
  options?: {
    deepScan?: boolean;
  };
  userId?: string;
  requestId?: string;
}

export interface TechJsJobData {
  url: string;
  options?: {
    detailed?: boolean;
  };
  userId?: string;
  requestId?: string;
}

export interface PaginationJobData {
  url: string;
  options?: {
    maxDepth?: number;
    maxPages?: number;
  };
  userId?: string;
  requestId?: string;
}

export interface BatchJobData {
  urls: string[];
  analyses: ('lighthouse' | 'security' | 'tech-js' | 'pagination')[];
  userId?: string;
  requestId?: string;
}

export interface ComprehensiveJobData {
  url: string;
  options?: {
    includeLighthouse?: boolean;
    includeKeywords?: boolean;
    includeResponsive?: boolean;
    includeSecurity?: boolean;
    includeTechJs?: boolean;
    includeAccessibility?: boolean;
    includePagination?: boolean;
    includeInternalSeo?: boolean;
    includeBacklinks?: boolean;
    includeSearchConsole?: boolean;
    includeAnalytics?: boolean;
  };
  userId?: string;
  companyId?: string;
  requestId?: string;
}

/**
 * Job options configuration
 */
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5000, // 5 seconds base delay
  },
  removeOnComplete: {
    age: 86400, // Remove completed jobs after 24 hours
    count: 100, // Keep last 100 completed jobs
  },
  removeOnFail: {
    age: 172800, // Remove failed jobs after 48 hours
    count: 50, // Keep last 50 failed jobs
  },
};

/**
 * Redis connection configuration for BullMQ
 */
const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
  maxRetriesPerRequest: null, // Required for BullMQ
};

/**
 * Job Queue Service
 * Manages multiple queues and workers for SEO analysis tasks
 */
class JobQueueService {
  private queues: Map<QueueName, Queue> = new Map();
  private workers: Map<QueueName, Worker> = new Map();
  private queueEvents: Map<QueueName, QueueEvents> = new Map();
  private isInitialized: boolean = false;

  /**
   * Initialize all queues
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('⚠️ JobQueue: Already initialized');
      return;
    }

    try {
      // Create queues
      for (const queueName of Object.values(QueueName)) {
        const queue = new Queue(queueName, {
          connection: redisConnection,
          defaultJobOptions: DEFAULT_JOB_OPTIONS,
        });

        this.queues.set(queueName as QueueName, queue);

        // Create queue events listener
        const queueEvents = new QueueEvents(queueName, {
          connection: redisConnection,
        });

        this.queueEvents.set(queueName as QueueName, queueEvents);

        // Set up event listeners
        this.setupQueueEventListeners(queueName as QueueName, queueEvents);
      }

      this.isInitialized = true;
      console.log('✅ JobQueue: All queues initialized successfully');
    } catch (error) {
      console.error('❌ JobQueue: Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Setup event listeners for queue monitoring
   */
  private setupQueueEventListeners(queueName: QueueName, queueEvents: QueueEvents): void {
    queueEvents.on('completed', ({ jobId, returnvalue }) => {
      console.log(`✅ JobQueue [${queueName}]: Job ${jobId} completed`);
    });

    queueEvents.on('failed', ({ jobId, failedReason }) => {
      console.error(`❌ JobQueue [${queueName}]: Job ${jobId} failed:`, failedReason);
    });

    queueEvents.on('progress', ({ jobId, data }) => {
      console.log(`📊 JobQueue [${queueName}]: Job ${jobId} progress:`, data);
    });

    queueEvents.on('waiting', ({ jobId }) => {
      console.log(`⏳ JobQueue [${queueName}]: Job ${jobId} waiting`);
    });

    queueEvents.on('active', ({ jobId }) => {
      console.log(`🔄 JobQueue [${queueName}]: Job ${jobId} active`);
    });
  }

  /**
   * Add a job to a specific queue
   */
  public async addJob<T>(
    queueName: QueueName,
    jobName: string,
    data: T,
    options?: {
      priority?: number;
      delay?: number;
      attempts?: number;
      jobId?: string;
    }
  ): Promise<Job<T> | null> {
    if (!this.isInitialized) {
      console.error('❌ JobQueue: Not initialized');
      return null;
    }

    const queue = this.queues.get(queueName);
    if (!queue) {
      console.error(`❌ JobQueue: Queue "${queueName}" not found`);
      return null;
    }

    try {
      const job = await queue.add(jobName, data, {
        ...DEFAULT_JOB_OPTIONS,
        ...options,
      });

      console.log(`✅ JobQueue [${queueName}]: Added job ${job.id} (${jobName})`);
      return job as Job<T>;
    } catch (error) {
      console.error(`❌ JobQueue [${queueName}]: Failed to add job:`, error);
      return null;
    }
  }

  /**
   * Add a Lighthouse analysis job
   */
  public async addLighthouseJob(data: LighthouseJobData, priority: number = 0): Promise<Job<LighthouseJobData> | null> {
    return this.addJob(QueueName.LIGHTHOUSE, 'analyze-lighthouse', data, { priority });
  }

  /**
   * Add a Security analysis job
   */
  public async addSecurityJob(data: SecurityJobData, priority: number = 0): Promise<Job<SecurityJobData> | null> {
    return this.addJob(QueueName.SECURITY, 'analyze-security', data, { priority });
  }

  /**
   * Add a Tech-JS analysis job
   */
  public async addTechJsJob(data: TechJsJobData, priority: number = 0): Promise<Job<TechJsJobData> | null> {
    return this.addJob(QueueName.TECH_JS, 'analyze-tech-js', data, { priority });
  }

  /**
   * Add a Pagination analysis job
   */
  public async addPaginationJob(data: PaginationJobData, priority: number = 0): Promise<Job<PaginationJobData> | null> {
    return this.addJob(QueueName.PAGINATION, 'analyze-pagination', data, { priority });
  }

  /**
   * Add a batch analysis job (multiple URLs, multiple analysis types)
   */
  public async addBatchJob(data: BatchJobData, priority: number = 0): Promise<Job<BatchJobData> | null> {
    return this.addJob(QueueName.BATCH, 'analyze-batch', data, { priority });
  }

  /**
   * Add a comprehensive analysis job (all SEO modules for one URL)
   */
  public async addComprehensiveJob(data: ComprehensiveJobData, priority: number = 0): Promise<Job<ComprehensiveJobData> | null> {
    return this.addJob(QueueName.COMPREHENSIVE, 'analyze-comprehensive', data, { priority });
  }

  /**
   * Get job status by ID
   */
  public async getJobStatus(queueName: QueueName, jobId: string): Promise<any> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      return { error: 'Queue not found' };
    }

    try {
      const job = await queue.getJob(jobId);
      if (!job) {
        return { error: 'Job not found' };
      }

      const state = await job.getState();
      const progress = job.progress;
      const returnvalue = job.returnvalue;
      const failedReason = job.failedReason;

      return {
        id: job.id,
        name: job.name,
        data: job.data,
        state,
        progress,
        result: returnvalue,
        error: failedReason,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        attemptsMade: job.attemptsMade,
      };
    } catch (error) {
      console.error(`❌ JobQueue: Failed to get job status:`, error);
      return { error: 'Failed to get job status' };
    }
  }

  /**
   * Get queue statistics
   */
  public async getQueueStats(queueName: QueueName): Promise<any> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      return { error: 'Queue not found' };
    }

    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);

      return {
        queue: queueName,
        waiting,
        active,
        completed,
        failed,
        delayed,
        total: waiting + active + completed + failed + delayed,
      };
    } catch (error) {
      console.error(`❌ JobQueue: Failed to get queue stats:`, error);
      return { error: 'Failed to get queue stats' };
    }
  }

  /**
   * Get all queue statistics
   */
  public async getAllStats(): Promise<any[]> {
    const stats = [];
    for (const queueName of this.queues.keys()) {
      const queueStats = await this.getQueueStats(queueName);
      stats.push(queueStats);
    }
    return stats;
  }

  /**
   * Pause a queue
   */
  public async pauseQueue(queueName: QueueName): Promise<boolean> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      console.error(`❌ JobQueue: Queue "${queueName}" not found`);
      return false;
    }

    try {
      await queue.pause();
      console.log(`⏸️ JobQueue [${queueName}]: Queue paused`);
      return true;
    } catch (error) {
      console.error(`❌ JobQueue: Failed to pause queue:`, error);
      return false;
    }
  }

  /**
   * Resume a queue
   */
  public async resumeQueue(queueName: QueueName): Promise<boolean> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      console.error(`❌ JobQueue: Queue "${queueName}" not found`);
      return false;
    }

    try {
      await queue.resume();
      console.log(`▶️ JobQueue [${queueName}]: Queue resumed`);
      return true;
    } catch (error) {
      console.error(`❌ JobQueue: Failed to resume queue:`, error);
      return false;
    }
  }

  /**
   * Clear all jobs from a queue
   */
  public async clearQueue(queueName: QueueName): Promise<boolean> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      console.error(`❌ JobQueue: Queue "${queueName}" not found`);
      return false;
    }

    try {
      await queue.drain();
      console.log(`🗑️ JobQueue [${queueName}]: Queue cleared`);
      return true;
    } catch (error) {
      console.error(`❌ JobQueue: Failed to clear queue:`, error);
      return false;
    }
  }

  /**
   * Register a worker for processing jobs
   */
  public registerWorker<T>(
    queueName: QueueName,
    processor: (job: Job<T>) => Promise<any>,
    options?: {
      concurrency?: number;
    }
  ): void {
    if (this.workers.has(queueName)) {
      console.warn(`⚠️ JobQueue: Worker for "${queueName}" already registered`);
      return;
    }

    const worker = new Worker(queueName, processor, {
      connection: redisConnection,
      concurrency: options?.concurrency || 5,
    });

    worker.on('completed', (job) => {
      console.log(`✅ Worker [${queueName}]: Completed job ${job.id}`);
    });

    worker.on('failed', (job, error) => {
      console.error(`❌ Worker [${queueName}]: Failed job ${job?.id}:`, error);
    });

    worker.on('error', (error) => {
      console.error(`❌ Worker [${queueName}]: Worker error:`, error);
    });

    this.workers.set(queueName, worker);
    console.log(`✅ JobQueue: Worker registered for "${queueName}" (concurrency: ${options?.concurrency || 5})`);
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    console.log('🔄 JobQueue: Shutting down...');

    // Close all workers
    for (const [queueName, worker] of this.workers.entries()) {
      try {
        await worker.close();
        console.log(`✅ JobQueue: Worker "${queueName}" closed`);
      } catch (error) {
        console.error(`❌ JobQueue: Error closing worker "${queueName}":`, error);
      }
    }

    // Close all queue events
    for (const [queueName, queueEvents] of this.queueEvents.entries()) {
      try {
        await queueEvents.close();
        console.log(`✅ JobQueue: QueueEvents "${queueName}" closed`);
      } catch (error) {
        console.error(`❌ JobQueue: Error closing QueueEvents "${queueName}":`, error);
      }
    }

    // Close all queues
    for (const [queueName, queue] of this.queues.entries()) {
      try {
        await queue.close();
        console.log(`✅ JobQueue: Queue "${queueName}" closed`);
      } catch (error) {
        console.error(`❌ JobQueue: Error closing queue "${queueName}":`, error);
      }
    }

    this.isInitialized = false;
    console.log('✅ JobQueue: Shutdown complete');
  }
}

// Export singleton instance
const jobQueueService = new JobQueueService();

// Graceful shutdown on process termination
process.on('SIGINT', async () => {
  await jobQueueService.shutdown();
});

process.on('SIGTERM', async () => {
  await jobQueueService.shutdown();
});

export default jobQueueService;
