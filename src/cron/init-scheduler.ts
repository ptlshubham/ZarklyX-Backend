/**
 * Post Scheduler Initialization
 * Initialize scheduler using node-cron (for embedded mode)
 */

import cron from 'node-cron';
import { Sequelize } from 'sequelize';
import { 
  runPostSchedulerWorker, 
  initializePostSchedulerWorker, 
  gracefulShutdown 
} from '../workers/post-scheduler.worker';

let cronJob: cron.ScheduledTask | null = null;

/**
 * Setup graceful shutdown handlers
 */
function setupShutdownHandlers() {
  const handleShutdown = async (signal: string) => {
    console.log(`[SCHEDULER] Received ${signal}, shutting down...`);
    
    if (cronJob) {
      cronJob.stop();
      console.log("[SCHEDULER] Cron job stopped");
    }
    
    await gracefulShutdown();
    
    setTimeout(() => {
      console.log("[SCHEDULER] Shutdown complete");
      process.exit(0);
    }, 2000);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  
  process.on('uncaughtException', async (err) => {
    console.error("[SCHEDULER] Uncaught exception:", err);
    if (cronJob) cronJob.stop();
    await gracefulShutdown();
    process.exit(1);
  });
  
  process.on('unhandledRejection', async (reason, promise) => {
    console.error("[SCHEDULER] Unhandled rejection at:", promise, "reason:", reason);
  });
}

/**
 * Initialize and start the post scheduler
 */
export async function initScheduler(
  sequelize: Sequelize,
  options?: {
    cronExpression?: string;
    timezone?: string;
    runImmediately?: boolean;
  }
): Promise<void> {
  try {
    console.log("[SCHEDULER] Initializing Post Scheduler...");
    
    setupShutdownHandlers();
    
    await initializePostSchedulerWorker();
    console.log("[SCHEDULER] ✓ Worker initialized");
    
    if (options?.runImmediately !== false) {
      console.log("[SCHEDULER] Running initial cycle...");
      await runPostSchedulerWorker(sequelize);
    }
    
    const cronExpression = options?.cronExpression || '* * * * *';
    const timezone = options?.timezone || 'UTC';
    
    cronJob = cron.schedule(cronExpression, async () => {
      try {
        await runPostSchedulerWorker(sequelize);
      } catch (err) {
        console.error("[SCHEDULER] Error in worker cycle:", err);
      }
    }, {
      scheduled: true,
      timezone
    });
    
    console.log(`[SCHEDULER] ✓ Cron job scheduled: ${cronExpression} (${timezone})`);
    console.log("[SCHEDULER] Post Scheduler is running!");
  } catch (err) {
    console.error("[SCHEDULER] Failed to initialize scheduler:", err);
    throw err;
  }
}

/**
 * Stop the scheduler
 */
export async function stopScheduler(): Promise<void> {
  if (cronJob) {
    cronJob.stop();
    console.log("[SCHEDULER] Cron job stopped");
  }
  await gracefulShutdown();
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): { running: boolean; cronJob: cron.ScheduledTask | null } {
  return { running: cronJob !== null, cronJob };
}
