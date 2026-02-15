import { httpClient } from '../utils/http-client';
import { generateUniversalSeoIssues } from '../../../../services/universal-seo-issues';
import { LighthouseAnalysis } from './lightHouse-model';
import { AnalysisSaver } from '../utils/analysis-base';

// Comprehensive interfaces for Lighthouse data
interface CategoryScore {
  score: number; // 0-100
  title: string;
}

interface MetricDetail {
  value: number;
  displayValue: string;
  score: number; // 0-1
  numericUnit?: string;
}

interface Opportunity {
  id: string;
  title: string;
  description: string;
  score: number;
  displayValue?: string;
  overallSavingsMs?: number;
  overallSavingsBytes?: number;
  numericValue?: number;
  numericUnit?: string;
  details?: any;
  recommendation: string;
}

interface Diagnostic {
  id: string;
  title: string;
  description: string;
  displayValue?: string;
  numericValue?: number;
  numericUnit?: string;
  details?: any;
}

interface FailedAudit {
  id: string;
  title: string;
  description: string;
  score: number;
  displayValue?: string;
  details?: any;
}

interface ResourceSummary {
  totalRequests: number;
  totalSize: number; // bytes
  totalSizeMB: number; // megabytes for UI
  thirdPartyRequests: number;
  byType: {
    [key: string]: {
      requests: number;
      transferSize: number;
    };
  };
}

interface IssuesByCategory {
  critical: any[];
  high: any[];
  medium: any[];
  low: any[];
}

interface Screenshot {
  data: string; // base64
  timestamp?: number;
  mimeType?: string;
  width?: number;
  height?: number;
}

interface CategoryData {
  score: number;
  opportunities: Opportunity[];
  diagnostics: Diagnostic[];
  failedAudits: FailedAudit[];
  passedAudits: FailedAudit[];
}

interface LighthouseResult {
  url: string;
  finalUrl: string;
  fetchTime: string;
  lighthouseVersion: string;
  warnings: string[];
  
  // Core metrics (Performance category)
  metrics: {
    fcp: MetricDetail; // First Contentful Paint
    lcp: MetricDetail; // Largest Contentful Paint
    cls: MetricDetail; // Cumulative Layout Shift
    speedIndex: MetricDetail;
    tti: MetricDetail; // Time to Interactive
    tbt: MetricDetail; // Total Blocking Time
    maxFid: MetricDetail; // Max Potential First Input Delay
    fmp?: MetricDetail; // First Meaningful Paint
  };
  
  // Categorized data
  performance: CategoryData;
  accessibility: CategoryData;
  bestPractices: CategoryData;
  seo: CategoryData;
  pwa: CategoryData;
  
  // Resource breakdown
  resourceSummary: ResourceSummary;
  
  // Real user data (if available)
  loadingExperience?: any;
  
  // Summary statistics
  summary: {
    totalOpportunities: number;
    totalFailedAudits: number;
    totalPassedAudits: number;
    overallScore: number; // Weighted: Performance(50%), Accessibility(20%), Best Practices(15%), SEO(10%), PWA(5%)
  };
}

// Helper function to get recommendations for opportunities
function getRecommendation(auditId: string): string {
  const recommendations: { [key: string]: string } = {
    'unused-javascript': 'Remove dead code and defer unused scripts. Consider code splitting.',
    'unused-css-rules': 'Remove unused CSS rules and inline critical CSS.',
    'render-blocking-resources': 'Eliminate render-blocking resources by deferring non-critical JS/CSS.',
    'unminified-javascript': 'Minify JavaScript files to reduce payload size.',
    'unminified-css': 'Minify CSS files to reduce network transfer time.',
    'offscreen-images': 'Defer offscreen images using lazy loading.',
    'modern-image-formats': 'Use WebP or AVIF formats for better compression.',
    'uses-optimized-images': 'Compress images to reduce file size.',
    'uses-responsive-images': 'Serve appropriately sized images for different devices.',
    'uses-text-compression': 'Enable text compression (gzip/brotli) on your server.',
    'redirects': 'Minimize redirects to reduce additional roundtrips.',
    'server-response-time': 'Reduce server response time (TTFB) by optimizing backend.',
    'bootup-time': 'Reduce JavaScript execution time by optimizing code.',
    'mainthread-work-breakdown': 'Minimize main thread work by optimizing JavaScript.',
    'third-party-summary': 'Reduce impact of third-party code.',
    'font-display': 'Use font-display: swap to show text immediately.',
    'uses-long-cache-ttl': 'Serve static assets with efficient cache policy.',
    'uses-rel-preconnect': 'Preconnect to required origins to reduce DNS/SSL time.',
    'efficient-animated-content': 'Use video formats for animated content instead of GIFs.',
    'duplicated-javascript': 'Remove duplicate JavaScript modules from bundles.',
  };
  return recommendations[auditId] || 'Review and optimize this aspect for better performance.';
}

// Helper function to calculate resource summary
function calculateResourceSummary(audits: any): ResourceSummary {
  const resourceSummaryAudit = audits['resource-summary'];
  const networkRequestsAudit = audits['network-requests'];
  const thirdPartySummaryAudit = audits['third-party-summary'] || audits['third-parties-insight'];
  
  const summary: ResourceSummary = {
    totalRequests: 0,
    totalSize: 0,
    totalSizeMB: 0,
    thirdPartyRequests: 0,
    byType: {},
  };
  
  // Get total requests from network-requests audit (most accurate)
  if (networkRequestsAudit?.details?.items) {
    summary.totalRequests = networkRequestsAudit.details.items.length;
  }
  
  // Get third-party request count
  if (thirdPartySummaryAudit?.details?.items) {
    summary.thirdPartyRequests = thirdPartySummaryAudit.details.items.reduce((sum: number, item: any) => {
      return sum + (item.mainThreadTime ? 1 : 0);
    }, 0);
  }
  
  // Get breakdown by resource type
  if (resourceSummaryAudit?.details?.items) {
    resourceSummaryAudit.details.items.forEach((item: any) => {
      const resourceType = item.resourceType || 'other';
      const transferSize = item.transferSize || 0;
      
      summary.totalSize += transferSize;
      
      summary.byType[resourceType] = {
        requests: item.requestCount || 0,
        transferSize: transferSize,
      };
    });
    
    // Convert to MB (rounded to 2 decimals)
    summary.totalSizeMB = Math.round((summary.totalSize / (1024 * 1024)) * 100) / 100;
  }
  
  return summary;
}

export async function analyzeLighthouse(url: string): Promise<{ success: boolean; result?: LighthouseResult; error?: string }> {
  try {
    const key = "AIzaSyBybH9QinP7FrDiDgD3K0t_oBahIZXV00A";
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${key}&category=performance&category=accessibility&category=best-practices&category=seo&category=pwa&strategy=mobile`;
    
    const response = await httpClient.get(apiUrl, { timeout: 300000 });
    const data = response.data;
    
    const lighthouseResult = data.lighthouseResult;
    const categories = lighthouseResult?.categories || {};
    const audits = lighthouseResult?.audits || {};
    
    // Build category audit mapping
    const categoryAuditMap: { [key: string]: Set<string> } = {
      performance: new Set(),
      accessibility: new Set(),
      'best-practices': new Set(),
      seo: new Set(),
      pwa: new Set(),
    };
    
    Object.keys(categories).forEach(categoryKey => {
      const category = categories[categoryKey];
      if (category.auditRefs) {
        category.auditRefs.forEach((ref: any) => {
          categoryAuditMap[categoryKey].add(ref.id);
        });
      }
    });
    
    // Initialize category data structures
    const categoryData: { [key: string]: CategoryData } = {
      performance: { score: Math.round((categories.performance?.score || 0) * 100), opportunities: [], diagnostics: [], failedAudits: [], passedAudits: [] },
      accessibility: { score: Math.round((categories.accessibility?.score || 0) * 100), opportunities: [], diagnostics: [], failedAudits: [], passedAudits: [] },
      bestPractices: { score: Math.round((categories['best-practices']?.score || 0) * 100), opportunities: [], diagnostics: [], failedAudits: [], passedAudits: [] },
      seo: { score: Math.round((categories.seo?.score || 0) * 100), opportunities: [], diagnostics: [], failedAudits: [], passedAudits: [] },
      pwa: { score: Math.round((categories.pwa?.score || 0) * 100), opportunities: [], diagnostics: [], failedAudits: [], passedAudits: [] },
    };
    
    // Helper function to determine category for an audit
    const getCategoryForAudit = (auditId: string): string => {
      for (const [categoryKey, auditSet] of Object.entries(categoryAuditMap)) {
        if (auditSet.has(auditId)) {
          return categoryKey === 'best-practices' ? 'bestPractices' : categoryKey;
        }
      }
      return 'performance'; // Default fallback
    };
    
    // Extract detailed metrics
    const metrics = {
      fcp: {
        value: audits['first-contentful-paint']?.numericValue || 0,
        displayValue: audits['first-contentful-paint']?.displayValue || '0 s',
        score: audits['first-contentful-paint']?.score || 0,
        numericUnit: audits['first-contentful-paint']?.numericUnit || 'millisecond',
      },
      lcp: {
        value: audits['largest-contentful-paint']?.numericValue || 0,
        displayValue: audits['largest-contentful-paint']?.displayValue || '0 s',
        score: audits['largest-contentful-paint']?.score || 0,
        numericUnit: audits['largest-contentful-paint']?.numericUnit || 'millisecond',
      },
      cls: {
        value: audits['cumulative-layout-shift']?.numericValue || 0,
        displayValue: audits['cumulative-layout-shift']?.displayValue || '0',
        score: audits['cumulative-layout-shift']?.score || 0,
        numericUnit: audits['cumulative-layout-shift']?.numericUnit || 'unitless',
      },
      speedIndex: {
        value: audits['speed-index']?.numericValue || 0,
        displayValue: audits['speed-index']?.displayValue || '0 s',
        score: audits['speed-index']?.score || 0,
        numericUnit: audits['speed-index']?.numericUnit || 'millisecond',
      },
      tti: {
        value: audits['interactive']?.numericValue || 0,
        displayValue: audits['interactive']?.displayValue || '0 s',
        score: audits['interactive']?.score || 0,
        numericUnit: audits['interactive']?.numericUnit || 'millisecond',
      },
      tbt: {
        value: audits['total-blocking-time']?.numericValue || 0,
        displayValue: audits['total-blocking-time']?.displayValue || '0 ms',
        score: audits['total-blocking-time']?.score || 0,
        numericUnit: audits['total-blocking-time']?.numericUnit || 'millisecond',
      },
      maxFid: {
        value: audits['max-potential-fid']?.numericValue || 0,
        displayValue: audits['max-potential-fid']?.displayValue || '0 ms',
        score: audits['max-potential-fid']?.score || 0,
        numericUnit: audits['max-potential-fid']?.numericUnit || 'millisecond',
      },
      fmp: audits['first-meaningful-paint'] ? {
        value: audits['first-meaningful-paint']?.numericValue || 0,
        displayValue: audits['first-meaningful-paint']?.displayValue || '0 s',
        score: audits['first-meaningful-paint']?.score || 0,
        numericUnit: audits['first-meaningful-paint']?.numericUnit || 'millisecond',
      } : undefined,
    };
    
    // Process all audits and categorize them
    const processedAuditIds = new Set<string>();
    
    Object.keys(audits).forEach(auditId => {
      const audit = audits[auditId];
      if (!audit || processedAuditIds.has(auditId)) return;
      
      const category = getCategoryForAudit(auditId);
      const score = audit.score;
      
      // Skip notApplicable and manual audits
      if (audit.scoreDisplayMode === 'notApplicable' || audit.scoreDisplayMode === 'manual') {
        return;
      }
      
      // Check if it's an opportunity (has savings metrics or metricSavings)
      const hasMetricSavings = audit.scoreDisplayMode === 'metricSavings' || audit.metricSavings;
      const hasSavingsDetails = audit.details?.overallSavingsMs || audit.details?.overallSavingsBytes;
      const isLowScore = score !== null && score < 0.9;
      
      if (hasMetricSavings || (isLowScore && hasSavingsDetails)) {
        const savingsMs = audit.details?.overallSavingsMs || 
                         audit.metricSavings?.FCP || 
                         audit.metricSavings?.LCP || 
                         audit.numericValue || 
                         0;
        
        categoryData[category].opportunities.push({
          id: audit.id,
          title: audit.title,
          description: audit.description,
          score: score || 0,
          displayValue: audit.displayValue,
          overallSavingsMs: savingsMs,
          overallSavingsBytes: audit.details?.overallSavingsBytes,
          numericValue: audit.numericValue,
          numericUnit: audit.numericUnit,
          recommendation: getRecommendation(auditId),
        });
        processedAuditIds.add(auditId);
      }
      // Check if it's a diagnostic (informative)
      else if (audit.scoreDisplayMode === 'informative') {
        categoryData[category].diagnostics.push({
          id: audit.id,
          title: audit.title,
          description: audit.description,
          displayValue: audit.displayValue,
          numericValue: audit.numericValue,
          numericUnit: audit.numericUnit,
        });
        processedAuditIds.add(auditId);
      }
      // Check if it's a binary or numeric audit (pass/fail)
      else if (score !== null && (audit.scoreDisplayMode === 'binary' || audit.scoreDisplayMode === 'numeric')) {
        const auditData = {
          id: audit.id,
          title: audit.title,
          description: audit.description,
          score: score,
          displayValue: audit.displayValue,
        };
        
        if (score < 0.9) {
          categoryData[category].failedAudits.push(auditData);
        } else {
          categoryData[category].passedAudits.push(auditData);
        }
        processedAuditIds.add(auditId);
      }
    });
    
    // Sort opportunities within each category by savings
    Object.values(categoryData).forEach(catData => {
      catData.opportunities.sort((a, b) => (b.overallSavingsMs || 0) - (a.overallSavingsMs || 0));
    });
    
    // Calculate resource summary
    const resourceSummary = calculateResourceSummary(audits);
    
    // Extract loading experience (CrUX data if available)
    const loadingExperience = data.loadingExperience;
    
    // Calculate summary statistics
    const totalOpportunities = Object.values(categoryData).reduce((sum, cat) => sum + cat.opportunities.length, 0);
    const totalFailedAudits = Object.values(categoryData).reduce((sum, cat) => sum + cat.failedAudits.length, 0);
    const totalPassedAudits = Object.values(categoryData).reduce((sum, cat) => sum + cat.passedAudits.length, 0);
    
    // Weighted overall score: Performance(50%), Accessibility(20%), Best Practices(15%), SEO(10%), PWA(5%)
    const overallScore = Math.round(
      (categoryData.performance.score * 0.50) + 
      (categoryData.accessibility.score * 0.20) + 
      (categoryData.bestPractices.score * 0.15) + 
      (categoryData.seo.score * 0.10) + 
      (categoryData.pwa.score * 0.05)
    );
    
    const result: LighthouseResult = {
      url: lighthouseResult.requestedUrl,
      finalUrl: lighthouseResult.finalUrl,
      fetchTime: lighthouseResult.fetchTime,
      lighthouseVersion: lighthouseResult.lighthouseVersion,
      warnings: lighthouseResult.runWarnings || [],
      metrics,
      performance: categoryData.performance,
      accessibility: categoryData.accessibility,
      bestPractices: categoryData.bestPractices,
      seo: categoryData.seo,
      pwa: categoryData.pwa,
      resourceSummary,
      loadingExperience,
      summary: {
        totalOpportunities,
        totalFailedAudits,
        totalPassedAudits,
        overallScore,
      },
    };
    
    return { success: true, result };
    
  } catch (error: any) {
    // Fallback when API is unavailable (rate limited)
    if (error.response?.status === 429 || error.message.includes('429')) {
      return { 
        success: false,
        error: 'API rate limit exceeded. Please try again later.'
      };
    }
    return { success: false, error: error.message };
  }
}

// Helper function to group issues by severity
function groupIssuesBySeverity(lighthouseData: LighthouseResult): IssuesByCategory {
  const grouped: IssuesByCategory = {
    critical: [],
    high: [],
    medium: [],
    low: [],
  };
  
  // Critical: Performance score < 50 OR multiple failed audits in accessibility
  if (lighthouseData.performance.score < 50) {
    grouped.critical.push({
      category: 'performance',
      issue: 'Critical performance issues detected',
      score: lighthouseData.performance.score,
      opportunities: lighthouseData.performance.opportunities.slice(0, 3),
    });
  }
  
  if (lighthouseData.accessibility.failedAudits.length >= 5) {
    grouped.critical.push({
      category: 'accessibility',
      issue: 'Multiple accessibility violations',
      failedCount: lighthouseData.accessibility.failedAudits.length,
      audits: lighthouseData.accessibility.failedAudits.slice(0, 3),
    });
  }
  
  // High: Performance score 50-70, SEO score < 80, security issues
  if (lighthouseData.performance.score >= 50 && lighthouseData.performance.score < 70) {
    grouped.high.push({
      category: 'performance',
      issue: 'Performance needs improvement',
      score: lighthouseData.performance.score,
      topOpportunities: lighthouseData.performance.opportunities.slice(0, 5),
    });
  }
  
  if (lighthouseData.seo.score < 80) {
    grouped.high.push({
      category: 'seo',
      issue: 'SEO optimization needed',
      score: lighthouseData.seo.score,
      failedAudits: lighthouseData.seo.failedAudits,
    });
  }
  
  // Medium: Best practices violations, minor accessibility issues
  if (lighthouseData.bestPractices.failedAudits.length > 0) {
    grouped.medium.push({
      category: 'best-practices',
      issue: 'Best practices violations detected',
      failedCount: lighthouseData.bestPractices.failedAudits.length,
      audits: lighthouseData.bestPractices.failedAudits,
    });
  }
  
  if (lighthouseData.accessibility.failedAudits.length > 0 && lighthouseData.accessibility.failedAudits.length < 5) {
    grouped.medium.push({
      category: 'accessibility',
      issue: 'Minor accessibility improvements needed',
      failedCount: lighthouseData.accessibility.failedAudits.length,
      audits: lighthouseData.accessibility.failedAudits,
    });
  }
  
  // Low: PWA not implemented, minor optimizations
  if (lighthouseData.pwa.score < 50) {
    grouped.low.push({
      category: 'pwa',
      issue: 'Consider implementing Progressive Web App features',
      score: lighthouseData.pwa.score,
      failedAudits: lighthouseData.pwa.failedAudits,
    });
  }
  
  return grouped;
}

export async function analyzeLighthouseWithAI(url: string): Promise<LighthouseResult & { issues?: IssuesByCategory }> {
  const result = await analyzeLighthouse(url);
  
  if (result.success && result.result) {
    const lighthouseData = result.result;
    
    // Group issues by severity
    const issuesBySeverity = groupIssuesBySeverity(lighthouseData);
    
    // Prepare data for AI analysis (optional enhancement)
    const analysisData = {
      url: lighthouseData.url,
      performance: {
        score: lighthouseData.performance.score,
        opportunitiesCount: lighthouseData.performance.opportunities.length,
        failedAuditsCount: lighthouseData.performance.failedAudits.length,
      },
      accessibility: {
        score: lighthouseData.accessibility.score,
        failedAuditsCount: lighthouseData.accessibility.failedAudits.length,
      },
      bestPractices: {
        score: lighthouseData.bestPractices.score,
        failedAuditsCount: lighthouseData.bestPractices.failedAudits.length,
      },
      seo: {
        score: lighthouseData.seo.score,
        failedAuditsCount: lighthouseData.seo.failedAudits.length,
      },
      pwa: {
        score: lighthouseData.pwa.score,
        failedAuditsCount: lighthouseData.pwa.failedAudits.length,
      },
      metrics: lighthouseData.metrics,
      summary: lighthouseData.summary,
      topOpportunities: lighthouseData.performance.opportunities.slice(0, 5),
    };
    
    try {
      const geminiIssues = await generateUniversalSeoIssues(analysisData, 'lighthouse');
      // Merge AI issues with severity-grouped issues if needed
      if (geminiIssues && Array.isArray(geminiIssues)) {
        geminiIssues.forEach((aiIssue: any) => {
          const severity = aiIssue.severity?.toLowerCase() || 'medium';
          if (severity in issuesBySeverity) {
            issuesBySeverity[severity as keyof IssuesByCategory].push({
              ...aiIssue,
              source: 'ai',
            });
          }
        });
      }
    } catch (aiError) {
      console.error('AI analysis failed:', aiError);
      // Continue without AI insights
    }
    
    return {
      ...lighthouseData,
      issues: issuesBySeverity
    };
  }
  
  throw new Error(result.error || 'Lighthouse analysis failed');
}

/**
 * Lighthouse analysis saver with optimized error handling
 */
class LighthouseSaver extends AnalysisSaver {
  private convertMetricScore(score: number): number {
    return Math.round(score * 100);
  }

  async save(analysisResult: LighthouseResult & { issues?: IssuesByCategory }): Promise<void> {
    await this.saveWithErrorHandling('Lighthouse', analysisResult.url, async () => {
      await LighthouseAnalysis.create({
        url: analysisResult.url,
        finalUrl: analysisResult.finalUrl,
        fetchTime: new Date(analysisResult.fetchTime),
        lighthouseVersion: analysisResult.lighthouseVersion,
        
        // Core scores
        performanceScore: analysisResult.performance.score,
        accessibilityScore: analysisResult.accessibility.score,
        bestPracticesScore: analysisResult.bestPractices.score,
        seoScore: analysisResult.seo.score,
        pwaScore: analysisResult.pwa.score,
        overallScore: analysisResult.summary.overallScore,
        
        // Web Vitals metrics - consolidated conversion
        fcpValue: analysisResult.metrics.fcp.value,
        fcpScore: this.convertMetricScore(analysisResult.metrics.fcp.score),
        lcpValue: analysisResult.metrics.lcp.value,
        lcpScore: this.convertMetricScore(analysisResult.metrics.lcp.score),
        clsValue: analysisResult.metrics.cls.value,
        clsScore: this.convertMetricScore(analysisResult.metrics.cls.score),
        speedIndexValue: analysisResult.metrics.speedIndex.value,
        speedIndexScore: this.convertMetricScore(analysisResult.metrics.speedIndex.score),
        ttiValue: analysisResult.metrics.tti.value,
        ttiScore: this.convertMetricScore(analysisResult.metrics.tti.score),
        tbtValue: analysisResult.metrics.tbt.value,
        tbtScore: this.convertMetricScore(analysisResult.metrics.tbt.score),
        
        // Resource metrics
        totalRequests: analysisResult.resourceSummary.totalRequests,
        totalSizeBytes: analysisResult.resourceSummary.totalSize,
        totalSizeMB: analysisResult.resourceSummary.totalSizeMB,
        thirdPartyRequests: analysisResult.resourceSummary.thirdPartyRequests,
        
        // Audit counts
        totalOpportunities: analysisResult.summary.totalOpportunities,
        totalFailedAudits: analysisResult.summary.totalFailedAudits,
        totalPassedAudits: analysisResult.summary.totalPassedAudits,
        
        // Store complete data as JSON - safely
        fullReport: this.safeStringify(analysisResult),
        aiIssues: this.safeStringify(analysisResult.issues),
      });
    });
  }
}

const lighthouseSaver = new LighthouseSaver();

/**
 * Save Lighthouse analysis results to database for historical tracking
 */
export async function saveLighthouseAnalysis(analysisResult: LighthouseResult & { issues?: IssuesByCategory }): Promise<void> {
  await lighthouseSaver.save(analysisResult);
}