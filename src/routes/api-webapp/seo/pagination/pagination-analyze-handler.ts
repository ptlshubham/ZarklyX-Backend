import puppeteer, { Browser, Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import { generateSeoIssues } from '../../../../services/gemini-seo-issues';


/* ===================== TYPES ===================== */

interface PaginationAnalysis {
  paginationDetected: boolean;
  totalPaginatedPages: number;
  
  structure: {
    paginationType: string;
    pageDepth: number;
    canonicalTags: 'present' | 'missing' | 'conflicting';
    relNextPrev: 'detected' | 'not-detected' | 'partial';
    parameterHandling: 'proper' | 'partial' | 'poor';
  };
  
  indexingBehavior: {
    indexedPages: number;
    blockedPages: number;
    duplicateUrls: number;
    crawlPriority: 'high' | 'medium' | 'low';
  };
  
  seoRisks: {
    duplicateContent: boolean;
    duplicateContentLevel: 'none' | 'low' | 'medium' | 'high';
    canonicalConflicts: boolean;
    canonicalConflictLevel: 'none' | 'low' | 'medium' | 'high';
    deepPagination: boolean;
    deepPaginationLevel: 'none' | 'low' | 'medium' | 'high';
    infiniteScrollIssues: boolean;
    infiniteScrollLevel: 'stable' | 'needs-attention' | 'critical';
  };
  
  insights: {
    duplicateCanonicals: {
      count: number;
      pages: string[];
    };
    missingCanonicalTag: {
      count: number;
      pages: string[];
    };
    loremDomainCanonicals: {
      count: number;
      pages: string[];
    };
  };
  
  pages: PagePaginationData[];
}

interface PagePaginationData {
  url: string;
  pageNumber: number;
  hasCanonical: boolean;
  canonicalUrl: string | null;
  hasRelNext: boolean;
  hasRelPrev: boolean;
  isIndexable: boolean;
  isDuplicate: any;
  paginationType: string;
}

/* ===================== SITEMAP FETCHER ===================== */

async function fetchSitemapUrls(baseUrl: string): Promise<string[]> {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const urls: Set<string> = new Set();
  
  const sitemapLocations = [
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/sitemap_index.xml`,
    `${baseUrl}/sitemap.txt`,
  ];

  for (const location of sitemapLocations) {
    try {
      const response = await page.goto(location, {
        waitUntil: 'domcontentloaded',
        timeout: 10000
      });

      if (response && response.status() === 200) {
        const content = await page.content();
        const $ = cheerio.load(content);
        
        $('loc').each((_, element) => {
          const url = $(element).text().trim();
          if (url) urls.add(url);
        });
        
        if (urls.size > 0) break;
      }
    } catch {
      continue;
    }
  }
  
  // Fallback: crawl homepage
  if (urls.size === 0) {
   
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      const html = await page.content();
      const $ = cheerio.load(html);
      
      $('a[href]').each((_, element) => {
        const href = $(element).attr('href');
        if (href) {
         
            const fullUrl = new URL(href, baseUrl).href;
            if (new URL(fullUrl).hostname === new URL(baseUrl).hostname) {
              urls.add(fullUrl);
            }
        
        }
      });
   
  }
  
  await browser.close();
  return Array.from(urls);
}

/* ===================== PAGINATION DETECTION ===================== */

function detectPaginationInUrl(url: string): {
  isPaginated: boolean;
  pageNumber: number;
  type: string;
} {
  const urlObj = new URL(url);
  
  // Query parameter: ?page=2, ?p=2
  const pageParam = urlObj.searchParams.get('page') || urlObj.searchParams.get('p');
  if (pageParam) {
    return {
      isPaginated: true,
      pageNumber: parseInt(pageParam, 10) || 1,
      type: 'Page-based (query parameter)'
    };
  }
  
  // Path-based: /page/2, /p/2
  const pathMatch = urlObj.pathname.match(/\/(?:page|p)\/(\d+)/i);
  if (pathMatch) {
    return {
      isPaginated: true,
      pageNumber: parseInt(pathMatch[1], 10) || 1,
      type: 'Path-based'
    };
  }
  
  return {
    isPaginated: false,
    pageNumber: 1,
    type: 'Single page'
  };
}

function analyzePaginationLinks($: cheerio.CheerioAPI): {
  hasRelNext: boolean;
  hasRelPrev: boolean;
  totalPagesEstimate: number;
} {
  const hasRelNext = $('link[rel="next"]').length > 0;
  const hasRelPrev = $('link[rel="prev"]').length > 0;
  
  // Try to find total pages from pagination links
  const paginationNumbers: number[] = [];
  $('.pagination a, .pager a, [class*="page"] a').each((_, el) => {
    const text = $(el).text().trim();
    const num = parseInt(text, 10);
    if (!isNaN(num)) paginationNumbers.push(num);
  });
  
  const totalPagesEstimate = paginationNumbers.length > 0 
    ? Math.max(...paginationNumbers) 
    : 1;
  
  return { hasRelNext, hasRelPrev, totalPagesEstimate };
}

/* ===================== PAGE ANALYZER ===================== */

async function analyzePage(browser: Browser, url: string): Promise<PagePaginationData> {
  const page = await browser.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const html = await page.content();
    const $ = cheerio.load(html);
    
    const { isPaginated, pageNumber, type } = detectPaginationInUrl(url);
    const { hasRelNext, hasRelPrev } = analyzePaginationLinks($);
    
    const canonicalUrl = $('link[rel="canonical"]').attr('href') || null;
    const hasCanonical = !!canonicalUrl;
    
    const robotsMeta = $('meta[name="robots"]').attr('content') || '';
    const isIndexable = !robotsMeta.toLowerCase().includes('noindex');
    
    // Check for duplicate patterns
    const isDuplicate = url.includes('?utm_') || 
                       url.includes('&ref=') ||
                       (canonicalUrl && canonicalUrl !== url);
    
    await page.close();
    
    return {
      url,
      pageNumber,
      hasCanonical,
      canonicalUrl,
      hasRelNext,
      hasRelPrev,
      isIndexable,
      isDuplicate,
      paginationType: type
    };
  } catch (error) {
    await page.close();
    return {
      url,
      pageNumber: 1,
      hasCanonical: false,
      canonicalUrl: null,
      hasRelNext: false,
      hasRelPrev: false,
      isIndexable: true,
      isDuplicate: false,
      paginationType: 'error'
    };
  }
}

/* ===================== INSIGHTS ANALYZER ===================== */

function analyzeInsights(pages: PagePaginationData[]): PaginationAnalysis['insights'] {
  const duplicateCanonicals: string[] = [];
  const missingCanonicalTag: string[] = [];
  const loremDomainCanonicals: string[] = [];
  
  // Track canonical URL occurrences for duplicate detection
  const canonicalMap = new Map<string, string[]>();
  
  pages.forEach(page => {
    // Missing canonical tag
    if (!page.hasCanonical) {
      missingCanonicalTag.push(page.url);
    }
    
    // Lorem domain canonicals (example.com, lorem.com, test.com, etc.)
    if (page.canonicalUrl) {
      const loremPatterns = [
        'example.com',
        'lorem.com',
        'test.com',
        'domain.com',
        'yoursite.com',
        'mysite.com'
      ];
      
      if (loremPatterns.some(pattern => page.canonicalUrl!.includes(pattern))) {
        loremDomainCanonicals.push(page.url);
      }
      
      // Track canonical URLs for duplicate detection
      if (!canonicalMap.has(page.canonicalUrl)) {
        canonicalMap.set(page.canonicalUrl, []);
      }
      canonicalMap.get(page.canonicalUrl)!.push(page.url);
    }
  });
  
  // Find duplicate canonicals (multiple pages pointing to same canonical)
  canonicalMap.forEach((urls, canonical) => {
    if (urls.length > 1) {
      // Add all URLs that share this canonical
      duplicateCanonicals.push(...urls);
    }
  });
  
  return {
    duplicateCanonicals: {
      count: duplicateCanonicals.length,
      pages: duplicateCanonicals
    },
    missingCanonicalTag: {
      count: missingCanonicalTag.length,
      pages: missingCanonicalTag
    },
    loremDomainCanonicals: {
      count: loremDomainCanonicals.length,
      pages: loremDomainCanonicals
    }
  };
}

/* ===================== MAIN ANALYZER ===================== */

export async function analyzePagination(baseUrl: string, maxUrls = 50): Promise<PaginationAnalysis> {
  console.log('Fetching URLs from sitemap...');
  const allUrls = await fetchSitemapUrls(baseUrl);
  const urlsToAnalyze = allUrls.slice(0, maxUrls);
  
  console.log(`Analyzing ${urlsToAnalyze.length} URLs...`);
  const browser = await puppeteer.launch({ headless: true });
  
  const pages: PagePaginationData[] = [];
  
  // Analyze in batches
  const batchSize = 5;
  for (let i = 0; i < urlsToAnalyze.length; i += batchSize) {
    const batch = urlsToAnalyze.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(url => analyzePage(browser, url))
    );
    pages.push(...batchResults);
    console.log(`Processed ${Math.min(i + batchSize, urlsToAnalyze.length)}/${urlsToAnalyze.length}`);
  }
  
  await browser.close();
  
  // Calculate metrics
  const paginatedPages = pages.filter(p => p.pageNumber > 1 || p.hasRelNext);
  const totalPaginatedPages = paginatedPages.length;
  const paginationDetected = totalPaginatedPages > 0;
  
  // Page depth (highest page number)
  const pageDepth = pages.length > 0 
    ? Math.max(...pages.map(p => p.pageNumber))
    : 0;
  
  // Pagination type (most common)
  const typeCount: Record<string, number> = {};
  pages.forEach(p => {
    typeCount[p.paginationType] = (typeCount[p.paginationType] || 0) + 1;
  });
  const paginationType = Object.keys(typeCount).reduce((a, b) => 
    typeCount[a] > typeCount[b] ? a : b
  , 'Single page');
  
  // Canonical analysis
  const withCanonical = pages.filter(p => p.hasCanonical).length;
  const conflictingCanonicals = pages.filter(p => 
    p.hasCanonical && p.canonicalUrl && p.canonicalUrl !== p.url
  ).length;
  
  let canonicalTags: 'present' | 'missing' | 'conflicting' = 'present';
  if (withCanonical === 0) canonicalTags = 'missing';
  else if (conflictingCanonicals > pages.length * 0.3) canonicalTags = 'conflicting';
  
  // Rel next/prev analysis
  const withRelNext = pages.filter(p => p.hasRelNext).length;
  const withRelPrev = pages.filter(p => p.hasRelPrev).length;
  
  let relNextPrev: 'detected' | 'not-detected' | 'partial' = 'not-detected';
  if (withRelNext > 0 || withRelPrev > 0) {
    if (withRelNext >= paginatedPages.length * 0.8) {
      relNextPrev = 'detected';
    } else {
      relNextPrev = 'partial';
    }
  }
  
  // Parameter handling
  const properParams = pages.filter(p => 
    p.paginationType.includes('query') || p.paginationType.includes('Path')
  ).length;
  
  let parameterHandling: 'proper' | 'partial' | 'poor' = 'proper';
  if (properParams < pages.length * 0.5) parameterHandling = 'poor';
  else if (properParams < pages.length * 0.8) parameterHandling = 'partial';
  
  // Indexing behavior
  const indexedPages = pages.filter(p => p.isIndexable).length;
  const blockedPages = pages.filter(p => !p.isIndexable).length;
  const duplicateUrls = pages.filter(p => p.isDuplicate).length;
  
  let crawlPriority: 'high' | 'medium' | 'low' = 'medium';
  if (pageDepth <= 3) crawlPriority = 'high';
  else if (pageDepth > 10) crawlPriority = 'low';
  
  // SEO Risks
  const duplicateContentExists = duplicateUrls > 0 || canonicalTags === 'missing';
  let duplicateContentLevel: 'none' | 'low' | 'medium' | 'high' = 'none';
  if (duplicateContentExists) {
    if (duplicateUrls > pages.length * 0.5) duplicateContentLevel = 'high';
    else if (duplicateUrls > pages.length * 0.2) duplicateContentLevel = 'medium';
    else duplicateContentLevel = 'low';
  }
  
  const canonicalConflicts = canonicalTags === 'conflicting';
  let canonicalConflictLevel: 'none' | 'low' | 'medium' | 'high' = 'none';
  if (canonicalConflicts) {
    if (conflictingCanonicals > pages.length * 0.5) canonicalConflictLevel = 'high';
    else if (conflictingCanonicals > pages.length * 0.2) canonicalConflictLevel = 'medium';
    else canonicalConflictLevel = 'low';
  }
  
  const deepPagination = pageDepth > 5;
  let deepPaginationLevel: 'none' | 'low' | 'medium' | 'high' = 'none';
  if (deepPagination) {
    if (pageDepth > 20) deepPaginationLevel = 'high';
    else if (pageDepth > 10) deepPaginationLevel = 'medium';
    else deepPaginationLevel = 'low';
  }
  
  // Check for infinite scroll (basic detection)
  const infiniteScrollIssues = paginatedPages.some(p => 
    p.url.includes('infinite') || p.url.includes('scroll')
  );
  const infiniteScrollLevel = infiniteScrollIssues ? 'needs-attention' : 'stable';
  
  // Generate insights
  const insights = analyzeInsights(pages);
  
  return {
    paginationDetected,
    totalPaginatedPages,
    
    structure: {
      paginationType,
      pageDepth,
      canonicalTags,
      relNextPrev,
      parameterHandling
    },
    
    indexingBehavior: {
      indexedPages,
      blockedPages,
      duplicateUrls,
      crawlPriority
    },
    
    seoRisks: {
      duplicateContent: duplicateContentExists,
      duplicateContentLevel,
      canonicalConflicts,
      canonicalConflictLevel,
      deepPagination,
      deepPaginationLevel,
      infiniteScrollIssues,
      infiniteScrollLevel
    },
    
    insights,
    
    pages
  };
}

/* ===================== API HANDLER ===================== */

export async function analyzePaginationHandler(url: string, options: { maxPages?: number; followPagination?: boolean } = {}) {
  const startTime = Date.now();
  
  // try {
    if (!url) {
      throw new Error('URL is required');
    }

    // try {
    //   new URL(url);
    // } catch {
    //   throw new Error('Invalid URL format. Must include protocol (http:// or https://)');
    // }

    console.log(`[${new Date().toISOString()}] Analyzing pagination: ${url}`);

    const maxUrls = options.maxPages || 50;
    const analysis = await analyzePagination(url, maxUrls);
    
    const analysisWithUrl = {
      ...analysis,
      url: url
    };
    
    const geminiIssues = await generateSeoIssues(analysisWithUrl);
    


    const processingTime = Date.now() - startTime;

    console.log(`[${new Date().toISOString()}] Analysis complete in ${processingTime}ms`);

    return {
      success: true,
      url: url,
      timestamp: new Date().toISOString(),
      processingTime: `${processingTime}ms`,
      
      summary: {
        paginationDetected: analysis.paginationDetected ? 'Yes' : 'No',
        totalPaginatedPages: analysis.totalPaginatedPages,
        
        paginationStructure: {
          paginationType: analysis.structure.paginationType,
          pageDepth: `${analysis.structure.pageDepth} Levels`,
          canonicalTags: analysis.structure.canonicalTags,
          relNextPrev: analysis.structure.relNextPrev,
          parameterHandling: analysis.structure.parameterHandling
        },
        
        indexingBehavior: {
          indexedPages: analysis.indexingBehavior.indexedPages,
          blockedPages: analysis.indexingBehavior.blockedPages,
          duplicateUrls: analysis.indexingBehavior.duplicateUrls,
          crawlPriority: analysis.indexingBehavior.crawlPriority
        },
        
        seoRisks: {
          duplicateContent: analysis.seoRisks.duplicateContent ? 'Yes' : 'No',
          duplicateContentLevel: analysis.seoRisks.duplicateContentLevel,
          canonicalConflicts: analysis.seoRisks.canonicalConflicts ? 'Yes' : 'No',
          canonicalConflictLevel: analysis.seoRisks.canonicalConflictLevel,
          deepPagination: analysis.seoRisks.deepPagination ? 'Yes' : 'No',
          deepPaginationLevel: analysis.seoRisks.deepPaginationLevel,
          infiniteScrollIssues: analysis.seoRisks.infiniteScrollIssues ? 'Yes' : 'No',
          infiniteScrollLevel: analysis.seoRisks.infiniteScrollLevel
        }
      },
      
      insights: {
        duplicateCanonicals: {
          type: 'critical',
          count: analysis.insights.duplicateCanonicals.count,
          pages: analysis.insights.duplicateCanonicals.pages
        },
        missingCanonicalTag: {
          type: 'critical',
          count: analysis.insights.missingCanonicalTag.count,
          pages: analysis.insights.missingCanonicalTag.pages
        },
        loremDomainCanonicals: {
          type: 'suggestion',
          count: analysis.insights.loremDomainCanonicals.count,
          pages: analysis.insights.loremDomainCanonicals.pages
        }
      },
      
      analysis: analysis,
      issues: geminiIssues
    };

  // } catch (error: any) {
  //   const processingTime = Date.now() - startTime;
  //   console.error(`[${new Date().toISOString()}] Error after ${processingTime}ms:`, error.message);
    
  //   throw new Error(error.message || 'Pagination analysis failed');
  // }
}

export default analyzePaginationHandler;