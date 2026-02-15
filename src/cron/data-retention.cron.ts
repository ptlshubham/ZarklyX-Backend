/**
 * Data Retention Cron Job
 * 
 * Runs daily at 2 AM to execute retention policy
 * Prevents database bloat and maintains performance
 */

import cron from 'node-cron';
import dataRetentionService from '../services/data-retention.service';

/**
 * Schedule data retention cron job
 * Runs daily at 2:00 AM
 */
export function scheduleDataRetention(): void {
  // Run every day at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('⏰ Starting scheduled data retention job...');
    
    try {
      const stats = await dataRetentionService.executeRetentionPolicy();
      
      console.log('📊 Data Retention Stats:', {
        totalAudits: stats.totalAudits,
        hotAudits: stats.hotAudits,
        warmAudits: stats.warmAudits,
        coldAudits: stats.coldAudits,
        archivedCount: stats.archivedCount,
        purgedCount: stats.purgedCount,
        estimatedSavingsGB: stats.estimatedSavingsGB,
      });
      
      // TODO: Send report email to admin
      // await sendRetentionReport(stats);
      
      console.log('✅ Data retention job completed successfully');
    } catch (error) {
      console.error('❌ Data retention job failed:', error);
      // TODO: Send alert to admin
      // await sendErrorAlert('Data Retention Job Failed', error);
    }
  }, {
    timezone: 'UTC',
  });

  console.log('✅ Data retention cron job scheduled (daily at 2:00 AM UTC)');
}

/**
 * Manual trigger for data retention (admin endpoint)
 */
export async function triggerDataRetention(): Promise<any> {
  console.log('🔧 Manual data retention triggered');
  return await dataRetentionService.executeRetentionPolicy();
}

/**
 * Get dry run preview (admin endpoint)
 */
export async function previewDataRetention(): Promise<any> {
  console.log('👁️ Data retention dry run');
  return await dataRetentionService.dryRun();
}
