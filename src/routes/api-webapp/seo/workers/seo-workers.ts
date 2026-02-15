/**
 * SEO Analysis Workers
 * 
 * Background job processors for SEO analysis tasks
 * Registers workers with BullMQ to process queued analysis jobs
 * 
 * NOTE: This file provides worker stubs. Integrate with actual analysis handlers as needed.
 */

import { Job } from 'bullmq';
import jobQueueService, {
  QueueName,
  LighthouseJobData,
  SecurityJobData,
  TechJsJobData,
  PaginationJobData,
  BatchJobData,
  ComprehensiveJobData,
} from '../../../../services/job-queue.service';
import { getIO } from '../../../../services/socket-service';
import redisService, { CachePrefix, DEFAULT_TTL, RedisService } from '../../../../services/redis.service';

/**
 * Lighthouse Analysis Worker
 * Processes Lighthouse performance analysis jobs
 */
async function lighthouseWorker(job: Job<LighthouseJobData>): Promise<any> {
  const { url, options, requestId } = job.data;
  
  console.log(`🚀 Worker [Lighthouse]: Processing job ${job.id} for ${url}`);
  
  try {
    // Update progress
    await job.updateProgress(10);
    
    // Import handler dynamically to avoid circular dependencies
    const { analyzeLighthouse } = await import('../lighthouse/lightHouse-analyze-handler');
    
    // Run Lighthouse analysis
    const result = await analyzeLighthouse(url);
    
    await job.updateProgress(90);
    
    // Log result
    console.log(`✅ Worker [Lighthouse]: Completed job ${job.id}`);
    
    await job.updateProgress(100);
    
    return {
      success: true,
      url,
      requestId,
      result,
      completedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error(`❌ Worker [Lighthouse]: Failed job ${job.id}:`, error.message);
    throw error;
  }
}

/**
 * Security Analysis Worker
 * Processes security vulnerability scans
 */
async function securityWorker(job: Job<SecurityJobData>): Promise<any> {
  const { url, options, requestId } = job.data;
  
  console.log(`🚀 Worker [Security]: Processing job ${job.id} for ${url}`);
  
  try {
    await job.updateProgress(10);
    
    // Import handler dynamically
    const { analyzeSecurityHandler } = await import('../security/security-analyze-handler');
    
    // Create mock request/response objects for handler
    const mockReq = { body: { url } };
    const mockRes = {
      json: (data: any) => data,
      status: (code: number) => ({ json: (data: any) => data }),
    };
    
    // Run Security analysis
    const result = await analyzeSecurityHandler(mockReq, mockRes);
    
    await job.updateProgress(90);
    
    console.log(`✅ Worker [Security]: Completed job ${job.id}`);
    
    await job.updateProgress(100);
    
    return {
      success: true,
      url,
      requestId,
      result,
      completedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error(`❌ Worker [Security]: Failed job ${job.id}:`, error.message);
    throw error;
  }
}

/**
 * Tech-JS Analysis Worker
 * Processes JavaScript framework detection and analysis
 */
async function techJsWorker(job: Job<TechJsJobData>): Promise<any> {
  const { url, options, requestId } = job.data;
  
  console.log(`🚀 Worker [Tech-JS]: Processing job ${job.id} for ${url}`);
  
  try {
    await job.updateProgress(10);
    
    // Import required modules dynamically
    const { detectWebsiteTechStackWithAI, compareJSRendering, saveTechJsAnalysis } = 
      await import('../tech-js/tech-js-analyze-handler');
    const axios = await import('axios');
    const cheerio = await import('cheerio');
    
    await job.updateProgress(30);
    
    // Fetch the webpage
    const response = await axios.default.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 30000
    });
    
    await job.updateProgress(50);
    
    const $ = cheerio.load(response.data);
    const headers = response.headers;
    
    // Detect tech stack with AI recommendations
    const techStackResult = await detectWebsiteTechStackWithAI(
      $, 
      response.data, 
      headers as Record<string, string | string[] | undefined>, 
      url
    );
    
    await job.updateProgress(70);
    
    // Compare JS rendering
    const renderingComparison = await compareJSRendering(url, response.data);
    
    const result = {
      ...techStackResult,
      renderingComparison
    };
    
    await job.updateProgress(85);
    
    // Save to database
    await saveTechJsAnalysis(url, result);
    
    await job.updateProgress(100);
    
    console.log(`✅ Worker [Tech-JS]: Completed job ${job.id}`);
    
    return {
      success: true,
      url,
      requestId,
      result,
      completedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error(`❌ Worker [Tech-JS]: Failed job ${job.id}:`, error.message);
    throw error;
  }
}

/**
 * Pagination Analysis Worker
 * Processes pagination structure analysis
 */
async function paginationWorker(job: Job<PaginationJobData>): Promise<any> {
  const { url, options, requestId } = job.data;
  
  console.log(`🚀 Worker [Pagination]: Processing job ${job.id} for ${url}`);
  
  try {
    await job.updateProgress(10);
    
    // Import handler dynamically
    const { analyzeSitePagination } = await import('../pagination/pagination-analyze-handler');
    
    // Run Pagination analysis
    const result = await analyzeSitePagination([url]);
    
    await job.updateProgress(90);
    
    console.log(`✅ Worker [Pagination]: Completed job ${job.id}`);
    
    await job.updateProgress(100);
    
    return {
      success: true,
      url,
      requestId,
      result,
      completedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error(`❌ Worker [Pagination]: Failed job ${job.id}:`, error.message);
    throw error;
  }
}

/**
 * Comprehensive SEO Analysis Worker
 * Runs all SEO modules in parallel with real-time Socket.io progress updates
 */
async function comprehensiveWorker(job: Job<ComprehensiveJobData>): Promise<any> {
  const { url, options = {}, userId, companyId, requestId } = job.data;
  const startTime = Date.now();
  
  console.log(`🚀 Worker [Comprehensive]: Processing job ${job.id} for ${url}`);
  
  // Generate cache key based on URL and options
  const optionsHash = JSON.stringify(options);
  const cacheKey = RedisService.generateKey(
    CachePrefix.COMPREHENSIVE,
    url,
    optionsHash === '{}' ? undefined : Buffer.from(optionsHash).toString('base64').substring(0, 20)
  );
  
  // Check cache first
  const cachedResult = await redisService.get(cacheKey);
  if (cachedResult) {
    console.log(`✅ Worker [Comprehensive/${job.id}]: Cache HIT for ${url}`);
    await job.updateProgress(100);
    
    const resultWithCacheFlag = {
      ...cachedResult,
      fromCache: true,
      cachedAt: cachedResult.analyzedAt,
      analyzedAt: new Date().toISOString(),
      executionTime: '0.05s',
    };
    
    // Emit completion via Socket.io
    const io = getIO();
    const socketRoom = userId ? `user:${userId}` : companyId ? `company:${companyId}` : null;
    if (io && socketRoom) {
      io.to(socketRoom).emit('seo:complete', {
        jobId: job.id,
        url,
        status: 'completed',
        fromCache: true,
        executionTime: '0.05s',
        result: resultWithCacheFlag,
        timestamp: new Date().toISOString(),
      });
    }
    
    return resultWithCacheFlag;
  }
  
  console.log(`⚠️ Worker [Comprehensive/${job.id}]: Cache MISS for ${url} - Running full analysis`);
  
  // Get Socket.io instance for real-time updates
  const io = getIO();
  const socketRoom = userId ? `user:${userId}` : companyId ? `company:${companyId}` : null;
  
  // Helper to emit progress via Socket.io
  const emitProgress = (progress: number, currentModule: string, status: string = 'processing') => {
    if (io && socketRoom) {
      io.to(socketRoom).emit('seo:progress', {
        jobId: job.id,
        url,
        status,
        progress,
        currentModule,
        timestamp: new Date().toISOString(),
      });
    }
  };
  
  // Helper to emit module completion
  const emitModuleComplete = (moduleName: string, success: boolean, error?: string) => {
    if (io && socketRoom) {
      io.to(socketRoom).emit('seo:module:complete', {
        jobId: job.id,
        url,
        module: moduleName,
        success,
        error,
        timestamp: new Date().toISOString(),
      });
    }
  };
  
  try {
    const {
      includeLighthouse = true,
      includeKeywords = true,
      includeResponsive = true,
      includeSecurity = true,
      includeTechJs = true,
      includeAccessibility = true,
      includePagination = true,
      includeInternalSeo = true,
      includeBacklinks = true,
    } = options;

    // Initialize results object
    const results: any = {};
    const errors: any = {};
    const analysisPromises: Promise<void>[] = [];
    
    let completedModules = 0;
    const totalModules = [
      includeLighthouse,
      includeKeywords,
      includeResponsive,
      includeSecurity,
      includeTechJs,
      includeAccessibility,
      includePagination,
      includeInternalSeo,
      includeBacklinks,
    ].filter(Boolean).length;
    
    const updateProgress = () => {
      completedModules++;
      const progress = Math.round((completedModules / totalModules) * 100);
      job.updateProgress(progress);
    };

    emitProgress(5, 'Starting analysis', 'processing');

    // 1. Lighthouse Analysis
    if (includeLighthouse) {
      emitProgress(10, 'lighthouse', 'processing');
      analysisPromises.push(
        (async () => {
          try {
            const { analyzeLighthouse } = await import('../lighthouse/lightHouse-analyze-handler');
            results.performance = await analyzeLighthouse(url);
            updateProgress();
            emitModuleComplete('lighthouse', true);
            console.log(`✅ Worker [Comprehensive/${job.id}]: Lighthouse completed`);
          } catch (error: any) {
            errors.lighthouse = error.message;
            updateProgress();
            emitModuleComplete('lighthouse', false, error.message);
            console.error(`❌ Worker [Comprehensive/${job.id}]: Lighthouse failed:`, error.message);
          }
        })()
      );
    }

    // 2. Keyword Ranking Analysis
    if (includeKeywords) {
      analysisPromises.push(
        (async () => {
          try {
            emitProgress(20, 'keywords', 'processing');
            const { keywordRenkChecker } = await import('../keywordranking/keywordranking-analyze-handler');
            results.keywords = await keywordRenkChecker(url);
            updateProgress();
            emitModuleComplete('keywords', true);
            console.log(`✅ Worker [Comprehensive/${job.id}]: Keywords completed`);
          } catch (error: any) {
            errors.keywords = error.message;
            updateProgress();
            emitModuleComplete('keywords', false, error.message);
            console.error(`❌ Worker [Comprehensive/${job.id}]: Keywords failed:`, error.message);
          }
        })()
      );
    }

    // 3. Responsive Analysis
    if (includeResponsive) {
      analysisPromises.push(
        (async () => {
          try {
            emitProgress(30, 'responsive', 'processing');
            const { analyzeMobileHandler } = await import('../responsive/responsive-analyze-handler');
            let responseData: any;
            const mockReq = { body: { url } } as any;
            const mockRes = {
              json: (data: any) => { responseData = data; },
              status: () => mockRes,
            } as any;
            await analyzeMobileHandler(mockReq, mockRes);
            results.responsive = responseData;
            updateProgress();
            emitModuleComplete('responsive', true);
            console.log(`✅ Worker [Comprehensive/${job.id}]: Responsive completed`);
          } catch (error: any) {
            errors.responsive = error.message;
            updateProgress();
            emitModuleComplete('responsive', false, error.message);
            console.error(`❌ Worker [Comprehensive/${job.id}]: Responsive failed:`, error.message);
          }
        })()
      );
    }

    // 4. Security Analysis
    if (includeSecurity) {
      analysisPromises.push(
        (async () => {
          try {
            emitProgress(40, 'security', 'processing');
            const { analyzeWebsiteSecurity } = await import('../security/security-analyze-handler');
            results.security = await analyzeWebsiteSecurity(url);
            updateProgress();
            emitModuleComplete('security', true);
            console.log(`✅ Worker [Comprehensive/${job.id}]: Security completed`);
          } catch (error: any) {
            errors.security = error.message;
            updateProgress();
            emitModuleComplete('security', false, error.message);
            console.error(`❌ Worker [Comprehensive/${job.id}]: Security failed:`, error.message);
          }
        })()
      );
    }

    // 5. Tech/JS Analysis
    if (includeTechJs) {
      analysisPromises.push(
        (async () => {
          try {
            emitProgress(50, 'tech-js', 'processing');
            const cheerio = await import('cheerio');
            const { httpClient } = await import('../utils/http-client');
            const { detectWebsiteTechStackWithAI } = await import('../tech-js/tech-js-analyze-handler');
            
            const response = await httpClient.get(url);
            const $ = cheerio.load(response.data);
            const headers: Record<string, string | string[] | undefined> = {};
            Object.entries(response.headers).forEach(([key, value]) => {
              if (value !== null) headers[key] = value as string | string[];
            });
            
            results.javascript = await detectWebsiteTechStackWithAI($, response.data, headers, url);
            updateProgress();
            emitModuleComplete('tech-js', true);
            console.log(`✅ Worker [Comprehensive/${job.id}]: Tech/JS completed`);
          } catch (error: any) {
            errors.techJs = error.message;
            updateProgress();
            emitModuleComplete('tech-js', false, error.message);
            console.error(`❌ Worker [Comprehensive/${job.id}]: Tech/JS failed:`, error.message);
          }
        })()
      );
    }

    // 6. Accessibility Analysis
    if (includeAccessibility) {
      analysisPromises.push(
        (async () => {
          try {
            emitProgress(60, 'accessibility', 'processing');
            const { analyzeAccessibility } = await import('../accessibility/accessibility-analyze-handler');
            results.accessibility = await analyzeAccessibility(url);
            updateProgress();
            emitModuleComplete('accessibility', true);
            console.log(`✅ Worker [Comprehensive/${job.id}]: Accessibility completed`);
          } catch (error: any) {
            errors.accessibility = error.message;
            updateProgress();
            emitModuleComplete('accessibility', false, error.message);
            console.error(`❌ Worker [Comprehensive/${job.id}]: Accessibility failed:`, error.message);
          }
        })()
      );
    }

    // 7. Pagination Analysis
    if (includePagination) {
      analysisPromises.push(
        (async () => {
          try {
            emitProgress(70, 'pagination', 'processing');
            const { analyzePaginationHandler } = await import('../pagination/pagination-analyze-handler');
            results.indexing = await analyzePaginationHandler(url, { maxPages: 10 });
            updateProgress();
            emitModuleComplete('pagination', true);
            console.log(`✅ Worker [Comprehensive/${job.id}]: Pagination completed`);
          } catch (error: any) {
            errors.pagination = error.message;
            updateProgress();
            emitModuleComplete('pagination', false, error.message);
            console.error(`❌ Worker [Comprehensive/${job.id}]: Pagination failed:`, error.message);
          }
        })()
      );
    }

    // 8. Internal SEO Analysis
    if (includeInternalSeo) {
      analysisPromises.push(
        (async () => {
          try {
            emitProgress(80, 'internal-seo', 'processing');
            const { analyzeInternalSEOHandler } = await import('../internalseo/internalseo-analyze-handler');
            results.internalSeo = await analyzeInternalSEOHandler(url, { maxDepth: 2, maxPages: 20, fast: true });
            updateProgress();
            emitModuleComplete('internal-seo', true);
            console.log(`✅ Worker [Comprehensive/${job.id}]: Internal SEO completed`);
          } catch (error: any) {
            errors.internalSeo = error.message;
            updateProgress();
            emitModuleComplete('internal-seo', false, error.message);
            console.error(`❌ Worker [Comprehensive/${job.id}]: Internal SEO failed:`, error.message);
          }
        })()
      );
    }

    // 9. Backlinks Analysis
    if (includeBacklinks) {
      analysisPromises.push(
        (async () => {
          try {
            emitProgress(90, 'backlinks', 'processing');
            const { analyzeBacklinksHandler } = await import('../backlinks/backlinks-handler');
            results.externalSeo = await analyzeBacklinksHandler(url);
            updateProgress();
            emitModuleComplete('backlinks', true);
            console.log(`✅ Worker [Comprehensive/${job.id}]: Backlinks completed`);
          } catch (error: any) {
            errors.backlinks = error.message;
            updateProgress();
            emitModuleComplete('backlinks', false, error.message);
            console.error(`❌ Worker [Comprehensive/${job.id}]: Backlinks failed:`, error.message);
          }
        })()
      );
    }

    // Wait for all analyses to complete
    await Promise.allSettled(analysisPromises);

    emitProgress(95, 'Aggregating results', 'processing');

    // Aggregate issues (reuse logic from comprehensive-seo-api.ts)
    const allIssues = aggregateIssues(results);
    const dashboardScores = calculateDashboardScores(results);
    
    const executionTime = ((Date.now() - startTime) / 1000).toFixed(2) + 's';

    const finalResult = {
      success: true,
      url,
      analyzedAt: new Date().toISOString(),
      executionTime,
      fromCache: false,
      tabs: {
        dashboard: dashboardScores,
        performance: results.performance || null,
        javascript: results.javascript || null,
        accessibility: results.accessibility || null,
        internalSeo: results.internalSeo || null,
        externalSeo: results.externalSeo || null,
        indexing: results.indexing || null,
        security: results.security || null,
        allIssues,
      },
      ...(Object.keys(errors).length > 0 && { errors }),
    };
    
    // Store result in cache (30-minute TTL)
    redisService.set(cacheKey, finalResult, DEFAULT_TTL.COMPREHENSIVE)
      .then(success => {
        if (success) {
          console.log(`✅ Worker [Comprehensive/${job.id}]: Result cached for 30 minutes`);
        }
      })
      .catch(error => {
        console.error(`⚠️ Worker [Comprehensive/${job.id}]: Failed to cache result:`, error);
      });

    // Save to database
    try {
      const { seo } = await import('../seo-model');
      const dbInstance = await import('../../../../db/core/control-db');
      const SeoModel = seo.initModel(dbInstance.default);
      
      await SeoModel.create({
        url: url,
        analysisType: 'comprehensive',
        analysisData: JSON.stringify(finalResult),
        isDeleted: false,
      });
      
      console.log(`✅ Worker [Comprehensive/${job.id}]: Saved to database`);
    } catch (saveError: any) {
      console.error(`⚠️ Worker [Comprehensive/${job.id}]: Failed to save:`, saveError.message);
    }

    await job.updateProgress(100);
    emitProgress(100, 'Complete', 'completed');

    // Emit final completion with full result
    if (io && socketRoom) {
      io.to(socketRoom).emit('seo:complete', {
        jobId: job.id,
        url,
        status: 'completed',
        executionTime,
        result: finalResult,
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`✅ Worker [Comprehensive/${job.id}]: Completed in ${executionTime}`);

    return finalResult;
  } catch (error: any) {
    console.error(`❌ Worker [Comprehensive/${job.id}]: Fatal error:`, error.message);
    
    // Emit error via Socket.io
    if (io && socketRoom) {
      io.to(socketRoom).emit('seo:error', {
        jobId: job.id,
        url,
        status: 'failed',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
    
    throw error;
  }
}

// Helper functions (from comprehensive-seo-api.ts)
function aggregateIssues(results: any) {
  const critical: any[] = [];
  const warnings: any[] = [];
  const suggestions: any[] = [];

  Object.entries(results).forEach(([module, data]: [string, any]) => {
    if (data && data.issues) {
      if (data.issues.critical) {
        critical.push(...data.issues.critical.map((issue: any) => ({ ...issue, module })));
      }
      if (data.issues.warnings) {
        warnings.push(...data.issues.warnings.map((issue: any) => ({ ...issue, module })));
      }
      if (data.issues.suggestions) {
        suggestions.push(...data.issues.suggestions.map((issue: any) => ({ ...issue, module })));
      }
    }
  });

  return {
    critical,
    warnings,
    suggestions,
    totalIssues: critical.length + warnings.length + suggestions.length,
  };
}

function calculateDashboardScores(results: any) {
  const scores: any = {
    overallScore: 0,
    grade: 'N/A',
    technicalSeo: 0,
    onPageSeo: 0,
    technicalArchitecture: 0,
  };

  let scoreCount = 0;
  let totalScore = 0;

  if (results.performance?.scores?.performance) {
    totalScore += results.performance.scores.performance;
    scoreCount++;
  }

  if (results.accessibility?.score?.overallScore) {
    totalScore += results.accessibility.score.overallScore;
    scoreCount++;
  }

  if (results.security?.score) {
    totalScore += results.security.score;
    scoreCount++;
  }

  if (results.internalSeo?.score) {
    scores.onPageSeo = results.internalSeo.score;
    totalScore += results.internalSeo.score;
    scoreCount++;
  }

  if (results.javascript?.score) {
    scores.technicalArchitecture = results.javascript.score;
    totalScore += results.javascript.score;
    scoreCount++;
  }

  if (scoreCount > 0) {
    scores.overallScore = Math.round(totalScore / scoreCount);
    scores.grade = getGrade(scores.overallScore);
  }

  const techScores = [];
  if (results.performance?.scores?.performance) techScores.push(results.performance.scores.performance);
  if (results.security?.score) techScores.push(results.security.score);
  if (results.javascript?.score) techScores.push(results.javascript.score);
  
  if (techScores.length > 0) {
    scores.technicalSeo = Math.round(techScores.reduce((a: number, b: number) => a + b, 0) / techScores.length);
  }

  return scores;
}

function getGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Batch Analysis Worker
 * Processes multiple URLs with multiple analysis types
 */
async function batchWorker(job: Job<BatchJobData>): Promise<any> {
  const { urls, analyses, requestId } = job.data;
  
  console.log(`🚀 Worker [Batch]: Processing job ${job.id} for ${urls.length} URLs`);
  
  try {
    const results: any[] = [];
    const totalTasks = urls.length * analyses.length;
    let completedTasks = 0;

    // Import handlers dynamically
    const lighthouseHandler = analyses.includes('lighthouse') 
      ? await import('../lighthouse/lightHouse-analyze-handler')
      : null;
    const securityHandler = analyses.includes('security')
      ? await import('../security/security-analyze-handler')
      : null;
    const techJsHandler = analyses.includes('tech-js')
      ? await import('../tech-js/tech-js-analyze-handler')
      : null;
    const paginationHandler = analyses.includes('pagination')
      ? await import('../pagination/pagination-analyze-handler')
      : null;
    
    // Import additional modules if needed
    let axios: any, cheerio: any;
    if (analyses.includes('tech-js')) {
      axios = (await import('axios')).default;
      cheerio = await import('cheerio');
    }

    for (const url of urls) {
      const urlResults: any = { url, analyses: {} };

      for (const analysisType of analyses) {
        try {
          let result;
          
          switch (analysisType) {
            case 'lighthouse':
              if (lighthouseHandler) {
                result = await lighthouseHandler.analyzeLighthouse(url);
              }
              break;
            case 'security':
              if (securityHandler) {
                const mockReq = { body: { url } };
                const mockRes = {
                  json: (data: any) => data,
                  status: (code: number) => ({ json: (data: any) => data }),
                };
                result = await securityHandler.analyzeSecurityHandler(mockReq, mockRes);
              }
              break;
            case 'tech-js':
              if (techJsHandler && axios && cheerio) {
                // Replicate the tech-js API logic
                const response = await axios.get(url, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                  },
                  timeout: 30000
                });
                const $ = cheerio.load(response.data);
                const techStackResult = await techJsHandler.detectWebsiteTechStackWithAI(
                  $, 
                  response.data, 
                  response.headers as Record<string, string | string[] | undefined>, 
                  url
                );
                const renderingComparison = await techJsHandler.compareJSRendering(url, response.data);
                result = { ...techStackResult, renderingComparison };
                await techJsHandler.saveTechJsAnalysis(url, result);
              }
              break;
            case 'pagination':
              if (paginationHandler) {
                result = await paginationHandler.analyzeSitePagination([url]);
              }
              break;
          }

          urlResults.analyses[analysisType] = {
            success: true,
            result,
          };
        } catch (error: any) {
          urlResults.analyses[analysisType] = {
            success: false,
            error: error.message,
          };
        }

        completedTasks++;
        const progress = Math.round((completedTasks / totalTasks) * 100);
        await job.updateProgress(progress);
      }

      results.push(urlResults);
    }

    console.log(`✅ Worker [Batch]: Completed job ${job.id} - ${urls.length} URLs processed`);

    return {
      success: true,
      requestId,
      urls: urls.length,
      totalAnalyses: totalTasks,
      results,
      completedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error(`❌ Worker [Batch]: Failed job ${job.id}:`, error.message);
    throw error;
  }
}

/**
 * Register all workers
 * Call this function to start processing jobs
 */
export async function registerAllWorkers(): Promise<void> {
  console.log('🔄 Registering all SEO analysis workers...');

  // Register Lighthouse worker
  jobQueueService.registerWorker<LighthouseJobData>(
    QueueName.LIGHTHOUSE,
    lighthouseWorker,
    { concurrency: 3 }
  );

  // Register Security worker
  jobQueueService.registerWorker<SecurityJobData>(
    QueueName.SECURITY,
    securityWorker,
    { concurrency: 2 }
  );

  // Register Tech-JS worker
  jobQueueService.registerWorker<TechJsJobData>(
    QueueName.TECH_JS,
    techJsWorker,
    { concurrency: 3 }
  );

  // Register Pagination worker
  jobQueueService.registerWorker<PaginationJobData>(
    QueueName.PAGINATION,
    paginationWorker,
    { concurrency: 2 }
  );

  // Register Comprehensive worker
  jobQueueService.registerWorker<ComprehensiveJobData>(
    QueueName.COMPREHENSIVE,
    comprehensiveWorker,
    { concurrency: 2 }
  );

  // Register Batch worker
  jobQueueService.registerWorker<BatchJobData>(
    QueueName.BATCH,
    batchWorker,
    { concurrency: 1 }
  );

  console.log('✅ All workers registered successfully');
}

/**
 * Initialize job queue and workers
 * Call this on server startup
 */
export async function initializeJobQueue(): Promise<void> {
  try {
    // Initialize job queue service
    await jobQueueService.initialize();

    // Register workers
    await registerAllWorkers();

    console.log('✅ Job queue system initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize job queue:', error);
    throw error;
  }
}
