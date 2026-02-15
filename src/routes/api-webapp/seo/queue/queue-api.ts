/**
 * Job Queue Management API
 * 
 * Endpoints for managing SEO analysis job queues:
 * - Add jobs to queues
 * - Check job status
 * - Monitor queue statistics
 * - Pause/resume queues
 */

import { Router, Request, Response } from 'express';
import jobQueueService, { QueueName } from '../../../../services/job-queue.service';
import redisService from '../../../../services/redis.service';
import { optionalAuthMiddleware } from '../../../../middleware/auth.middleware';
import { validateUrl } from '../middleware/url-validation.middleware';

const router = Router();

// Apply optional authentication middleware to all routes
// If JWT token present: req.user will be populated
// If no token: req.user will be undefined (guest user)
router.use(optionalAuthMiddleware);

/**
 * POST /seo/queue/lighthouse
 * Queue a Lighthouse analysis job
 */
router.post('/lighthouse', validateUrl(), async (req: Request, res: Response) => {
  try {
    const { url, options, priority } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
      });
    }

    const job = await jobQueueService.addLighthouseJob(
      {
        url,
        options: options || {},
        requestId: req.headers['x-request-id'] as string,
      },
      priority || 0
    );

    if (!job) {
      return res.status(500).json({
        success: false,
        error: 'Failed to queue job',
      });
    }

    res.status(202).json({
      success: true,
      message: 'Job queued successfully',
      jobId: job.id,
      queue: QueueName.LIGHTHOUSE,
      url,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /seo/queue/security
 * Queue a Security analysis job
 */
router.post('/security', async (req: Request, res: Response) => {
  try {
    const { url, options, priority } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
      });
    }

    const job = await jobQueueService.addSecurityJob(
      {
        url,
        options: options || {},
        requestId: req.headers['x-request-id'] as string,
      },
      priority || 0
    );

    if (!job) {
      return res.status(500).json({
        success: false,
        error: 'Failed to queue job',
      });
    }

    res.status(202).json({
      success: true,
      message: 'Job queued successfully',
      jobId: job.id,
      queue: QueueName.SECURITY,
      url,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /seo/queue/tech-js
 * Queue a Tech-JS analysis job
 */
router.post('/tech-js', async (req: Request, res: Response) => {
  try {
    const { url, options, priority } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
      });
    }

    const job = await jobQueueService.addTechJsJob(
      {
        url,
        options: options || {},
        requestId: req.headers['x-request-id'] as string,
      },
      priority || 0
    );

    if (!job) {
      return res.status(500).json({
        success: false,
        error: 'Failed to queue job',
      });
    }

    res.status(202).json({
      success: true,
      message: 'Job queued successfully',
      jobId: job.id,
      queue: QueueName.TECH_JS,
      url,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /seo/queue/pagination
 * Queue a Pagination analysis job
 */
router.post('/pagination', async (req: Request, res: Response) => {
  try {
    const { url, options, priority } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
      });
    }

    const job = await jobQueueService.addPaginationJob(
      {
        url,
        options: options || {},
        requestId: req.headers['x-request-id'] as string,
      },
      priority || 0
    );

    if (!job) {
      return res.status(500).json({
        success: false,
        error: 'Failed to queue job',
      });
    }

    res.status(202).json({
      success: true,
      message: 'Job queued successfully',
      jobId: job.id,
      queue: QueueName.PAGINATION,
      url,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /seo/queue/comprehensive
 * Queue a Comprehensive SEO analysis job (all modules)
 * Returns immediately with jobId for real-time progress tracking via Socket.io
 */
router.post('/comprehensive', validateUrl(), async (req: Request, res: Response) => {
  try {
    const { url, options, priority, userId: bodyUserId, companyId: bodyCompanyId } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
      });
    }

    // Security: Prioritize JWT token data over request body
    // If user is authenticated (JWT present), use token data (can't be faked)
    // If guest user (no JWT), use body data or null
    const userId = (req.user as any)?.id || bodyUserId || null;
    const companyId = (req.user as any)?.companyId || bodyCompanyId || null;

    const job = await jobQueueService.addComprehensiveJob(
      {
        url,
        options: options || {},
        userId,
        companyId,
        requestId: req.headers['x-request-id'] as string,
      },
      priority || 0
    );

    if (!job) {
      return res.status(500).json({
        success: false,
        error: 'Failed to queue job',
      });
    }

    res.status(202).json({
      success: true,
      message: 'Comprehensive SEO analysis queued successfully',
      jobId: job.id,
      queue: QueueName.COMPREHENSIVE,
      url,
      info: {
        estimatedTime: '60-120 seconds',
        progressUpdates: 'Subscribe to Socket.io events',
        socketEvents: {
          progress: 'seo:progress',
          moduleComplete: 'seo:module:complete',
          complete: 'seo:complete',
          error: 'seo:error'
        },
        statusEndpoint: `/seo/queue/status/${job.id}`
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /seo/queue/batch
 * Queue a batch analysis job (multiple URLs, multiple analyses)
 */
router.post('/batch', async (req: Request, res: Response) => {
  try {
    const { urls, analyses, priority } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'URLs array is required',
      });
    }

    if (!analyses || !Array.isArray(analyses) || analyses.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Analyses array is required',
      });
    }

    const job = await jobQueueService.addBatchJob(
      {
        urls,
        analyses,
        requestId: req.headers['x-request-id'] as string,
      },
      priority || 0
    );

    if (!job) {
      return res.status(500).json({
        success: false,
        error: 'Failed to queue job',
      });
    }

    res.status(202).json({
      success: true,
      message: 'Batch job queued successfully',
      jobId: job.id,
      queue: QueueName.BATCH,
      urls: urls.length,
      analyses: analyses.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /seo/queue/job/:queue/:jobId
 * Get job status
 */
router.get('/job/:queue/:jobId', async (req: Request, res: Response) => {
  try {
    const { queue, jobId } = req.params;

    if (!Object.values(QueueName).includes(queue as QueueName)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid queue name',
      });
    }

    const status = await jobQueueService.getJobStatus(queue as QueueName, jobId as string);

    res.json({
      success: true,
      job: status,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /seo/queue/status/:jobId
 * Get job status (checks comprehensive queue by default, or searches all queues)
 * Simplified endpoint for frontend convenience
 */
router.get('/status/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    // Try comprehensive queue first (most common)
    let status = await jobQueueService.getJobStatus(QueueName.COMPREHENSIVE, jobId as string);

    // If not found in comprehensive, search all queues
    if (status.error === 'Job not found') {
      const queues = Object.values(QueueName);
      for (const queueName of queues) {
        status = await jobQueueService.getJobStatus(queueName as QueueName, jobId as string);
        if (!status.error) {
          status.queue = queueName; // Add queue name to response
          break;
        }
      }
    } else {
      status.queue = QueueName.COMPREHENSIVE;
    }

    if (status.error) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
        jobId,
      });
    }

    res.json({
      success: true,
      job: status,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /seo/queue/stats
 * Get statistics for all queues
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await jobQueueService.getAllStats();

    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /seo/queue/stats/:queue
 * Get statistics for a specific queue
 */
router.get('/stats/:queue', async (req: Request, res: Response) => {
  try {
    const { queue } = req.params;

    if (!Object.values(QueueName).includes(queue as QueueName)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid queue name',
      });
    }

    const stats = await jobQueueService.getQueueStats(queue as QueueName);

    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /seo/queue/pause/:queue
 * Pause a queue
 */
router.post('/pause/:queue', async (req: Request, res: Response) => {
  try {
    const { queue } = req.params;

    if (!Object.values(QueueName).includes(queue as QueueName)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid queue name',
      });
    }

    const result = await jobQueueService.pauseQueue(queue as QueueName);

    res.json({
      success: result,
      message: result ? 'Queue paused' : 'Failed to pause queue',
      queue,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /seo/queue/resume/:queue
 * Resume a queue
 */
router.post('/resume/:queue', async (req: Request, res: Response) => {
  try {
    const { queue } = req.params;

    if (!Object.values(QueueName).includes(queue as QueueName)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid queue name',
      });
    }

    const result = await jobQueueService.resumeQueue(queue as QueueName);

    res.json({
      success: result,
      message: result ? 'Queue resumed' : 'Failed to resume queue',
      queue,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /seo/queue/cache/stats
 * Get Redis cache statistics
 */
router.get('/cache/stats', async (req: Request, res: Response) => {
  try {
    const stats = await redisService.getStats();

    res.json({
      success: true,
      cache: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /seo/queue/cache/clear
 * Clear cache (optional pattern parameter)
 */
router.post('/cache/clear', async (req: Request, res: Response) => {
  try {
    const { pattern } = req.body;

    let deleted = 0;
    if (pattern) {
      deleted = await redisService.deletePattern(pattern);
    } else {
      const result = await redisService.flushAll();
      deleted = result ? -1 : 0;
    }

    res.json({
      success: true,
      message: pattern ? `Cleared ${deleted} cache keys` : 'Cache flushed',
      deleted: deleted === -1 ? 'all' : deleted,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
