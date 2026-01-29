import puppeteer, { Browser, Page, SecurityDetails } from 'puppeteer';
import * as dns from 'dns/promises';
import * as net from 'net';
import * as tls from 'tls';
import * as https from 'https';
import { generateUniversalSeoIssues } from '../../../../services/universal-seo-issues';

interface SecurityHeaders {
  [key: string]: string | null;
}

interface SecurityCheck {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARNING' | 'INFO';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  details: any;
  recommendation?: string;
}

interface SecurityReport {
  summary: {
    totalChecks: number;
    passed: number;
    failed: number;
    warnings: number;
    score: number;
    grade: string;
  };
  networkSecurity: SecurityCheck[];
  applicationSecurity: SecurityCheck[];
  serverSecurity: SecurityCheck[];
  vulnerabilityScan: SecurityCheck[];
  advancedAnalysis: SecurityCheck[];
  certificates: SecurityCheck[];
  headers: SecurityCheck[];
}

interface AnalyzerContext {
  browser: Browser | null;
  page: Page | null;
  url: URL;
  headers: SecurityHeaders;
  securityDetails: SecurityDetails | null;
}

function createAnalyzerContext(url: string): AnalyzerContext {
  return {
    browser: null,
    page: null,
    url: new URL(url),
    headers: {},
    securityDetails: null
  };
}

async function initializeBrowser(ctx: AnalyzerContext): Promise<void> {
  ctx.browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ]
  });
  ctx.page = await ctx.browser.newPage();

  // Intercept and collect headers
  ctx.page.on('response', async (response) => {
    if (response.url() === ctx.url.href) {
      const headers = response.headers();
      Object.keys(headers).forEach(key => {
        ctx.headers[key.toLowerCase()] = headers[key];
      });
    }
  });
}

async function analyzeWebsiteSecurity(url: string): Promise<SecurityReport> {
  const ctx = createAnalyzerContext(url);
  await initializeBrowser(ctx);

  const checks: SecurityCheck[] = [];

  // Navigate to the URL
  await ctx.page!.goto(ctx.url.href, {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  // Run all security checks
  checks.push(...await checkNetworkSecurity(ctx));
  checks.push(...await checkApplicationSecurity(ctx));
  checks.push(...await checkServerSecurity(ctx));
  checks.push(...await checkVulnerabilities(ctx));
  checks.push(...await performAdvancedAnalysis(ctx));
  checks.push(...await checkCertificates(ctx));
  checks.push(...await checkSecurityHeaders(ctx));

  // Calculate summary
  const totalChecks = checks.length;
  const passed = checks.filter(c => c.status === 'PASS').length;
  const failed = checks.filter(c => c.status === 'FAIL').length;
  const warnings = checks.filter(c => c.status === 'WARNING').length;
  const score = Math.round((passed / totalChecks) * 100);
  
  let grade: string;
  if (score >= 90) grade = 'A+';
  else if (score >= 80) grade = 'A';
  else if (score >= 70) grade = 'B';
  else if (score >= 60) grade = 'C';
  else if (score >= 50) grade = 'D';
  else grade = 'F';

  await closeBrowser(ctx);

  return {
    summary: {
      totalChecks,
      passed,
      failed,
      warnings,
      score,
      grade
    },
    networkSecurity: checks.filter(c => c.name.startsWith('network_')),
    applicationSecurity: checks.filter(c => c.name.startsWith('app_')),
    serverSecurity: checks.filter(c => c.name.startsWith('server_')),
    vulnerabilityScan: checks.filter(c => c.name.startsWith('vuln_')),
    advancedAnalysis: checks.filter(c => c.name.startsWith('adv_')),
    certificates: checks.filter(c => c.name.startsWith('cert_')),
    headers: checks.filter(c => c.name.startsWith('header_'))
  };
}

async function checkNetworkSecurity(ctx: AnalyzerContext): Promise<SecurityCheck[]> {
  const checks: SecurityCheck[] = [];

  // Check 1: HTTPS enforcement
  checks.push({
    name: 'network_https_enforcement',
    status: ctx.url.protocol === 'https:' ? 'PASS' : 'FAIL',
    severity: 'CRITICAL',
    description: 'Website uses HTTPS',
    details: {
      protocol: ctx.url.protocol,
      url: ctx.url.href
    },
    recommendation: ctx.url.protocol !== 'https:' ? 'Always use HTTPS to encrypt data in transit' : undefined
  });

  // Check 2: HSTS
  const hstsHeader = ctx.headers['strict-transport-security'];
  const hasHSTS = !!hstsHeader;
  const maxAge = hasHSTS ? parseInt(hstsHeader!.match(/max-age=(\d+)/)?.[1] || '0') : 0;
  const includesSubdomains = hasHSTS ? hstsHeader!.includes('includeSubDomains') : false;
  const preload = hasHSTS ? hstsHeader!.includes('preload') : false;

  checks.push({
    name: 'network_hsts',
    status: hasHSTS && maxAge >= 31536000 ? 'PASS' : hasHSTS ? 'WARNING' : 'FAIL',
    severity: 'HIGH',
    description: 'HTTP Strict Transport Security (HSTS) configured',
    details: {
      header: hstsHeader,
      maxAgeDays: Math.floor(maxAge / 86400),
      includesSubdomains,
      preload
    },
    recommendation: !hasHSTS ? 'Add HSTS header with max-age=31536000 and includeSubDomains' :
      maxAge < 31536000 ? 'Increase HSTS max-age to at least 1 year (31536000 seconds)' : undefined
  });

  // Check 3: Mixed Content
  const mixedContent = await checkMixedContent(ctx);
  checks.push({
    name: 'network_mixed_content',
    status: mixedContent.length === 0 ? 'PASS' : 'FAIL',
    severity: 'HIGH',
    description: 'No mixed content (HTTP resources loaded over HTTPS)',
    details: {
      mixedContentCount: mixedContent.length,
      resources: mixedContent.slice(0, 5)
    },
    recommendation: mixedContent.length > 0 ? 'Load all resources over HTTPS' : undefined
  });

  // Check 4: TLS Version
  if (ctx.url.protocol === 'https:') {
    const tlsInfo = await checkTLS(ctx.url.hostname, parseInt(ctx.url.port) || 443);
    checks.push({
      name: 'network_tls_configuration',
      status: tlsInfo.secure ? 'PASS' : 'FAIL',
      severity: 'HIGH',
      description: 'TLS configuration security',
      details: tlsInfo,
      recommendation: !tlsInfo.secure ? 'Disable weak protocols (SSLv3, TLSv1.0, TLSv1.1)' : undefined
    });
  }

  return checks;
}

async function checkApplicationSecurity(ctx: AnalyzerContext): Promise<SecurityCheck[]> {
  const checks: SecurityCheck[] = [];

  // Check 1: CSP
  const cspHeader = ctx.headers['content-security-policy'];
  const hasCSP = !!cspHeader;
  
  checks.push({
    name: 'app_csp',
    status: hasCSP ? 'PASS' : 'FAIL',
    severity: 'HIGH',
    description: 'Content Security Policy (CSP) configured',
    details: {
      header: cspHeader,
      directives: cspHeader ? cspHeader.split(';').map(d => d.trim()) : []
    },
    recommendation: !hasCSP ? 'Implement a strict Content Security Policy' : undefined
  });

  // Check 2: X-Frame-Options
  const xfoHeader = ctx.headers['x-frame-options'];
  const hasXFO = !!xfoHeader;
  const validXFO = hasXFO && ['DENY', 'SAMEORIGIN'].includes(xfoHeader!.toUpperCase());

  checks.push({
    name: 'app_x_frame_options',
    status: validXFO ? 'PASS' : 'FAIL',
    severity: 'MEDIUM',
    description: 'Clickjacking protection with X-Frame-Options',
    details: {
      header: xfoHeader,
      value: xfoHeader
    },
    recommendation: !hasXFO ? 'Add X-Frame-Options: DENY or SAMEORIGIN header' : 
      !validXFO ? 'Set X-Frame-Options to DENY or SAMEORIGIN' : undefined
  });

  // Check 3: X-Content-Type-Options
  const xctoHeader = ctx.headers['x-content-type-options'];
  const hasXCTO = !!xctoHeader && xctoHeader.toUpperCase() === 'NOSNIFF';

  checks.push({
    name: 'app_content_type_options',
    status: hasXCTO ? 'PASS' : 'FAIL',
    severity: 'MEDIUM',
    description: 'MIME sniffing protection',
    details: {
      header: xctoHeader
    },
    recommendation: !hasXCTO ? 'Add X-Content-Type-Options: nosniff header' : undefined
  });

  // Check 4: Referrer-Policy
  const referrerHeader = ctx.headers['referrer-policy'];
  const hasReferrerPolicy = !!referrerHeader;

  checks.push({
    name: 'app_referrer_policy',
    status: hasReferrerPolicy ? 'PASS' : 'WARNING',
    severity: 'LOW',
    description: 'Referrer policy for privacy protection',
    details: {
      header: referrerHeader
    },
    recommendation: !hasReferrerPolicy ? 'Add Referrer-Policy header' : undefined
  });

  // Check 5: Subresource Integrity
  const sriStatus = await checkSubresourceIntegrity(ctx);
  checks.push({
    name: 'app_subresource_integrity',
    status: sriStatus.allResourcesHaveSRI ? 'PASS' : 'WARNING',
    severity: 'MEDIUM',
    description: 'Subresource Integrity for external resources',
    details: sriStatus,
    recommendation: !sriStatus.allResourcesHaveSRI ? 'Add integrity attributes to external scripts/styles' : undefined
  });

  return checks;
}

async function checkServerSecurity(ctx: AnalyzerContext): Promise<SecurityCheck[]> {
  const checks: SecurityCheck[] = [];

  // Check 1: Server Information Disclosure
  const serverHeader = ctx.headers['server'];
  const poweredByHeader = ctx.headers['x-powered-by'];
  
  checks.push({
    name: 'server_information_disclosure',
    status: !serverHeader && !poweredByHeader ? 'PASS' : 'WARNING',
    severity: 'LOW',
    description: 'Server information hidden',
    details: {
      server: serverHeader,
      poweredBy: poweredByHeader
    },
    recommendation: serverHeader || poweredByHeader ? 'Remove or obscure server information headers' : undefined
  });

  return checks;
}

async function checkVulnerabilities(ctx: AnalyzerContext): Promise<SecurityCheck[]> {
  const checks: SecurityCheck[] = [];

  // Check 1: Known Vulnerabilities in Libraries
  const vulnerabilities = await scanForKnownVulnerabilities(ctx);
  checks.push({
    name: 'vuln_known_vulnerabilities',
    status: vulnerabilities.count === 0 ? 'PASS' : 'WARNING',
    severity: vulnerabilities.count > 0 ? 'MEDIUM' : 'LOW',
    description: 'Known vulnerabilities in frontend libraries',
    details: vulnerabilities,
    recommendation: vulnerabilities.count > 0 ? 'Update vulnerable libraries to latest versions' : undefined
  });

  // Check 2: XSS Potential
  const xssPotential = await checkXSSPotential(ctx);
  checks.push({
    name: 'vuln_xss',
    status: xssPotential.risk === 'LOW' ? 'PASS' : 'WARNING',
    severity: 'MEDIUM',
    description: 'Cross-Site Scripting (XSS) vulnerability assessment',
    details: xssPotential,
    recommendation: xssPotential.risk !== 'LOW' ? 'Implement proper output encoding and CSP' : undefined
  });

  return checks;
}

async function performAdvancedAnalysis(ctx: AnalyzerContext): Promise<SecurityCheck[]> {
  const checks: SecurityCheck[] = [];

  // Check 1: Cookie Security
  const cookieSecurity = await checkCookieSecurity(ctx);
  checks.push({
    name: 'adv_cookie_security',
    status: cookieSecurity.secure ? 'PASS' : 'WARNING',
    severity: 'MEDIUM',
    description: 'Cookie security attributes',
    details: cookieSecurity,
    recommendation: !cookieSecurity.secure ? 'Set Secure, HttpOnly, and SameSite attributes on cookies' : undefined
  });

  // Check 2: CORS Configuration
  const corsConfig = await checkCORSConfiguration(ctx);
  checks.push({
    name: 'adv_cors_configuration',
    status: corsConfig.secure ? 'PASS' : 'WARNING',
    severity: 'LOW',
    description: 'Cross-Origin Resource Sharing (CORS) configuration',
    details: corsConfig,
    recommendation: !corsConfig.secure ? 'Implement strict CORS policy' : undefined
  });

  return checks;
}

async function checkCertificates(ctx: AnalyzerContext): Promise<SecurityCheck[]> {
  const checks: SecurityCheck[] = [];
  
  if (ctx.url.protocol !== 'https:') {
    return checks;
  }

  const certInfo = await getCertificateInfo(ctx.url.hostname, parseInt(ctx.url.port) || 443);
  
  // Check 1: Certificate Validity
  checks.push({
    name: 'cert_validity',
    status: certInfo.valid ? 'PASS' : 'FAIL',
    severity: 'CRITICAL',
    description: 'SSL/TLS certificate validity',
    details: certInfo,
    recommendation: !certInfo.valid ? 'Renew SSL certificate' : undefined
  });

  // Check 2: Certificate Expiry
  const daysUntilExpiry = certInfo.daysUntilExpiry;
  checks.push({
    name: 'cert_expiry',
    status: daysUntilExpiry > 30 ? 'PASS' : daysUntilExpiry > 7 ? 'WARNING' : 'FAIL',
    severity: 'HIGH',
    description: 'SSL/TLS certificate expiry',
    details: { daysUntilExpiry, expires: certInfo.validTo },
    recommendation: daysUntilExpiry <= 30 ? 'Renew SSL certificate soon' : undefined
  });

  return checks;
}

async function checkSecurityHeaders(ctx: AnalyzerContext): Promise<SecurityCheck[]> {
  const checks: SecurityCheck[] = [];
  const requiredHeaders = [
    { name: 'content-security-policy', severity: 'HIGH' },
    { name: 'strict-transport-security', severity: 'HIGH' },
    { name: 'x-frame-options', severity: 'MEDIUM' },
    { name: 'x-content-type-options', severity: 'MEDIUM' }
  ];

  for (const header of requiredHeaders) {
    const value = ctx.headers[header.name];
    checks.push({
      name: `header_${header.name}`,
      status: value ? 'PASS' : 'FAIL',
      severity: header.severity as any,
      description: `${header.name} header present`,
      details: { value },
      recommendation: !value ? `Add ${header.name} header` : undefined
    });
  }

  return checks;
}

// Helper Functions
async function checkMixedContent(ctx: AnalyzerContext): Promise<string[]> {
  const script = `
    (function() {
      var mixed = [];
      var allResources = performance.getEntriesByType('resource');
      for (var i = 0; i < allResources.length; i++) {
        var resource = allResources[i];
        if (resource.name.startsWith('http://') && window.location.protocol === 'https:') {
          mixed.push(resource.name);
        }
      }
      return mixed.slice(0, 10);
    })()
  `;
  
  return await ctx.page!.evaluate(script) as string[];
}

async function checkTLS(hostname: string, port: number): Promise<any> {
  return new Promise((resolve) => {
    const socket = tls.connect(port, hostname, { 
      rejectUnauthorized: false
    }, () => {
      const cipher = socket.getCipher();
      const protocol = socket.getProtocol();
      
      socket.end();
      
      const weakProtocols = ['SSLv3', 'TLSv1', 'TLSv1.1'];
      const isSecure = !weakProtocols.includes(protocol || '');
      
      resolve({
        protocol,
        cipher: cipher?.name || 'unknown',
        secure: isSecure
      });
    });
    
    socket.on('error', () => {
      resolve({ secure: false, error: 'Could not establish TLS connection' });
    });
  });
}

async function checkSubresourceIntegrity(ctx: AnalyzerContext): Promise<any> {
  const script = `
    (function() {
      var scripts = Array.from(document.querySelectorAll('script[src]'));
      var styles = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'));
      
      var scriptsWithSRI = scripts.filter(function(s) { return s.hasAttribute('integrity'); });
      var stylesWithSRI = styles.filter(function(s) { return s.hasAttribute('integrity'); });
      
      return {
        totalScripts: scripts.length,
        scriptsWithSRI: scriptsWithSRI.length,
        totalStyles: styles.length,
        stylesWithSRI: stylesWithSRI.length,
        allResourcesHaveSRI: scripts.length === scriptsWithSRI.length && 
                            styles.length === stylesWithSRI.length
      };
    })()
  `;
  
  return await ctx.page!.evaluate(script);
}

async function scanForKnownVulnerabilities(ctx: AnalyzerContext): Promise<any> {
  const script = `
    (function() {
      var libs = [];
      var checks = [
        { name: 'jQuery', global: 'jQuery', versionProp: 'fn' },
        { name: 'React', global: 'React', versionProp: 'version' },
        { name: 'Vue', global: 'Vue', versionProp: 'version' }
      ];
      
      for (var i = 0; i < checks.length; i++) {
        var check = checks[i];
        var version = null;
        
        if (window[check.global]) {
          if (check.versionProp === 'fn' && window[check.global].fn) {
            version = window[check.global].fn.jquery || 'unknown';
          } else if (window[check.global][check.versionProp]) {
            version = window[check.global][check.versionProp];
          } else {
            version = 'present';
          }
        }
        
        if (version) {
          libs.push({ name: check.name, version: version });
        }
      }
      
      return { libraries: libs, count: libs.length };
    })()
  `;
  
  return await ctx.page!.evaluate(script);
}

async function checkXSSPotential(ctx: AnalyzerContext): Promise<any> {
  const script = `
    (function() {
      var scripts = Array.from(document.querySelectorAll('script'));
      var inlineScripts = scripts.filter(function(s) { return !s.src; });
      var eventHandlers = Array.from(document.querySelectorAll('*')).filter(function(el) {
        var attrs = Array.from(el.attributes);
        return attrs.some(function(attr) { return attr.name.startsWith('on'); });
      });
      
      var risk = 'LOW';
      if (inlineScripts.length > 5) risk = 'MEDIUM';
      if (eventHandlers.length > 0 || inlineScripts.length > 10) risk = 'HIGH';
      
      return {
        inlineScriptsCount: inlineScripts.length,
        eventHandlersCount: eventHandlers.length,
        risk: risk
      };
    })()
  `;
  
  return await ctx.page!.evaluate(script);
}

async function checkCookieSecurity(ctx: AnalyzerContext): Promise<any> {
  const cookies = await ctx.page!.cookies();
  
  const insecureCookies = cookies.filter(cookie => 
    !cookie.secure || !cookie.httpOnly
  );
  
  return {
    totalCookies: cookies.length,
    insecureCookies: insecureCookies.length,
    secure: insecureCookies.length === 0,
    cookies: cookies.slice(0, 5).map(c => ({
      name: c.name,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite
    }))
  };
}

async function checkCORSConfiguration(ctx: AnalyzerContext): Promise<any> {
  const corsHeader = ctx.headers['access-control-allow-origin'];
  
  return {
    header: corsHeader,
    secure: corsHeader === ctx.url.origin || corsHeader === null,
    warning: corsHeader === '*'
  };
}

async function getCertificateInfo(hostname: string, port: number): Promise<any> {
  return new Promise((resolve) => {
    const options = {
      host: hostname,
      port: port,
      rejectUnauthorized: false
    };
    
    const req = https.request(options, (res) => {
      const cert = (res.socket as any).getPeerCertificate();
      
      if (!cert || Object.keys(cert).length === 0) {
        resolve({ valid: false, error: 'No certificate found', daysUntilExpiry: 0 });
        return;
      }
      
      const validFrom = new Date(cert.valid_from);
      const validTo = new Date(cert.valid_to);
      const now = new Date();
      
      const valid = now >= validFrom && now <= validTo;
      const daysUntilExpiry = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      resolve({
        valid,
        daysUntilExpiry,
        validFrom: validFrom.toISOString(),
        validTo: validTo.toISOString(),
        subject: cert.subject,
        issuer: cert.issuer
      });
    });
    
    req.on('error', () => {
      resolve({ valid: false, error: 'Could not retrieve certificate', daysUntilExpiry: 0 });
    });
    
    req.end();
  });
}

async function closeBrowser(ctx: AnalyzerContext): Promise<void> {
  if (ctx.browser) {
    await ctx.browser.close();
    ctx.browser = null;
    ctx.page = null;
  }
}

export async function analyzeSecurityHandler(req: any, res: any) {
  const startTime = Date.now();
  let ctx: AnalyzerContext | null = null;
  
  try {
    const { url } = req.body;

    // Validation
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL is required in request body'
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid URL format. Must include protocol (http:// or https://)',
        example: { url: 'https://example.com' }
      });
    }

    console.log(`[${new Date().toISOString()}] Security analysis for: ${url}`);

    // Create analyzer context and run analysis
    ctx = createAnalyzerContext(url);
    await initializeBrowser(ctx);
    
    // Navigate to the URL
    await ctx.page!.goto(ctx.url.href, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Run all security checks
    const checks: SecurityCheck[] = [];
    checks.push(...await checkNetworkSecurity(ctx));
    checks.push(...await checkApplicationSecurity(ctx));
    checks.push(...await checkServerSecurity(ctx));
    checks.push(...await checkVulnerabilities(ctx));
    checks.push(...await performAdvancedAnalysis(ctx));
    checks.push(...await checkCertificates(ctx));
    checks.push(...await checkSecurityHeaders(ctx));

    // Calculate summary
    const totalChecks = checks.length;
    const passed = checks.filter(c => c.status === 'PASS').length;
    const failed = checks.filter(c => c.status === 'FAIL').length;
    const warnings = checks.filter(c => c.status === 'WARNING').length;
    const score = Math.round((passed / totalChecks) * 100);
    
    let grade: string;
    if (score >= 90) grade = 'A+';
    else if (score >= 80) grade = 'A';
    else if (score >= 70) grade = 'B';
    else if (score >= 60) grade = 'C';
    else if (score >= 50) grade = 'D';
    else grade = 'F';

    const report: SecurityReport = {
      summary: {
        totalChecks,
        passed,
        failed,
        warnings,
        score,
        grade
      },
      networkSecurity: checks.filter(c => c.name.startsWith('network_')),
      applicationSecurity: checks.filter(c => c.name.startsWith('app_')),
      serverSecurity: checks.filter(c => c.name.startsWith('server_')),
      vulnerabilityScan: checks.filter(c => c.name.startsWith('vuln_')),
      advancedAnalysis: checks.filter(c => c.name.startsWith('adv_')),
      certificates: checks.filter(c => c.name.startsWith('cert_')),
      headers: checks.filter(c => c.name.startsWith('header_'))
    };

    // Calculate processing time
    const processingTime = Date.now() - startTime;

    // Helper: Group issues by severity
    function groupBySeverity(checks: any[]) {
      return {
        critical: checks.filter(c => c.severity === 'CRITICAL' && c.status === 'FAIL'),
        high: checks.filter(c => c.severity === 'HIGH' && c.status === 'FAIL'),
        medium: checks.filter(c => c.severity === 'MEDIUM' && c.status === 'FAIL'),
        low: checks.filter(c => c.severity === 'LOW' && c.status === 'FAIL')
      };
    }

    // Collect all checks
    const allChecks = [
      ...report.networkSecurity,
      ...report.applicationSecurity,
      ...report.serverSecurity,
      ...report.vulnerabilityScan,
      ...report.advancedAnalysis,
      ...report.certificates,
      ...report.headers
    ];

    // Group by severity
    const issuesBySeverity = groupBySeverity(allChecks);

    // Get top recommendations
    const recommendations = allChecks
      .filter(check => check.recommendation && check.status === 'FAIL')
      .sort((a, b) => {
        const severityOrder: any = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      })
      .slice(0, 10)
      .map(check => ({
        severity: check.severity,
        issue: check.description,
        recommendation: check.recommendation
      }));

    // Get passed checks for positive feedback
    const passedChecks = allChecks.filter(c => c.status === 'PASS');
    const strengths = passedChecks
      .slice(0, 5)
      .map(check => check.description);

    console.log(`[${new Date().toISOString()}] Analysis complete in ${processingTime}ms`);

    // Generate AI issues
    const geminiIssues = await generateUniversalSeoIssues({ ...report, url }, 'security');

    // Send comprehensive response
    res.json({ 
      success: true,
      url: url,
      timestamp: new Date().toISOString(),
      processingTime: `${processingTime}ms`,
      
      // Summary
      summary: {
        score: report.summary.score,
        grade: report.summary.grade,
        totalChecks: report.summary.totalChecks,
        passed: report.summary.passed,
        failed: report.summary.failed,
        warnings: report.summary.warnings,
        securityLevel: report.summary.score >= 80 ? 'Strong' : 
                      report.summary.score >= 60 ? 'Moderate' : 
                      report.summary.score >= 40 ? 'Weak' : 'Critical'
      },

      // Issues breakdown
      issues: {
        critical: {
          count: issuesBySeverity.critical.length,
          items: issuesBySeverity.critical.map(i => ({
            name: i.name,
            description: i.description,
            recommendation: i.recommendation
          }))
        },
        high: {
          count: issuesBySeverity.high.length,
          items: issuesBySeverity.high.map(i => ({
            name: i.name,
            description: i.description,
            recommendation: i.recommendation
          }))
        },
        medium: {
          count: issuesBySeverity.medium.length,
          items: issuesBySeverity.medium.map(i => ({
            name: i.name,
            description: i.description
          }))
        },
        low: {
          count: issuesBySeverity.low.length,
          items: issuesBySeverity.low.map(i => ({
            name: i.name,
            description: i.description
          }))
        }
      },

      // Category breakdown
      categories: {
        networkSecurity: {
          passed: report.networkSecurity.filter(c => c.status === 'PASS').length,
          failed: report.networkSecurity.filter(c => c.status === 'FAIL').length,
          warnings: report.networkSecurity.filter(c => c.status === 'WARNING').length,
          checks: report.networkSecurity
        },
        applicationSecurity: {
          passed: report.applicationSecurity.filter(c => c.status === 'PASS').length,
          failed: report.applicationSecurity.filter(c => c.status === 'FAIL').length,
          warnings: report.applicationSecurity.filter(c => c.status === 'WARNING').length,
          checks: report.applicationSecurity
        },
        serverSecurity: {
          passed: report.serverSecurity.filter(c => c.status === 'PASS').length,
          failed: report.serverSecurity.filter(c => c.status === 'FAIL').length,
          warnings: report.serverSecurity.filter(c => c.status === 'WARNING').length,
          checks: report.serverSecurity
        },
        vulnerabilities: {
          passed: report.vulnerabilityScan.filter(c => c.status === 'PASS').length,
          failed: report.vulnerabilityScan.filter(c => c.status === 'FAIL').length,
          warnings: report.vulnerabilityScan.filter(c => c.status === 'WARNING').length,
          checks: report.vulnerabilityScan
        },
        certificates: {
          passed: report.certificates.filter(c => c.status === 'PASS').length,
          failed: report.certificates.filter(c => c.status === 'FAIL').length,
          warnings: report.certificates.filter(c => c.status === 'WARNING').length,
          checks: report.certificates
        }
      },

      // Top recommendations (prioritized)
      recommendations: recommendations,

      // Security strengths
      strengths: strengths,

      // Quick insights
      insights: {
        hasHTTPS: report.networkSecurity.find(c => c.name === 'network_https_enforcement')?.status === 'PASS',
        hasHSTS: report.networkSecurity.find(c => c.name === 'network_hsts')?.status === 'PASS',
        hasCSP: report.applicationSecurity.find(c => c.name === 'app_csp')?.status === 'PASS',
        certificateValid: report.certificates.find(c => c.name === 'cert_validity')?.status === 'PASS',
        hasMixedContent: report.networkSecurity.find(c => c.name === 'network_mixed_content')?.status === 'FAIL',
        vulnerablePortsOpen: report.networkSecurity.find(c => c.name === 'network_open_ports')?.status === 'FAIL'
      },

      // Complete detailed report
      detailedReport: report,

      // AI-powered issues
      seoIssues: geminiIssues
    });

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] Error after ${processingTime}ms:`, error.message);
    
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Security analysis failed',
      processingTime: `${processingTime}ms`,
      timestamp: new Date().toISOString()
    });
  } finally {
    // Clean up
    if (ctx) {
      try {
        await closeBrowser(ctx);
      } catch (err) {
        console.error('Error closing analyzer:', err);
      }
    }
  }
}
export { analyzeWebsiteSecurity, createAnalyzerContext, closeBrowser };
export type { SecurityReport, SecurityCheck, AnalyzerContext, };