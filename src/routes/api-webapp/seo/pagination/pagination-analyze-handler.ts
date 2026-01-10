// pagination-seo-analyzer.ts
import puppeteer, { Browser, Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import { generateUniversalSeoIssues } from '../../../../services/universal-seo-issues';

/* ===================== CONSTANTS ===================== */

const PAGINATION_INDICATORS = [
  'page', 'p', 'pagenumber', 'pg', 'paging', 'paginate',
  'next', 'prev', 'previous', 'first', 'last',
  'pagination', 'pages', 'current-page', 'page-number',
  'offset', 'limit', 'start', 'per_page', 'per-page',
  'show', 'display', 'view', 'from', 'size'
] as const;

const PAGINATION_SELECTORS = [
  '.pagination', '.pager', '.page-nav', '.page-numbers',
  '.paging', '.paginate', '[rel="next"]', '[rel="prev"]',
  '[aria-label*="pagination"]', '[aria-label*="page"]',
  '[role="navigation"]', '.next', '.previous', '.first', '.last',
  'a[href*="page="]', 'a[href*="p="]', 'a[href*="/page/"]',
  'a[href*="/p/"]', 'ul.pagination', 'nav.pagination',
  '.load-more', '.view-more', '.infinite-scroll',
  '[data-page]', '[data-pagination]'
] as const;

const PAGINATION_TYPES = {
  REL_NEXT_PREV: 'rel_next_prev',
  QUERY_PARAMETERS: 'query_parameters',
  PATH_BASED: 'path_based',
  VIEW_ALL: 'view_all',
  INFINITE_SCROLL: 'infinite_scroll',
  LOAD_MORE: 'load_more',
  AJAX: 'ajax',
  HASH_BANG: 'hash_bang',
  SESSION: 'session',
  COOKIE: 'cookie'
} as const;

const PARAMETER_TYPES = {
  QUERY: 'query',
  PATH: 'path',
  MATRIX: 'matrix',
  HYBRID: 'hybrid',
  FRAGMENT: 'fragment'
} as const;

const SEO_RISK_LEVELS = {
  NONE: 'none',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
} as const;

const CRAWL_PRIORITY = {
  HIGHEST: 1.0,
  HIGH: 0.8,
  MEDIUM: 0.5,
  LOW: 0.3,
  LOWEST: 0.1
} as const;

/* ===================== TYPES ===================== */

type PaginationType = typeof PAGINATION_TYPES[keyof typeof PAGINATION_TYPES];
type ParameterType = typeof PARAMETER_TYPES[keyof typeof PARAMETER_TYPES];
type SEORiskLevel = typeof SEO_RISK_LEVELS[keyof typeof SEO_RISK_LEVELS];
type CrawlPriority = typeof CRAWL_PRIORITY[keyof typeof CRAWL_PRIORITY];
type Performance = 'fast' | 'moderate' | 'slow' | 'error';

interface PaginationAnalysisOptions {
  maxPages?: number;
  followPagination?: boolean;
  timeout?: number;
  headless?: any;
  maxUrls?: number; // Maximum number of URLs to analyze from sitemap
  sitemapUrl?: string; // Optional custom sitemap URL
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

interface PaginationLink {
  url: string;
  text: string;
  rel: string | null;
  ariaLabel: string | null;
  pageNumber: number | null;
  isCurrent: boolean;
  type: 'number' | 'next' | 'prev' | 'first' | 'last' | 'ellipsis';
}

interface PaginationDetection {
  isPaginationPresent: boolean;
  paginationType: PaginationType;
  parameterType: ParameterType;
  currentPage: number;
  totalPages: number | null;
  pageSize: number | null;
  paginationLinks: PaginationLink[];
  detectedSelectors: string[];
  paginationDepth: number;
  hasInfiniteScroll: boolean;
  hasLoadMore: boolean;
  hasViewAll: boolean;
}

interface PaginationSEOAnalysis {
  url: string;
  canonicalUrl: string | null;
  hasCanonicalTag: boolean;
  canonicalConflict: boolean;
  hasRelNextPrev: boolean;
  relNextUrl: string | null;
  relPrevUrl: string | null;
  noindexPresent: boolean;
  nofollowPresent: boolean;
  duplicateUrls: string[];
  indexedPages: string[];
  blockedPages: string[];
  matrixParametersPresent: boolean;
  crawlPriority: CrawlPriority;
  indexingBehavior: 'index' | 'noindex' | 'partial-index';
}

interface PaginationRiskAssessment {
  duplicateContentRisk: SEORiskLevel;
  canonicalConflictRisk: SEORiskLevel;
  deepPaginationRisk: SEORiskLevel;
  infiniteScrollRisk: SEORiskLevel;
  crawlBudgetRisk: SEORiskLevel;
  overallRisk: SEORiskLevel;
  issues: string[];
  recommendations: string[];
}

interface PaginationPageAnalysis {
  url: string;
  status: number;
  loadTimeMs: number;
  sizeKb: number;
  performance: Performance;
  title: string;
  metaDescription: string;
  h1Count: number;
  imageCount: number;
  imagesWithAlt: number;
  dynamicScore: number;
  pagination: PaginationDetection;
  seo: PaginationSEOAnalysis;
  risks: PaginationRiskAssessment;
  structuredData: {
    hasSchema: boolean;
    totalSchemas: number;
    schemas: any[];
    hasPaginationSchema: boolean;
  };
}

interface SiteWidePaginationAnalysis {
  summary: {
    totalPagesAnalyzed: number;
    paginatedPages: number;
    paginationTypesFound: PaginationType[];
    averagePaginationDepth: number;
    highestPaginationDepth: number;
    seoRiskScore: number;
    pagesWithIssues: number;
    crawlEfficiency: number;
    sitemapUrlsFound: number;
    sitemapUrlsAnalyzed: number;
  };
  paginationPatterns: {
    mostCommonType: PaginationType;
    parameterDistribution: Record<ParameterType, number>;
    indexationRate: number;
    canonicalCoverage: number;
    relNextPrevCoverage: number;
  };
  recommendations: {
    highPriority: string[];
    mediumPriority: string[];
    lowPriority: string[];
  };
  pages: PaginationPageAnalysis[];
  issues?: any[];
}

/* ===================== SITEMAP CRAWLER ===================== */

async function fetchSitemapUrls(
  browser: Browser, 
  baseUrl: string, 
  sitemapUrl?: string
): Promise<string[]> {
  const page = await browser.newPage();
  const urls: Set<string> = new Set();
  
  try {
    // Try common sitemap locations if not provided
    const sitemapLocations = [
      sitemapUrl,
      `${baseUrl}/sitemap.xml`,
      `${baseUrl}/sitemap_index.xml`,
      `${baseUrl}/sitemap.txt`,
      `${baseUrl}/sitemap/`,
      `${baseUrl}/wp-sitemap.xml`,
    ].filter(Boolean);

    for (const location of sitemapLocations) {
      if (!location) continue;
      
      try {
        console.log(`Trying sitemap location: ${location}`);
        const response = await page.goto(location, {
          waitUntil: 'domcontentloaded',
          timeout: 10000
        });

        if (response && response.status() === 200) {
          const content = await page.content();
          const $ = cheerio.load(content);
          
          // Parse XML sitemap
          $('loc').each((_, element) => {
            const url = $(element).text().trim();
            if (url && new URL(url).hostname === new URL(baseUrl).hostname) {
              urls.add(normalizeUrl(url));
            }
          });
          
          // Parse text sitemap
          const textContent = await page.evaluate(() => document.body.textContent);
          if (textContent) {
            textContent.split('\n').forEach(line => {
              const trimmed = line.trim();
              if (trimmed.startsWith('http')) {
                try {
                  const url = new URL(trimmed);
                  if (url.hostname === new URL(baseUrl).hostname) {
                    urls.add(normalizeUrl(trimmed));
                  }
                } catch {}
              }
            });
          }
          
          // If we found URLs, break
          if (urls.size > 0) {
            console.log(`Found ${urls.size} URLs in sitemap: ${location}`);
            break;
          }
        }
      } catch (error) {
        console.log(`Failed to fetch sitemap: ${location}`);
        continue;
      }
    }
    
    // If no sitemap found, try to crawl homepage for links
    if (urls.size === 0) {
      console.log('No sitemap found, crawling homepage for links');
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      const html = await page.content();
      const $ = cheerio.load(html);
      
      $('a[href]').each((_, element) => {
        try {
          const href = $(element).attr('href');
          if (href) {
            const fullUrl = new URL(href, baseUrl).href;
            if (new URL(fullUrl).hostname === new URL(baseUrl).hostname) {
              urls.add(normalizeUrl(fullUrl));
            }
          }
        } catch {}
      });
    }
  } catch (error) {
    console.error('Error fetching sitemap:', error);
  } finally {
    await page.close();
  }
  
  return Array.from(urls);
}

/* ===================== URL HELPERS ===================== */

function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    urlObj.hash = '';
    urlObj.pathname = urlObj.pathname.replace(/\/$/, '');
    urlObj.searchParams.sort();
    return urlObj.toString();
  } catch {
    return url.replace(/#.*$/, '').replace(/\/$/, '');
  }
}

function isInternal(url: string, hostname: string): boolean {
  try {
    return new URL(url).hostname === hostname;
  } catch {
    return false;
  }
}

/* ===================== PAGE NUMBER EXTRACTION ===================== */

function extractPageNumber(url: string, text: string): number | null {
  const urlMatch = url.match(/(?:page|p|pg|pagenumber)=?(\d+)/i);
  if (urlMatch) return parseInt(urlMatch[1], 10);
  
  const textMatch = text.match(/\b(\d+)\b/);
  if (textMatch) return parseInt(textMatch[1], 10);
  
  const pathMatch = url.match(/\/page\/(\d+)\b|\/p\/(\d+)\b|\/(\d+)\/?$/);
  if (pathMatch) {
    for (let i = 1; i < pathMatch.length; i++) {
      if (pathMatch[i]) return parseInt(pathMatch[i], 10);
    }
  }
  
  return null;
}

/* ===================== PAGINATION TYPE DETECTION ===================== */

function detectPaginationType(links: PaginationLink[]): PaginationType {
  const hasRelNextPrev = links.some(link => 
    link.rel && (link.rel.includes('next') || link.rel.includes('prev'))
  );
  const hasQueryParams = links.some(link => 
    link.url.includes('?page=') || link.url.includes('?p=')
  );
  const hasPathBased = links.some(link => 
    /\/page\/\d+|\/p\/\d+/.test(link.url)
  );
  const hasMatrix = links.some(link => 
    link.url.includes(';page=') || link.url.includes(';p=')
  );
  
  if (hasRelNextPrev) return PAGINATION_TYPES.REL_NEXT_PREV;
  if (hasQueryParams) return PAGINATION_TYPES.QUERY_PARAMETERS;
  if (hasPathBased) return PAGINATION_TYPES.PATH_BASED;
  if (hasMatrix) return PAGINATION_TYPES.AJAX;
  return PAGINATION_TYPES.QUERY_PARAMETERS;
}

function detectParameterType(url: string): ParameterType {
  if (url.includes(';page=') || url.includes(';p=')) return PARAMETER_TYPES.MATRIX;
  if (url.includes('/page/') || url.includes('/p/')) return PARAMETER_TYPES.PATH;
  if (url.includes('?page=') || url.includes('?p=')) return PARAMETER_TYPES.QUERY;
  if (url.includes('#page=') || url.includes('#p=')) return PARAMETER_TYPES.FRAGMENT;
  return PARAMETER_TYPES.QUERY;
}

/* ===================== CRAWL PRIORITY ===================== */

function calculateCrawlPriority(pageNum: number, totalPages: number | null): CrawlPriority {
  if (pageNum === 1) return CRAWL_PRIORITY.HIGHEST;
  if (pageNum <= 3) return CRAWL_PRIORITY.HIGH;
  if (totalPages && pageNum <= Math.min(10, totalPages * 0.1)) return CRAWL_PRIORITY.MEDIUM;
  if (pageNum <= 20) return CRAWL_PRIORITY.LOW;
  return CRAWL_PRIORITY.LOWEST;
}

/* ===================== PAGE SIZE ESTIMATION ===================== */

function estimatePageSize($: cheerio.CheerioAPI): number | null {
  const contentSelectors = [
    'li', '.product', '.item', '.article', '.post', '.card',
    'tr', 'tbody > tr', '[data-item]'
  ];
  
  for (const selector of contentSelectors) {
    const count = $(selector).length;
    if (count > 5 && count < 100) {
      return count;
    }
  }
  
  return null;
}

/* ===================== PAGINATION LINK EXTRACTION ===================== */

function extractPaginationLinks($: cheerio.CheerioAPI, url: string): {
  paginationLinks: PaginationLink[];
  detectedSelectors: string[];
} {
  const paginationLinks: PaginationLink[] = [];
  const detectedSelectors: string[] = [];
  
  PAGINATION_SELECTORS.forEach(selector => {
    if ($(selector).length > 0) {
      detectedSelectors.push(selector);
      
      $(selector).find('a[href]').each((_, element) => {
        const href = $(element).attr('href');
        if (!href) return;
        
        const fullUrl = new URL(href, url).href;
        const text = $(element).text().trim() || $(element).attr('aria-label') || '';
        const rel = $(element).attr('rel') || null;
        const ariaLabel = $(element).attr('aria-label') || null;
        
        const pageNumber = extractPageNumber(fullUrl, text);
        const isCurrent = $(element).closest('.active, .current, [aria-current="page"]').length > 0;
        
        let type: PaginationLink['type'] = 'number';
        if (rel?.includes('next')) type = 'next';
        else if (rel?.includes('prev') || rel?.includes('previous')) type = 'prev';
        else if (text.toLowerCase().includes('next')) type = 'next';
        else if (text.toLowerCase().includes('prev')) type = 'prev';
        else if (text.toLowerCase().includes('first')) type = 'first';
        else if (text.toLowerCase().includes('last')) type = 'last';
        else if (text === '...' || text === '…') type = 'ellipsis';
        else if (pageNumber !== null) type = 'number';
        
        paginationLinks.push({
          url: normalizeUrl(fullUrl),
          text,
          rel,
          ariaLabel,
          pageNumber,
          isCurrent,
          type
        });
      });
    }
  });
  
  return { paginationLinks, detectedSelectors };
}

/* ===================== INFINITE SCROLL DETECTION ===================== */

function detectInfiniteScroll($: cheerio.CheerioAPI): {
  hasInfiniteScroll: boolean;
  hasLoadMore: boolean;
  hasViewAll: boolean;
} {
  const hasInfiniteScroll = $('[class*="infinite"], [data-infinite], [id*="infinite"]').length > 0 ||
                           $('script').filter((_, el) => 
                             $(el).html()?.toLowerCase().includes('infinite') || false
                           ).length > 0;
  
  const hasLoadMore = $('.load-more, .view-more, .show-more, [class*="loadmore"]').length > 0;
  const hasViewAll = $('a[href*="view=all"], a[href*="show=all"], a:contains("View All")').length > 0;
  
  return { hasInfiniteScroll, hasLoadMore, hasViewAll };
}

/* ===================== CURRENT PAGE DETECTION ===================== */

function detectCurrentPage(
  paginationLinks: PaginationLink[], 
  url: string
): number {
  const currentLink = paginationLinks.find(link => link.isCurrent);
  if (currentLink?.pageNumber) {
    return currentLink.pageNumber;
  }
  
  const pageFromUrl = extractPageNumber(url, '');
  return pageFromUrl || 1;
}

/* ===================== TOTAL PAGES ESTIMATION ===================== */

function estimateTotalPages(paginationLinks: PaginationLink[]): number | null {
  const numericLinks = paginationLinks
    .filter(link => link.pageNumber !== null)
    .map(link => link.pageNumber as number);
  
  if (numericLinks.length === 0) return null;
  
  let totalPages = Math.max(...numericLinks);
  const lastLink = paginationLinks.find(link => link.type === 'last');
  if (lastLink?.pageNumber) {
    totalPages = Math.max(totalPages, lastLink.pageNumber);
  }
  
  return totalPages;
}

/* ===================== PAGINATION DETECTION ===================== */

function detectPagination($: cheerio.CheerioAPI, url: string): PaginationDetection {
  const { paginationLinks, detectedSelectors } = extractPaginationLinks($, url);
  
  const urlObj = new URL(url);
  const hasPaginationInUrl = PAGINATION_INDICATORS.some(indicator => {
    return urlObj.searchParams.has(indicator) || 
           urlObj.pathname.toLowerCase().includes(indicator);
  });
  
  if (hasPaginationInUrl && paginationLinks.length === 0) {
    detectedSelectors.push('url_pattern');
  }
  
  const { hasInfiniteScroll, hasLoadMore, hasViewAll } = detectInfiniteScroll($);
  
  const currentPage = detectCurrentPage(paginationLinks, url);
  const totalPages = estimateTotalPages(paginationLinks);
  const paginationType = detectPaginationType(paginationLinks);
  const parameterType = detectParameterType(url);
  
  return {
    isPaginationPresent: paginationLinks.length > 0 || hasPaginationInUrl || hasInfiniteScroll || hasLoadMore,
    paginationType,
    parameterType,
    currentPage,
    totalPages,
    pageSize: estimatePageSize($),
    paginationLinks,
    detectedSelectors,
    paginationDepth: currentPage,
    hasInfiniteScroll,
    hasLoadMore,
    hasViewAll
  };
}

/* ===================== DUPLICATE URL DETECTION ===================== */

function findDuplicateUrls(currentUrl: string): string[] {
  const duplicates: string[] = [];
  const urlObj = new URL(currentUrl);
  
  if (urlObj.searchParams.has('page') || urlObj.searchParams.has('p')) {
    const pathBased = new URL(currentUrl);
    const pageNum = urlObj.searchParams.get('page') || urlObj.searchParams.get('p');
    pathBased.searchParams.delete('page');
    pathBased.searchParams.delete('p');
    pathBased.pathname = `${pathBased.pathname.replace(/\/$/, '')}/page/${pageNum}`;
    duplicates.push(pathBased.toString());
  }
  
  const withSlash = currentUrl.endsWith('/') ? currentUrl.slice(0, -1) : currentUrl + '/';
  duplicates.push(withSlash);
  
  if (urlObj.hostname.startsWith('www.')) {
    const nonWww = new URL(currentUrl);
    nonWww.hostname = nonWww.hostname.replace('www.', '');
    duplicates.push(nonWww.toString());
  }
  
  if (urlObj.protocol === 'https:') {
    const httpUrl = new URL(currentUrl);
    httpUrl.protocol = 'http:';
    duplicates.push(httpUrl.toString());
  }
  
  return duplicates.map(url => normalizeUrl(url));
}

/* ===================== CANONICAL & REL EXTRACTION ===================== */

function extractCanonicalAndRel($: cheerio.CheerioAPI, url: string): {
  canonicalUrl: string | null;
  hasCanonicalTag: boolean;
  canonicalConflict: boolean;
  relNextUrl: string | null;
  relPrevUrl: string | null;
  hasRelNextPrev: boolean;
} {
  const canonicalUrl = $('link[rel="canonical"]').attr('href') || null;
  const hasCanonicalTag = !!canonicalUrl;
  
  const canonicalConflict = canonicalUrl ? 
    normalizeUrl(canonicalUrl) !== normalizeUrl(url) && 
    !canonicalUrl.includes('view=all') : false;
  
  const relNextUrl = $('link[rel="next"]').attr('href') || null;
  const relPrevUrl = $('link[rel="prev"]').attr('href') || null;
  const hasRelNextPrev = !!(relNextUrl || relPrevUrl);
  
  return {
    canonicalUrl: canonicalUrl ? normalizeUrl(canonicalUrl) : null,
    hasCanonicalTag,
    canonicalConflict,
    relNextUrl: relNextUrl ? normalizeUrl(relNextUrl) : null,
    relPrevUrl: relPrevUrl ? normalizeUrl(relPrevUrl) : null,
    hasRelNextPrev
  };
}

/* ===================== ROBOTS META EXTRACTION ===================== */

function extractRobotsMeta($: cheerio.CheerioAPI): {
  noindexPresent: boolean;
  nofollowPresent: boolean;
} {
  const robotsMeta = $('meta[name="robots"], meta[name="ROBOTS"]').attr('content') || '';
  const noindexPresent = robotsMeta.toLowerCase().includes('noindex');
  const nofollowPresent = robotsMeta.toLowerCase().includes('nofollow');
  
  return { noindexPresent, nofollowPresent };
}

/* ===================== INDEXED/BLOCKED PAGES ===================== */

function categorizePages(pagination: PaginationDetection): {
  indexedPages: string[];
  blockedPages: string[];
} {
  const indexedPages: string[] = [];
  const blockedPages: string[] = [];
  
  pagination.paginationLinks.forEach(link => {
    if (link.pageNumber && link.pageNumber <= 5) {
      indexedPages.push(link.url);
    } else if (link.pageNumber && link.pageNumber > 10) {
      blockedPages.push(link.url);
    }
  });
  
  return { indexedPages, blockedPages };
}

/* ===================== INDEXING BEHAVIOR ===================== */

function determineIndexingBehavior(
  noindexPresent: boolean,
  currentPage: number
): 'index' | 'noindex' | 'partial-index' {
  if (noindexPresent) return 'noindex';
  if (currentPage > 5) return 'partial-index';
  return 'index';
}

/* ===================== SEO ANALYSIS ===================== */

function analyzeSEO(
  $: cheerio.CheerioAPI, 
  url: string, 
  pagination: PaginationDetection
): PaginationSEOAnalysis {
  const canonical = extractCanonicalAndRel($, url);
  const robots = extractRobotsMeta($);
  const duplicateUrls = findDuplicateUrls(url);
  const { indexedPages, blockedPages } = categorizePages(pagination);
  
  const matrixParametersPresent = pagination.parameterType === PARAMETER_TYPES.MATRIX ||
                                 url.includes(';page=') || url.includes(';p=');
  
  const crawlPriority = calculateCrawlPriority(
    pagination.currentPage,
    pagination.totalPages
  );
  
  const indexingBehavior = determineIndexingBehavior(
    robots.noindexPresent,
    pagination.currentPage
  );
  
  return {
    url: normalizeUrl(url),
    ...canonical,
    ...robots,
    duplicateUrls,
    indexedPages,
    blockedPages,
    matrixParametersPresent,
    crawlPriority,
    indexingBehavior
  };
}

/* ===================== RISK LEVEL HELPER ===================== */

function getHigherRisk(current: SEORiskLevel, newRisk: SEORiskLevel): SEORiskLevel {
  const riskOrder = {
    [SEO_RISK_LEVELS.NONE]: 0,
    [SEO_RISK_LEVELS.LOW]: 1,
    [SEO_RISK_LEVELS.MEDIUM]: 2,
    [SEO_RISK_LEVELS.HIGH]: 3,
    [SEO_RISK_LEVELS.CRITICAL]: 4
  };
  
  return riskOrder[current] > riskOrder[newRisk] ? current : newRisk;
}

/* ===================== RISK ASSESSMENT HELPERS ===================== */

function assessDuplicateContentRisk(
  pagination: PaginationDetection,
  seo: PaginationSEOAnalysis,
  issues: string[],
  recommendations: string[]
): SEORiskLevel {
  let risk: SEORiskLevel = SEO_RISK_LEVELS.NONE;
  
  if (pagination.currentPage > 1 && !seo.hasCanonicalTag) {
    risk = SEO_RISK_LEVELS.CRITICAL;
    issues.push('Pagination pages without canonical tags cause duplicate content');
    recommendations.push('Add self-referencing canonical tags to all paginated pages');
  }
  
  if (seo.duplicateUrls.length > 0) {
    risk = getHigherRisk(risk, SEO_RISK_LEVELS.HIGH);
    issues.push(`Found ${seo.duplicateUrls.length} duplicate URL patterns`);
    recommendations.push('Implement 301 redirects or canonical tags to consolidate duplicate URLs');
  }
  
  if (pagination.parameterType === PARAMETER_TYPES.MATRIX) {
    risk = getHigherRisk(risk, SEO_RISK_LEVELS.HIGH);
    issues.push('Matrix parameters are not SEO-friendly and can cause duplicate content');
    recommendations.push('Switch to query parameters or path-based pagination');
  }
  
  return risk;
}

function assessCanonicalConflictRisk(
  seo: PaginationSEOAnalysis,
  issues: string[],
  recommendations: string[]
): SEORiskLevel {
  let risk: SEORiskLevel = SEO_RISK_LEVELS.NONE;
  
  if (seo.canonicalConflict) {
    risk = SEO_RISK_LEVELS.CRITICAL;
    issues.push('Canonical tag points to different URL than current page');
    recommendations.push('Fix canonical tag to point to current page or proper canonical');
  }
  
  if (seo.canonicalUrl && seo.canonicalUrl.includes('view=all') && seo.url !== seo.canonicalUrl) {
    risk = getHigherRisk(risk, SEO_RISK_LEVELS.MEDIUM);
    issues.push('Pagination pages canonicalizing to view-all page may not be optimal');
    recommendations.push('Consider self-referencing canonicals for first few pages');
  }
  
  return risk;
}

function assessDeepPaginationRisk(
  pagination: PaginationDetection,
  issues: string[],
  recommendations: string[]
): SEORiskLevel {
  let risk: SEORiskLevel = SEO_RISK_LEVELS.NONE;
  
  if (pagination.currentPage > 10) {
    risk = SEO_RISK_LEVELS.HIGH;
    issues.push(`Page ${pagination.currentPage} is very deep in pagination (depth > 10)`);
    recommendations.push('Consider noindex,follow for pages beyond page 10');
  } else if (pagination.currentPage > 5) {
    risk = SEO_RISK_LEVELS.MEDIUM;
    issues.push(`Page ${pagination.currentPage} is moderately deep in pagination`);
    recommendations.push('Monitor crawl budget for deep pagination pages');
  }
  
  if (pagination.totalPages && pagination.totalPages > 50) {
    risk = getHigherRisk(risk, SEO_RISK_LEVELS.MEDIUM);
    issues.push(`Large pagination (${pagination.totalPages}+ pages) may waste crawl budget`);
    recommendations.push('Implement pagination sitemap or consider view-all page');
  }
  
  return risk;
}

function assessInfiniteScrollRisk(
  pagination: PaginationDetection,
  issues: string[],
  recommendations: string[]
): SEORiskLevel {
  let risk: SEORiskLevel = SEO_RISK_LEVELS.NONE;
  
  if (pagination.hasInfiniteScroll) {
    risk = SEO_RISK_LEVELS.HIGH;
    issues.push('Infinite scroll may not be crawlable by search engines');
    recommendations.push('Implement HTML snapshots or escaped fragments (#!) for AJAX crawlability');
  }
  
  if (pagination.hasLoadMore) {
    risk = getHigherRisk(risk, SEO_RISK_LEVELS.MEDIUM);
    issues.push('Load more buttons may hide content from search engines');
    recommendations.push('Ensure paginated content is accessible via static URLs');
  }
  
  return risk;
}

function assessCrawlBudgetRisk(
  pagination: PaginationDetection,
  seo: PaginationSEOAnalysis,
  issues: string[],
  recommendations: string[]
): SEORiskLevel {
  let risk: SEORiskLevel = SEO_RISK_LEVELS.NONE;
  
  if (pagination.paginationLinks.length > 50) {
    risk = SEO_RISK_LEVELS.MEDIUM;
    issues.push('Excessive pagination links may waste crawl budget');
    recommendations.push('Limit visible pagination links or implement rel next/prev');
  }
  
  if (pagination.currentPage > 1 && !seo.hasRelNextPrev) {
    risk = getHigherRisk(risk, SEO_RISK_LEVELS.LOW);
    issues.push('Missing rel="next"/"prev" may affect crawl efficiency');
    recommendations.push('Add rel="next" and rel="prev" link elements');
  }
  
  return risk;
}

function calculateOverallRisk(risks: SEORiskLevel[]): SEORiskLevel {
  if (risks.includes(SEO_RISK_LEVELS.CRITICAL)) return SEO_RISK_LEVELS.CRITICAL;
  if (risks.includes(SEO_RISK_LEVELS.HIGH)) return SEO_RISK_LEVELS.HIGH;
  if (risks.includes(SEO_RISK_LEVELS.MEDIUM)) return SEO_RISK_LEVELS.MEDIUM;
  if (risks.includes(SEO_RISK_LEVELS.LOW)) return SEO_RISK_LEVELS.LOW;
  return SEO_RISK_LEVELS.NONE;
}

/* ===================== RISK ASSESSMENT ===================== */

function assessRisks(
  url: string,
  pagination: PaginationDetection,
  seo: PaginationSEOAnalysis
): PaginationRiskAssessment {
  const issues: string[] = [];
  const recommendations: string[] = [];
  
  const duplicateContentRisk = assessDuplicateContentRisk(pagination, seo, issues, recommendations);
  const canonicalConflictRisk = assessCanonicalConflictRisk(seo, issues, recommendations);
  const deepPaginationRisk = assessDeepPaginationRisk(pagination, issues, recommendations);
  const infiniteScrollRisk = assessInfiniteScrollRisk(pagination, issues, recommendations);
  const crawlBudgetRisk = assessCrawlBudgetRisk(pagination, seo, issues, recommendations);
  
  const overallRisk = calculateOverallRisk([
    duplicateContentRisk,
    canonicalConflictRisk,
    deepPaginationRisk,
    infiniteScrollRisk,
    crawlBudgetRisk
  ]);
  
  return {
    duplicateContentRisk,
    canonicalConflictRisk,
    deepPaginationRisk,
    infiniteScrollRisk,
    crawlBudgetRisk,
    overallRisk,
    issues,
    recommendations
  };
}

/* ===================== STRUCTURED DATA EXTRACTION ===================== */

function extractStructuredData($: cheerio.CheerioAPI): {
  hasSchema: boolean;
  totalSchemas: number;
  schemas: any[];
  hasPaginationSchema: boolean;
} {
  const schemas: any[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || '');
      schemas.push(json);
    } catch {}
  });

  const hasPaginationSchema = schemas.some(schema => 
    schema['@type'] === 'ItemList' || 
    (schema['@type'] === 'BreadcrumbList' && schema.itemListElement?.length > 1)
  );

  return {
    hasSchema: schemas.length > 0,
    totalSchemas: schemas.length,
    schemas,
    hasPaginationSchema
  };
}

/* ===================== BASIC SEO EXTRACTION ===================== */

function extractBasicSEO($: cheerio.CheerioAPI): {
  title: string;
  metaDescription: string;
  h1Count: number;
  imageCount: number;
  imagesWithAlt: number;
  dynamicScore: number;
} {
  const title = $('title').text().trim();
  const metaDescription = $('meta[name="description"]').attr('content') || '';
  const h1Count = $('h1').length;

  const images = $('img');
  const imageCount = images.length;
  const imagesWithAlt = images.filter((_, el) => !!$(el).attr('alt')).length;

  // Dynamic score: rough estimate based on JS-heavy indicators
  const scriptCount = $('script').length;
  const noscriptCount = $('noscript').length;

  let dynamicScore = 0;
  if (scriptCount > 10) dynamicScore += 40;
  if (noscriptCount === 0) dynamicScore += 30;
  if ($('[id*="app"], [id*="root"]').length > 0) dynamicScore += 30;

  return {
    title,
    metaDescription,
    h1Count,
    imageCount,
    imagesWithAlt,
    dynamicScore: Math.min(dynamicScore, 100)
  };
}

/* ===================== PAGE ANALYSIS ===================== */

async function analyzePaginationPage(
  browser: Browser,
  url: string
): Promise<PaginationPageAnalysis> {
  const page = await browser.newPage();

  const startTime = Date.now();
  let status = 0;

  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    status = response?.status() || 0;
  } catch {
    return {
      url,
      status: 0,
      loadTimeMs: 0,
      sizeKb: 0,
      performance: 'error',
      title: '',
      metaDescription: '',
      h1Count: 0,
      imageCount: 0,
      imagesWithAlt: 0,
      dynamicScore: 0,
      pagination: {} as any,
      seo: {} as any,
      risks: {} as any,
      structuredData: {
        hasSchema: false,
        totalSchemas: 0,
        schemas: [],
        hasPaginationSchema: false
      }
    };
  }

  const html = await page.content();
  const loadTimeMs = Date.now() - startTime;
  const sizeKb = Buffer.byteLength(html, 'utf8') / 1024;

  const $ = cheerio.load(html);

  const pagination = detectPagination($, url);
  const seo = analyzeSEO($, url, pagination);
  const risks = assessRisks(url, pagination, seo);
  const structuredData = extractStructuredData($);
  const basicSEO = extractBasicSEO($);

  await page.close();

  let performance: Performance = 'fast';
  if (loadTimeMs > 4000) performance = 'slow';
  else if (loadTimeMs > 2000) performance = 'moderate';

  return {
    url: normalizeUrl(url),
    status,
    loadTimeMs,
    sizeKb,
    performance,
    ...basicSEO,
    pagination,
    seo,
    risks,
    structuredData
  };
}

/* ===================== SITE-WIDE ANALYSIS ===================== */

export async function analyzeSitePagination(
  urls: string[]
): Promise<SiteWidePaginationAnalysis> {
  const browser = await puppeteer.launch({ headless: true });

  const pages: PaginationPageAnalysis[] = [];

  // Analyze each URL in parallel with limited concurrency
  const concurrencyLimit = 5;
  for (let i = 0; i < urls.length; i += concurrencyLimit) {
    const batch = urls.slice(i, i + concurrencyLimit);
    const batchPromises = batch.map(url => analyzePaginationPage(browser, url));
    const batchResults = await Promise.all(batchPromises);
    pages.push(...batchResults);
    
    console.log(`Analyzed ${Math.min(i + concurrencyLimit, urls.length)} of ${urls.length} URLs`);
  }

  await browser.close();

  const paginatedPages = pages.filter(p => p.pagination.isPaginationPresent);
  const depths = paginatedPages.map(p => p.pagination.paginationDepth);

  return {
    summary: {
      totalPagesAnalyzed: pages.length,
      paginatedPages: paginatedPages.length,
      paginationTypesFound: [
        ...new Set(paginatedPages.map(p => p.pagination.paginationType))
      ],
      averagePaginationDepth:
        depths.reduce((a, b) => a + b, 0) / (depths.length || 1),
      highestPaginationDepth: Math.max(...depths, 0),
      seoRiskScore:
        paginatedPages.filter(p => p.risks.overallRisk !== 'none').length,
      pagesWithIssues:
        paginatedPages.filter(p => p.risks.issues.length > 0).length,
      crawlEfficiency:
        paginatedPages.filter(p => p.seo.crawlPriority >= 0.5).length /
        (paginatedPages.length || 1),
      sitemapUrlsFound: urls.length,
      sitemapUrlsAnalyzed: pages.length
    },
    paginationPatterns: {
      mostCommonType:
        paginatedPages[0]?.pagination.paginationType ||
        PAGINATION_TYPES.QUERY_PARAMETERS,
      parameterDistribution: paginatedPages.reduce((acc, p) => {
        acc[p.pagination.parameterType] =
          (acc[p.pagination.parameterType] || 0) + 1;
        return acc;
      }, {} as Record<ParameterType, number>),
      indexationRate:
        paginatedPages.filter(p => p.seo.indexingBehavior === 'index').length /
        (paginatedPages.length || 1),
      canonicalCoverage:
        paginatedPages.filter(p => p.seo.hasCanonicalTag).length /
        (paginatedPages.length || 1),
      relNextPrevCoverage:
        paginatedPages.filter(p => p.seo.hasRelNextPrev).length /
        (paginatedPages.length || 1)
    },
    recommendations: {
      highPriority: [
        'Fix canonical conflicts on paginated URLs',
        'Prevent duplicate pagination URLs',
        'Ensure crawlable pagination structure'
      ],
      mediumPriority: [
        'Limit deep pagination indexing',
        'Optimize crawl budget usage'
      ],
      lowPriority: [
        'Improve pagination schema markup',
        'Enhance internal linking'
      ]
    },
    pages
  };
}

/* ===================== HANDLER FUNCTIONS ===================== */

export async function analyzePaginationHandler(
  url: string, 
  options: PaginationAnalysisOptions = {}
): Promise<AnalysisResult<SiteWidePaginationAnalysis>> {
  const startTime = Date.now();
  
  try {
    const { maxUrls = 50, sitemapUrl } = options;

    if (!url) {
      throw new Error('URL is required');
    }

    try {
      new URL(url);
    } catch {
      throw new Error('Invalid URL format. Must include protocol (http:// or https://)');
    }

    console.log(`[${new Date().toISOString()}] Starting pagination analysis for: ${url}`);

    const browser = await puppeteer.launch({ 
      headless: options.headless !== undefined ? options.headless : true 
    });

    console.log(`[${new Date().toISOString()}] Fetching sitemap URLs...`);
    const sitemapUrls = await fetchSitemapUrls(browser, url, sitemapUrl);
    
    if (sitemapUrls.length === 0) {
      throw new Error('No URLs found in sitemap or failed to fetch sitemap');
    }

    const urlsToAnalyze = sitemapUrls.slice(0, maxUrls);
    console.log(`[${new Date().toISOString()}] Found ${sitemapUrls.length} URLs in sitemap, analyzing ${urlsToAnalyze.length} URLs`);

    await browser.close();

    const result = await analyzeSitePagination(urlsToAnalyze);
    
    const analysisWithUrl = {
      ...result,
      url: url
    };
    
    const geminiIssues = await generateUniversalSeoIssues(analysisWithUrl, 'pagination');
    
    const processingTime = Date.now() - startTime;

    console.log(`[${new Date().toISOString()}] Analysis complete in ${processingTime}ms`);
    console.log(`[${new Date().toISOString()}] Analyzed ${result.summary.totalPagesAnalyzed} pages, found ${result.summary.paginatedPages} with pagination`);

    return {
      success: true,
      url,
      timestamp: new Date().toISOString(),
      processingTime: `${processingTime}ms`,
      data: {
        ...result,
        issues: geminiIssues
      }
    };

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] Error after ${processingTime}ms:`, error.message);
    
    return {
      success: false,
      error: error.message || 'Pagination analysis failed',
      processingTime: `${processingTime}ms`,
      timestamp: new Date().toISOString(),
      code: error.code
    };
  }
}

/* ===================== ADDITIONAL HELPER FUNCTIONS ===================== */

// Function to analyze specific pages with pagination
export async function analyzePaginationForPages(
  urls: string[],
  options: { timeout?: number; headless?: any } = {}
): Promise<PaginationPageAnalysis[]> {
  const browser = await puppeteer.launch({ 
    headless: options.headless !== undefined ? options.headless : true 
  });

  const results: PaginationPageAnalysis[] = [];
  
  for (const url of urls) {
    try {
      const result = await analyzePaginationPage(browser, url);
      results.push(result);
    } catch (error) {
      console.error(`Failed to analyze ${url}:`, error);
    }
  }

  await browser.close();
  return results;
}

// Function to check if a specific page has pagination
export async function checkPageForPagination(url: string): Promise<PaginationDetection> {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const html = await page.content();
    const $ = cheerio.load(html);
    
    const pagination = detectPagination($, url);
    
    await browser.close();
    return pagination;
  } catch (error) {
    await browser.close();
    throw error;
  }
}

/* ===================== HANDLER FUNCTIONS ===================== */

// export async function analyzePaginationHandler(
//   url: string, 
//   options: PaginationAnalysisOptions = {}
// ): Promise<AnalysisResult<SiteWidePaginationAnalysis>> {
//   const startTime = Date.now();
  
//   try {
//     const { maxPages = 10, followPagination = true } = options;

//     if (!url) {
//       throw new Error('URL is required');
//     }

//     try {
//       new URL(url);
//     } catch {
//       throw new Error('Invalid URL format. Must include protocol (http:// or https://)');
//     }

//     console.log(`[${new Date().toISOString()}] Pagination analysis for: ${url}`);

//     const result = await analyzeSitePagination([url]);
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
//       error: error.message || 'Pagination analysis failed',
//       processingTime: `${processingTime}ms`,
//       timestamp: new Date().toISOString()
//     };
//   }
// }

