
import * as cheerio from 'cheerio';
import { randomUUID } from 'crypto';
import { httpClient } from '../utils/http-client';
import { generateUniversalSeoIssues } from '../../../../services/universal-seo-issues';
import { TechJsAnalysis } from './tech-js-model';
import { AnalysisSaver } from '../utils/analysis-base';

/* ============================================================
   TYPES
============================================================ */

export interface JsFrameworkAnalysisResponse {
  success: boolean;
  analysisId: string;
  analyzedAt: string;
  data?: JsFrameworkAnalysis;
  error?: string;
  issues?: any[];
}

export interface JsDependencyMetrics {
  dependencyScore: {
    value: number;
    status: 'low' | 'medium' | 'high' | 'critical';
    impact: string;
  };
  renderBlockingScripts: {
    count: number;
    totalSizeKB: number;
    files: Array<{
      src: string;
      sizeKB: number;
      type: 'external' | 'inline';
      position: 'head' | 'body';
    }>;
    status: 'good' | 'warning' | 'critical';
    impact: string;
  };
  clientSideRendering: {
    detected: boolean;
    framework?: string;
    impact: string;
    status: 'good' | 'warning' | 'critical';
  };
  jsExecutionTime: {
    estimatedMs: number;
    status: 'good' | 'warning' | 'critical';
    impact: string;
  };
}

export interface RenderingBehavior {
  serverSideRendering: {
    detected: boolean;
    framework?: string;
    impact: string;
    status: 'good' | 'warning' | 'critical';
  };
  hydrationDelay: {
    estimatedMs: number;
    status: 'good' | 'warning' | 'critical';
    impact: string;
  };
  domContentLoaded: {
    estimatedTimeMs: number;
    status: 'good' | 'warning' | 'critical';
    impact: string;
  };
  javascriptRequiredForContent: {
    required: boolean;
    percentage: number;
    status: 'good' | 'warning' | 'critical';
    impact: string;
  };
}

export interface JsDependencyAnalysis {
  totalJsSize: {
    valueKB: number;
    status: 'good' | 'warning' | 'critical';
    impact: string;
  };
  unusedJs: {
    estimatedPercentage: number;
    status: 'good' | 'warning' | 'critical';
    impact: string;
  };
  thirdPartyScripts: {
    count: number;
    totalSizeKB: number;
    scripts: Array<{
      src: string;
      sizeKB: number;
      type: string;
    }>;
    status: 'good' | 'warning' | 'critical';
    impact: string;
  };
  criticalJsFiles: {
    count: number;
    totalSizeKB: number;
    files: Array<{
      src: string;
      sizeKB: number;
      criticality: 'high' | 'medium' | 'low';
    }>;
    status: 'good' | 'warning' | 'critical';
    impact: string;
  };
}

export interface SeoVisibilityImpact {
  contentVisibleWithoutJs: {
    visible: boolean;
    percentage: number;
    status: 'good' | 'warning' | 'critical';
    impact: string;
  };
  lazyLoadedContent: {
    detected: boolean;
    percentage: number;
    status: 'good' | 'warning' | 'critical';
    impact: string;
  };
  googleBotRenderable: {
    renderable: boolean;
    confidence: 'high' | 'medium' | 'low';
    status: 'good' | 'warning' | 'critical';
    impact: string;
  };
}

export interface JsFrameworkAnalysis {
  frontend: {
    frameworks: {
      react: boolean;
      angular: boolean;
      vue: boolean;
      jquery: boolean;
      nextjs: boolean;
      nuxt: boolean;
      svelte: boolean;
    };
    rendering: 'static' | 'csr' | 'ssr-hybrid';
    buildTools: string[];
  };
  backend: {
    technologies: string[];
    cms: string | null;
    language: string | null;
  };
  infrastructure: {
    cdn: string | null;
    hosting: string | null;
    server: string | null;
  };
  analytics: string[];
  confidence: 'low' | 'medium' | 'high';
  jsDependencyMetrics?: JsDependencyMetrics;
  renderingBehavior?: RenderingBehavior;
  jsDependencyAnalysis?: JsDependencyAnalysis;
  seoVisibilityImpact?: SeoVisibilityImpact;
}

/* ============================================================
   DETECTION PATTERNS
============================================================ */

const FRAMEWORK_PATTERNS = {
  react: [
    /data-react(root|id)/i,
    /react[\.-](dom|production|development)/i,
    /__REACT_/i,
    /_reactRoot/i,
    /react\.js/i,
    /reactdom/i,
    /\.react-/i,
    /"react"/i,
    /from ['"]react['"]/i,
    /\/react@/i,
    /unpkg\.com\/react/i,
    /cdn.*react/i
  ],
  angular: [
    /ng-version/i,
    /<app-root/i,
    /angular\.io/i,
    /@angular\//i,
    /ng-app/i,
    /angular\.js/i,
    /angular[\.-](core|common)/i,
    /"angular"/i,
    /from ['"]@angular/i,
    /\/angular@/i,
    /unpkg\.com\/angular/i,
    /cdn.*angular/i,
    /ng-controller/i,
    /\[ngIf\]/i,
    /\(click\)=/i
  ],
  vue: [
    /data-v-[\da-f]{8}/i,
    /vue\.runtime/i,
    /__vue__/i,
    /vue\.js/i,
    /vue@\d/i,
    /vue[\.-](global|esm)/i,
    /"vue"/i,
    /from ['"]vue['"]/i,
    /\/vue@/i,
    /unpkg\.com\/vue/i,
    /cdn.*vue/i,
    /v-if=/i,
    /v-for=/i,
    /v-bind:/i,
    /@click=/i,
    /vuejs\.org/i
  ],
  jquery: [
    /jquery[\.-]\d/i,
    /jquery\.min\.js/i,
    /ajax\.googleapis\.com\/ajax\/libs\/jquery/i,
    /jquery\.js/i,
    /"jquery"/i,
    /\/jquery@/i,
    /unpkg\.com\/jquery/i,
    /cdn.*jquery/i,
    /code\.jquery\.com/i,
    /\$\(document\)\.ready/i,
    /\$\(['"]#/i
  ],
  nextjs: [
    /__next/i,
    /_next\/static/i,
    /next\.js/i,
    /__NEXT_DATA__/i,
    /_next\/image/i,
    /next\/script/i,
    /next\/link/i,
    /next\/head/i,
    /"next"/i,
    /from ['"]next/i,
    /nextjs\.org/i,
    /vercel\.app/i
  ],
  nuxt: [
    /__nuxt/i,
    /\.nuxt\//i,
    /_nuxt\//i,
    /nuxt\.js/i,
    /"nuxt"/i,
    /from ['"]nuxt/i,
    /nuxtjs\.org/i,
    /__NUXT__/i,
    /nuxt-link/i
  ],
  svelte: [
    /class="svelte-/i,
    /svelte\.js/i,
    /__svelte__/i,
    /"svelte"/i,
    /from ['"]svelte/i,
    /\/svelte@/i,
    /unpkg\.com\/svelte/i,
    /cdn.*svelte/i,
    /svelte\.dev/i,
    /\.svelte/i
  ]
};

const CMS_PATTERNS = {
  WordPress: [/wp-content/i, /wp-includes/i, /wordpress/i],
  Drupal: [/drupal/i, /sites\/default/i, /\/modules\//i],
  Joomla: [/joomla/i, /\/components\/com_/i],
  Shopify: [/cdn\.shopify\.com/i, /myshopify\.com/i, /Shopify\.theme/i],
  Strapi: [/strapi/i],
  Contentful: [/contentful/i, /ctfassets\.net/i],
  Wix: [/wix\.com/i, /parastorage\.com/i],
  Webflow: [/webflow/i, /wf-page/i],
  Squarespace: [/squarespace/i, /sqsp\.net/i],
  Ghost: [/ghost\.org/i, /ghost\.io/i]
};

const BACKEND_PATTERNS = {
  Django: [/django/i, /csrfmiddlewaretoken/i, /\/static\/admin\//i],
  Laravel: [/laravel/i, /\/vendor\/laravel/i],
  'Ruby on Rails': [/rails/i, /\/assets\/application-/i],
  'Express.js': [/express/i],
  'ASP.NET': [/asp\.net/i, /\.aspx/i, /__viewstate/i],
  Flask: [/flask/i],
  'Spring Boot': [/spring/i, /\.jsp/i]
};

const THIRD_PARTY_DOMAINS = [
  'googleapis.com',
  'cloudflare.com',
  'jquery.com',
  'bootstrapcdn.com',
  'unpkg.com',
  'cdnjs.cloudflare.com',
  'jsdelivr.net',
  'gstatic.com',
  'facebook.net',
  'twitter.com',
  'linkedin.com',
  'googletagmanager.com',
  'google-analytics.com',
  'doubleclick.net',
  'adsystem.com',
  'amazon-adsystem.com'
];

/* ============================================================
   HELPER FUNCTIONS
============================================================ */

function detectFramework(
  html: string,
  $: cheerio.CheerioAPI,
  patterns: RegExp[],
  selectors: string[]
): boolean {
  const patternMatch = patterns.some(pattern => pattern.test(html));
  if (patternMatch) return true;

  return selectors.some(selector => {
    try {
      return $(selector).length > 0;
    } catch {
      return false;
    }
  });
}

function checkScriptContent($: cheerio.CheerioAPI, keyword: string): boolean {
  try {
    let found = false;
    $('script').each((_, elem) => {
      const src = $(elem).attr('src') || '';
      const content = $(elem).html() || '';
      const combined = (src + content).toLowerCase();
      
      if (combined.includes(keyword.toLowerCase())) {
        found = true;
        return false;
      }
    });
    return found;
  } catch {
    return false;
  }
}

function isThirdPartyScript(src: string, baseDomain?: string): boolean {
  if (!src) return false;
  
  // Check against known third-party domains
  if (THIRD_PARTY_DOMAINS.some(domain => src.includes(domain))) {
    return true;
  }
  
  // Check if it's from a different domain
  if (baseDomain) {
    try {
      const srcUrl = new URL(src, `https://${baseDomain}`);
      const baseUrl = new URL(`https://${baseDomain}`);
      return srcUrl.hostname !== baseUrl.hostname && 
             !srcUrl.hostname.endsWith(`.${baseUrl.hostname}`);
    } catch {
      return true;
    }
  }
  
  return false;
}

function calculateDependencyScore(
  renderBlockingCount: number,
  totalSizeKB: number,
  thirdPartyPercentage: number,
  csrDetected: boolean
): { value: number; status: 'low' | 'medium' | 'high' | 'critical' } {
  let score = 100;
  
  // Deduct points for render-blocking scripts
  if (renderBlockingCount > 5) score -= 30;
  else if (renderBlockingCount > 3) score -= 20;
  else if (renderBlockingCount > 1) score -= 10;
  
  // Deduct points for large JS bundles
  if (totalSizeKB > 1000) score -= 30;
  else if (totalSizeKB > 500) score -= 20;
  else if (totalSizeKB > 200) score -= 10;
  
  // Deduct points for third-party scripts
  if (thirdPartyPercentage > 50) score -= 20;
  else if (thirdPartyPercentage > 30) score -= 10;
  
  // Deduct points for client-side rendering
  if (csrDetected) score -= 15;
  
  score = Math.max(0, Math.min(100, score));
  
  let status: 'low' | 'medium' | 'high' | 'critical';
  if (score >= 80) status = 'low';
  else if (score >= 60) status = 'medium';
  else if (score >= 40) status = 'high';
  else status = 'critical';
  
  return { value: score, status };
}

function estimateJsExecutionTime(totalSizeKB: number, scriptCount: number): number {
  // Rough estimation: 1KB ≈ 0.1ms execution time on average hardware
  const sizeFactor = totalSizeKB * 0.1;
  const countFactor = scriptCount * 5;
  return Math.round(sizeFactor + countFactor);
}

function analyzeJsDependencies($: cheerio.CheerioAPI, baseDomain?: string) {
  const scripts = $('script');
  let totalSizeKB = 0;
  const renderBlockingScripts: Array<{
    src: string;
    sizeKB: number;
    type: 'external' | 'inline';
    position: 'head' | 'body';
  }> = [];
  
  const thirdPartyScripts: Array<{
    src: string;
    sizeKB: number;
    type: string;
  }> = [];
  
  const criticalJsFiles: Array<{
    src: string;
    sizeKB: number;
    criticality: 'high' | 'medium' | 'low';
  }> = [];
  
  let inlineScriptCount = 0;
  let externalScriptCount = 0;
  
  scripts.each((_, elem) => {
    const $elem = $(elem);
    const src = $elem.attr('src');
    const async = $elem.attr('async');
    const defer = $elem.attr('defer');
    const type = $elem.attr('type');
    const isModule = type === 'module';
    const isHead = $elem.parents('head').length > 0;
    
    // Skip non-JavaScript and module scripts (they're usually deferred)
    if (type && !type.includes('javascript') && type !== 'module') return;
    
    let sizeKB = 0;
    let scriptType: 'external' | 'inline' = 'inline';
    
    if (src) {
      scriptType = 'external';
      externalScriptCount++;
      
      // Estimate size based on common patterns or use default
      if (src.includes('min.js') || src.includes('.min.')) {
        sizeKB = 50; // Average minified library size
      } else if (src.includes('.bundle.') || src.includes('chunk')) {
        sizeKB = 100; // Average bundle size
      } else {
        sizeKB = 30; // Default average
      }
      
      // Check if third-party
      if (isThirdPartyScript(src, baseDomain)) {
        thirdPartyScripts.push({
          src,
          sizeKB,
          type: 'third-party'
        });
      }
    } else {
      scriptType = 'inline';
      inlineScriptCount++;
      const content = $elem.html() || '';
      sizeKB = Buffer.byteLength(content, 'utf8') / 1024;
    }
    
    totalSizeKB += sizeKB;
    
    // Check if render-blocking (no async, no defer, not module, in head or early body)
    const isRenderBlocking = !async && !defer && !isModule && 
                            (isHead || (scriptType === 'inline' && sizeKB > 10));
    
    if (isRenderBlocking) {
      renderBlockingScripts.push({
        src: src || 'inline-script',
        sizeKB,
        type: scriptType,
        position: isHead ? 'head' : 'body'
      });
    }
    
    // Determine criticality
    let criticality: 'high' | 'medium' | 'low' = 'low';
    if (isRenderBlocking) {
      criticality = sizeKB > 50 ? 'high' : 'medium';
    } else if (src && src.includes('critical') || src?.includes('main')) {
      criticality = 'medium';
    }
    
    if (criticality !== 'low' || scriptType === 'inline') {
      criticalJsFiles.push({
        src: src || 'inline-script',
        sizeKB,
        criticality
      });
    }
  });
  
  return {
    totalSizeKB,
    renderBlockingScripts,
    thirdPartyScripts,
    criticalJsFiles,
    inlineScriptCount,
    externalScriptCount
  };
}

/* ============================================================
   MAIN DETECTOR WITH ENHANCED METRICS
============================================================ */

export function detectWebsiteTechStack(
  $: cheerio.CheerioAPI,
  htmlContent: string | Buffer,
  headers: Record<string, string | string[] | undefined> = {},
  url?: string
): JsFrameworkAnalysisResponse {
  const analysisId = randomUUID();
  const analyzedAt = new Date().toISOString();

  try {
    const html = Buffer.isBuffer(htmlContent)
      ? htmlContent.toString('utf-8')
      : htmlContent;

    if (!html || typeof html !== 'string') {
      return {
        success: false,
        analysisId,
        analyzedAt,
        error: 'Invalid or empty HTML content'
      };
    }

    // Parse base domain from URL
    let baseDomain: string | undefined;
    if (url) {
      try {
        const urlObj = new URL(url);
        baseDomain = urlObj.hostname;
      } catch {
        baseDomain = undefined;
      }
    }

    /* ===============================
       FRONTEND FRAMEWORK DETECTION
    =============================== */

    const frameworks = {
      react: detectFramework(html, $, FRAMEWORK_PATTERNS.react, [
        '[data-reactroot]',
        '[data-reactid]',
        'script[src*="react"]',
        '#root',
        '#app',
        '[id*="react"]'
      ]) || checkScriptContent($, 'react'),
      
      angular: detectFramework(html, $, FRAMEWORK_PATTERNS.angular, [
        '[ng-version]',
        'app-root',
        '[ng-app]',
        '[ng-controller]',
        '[ng-if]',
        'script[src*="angular"]'
      ]) || checkScriptContent($, 'angular'),
      
      vue: detectFramework(html, $, FRAMEWORK_PATTERNS.vue, [
        '[data-v-]',
        'script[src*="vue"]',
        '[v-if]',
        '[v-for]',
        '[v-bind]',
        '[v-model]'
      ]) || checkScriptContent($, 'vue'),
      
      jquery: detectFramework(html, $, FRAMEWORK_PATTERNS.jquery, [
        'script[src*="jquery"]',
        'script[src*="code.jquery.com"]'
      ]) || checkScriptContent($, 'jquery'),
      
      nextjs: detectFramework(html, $, FRAMEWORK_PATTERNS.nextjs, [
        '#__next',
        'script[src*="_next"]',
        'script[id="__NEXT_DATA__"]'
      ]) || checkScriptContent($, 'next'),
      
      nuxt: detectFramework(html, $, FRAMEWORK_PATTERNS.nuxt, [
        '#__nuxt',
        'script[src*="_nuxt"]',
        'nuxt-link'
      ]) || checkScriptContent($, 'nuxt'),
      
      svelte: detectFramework(html, $, FRAMEWORK_PATTERNS.svelte, [
        '[class*="svelte-"]',
        'script[src*="svelte"]'
      ]) || checkScriptContent($, 'svelte')
    };

    // Detect build tools
    const buildTools: string[] = [];
    if (/webpack/i.test(html)) buildTools.push('Webpack');
    if (/vite/i.test(html)) buildTools.push('Vite');
    if (/parcel/i.test(html)) buildTools.push('Parcel');
    if (/rollup/i.test(html)) buildTools.push('Rollup');

    // Determine rendering method
    const rendering: 'static' | 'csr' | 'ssr-hybrid' =
      frameworks.nextjs || frameworks.nuxt
        ? 'ssr-hybrid'
        : frameworks.react ||
          frameworks.angular ||
          frameworks.vue ||
          frameworks.svelte
        ? 'csr'
        : 'static';

    /* ===============================
       JAVASCRIPT DEPENDENCY ANALYSIS
    =============================== */

    const jsAnalysis = analyzeJsDependencies($, baseDomain);
    const totalScripts = jsAnalysis.inlineScriptCount + jsAnalysis.externalScriptCount;
    const thirdPartyPercentage = jsAnalysis.thirdPartyScripts.length > 0 
      ? (jsAnalysis.thirdPartyScripts.reduce((sum, s) => sum + s.sizeKB, 0) / jsAnalysis.totalSizeKB) * 100 
      : 0;

    // Dependency Score Calculation
    const csrDetected = rendering === 'csr';
    const dependencyScore = calculateDependencyScore(
      jsAnalysis.renderBlockingScripts.length,
      jsAnalysis.totalSizeKB,
      thirdPartyPercentage,
      csrDetected
    );

    // Estimate JS execution time
    const estimatedExecutionTime = estimateJsExecutionTime(jsAnalysis.totalSizeKB, totalScripts);

    /* ===============================
       RENDERING BEHAVIOR ANALYSIS
    =============================== */

    const ssrDetected = rendering === 'ssr-hybrid' || 
                       (frameworks.nextjs || frameworks.nuxt || 
                        html.includes('server-rendered') || 
                        html.includes('data-server-rendered'));

    // Estimate DOM Content Loaded time
    const domContentLoadedTime = Math.round(
      100 + // Base time
      (jsAnalysis.renderBlockingScripts.length * 50) + // Script blocking
      (jsAnalysis.totalSizeKB * 0.2) // Download and parse
    );

    /* ===============================
       SEO VISIBILITY IMPACT
    =============================== */

    // Analyze content visibility
    const bodyText = $('body').text();
    const visibleContentLength = bodyText.length;
    const totalElements = $('body *').length;
    const lazyLoadDetected = html.includes('lazy') || 
                            html.includes('IntersectionObserver') ||
                            html.includes('data-src') ||
                            $('img[loading="lazy"], iframe[loading="lazy"]').length > 0;

    // Check if content is primarily JS-driven
    const initialContent = $('body').html() || '';
    const scriptTagsCount = $('script').length;
    const contentJsDependency = scriptTagsCount > 5 ? 70 : scriptTagsCount > 2 ? 40 : 10;

    /* ===============================
       BACKEND / CMS DETECTION
    =============================== */

    let cms: string | null = null;
    let language: string | null = null;
    const backendTech = new Set<string>();

    // Detect CMS
    for (const [cmsName, patterns] of Object.entries(CMS_PATTERNS)) {
      if (patterns.some(pattern => pattern.test(html))) {
        cms = cmsName;
        if (['WordPress', 'Drupal', 'Joomla'].includes(cmsName)) {
          language = 'PHP';
        } else if (cmsName === 'Strapi') {
          language = 'Node.js';
        }
        break;
      }
    }

    // Check headers for backend info
    const poweredBy = headers['x-powered-by'];
    if (poweredBy) {
      const poweredByStr = String(poweredBy);
      backendTech.add(poweredByStr);
      
      const poweredByLower = poweredByStr.toLowerCase();
      if (poweredByLower.includes('express')) {
        backendTech.add('Express.js');
        language ??= 'Node.js';
      } else if (poweredByLower.includes('php')) {
        language ??= 'PHP';
      } else if (poweredByLower.includes('asp.net')) {
        backendTech.add('ASP.NET');
        language ??= 'C#';
      }
    }

    // Detect backend frameworks
    for (const [framework, patterns] of Object.entries(BACKEND_PATTERNS)) {
      if (patterns.some(pattern => pattern.test(html))) {
        backendTech.add(framework);
        
        // Set language based on framework
        if (framework === 'Django' || framework === 'Flask') {
          language ??= 'Python';
        } else if (framework === 'Laravel') {
          language ??= 'PHP';
        } else if (framework === 'Ruby on Rails') {
          language ??= 'Ruby';
        } else if (framework === 'Express.js') {
          language ??= 'Node.js';
        } else if (framework === 'ASP.NET') {
          language ??= 'C#';
        } else if (framework === 'Spring Boot') {
          language ??= 'Java';
        }
      }
    }

    // Additional language detection
    if (!language) {
      if (/\.php/i.test(html)) language = 'PHP';
      else if (/\.aspx/i.test(html)) language = 'C#';
      else if (/\.jsp/i.test(html)) language = 'Java';
    }

    /* ===============================
       INFRASTRUCTURE DETECTION
    =============================== */

    let cdn: string | null = null;
    let hosting: string | null = null;
    let server: string | null = null;

    // Server detection
    if (headers.server) {
      server = String(headers.server);
    }

    // CDN detection
    if (/cloudflare/i.test(html) || headers['cf-ray']) {
      cdn = 'Cloudflare';
    } else if (/fastly/i.test(html) || String(headers['x-served-by'] || '').includes('fastly')) {
      cdn = 'Fastly';
    } else if (/akamai/i.test(html)) {
      cdn = 'Akamai';
    } else if (/cloudfront/i.test(html)) {
      cdn = 'CloudFront';
    }

    // Hosting detection
    if (/vercel/i.test(html) || headers['x-vercel-id']) {
      hosting = 'Vercel';
    } else if (/netlify/i.test(html) || headers['x-nf-request-id']) {
      hosting = 'Netlify';
    } else if (
      /amazonaws\.com/i.test(html) ||
      /cloudfront/i.test(html) ||
      headers['x-amz-cf-id']
    ) {
      hosting = 'AWS';
    } else if (/azure/i.test(html) || headers['x-azure-ref']) {
      hosting = 'Azure';
    } else if (/heroku/i.test(html) || String(headers.via || '').includes('heroku')) {
      hosting = 'Heroku';
    } else if (/digitalocean/i.test(html)) {
      hosting = 'DigitalOcean';
    } else if (/github\.io/i.test(html)) {
      hosting = 'GitHub Pages';
    }

    /* ===============================
       ANALYTICS DETECTION
    =============================== */

    const analytics: string[] = [];
    if (/google-analytics|gtag|ga\.js/i.test(html)) {
      analytics.push('Google Analytics');
    }
    if (/googletagmanager/i.test(html)) {
      analytics.push('Google Tag Manager');
    }
    if (/hotjar/i.test(html)) {
      analytics.push('Hotjar');
    }
    if (/segment\.com/i.test(html)) {
      analytics.push('Segment');
    }
    if (/mixpanel/i.test(html)) {
      analytics.push('Mixpanel');
    }

    /* ===============================
       CONFIDENCE CALCULATION
    =============================== */

    const detectionPoints =
      Object.values(frameworks).filter(Boolean).length +
      backendTech.size +
      (cms ? 1 : 0) +
      (cdn ? 1 : 0) +
      (hosting ? 1 : 0) +
      analytics.length +
      buildTools.length;

    const confidence: 'low' | 'medium' | 'high' =
      detectionPoints >= 5 ? 'high' : detectionPoints >= 3 ? 'medium' : 'low';

    /* ===============================
       METRICS ASSESSMENT
    =============================== */

    const jsDependencyMetrics: JsDependencyMetrics = {
      dependencyScore: {
        value: dependencyScore.value,
        status: dependencyScore.status,
        impact: dependencyScore.status === 'low' 
          ? 'Low dependency risk, good performance'
          : dependencyScore.status === 'medium'
          ? 'Moderate dependency risk, consider optimization'
          : dependencyScore.status === 'high'
          ? 'High dependency risk, performance may be affected'
          : 'Critical dependency risk, immediate action needed'
      },
      renderBlockingScripts: {
        count: jsAnalysis.renderBlockingScripts.length,
        totalSizeKB: jsAnalysis.renderBlockingScripts.reduce((sum, s) => sum + s.sizeKB, 0),
        files: jsAnalysis.renderBlockingScripts,
        status: jsAnalysis.renderBlockingScripts.length === 0 ? 'good' : 
                jsAnalysis.renderBlockingScripts.length <= 2 ? 'warning' : 'critical',
        impact: jsAnalysis.renderBlockingScripts.length === 0
          ? 'No render-blocking scripts detected'
          : `${jsAnalysis.renderBlockingScripts.length} render-blocking scripts may delay page load`
      },
      clientSideRendering: {
        detected: csrDetected,
        framework: csrDetected 
          ? (frameworks.react ? 'React' : 
             frameworks.angular ? 'Angular' : 
             frameworks.vue ? 'Vue.js' : 
             frameworks.svelte ? 'Svelte' : 'Unknown')
          : undefined,
        impact: csrDetected
          ? 'Client-side rendering may affect SEO and initial load performance'
          : 'Server-side or static rendering detected',
        status: csrDetected ? 'warning' : 'good'
      },
      jsExecutionTime: {
        estimatedMs: estimatedExecutionTime,
        status: estimatedExecutionTime < 100 ? 'good' : 
                estimatedExecutionTime < 300 ? 'warning' : 'critical',
        impact: estimatedExecutionTime < 100
          ? 'Reasonable JavaScript execution time'
          : estimatedExecutionTime < 300
          ? 'Moderate JavaScript execution time, consider optimization'
          : 'High JavaScript execution time, may impact user experience'
      }
    };

    const renderingBehavior: RenderingBehavior = {
      serverSideRendering: {
        detected: ssrDetected,
        framework: ssrDetected
          ? (frameworks.nextjs ? 'Next.js' : 
             frameworks.nuxt ? 'Nuxt.js' : 'Unknown')
          : undefined,
        impact: ssrDetected
          ? 'Server-side rendering improves SEO and initial load'
          : 'No server-side rendering detected',
        status: ssrDetected ? 'good' : 'warning'
      },
      hydrationDelay: {
        estimatedMs: csrDetected ? Math.round(estimatedExecutionTime * 1.5) : 0,
        status: csrDetected && estimatedExecutionTime > 200 ? 'critical' : 
                csrDetected && estimatedExecutionTime > 100 ? 'warning' : 'good',
        impact: csrDetected
          ? estimatedExecutionTime > 200
            ? 'High hydration delay may cause layout shifts'
            : estimatedExecutionTime > 100
            ? 'Moderate hydration delay'
            : 'Low hydration delay'
          : 'Not applicable (no client-side hydration)'
      },
      domContentLoaded: {
        estimatedTimeMs: domContentLoadedTime,
        status: domContentLoadedTime < 1000 ? 'good' : 
                domContentLoadedTime < 3000 ? 'warning' : 'critical',
        impact: domContentLoadedTime < 1000
          ? 'Good DOM Content Loaded time'
          : domContentLoadedTime < 3000
          ? 'Moderate DOM Content Loaded time'
          : 'Slow DOM Content Loaded time, user may experience delays'
      },
      javascriptRequiredForContent: {
        required: contentJsDependency > 50,
        percentage: contentJsDependency,
        status: contentJsDependency > 70 ? 'critical' : 
                contentJsDependency > 40 ? 'warning' : 'good',
        impact: contentJsDependency > 70
          ? 'Content heavily dependent on JavaScript'
          : contentJsDependency > 40
          ? 'Moderate JavaScript dependency for content'
          : 'Content accessible without heavy JavaScript dependency'
      }
    };

    const jsDependencyAnalysis: JsDependencyAnalysis = {
      totalJsSize: {
        valueKB: Math.round(jsAnalysis.totalSizeKB * 10) / 10,
        status: jsAnalysis.totalSizeKB < 200 ? 'good' : 
                jsAnalysis.totalSizeKB < 500 ? 'warning' : 'critical',
        impact: jsAnalysis.totalSizeKB < 200
          ? 'Reasonable total JavaScript size'
          : jsAnalysis.totalSizeKB < 500
          ? 'Large JavaScript bundle, consider code splitting'
          : 'Very large JavaScript bundle, significant performance impact'
      },
      unusedJs: {
        estimatedPercentage: Math.min(40 + (jsAnalysis.totalSizeKB / 1000) * 10, 80),
        status: jsAnalysis.totalSizeKB < 300 ? 'good' : 
                jsAnalysis.totalSizeKB < 600 ? 'warning' : 'critical',
        impact: jsAnalysis.totalSizeKB < 300
          ? 'Low unused JavaScript likely'
          : jsAnalysis.totalSizeKB < 600
          ? 'Moderate unused JavaScript likely, consider tree shaking'
          : 'High unused JavaScript likely, significant optimization needed'
      },
      thirdPartyScripts: {
        count: jsAnalysis.thirdPartyScripts.length,
        totalSizeKB: jsAnalysis.thirdPartyScripts.reduce((sum, s) => sum + s.sizeKB, 0),
        scripts: jsAnalysis.thirdPartyScripts,
        status: jsAnalysis.thirdPartyScripts.length === 0 ? 'good' : 
                jsAnalysis.thirdPartyScripts.length <= 3 ? 'warning' : 'critical',
        impact: jsAnalysis.thirdPartyScripts.length === 0
          ? 'No third-party scripts detected'
          : `${jsAnalysis.thirdPartyScripts.length} third-party scripts may impact performance and privacy`
      },
      criticalJsFiles: {
        count: jsAnalysis.criticalJsFiles.length,
        totalSizeKB: jsAnalysis.criticalJsFiles.reduce((sum, f) => sum + f.sizeKB, 0),
        files: jsAnalysis.criticalJsFiles,
        status: jsAnalysis.criticalJsFiles.length <= 2 ? 'good' : 
                jsAnalysis.criticalJsFiles.length <= 5 ? 'warning' : 'critical',
        impact: jsAnalysis.criticalJsFiles.length <= 2
          ? 'Reasonable number of critical JavaScript files'
          : jsAnalysis.criticalJsFiles.length <= 5
          ? 'Multiple critical JavaScript files, consider consolidation'
          : 'Many critical JavaScript files, significant optimization needed'
      }
    };

    const seoVisibilityImpact: SeoVisibilityImpact = {
      contentVisibleWithoutJs: {
        visible: visibleContentLength > 100,
        percentage: Math.min((visibleContentLength / 5000) * 100, 100),
        status: visibleContentLength > 1000 ? 'good' : 
                visibleContentLength > 500 ? 'warning' : 'critical',
        impact: visibleContentLength > 1000
          ? 'Good content visibility without JavaScript'
          : visibleContentLength > 500
          ? 'Limited content visible without JavaScript'
          : 'Minimal content visible without JavaScript, SEO may be impacted'
      },
      lazyLoadedContent: {
        detected: lazyLoadDetected,
        percentage: lazyLoadDetected ? 30 : 0,
        status: lazyLoadDetected ? 'warning' : 'good',
        impact: lazyLoadDetected
          ? 'Lazy loading detected, may delay content visibility for crawlers'
          : 'No lazy loading detected'
      },
      googleBotRenderable: {
        renderable: !csrDetected || ssrDetected,
        confidence: csrDetected && !ssrDetected ? 'low' : 
                   ssrDetected ? 'high' : 'medium',
        status: (!csrDetected || ssrDetected) ? 'good' : 'critical',
        impact: ssrDetected
          ? 'High confidence Googlebot can render content'
          : csrDetected
          ? 'Low confidence Googlebot can render all content'
          : 'Medium confidence Googlebot can render content'
      }
    };

    /* ===============================
       FINAL RESPONSE
    =============================== */

    return {
      success: true,
      analysisId,
      analyzedAt,
      data: {
        frontend: {
          frameworks,
          rendering,
          buildTools
        },
        backend: {
          technologies: Array.from(backendTech),
          cms,
          language
        },
        infrastructure: {
          cdn,
          hosting,
          server
        },
        analytics,
        confidence,
        jsDependencyMetrics,
        renderingBehavior,
        jsDependencyAnalysis,
        seoVisibilityImpact
      }
    };
  } catch (err: any) {
    return {
      success: false,
      analysisId,
      analyzedAt,
      error: err?.message || 'Unknown error'
    };
  }
}

/* ============================================================
   ADDITIONAL FUNCTIONS
============================================================ */

export async function compareJSRendering(url: string, jsContent: string): Promise<{
  jsEnabled: { contentLength: number; imageCount: number; linkCount: number; structuredDataCount: number };
  jsDisabled: { contentLength: number; imageCount: number; linkCount: number; structuredDataCount: number };
  differences: { contentDifference: number; imageDifference: number; linkDifference: number; seoRisk: 'low' | 'medium' | 'high' };
  score: number;
}> {
  try {
    // Simulate non-JS content by fetching with basic user agent
    const response = await httpClient.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
      },
      timeout: 10000
    });
    const noJsContent = response.data;
    
    const $js = cheerio.load(jsContent);
    const $noJs = cheerio.load(noJsContent);
    
    const jsEnabled = {
      contentLength: $js('body').text().length,
      imageCount: $js('img').length,
      linkCount: $js('a[href]').length,
      structuredDataCount: $js('script[type="application/ld+json"]').length
    };
    
    const jsDisabled = {
      contentLength: $noJs('body').text().length,
      imageCount: $noJs('img').length,
      linkCount: $noJs('a[href]').length,
      structuredDataCount: $noJs('script[type="application/ld+json"]').length
    };
    
    const contentDifference = Math.abs(jsEnabled.contentLength - jsDisabled.contentLength);
    const imageDifference = Math.abs(jsEnabled.imageCount - jsDisabled.imageCount);
    const linkDifference = Math.abs(jsEnabled.linkCount - jsDisabled.linkCount);
    
    let seoRisk: 'low' | 'medium' | 'high' = 'low';
    if (contentDifference > 1000 || linkDifference > 10) {
      seoRisk = 'high';
    } else if (contentDifference > 500 || linkDifference > 5) {
      seoRisk = 'medium';
    }
    
    const score = seoRisk === 'low' ? 90 : seoRisk === 'medium' ? 70 : 40;
    
    return {
      jsEnabled,
      jsDisabled,
      differences: {
        contentDifference,
        imageDifference,
        linkDifference,
        seoRisk
      },
      score
    };
  } catch (error) {
    return {
      jsEnabled: { contentLength: 0, imageCount: 0, linkCount: 0, structuredDataCount: 0 },
      jsDisabled: { contentLength: 0, imageCount: 0, linkCount: 0, structuredDataCount: 0 },
      differences: { contentDifference: 0, imageDifference: 0, linkDifference: 0, seoRisk: 'low' },
      score: 100
    };
  }
}

export async function detectWebsiteTechStackWithAI(
  $: cheerio.CheerioAPI,
  htmlContent: string | Buffer,
  headers: Record<string, string | string[] | undefined> = {},
  url: string
): Promise<JsFrameworkAnalysisResponse & { aiRecommendations?: any }> {
  const result = detectWebsiteTechStack($, htmlContent, headers, url);
  
  if (result.success && result.data) {
    const analysisData = {
      url,
      ...result.data
    };
    
    try {
      // Generate AI-powered insights using Gemini
      const geminiIssues = await generateUniversalSeoIssues(analysisData, 'tech-frameworks');
      return {
        ...result,
        issues: geminiIssues
      };
    } catch (error) {
      console.error('Failed to generate AI insights:', error);
      return {
        ...result,
        issues: []
      };
    }
  }
  
  return result;
}

/**
 * Tech-JS analysis saver with framework detection
 */
class TechJsSaver extends AnalysisSaver {
  /**
   * Extract detected frameworks from analysis data
   */
  private extractFrameworks(frameworks: any): string[] {
    const detected: string[] = [];
    const frameworkMap = [
      { key: 'react', name: 'React' },
      { key: 'angular', name: 'Angular' },
      { key: 'vue', name: 'Vue' },
      { key: 'jquery', name: 'jQuery' },
      { key: 'nextjs', name: 'Next.js' },
      { key: 'nuxt', name: 'Nuxt' },
      { key: 'svelte', name: 'Svelte' },
    ];
    
    for (const { key, name } of frameworkMap) {
      if (frameworks[key]) detected.push(name);
    }
    
    return detected;
  }

  async save(url: string, analysisResult: any): Promise<void> {
    await this.saveWithErrorHandling('Tech-JS', url, async () => {
      const data = analysisResult.data;
      if (!data) {
        console.warn('⚠️ No data to save for Tech-JS analysis');
        return;
      }

      // Extract framework information efficiently
      const frameworks = data.frontend?.frameworks || {};
      const frameworksDetected = this.extractFrameworks(frameworks);
      const primaryFramework = frameworksDetected[0] || null;
      
      // Extract metrics for cleaner code
      const jsMetrics = data.jsDependencyMetrics || {};
      const jsAnalysis = data.jsDependencyAnalysis || {};
      const rendering = data.renderingBehavior || {};
      const seoImpact = data.seoVisibilityImpact || {};

      await TechJsAnalysis.create({
        url,
        
        // Framework detection
        ...(primaryFramework && { primaryFramework }),
        frameworksDetected: this.safeStringify(frameworksDetected),
        totalFrameworks: frameworksDetected.length,
        
        // JS Metrics
        totalJsSizeKB: jsAnalysis.totalJsSize?.valueKB || 0,
        renderBlockingScriptsCount: jsMetrics.renderBlockingScripts?.count || 0,
        renderBlockingSizeKB: jsMetrics.renderBlockingScripts?.totalSizeKB || 0,
        thirdPartyScriptsCount: jsAnalysis.thirdPartyScripts?.count || 0,
        thirdPartySizeKB: jsAnalysis.thirdPartyScripts?.totalSizeKB || 0,
        unusedJsPercentage: jsAnalysis.unusedJs?.estimatedPercentage || 0,
        estimatedJsExecutionMs: jsMetrics.jsExecutionTime?.estimatedMs || 0,
        
        // Rendering behavior
        isClientSideRendering: jsMetrics.clientSideRendering?.detected || false,
        isServerSideRendering: rendering.serverSideRendering?.detected || false,
        hasHydration: data.frontend?.rendering === 'ssr-hybrid',
        estimatedHydrationMs: rendering.hydrationDelay?.estimatedMs || null,
        jsRequiredForContent: rendering.javascriptRequiredForContent?.required || false,
        contentVisiblePercentage: rendering.javascriptRequiredForContent?.percentage || 100,
        
        // Libraries - specific framework flags
        librariesDetected: this.safeStringify(frameworksDetected),
        totalLibraries: frameworksDetected.length,
        hasJQuery: frameworks.jquery || false,
        hasReact: frameworks.react || false,
        hasVue: frameworks.vue || false,
        hasAngular: frameworks.angular || false,
        hasNextJs: frameworks.nextjs || false,
        
        // SEO Impact
        seoImpactScore: seoImpact.contentVisibleWithoutJs?.percentage || 0,
        crawlabilityStatus: seoImpact.contentVisibleWithoutJs?.status || 'unknown',
        indexabilityStatus: seoImpact.googleBotRenderable?.status || 'unknown',
        performanceImpact: jsMetrics.renderBlockingScripts?.status || 'unknown',
        
        // Dependency Score
        dependencyScore: jsMetrics.dependencyScore?.value || 0,
        dependencyStatus: jsMetrics.dependencyScore?.status || 'low',
        
        // Store complete data as JSON - safely
        fullReport: this.safeStringify(analysisResult),
        aiIssues: this.safeStringify(analysisResult.issues),
      });
    });
  }
}

const techJsSaver = new TechJsSaver();

/**
 * Save Tech-JS analysis results to database for historical tracking
 */
export async function saveTechJsAnalysis(url: string, analysisResult: any): Promise<void> {
  await techJsSaver.save(url, analysisResult);
}