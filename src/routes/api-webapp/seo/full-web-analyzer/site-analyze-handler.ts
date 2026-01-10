import puppeteer, { Browser, Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import { generateUniversalSeoIssues } from '../../../../services/universal-seo-issues';

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

/* ===================== HELPERS ===================== */

const normalizeUrl = (url: string): string =>
  url.replace(/#.*$/, '').replace(/\/$/, '');

const isInternal = (url: string, hostname: string): boolean => {
  try {
    return new URL(url).hostname === hostname;
  } catch {
    return false;
  }
};

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

  while (queue.length && visited.size < maxPages) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    let page: Page | null = null;

    try {
      page = await browser.newPage();
      const start = Date.now();
      await page.goto(current, { waitUntil: 'networkidle2', timeout: 30000 });
      const loadTimeMs = Date.now() - start;

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

      /* ---------- PLATFORM COVERAGE ---------- */

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
        try {
          const json = JSON.parse($(el).html() || '');
          schemas.push(json);
        } catch {}
      });

      pages.push({
        url: current,
        status: 200,
        loadTimeMs,
        sizeKb: Math.round(Buffer.byteLength(html) / 1024),
        onPageperformance,
        title,
        metaDescription,
        h1Count,
        imageCount,
        imagesWithAlt,
        dynamicScore,

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
      });

      /* ---------- DISCOVER INTERNAL LINKS ---------- */

      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;

        try {
          const fullUrl = new URL(href, current).href;
          const cleanUrl = normalizeUrl(fullUrl);

          if (isInternal(cleanUrl, hostname) && !visited.has(cleanUrl)) {
            queue.push(cleanUrl);
          }
        } catch {}
      });

      await page.close();
    } catch {
      if (page) await page.close();
    }
  }

  await browser.close();

  const result = buildPagePerformanceAndSiteWide(pages);
  
  // Add URL and generate AI recommendations
  const analysisWithUrl = {
    ...result,
    url: baseUrl
  };
  
  try {
    const geminiIssues = await generateUniversalSeoIssues(analysisWithUrl, 'site-wide');
    return {
      ...result,
      issues: geminiIssues
    };
  } catch (error) {
    console.error('Gemini analysis failed:', error);
    return result;
  }
}

/* ===================== FINAL JSON BUILDER ===================== */

function buildPagePerformanceAndSiteWide(pages: PageAnalysis[]) {
  const totalPages = pages.length;

  const fastPages = pages.filter(p => p.onPageperformance === 'fast').length;
  const slowPages = pages.filter(p => p.onPageperformance === 'slow').length;
  const errorPages = pages.filter(p => p.onPageperformance === 'error').length;

  const averageLoadTimeMs = totalPages
    ? Math.round(pages.reduce((s, p) => s + p.loadTimeMs, 0) / totalPages)
    : 0;

  const dynamicScoreAverage = totalPages
    ? Math.round(pages.reduce((s, p) => s + p.dynamicScore, 0) / totalPages)
    : 0;

  const totalImages = pages.reduce((s, p) => s + p.imageCount, 0);
  const imagesWithAlt = pages.reduce((s, p) => s + p.imagesWithAlt, 0);

  const altCoveragePercent =
    totalImages > 0 ? Math.round((imagesWithAlt / totalImages) * 100) : 0;

  const averageH1PerPage =
    totalPages > 0
      ? Math.round((pages.reduce((s, p) => s + p.h1Count, 0) / totalPages) * 10) / 10
      : 0;

  const siteType =
    dynamicScoreAverage > 50 ? 'dynamic' :
    dynamicScoreAverage > 20 ? 'hybrid' : 'static';

  const onPageperformanceScore =
    averageLoadTimeMs < 1000 ? 90 :
    averageLoadTimeMs < 2000 ? 80 :
    averageLoadTimeMs < 3000 ? 70 : 50;

  return {
    pagePerformanceAndSiteWide: {
      summary: {
        totalPages,
        onPageperformanceScore,
        averageLoadTimeMs,
        fastPages,
        slowPages,
        errorPages,
        dynamicScoreAverage,
        siteType,
        seoHealthScore: 0,
        images: {
          total: totalImages,
          withAlt: imagesWithAlt,
          altCoveragePercent
        },
        headings: {
          averageH1PerPage
        }
      },
      pages
    }
  };
}

export default crawlAndAnalyzeSPA;
