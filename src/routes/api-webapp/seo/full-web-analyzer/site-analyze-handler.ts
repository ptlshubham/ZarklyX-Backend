import puppeteer, { Browser, Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import { generateSeoIssues } from '../../../../services/gemini-seo-issues';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';

/* ===================== CONSTANTS ===================== */

const ALL_SOCIAL_PLATFORMS = [
  'facebook',
  'linkedin',
  'instagram',
  'whatsapp',
  'slack',
  'discord',
  'twitter',
  'pinterest'
] as const;

/* ===================== TYPES ===================== */

type onPagePerformance = 'fast' | 'moderate' | 'slow' | 'error';

interface PageAnalysis {
  url: string;
  status: number;
  loadTimeMs: number;
  sizeKb: number;
  onPageperformance: onPagePerformance;
  title: string;
  metaDescription: string;
  h1Count: number;
  imageCount: number;
  imagesWithAlt: number;
  dynamicScore: number;
  
  robotsMetaTag: string | null;
  xRobotsTag: string | null;
  isIndexable: boolean;
  indexingIssues: string[];
  
  canonicalUrl: string | null;
  canonicalType: 'self' | 'cross-domain' | 'missing' | 'conflicting';
  canonicalIssues: string[];
  
  isSoft404: boolean;
  isServerError: boolean;
  crawlError: string | null;

  socialMedia: {
    openGraph: Record<string, string>;
    twitter: Record<string, string>;
    platformsCovered: string[];
    platformsNotCovered: string[];
  };

  structuredData: {
    hasSchema: boolean;
    totalSchemas: number;
    schemas: any[];
  };
}

interface RobotsTxtData {
  isBlocked: (url: string) => boolean;
  blockedUrls: string[];
  hasRobotsTxt: boolean;
  rawContent: string;
}

interface SitemapData {
  urls: string[];
  hasSitemap: boolean;
  sitemapUrls: string[];
}

/* ===================== HELPERS ===================== */

const normalizeUrl = (url: string): string =>
  url.replace(/#.*$/, '').replace(/\/$/, '');

const isInternal = (url: string, hostname: string): boolean => {
  const urlObj = new URL(url);
  return urlObj.hostname === hostname;
};

/* ===================== ROBOTS.TXT PARSER ===================== */

async function fetchRobotsTxt(baseUrl: string): Promise<RobotsTxtData> {
  const robotsUrl = new URL('/robots.txt', baseUrl).href;
  const response = await axios.get(robotsUrl, { timeout: 10000 });
  const content = response.data;
  
  const disallowRules: string[] = [];
  const lines = content.split('\n');
  
  let isUserAgentAll = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith('user-agent:')) {
      isUserAgentAll = trimmed.toLowerCase().includes('*');
    }
    if (isUserAgentAll && trimmed.toLowerCase().startsWith('disallow:')) {
      const path = trimmed.substring(trimmed.indexOf(':') + 1).trim();
      if (path) disallowRules.push(path);
    }
  }
  
  const blockedUrls: string[] = [];
  const isBlocked = (url: string): boolean => {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    
    for (const rule of disallowRules) {
      if (rule === '/') return true;
      if (path.startsWith(rule)) {
        blockedUrls.push(url);
        return true;
      }
    }
    return false;
  };
  
  return {
    isBlocked,
    blockedUrls,
    hasRobotsTxt: true,
    rawContent: content
  };
}

/* ===================== SITEMAP PARSER ===================== */

async function fetchSitemap(baseUrl: string): Promise<SitemapData> {
  const sitemapUrls = [
    new URL('/sitemap.xml', baseUrl).href,
    new URL('/sitemap_index.xml', baseUrl).href,
    new URL('/sitemap1.xml', baseUrl).href
  ];
  
  for (const sitemapUrl of sitemapUrls) {
    const response = await axios.get(sitemapUrl, { timeout: 10000 });
    const xml = await parseStringPromise(response.data);
    
    const urls: string[] = [];
    
    if (xml.sitemapindex?.sitemap) {
      for (const sitemap of xml.sitemapindex.sitemap) {
        if (sitemap.loc?.[0]) {
          const subResponse = await axios.get(sitemap.loc[0], { timeout: 10000 });
          const subXml = await parseStringPromise(subResponse.data);
          if (subXml.urlset?.url) {
            for (const urlEntry of subXml.urlset.url) {
              if (urlEntry.loc?.[0]) urls.push(urlEntry.loc[0]);
            }
          }
        }
      }
    }
    
    if (xml.urlset?.url) {
      for (const urlEntry of xml.urlset.url) {
        if (urlEntry.loc?.[0]) urls.push(urlEntry.loc[0]);
      }
    }
    
    return {
      urls,
      hasSitemap: true,
      sitemapUrls: [sitemapUrl]
    };
  }
  
  return {
    urls: [],
    hasSitemap: false,
    sitemapUrls: []
  };
}

/* ===================== MAIN CRAWLER ===================== */

export async function crawlAndAnalyzeSPA(baseUrl: string, maxPages = 15) {
  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const hostname = new URL(baseUrl).hostname;
  const visited = new Set<string>();
  const queue: string[] = [normalizeUrl(baseUrl)];
  const pages: PageAnalysis[] = [];
  
  const robotsData = await fetchRobotsTxt(baseUrl);
  const sitemapData = await fetchSitemap(baseUrl);

  while (queue.length && visited.size < maxPages) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const page: Page = await browser.newPage();
    const start = Date.now();
    
    const response = await page.goto(current, { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });
    
    const loadTimeMs = Date.now() - start;
    const statusCode = response?.status() || 0;
    const headers = response?.headers() || {};

    const html = await page.content();
    const $ = cheerio.load(html);

    /* ---------- BASIC SEO ---------- */

    const title = $('title').text().trim();
    const metaDescription = $('meta[name="description"]').attr('content') || '';
    const h1Count = $('h1').length;

    const images = $('img');
    const imageCount = images.length;
    const imagesWithAlt = images.filter((_, el) => !!$(el).attr('alt')).length;

    const scripts = $('script').length;
    const dynamicScore = Math.min(100, scripts * 8);

    const onPageperformance: onPagePerformance =
      loadTimeMs < 1000 ? 'fast' :
      loadTimeMs < 3000 ? 'moderate' : 'slow';

    /* ---------- INDEXING ANALYSIS ---------- */

    const robotsMetaTag = $('meta[name="robots"]').attr('content') || null;
    const xRobotsTag = headers['x-robots-tag'] || null;
    
    const indexingIssues: string[] = [];
    let isIndexable = true;
    
    if (robotsMetaTag) {
      const robotsLower = robotsMetaTag.toLowerCase();
      if (robotsLower.includes('noindex')) {
        isIndexable = false;
        indexingIssues.push('noindex in meta robots');
      }
      if (robotsLower.includes('nofollow')) {
        indexingIssues.push('nofollow in meta robots');
      }
    }
    
    if (xRobotsTag) {
      const xRobotsLower = xRobotsTag.toLowerCase();
      if (xRobotsLower.includes('noindex')) {
        isIndexable = false;
        indexingIssues.push('noindex in X-Robots-Tag header');
      }
    }
    
    if (robotsData.isBlocked(current)) {
      isIndexable = false;
      indexingIssues.push('blocked by robots.txt');
    }

    /* ---------- CANONICAL ANALYSIS ---------- */

    const canonicalLink = $('link[rel="canonical"]').attr('href') || null;
    const canonicalUrl = canonicalLink ? new URL(canonicalLink, current).href : null;
    
    let canonicalType: 'self' | 'cross-domain' | 'missing' | 'conflicting' = 'missing';
    const canonicalIssues: string[] = [];
    
    if (canonicalUrl) {
      const currentClean = normalizeUrl(current);
      const canonicalClean = normalizeUrl(canonicalUrl);
      
      if (currentClean === canonicalClean) {
        canonicalType = 'self';
      } else {
        const currentDomain = new URL(current).hostname;
        const canonicalDomain = new URL(canonicalUrl).hostname;
        
        if (currentDomain !== canonicalDomain) {
          canonicalType = 'cross-domain';
          canonicalIssues.push('points to different domain');
        } else {
          canonicalType = 'conflicting';
          canonicalIssues.push('points to different URL on same domain');
        }
      }
    } else {
      canonicalIssues.push('missing canonical tag');
    }
    
    const canonicalCount = $('link[rel="canonical"]').length;
    if (canonicalCount > 1) {
      canonicalType = 'conflicting';
      canonicalIssues.push(`multiple canonical tags (${canonicalCount})`);
    }

    /* ---------- STATUS DETECTION ---------- */

    const isSoft404 = statusCode === 200 && (
      title.toLowerCase().includes('not found') ||
      title.toLowerCase().includes('404') ||
      $('body').text().toLowerCase().includes('page not found')
    );
    
    const isServerError = statusCode >= 500;
    const crawlError = isServerError ? `HTTP ${statusCode}` : null;

    /* ---------- SOCIAL META TAGS ---------- */

    const openGraph: Record<string, string> = {};
    $('meta[property^="og:"]').each((_, el) => {
      const property = $(el).attr('property');
      const content = $(el).attr('content');
      if (property && content) openGraph[property] = content;
    });

    const twitter: Record<string, string> = {};
    $('meta[name^="twitter:"]').each((_, el) => {
      const name = $(el).attr('name');
      const content = $(el).attr('content');
      if (name && content) twitter[name] = content;
    });

    const platformsCovered: string[] = [];
    if (Object.keys(openGraph).length > 0) {
      platformsCovered.push(
        'facebook',
        'linkedin',
        'instagram',
        'whatsapp',
        'slack',
        'discord',
        'pinterest'
      );
    }
    if (Object.keys(twitter).length > 0) {
      platformsCovered.push('twitter');
    }

    const platformsNotCovered = ALL_SOCIAL_PLATFORMS.filter(
      p => !platformsCovered.includes(p)
    );

    /* ---------- STRUCTURED DATA ---------- */

    const schemas: any[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      const jsonStr = $(el).html() || '';
      const json = JSON.parse(jsonStr);
      schemas.push(json);
    });

    const pageAnalysis: PageAnalysis = {
      url: current,
      status: statusCode,
      loadTimeMs,
      sizeKb: Math.round(Buffer.byteLength(html) / 1024),
      onPageperformance,
      title,
      metaDescription,
      h1Count,
      imageCount,
      imagesWithAlt,
      dynamicScore,
      
      robotsMetaTag,
      xRobotsTag,
      isIndexable,
      indexingIssues,
      
      canonicalUrl,
      canonicalType,
      canonicalIssues,
      
      isSoft404,
      isServerError,
      crawlError,

      socialMedia: {
        openGraph,
        twitter,
        platformsCovered,
        platformsNotCovered
      },

      structuredData: {
        hasSchema: schemas.length > 0,
        totalSchemas: schemas.length,
        schemas
      }
    };

    pages.push(pageAnalysis);

    /* ---------- DISCOVER INTERNAL LINKS ---------- */

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      const fullUrl = new URL(href, current).href;
      const cleanUrl = normalizeUrl(fullUrl);

      if (isInternal(cleanUrl, hostname) && !visited.has(cleanUrl)) {
        queue.push(cleanUrl);
      }
    });

    await page.close();
  }

  await browser.close();

  const result = buildPagePerformanceAndSiteWide(pages, robotsData, sitemapData, baseUrl);
  
  const analysisWithUrl = {
    ...result,
    url: baseUrl
  };
  
  const geminiIssues = await generateSeoIssues(analysisWithUrl);
  return {
    ...result,
    issues: geminiIssues
  };
}

/* ===================== FINAL JSON BUILDER ===================== */

function buildPagePerformanceAndSiteWide(
  pages: PageAnalysis[], 
  robotsData: RobotsTxtData, 
  sitemapData: SitemapData,
  baseUrl: string
) {
  const totalPages = pages.length;

  /* ---------- PERFORMANCE METRICS ---------- */

  const fastPages = pages.filter(p => p.onPageperformance === 'fast').length;
  const moderatePages = pages.filter(p => p.onPageperformance === 'moderate').length;
  const slowPages = pages.filter(p => p.onPageperformance === 'slow').length;
  const errorPages = pages.filter(p => p.onPageperformance === 'error').length;

  const averageLoadTimeMs = totalPages
    ? Math.round(pages.reduce((s, p) => s + p.loadTimeMs, 0) / totalPages)
    : 0;

  const dynamicScoreAverage = totalPages
    ? Math.round(pages.reduce((s, p) => s + p.dynamicScore, 0) / totalPages)
    : 0;

  const siteType =
    dynamicScoreAverage > 50 ? 'dynamic' :
    dynamicScoreAverage > 20 ? 'hybrid' : 'static';

  const onPageperformanceScore =
    averageLoadTimeMs < 1000 ? 90 :
    averageLoadTimeMs < 2000 ? 80 :
    averageLoadTimeMs < 3000 ? 70 : 50;

  /* ---------- IMAGE METRICS ---------- */

  const totalImages = pages.reduce((s, p) => s + p.imageCount, 0);
  const imagesWithAlt = pages.reduce((s, p) => s + p.imagesWithAlt, 0);
  const altCoveragePercent =
    totalImages > 0 ? Math.round((imagesWithAlt / totalImages) * 100) : 0;

  const averageH1PerPage =
    totalPages > 0
      ? Math.round((pages.reduce((s, p) => s + p.h1Count, 0) / totalPages) * 10) / 10
      : 0;

  /* ---------- INDEXING ANALYSIS ---------- */

  const indexablePages = pages.filter(p => p.isIndexable);
  const notIndexablePages = pages.filter(p => !p.isIndexable);
  const blockedByRobotsTxt = pages.filter(p => p.indexingIssues.includes('blocked by robots.txt'));
  const noindexPages = pages.filter(p => 
    p.indexingIssues.some(issue => issue.includes('noindex'))
  );
  
  const crawledNotIndexed = pages.filter(p => 
    !p.isIndexable && p.status === 200 && !p.isSoft404
  );

  const indexedPages = indexablePages.length;
  const notIndexedPages = notIndexablePages.length;
  const crawlSuccessRate = totalPages > 0 
    ? Math.round((pages.filter(p => p.status === 200).length / totalPages) * 100) 
    : 0;

  const indexHealthScore = totalPages > 0
    ? Math.round((indexedPages / totalPages) * 100)
    : 0;

  /* ---------- STATUS ANALYSIS ---------- */

  const soft404Pages = pages.filter(p => p.isSoft404);
  const serverErrorPages = pages.filter(p => p.isServerError);

  /* ---------- CANONICAL ANALYSIS ---------- */

  const canonicalPages = pages.filter(p => p.canonicalType === 'self');
  const nonCanonicalPages = pages.filter(p => p.canonicalType === 'missing');
  const conflictingCanonicals = pages.filter(p => p.canonicalType === 'conflicting');
  const crossDomainCanonicals = pages.filter(p => p.canonicalType === 'cross-domain');
  
  const duplicateCanonicals: Record<string, string[]> = {};
  pages.forEach(p => {
    if (p.canonicalUrl && p.canonicalUrl !== normalizeUrl(p.url)) {
      if (!duplicateCanonicals[p.canonicalUrl]) {
        duplicateCanonicals[p.canonicalUrl] = [];
      }
      duplicateCanonicals[p.canonicalUrl].push(p.url);
    }
  });

  const canonicalHealthScore = totalPages > 0
    ? Math.round((canonicalPages.length / totalPages) * 100)
    : 0;

  /* ---------- SITEMAP ANALYSIS ---------- */

  const crawledUrls = new Set(pages.map(p => normalizeUrl(p.url)));
  const sitemapUrls = new Set(sitemapData.urls.map(u => normalizeUrl(u)));
  
  const inSitemapNotCrawled = [...sitemapUrls].filter(u => !crawledUrls.has(u));
  const crawledNotInSitemap = [...crawledUrls].filter(u => !sitemapUrls.has(u));

  return {
    pagePerformanceAndSiteWide: {
      summary: {
        totalPages,
        onPageperformanceScore,
        averageLoadTimeMs,
        fastPages,
        moderatePages,
        slowPages,
        errorPages,
        dynamicScoreAverage,
        siteType,
        images: {
          total: totalImages,
          withAlt: imagesWithAlt,
          altCoveragePercent
        },
        headings: {
          averageH1PerPage
        }
      },
      
      indexingHealth: {
        indexHealthScore,
        indexedPages,
        notIndexedPages,
        crawlSuccessRate: `${crawlSuccessRate}%`,
        
        blockedByRobotsTxt: {
          count: blockedByRobotsTxt.length,
          pages: blockedByRobotsTxt.map(p => ({
            url: p.url,
            issues: p.indexingIssues
          }))
        },
        
        noindexPages: {
          count: noindexPages.length,
          pages: noindexPages.map(p => ({
            url: p.url,
            robotsTag: p.robotsMetaTag,
            xRobotsTag: p.xRobotsTag,
            issues: p.indexingIssues
          }))
        },
        
        crawledNotIndexed: {
          count: crawledNotIndexed.length,
          pages: crawledNotIndexed.map(p => ({
            url: p.url,
            reason: p.indexingIssues.join(', ')
          }))
        },
        
        soft404Pages: {
          count: soft404Pages.length,
          pages: soft404Pages.map(p => ({
            url: p.url,
            title: p.title
          }))
        },
        
        serverErrorPages: {
          count: serverErrorPages.length,
          pages: serverErrorPages.map(p => ({
            url: p.url,
            status: p.status,
            error: p.crawlError
          }))
        },
        
        note: totalPages < 15 
          ? `Only ${totalPages} pages crawled. Full site may have more indexing issues.`
          : null
      },
      
      canonicalHealth: {
        canonicalHealthScore,
        
        canonicalPages: {
          count: canonicalPages.length,
          pages: canonicalPages.map(p => p.url)
        },
        
        nonCanonicalPages: {
          count: nonCanonicalPages.length,
          pages: nonCanonicalPages.map(p => ({
            url: p.url,
            issues: p.canonicalIssues
          }))
        },
        
        conflictingCanonicals: {
          count: conflictingCanonicals.length,
          pages: conflictingCanonicals.map(p => ({
            url: p.url,
            canonicalUrl: p.canonicalUrl,
            issues: p.canonicalIssues
          }))
        },
        
        duplicateCanonicals: {
          count: Object.keys(duplicateCanonicals).length,
          groups: Object.entries(duplicateCanonicals).map(([canonical, urls]) => ({
            canonicalUrl: canonical,
            duplicateUrls: urls,
            count: urls.length
          }))
        },
        
        crossDomainCanonicals: {
          count: crossDomainCanonicals.length,
          pages: crossDomainCanonicals.map(p => ({
            url: p.url,
            canonicalUrl: p.canonicalUrl
          }))
        },
        
        missingCanonicals: {
          count: nonCanonicalPages.length,
          pages: nonCanonicalPages.map(p => p.url)
        },
        
        note: totalPages < 15 
          ? `Only ${totalPages} pages checked. Full site may have more canonical issues.`
          : null
      },
      
      robotsTxt: {
        hasRobotsTxt: robotsData.hasRobotsTxt,
        blockedUrlsCount: robotsData.blockedUrls.length,
        blockedUrls: robotsData.blockedUrls
      },
      
      sitemap: {
        hasSitemap: sitemapData.hasSitemap,
        totalUrlsInSitemap: sitemapData.urls.length,
        sitemapUrls: sitemapData.sitemapUrls,
        inSitemapNotCrawled: {
          count: inSitemapNotCrawled.length,
          urls: inSitemapNotCrawled.slice(0, 20),
          note: inSitemapNotCrawled.length > 20 
            ? `Showing first 20 of ${inSitemapNotCrawled.length} URLs`
            : null
        },
        crawledNotInSitemap: {
          count: crawledNotInSitemap.length,
          urls: crawledNotInSitemap
        }
      },
      
      pages
    }
  };
}

export default crawlAndAnalyzeSPA;