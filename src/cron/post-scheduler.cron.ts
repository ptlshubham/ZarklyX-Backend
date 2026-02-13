#!/usr/bin/env ts-node

/**
 * Post Scheduler Cron Trigger
 * Runs once per minute, delegates to dispatcher which spawns workers
 */

import { spawn } from 'child_process';

const TIMEOUT_MS = 55000;
const DISPATCHER_SCRIPT = 'dist/cron/post-scheduler.dispatcher.js';

async function main(): Promise<void> {
  const startTime = Date.now();
  
  try {
    console.log(`[CRON] Post scheduler started at ${new Date().toISOString()}`);
    console.log(`[CRON] Delegating to dispatcher...`);
    
    const dispatcher = spawn('node', [DISPATCHER_SCRIPT], {
      stdio: 'inherit',
      env: process.env,
    });
    
    await new Promise<void>((resolve, reject) => {
      dispatcher.on('exit', (code, signal) => {
        const duration = Date.now() - startTime;
        
        if (code === 0) {
          console.log(`[CRON] Dispatcher completed in ${duration}ms`);
          resolve();
        } else if (code === 2) {
          console.warn(`[CRON] Dispatcher timeout after ${duration}ms`);
          resolve();
        } else {
          console.error(`[CRON] Dispatcher failed with code ${code} after ${duration}ms`);
          reject(new Error(`Dispatcher failed with exit code ${code}`));
        }
      });
      
      dispatcher.on('error', (error) => {
        console.error(`[CRON] Dispatcher spawn error:`, error.message);
        reject(error);
      });
    });
    
    console.log(`[CRON] Cron cycle completed in ${Date.now() - startTime}ms`);
    process.exit(0);
  } catch (error: any) {
    console.error("[CRON] Fatal error:", error.message);
    process.exit(1);
  }
}

// Timeout guard
const timeoutGuard = setTimeout(() => {
  console.warn(`[CRON] Exceeded ${TIMEOUT_MS}ms timeout, force exiting`);
  process.exit(2);
}, TIMEOUT_MS);

main()
  .then(() => clearTimeout(timeoutGuard))
  .catch((error) => {
    clearTimeout(timeoutGuard);
    console.error("[CRON] Unhandled error:", error);
    process.exit(1);
  });
