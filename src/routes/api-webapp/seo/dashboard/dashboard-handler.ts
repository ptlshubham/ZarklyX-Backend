import { httpClient } from '../utils/http-client';
import * as cheerio from 'cheerio';

interface DashboardSummary {
  success: boolean;
  url: string;
  timestamp: string;
  mode: 'quick' | 'comprehensive';
  overallScores: {
    overallSeoScore: number;
    technicalSeo: number;
    onPageSeo: number;
    performance: number;
    accessibility: number;
    grade: string;
  };
  performanceDiagnostics: {
    performanceScore: number;
    bestPracticeScore: number;
    seoScore: number;
    accessibilityScore: number;
    pwaScore?: number;
  };
  coreWebMetrics: {
    firstContentfulPaint: string;
    largestContentfulPaint: string;
    totalBlockingTime: string;
    cumulativeLayoutShift: string;
    speedIndex?: string;
  };
  backlinks: {
    citationFlow: number;
    trustFlow?: number;
    totalBacklinks: number;
    referringDomains?: number;
    newLinks: number;
    lostLinks: number;
    isDemoData?: boolean;
  };
  insights: {
    criticalIssues: number;
    warnings: number;
    suggestions: number;
    passedAudits?: number;
    topIssues: any[];
  };
  recommendations?: string[];
}

/**
 * Quick Dashboard Summary - Basic page analysis
 * For comprehensive dashboard, use getDashboardFromComprehensiveHandler
 */
export async function getDashboardSummaryHandler(url: string): Promise<DashboardSummary> {
  const timestamp = new Date().toISOString();
  
  try {
    // Fetch the page
    const response = await httpClient.get(url);
    const html = response.data;
    const $ = cheerio.load(html);
    const startTime = Date.now();
    const loadTime = Date.now() - startTime;

    // Calculate quick scores
    const technicalSeoScore = calculateTechnicalSeoScore($, response.headers as any, url);
    const onPageSeoScore = calculateSeoScore($);
    const performanceScore = calculatePerformanceScore($, html, loadTime);
    const accessibilityScore = calculateAccessibilityScore($);
    
    const overallSeoScore = Math.round(
      (technicalSeoScore * 0.25) +
      (onPageSeoScore * 0.25) +
      (performanceScore * 0.25) +
      (accessibilityScore * 0.25)
    );

    const bestPracticeScore = calculateBestPracticeScore($, response.headers as any);

    // Calculate Core Web Vitals (estimated from load time)
    const coreWebMetrics = {
      firstContentfulPaint: `${Math.round(loadTime * 0.3)}ms`,
      largestContentfulPaint: `${Math.round(loadTime * 0.6)}ms`,
      totalBlockingTime: `${Math.round(loadTime * 0.2)}ms`,
      cumulativeLayoutShift: '0.0',
      speedIndex: `${Math.round(loadTime * 0.8)}ms`
    };

    // Get real backlinks data (demo mode)
    let backlinks: DashboardSummary['backlinks'] = {
      citationFlow: 0,
      totalBacklinks: 0,
      newLinks: 0,
      lostLinks: 0,
      isDemoData: true
    };
    
    try {
      const { analyzeBacklinksHandler } = await import('../backlinks/backlinks-handler');
      const backlinkResult = await analyzeBacklinksHandler(url);
      backlinks.citationFlow = backlinkResult.summary.citationFlow;
      backlinks.trustFlow = backlinkResult.summary.trustFlow;
      backlinks.totalBacklinks = backlinkResult.summary.totalBacklinks;
      backlinks.referringDomains = backlinkResult.summary.referringDomains;
      backlinks.newLinks = backlinkResult.linkGrowth.newLinks;
      backlinks.lostLinks = backlinkResult.linkGrowth.lostLinks;
      backlinks.isDemoData = backlinkResult.isDemoData;
    } catch (error) {
      console.warn('Backlinks data unavailable, using defaults');
    }

    // Collect quick insights
    const topIssues = [];
    
    // Add basic issues found during quick analysis
    if (!$('title').text()) topIssues.push({ category: 'SEO', issue: 'Missing page title', severity: 'critical' });
    if (!$('meta[name="description"]').attr('content')) topIssues.push({ category: 'SEO', issue: 'Missing meta description', severity: 'high' });
    if ($('h1').length === 0) topIssues.push({ category: 'SEO', issue: 'No H1 heading found', severity: 'high' });
    if ($('img:not([alt])').length > 0) topIssues.push({ category: 'Accessibility', issue: `${$('img:not([alt])').length} images missing alt text`, severity: 'medium' });
    if (!url.startsWith('https://')) topIssues.push({ category: 'Security', issue: 'Not using HTTPS', severity: 'critical' });
    if (!response.headers['strict-transport-security']) topIssues.push({ category: 'Security', issue: 'Missing HSTS header', severity: 'medium' });
    
    const criticalIssues = topIssues.filter(i => i.severity === 'critical').length;
    const warnings = topIssues.filter(i => i.severity === 'high' || i.severity === 'medium').length;
    const suggestions = topIssues.filter(i => i.severity === 'low').length;

    // Grade calculation
    const grade = getGrade(overallSeoScore);

    // Generate recommendations
    const recommendations = generateQuickRecommendations($, response.headers as any, url, overallSeoScore);

    return {
      success: true,
      url,
      timestamp,
      mode: 'quick',
      overallScores: {
        overallSeoScore,
        technicalSeo: technicalSeoScore,
        onPageSeo: onPageSeoScore,
        performance: performanceScore,
        accessibility: accessibilityScore,
        grade
      },
      performanceDiagnostics: {
        performanceScore,
        bestPracticeScore,
        seoScore: onPageSeoScore,
        accessibilityScore
      },
      coreWebMetrics,
      backlinks,
      insights: {
        criticalIssues,
        warnings,
        suggestions,
        topIssues: topIssues.slice(0, 10)
      },
      recommendations
    };

  } catch (error: any) {
    console.error('Dashboard summary error:', error);
    throw new Error(`Failed to generate dashboard summary: ${error.message}`);
  }
}

/**
 * Generate Dashboard from Comprehensive SEO Analysis
 * Uses real data from all SEO modules for accurate metrics
 */
export async function getDashboardFromComprehensiveHandler(comprehensiveResult: any): Promise<DashboardSummary> {
  const timestamp = new Date().toISOString();
  
  try {
    const { url, tabs } = comprehensiveResult;
    
    // Extract scores from comprehensive analysis
    const performanceScore = tabs.performance?.performance?.score || tabs.dashboard?.performance || 0;
    const accessibilityScore = tabs.performance?.accessibility?.score || tabs.dashboard?.accessibility || 0;
    const bestPracticeScore = tabs.performance?.bestPractices?.score || tabs.dashboard?.bestPractices || 0;
    const seoScore = tabs.performance?.seo?.score || tabs.dashboard?.seo || 0;
    const pwaScore = tabs.performance?.pwa?.score || 0;
    
    // Calculate overall SEO score from multiple factors
    const technicalSeoScore = tabs.security ? calculateSecurityScore(tabs.security) : 70;
    const onPageSeoScore = seoScore;
    
    const overallSeoScore = Math.round(
      (performanceScore * 0.20) +
      (accessibilityScore * 0.15) +
      (bestPracticeScore * 0.15) +
      (seoScore * 0.25) +
      (technicalSeoScore * 0.25)
    );
    
    // Extract Core Web Vitals from Lighthouse
    let coreWebMetrics = {
      firstContentfulPaint: 'N/A',
      largestContentfulPaint: 'N/A',
      totalBlockingTime: 'N/A',
      cumulativeLayoutShift: 'N/A',
      speedIndex: 'N/A'
    };
    
    if (tabs.performance?.performance?.diagnostics) {
      const diagnostics = tabs.performance.performance.diagnostics;
      coreWebMetrics = {
        firstContentfulPaint: diagnostics.find((d: any) => d.id === 'first-contentful-paint')?.displayValue || 'N/A',
        largestContentfulPaint: diagnostics.find((d: any) => d.id === 'largest-contentful-paint')?.displayValue || 'N/A',
        totalBlockingTime: diagnostics.find((d: any) => d.id === 'total-blocking-time')?.displayValue || 'N/A',
        cumulativeLayoutShift: diagnostics.find((d: any) => d.id === 'cumulative-layout-shift')?.displayValue || 'N/A',
        speedIndex: diagnostics.find((d: any) => d.id === 'speed-index')?.displayValue || 'N/A'
      };
    }
    
    // Extract backlinks data
    let backlinks = {
      citationFlow: 0,
      trustFlow: 0,
      totalBacklinks: 0,
      referringDomains: 0,
      newLinks: 0,
      lostLinks: 0,
      isDemoData: true
    };
    
    if (tabs.externalSeo) {
      backlinks = {
        citationFlow: tabs.externalSeo.summary?.citationFlow || 0,
        trustFlow: tabs.externalSeo.summary?.trustFlow || 0,
        totalBacklinks: tabs.externalSeo.summary?.totalBacklinks || 0,
        referringDomains: tabs.externalSeo.summary?.referringDomains || 0,
        newLinks: tabs.externalSeo.linkGrowth?.newLinks || 0,
        lostLinks: tabs.externalSeo.linkGrowth?.lostLinks || 0,
        isDemoData: tabs.externalSeo.isDemoData || false
      };
    }
    
    // Aggregate all issues
    const allIssues = tabs.allIssues || [];
    const criticalIssues = allIssues.filter((i: any) => i.severity === 'critical' || i.severity === 'high').length;
    const warnings = allIssues.filter((i: any) => i.severity === 'medium').length;
    const suggestions = allIssues.filter((i: any) => i.severity === 'low' || i.severity === 'info').length;
    
    // Count passed audits
    let passedAudits = 0;
    if (tabs.performance) {
      ['performance', 'accessibility', 'bestPractices', 'seo', 'pwa'].forEach(category => {
        if (tabs.performance[category]?.passedAudits) {
          passedAudits += tabs.performance[category].passedAudits.length;
        }
      });
    }
    
    // Get top issues
    const topIssues = allIssues
      .sort((a: any, b: any) => {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
        return (severityOrder[a.severity as keyof typeof severityOrder] || 5) - 
               (severityOrder[b.severity as keyof typeof severityOrder] || 5);
      })
      .slice(0, 15);
    
    const grade = getGrade(overallSeoScore);
    
    // Generate comprehensive recommendations
    const recommendations = generateComprehensiveRecommendations(tabs, overallSeoScore);
    
    return {
      success: true,
      url,
      timestamp,
      mode: 'comprehensive',
      overallScores: {
        overallSeoScore,
        technicalSeo: technicalSeoScore,
        onPageSeo: onPageSeoScore,
        performance: performanceScore,
        accessibility: accessibilityScore,
        grade
      },
      performanceDiagnostics: {
        performanceScore,
        bestPracticeScore,
        seoScore,
        accessibilityScore,
        pwaScore
      },
      coreWebMetrics,
      backlinks,
      insights: {
        criticalIssues,
        warnings,
        suggestions,
        passedAudits,
        topIssues
      },
      recommendations
    };
    
  } catch (error: any) {
    console.error('Dashboard from comprehensive error:', error);
    throw new Error(`Failed to generate dashboard: ${error.message}`);
  }
}

// Helper: Calculate Technical SEO Score
function calculateTechnicalSeoScore($: cheerio.CheerioAPI, headers: any, url: string): number {
  let score = 100;
  
  // HTTPS check
  if (!url.startsWith('https://')) score -= 15;
  
  // Security headers
  if (!headers['strict-transport-security']) score -= 5;
  if (!headers['x-frame-options']) score -= 5;
  if (!headers['x-content-type-options']) score -= 3;
  if (!headers['content-security-policy']) score -= 5;
  
  // Robots meta
  const robotsMeta = $('meta[name="robots"]').attr('content');
  if (robotsMeta && (robotsMeta.includes('noindex') || robotsMeta.includes('nofollow'))) {
    score -= 10;
  }
  
  // Canonical tag
  if ($('link[rel="canonical"]').length === 0) score -= 5;
  
  // XML sitemap reference
  const hasSitemapLink = $('link[rel="sitemap"]').length > 0;
  if (!hasSitemapLink) score -= 3;
  
  return Math.max(0, Math.min(100, score));
}

// Helper: Calculate On-Page SEO Score
function calculateOnPageSeoScore(internalSeoResult: any): number {
  if (!internalSeoResult.issues) return 70;
  
  let score = 100;
  const criticalCount = internalSeoResult.issues.filter((i: any) => i.severity === 'critical').length;
  const highCount = internalSeoResult.issues.filter((i: any) => i.severity === 'high').length;
  const mediumCount = internalSeoResult.issues.filter((i: any) => i.severity === 'medium').length;
  
  score -= (criticalCount * 15);
  score -= (highCount * 8);
  score -= (mediumCount * 3);
  
  return Math.max(0, Math.min(100, score));
}

// Helper: Calculate Technical Architecture Score
function calculateTechnicalArchitectureScore($: cheerio.CheerioAPI, html: string): number {
  let score = 100;
  
  // HTML5 structure
  const hasSemanticTags = $('header, main, footer, nav, article, section').length > 0;
  if (!hasSemanticTags) score -= 10;
  
  // Structured data
  const hasStructuredData = $('script[type="application/ld+json"]').length > 0;
  if (!hasStructuredData) score -= 15;
  
  // Mobile viewport
  const viewport = $('meta[name="viewport"]').attr('content');
  if (!viewport) score -= 10;
  
  // CSS/JS optimization
  const externalCSS = $('link[rel="stylesheet"]').length;
  const externalJS = $('script[src]').length;
  if (externalCSS > 5) score -= 5;
  if (externalJS > 10) score -= 10;
  
  // Open Graph tags
  const hasOG = $('meta[property^="og:"]').length > 0;
  if (!hasOG) score -= 5;
  
  return Math.max(0, Math.min(100, score));
}

// Helper: Calculate Performance Score
function calculatePerformanceScore($: cheerio.CheerioAPI, html: string, loadTime: number): number {
  let score = 100;
  
  // Load time penalty
  if (loadTime > 3000) score -= 30;
  else if (loadTime > 2000) score -= 15;
  else if (loadTime > 1000) score -= 5;
  
  // Resource count
  const scripts = $('script').length;
  const stylesheets = $('link[rel="stylesheet"]').length;
  const images = $('img').length;
  
  if (scripts > 15) score -= 15;
  if (stylesheets > 5) score -= 10;
  if (images > 50) score -= 10;
  
  // HTML size
  if (html.length > 500000) score -= 10;
  
  return Math.max(0, Math.min(100, score));
}

// Helper: Calculate Best Practice Score
function calculateBestPracticeScore($: cheerio.CheerioAPI, headers: any): number {
  let score = 100;
  
  // HTTPS
  if (!headers['strict-transport-security']) score -= 10;
  
  // Console errors (can't detect, assume good)
  // Deprecated APIs (can't detect, assume good)
  
  // Mixed content (images with http://)
  const httpImages = $('img[src^="http://"]').length;
  if (httpImages > 0) score -= 15;
  
  // Security headers
  if (!headers['x-content-type-options']) score -= 5;
  if (!headers['x-frame-options']) score -= 5;
  
  return Math.max(0, Math.min(100, score));
}

// Helper: Calculate SEO Score
function calculateSeoScore($: cheerio.CheerioAPI): number {
  let score = 100;
  
  // Title
  const title = $('title').text();
  if (!title) score -= 20;
  else if (title.length < 30 || title.length > 60) score -= 5;
  
  // Meta description
  const metaDesc = $('meta[name="description"]').attr('content');
  if (!metaDesc) score -= 15;
  else if (metaDesc.length < 120 || metaDesc.length > 160) score -= 3;
  
  // H1
  const h1Count = $('h1').length;
  if (h1Count === 0) score -= 15;
  else if (h1Count > 1) score -= 5;
  
  // Images without alt
  const totalImages = $('img').length;
  const imagesWithoutAlt = $('img:not([alt])').length;
  if (imagesWithoutAlt > 0) {
    score -= Math.min(20, (imagesWithoutAlt / totalImages) * 20);
  }
  
  // Links
  const links = $('a[href]').length;
  if (links < 5) score -= 5;
  
  return Math.max(0, Math.min(100, score));
}

// Helper: Calculate Accessibility Score
function calculateAccessibilityScore($: cheerio.CheerioAPI): number {
  let score = 100;
  
  // Images without alt
  const imagesWithoutAlt = $('img:not([alt])').length;
  if (imagesWithoutAlt > 0) score -= Math.min(20, imagesWithoutAlt * 2);
  
  // Form labels
  const inputs = $('input:not([type="hidden"])').length;
  const labels = $('label').length;
  if (inputs > labels) score -= 10;
  
  // Lang attribute
  if (!$('html').attr('lang')) score -= 10;
  
  // ARIA labels (basic check)
  const ariaElements = $('[aria-label], [aria-labelledby]').length;
  if (ariaElements === 0 && inputs > 0) score -= 5;
  
  // Skip links
  const hasSkipLink = $('a[href^="#"]').first().text().toLowerCase().includes('skip');
  if (!hasSkipLink && $('main, article').length > 0) score -= 5;
  
  return Math.max(0, Math.min(100, score));
}

// Helper: Calculate Security Score from security analysis
function calculateSecurityScore(securityData: any): number {
  if (!securityData?.headers) return 50;
  
  let score = 100;
  const headers = securityData.headers;
  
  Object.values(headers).forEach((header: any) => {
    if (header.status === 'missing' || header.status === 'insecure') {
      if (header.severity === 'critical') score -= 15;
      else if (header.severity === 'high') score -= 10;
      else if (header.severity === 'medium') score -= 5;
      else score -= 2;
    }
  });
  
  return Math.max(0, Math.min(100, score));
}

// Helper: Get grade from score
function getGrade(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

// Helper: Generate quick recommendations
function generateQuickRecommendations(
  $: cheerio.CheerioAPI, 
  headers: any, 
  url: string, 
  score: number
): string[] {
  const recommendations: string[] = [];
  
  if (score < 70) {
    recommendations.push('Consider running a comprehensive SEO analysis for detailed insights');
  }
  
  if (!url.startsWith('https://')) {
    recommendations.push('Migrate to HTTPS to improve security and SEO rankings');
  }
  
  if (!$('title').text()) {
    recommendations.push('Add a descriptive page title (50-60 characters)');
  }
  
  if (!$('meta[name="description"]').attr('content')) {
    recommendations.push('Add a compelling meta description (120-160 characters)');
  }
  
  if ($('h1').length === 0) {
    recommendations.push('Add an H1 heading to clearly define page topic');
  }
  
  if ($('img:not([alt])').length > 0) {
    recommendations.push(`Add alt text to ${$('img:not([alt])').length} images for accessibility`);
  }
  
  if (!headers['strict-transport-security']) {
    recommendations.push('Enable HSTS header for enhanced security');
  }
  
  if (!$('script[type="application/ld+json"]').length) {
    recommendations.push('Add structured data (Schema.org) for better search results');
  }
  
  return recommendations.slice(0, 8);
}

// Helper: Generate comprehensive recommendations
function generateComprehensiveRecommendations(tabs: any, score: number): string[] {
  const recommendations: string[] = [];
  
  // Performance recommendations
  if (tabs.performance?.performance?.opportunities) {
    tabs.performance.performance.opportunities
      .slice(0, 3)
      .forEach((opp: any) => {
        if (opp.overallSavingsMs > 1000) {
          recommendations.push(`${opp.title}: Save ${(opp.overallSavingsMs / 1000).toFixed(1)}s`);
        }
      });
  }
  
  // Security recommendations
  if (tabs.security?.headers) {
    const missingHeaders = Object.values(tabs.security.headers)
      .filter((h: any) => h.status === 'missing')
      .slice(0, 2);
    missingHeaders.forEach((h: any) => {
      recommendations.push(`Security: Enable ${h.header} header`);
    });
  }
  
  // SEO recommendations
  if (tabs.internalSeo?.issues) {
    const highPriorityIssues = tabs.internalSeo.issues
      .filter((i: any) => i.severity === 'critical' || i.severity === 'high')
      .slice(0, 3);
    highPriorityIssues.forEach((issue: any) => {
      recommendations.push(`SEO: ${issue.title || issue.issue}`);
    });
  }
  
  // Accessibility recommendations
  if (tabs.performance?.accessibility?.failedAudits) {
    tabs.performance.accessibility.failedAudits
      .slice(0, 2)
      .forEach((audit: any) => {
        recommendations.push(`Accessibility: ${audit.title}`);
      });
  }
  
  // JavaScript optimization
  if (tabs.javascript?.unusedJavaScript) {
    const totalWaste = tabs.javascript.unusedJavaScript
      .reduce((sum: number, js: any) => sum + (js.wastedBytes || 0), 0);
    if (totalWaste > 50000) {
      recommendations.push(`Remove ${(totalWaste / 1024).toFixed(0)}KB of unused JavaScript`);
    }
  }
  
  // General recommendation based on score
  if (score < 60) {
    recommendations.unshift('⚠️ Critical: Address high-priority issues first for maximum impact');
  } else if (score < 80) {
    recommendations.unshift('Focus on performance and security improvements');
  } else {
    recommendations.unshift('✅ Good foundation! Focus on fine-tuning for best results');
  }
  
  return recommendations.slice(0, 10);
}
