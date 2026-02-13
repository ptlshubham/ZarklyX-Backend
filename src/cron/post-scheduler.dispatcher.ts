#!/usr/bin/env ts-node

/**
 * Post Scheduler Dispatcher
 * Dynamically spawns workers based on pending post count
 * 
 * PRODUCTION FEATURES:
 * - File-based lock prevents overlapping cron executions
 * - Dynamic worker scaling (1-5 workers based on load)
 * - Partial failure tolerance (only fails if ALL workers fail)
 */

import { spawn } from 'child_process';
import { Op } from 'sequelize';
import fs from 'fs';
import path from 'path';
import { initControlDBConnection } from "../db/core/control-db";
import db from "../db/core/control-db";
import { PostSchedule } from "../routes/api-webapp/agency/social-Integration/social-posting/post-schedule.model";
import { PostDetails } from "../routes/api-webapp/agency/social-Integration/social-posting/post-details.model";

// Configuration
const BATCH_SIZE = 5;
const MAX_WORKERS = 5;
const MIN_WORKERS = 1;
const TIMEOUT_MS = 55000;
const WORKER_SCRIPT = 'dist/workers/post-scheduler.worker-runner.js';

/**
 * PRODUCTION FIX: File-based lock to prevent overlapping dispatcher runs
 * Using a lock file is simpler and more reliable than DB advisory locks
 * for this use case (cron running every minute)
 */
const LOCK_FILE = path.join(process.cwd(), 'tmp', 'dispatcher.lock');
const LOCK_TIMEOUT_MS = 60000; // Lock expires after 60 seconds (safety net)

interface WorkerResult {
  workerId: string;
  success: boolean;
  exitCode: number | null;
  duration: number;
}

/**
 * PRODUCTION FIX: Acquire file lock to prevent overlapping runs
 * Returns true if lock acquired, false if another process holds the lock
 */
function acquireLock(): boolean {
  try {
    // Ensure tmp directory exists
    const tmpDir = path.dirname(LOCK_FILE);
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Check if lock file exists
    if (fs.existsSync(LOCK_FILE)) {
      const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
      const lockAge = Date.now() - lockData.timestamp;
      
      // If lock is stale (older than timeout), remove it
      if (lockAge > LOCK_TIMEOUT_MS) {
        console.log(`[DISPATCHER] Stale lock detected (${Math.round(lockAge / 1000)}s old), removing...`);
        fs.unlinkSync(LOCK_FILE);
      } else {
        // Lock is still valid, skip this run
        console.log(`[DISPATCHER] Another dispatcher is running (PID: ${lockData.pid}), skipping...`);
        return false;
      }
    }

    // Create lock file
    fs.writeFileSync(LOCK_FILE, JSON.stringify({
      pid: process.pid,
      timestamp: Date.now(),
      startedAt: new Date().toISOString(),
    }));

    return true;
  } catch (error: any) {
    console.error(`[DISPATCHER] Lock acquisition error:`, error.message);
    return false;
  }
}

/**
 * Release file lock
 */
function releaseLock(): void {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch (error: any) {
    console.error(`[DISPATCHER] Lock release error:`, error.message);
  }
}

/**
 * Count pending posts due to run
 * 
 * PRODUCTION FIX: Only count scheduled posts (exclude immediate posts)
 * This ensures dispatcher only spawns workers for scheduled posts
 */
async function countPendingPosts(): Promise<number> {
  try {
    return await PostSchedule.count({
      where: {
        status: "pending",
        runAt: { [Op.lte]: new Date() },
      },
      include: [
        {
          model: PostDetails,
          as: "postDetail",
          where: {
            isImmediatelyPublished: false,
          },
          attributes: [], // Don't need any fields, just the join condition
        },
      ],
    });
  } catch (error: any) {
    console.error("[DISPATCHER] Error counting pending posts:", error.message);
    throw error;
  }
}

/**
 * Calculate optimal worker count
 */
function calculateWorkerCount(pending: number): number {
  if (pending === 0) return 0;
  
  const optimal = Math.ceil(pending / BATCH_SIZE);
  const capped = Math.min(optimal, MAX_WORKERS);
  return Math.max(capped, MIN_WORKERS);
}

/**
 * Spawn a single ephemeral worker
 */
function spawnWorker(workerId: string): Promise<WorkerResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    console.log(`[DISPATCHER] Spawning worker: ${workerId}`);
    
    const workerProcess = spawn('node', [WORKER_SCRIPT], {
      stdio: 'inherit',
      env: {
        ...process.env,
        WORKER_ID: workerId,
        IS_EPHEMERAL_WORKER: 'true',
      },
    });
    
    workerProcess.on('exit', (code, signal) => {
      const duration = Date.now() - startTime;
      
      if (code === 0) {
        console.log(`[DISPATCHER] Worker ${workerId} completed (${duration}ms)`);
        resolve({ workerId, success: true, exitCode: code, duration });
      } else {
        console.error(`[DISPATCHER] Worker ${workerId} failed with code ${code} (${duration}ms)`);
        resolve({ workerId, success: false, exitCode: code, duration });
      }
    });
    
    workerProcess.on('error', (error) => {
      const duration = Date.now() - startTime;
      console.error(`[DISPATCHER] Worker ${workerId} error:`, error.message);
      resolve({ workerId, success: false, exitCode: null, duration });
    });
  });
}

/**
 * Spawn multiple workers
 */
async function spawnWorkers(workerCount: number): Promise<WorkerResult[]> {
  console.log(`[DISPATCHER] Spawning ${workerCount} workers...`);
  
  const timestamp = Date.now();
  const workerPromises: Promise<WorkerResult>[] = [];
  
  for (let i = 1; i <= workerCount; i++) {
    const workerId = `worker-${timestamp}-${i}`;
    workerPromises.push(spawnWorker(workerId));
  }
  
  return await Promise.all(workerPromises);
}

/**
 * Dispatch result type
 */
interface DispatchResult {
  success: boolean;
  allFailed: boolean;
}

/**
 * Main dispatcher logic
 */
async function dispatch(): Promise<DispatchResult> {
  const dispatchStartTime = Date.now();
  
  try {
    console.log(`\n[DISPATCHER] Dispatch cycle started at ${new Date().toISOString()}`);
    
    // Initialize database
    try {
      await db.authenticate();
      console.log("[DISPATCHER] ✓ Database connection verified");
    } catch (dbError: any) {
      console.error("[DISPATCHER] Database connection failed:", dbError.message);
      await initControlDBConnection();
    }
    
    // Count pending posts
    const pendingCount = await countPendingPosts();
    console.log(`[DISPATCHER] Pending posts: ${pendingCount}`);
    
    // Calculate worker count
    const workerCount = calculateWorkerCount(pendingCount);
    
    if (workerCount === 0) {
      console.log("[DISPATCHER] No pending posts, skipping worker spawn");
      console.log(`[DISPATCHER] Dispatch completed in ${Date.now() - dispatchStartTime}ms\n`);
      return { success: true, allFailed: false };
    }
    
    console.log(`[DISPATCHER] Spawning ${workerCount} workers for ${pendingCount} pending posts`);
    
    // Spawn workers
    const workerResults = await spawnWorkers(workerCount);
    
    // Summary
    const successCount = workerResults.filter(r => r.success).length;
    const failureCount = workerResults.filter(r => !r.success).length;
    const totalDuration = Date.now() - dispatchStartTime;
    
    console.log(`\n[DISPATCHER] Summary:`);
    console.log(`[DISPATCHER] - Pending posts: ${pendingCount}`);
    console.log(`[DISPATCHER] - Workers: ${workerCount} (${successCount} ok, ${failureCount} failed)`);
    console.log(`[DISPATCHER] - Duration: ${totalDuration}ms\n`);

    /**
     * PRODUCTION FIX: Partial failure tolerance
     * Only exit with error if ALL workers failed
     * Partial failures are normal in production (API rate limits, network issues)
     */
    if (failureCount > 0 && successCount === 0) {
      console.error("[DISPATCHER] CRITICAL: All workers failed");
      return { success: false, allFailed: true };
    } else if (failureCount > 0) {
      console.warn(`[DISPATCHER] Partial failure: ${failureCount}/${workerCount} workers failed (continuing)`);
    }

    return { success: true, allFailed: false };
  } catch (error: any) {
    console.error("[DISPATCHER] Fatal error:", error.message);
    console.error(error.stack);
    return { success: false, allFailed: true };
  }
}

/**
 * Main execution with lock protection
 */
async function main(): Promise<void> {
  /**
   * PRODUCTION FIX: Acquire lock before running
   * Prevents overlapping dispatcher executions from cron
   */
  if (!acquireLock()) {
    console.log("[DISPATCHER] Skipping this run (lock not acquired)");
    process.exit(0); // Clean exit - not an error
  }

  const timeoutGuard = setTimeout(() => {
    console.warn(`[DISPATCHER] Exceeded ${TIMEOUT_MS}ms timeout, force exiting`);
    releaseLock();
    process.exit(2);
  }, TIMEOUT_MS);
  
  try {
    const result = await dispatch();
    clearTimeout(timeoutGuard);
    releaseLock();

    if (result.allFailed) {
      console.error("[DISPATCHER] Dispatch failed - all workers errored");
      process.exit(1);
    }

    console.log("[DISPATCHER] Dispatch completed successfully");
    process.exit(0);
  } catch (error: any) {
    clearTimeout(timeoutGuard);
    releaseLock();
    console.error("[DISPATCHER] Unhandled error:", error);
    process.exit(1);
  }
}

main();
