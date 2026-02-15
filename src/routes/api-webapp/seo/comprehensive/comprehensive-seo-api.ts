/**
 * Comprehensive SEO Analysis API
 * 
 * Orchestrates all SEO analysis modules and returns tab-organized results
 * This endpoint calls all SEO analysis APIs and aggregates results by UI tab
 */

import { Router, Request, Response } from 'express';
import { analyzeLighthouse } from '../lighthouse/lightHouse-analyze-handler';
import { keywordRenkChecker } from '../keywordranking/keywordranking-analyze-handler';
import { analyzeMobileHandler } from '../responsive/responsive-analyze-handler';
import { analyzeWebsiteSecurity } from '../security/security-analyze-handler';
import { detectWebsiteTechStackWithAI } from '../tech-js/tech-js-analyze-handler';
import { analyzeAccessibility } from '../accessibility/accessibility-analyze-handler';
import { analyzePaginationHandler } from '../pagination/pagination-analyze-handler';
import { analyzeInternalSEOHandler } from '../internalseo/internalseo-analyze-handler';
import { analyzeBacklinksHandler } from '../backlinks/backlinks-handler';
import { seo } from '../seo-model';
import dbInstance from '../../../../db/core/control-db';

const router = Router();

/**
 * Interface for comprehensive analysis request
 */
interface ComprehensiveAnalysisRequest {
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
    // Google services require separate auth, so they're optional
    includeSearchConsole?: boolean;
    includeAnalytics?: boolean;
  };
}

/**
 * Interface for tab-organized results
 */
interface ComprehensiveAnalysisResponse {
  success: boolean;
  url: string;
  analyzedAt: string;
  executionTime: string;
  tabs: {
    dashboard: {
      overallScore: number;
      grade: string;
      technicalSeo: number;
      onPageSeo: number;
      technicalArchitecture: number;
    };
    performance: any;
    javascript: any;
    accessibility: any;
    internalSeo: any;
    externalSeo: any;
    indexing: any;
    security: any;
    allIssues: {
      critical: any[];
      warnings: any[];
      suggestions: any[];
      totalIssues: number;
    };
  };
  errors?: {
    [key: string]: string;
  };
}

/**
 * POST /seo/comprehensive/analyze
 * Run comprehensive SEO analysis across all tabs
 */
router.post('/analyze', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { url, options = {} }: ComprehensiveAnalysisRequest = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
      });
    }

    // Default: include all analyses
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
      includeSearchConsole = false, // Requires OAuth
      includeAnalytics = false, // Requires OAuth
    } = options;

    console.log(`🚀 Starting comprehensive SEO analysis for: ${url}`);

    // Run all analyses in parallel for speed
    const results: any = {};
    const errors: any = {};

    const analysisPromises = [];

    // Tab 3: Performance (Lighthouse)
    if (includeLighthouse) {
      analysisPromises.push(
        analyzeLighthouse(url)
          .then((data: any) => {
            results.performance = data;
            console.log('✅ Lighthouse analysis completed');
          })
          .catch((error: any) => {
            errors.lighthouse = error.message;
            console.error('❌ Lighthouse analysis failed:', error.message);
          })
      );
    }

    // Tab 2: Keywords (Keyword Ranking)
    if (includeKeywords) {
      analysisPromises.push(
        keywordRenkChecker(url)
          .then((data: any) => {
            results.keywords = data;
            console.log('✅ Keyword analysis completed');
          })
          .catch((error: any) => {
            errors.keywords = error.message;
            console.error('❌ Keyword analysis failed:', error.message);
          })
      );
    }

    // Tab 4: Mobile/Responsive
    if (includeResponsive) {
      analysisPromises.push(
        // Create mock req/res for handler
        (async () => {
          let responseData: any;
          const mockReq = { body: { url } } as any;
          const mockRes = {
            json: (data: any) => { responseData = data; },
            status: () => mockRes,
          } as any;
          
          await analyzeMobileHandler(mockReq, mockRes);
          return responseData;
        })()
          .then((data: any) => {
            results.responsive = data;
            console.log('✅ Responsive analysis completed');
          })
          .catch((error: any) => {
            errors.responsive = error.message;
            console.error('❌ Responsive analysis failed:', error.message);
          })
      );
    }

    // Tab 8: Security
    if (includeSecurity) {
      analysisPromises.push(
        analyzeWebsiteSecurity(url)
          .then((data: any) => {
            results.security = data;
            console.log('✅ Security analysis completed');
          })
          .catch((error: any) => {
            errors.security = error.message;
            console.error('❌ Security analysis failed:', error.message);
          })
      );
    }

    // Tab 4: Javascript/Tech Stack  
    if (includeTechJs) {
      analysisPromises.push(
        // Tech/JS analysis requires cheerio and HTML content - simplified approach
        (async () => {
          const cheerio = await import('cheerio');
          const { httpClient } = await import('../utils/http-client');
          
          const response = await httpClient.get(url);
          const $ = cheerio.load(response.data);
          // Convert Axios headers to the expected format (filter out null values)
          const headers: Record<string, string | string[] | undefined> = {};
          Object.entries(response.headers).forEach(([key, value]) => {
            if (value !== null) {
              headers[key] = value as string | string[];
            }
          });
          
          return await detectWebsiteTechStackWithAI($, response.data, headers, url);
        })()
          .then((data: any) => {
            results.javascript = data;
            console.log('✅ Tech/JS analysis completed');
          })
          .catch((error: any) => {
            errors.techJs = error.message;
            console.error('❌ Tech/JS analysis failed:', error.message);
          })
      );
    }

    // Tab 5: Accessibility
    if (includeAccessibility) {
      analysisPromises.push(
        analyzeAccessibility(url)
          .then((data: any) => {
            results.accessibility = data;
            console.log('✅ Accessibility analysis completed');
          })
          .catch((error: any) => {
            errors.accessibility = error.message;
            console.error('❌ Accessibility analysis failed:', error.message);
          })
      );
    }

    // Tab 7: Indexing (Pagination)
    if (includePagination) {
      analysisPromises.push(
        analyzePaginationHandler(url, { maxPages: 10, followPagination: true })
          .then((data: any) => {
            results.indexing = data;
            console.log('✅ Pagination analysis completed');
          })
          .catch((error: any) => {
            errors.pagination = error.message;
            console.error('❌ Pagination analysis failed:', error.message);
          })
      );
    }

    // Tab 6: Internal SEO
    if (includeInternalSeo) {
      analysisPromises.push(
        analyzeInternalSEOHandler(url, { maxDepth: 2, maxPages: 20, fast: true })
          .then((data: any) => {
            results.internalSeo = data;
            console.log('✅ Internal SEO analysis completed');
          })
          .catch((error: any) => {
            errors.internalSeo = error.message;
            console.error('❌ Internal SEO analysis failed:', error.message);
          })
      );
    }

    // Tab 7: External SEO (Backlinks)
    if (includeBacklinks) {
      analysisPromises.push(
        analyzeBacklinksHandler(url)
          .then((data: any) => {
            results.externalSeo = data;
            console.log('✅ Backlinks analysis completed');
          })
          .catch((error: any) => {
            errors.backlinks = error.message;
            console.error('❌ Backlinks analysis failed:', error.message);
          })
      );
    }

    // Wait for all analyses to complete
    await Promise.allSettled(analysisPromises);

    // Aggregate all issues from different tabs
    const allIssues = aggregateIssues(results);

    // Calculate dashboard scores
    const dashboardScores = calculateDashboardScores(results);

    // Calculate execution time
    const executionTime = ((Date.now() - startTime) / 1000).toFixed(2) + 's';

    // Build comprehensive response
    const response: ComprehensiveAnalysisResponse = {
      success: true,
      url,
      analyzedAt: new Date().toISOString(),
      executionTime,
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

    console.log(`✅ Comprehensive analysis completed in ${executionTime}`);

    // Save comprehensive analysis to database
    try {
      await saveComprehensiveAnalysis(url, response);
      console.log('✅ Comprehensive analysis saved to database');
    } catch (saveError: any) {
      console.error('⚠️ Failed to save comprehensive analysis:', saveError.message);
      // Don't fail the request if save fails
    }

    res.json(response);
  } catch (error: any) {
    console.error('❌ Comprehensive analysis error:', error);
    
    const executionTime = ((Date.now() - startTime) / 1000).toFixed(2) + 's';
    
    res.status(500).json({
      success: false,
      error: error.message || 'Comprehensive analysis failed',
      executionTime,
    });
  }
});

/**
 * Aggregate issues from all analysis results
 */
function aggregateIssues(results: any) {
  const critical: any[] = [];
  const warnings: any[] = [];
  const suggestions: any[] = [];

  // Aggregate from each module
  Object.entries(results).forEach(([module, data]: [string, any]) => {
    if (data && data.issues) {
      if (data.issues.critical) {
        critical.push(...data.issues.critical.map((issue: any) => ({
          ...issue,
          module,
        })));
      }
      if (data.issues.warnings) {
        warnings.push(...data.issues.warnings.map((issue: any) => ({
          ...issue,
          module,
        })));
      }
      if (data.issues.suggestions) {
        suggestions.push(...data.issues.suggestions.map((issue: any) => ({
          ...issue,
          module,
        })));
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

/**
 * Calculate overall dashboard scores
 */
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

  // Performance score from Lighthouse
  if (results.performance?.scores?.performance) {
    totalScore += results.performance.scores.performance;
    scoreCount++;
  }

  // Accessibility score
  if (results.accessibility?.score?.overallScore) {
    totalScore += results.accessibility.score.overallScore;
    scoreCount++;
  }

  // Security score
  if (results.security?.score) {
    totalScore += results.security.score;
    scoreCount++;
  }

  // Internal SEO score
  if (results.internalSeo?.score) {
    scores.onPageSeo = results.internalSeo.score;
    totalScore += results.internalSeo.score;
    scoreCount++;
  }

  // Tech/JS contributes to technical architecture
  if (results.javascript?.score) {
    scores.technicalArchitecture = results.javascript.score;
    totalScore += results.javascript.score;
    scoreCount++;
  }

  // Calculate overall score
  if (scoreCount > 0) {
    scores.overallScore = Math.round(totalScore / scoreCount);
    scores.grade = getGrade(scores.overallScore);
  }

  // Technical SEO (average of performance, security, tech)
  const techScores = [];
  if (results.performance?.scores?.performance) techScores.push(results.performance.scores.performance);
  if (results.security?.score) techScores.push(results.security.score);
  if (results.javascript?.score) techScores.push(results.javascript.score);
  
  if (techScores.length > 0) {
    scores.technicalSeo = Math.round(techScores.reduce((a, b) => a + b, 0) / techScores.length);
  }

  return scores;
}

/**
 * Save comprehensive analysis to database
 */
async function saveComprehensiveAnalysis(url: string, analysisData: ComprehensiveAnalysisResponse): Promise<void> {
  try {
    const SeoModel = seo.initModel(dbInstance);
    
    await SeoModel.create({
      url: url,
      analysisType: 'comprehensive',
      analysisData: JSON.stringify(analysisData),
      isDeleted: false,
    });
    
    console.log('✅ Comprehensive analysis saved to database');
  } catch (error: any) {
    console.error('❌ Error saving comprehensive analysis:', error.message);
    throw error;
  }
}

/**
 * Convert score to grade
 */
function getGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export default router;
