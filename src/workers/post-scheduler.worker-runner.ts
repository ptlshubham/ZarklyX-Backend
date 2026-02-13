#!/usr/bin/env ts-node

/**
 * Ephemeral Worker Runner
 * Spawned by dispatcher, processes batch of posts, then exits
 */

import { initControlDBConnection } from "../db/core/control-db";
import db from "../db/core/control-db";
import { runPostSchedulerWorker } from "./post-scheduler.worker";
import os from "os";

const TIMEOUT_MS = 50000; // 50 seconds timeout

async function main(): Promise<void> {
  const startTime = Date.now();
  const workerId = process.env.WORKER_ID || `worker-${os.hostname()}-${Date.now()}`;
  
  // Timeout guard to prevent zombie processes
  const timeoutGuard = setTimeout(() => {
    console.warn(`[WORKER ${workerId}] Exceeded ${TIMEOUT_MS}ms timeout, force exiting`);
    process.exit(2);
  }, TIMEOUT_MS);
  
  try {
    console.log(`[WORKER ${workerId}] Starting at ${new Date().toISOString()}`);
    
    // Initialize database with full sync (auth + sync) before running worker
    try {
      console.log(`[WORKER ${workerId}] Initializing database connection and syncing models...`);
      const connected = await initControlDBConnection();
      
      if (!connected) {
        throw new Error("Failed to initialize database connection");
      }
      
      console.log(`[WORKER ${workerId}] ✓ Database connection and sync verified`);
    } catch (dbError: any) {
      console.error(`[WORKER ${workerId}] ✗ Database initialization failed:`, dbError.message);
      clearTimeout(timeoutGuard);
      process.exit(1);
    }
    
    // Run worker cycle (only after DB is fully synced)
    console.log(`[WORKER ${workerId}] Database ready, starting worker cycle...`);
    await runPostSchedulerWorker(db);
    
    const duration = Date.now() - startTime;
    console.log(`[WORKER ${workerId}] Completed successfully in ${duration}ms`);
    
    clearTimeout(timeoutGuard);
    process.exit(0);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[WORKER ${workerId}] Fatal error after ${duration}ms:`, error.message);
    console.error(error.stack);
    
    clearTimeout(timeoutGuard);
    process.exit(1);
  }
}

main();
