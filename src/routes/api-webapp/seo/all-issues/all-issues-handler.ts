import { httpClient } from '../utils/http-client';
import * as cheerio from 'cheerio';
// Note: analyzeInternalSeoPure removed - internal SEO analyzer not implemented yet

interface Issue {
  name: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  status: 'FAIL' | 'WARNING' | 'INFO' | 'PASS';
  affectedUrls: string[];
  category: string;
  priority: string;
  recommendation?: string;
  details?: any;
}

interface AggregatedIssuesResult {
  success: boolean;
  url: string;
  timestamp: string;
  summary: {
    totalIssues: number;
    criticalIssues: number;
    highIssues: number;
    mediumIssues: number;
    lowIssues: number;
    warnings: number;
    suggestions: number;
  };
  issuesByCategory: {
    security: Issue[];
    performance: Issue[];
    seo: Issue[];
    accessibility: Issue[];
    javascript: Issue[];
    internalseo: Issue[];
  };
  allIssues: Issue[];
}

export async function aggregateAllIssuesHandler(url: string): Promise<AggregatedIssuesResult> {
  const timestamp = new Date().toISOString();
  const allIssues: Issue[] = [];
  const issuesByCategory: any = {
    security: [],
    performance: [],
    seo: [],
    accessibility: [],
    javascript: [],
    internalseo: []
  };

  try {
    // Fetch the page once for multiple analyzers
    const response = await httpClient.get(url);
    const html = response.data;
    const $ = cheerio.load(html);

    // 1. Internal SEO Issues
    try {
      // TODO: Re-enable when analyzeInternalSeoPure is implemented
      /*
      const context = {
        url,
        html,
        $,
        headers: response.headers as any,
        crawledPages: [{ url, html, statusCode: response.status }]
      };

      const internalSeoResult = await analyzeInternalSeoPure(context);
      
      if (internalSeoResult.issues && internalSeoResult.issues.length > 0) {
        internalSeoResult.issues.forEach((issue: any) => {
          const mappedIssue: Issue = {
            name: issue.name,
            title: issue.title,
            description: issue.description,
            severity: issue.severity,
            status: issue.status,
            affectedUrls: [url],
            category: 'Internal SEO',
            priority: issue.severity === 'critical' ? 'High' : issue.severity === 'high' ? 'High' : issue.severity === 'medium' ? 'Moderate' : 'Low',
            recommendation: issue.recommendation,
            details: issue.details
          };
          issuesByCategory.internalseo.push(mappedIssue);
          allIssues.push(mappedIssue);
        });
      }
      */
    } catch (error) {
      console.error('Internal SEO analysis error:', error);
    }

    // 2. Security Issues
    try {
      const securityIssues = analyzeSecurityIssues(url, response.headers as any, html);
      issuesByCategory.security.push(...securityIssues);
      allIssues.push(...securityIssues);
    } catch (error) {
      console.error('Security analysis error:', error);
    }

    // 3. Performance Issues
    try {
      const performanceIssues = analyzePerformanceIssues($, html);
      issuesByCategory.performance.push(...performanceIssues);
      allIssues.push(...performanceIssues);
    } catch (error) {
      console.error('Performance analysis error:', error);
    }

    // 4. JavaScript Issues
    try {
      const jsIssues = analyzeJavaScriptIssues($, html);
      issuesByCategory.javascript.push(...jsIssues);
      allIssues.push(...jsIssues);
    } catch (error) {
      console.error('JavaScript analysis error:', error);
    }

    // 5. Accessibility Issues
    try {
      const accessibilityIssues = analyzeAccessibilityIssues($);
      issuesByCategory.accessibility.push(...accessibilityIssues);
      allIssues.push(...accessibilityIssues);
    } catch (error) {
      console.error('Accessibility analysis error:', error);
    }

    // Calculate summary
    const summary = {
      totalIssues: allIssues.length,
      criticalIssues: allIssues.filter(i => i.severity === 'critical').length,
      highIssues: allIssues.filter(i => i.severity === 'high').length,
      mediumIssues: allIssues.filter(i => i.severity === 'medium').length,
      lowIssues: allIssues.filter(i => i.severity === 'low').length,
      warnings: allIssues.filter(i => i.status === 'WARNING').length,
      suggestions: allIssues.filter(i => i.status === 'INFO').length
    };

    return {
      success: true,
      url,
      timestamp,
      summary,
      issuesByCategory,
      allIssues: allIssues.sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      })
    };

  } catch (error: any) {
    console.error('Issue aggregation error:', error);
    return {
      success: false,
      url,
      timestamp,
      summary: {
        totalIssues: 0,
        criticalIssues: 0,
        highIssues: 0,
        mediumIssues: 0,
        lowIssues: 0,
        warnings: 0,
        suggestions: 0
      },
      issuesByCategory: {
        security: [],
        performance: [],
        seo: [],
        accessibility: [],
        javascript: [],
        internalseo: []
      },
      allIssues: []
    } as any;
  }
}

// Helper: Analyze Security Issues
function analyzeSecurityIssues(url: string, headers: any, html: string): Issue[] {
  const issues: Issue[] = [];
  
  // Check for HTTPS
  if (!url.startsWith('https://')) {
    issues.push({
      name: 'missing_https',
      title: 'Security: Missing HTTPS',
      description: 'Website is not using HTTPS protocol',
      severity: 'critical',
      status: 'FAIL',
      affectedUrls: [url],
      category: 'Security',
      priority: 'High',
      recommendation: 'Enable HTTPS with a valid SSL certificate'
    });
  }

  // Check security headers
  const securityHeaders = [
    { key: 'strict-transport-security', name: 'HSTS' },
    { key: 'x-frame-options', name: 'X-Frame-Options' },
    { key: 'x-content-type-options', name: 'X-Content-Type-Options' },
    { key: 'content-security-policy', name: 'CSP' }
  ];

  securityHeaders.forEach(header => {
    if (!headers[header.key]) {
      issues.push({
        name: `missing_${header.key.replace(/-/g, '_')}`,
        title: `Security: Missing ${header.name} Header`,
        description: `${header.name} security header is not configured`,
        severity: header.key === 'content-security-policy' ? 'medium' : 'high',
        status: 'WARNING',
        affectedUrls: [url],
        category: 'Security',
        priority: 'Moderate',
        recommendation: `Add ${header.name} header to improve security`
      });
    }
  });

  return issues;
}

// Helper: Analyze Performance Issues
function analyzePerformanceIssues($: cheerio.CheerioAPI, html: string): Issue[] {
  const issues: Issue[] = [];
  
  // Check for render-blocking resources
  const blockingScripts = $('script:not([async]):not([defer])').filter((_, el) => {
    const src = $(el).attr('src');
    return !!(src && !src.includes('data:'));
  });

  if (blockingScripts.length > 3) {
    issues.push({
      name: 'render_blocking_scripts',
      title: 'Performance: Render-Blocking Scripts',
      description: `${blockingScripts.length} render-blocking scripts found`,
      severity: 'medium',
      status: 'WARNING',
      affectedUrls: [],
      category: 'Performance',
      priority: 'Moderate',
      recommendation: 'Add async or defer attributes to non-critical scripts',
      details: { count: blockingScripts.length }
    });
  }

  // Check for large images without optimization
  const images = $('img');
  let unoptimizedImages = 0;
  images.each((_, el) => {
    const src = $(el).attr('src');
    if (src && !src.includes('.webp') && !src.includes('.avif')) {
      unoptimizedImages++;
    }
  });

  if (unoptimizedImages > 5) {
    issues.push({
      name: 'unoptimized_images',
      title: 'Performance: Unoptimized Images',
      description: `${unoptimizedImages} images not using modern formats (WebP/AVIF)`,
      severity: 'medium',
      status: 'WARNING',
      affectedUrls: [],
      category: 'Performance',
      priority: 'Moderate',
      recommendation: 'Convert images to WebP or AVIF format',
      details: { count: unoptimizedImages }
    });
  }

  return issues;
}

// Helper: Analyze JavaScript Issues
function analyzeJavaScriptIssues($: cheerio.CheerioAPI, html: string): Issue[] {
  const issues: Issue[] = [];
  
  const scripts = $('script[src]');
  let largeScripts = 0;
  
  scripts.each((_, el) => {
    const src = $(el).attr('src');
    if (src && (src.includes('jquery') || src.includes('bootstrap'))) {
      largeScripts++;
    }
  });

  if (largeScripts > 0) {
    issues.push({
      name: 'large_js_libraries',
      title: 'JavaScript: Large Third-Party Libraries',
      description: 'Large JavaScript libraries detected that may impact performance',
      severity: 'medium',
      status: 'WARNING',
      affectedUrls: [],
      category: 'JavaScript',
      priority: 'Moderate',
      recommendation: 'Consider using lighter alternatives or tree-shaking',
      details: { count: largeScripts }
    });
  }

  // Check for inline scripts
  const inlineScripts = $('script:not([src])').filter((_, el) => {
    const content = $(el).html();
    return !!(content && content.length > 1000);
  });

  if (inlineScripts.length > 0) {
    issues.push({
      name: 'large_inline_scripts',
      title: 'JavaScript: Large Inline Scripts',
      description: `${inlineScripts.length} large inline scripts found`,
      severity: 'low',
      status: 'WARNING',
      affectedUrls: [],
      category: 'JavaScript',
      priority: 'Low',
      recommendation: 'Move inline scripts to external files for better caching'
    });
  }

  return issues;
}

// Helper: Analyze Accessibility Issues
function analyzeAccessibilityIssues($: cheerio.CheerioAPI): Issue[] {
  const issues: Issue[] = [];
  
  // Check images without alt text
  const imagesWithoutAlt = $('img:not([alt])');
  if (imagesWithoutAlt.length > 0) {
    issues.push({
      name: 'images_missing_alt',
      title: 'Accessibility: Images Missing Alt Text',
      description: `${imagesWithoutAlt.length} images without alt attributes`,
      severity: 'medium',
      status: 'FAIL',
      affectedUrls: [],
      category: 'Accessibility',
      priority: 'Moderate',
      recommendation: 'Add descriptive alt text to all images',
      details: { count: imagesWithoutAlt.length }
    });
  }

  // Check for missing form labels
  const inputsWithoutLabels = $('input:not([type="hidden"])').filter((_, el) => {
    const id = $(el).attr('id');
    const name = $(el).attr('name');
    const hasLabel = id ? $(`label[for="${id}"]`).length > 0 : false;
    const hasAriaLabel = $(el).attr('aria-label');
    return !hasLabel && !hasAriaLabel;
  });

  if (inputsWithoutLabels.length > 0) {
    issues.push({
      name: 'inputs_missing_labels',
      title: 'Accessibility: Form Inputs Missing Labels',
      description: `${inputsWithoutLabels.length} form inputs without labels`,
      severity: 'high',
      status: 'FAIL',
      affectedUrls: [],
      category: 'Accessibility',
      priority: 'High',
      recommendation: 'Add proper label elements or aria-label attributes to form inputs'
    });
  }

  // Check for missing lang attribute
  const htmlLang = $('html').attr('lang');
  if (!htmlLang) {
    issues.push({
      name: 'missing_lang_attribute',
      title: 'Accessibility: Missing Language Attribute',
      description: 'HTML lang attribute is not set',
      severity: 'medium',
      status: 'FAIL',
      affectedUrls: [],
      category: 'Accessibility',
      priority: 'Moderate',
      recommendation: 'Add lang attribute to the HTML tag (e.g., lang="en")'
    });
  }

  return issues;
}
