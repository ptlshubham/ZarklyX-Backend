import puppeteer, { Browser, Page, SecurityDetails } from 'puppeteer';
import * as tls from 'tls';
import * as https from 'https';
import * as http from 'http';
import { generateSeoIssues } from '../../../../services/gemini-seo-issues';


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

interface ThreatIndicator {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  detected: boolean;
  affectedUrls?: string[];
}

interface SSLCertificate {
  status: 'VALID' | 'INVALID' | 'EXPIRED' | 'EXPIRING_SOON' | 'NOT_FOUND';
  issuer: string;
  certificateType: 'DV' | 'OV' | 'EV' | 'Unknown' | 'Self-Signed';
  certificateLevel: string;
  subject: string;
  validFrom: string;
  validTo: string;
  expiryDays: number;
  algorithm: string;
  keySize?: number;
  serialNumber?: string;
}

interface MalwareDetection {
  status: 'CLEAN' | 'SUSPICIOUS' | 'MALICIOUS' | 'ERROR';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  detected: boolean;
  threats: Array<{
    type: string;
    description: string;
    url?: string;
  }>;
  blacklisted: boolean;
  safeBrowsing: {
    checked: boolean;
    safe: boolean;
    threats: string[];
  };
  phishing: {
    detected: boolean;
    indicators: string[];
  };
}

interface InsightItem {
  url: string;
  issue: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category: string;
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
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  ctx.page = await ctx.browser.newPage();

  ctx.page.on('response', async (response) => {
    if (response.url() === ctx.url.href) {
      const headers = response.headers();
      Object.keys(headers).forEach(key => {
        ctx.headers[key.toLowerCase()] = headers[key];
      });
      const securityDetails = response.securityDetails();
      if (securityDetails) {
        ctx.securityDetails = securityDetails;
      }
    }
  });
}

async function checkMalwareAndPhishing(ctx: AnalyzerContext): Promise<MalwareDetection> {
  const threats: Array<{ type: string; description: string; url?: string }> = [];
  let blacklisted = false;
  let phishingDetected = false;
  const phishingIndicators: string[] = [];

  const malwareIndicators = await ctx.page!.evaluate(() => {
    const indicators = {
      suspiciousIframes: 0,
      hiddenElements: 0,
      obfuscatedScripts: 0,
      externalScripts: 0,
      suspiciousDomains: [] as string[],
      evalUsage: 0,
      documentWrite: 0,
      base64Content: 0,
      redirects: 0
    };

    const iframes = Array.from(document.querySelectorAll('iframe'));
    indicators.suspiciousIframes = iframes.filter(iframe => {
      const src = iframe.src;
      return src && (src.includes('data:') || iframe.style.display === 'none' || iframe.style.visibility === 'hidden');
    }).length;

    indicators.hiddenElements = Array.from(document.querySelectorAll('[style*="display:none"], [style*="visibility:hidden"]')).length;

    const scripts = Array.from(document.querySelectorAll('script'));
    scripts.forEach(script => {
      const content = script.innerHTML;
      if (content.includes('eval(')) indicators.evalUsage++;
      if (content.includes('document.write')) indicators.documentWrite++;
      if (content.match(/[A-Za-z0-9+/]{50,}={0,2}/)) indicators.base64Content++;
      if (content.includes('unescape') || content.includes('fromCharCode')) {
        indicators.obfuscatedScripts++;
      }
    });

    const externalScripts = scripts.filter(s => s.src);
    externalScripts.forEach(script => {
      const url = new URL(script.src, window.location.href);
      const suspiciousTLDs = ['.tk', '.ml', '.ga', '.cf', '.gq', '.pw', '.top'];
      if (suspiciousTLDs.some(tld => url.hostname.endsWith(tld))) {
        indicators.suspiciousDomains.push(url.hostname);
      }
    });
    indicators.externalScripts = externalScripts.length;

    if (document.querySelectorAll('meta[http-equiv="refresh"]').length > 0) {
      indicators.redirects++;
    }

    return indicators;
  });

  if (malwareIndicators.suspiciousIframes > 0) {
    threats.push({
      type: 'Hidden iframes',
      description: `Found ${malwareIndicators.suspiciousIframes} suspicious hidden iframe(s)`
    });
  }

  if (malwareIndicators.obfuscatedScripts > 0) {
    threats.push({
      type: 'Obfuscated code',
      description: `Found ${malwareIndicators.obfuscatedScripts} obfuscated script(s) using encoding techniques`
    });
  }

  if (malwareIndicators.evalUsage > 2) {
    threats.push({
      type: 'Dynamic code execution',
      description: `Excessive use of eval() detected (${malwareIndicators.evalUsage} instances)`
    });
  }

  if (malwareIndicators.suspiciousDomains.length > 0) {
    threats.push({
      type: 'Suspicious domains',
      description: `Scripts loaded from suspicious TLDs: ${malwareIndicators.suspiciousDomains.join(', ')}`
    });
    blacklisted = true;
  }

  const phishingChecks = await ctx.page!.evaluate(() => {
    const indicators = [];
    
    if (window.location.protocol === 'http:') {
      const sensitiveInputs = document.querySelectorAll('input[type="password"], input[name*="card"], input[name*="cvv"]');
      if (sensitiveInputs.length > 0) {
        indicators.push('Sensitive input fields on non-HTTPS page');
      }
    }

    const forms = Array.from(document.querySelectorAll('form'));
    forms.forEach(form => {
      const action = form.action;
      if (action && action.startsWith('http://')) {
        indicators.push(`Form submits to HTTP: ${action}`);
      }
    });

    const links = Array.from(document.querySelectorAll('a[href]'));
    const suspiciousLinks = links.filter(link => {
      const href = link.getAttribute('href') || '';
      const text = link.textContent || '';
      return href.includes('@') || (href.startsWith('http') && text.startsWith('http') && !href.includes(text));
    });
    if (suspiciousLinks.length > 5) {
      indicators.push('Multiple misleading links detected');
    }

    return indicators;
  });

  if (phishingChecks.length > 0) {
    phishingDetected = true;
    phishingIndicators.push(...phishingChecks);
    threats.push({
      type: 'Phishing indicators',
      description: phishingChecks.join('; ')
    });
  }

  const threatScore = threats.length;
  let status: 'CLEAN' | 'SUSPICIOUS' | 'MALICIOUS' | 'ERROR';
  let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  if (blacklisted || threatScore >= 5) {
    status = 'MALICIOUS';
    severity = 'CRITICAL';
  } else if (threatScore >= 3) {
    status = 'SUSPICIOUS';
    severity = 'HIGH';
  } else if (threatScore > 0) {
    status = 'SUSPICIOUS';
    severity = 'MEDIUM';
  } else {
    status = 'CLEAN';
    severity = 'LOW';
  }

  return {
    status,
    severity,
    detected: threatScore > 0,
    threats,
    blacklisted,
    safeBrowsing: {
      checked: true,
      safe: status === 'CLEAN',
      threats: threats.map(t => t.type)
    },
    phishing: {
      detected: phishingDetected,
      indicators: phishingIndicators
    }
  };
}

async function getDetailedCertificateInfo(hostname: string, port: number): Promise<SSLCertificate> {
  return new Promise((resolve) => {
    const options = { host: hostname, port: port, rejectUnauthorized: false };
    
    const req = https.request(options, (res) => {
      const cert = (res.socket as any).getPeerCertificate();
      
      if (!cert || Object.keys(cert).length === 0) {
        resolve({
          status: 'NOT_FOUND',
          issuer: 'Unknown',
          certificateType: 'Unknown',
          certificateLevel: 'No certificate found',
          subject: 'Not Available',
          validFrom: '',
          validTo: '',
          expiryDays: 0,
          algorithm: 'Unknown'
        });
        return;
      }
      
      const validFrom = new Date(cert.valid_from);
      const validTo = new Date(cert.valid_to);
      const now = new Date();
      const expiryDays = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      let status: 'VALID' | 'INVALID' | 'EXPIRED' | 'EXPIRING_SOON' | 'NOT_FOUND';
      if (now < validFrom || now > validTo) {
        status = now > validTo ? 'EXPIRED' : 'INVALID';
      } else if (expiryDays <= 30) {
        status = 'EXPIRING_SOON';
      } else {
        status = 'VALID';
      }

      const issuerName = cert.issuer?.O || cert.issuer?.CN || 'Unknown';
      const subject = cert.subject || {};
      
      let certificateType: 'DV' | 'OV' | 'EV' | 'Unknown' | 'Self-Signed';
      let certificateLevel: string;

      const isSelfSigned = cert.issuer?.CN === cert.subject?.CN && 
                           cert.issuer?.O === cert.subject?.O;
      
      if (isSelfSigned) {
        certificateType = 'Self-Signed';
        certificateLevel = 'Self-Signed Certificate (Not Trusted)';
      } else if (subject.businessCategory || subject.jurisdictionC || subject.serialNumber) {
        certificateType = 'EV';
        certificateLevel = 'Extended Validation (EV) - Highest Trust';
      } else if (subject.O || subject.L || subject.ST) {
        certificateType = 'OV';
        certificateLevel = 'Organization Validation (OV) - Medium Trust';
      } else if (issuerName.includes('Let\'s Encrypt') || issuerName.includes('Cloudflare')) {
        certificateType = 'DV';
        certificateLevel = 'Domain Validation (DV) - Basic Trust';
      } else if (subject.CN && !subject.O) {
        certificateType = 'DV';
        certificateLevel = 'Domain Validation (DV) - Basic Trust';
      } else {
        certificateType = 'Unknown';
        certificateLevel = 'Unknown Certificate Type';
      }
      
      resolve({
        status,
        issuer: issuerName,
        certificateType,
        certificateLevel,
        subject: cert.subject?.CN || hostname,
        validFrom: validFrom.toISOString(),
        validTo: validTo.toISOString(),
        expiryDays,
        algorithm: cert.signatureAlgorithm || 'Unknown',
        keySize: cert.bits,
        serialNumber: cert.serialNumber
      });
    });
    
    req.on('error', () => {
      resolve({
        status: 'NOT_FOUND',
        issuer: 'Unknown',
        certificateType: 'Unknown',
        certificateLevel: 'Certificate not accessible',
        subject: hostname,
        validFrom: '',
        validTo: '',
        expiryDays: 0,
        algorithm: 'Unknown'
      });
    });
    
    req.end();
  });
}

async function checkServerVulnerabilities(ctx: AnalyzerContext): Promise<SecurityCheck[]> {
  const checks: SecurityCheck[] = [];

  const serverHeader = ctx.headers['server'];
  const poweredByHeader = ctx.headers['x-powered-by'];
  const aspNetVersion = ctx.headers['x-aspnet-version'];
  
  const disclosureHeaders = [];
  if (serverHeader) disclosureHeaders.push(`Server: ${serverHeader}`);
  if (poweredByHeader) disclosureHeaders.push(`X-Powered-By: ${poweredByHeader}`);
  if (aspNetVersion) disclosureHeaders.push(`X-AspNet-Version: ${aspNetVersion}`);

  checks.push({
    name: 'server_information_disclosure',
    status: disclosureHeaders.length === 0 ? 'PASS' : 'WARNING',
    severity: 'LOW',
    description: 'Server information exposure',
    details: {
      exposedHeaders: disclosureHeaders,
      count: disclosureHeaders.length
    },
    recommendation: disclosureHeaders.length > 0 ? 'Remove server version headers to prevent information disclosure' : undefined
  });

  const traceEnabled = await checkHTTPTrace(ctx.url.hostname, parseInt(ctx.url.port) || (ctx.url.protocol === 'https:' ? 443 : 80));
  checks.push({
    name: 'server_http_trace',
    status: traceEnabled ? 'FAIL' : 'PASS',
    severity: 'MEDIUM',
    description: 'HTTP TRACE method',
    details: { enabled: traceEnabled },
    recommendation: traceEnabled ? 'Disable HTTP TRACE method to prevent XST attacks' : undefined
  });

  const directoryListing = ctx.headers['content-type']?.includes('text/html') && 
                          await ctx.page!.evaluate(() => {
                            return document.body.textContent?.includes('Index of /') || 
                                   document.body.textContent?.includes('Directory listing for');
                          });

  checks.push({
    name: 'server_directory_listing',
    status: directoryListing ? 'FAIL' : 'PASS',
    severity: 'MEDIUM',
    description: 'Directory listing',
    details: { enabled: directoryListing },
    recommendation: directoryListing ? 'Disable directory listing to prevent information disclosure' : undefined
  });

  return checks;
}

async function checkHTTPTrace(hostname: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const options = {
      hostname,
      port,
      method: 'TRACE',
      path: '/',
      timeout: 5000
    };

    const protocol = port === 443 ? https : http;
    const req = protocol.request(options, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

function calculateThreatScore(
  checks: SecurityCheck[], 
  sslStatus: SSLCertificate, 
  malwareDetection: MalwareDetection
): number {
  let threatScore = 0;

  const criticalFailures = checks.filter(c => c.severity === 'CRITICAL' && c.status === 'FAIL');
  threatScore += criticalFailures.length * 25;

  const highFailures = checks.filter(c => c.severity === 'HIGH' && c.status === 'FAIL');
  threatScore += highFailures.length * 15;

  const mediumFailures = checks.filter(c => c.severity === 'MEDIUM' && c.status === 'FAIL');
  threatScore += mediumFailures.length * 8;

  const lowFailures = checks.filter(c => c.severity === 'LOW' && c.status === 'FAIL');
  threatScore += lowFailures.length * 3;

  if (sslStatus.status === 'EXPIRED') threatScore += 30;
  else if (sslStatus.status === 'INVALID') threatScore += 25;
  else if (sslStatus.status === 'EXPIRING_SOON') threatScore += 10;
  else if (sslStatus.status === 'NOT_FOUND') threatScore += 35;

  if (sslStatus.certificateType === 'Self-Signed') threatScore += 20;
  else if (sslStatus.certificateType === 'Unknown') threatScore += 10;

  if (malwareDetection.status === 'MALICIOUS') threatScore += 40;
  else if (malwareDetection.status === 'SUSPICIOUS') threatScore += 20;
  
  if (malwareDetection.blacklisted) threatScore += 15;
  if (malwareDetection.phishing.detected) threatScore += 25;

  return Math.min(100, threatScore);
}

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
      return mixed;
    })()
  `;
  return await ctx.page!.evaluate(script) as string[];
}

async function checkTLS(hostname: string, port: number): Promise<any> {
  return new Promise((resolve) => {
    const socket = tls.connect(port, hostname, { rejectUnauthorized: false }, () => {
      const cipher = socket.getCipher();
      const protocol = socket.getProtocol();
      socket.end();
      
      const weakProtocols = ['SSLv3', 'TLSv1', 'TLSv1.1'];
      const isSecure = !weakProtocols.includes(protocol || '');
      
      resolve({
        protocol,
        cipher: cipher?.name || 'unknown',
        secure: isSecure,
        version: protocol
      });
    });
    
    socket.on('error', () => {
      resolve({ secure: false, error: 'Could not establish TLS connection' });
    });
  });
}

function determineEncryptionLevel(ctx: AnalyzerContext, tlsCheck?: SecurityCheck): 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE' {
  if (ctx.url.protocol !== 'https:') return 'NONE';

  const hstsHeader = ctx.headers['strict-transport-security'];
  const hasTLS13 = tlsCheck?.details?.protocol === 'TLSv1.3';
  const hasTLS12 = tlsCheck?.details?.protocol === 'TLSv1.2';
  const hasStrongHSTS = hstsHeader && hstsHeader.includes('max-age=31536000');

  if (hasTLS13 && hasStrongHSTS) return 'STRONG';
  else if ((hasTLS13 || hasTLS12) && hstsHeader) return 'MODERATE';
  else if (tlsCheck?.status === 'PASS') return 'WEAK';
  return 'NONE';
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
  
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: 'URL is required in request body' });
  }

  new URL(url);

  console.log(`[${new Date().toISOString()}] Security analysis for: ${url}`);

  ctx = createAnalyzerContext(url);
  await initializeBrowser(ctx);
  
  await ctx.page!.goto(ctx.url.href, { waitUntil: 'networkidle2', timeout: 300000 });

  const mixedContentUrls = await checkMixedContent(ctx);
  const insecureUrls = ctx.url.protocol === 'http:' ? [ctx.url.href] : [];

  const externalUrls = await ctx.page!.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    return scripts.map(s => s.getAttribute('src')).filter(Boolean) as string[];
  });

  const httpEnabledCheck: SecurityCheck = {
    name: 'security_http_enabled',
    status: ctx.url.protocol === 'https:' ? 'PASS' : 'FAIL',
    severity: 'CRITICAL',
    description: 'HTTPS encryption enabled',
    details: { protocol: ctx.url.protocol, httpsEnabled: ctx.url.protocol === 'https:' },
    recommendation: ctx.url.protocol !== 'https:' ? 'Enable HTTPS and redirect all HTTP traffic' : undefined
  };

  const mixedContentCheck: SecurityCheck = {
    name: 'security_mixed_content',
    status: mixedContentUrls.length === 0 ? 'PASS' : 'FAIL',
    severity: 'HIGH',
    description: 'Mixed content check',
    details: { count: mixedContentUrls.length, urls: mixedContentUrls.slice(0, 10) },
    recommendation: mixedContentUrls.length > 0 ? 'Remove all HTTP resources, use HTTPS only' : undefined
  };

  const cspHeader = ctx.headers['content-security-policy'];
  const xfoHeader = ctx.headers['x-frame-options'];
  const xctoHeader = ctx.headers['x-content-type-options'];
  const referrerHeader = ctx.headers['referrer-policy'];
  const hstsHeader = ctx.headers['strict-transport-security'];

  const missingHeadersList: string[] = [];
  const missingHeadersChecks: SecurityCheck[] = [];

  if (!cspHeader) {
    missingHeadersList.push('content-security-policy');
    missingHeadersChecks.push({
      name: 'header_missing_csp',
      status: 'FAIL',
      severity: 'HIGH',
      description: 'Content-Security-Policy header missing',
      details: { header: 'content-security-policy', value: null },
      recommendation: 'Add CSP header to prevent XSS attacks'
    });
  }

  if (!xfoHeader) {
    missingHeadersList.push('x-frame-options');
    missingHeadersChecks.push({
      name: 'header_missing_xfo',
      status: 'FAIL',
      severity: 'MEDIUM',
      description: 'X-Frame-Options header missing',
      details: { header: 'x-frame-options', value: null },
      recommendation: 'Add X-Frame-Options: DENY to prevent clickjacking'
    });
  }

  if (!xctoHeader || xctoHeader.toUpperCase() !== 'NOSNIFF') {
    missingHeadersList.push('x-content-type-options');
    missingHeadersChecks.push({
      name: 'header_missing_xcto',
      status: 'FAIL',
      severity: 'MEDIUM',
      description: 'X-Content-Type-Options header missing',
      details: { header: 'x-content-type-options', value: xctoHeader },
      recommendation: 'Add X-Content-Type-Options: nosniff'
    });
  }

  if (!referrerHeader) {
    missingHeadersList.push('referrer-policy');
    missingHeadersChecks.push({
      name: 'header_missing_referrer',
      status: 'WARNING',
      severity: 'LOW',
      description: 'Referrer-Policy header missing',
      details: { header: 'referrer-policy', value: null },
      recommendation: 'Add Referrer-Policy header'
    });
  }

  if (!hstsHeader) {
    missingHeadersList.push('strict-transport-security');
    missingHeadersChecks.push({
      name: 'header_missing_hsts',
      status: 'FAIL',
      severity: 'HIGH',
      description: 'Strict-Transport-Security header missing',
      details: { header: 'strict-transport-security', value: null },
      recommendation: 'Add HSTS header with max-age=31536000'
    });
  }

  const malwareDetection = await checkMalwareAndPhishing(ctx);
  const serverVulnChecks = await checkServerVulnerabilities(ctx);

  const cspDirectives = cspHeader ? cspHeader.split(';').map(d => d.trim()).filter(Boolean) : [];
  const cspIssues: string[] = [];
  
  if (cspHeader) {
    if (cspHeader.includes('unsafe-inline')) cspIssues.push('Uses unsafe-inline');
    if (cspHeader.includes('unsafe-eval')) cspIssues.push('Uses unsafe-eval');
    if (!cspHeader.includes('default-src')) cspIssues.push('Missing default-src');
  }

  let tlsCheck: SecurityCheck | undefined;
  if (ctx.url.protocol === 'https:') {
    const tlsInfo = await checkTLS(ctx.url.hostname, parseInt(ctx.url.port) || 443);
    tlsCheck = {
      name: 'network_tls_configuration',
      status: tlsInfo.secure ? 'PASS' : 'FAIL',
      severity: 'HIGH',
      description: 'TLS configuration',
      details: tlsInfo,
      recommendation: !tlsInfo.secure ? 'Upgrade to TLS 1.2 or higher' : undefined
    };
  }

  const sslStatus = ctx.url.protocol === 'https:' 
    ? await getDetailedCertificateInfo(ctx.url.hostname, parseInt(ctx.url.port) || 443)
    : {
        status: 'NOT_FOUND' as const,
        issuer: 'N/A',
        certificateType: 'Unknown' as const,
        certificateLevel: 'No SSL (HTTP)',
        subject: ctx.url.hostname,
        validFrom: '',
        validTo: '',
        expiryDays: 0,
        algorithm: 'None'
      };

  const allChecks: SecurityCheck[] = [
    httpEnabledCheck,
    mixedContentCheck,
    ...missingHeadersChecks,
    ...serverVulnChecks
  ];

  if (tlsCheck) allChecks.push(tlsCheck);

  const totalChecks = allChecks.length;
  const passed = allChecks.filter(c => c.status === 'PASS').length;
  const failed = allChecks.filter(c => c.status === 'FAIL').length;
  const warnings = allChecks.filter(c => c.status === 'WARNING').length;
  
  const securityScore = Math.round((passed / totalChecks) * 100);
  const threatScore = calculateThreatScore(allChecks, sslStatus, malwareDetection);
  const encryptionLevel = determineEncryptionLevel(ctx, tlsCheck);
  
  let grade: string;
  if (securityScore >= 90) grade = 'A+';
  else if (securityScore >= 80) grade = 'A';
  else if (securityScore >= 70) grade = 'B';
  else if (securityScore >= 60) grade = 'C';
  else if (securityScore >= 50) grade = 'D';
  else grade = 'F';

  const overallRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 
    threatScore >= 70 ? 'CRITICAL' :
    threatScore >= 50 ? 'HIGH' :
    threatScore >= 30 ? 'MEDIUM' : 'LOW';

  const threatIndicators: ThreatIndicator[] = [
    {
      type: 'No HTTPS',
      severity: 'CRITICAL',
      description: 'Website does not use HTTPS encryption',
      detected: ctx.url.protocol !== 'https:',
      affectedUrls: insecureUrls
    },
    {
      type: 'Mixed Content',
      severity: 'HIGH',
      description: 'HTTP resources loaded over HTTPS',
      detected: mixedContentUrls.length > 0,
      affectedUrls: mixedContentUrls.slice(0, 10)
    },
    {
      type: 'Missing Security Headers',
      severity: 'HIGH',
      description: `${missingHeadersList.length} critical security headers missing`,
      detected: missingHeadersList.length > 0
    },
    {
      type: 'Malware Detection',
      severity: malwareDetection.severity,
      description: malwareDetection.status !== 'CLEAN' ? 'Malicious code patterns detected' : 'No malware detected',
      detected: malwareDetection.detected
    },
    {
      type: 'Phishing Indicators',
      severity: 'CRITICAL',
      description: 'Phishing patterns detected on page',
      detected: malwareDetection.phishing.detected,
      affectedUrls: malwareDetection.phishing.indicators
    },
    {
      type: 'Expired/Invalid SSL',
      severity: 'CRITICAL',
      description: 'SSL certificate is expired or invalid',
      detected: sslStatus.status === 'EXPIRED' || sslStatus.status === 'INVALID'
    },
    {
      type: 'Weak Certificate',
      severity: 'MEDIUM',
      description: 'Using self-signed or low-trust certificate',
      detected: sslStatus.certificateType === 'Self-Signed'
    }
  ];

  const insights: {
    urls: {
      insecureUrls: string[];
      mixedContentUrls: string[];
      externalResourceUrls: string[];
      maliciousUrls: string[];
    };
    issues: InsightItem[];
    warnings: InsightItem[];
  } = {
    urls: {
      insecureUrls,
      mixedContentUrls: mixedContentUrls.slice(0, 20),
      externalResourceUrls: externalUrls.slice(0, 10),
      maliciousUrls: malwareDetection.threats.filter(t => t.url).map(t => t.url!)
    },
    issues: [],
    warnings: []
  };

  allChecks.forEach(check => {
    if (check.status === 'FAIL') {
      insights.issues.push({
        url: ctx!.url.href,
        issue: check.description,
        severity: check.severity,
        category: check.name.split('_')[0]
      });
    } else if (check.status === 'WARNING') {
      insights.warnings.push({
        url: ctx!.url.href,
        issue: check.description,
        severity: check.severity,
        category: check.name.split('_')[0]
      });
    }
  });

  mixedContentUrls.forEach(url => {
    insights.issues.push({
      url,
      issue: 'HTTP resource loaded over HTTPS (Mixed Content)',
      severity: 'HIGH',
      category: 'mixed-content'
    });
  });

  malwareDetection.threats.forEach(threat => {
    insights.issues.push({
      url: threat.url || ctx!.url.href,
      issue: `${threat.type}: ${threat.description}`,
      severity: malwareDetection.severity,
      category: 'malware'
    });
  });

  const processingTime = Date.now() - startTime;

  const geminiIssues = await generateSeoIssues({ 
    url, 
    allChecks, 
    sslStatus, 
    malwareDetection,
    threatScore,
    securityScore
  });

  res.json({
    success: true,
    url: url,
    timestamp: new Date().toISOString(),
    processingTime: `${processingTime}ms`,

    summary: {
      securityScore,
      threatScore,
      grade,
      totalChecks,
      passed,
      failed,
      warnings,
      encryptionLevel,
      overallRisk
    },

    securityIssues: {
      httpEnabled: {
        status: httpEnabledCheck.status,
        severity: httpEnabledCheck.severity,
        description: httpEnabledCheck.description,
        enabled: ctx!.url.protocol === 'https:',
        recommendation: httpEnabledCheck.recommendation
      },
      mixedContent: {
        status: mixedContentCheck.status,
        severity: mixedContentCheck.severity,
        description: mixedContentCheck.description,
        count: mixedContentUrls.length,
        urls: mixedContentUrls.slice(0, 10),
        recommendation: mixedContentCheck.recommendation
      },
      missingSecurityHeaders: {
        status: missingHeadersList.length === 0 ? 'PASS' : 'FAIL',
        severity: 'HIGH',
        description: `${missingHeadersList.length} security headers missing`,
        headers: missingHeadersList,
        details: missingHeadersChecks
      },
      malwareDetection: {
        status: malwareDetection.status,
        severity: malwareDetection.severity,
        description: `Malware scan: ${malwareDetection.status}`,
        detected: malwareDetection.detected,
        threats: malwareDetection.threats,
        blacklisted: malwareDetection.blacklisted,
        safeBrowsing: malwareDetection.safeBrowsing,
        phishing: malwareDetection.phishing,
        recommendation: malwareDetection.detected ? 'Scan site for malicious code and remove threats immediately' : undefined
      }
    },

    contentSecurityPolicy: {
      status: cspHeader ? 'PASS' : 'FAIL',
      severity: 'HIGH',
      description: cspHeader ? 'CSP configured' : 'CSP missing',
      present: !!cspHeader,
      directives: cspDirectives,
      issues: cspIssues,
      value: cspHeader
    },

    securityHeaders: {
      'content-security-policy': {
        status: cspHeader ? 'PASS' : 'FAIL',
        severity: 'HIGH',
        description: cspHeader ? 'CSP header present and configured' : 'CSP header is missing - site vulnerable to XSS',
        value: cspHeader || null
      },
      'x-frame-options': {
        status: xfoHeader && ['DENY', 'SAMEORIGIN'].includes(xfoHeader.toUpperCase()) ? 'PASS' : 'FAIL',
        severity: 'MEDIUM',
        description: xfoHeader ? `X-Frame-Options set to ${xfoHeader}` : 'X-Frame-Options missing - vulnerable to clickjacking',
        value: xfoHeader || null
      },
      'x-content-type-options': {
        status: xctoHeader?.toUpperCase() === 'NOSNIFF' ? 'PASS' : 'FAIL',
        severity: 'MEDIUM',
        description: xctoHeader ? 'X-Content-Type-Options prevents MIME sniffing' : 'X-Content-Type-Options missing - MIME sniffing possible',
        value: xctoHeader || null
      },
      'referrer-policy': {
        status: referrerHeader ? 'PASS' : 'WARNING',
        severity: 'LOW',
        description: referrerHeader ? `Referrer-Policy set to ${referrerHeader}` : 'Referrer-Policy missing - privacy concerns',
        value: referrerHeader || null
      },
      'strict-transport-security': {
        status: hstsHeader ? 'PASS' : 'FAIL',
        severity: 'HIGH',
        description: hstsHeader ? 'HSTS enforces HTTPS connections' : 'HSTS missing - HTTPS not enforced',
        value: hstsHeader || null
      }
    },

    sslStatus: {
      status: sslStatus.status,
      issuer: sslStatus.issuer,
      certificateType: sslStatus.certificateType,
      certificateLevel: sslStatus.certificateLevel,
      subject: sslStatus.subject,
      validFrom: sslStatus.validFrom,
      validTo: sslStatus.validTo,
      expiryDays: sslStatus.expiryDays,
      algorithm: sslStatus.algorithm,
      keySize: sslStatus.keySize,
      serialNumber: sslStatus.serialNumber
    },

    threatIndicators: threatIndicators.filter(t => t.detected),

    serverVulnerabilities: {
      checks: serverVulnChecks,
      httpTraceEnabled: serverVulnChecks.find(c => c.name === 'server_http_trace')?.details.enabled || false,
      directoryListingEnabled: serverVulnChecks.find(c => c.name === 'server_directory_listing')?.details.enabled || false,
      informationDisclosure: serverVulnChecks.find(c => c.name === 'server_information_disclosure')?.details || {}
    },

    cookiesAndPrivacy: {
      tlsVersion: tlsCheck?.details?.version || 'N/A',
      tlsSecure: tlsCheck?.status === 'PASS',
      cipher: tlsCheck?.details?.cipher || 'N/A'
    },

    insights,
    detailedChecks: allChecks,
    seoIssues: geminiIssues
  });

  if (ctx) {
    await closeBrowser(ctx);
  }
}

export { createAnalyzerContext, closeBrowser };
export type { SecurityCheck, SSLCertificate, ThreatIndicator, AnalyzerContext, MalwareDetection, InsightItem };