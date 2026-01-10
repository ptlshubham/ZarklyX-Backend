// ==================== IMPORTS ====================
import puppeteer, { Browser, Page, HTTPResponse } from 'puppeteer';
import ora from 'ora';
import Table from 'cli-table3';
import fs from 'fs';
import path from 'path';
import { generateUniversalSeoIssues } from '../../../../services/universal-seo-issues';

// ==================== TYPES ====================
interface InternalSEOAnalysisOptions {
  maxDepth?: number;
  maxPages?: number;
  fast?: boolean;
  timeout?: number;
  headless?: boolean;
}

interface AnalysisError {
  success: false;
  error: string;
  processingTime: string;
  timestamp: string;
  code?: string;
}

interface AnalysisSuccess<T> {
  success: true;
  url: string;
  timestamp: string;
  processingTime: string;
  data: T;
}

type AnalysisResult<T> = AnalysisSuccess<T> | AnalysisError;

// ==================== TYPES ====================
interface PageInfo {
  url: string;
  status: 'healthy' | 'broken' | 'redirect';
  statusCode: number;
  depth: number;
  title: string;
  incomingLinks: Set<string>;
  outgoingLinks: Set<string>;
  isOrphan: boolean;
  redirectUrl?: string;
  loadTime: number;
  sizeKb: number;
  h1Count: number;
  hasMetaDescription: boolean;
}

interface LinkStats {
  url: string;
  status: 'healthy' | 'broken' | 'redirect';
  sourcePage: string;
  depth: number;
}

interface SEOReport {
  technicalArchitechure: number;
  totalPages: number;
  totalInternalLinks: number;
  orphanPages: string[];
  brokenLinks: LinkStats[];
  redirectLinks: LinkStats[];
  healthyLinks: LinkStats[];
  linkDistribution: Array<{
    page: string;
    incoming: number;
    outgoing: number;
    depth: number;
  }>;
  depthAnalysis: Record<number, number>;
  performance: {
    averageLoadTime: number;
    fastestPage: string;
    slowestPage: string;
  };
  issues?: any[];
}

interface CrawlOptions {
  maxDepth: number;
  maxPages: number;
  delay: number;
  headless: boolean;
  timeout: number;
}

interface CrawlState {
  browser: Browser | null;
  visited: Map<string, PageInfo>;
  toVisit: Array<{ url: string; depth: number }>;
}

// ==================== URL HELPERS ====================
function normalizeUrl(baseUrl: string, href: string): string | null {
  try {
    if (!href || href.trim() === '') return null;
    
    if (href.startsWith('/')) {
      const base = new URL(baseUrl);
      return `${base.origin}${href}`;
    }
    
    const base = new URL(baseUrl);
    const url = new URL(href, base);
    
    url.hash = '';
    url.search = '';
    
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function isInternalLink(baseDomain: string, url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname === baseDomain || 
           parsedUrl.hostname.endsWith(`.${baseDomain}`) ||
           parsedUrl.hostname.replace('www.', '') === baseDomain.replace('www.', '');
  } catch {
    return false;
  }
}

function getDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return null;
  }
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function getPathDepth(url: string): number {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    if (path === '/' || path === '') return 0;
    
    const segments = path.split('/').filter(segment => segment.length > 0);
    return segments.length;
  } catch {
    return 0;
  }
}

function truncateUrl(url: string, maxLength: number = 40): string {
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength - 3) + '...';
}

// ==================== BROWSER OPERATIONS ====================
async function initializeBrowser(headless: boolean): Promise<Browser> {
  return await puppeteer.launch({
    headless: headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1920, height: 1080 }
  });
}

async function closeBrowser(browser: Browser | null): Promise<void> {
  if (browser) {
    await browser.close();
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== PAGE CRAWLING ====================
async function crawlPage(
  browser: Browser,
  url: string,
  depth: number,
  timeout: number
): Promise<PageInfo> {
  const page = await browser.newPage();
  const pageInfo: PageInfo = {
    url,
    status: 'healthy',
    statusCode: 200,
    depth,
    title: '',
    incomingLinks: new Set<string>(),
    outgoingLinks: new Set<string>(),
    isOrphan: true,
    loadTime: 0,
    sizeKb: 0,
    h1Count: 0,
    hasMetaDescription: false
  };

  try {
    let finalUrl = url;
    let statusCode = 200;
    let redirected = false;
    let redirectUrl = '';

    page.on('response', (response: HTTPResponse) => {
      if (response.url() === url || response.url() === finalUrl) {
        statusCode = response.status();
        
        if (statusCode >= 300 && statusCode < 400) {
          const headers = response.headers();
          if (headers.location) {
            redirected = true;
            redirectUrl = headers.location;
          }
        }
      }
    });

    const startTime = Date.now();
    
    const response = await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout 
    }).catch(() => null);
    
    pageInfo.loadTime = Date.now() - startTime;

    finalUrl = page.url();
    
    if (redirected) {
      pageInfo.status = 'redirect';
      pageInfo.redirectUrl = redirectUrl;
      pageInfo.statusCode = statusCode;
    } else if (statusCode !== 200 || !response) {
      pageInfo.status = 'broken';
      pageInfo.statusCode = statusCode || 0;
    } else {
      pageInfo.status = 'healthy';
      pageInfo.statusCode = statusCode;
      
      const html = await page.content();
      pageInfo.sizeKb = Math.round(html.length / 1024);
      
      pageInfo.title = await page.title();
      
      const metaDescription = await page.$eval(
        'meta[name="description"]', 
        el => el.getAttribute('content')
      ).catch(() => null);
      pageInfo.hasMetaDescription = !!metaDescription;
      
      pageInfo.h1Count = await page.$$eval('h1', elements => elements.length);
      
      const links = await page.$$eval('a[href]', (anchors: HTMLAnchorElement[]) => 
        anchors.map(a => a.href).filter(href => 
          href && !href.startsWith('#') && !href.startsWith('javascript:')
        )
      );
      
      links.forEach(href => {
        const absoluteUrl = normalizeUrl(url, href);
        if (absoluteUrl && isValidUrl(absoluteUrl)) {
          pageInfo.outgoingLinks.add(absoluteUrl);
        }
      });
    }
    
  } catch (error) {
    pageInfo.status = 'broken';
    pageInfo.statusCode = 0;
  } finally {
    await page.close();
  }

  return pageInfo;
}

// ==================== CRAWL ORCHESTRATION ====================
async function crawlSite(
  baseUrl: string,
  baseDomain: string,
  options: any,
  spinner: ora.Ora
): Promise<Map<string, PageInfo>> {
  const state: CrawlState = {
    browser: null,
    visited: new Map<string, PageInfo>(),
    toVisit: [{ url: baseUrl, depth: 0 }]
  };

  state.browser = await initializeBrowser(options.headless);

  while (state.toVisit.length > 0 && state.visited.size < options.maxPages) {
    const current = state.toVisit.shift();
    if (!current || current.depth > options.maxDepth) continue;
    
    const normalizedUrl = normalizeUrl(current.url, current.url);
    if (!normalizedUrl || state.visited.has(normalizedUrl)) continue;
    
    await delay(options.delay);
    
    spinner.text = `Crawling ${state.visited.size + 1}/${options.maxPages} pages (Depth: ${current.depth}): ${truncateUrl(normalizedUrl)}`;
    
    const pageInfo = await crawlPage(state.browser, normalizedUrl, current.depth, options.timeout);
    state.visited.set(normalizedUrl, pageInfo);
    
    if (pageInfo.status === 'healthy') {
      pageInfo.outgoingLinks.forEach(link => {
        if (isInternalLink(baseDomain, link)) {
          const normalizedLink = normalizeUrl(link, link);
          if (normalizedLink && 
              !state.visited.has(normalizedLink) && 
              !state.toVisit.some(item => normalizeUrl(item.url, item.url) === normalizedLink)) {
            state.toVisit.push({ url: normalizedLink, depth: current.depth + 1 });
          }
        }
      });
    }
  }

  await closeBrowser(state.browser);
  return state.visited;
}

// ==================== LINK ANALYSIS ====================
function calculateIncomingLinks(pages: Map<string, PageInfo>, baseDomain: string): void {
  pages.forEach((page) => {
    page.outgoingLinks.forEach((outgoing) => {
      if (isInternalLink(baseDomain, outgoing)) {
        const normalizedOutgoing = normalizeUrl(outgoing, outgoing);
        if (normalizedOutgoing) {
          const targetPage = pages.get(normalizedOutgoing);
          if (targetPage) {
            targetPage.incomingLinks.add(page.url);
          }
        }
      }
    });
  });
}

function markOrphanPages(pages: Map<string, PageInfo>): void {
  const homePage = Array.from(pages.keys())[0];
  pages.forEach((page) => {
    page.isOrphan = page.incomingLinks.size === 0 && page.url !== homePage;
  });
}

function collectLinkStats(pages: Map<string, PageInfo>, baseDomain: string): {
  brokenLinks: LinkStats[];
  redirectLinks: LinkStats[];
  healthyLinks: LinkStats[];
} {
  const brokenLinks: LinkStats[] = [];
  const redirectLinks: LinkStats[] = [];
  const healthyLinks: LinkStats[] = [];

  pages.forEach((page) => {
    if (page.status === 'broken') {
      brokenLinks.push({
        url: page.url,
        status: 'broken',
        sourcePage: 'direct access',
        depth: page.depth
      });
    } else if (page.status === 'redirect') {
      redirectLinks.push({
        url: page.url,
        status: 'redirect',
        sourcePage: 'direct access',
        depth: page.depth
      });
    } else if (page.status === 'healthy') {
      healthyLinks.push({
        url: page.url,
        status: 'healthy',
        sourcePage: 'direct access',
        depth: page.depth
      });
    }
  });

  pages.forEach((page) => {
    page.outgoingLinks.forEach((outgoing) => {
      if (isInternalLink(baseDomain, outgoing)) {
        const normalizedOutgoing = normalizeUrl(outgoing, outgoing);
        if (!normalizedOutgoing) return;

        const targetPage = pages.get(normalizedOutgoing);
        if (!targetPage) {
          brokenLinks.push({
            url: outgoing,
            status: 'broken',
            sourcePage: page.url,
            depth: page.depth
          });
        } else if (targetPage.status === 'broken') {
          brokenLinks.push({
            url: outgoing,
            status: 'broken',
            sourcePage: page.url,
            depth: page.depth
          });
        } else if (targetPage.status === 'redirect') {
          redirectLinks.push({
            url: outgoing,
            status: 'redirect',
            sourcePage: page.url,
            depth: page.depth
          });
        } else {
          healthyLinks.push({
            url: outgoing,
            status: 'healthy',
            sourcePage: page.url,
            depth: page.depth
          });
        }
      }
    });
  });

  return { brokenLinks, redirectLinks, healthyLinks };
}

function removeDuplicateLinks(links: LinkStats[]): LinkStats[] {
  const seen = new Set<string>();
  return links.filter(link => {
    const key = `${link.url}-${link.sourcePage}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function calculateLinkDistribution(pages: Map<string, PageInfo>): Array<{
  page: string;
  incoming: number;
  outgoing: number;
  depth: number;
}> {
  return Array.from(pages.entries()).map(([url, page]) => ({
    page: url,
    incoming: page.incomingLinks.size,
    outgoing: page.outgoingLinks.size,
    depth: page.depth
  }));
}

function calculateDepthAnalysis(pages: Map<string, PageInfo>): Record<number, number> {
  const depthAnalysis: Record<number, number> = {};
  pages.forEach((page) => {
    depthAnalysis[page.depth] = (depthAnalysis[page.depth] || 0) + 1;
  });
  return depthAnalysis;
}

function calculatePerformanceMetrics(pages: Map<string, PageInfo>): {
  averageLoadTime: number;
  fastestPage: string;
  slowestPage: string;
} {
  let totalLoadTime = 0;
  let fastestPage = '';
  let slowestPage = '';
  let fastestTime = Infinity;
  let slowestTime = 0;

  pages.forEach((page) => {
    totalLoadTime += page.loadTime;
    if (page.loadTime < fastestTime && page.status === 'healthy') {
      fastestTime = page.loadTime;
      fastestPage = page.url;
    }
    if (page.loadTime > slowestTime && page.status === 'healthy') {
      slowestTime = page.loadTime;
      slowestPage = page.url;
    }
  });

  const averageLoadTime = pages.size > 0 ? Math.round(totalLoadTime / pages.size) : 0;

  return { averageLoadTime, fastestPage, slowestPage };
}

function analyzeLinks(pages: Map<string, PageInfo>, baseDomain: string) {
  calculateIncomingLinks(pages, baseDomain);
  markOrphanPages(pages);

  const { brokenLinks, redirectLinks, healthyLinks } = collectLinkStats(pages, baseDomain);
  const linkDistribution = calculateLinkDistribution(pages);
  const depthAnalysis = calculateDepthAnalysis(pages);
  const performance = calculatePerformanceMetrics(pages);

  return {
    totalPages: pages.size,
    totalInternalLinks: Array.from(pages.values()).reduce((sum, page) => sum + page.outgoingLinks.size, 0),
    orphanPages: Array.from(pages.values())
      .filter(page => page.isOrphan)
      .map(page => page.url),
    brokenLinks: removeDuplicateLinks(brokenLinks),
    redirectLinks: removeDuplicateLinks(redirectLinks),
    healthyLinks: removeDuplicateLinks(healthyLinks),
    linkDistribution,
    depthAnalysis,
    performance
  };
}

// ==================== SEO SCORE ====================
function calculateSEOScore(analysis: {
  totalPages: number;
  orphanPages: string[];
  brokenLinks: LinkStats[];
  redirectLinks: LinkStats[];
  depthAnalysis: Record<number, number>;
  linkDistribution: Array<{ incoming: number; outgoing: number }>;
  performance: { averageLoadTime: number };
}): number {
  let score = 100;

  const orphanRatio = analysis.orphanPages.length / Math.max(analysis.totalPages, 1);
  const orphanPenalty = Math.min(orphanRatio * 100, 25);
  score -= orphanPenalty;

  const brokenLinkRatio = analysis.brokenLinks.length / Math.max(analysis.totalPages, 1);
  const brokenPenalty = Math.min(brokenLinkRatio * 50, 20);
  score -= brokenPenalty;

  const redirectRatio = analysis.redirectLinks.length / Math.max(analysis.totalPages, 1);
  const redirectPenalty = Math.min(redirectRatio * 30, 15);
  score -= redirectPenalty;

  if (analysis.linkDistribution.length > 0) {
    const avgOutgoing = analysis.linkDistribution.reduce((sum, page) => sum + page.outgoing, 0) / analysis.linkDistribution.length;
    const unbalancedPages = analysis.linkDistribution.filter(page => 
      page.outgoing > avgOutgoing * 3 || page.outgoing === 0
    ).length;
    
    const unbalanceRatio = unbalancedPages / analysis.linkDistribution.length;
    const balancePenalty = Math.min(unbalanceRatio * 30, 15);
    score -= balancePenalty;
  }

  const depthKeys = Object.keys(analysis.depthAnalysis).map(Number);
  const maxDepth = depthKeys.length > 0 ? Math.max(...depthKeys) : 0;
  if (maxDepth > 4) {
    const depthPenalty = Math.min((maxDepth - 4) * 3, 10);
    score -= depthPenalty;
  }

  if (analysis.performance.averageLoadTime > 3000) {
    const performancePenalty = Math.min((analysis.performance.averageLoadTime - 3000) / 100, 10);
    score -= performancePenalty;
  }

  if (analysis.linkDistribution.length > 0) {
    const avgIncoming = analysis.linkDistribution.reduce((sum, page) => sum + page.incoming, 0) / analysis.linkDistribution.length;
    if (avgIncoming < 2) {
      score -= Math.min((2 - avgIncoming) * 2, 5);
    }
  }

  return Math.max(0, Math.round(score));
}

function getScoreCategory(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Good';
  if (score >= 70) return 'Fair';
  if (score >= 60) return 'Poor';
  return 'Critical';
}

// ==================== REPORT GENERATION ====================
function getScoreEmoji(score: number): string {
  if (score >= 90) return '🏆';
  if (score >= 80) return '✅';
  if (score >= 70) return '⚠️';
  if (score >= 60) return '🔶';
  return '❌';
}

function getStatusEmoji(type: string): string {
  switch (type) {
    case 'info': return '📊';
    case 'warning': return '⚠️';
    case 'error': return '❌';
    case 'success': return '✅';
    default: return '📝';
  }
}

function getPerformanceStatus(loadTime: number): string {
  if (loadTime < 1000) return '⚡ Excellent';
  if (loadTime < 2000) return '✅ Good';
  if (loadTime < 3000) return '⚠️ Fair';
  return '❌ Poor';
}

function getPerformanceRating(loadTime: number): string {
  if (loadTime < 1000) return '⚡ Excellent';
  if (loadTime < 2000) return '✅ Good';
  if (loadTime < 3000) return '⚠️ Fair';
  return '❌ Needs Work';
}

function printIssues(report: SEOReport): void {
  const hasIssues = report.orphanPages.length > 0 || report.brokenLinks.length > 0;
  
  if (hasIssues) {
    console.log(' CRITICAL ISSUES FOUND:');
    console.log('='.repeat(40));
    
    if (report.orphanPages.length > 0) {
      console.log(`\n Orphan Pages (${report.orphanPages.length}):`);
      console.log('   Pages with no incoming internal links:');
      report.orphanPages.slice(0, 3).forEach((page, i) => {
        console.log(`   ${i + 1}. ${truncateUrl(page, 55)}`);
      });
      if (report.orphanPages.length > 3) {
        console.log(`   ... and ${report.orphanPages.length - 3} more orphan pages`);
      }
    }

    if (report.brokenLinks.length > 0) {
      console.log(`\nBroken Links (${report.brokenLinks.length}):`);
      console.log('   Links returning error status:');
      report.brokenLinks.slice(0, 3).forEach((link, i) => {
        console.log(`   ${i + 1}. ${truncateUrl(link.url, 50)}`);
        console.log(`      ↳ Source: ${truncateUrl(link.sourcePage, 45)}`);
      });
      if (report.brokenLinks.length > 3) {
        console.log(`   ... and ${report.brokenLinks.length - 3} more broken links`);
      }
    }
    
    console.log('');
  }
}

function printRecommendations(report: SEOReport): void {
  console.log(' ACTIONABLE RECOMMENDATIONS:');
  console.log('='.repeat(35));
  
  const recommendations: string[] = [];

  if (report.technicalArchitechure < 70) {
    recommendations.push('Fix critical SEO issues immediately to improve user experience and search rankings');
  }

  if (report.orphanPages.length > 0) {
    recommendations.push(`Add internal links to ${report.orphanPages.length} orphan pages from your main navigation or content pages`);
  }

  if (report.brokenLinks.length > 0) {
    recommendations.push(`Fix ${report.brokenLinks.length} broken links (update URLs or implement 301 redirects)`);
  }

  if (report.redirectLinks.length > 5) {
    recommendations.push(`Reduce ${report.redirectLinks.length} redirect chains (direct links are better for SEO)`);
  }

  const maxDepth = Math.max(...Object.keys(report.depthAnalysis).map(Number));
  if (maxDepth > 4) {
    recommendations.push(`Important pages should be within 3 clicks from homepage (max depth is ${maxDepth})`);
  }

  const pagesWithNoIncoming = report.linkDistribution.filter(p => p.incoming === 0 && p.depth > 0).length;
  if (pagesWithNoIncoming > 0) {
    recommendations.push(`Improve internal linking for ${pagesWithNoIncoming} pages with no incoming links`);
  }

  if (report.performance.averageLoadTime > 2000) {
    recommendations.push(`Optimize page load times (current average: ${report.performance.averageLoadTime}ms, target: <2000ms)`);
  }

  recommendations.forEach((rec, index) => {
    console.log(`   ${index + 1}. ${rec}`);
  });
  
  console.log('');
}

function generateReport(report: SEOReport): void {
  console.log('\n' + '='.repeat(80));
  console.log(' PUPPETEER INTERNAL SEO ANALYSIS REPORT'.padStart(48));
  console.log('='.repeat(80) + '\n');

  const scoreEmoji = getScoreEmoji(report.technicalArchitechure);
  const scoreCategory = getScoreCategory(report.technicalArchitechure);
  console.log(`${scoreEmoji}  SEO Score: ${report.technicalArchitechure}/100 (${scoreCategory})\n`);

  const summaryTable = new Table({
    head: [' Metric', ' Value', ' Status'],
    colWidths: [30, 20, 25],
    style: { head: ['cyan'] }
  });

  summaryTable.push(
    ['Total Pages', report.totalPages.toString(), getStatusEmoji('info')],
    ['Internal Links', report.totalInternalLinks.toString(), getStatusEmoji('info')],
    ['Orphan Pages', report.orphanPages.length.toString(), report.orphanPages.length === 0 ? '✅ Good' : '⚠️ Needs Fix'],
    ['Broken Links', report.brokenLinks.length.toString(), report.brokenLinks.length === 0 ? '✅ Good' : '❌ Critical'],
    ['Redirect Links', report.redirectLinks.length.toString(), report.redirectLinks.length === 0 ? '✅ Good' : '⚠️ Warning'],
    ['Healthy Links', report.healthyLinks.length.toString(), '✅ Excellent'],
    ['Avg Load Time', `${report.performance.averageLoadTime}ms`, getPerformanceStatus(report.performance.averageLoadTime)]
  );

  console.log(summaryTable.toString() + '\n');

  console.log('🔗 Top 10 Pages by Incoming Links:');
  const linkTable = new Table({
    head: ['Page URL', '⬇Incoming', '⬆ Outgoing', ' Depth'],
    colWidths: [45, 12, 12, 10],
    style: { head: ['green'] }
  });

  report.linkDistribution
    .sort((a, b) => b.incoming - a.incoming)
    .slice(0, 10)
    .forEach(page => {
      const truncated = truncateUrl(page.page, 43);
      linkTable.push([truncated, page.incoming, page.outgoing, `L${page.depth}`]);
    });

  console.log(linkTable.toString() + '\n');

  console.log('🎯 Page Depth Distribution:');
  const depthTable = new Table({
    head: [' Depth Level', ' Page Count', ' Percentage', ' Link Status'],
    colWidths: [15, 15, 20, 20],
    style: { head: ['yellow'] }
  });

  const totalPages = report.totalPages;
  Object.entries(report.depthAnalysis)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .forEach(([depth, count]) => {
      const percentage = ((count / totalPages) * 100).toFixed(1);
      
      const depthLinks = report.linkDistribution.filter(p => p.depth === parseInt(depth));
      const avgIncoming = depthLinks.reduce((sum, p) => sum + p.incoming, 0) / Math.max(depthLinks.length, 1);
      const status = avgIncoming >= 3 ? ' Strong' : avgIncoming >= 1 ? ' Weak' : ' Poor';
      
      depthTable.push([`Level ${depth}`, count.toString(), `${percentage}%`, status]);
    });

  console.log(depthTable.toString() + '\n');

  console.log(' Internal Link Status Overview:');
  const statusTable = new Table({
    head: [' Status', ' Count', ' Percentage', ' Avg Depth'],
    colWidths: [15, 15, 20, 15],
    style: { head: ['magenta'] }
  });

  const totalLinks = report.brokenLinks.length + report.redirectLinks.length + report.healthyLinks.length;
  if (totalLinks > 0) {
    const healthyPercent = ((report.healthyLinks.length / totalLinks) * 100).toFixed(1);
    const brokenPercent = ((report.brokenLinks.length / totalLinks) * 100).toFixed(1);
    const redirectPercent = ((report.redirectLinks.length / totalLinks) * 100).toFixed(1);
    
    const avgHealthyDepth = report.healthyLinks.length > 0 
      ? (report.healthyLinks.reduce((sum, link) => sum + link.depth, 0) / report.healthyLinks.length).toFixed(1)
      : '0';
    const avgBrokenDepth = report.brokenLinks.length > 0 
      ? (report.brokenLinks.reduce((sum, link) => sum + link.depth, 0) / report.brokenLinks.length).toFixed(1)
      : '0';
    const avgRedirectDepth = report.redirectLinks.length > 0 
      ? (report.redirectLinks.reduce((sum, link) => sum + link.depth, 0) / report.redirectLinks.length).toFixed(1)
      : '0';

    statusTable.push(
      ['Healthy', report.healthyLinks.length.toString(), `${healthyPercent}% `, avgHealthyDepth],
      ['Broken', report.brokenLinks.length.toString(), `${brokenPercent}% `, avgBrokenDepth],
      ['Redirect', report.redirectLinks.length.toString(), `${redirectPercent}% `, avgRedirectDepth]
    );
  }

  console.log(statusTable.toString() + '\n');

  console.log('⚡ Performance Overview:');
  const perfTable = new Table({
    head: [' Metric', ' Value', 'Rating'],
    colWidths: [25, 25, 20],
    style: { head: ['blue'] }
  });

  perfTable.push(
    ['Average Load Time', `${report.performance.averageLoadTime}ms`, getPerformanceRating(report.performance.averageLoadTime)],
    ['Fastest Page', truncateUrl(report.performance.fastestPage, 30), '⚡ Lightning'],
    ['Slowest Page', truncateUrl(report.performance.slowestPage, 30), '🐢 Slow']
  );

  console.log(perfTable.toString() + '\n');

  printIssues(report);
  printRecommendations(report);
  
  console.log(' Use --save flag to export full report\n');
}

function groupLinksByDepth(links: LinkStats[]): Record<number, number> {
  const result: Record<number, number> = {};
  links.forEach(link => {
    result[link.depth] = (result[link.depth] || 0) + 1;
  });
  return result;
}

function saveReportToFile(report: SEOReport, filename?: string): void {
  const defaultFilename = `seo-puppeteer-report-${new Date().toISOString().split('T')[0]}.json`;
  const outputFile = filename || defaultFilename;
  
  const reportWithMetadata = {
    ...report,
    generatedAt: new Date().toISOString(),
    analyzer: 'Puppeteer SEO Analyzer v2.0',
    
    linkDistribution: report.linkDistribution.map(item => ({
      ...item,
      page: item.page
    })),
    
    stats: {
      brokenLinksByDepth: groupLinksByDepth(report.brokenLinks),
      redirectLinksByDepth: groupLinksByDepth(report.redirectLinks),
      healthyLinksByDepth: groupLinksByDepth(report.healthyLinks)
    }
  };
  
  fs.writeFileSync(outputFile, JSON.stringify(reportWithMetadata, null, 2));
  console.log(` Full report saved to: ${path.resolve(outputFile)}`);
}



// ==================== MAIN ANALYSIS FUNCTION ====================
export async function analyzeSEOWithPuppeteer(url: string, options: {
  maxDepth?: number;
  maxPages?: number;
  saveReport?: boolean;
  outputFile?: string;
  headless?: any;
  fast?: boolean;
}) {
  const spinner = ora('🚀 Initializing Puppeteer SEO Analyzer...').start();

  try {
    if (!isValidUrl(url)) {
      spinner.fail('Invalid URL provided');
      throw new Error('Invalid URL provided - Please provide a valid URL including protocol (http:// or https://)');
    }

    const normalizedUrl = normalizeUrl(url, url) || url;
    const baseDomain = getDomain(normalizedUrl);

    if (!baseDomain) {
      spinner.fail('Could not extract domain from URL');
      throw new Error('Could not extract domain from URL');
    }

    spinner.text = `🔍 Analyzing: ${normalizedUrl}`;

    const crawlOptions: CrawlOptions = {
      maxDepth: options.maxDepth || 3,
      maxPages: options.maxPages || 30,
      delay: options.fast ? 100 : 500,
      headless: options.headless !== false,
      timeout: 30000
    };

    const pages = await crawlSite(normalizedUrl, baseDomain, crawlOptions, spinner);

    if (pages.size === 0) {
      spinner.fail('No pages could be crawled');
      throw new Error('No pages could be crawled. Possible reasons: Website requires JavaScript, blocks headless browsers, or network issues');
    }

    spinner.text = '📊 Analyzing link structure and calculating metrics...';
    const analysis = analyzeLinks(pages, baseDomain);

    const technicalArchitechure = calculateSEOScore(analysis);

    const report: SEOReport = {
      technicalArchitechure,
      totalPages: analysis.totalPages,
      totalInternalLinks: analysis.totalInternalLinks,
      orphanPages: analysis.orphanPages,
      brokenLinks: analysis.brokenLinks,
      redirectLinks: analysis.redirectLinks,
      healthyLinks: analysis.healthyLinks,
      linkDistribution: analysis.linkDistribution,
      depthAnalysis: analysis.depthAnalysis,
      performance: analysis.performance
    };

    spinner.succeed(`Analysis complete! Crawled ${pages.size} pages`);

    // Only print to console if not in API mode
    if (typeof process !== 'undefined' && process.stdout.isTTY) {
      generateReport(report);
    }

    if (options.saveReport) {
      saveReportToFile(report, options.outputFile);
    }

    // IMPORTANT: Return the report instead of exiting
    return report;

  } catch (error) {
    spinner.fail('Analysis failed');
    
    // Re-throw the error so the handler can catch it
    throw error;
  }
}

/* ===================== HANDLER FUNCTION ===================== */

export async function analyzeInternalSEOHandler(
  url: string, 
  options: InternalSEOAnalysisOptions = {}
): Promise<AnalysisResult<SEOReport>> {
  const startTime = Date.now();
  
  try {
    const { maxDepth = 3, maxPages = 30, fast = false, timeout = 30000, headless = true } = options;

    if (!url) {
      throw new Error('URL is required');
    }

    try {
      new URL(url);
    } catch {
      throw new Error('Invalid URL format. Must include protocol (http:// or https://)');
    }

    console.log(`[${new Date().toISOString()}] Starting Internal SEO analysis for: ${url}`);
    console.log(`[${new Date().toISOString()}] Options: maxDepth=${maxDepth}, maxPages=${maxPages}, fast=${fast}`);

    const report = await analyzeSEOWithPuppeteer(url, {
      maxDepth,
      maxPages,
      fast,
      headless
    });
    
    // Add URL to analysis data for Gemini
    const analysisWithUrl = {
      ...report,
      url: url
    };
    
    // Generate AI recommendations
    const geminiIssues = await generateUniversalSeoIssues(analysisWithUrl, 'internal-seo');
    
    const processingTime = Date.now() - startTime;

    console.log(`[${new Date().toISOString()}] Analysis complete in ${processingTime}ms`);
    console.log(`[${new Date().toISOString()}] Results: ${report.totalPages} pages, SEO score: ${report.technicalArchitechure}/100`);

    return {
      success: true,
      url,
      timestamp: new Date().toISOString(),
      processingTime: `${processingTime}ms`,
      data: {
        ...report,
        issues: geminiIssues
      }
    };

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] Error after ${processingTime}ms:`, error.message);
    console.error(`[${new Date().toISOString()}] Stack trace:`, error.stack);
    
    return {
      success: false,
      error: error.message || 'Internal SEO analysis failed',
      processingTime: `${processingTime}ms`,
      timestamp: new Date().toISOString(),
      code: error.code
    };
  }
}

// ==================== MAIN ANALYSIS FUNCTION ====================
// export async function analyzeSEOWithPuppeteer(url: string, options: {
//   maxDepth?: number;
//   maxPages?: number;
//   saveReport?: boolean;
//   outputFile?: string;
//   headless?: any;
//   fast?: boolean;
// }) {
//   const spinner = ora('🚀 Initializing Puppeteer SEO Analyzer...').start();

//   try {
//     if (!isValidUrl(url)) {
//       spinner.fail('Invalid URL provided');
//       console.error('❌ Please provide a valid URL including protocol (http:// or https://)');
//       process.exit(1);
//     }

//     const normalizedUrl = normalizeUrl(url, url) || url;
//     const baseDomain = getDomain(normalizedUrl);

//     if (!baseDomain) {
//       spinner.fail('Could not extract domain from URL');
//       process.exit(1);
//     }

//     spinner.text = `🔍 Analyzing: ${normalizedUrl}`;

//     const crawlOptions: CrawlOptions = {
//       maxDepth: options.maxDepth || 3,
//       maxPages: options.maxPages || 30,
//       delay: options.fast ? 100 : 500,
//       headless: options.headless !== false,
//       timeout: 30000
//     };

//     const pages = await crawlSite(normalizedUrl, baseDomain, crawlOptions, spinner);

//     if (pages.size === 0) {
//       spinner.fail('No pages could be crawled');
//       console.error('\nPossible reasons:');
//       console.error('• Website requires JavaScript to render content');
//       console.error('• Website blocks headless browsers');
//       console.error('• Network or timeout issues');
//       console.error('\nTry:');
//       console.error('• Increasing timeout with --timeout flag');
//       console.error('• Running in non-headless mode with --visible flag');
//       process.exit(1);
//     }

//     spinner.text = '📊 Analyzing link structure and calculating metrics...';
//     const analysis = analyzeLinks(pages, baseDomain);

//     const seoScore = calculateSEOScore(analysis);

//     const report: SEOReport = {
//       seoScore,
//       totalPages: analysis.totalPages,
//       totalInternalLinks: analysis.totalInternalLinks,
//       orphanPages: analysis.orphanPages,
//       brokenLinks: analysis.brokenLinks,
//       redirectLinks: analysis.redirectLinks,
//       healthyLinks: analysis.healthyLinks,
//       linkDistribution: analysis.linkDistribution,
//       depthAnalysis: analysis.depthAnalysis,
//       performance: analysis.performance
//     };

//     spinner.succeed(`Analysis complete! Crawled ${pages.size} pages`);

//     generateReport(report);

//     if (options.saveReport) {
//       saveReportToFile(report, options.outputFile);
//     }

//   } catch (error) {
//     spinner.fail('Analysis failed');
//     console.error('\n🔥 Error:', error instanceof Error ? error.message : 'Unknown error');
//     console.error('\n💡 Troubleshooting tips:');
//     console.error('• Ensure Puppeteer is installed: npm install puppeteer');
//     console.error('• Try with --visible flag to see browser');
//     console.error('• Reduce --max-pages if website is large');
//     console.error('• Check if website is accessible from your network');
//     process.exit(1);
//   }
// }


export {

  crawlSite,
  analyzeLinks,
  calculateSEOScore,
  getScoreCategory,
  generateReport,
  saveReportToFile,
  normalizeUrl,
  isInternalLink,
  getDomain,
  isValidUrl,
  getPathDepth
}

/* ===================== HANDLER FUNCTION ===================== */

// export async function analyzeInternalSEOHandler(
//   url: string, 
//   options: InternalSEOAnalysisOptions = {}
// ): Promise<AnalysisResult<any>> {
//   const startTime = Date.now();
  
//   try {
//     const { maxDepth = 3, maxPages = 30, fast = false } = options;

//     if (!url) {
//       throw new Error('URL is required');
//     }

//     try {
//       new URL(url);
//     } catch {
//       throw new Error('Invalid URL format. Must include protocol (http:// or https://)');
//     }

//     console.log(`[${new Date().toISOString()}] Internal SEO analysis for: ${url}`);

//     const result = await analyzeSEOWithPuppeteer(url, {
//       maxDepth,
//       maxPages,
//       fast,
//       headless: true
//     });
    
//     const processingTime = Date.now() - startTime;

//     console.log(`[${new Date().toISOString()}] Analysis complete in ${processingTime}ms`);

//     return {
//       success: true,
//       url,
//       timestamp: new Date().toISOString(),
//       processingTime: `${processingTime}ms`,
//       data: result
//     };

//   } catch (error: any) {
//     const processingTime = Date.now() - startTime;
//     console.error(`[${new Date().toISOString()}] Error after ${processingTime}ms:`, error.message);
    
//     return {
//       success: false,
//       error: error.message || 'Internal SEO analysis failed',
//       processingTime: `${processingTime}ms`,
//       timestamp: new Date().toISOString()
//     };
//   }
// }