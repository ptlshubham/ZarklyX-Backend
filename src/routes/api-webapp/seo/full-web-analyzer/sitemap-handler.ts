
import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { parseStringPromise } from 'xml2js';
import zlib from 'zlib';


// =============================================================================
// TYPES & INTERFACES
// =============================================================================

interface URLDetails {
  row: number;
  address: string;
  contentType: string;
  statusCode: number;
  status: string;
  indexability: string;
  indexabilityStatus: string;
  canonicalUrl?: string;
  hasXRobotsTag?: boolean;
}

interface SummaryReport {
  'URLs in sitemap': number;
  'URLs linked from homepage but missing in sitemap': number;
  'Non-indexable URLs in Sitemap': number;
  'URLs in Multiple Sitemaps': number;
  'Sitemaps with over 50k URLs': number;
  'Sitemaps over 50MB (uncompressed)': number;
  'Total nested sitemaps': number;
  'Canonical issues': number;
}

interface AnalysisReport {
  summary: SummaryReport;
  urlDetails: URLDetails[];
}

interface AnalysisRequest {
  domain: string;
  maxConcurrent?: number;
  detailedAnalysis?: boolean;
}

interface AnalysisContext {
  client: AxiosInstance;
  allSitemaps: Set<string>;
  urlToSitemaps: Map<string, Set<string>>;
  discoveredUrls: Set<string>;
  sitemapSizes: Map<string, number>;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function createClient(): AxiosInstance {
  return axios.create({
    timeout: 15000,
    headers: { 
      'User-Agent': 'Mozilla/5.0 (compatible; SitemapAnalyzer/3.0; +https://seo-analyzer.com/bot)'
    },
    maxRedirects: 5,
    decompress: true // Auto-handle gzip responses
  });
}

function createContext(): AnalysisContext {
  return {
    client: createClient(),
    allSitemaps: new Set(),
    urlToSitemaps: new Map(),
    discoveredUrls: new Set(),
    sitemapSizes: new Map()
  };
}

function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`.replace(/\/$/, '');
  } catch {
    return url;
  }
}

function isSelfReferencing(url: string, canonical: string): boolean {
  try {
    const urlObj = new URL(url);
    const canonicalObj = new URL(canonical, url);
    return normalizeUrl(urlObj.href) === normalizeUrl(canonicalObj.href);
  } catch {
    return true;
  }
}

// =============================================================================
// URL ANALYSIS FUNCTIONS (SEO-CORRECT)
// =============================================================================

async function analyzeURL(
  url: string, 
  row: number, 
  client: AxiosInstance
): Promise<URLDetails> {
  const details: URLDetails = {
    row,
    address: url,
    contentType: '',
    statusCode: 0,
    status: 'Unknown',
    indexability: 'Unknown',
    indexabilityStatus: '',
    hasXRobotsTag: false
  };

  try {
    //  FIX: Use GET only (not HEAD) for accurate SEO signals
    const response = await client.get(url, {
      validateStatus: () => true,
      maxRedirects: 0, // Don't follow redirects to detect them
      responseType: 'arraybuffer' // Handle binary/text responses
    });

    details.statusCode = response.status;
    details.contentType = response.headers['content-type']?.split(';')[0] || 'unknown';

    // Determine status
    if (response.status === 200) {
      details.status = 'OK';
    } else if (response.status >= 300 && response.status < 400) {
      details.status = 'Redirect';
      details.indexability = 'Non-Indexable';
      details.indexabilityStatus = `Redirect (${response.status})`;
      return details;
    } else if (response.status >= 400 && response.status < 500) {
      details.status = 'Client Error';
      details.indexability = 'Non-Indexable';
      details.indexabilityStatus = `Broken (${response.status})`;
      return details;
    } else if (response.status >= 500) {
      details.status = 'Server Error';
      details.indexability = 'Non-Indexable';
      details.indexabilityStatus = `Server Error (${response.status})`;
      return details;
    }

    //  Check X-Robots-Tag header first (from GET response)
    const xRobotsTag = (response.headers['x-robots-tag'] || '').toLowerCase();
    const hasXRobotsNoindex = xRobotsTag.includes('noindex');
    details.hasXRobotsTag = xRobotsTag.length > 0;

    if (hasXRobotsNoindex) {
      details.indexability = 'Non-Indexable';
      details.indexabilityStatus = 'X-Robots-Tag: noindex';
      return details;
    }

    // Parse HTML for meta robots and canonical
    if (details.contentType.includes('text/html')) {
      const html = Buffer.from(response.data).toString('utf-8');
      const $ = cheerio.load(html);
      
      // Check meta robots
      const metaRobots = $('meta[name="robots"]').attr('content') || '';
      const hasNoindex = metaRobots.toLowerCase().includes('noindex');
      
      if (hasNoindex) {
        details.indexability = 'Non-Indexable';
        details.indexabilityStatus = 'Meta Robots: noindex';
        return details;
      }

      //  Enhanced canonical check
      const canonical = $('link[rel="canonical"]').attr('href');
      if (canonical) {
        details.canonicalUrl = canonical;
        
        try {
          const canonicalFullUrl = new URL(canonical, url).href;
          
          // Check if self-referencing
          if (!isSelfReferencing(url, canonicalFullUrl)) {
            details.indexability = 'Non-Indexable';
            details.indexabilityStatus = 'Canonicalized to different URL';
            
            //  Check if canonical points to different domain
            const urlDomain = new URL(url).hostname;
            const canonicalDomain = new URL(canonicalFullUrl).hostname;
            if (urlDomain !== canonicalDomain) {
              details.indexabilityStatus = 'Cross-domain canonical';
            }
            
            return details;
          }
        } catch {
          details.indexability = 'Non-Indexable';
          details.indexabilityStatus = 'Invalid canonical URL';
          return details;
        }
      }

      //  Check for hreflang misuse
      const hreflang = $('link[rel="alternate"][hreflang]').length;
      if (hreflang > 0 && !canonical) {
        // Hreflang pages should have self-referencing canonical
        details.indexabilityStatus = 'Missing self-referencing canonical with hreflang';
      }

      // If all checks pass
      details.indexability = 'Indexable';
      details.indexabilityStatus = '';
      
    } else {
      // Non-HTML content (PDF, images, etc.)
      details.indexability = 'Indexable';
      details.indexabilityStatus = `Non-HTML (${details.contentType})`;
    }

  } catch (error: any) {
    if (error.response) {
      details.statusCode = error.response.status;
      details.status = 'Failed';
      details.indexability = 'Non-Indexable';
      details.indexabilityStatus = `HTTP ${error.response.status}`;
    } else {
      details.statusCode = 0;
      details.status = 'Failed';
      details.indexability = 'Non-Indexable';
      details.indexabilityStatus = 'Unreachable (timeout/network)';
    }
  }

  return details;
}

//  FIX: Proper concurrency with correct row numbering
async function analyzeAllUrls(
  urls: string[], 
  client: AxiosInstance,
  maxConcurrent: number
): Promise<URLDetails[]> {
  const results: URLDetails[] = new Array(urls.length);
  const semaphore: Promise<void>[] = [];
  
  for (let i = 0; i < urls.length; i++) {
    const index = i;
    const url = urls[i];
    
    const task = (async () => {
      const details = await analyzeURL(url, index + 1, client);
      results[index] = details;
    })();
    
    semaphore.push(task);
    
    // Wait if we hit concurrency limit
    if (semaphore.length >= maxConcurrent) {
      await Promise.race(semaphore);
      semaphore.splice(semaphore.findIndex(p => p === task), 1);
    }
  }
  
  await Promise.all(semaphore);
  return results;
}

// =============================================================================
// SITEMAP DISCOVERY FUNCTIONS
// =============================================================================

async function discoverAllSitemaps(
  domain: string, 
  ctx: AnalysisContext
): Promise<string[]> {
  const sitemaps: string[] = [];
  
  try {
    const { data } = await ctx.client.get(`${domain}/robots.txt`);
    const matches = data.match(/Sitemap:\s*(.+)/gi);
    if (matches) {
      matches.forEach((m: string) => {
        const url = m.split(':').slice(1).join(':').trim();
        sitemaps.push(url);
        ctx.allSitemaps.add(url);
      });
    }
  } catch {}

  const paths = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap.xml.gz'];
  
  for (const path of paths) {
    try {
      await ctx.client.head(`${domain}${path}`);
      const url = `${domain}${path}`;
      if (!sitemaps.includes(url)) {
        sitemaps.push(url);
        ctx.allSitemaps.add(url);
      }
    } catch {}
  }

  return sitemaps;
}

// FIX: Handle gzip sitemaps correctly
async function fetchSitemapUrls(
  sitemapUrl: string, 
  rootSitemap: string,
  ctx: AnalysisContext
): Promise<string[]> {
  try {
    const response = await ctx.client.get(sitemapUrl, {
      responseType: 'arraybuffer'
    });
    
    let xmlData: string;
    const buffer = Buffer.from(response.data);
    
    //  Detect and decompress .gz files
    if (sitemapUrl.endsWith('.gz')) {
      xmlData = zlib.gunzipSync(buffer).toString('utf-8');
    } else {
      xmlData = buffer.toString('utf-8');
    }
    
    // Store uncompressed size for validation
    ctx.sitemapSizes.set(sitemapUrl, Buffer.byteLength(xmlData));
    
    const result = await parseStringPromise(xmlData);
    let urls: string[] = [];

    // Handle sitemap index
    if (result.sitemapindex) {
      const nestedSitemaps = result.sitemapindex.sitemap || [];
      for (const nested of nestedSitemaps) {
        const nestedUrl = nested.loc[0];
        ctx.allSitemaps.add(nestedUrl);
        const nestedUrls = await fetchSitemapUrls(nestedUrl, rootSitemap, ctx);
        urls.push(...nestedUrls);
      }
    } 
    // Handle regular sitemap
    else if (result.urlset) {
      const urlset = result.urlset.url || [];
      urls = urlset.map((u: any) => u.loc[0]);
      
      // Track which sitemaps contain which URLs
      urls.forEach(url => {
        if (!ctx.urlToSitemaps.has(url)) {
          ctx.urlToSitemaps.set(url, new Set());
        }
        ctx.urlToSitemaps.get(url)!.add(rootSitemap);
      });
    }

    return urls;
  } catch (error) {
    console.warn(` Failed to fetch ${sitemapUrl}:`, error instanceof Error ? error.message : 'Unknown error');
    return [];
  }
}

async function fetchAllUrls(
  sitemaps: string[], 
  ctx: AnalysisContext
): Promise<string[]> {
  const allUrls: string[] = [];
  
  for (const sitemap of sitemaps) {
    const urls = await fetchSitemapUrls(sitemap, sitemap, ctx);
    allUrls.push(...urls);
  }

  return [...new Set(allUrls)];
}

// =============================================================================
// ANALYSIS METRIC FUNCTIONS
// =============================================================================

function findUrlsInMultipleSitemaps(ctx: AnalysisContext): number {
  let count = 0;
  ctx.urlToSitemaps.forEach((sitemaps) => {
    if (sitemaps.size > 1) count++;
  });
  return count;
}

//  FIX: Check uncompressed size + count nested sitemaps
async function checkSitemapSizes(ctx: AnalysisContext): Promise<{
  over50k: number;
  over50mb: number;
  totalNested: number;
}> {
  let over50k = 0;
  let over50mb = 0;
  const totalNested = ctx.allSitemaps.size;

  for (const [sitemap, uncompressedSize] of ctx.sitemapSizes.entries()) {
    try {
      // Check uncompressed size (already stored)
      const sizeInMB = uncompressedSize / (1024 * 1024);
      if (sizeInMB > 50) over50mb++;
      
      // Check URL count
      const response = await ctx.client.get(sitemap, {
        responseType: 'arraybuffer'
      });
      
      let xmlData: string;
      if (sitemap.endsWith('.gz')) {
        xmlData = zlib.gunzipSync(Buffer.from(response.data)).toString('utf-8');
      } else {
        xmlData = Buffer.from(response.data).toString('utf-8');
      }
      
      const result = await parseStringPromise(xmlData);
      if (result.urlset && result.urlset.url) {
        if (result.urlset.url.length > 50000) over50k++;
      }
    } catch {}
  }

  return { over50k, over50mb, totalNested };
}

//  FIX: Renamed to reflect what it actually does
async function findUrlsLinkedFromHomepage(
  domain: string, 
  sitemapUrls: string[],
  ctx: AnalysisContext
): Promise<number> {
  const sitemapSet = new Set(sitemapUrls);
  let notInSitemapCount = 0;

  try {
    const { data } = await ctx.client.get(domain);
    const $ = cheerio.load(data);
    
    $('a[href]').each((_, elem) => {
      const href = $(elem).attr('href');
      if (!href) return;

      try {
        const url = new URL(href, domain);
        const domainHostname = new URL(domain).hostname;
        
        if (url.hostname === domainHostname) {
          const fullUrl = url.href.split('#')[0].split('?')[0]; // Remove hash and query params
          ctx.discoveredUrls.add(fullUrl);
          if (!sitemapSet.has(fullUrl)) {
            notInSitemapCount++;
          }
        }
      } catch {}
    });
  } catch {
    console.warn('  Could not crawl homepage for link discovery');
  }

  return notInSitemapCount;
}

// Count canonical issues
function countCanonicalIssues(urlDetails: URLDetails[]): number {
  return urlDetails.filter(u => 
    u.indexabilityStatus?.includes('canonical') ||
    u.indexabilityStatus?.includes('Canonical')
  ).length;
}

// =============================================================================
// MAIN ANALYSIS FUNCTION
// =============================================================================

export async function analyzeSitemap(
  domain: string, 
  maxConcurrent: number = 5,
  detailed: boolean = true
): Promise<AnalysisReport> {
  const ctx = createContext();
  const normalizedDomain = domain.replace(/\/$/, '');
  
  console.log(' Starting SEO-correct sitemap analysis...\n');
  
  // Discover all sitemaps
  console.log(' Discovering sitemaps...');
  const sitemaps = await discoverAllSitemaps(normalizedDomain, ctx);
  console.log(` Found ${sitemaps.length} root sitemap(s)\n`);

  // Fetch all URLs from all sitemaps
  console.log(' Fetching URLs from sitemaps (including gzip handling)...');
  const allUrls = await fetchAllUrls(sitemaps, ctx);
  console.log(`Total URLs in sitemap(s): ${allUrls.length}\n`);

  // Analyze each URL in detail (if requested)
  let urlDetails: URLDetails[] = [];
  if (detailed) {
    console.log(' Analyzing URLs (using GET requests for accurate signals)...');
    urlDetails = await analyzeAllUrls(allUrls, ctx.client, maxConcurrent);
    console.log(` Analyzed ${urlDetails.length} URLs\n`);
  } else {
    urlDetails = allUrls.map((url, idx) => ({
      row: idx + 1,
      address: url,
      contentType: 'unknown',
      statusCode: 0,
      status: 'Not Checked',
      indexability: 'Unknown',
      indexabilityStatus: ''
    }));
  }

  // Calculate summary metrics
  console.log(' Calculating SEO metrics...');
  const nonIndexable = urlDetails.filter(u => u.indexability === 'Non-Indexable').length;
  const multiSitemap = findUrlsInMultipleSitemaps(ctx);
  const { over50k, over50mb, totalNested } = await checkSitemapSizes(ctx);
  const homepageLinksNotInSitemap = await findUrlsLinkedFromHomepage(normalizedDomain, allUrls, ctx);
  const canonicalIssues = countCanonicalIssues(urlDetails);

  const summary: SummaryReport = {
    'URLs in sitemap': allUrls.length,
    'URLs linked from homepage but missing in sitemap': homepageLinksNotInSitemap,
    'Non-indexable URLs in Sitemap': nonIndexable,
    'URLs in Multiple Sitemaps': multiSitemap,
    'Sitemaps with over 50k URLs': over50k,
    'Sitemaps over 50MB (uncompressed)': over50mb,
    'Total nested sitemaps': totalNested,
    'Canonical issues': canonicalIssues
  };

  return { summary, urlDetails };
}

// =============================================================================
// CSV EXPORT FUNCTION
// =============================================================================

function exportToCSV(urlDetails: URLDetails[]): string {
  const headers = [
    'Row', 'Address', 'Content Type', 'Status Code', 'Status', 
    'Indexability', 'Indexability Status', 'Canonical URL', 'Has X-Robots-Tag'
  ];
  
  const rows = urlDetails.map(u => [
    u.row,
    u.address,
    u.contentType,
    u.statusCode,
    u.status,
    u.indexability,
    u.indexabilityStatus || '',
    u.canonicalUrl || '',
    u.hasXRobotsTag ? 'Yes' : 'No'
  ]);

  return [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');
}

