import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();
const api : string=process.env.GEMINI_API || "";
const genAI = new GoogleGenerativeAI(api);

function safeJsonParse(text: string): any {
  try {
    // Remove markdown code blocks
    let cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    
    // Try direct parse first
    try {
      return JSON.parse(cleaned);
    } catch {
      // Extract JSON array or object
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
      const objectMatch = cleaned.match(/\{[\s\S]*\}/);
      
      if (arrayMatch) {
        return JSON.parse(arrayMatch[0]);
      } else if (objectMatch) {
        return JSON.parse(objectMatch[0]);
      }
      
      // Fallback: return empty array for generateSeoIssues
      return [];
    }
  } catch (err) {
    console.error('JSON parse error:', err, 'Text:', text);
    return [];
  }
}

function sanitizeDataForGemini(data: any): any {
  // Limit string length to prevent token overflow
  const maxStringLength = 500;
  const maxArrayLength = 10;
  const maxObjectDepth = 3;
  
  function truncateString(str: string): string {
    return str.length > maxStringLength ? str.substring(0, maxStringLength) + '...' : str;
  }
  
  function sanitizeValue(value: any, depth: number = 0): any {
    if (depth > maxObjectDepth) return '[Object too deep]';
    
    if (typeof value === 'string') {
      return truncateString(value);
    }
    
    if (Array.isArray(value)) {
      return value.slice(0, maxArrayLength).map(item => sanitizeValue(item, depth + 1));
    }
    
    if (value && typeof value === 'object') {
      const sanitized: any = {};
      let count = 0;
      for (const [key, val] of Object.entries(value)) {
        if (count >= 20) break; // Limit object properties
        sanitized[key] = sanitizeValue(val, depth + 1);
        count++;
      }
      return sanitized;
    }
    
    return value;
  }
  
  return sanitizeValue(data);
}

export async function generateSeoIssues(seoJson: object, analysisType: string = 'general'): Promise<any> {
  const maxRetries = 3;
  const retryDelay = 2000;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash", 
        generationConfig: { 
          temperature: 0.1
        } 
      });
      
      // Sanitize data before sending to Gemini
      const sanitizedData = sanitizeDataForGemini(seoJson);
      
      const prompt = `Analyze SEO data and return issues as JSON array:
[{"issueid":"id","name":"issue","priority":"High","affected_url":"url"}]

Data: ${JSON.stringify(sanitizedData).substring(0, 3000)}`;
      
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const parsed = safeJsonParse(text);
      
      return Array.isArray(parsed) ? parsed : [];
    } catch (error: any) {
      console.error(`Gemini attempt ${attempt} failed:`, error.message);
      
      if (error.message?.includes('503') && attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        continue;
      }
      
      return [];
    }
  }
  
  return [];
}

export async function generateMobileAudit(seoJson: object): Promise<any> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { temperature: 0, responseMimeType: "application/json" } });
  const prompt = `
You are a Mobile UX Specialist and Performance Engineer with expertise in responsive design, mobile optimization, and Core Web Vitals.

OBJECTIVE:
Analyze the provided mobile optimization data to identify usability issues, performance bottlenecks, and responsive design problems that impact mobile user experience.

SCOPE (MOBILE OPTIMIZATION AREAS):
- Viewport configuration and responsive design implementation
- Touch target sizing and accessibility (minimum 44x44px recommendation)
- Mobile-friendly navigation and user interface elements
- Font scaling, readability, and typography optimization
- Content width management and horizontal scrolling issues
- Loading performance and Core Web Vitals on mobile devices
- Touch gesture support and interaction feedback
- Mobile-specific SEO factors and search engine compatibility

ANALYSIS REQUIREMENTS:
- Evaluate responsive design effectiveness across different screen sizes
- Identify touch usability problems and accessibility violations
- Assess mobile performance impact on user engagement
- Prioritize fixes based on user experience impact
- Consider mobile-first indexing implications for SEO
- CRITICAL: Extract URLs from the input data:
  * Use 'url' field from the root of the analysis object
  * The URL will be available as a direct property in the input data
  * For mobile-specific issues, use this analyzed page URL

OUTPUT SCHEMA (STRICT JSON):
{
  "summary": {
    "overallMobileScore": number,
    "responsiveIssuesCount": number,
    "touchIssuesCount": number,
    "performanceIssuesCount": number
  },
  "issues": [
    {
      "category": "Viewport | Touch Targets | Typography | Performance | Navigation | Accessibility",
      "severity": "Critical | High | Medium | Low",
      "issue": "Specific mobile usability problem",
      "url": "Specific URL where this issue was found",
      "evidence": "Data from analysis supporting this finding",
      "impact": "Effect on mobile user experience and conversions"
    }
  ],
  "recommendations": [
    {
      "priority": "Critical | High | Medium | Low",
      "recommendation": "Specific mobile optimization action",
      "expectedBenefit": "Improvement in mobile user experience",
      "implementationHint": "Technical guidance for mobile optimization"
    }
  ]
}

INPUT MOBILE DATA:
${JSON.stringify(seoJson)}
`;
  const result = await model.generateContent(prompt);
  return safeJsonParse(result.response.text());
}

export async function generateComprehensiveAudit(seoJson: object): Promise<any> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { temperature: 0, responseMimeType: "application/json" } });
  const prompt = `
You are a Senior SEO Strategist and Technical SEO Consultant with 15+ years of experience optimizing enterprise websites for search engines.

OBJECTIVE:
Analyze the comprehensive SEO audit data to identify critical technical issues, content optimization opportunities, and strategic improvements that will enhance search engine visibility and organic traffic.

SCOPE (COMPREHENSIVE SEO AREAS):
- Technical SEO infrastructure (crawlability, indexability, site architecture)
- On-page optimization (title tags, meta descriptions, heading structure)
- Content quality and keyword optimization strategies
- Site performance and Core Web Vitals impact on rankings
- Mobile-first indexing compliance and responsive design
- Structured data implementation and rich snippet opportunities
- Internal linking architecture and page authority distribution
- Security factors affecting SEO (HTTPS, security headers)
- Accessibility compliance and inclusive design principles

ANALYSIS REQUIREMENTS:
- Identify technical barriers preventing optimal search engine crawling
- Evaluate content optimization opportunities for target keywords
- Assess site architecture efficiency for SEO value distribution
- Prioritize improvements based on potential traffic impact
- Consider algorithm updates and ranking factor importance
- Analyze competitive positioning and market opportunities
- CRITICAL: Extract URLs from the input data:
  * Use 'url' field from the main analysis object
  * Look for 'data.url' or similar URL properties in comprehensive analysis
  * For page-specific SEO issues, use the analyzed page URL

OUTPUT SCHEMA (STRICT JSON):
{
  "summary": {
    "overallSeoScore": number,
    "technicalIssuesCount": number,
    "contentIssuesCount": number,
    "performanceIssuesCount": number
  },
  "issues": [
    {
      "category": "Technical | Content | Performance | Mobile | Security | Accessibility | Structured Data",
      "severity": "Critical | High | Medium | Low",
      "issue": "Specific SEO problem affecting rankings",
      "url": "Specific URL where this issue was found",
      "evidence": "Analysis data supporting this SEO issue",
      "impact": "Effect on search rankings and organic traffic"
    }
  ],
  "recommendations": [
    {
      "priority": "Critical | High | Medium | Low",
      "recommendation": "Specific SEO optimization action",
      "expectedBenefit": "Projected improvement in search performance",
      "implementationHint": "Technical guidance for SEO implementation"
    }
  ]
}

INPUT COMPREHENSIVE SEO DATA:
${JSON.stringify(seoJson)}
`;
  const result = await model.generateContent(prompt);
  return safeJsonParse(result.response.text());
}

export async function generateLighthouseAudit(seoJson: object): Promise<any> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { temperature: 0, responseMimeType: "application/json" } });
  const prompt = `
You are a Web Performance Engineer and Lighthouse Audit Specialist with expertise in Core Web Vitals, accessibility standards, and performance optimization.

OBJECTIVE:
Analyze the Lighthouse audit results to identify performance bottlenecks, accessibility violations, SEO issues, and best practice deviations that impact user experience and search rankings.

SCOPE (LIGHTHOUSE AUDIT AREAS):
- Performance metrics (LCP, FID, CLS, FCP, Speed Index, TTI)
- Accessibility compliance (WCAG guidelines, screen reader compatibility)
- SEO technical factors (meta tags, structured data, crawlability)
- Progressive Web App capabilities and offline functionality
- Best practices for modern web development standards
- Resource optimization (images, JavaScript, CSS efficiency)
- Network efficiency and caching strategies
- Security considerations in performance context

ANALYSIS REQUIREMENTS:
- Evaluate Core Web Vitals impact on user experience and SEO rankings
- Identify accessibility barriers affecting user inclusivity
- Assess technical SEO factors measured by Lighthouse
- Prioritize optimizations based on performance impact
- Consider mobile vs desktop performance differences
- Analyze resource loading efficiency and optimization opportunities
- CRITICAL: Extract URLs from the input data:
  * Use the URL that was analyzed by Lighthouse
  * Look for URL references in the Lighthouse results data
  * For performance issues, use the main analyzed page URL

OUTPUT SCHEMA (STRICT JSON):
{
  "summary": {
    "overallPerformanceScore": number,
    "performanceIssuesCount": number,
    "accessibilityIssuesCount": number,
    "seoIssuesCount": number
  },
  "issues": [
    {
      "category": "Performance | Accessibility | SEO | Best Practices | PWA",
      "severity": "Critical | High | Medium | Low",
      "issue": "Specific Lighthouse audit failure or opportunity",
      "url": "Specific URL where this issue was found",
      "evidence": "Lighthouse metrics and audit results",
      "impact": "Effect on user experience and search performance"
    }
  ],
  "recommendations": [
    {
      "priority": "Critical | High | Medium | Low",
      "recommendation": "Specific performance or accessibility improvement",
      "expectedBenefit": "Projected improvement in Lighthouse scores",
      "implementationHint": "Technical guidance for optimization"
    }
  ]
}

INPUT LIGHTHOUSE DATA:
${JSON.stringify(seoJson)}
`;
  const result = await model.generateContent(prompt);
  return safeJsonParse(result.response.text());
}

export async function generateIndexingAudit(seoJson: object): Promise<any> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { temperature: 0, responseMimeType: "application/json" } });
  const prompt = `
You are a Technical SEO Specialist with deep expertise in search engine crawling, indexing mechanisms, and Google Search Console optimization.

OBJECTIVE:
Analyze the search indexing data to identify crawlability issues, indexing barriers, and technical factors that prevent optimal search engine discovery and ranking of website content.

SCOPE (SEARCH INDEXING AREAS):
- Robots.txt configuration and crawl directive compliance
- XML sitemap structure, accuracy, and submission status
- Meta robots tags and noindex/nofollow implementations
- Canonical URL management and duplicate content handling
- URL structure optimization and parameter handling
- Internal linking architecture for crawl efficiency
- Page loading speed impact on crawl budget
- Mobile-first indexing compliance and responsive design
- Structured data markup for enhanced search results

ANALYSIS REQUIREMENTS:
- Identify technical barriers preventing search engine crawling
- Evaluate indexing efficiency and crawl budget optimization
- Assess duplicate content risks and canonicalization issues
- Analyze URL structure for SEO-friendly patterns
- Review meta tag implementations for indexing control
- Consider mobile-first indexing implications
- CRITICAL: Extract URLs from the input data:
  * Use the URL that was analyzed for indexing
  * Look for URL references in the indexing analysis results
  * For indexing issues, use the main analyzed page URL

OUTPUT SCHEMA (STRICT JSON):
{
  "summary": {
    "indexabilityScore": number,
    "robotsIssuesCount": number,
    "metaIssuesCount": number,
    "structuredDataIssuesCount": number
  },
  "issues": [
    {
      "category": "Robots | Sitemap | Meta Tags | Canonicals | URL Structure | Crawlability",
      "severity": "Critical | High | Medium | Low",
      "issue": "Specific indexing or crawlability problem",
      "url": "Specific URL where this issue was found",
      "evidence": "Technical data supporting this indexing issue",
      "impact": "Effect on search engine discovery and rankings"
    }
  ],
  "recommendations": [
    {
      "priority": "Critical | High | Medium | Low",
      "recommendation": "Specific indexing optimization action",
      "expectedBenefit": "Improvement in search engine crawling and indexing",
      "implementationHint": "Technical guidance for indexing optimization"
    }
  ]
}

INPUT INDEXING DATA:
${JSON.stringify(seoJson)}
`;
  const result = await model.generateContent(prompt);
  return safeJsonParse(result.response.text());
}

export async function generateDomainAuthorityAudit(seoJson: object): Promise<any> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { temperature: 0, responseMimeType: "application/json" } });
  const prompt = `
You are a Domain Authority Specialist and Link Building Strategist with expertise in trust signals, backlink analysis, and domain reputation management.

OBJECTIVE:
Analyze the domain authority metrics to assess website trustworthiness, identify authority-building opportunities, and develop strategies for improving domain credibility and search engine trust signals.

SCOPE (DOMAIN AUTHORITY AREAS):
- Domain age, history, and reputation assessment
- Backlink profile quality and diversity analysis
- Trust signals and E-A-T (Expertise, Authoritativeness, Trustworthiness) factors
- Social signals and brand mention analysis
- Technical trust indicators (SSL, security, uptime)
- Content quality and expertise demonstration
- Citation flow and trust flow metrics
- Spam score and toxic link identification
- Competitive authority benchmarking

ANALYSIS REQUIREMENTS:
- Evaluate current domain authority against industry benchmarks
- Identify trust signal gaps affecting search engine confidence
- Assess backlink quality and potential toxic link risks
- Analyze content authority and expertise indicators
- Consider brand reputation and online presence strength
- Review technical factors contributing to domain trust
- CRITICAL: Extract URLs from the input data:
  * Use the domain URL that was analyzed for authority
  * Look for URL references in the domain authority results
  * For domain-wide issues, use the main domain URL

OUTPUT SCHEMA (STRICT JSON):
{
  "summary": {
    "domainAuthorityScore": number,
    "backlinksQuality": "Excellent | Good | Average | Poor",
    "trustSignals": number,
    "authorityIssuesCount": number
  },
  "issues": [
    {
      "category": "Backlinks | Trust Signals | Content Authority | Technical Trust | Brand Reputation",
      "severity": "Critical | High | Medium | Low",
      "issue": "Specific domain authority or trust issue",
      "url": "Specific URL where this issue was found",
      "evidence": "Authority metrics and trust signal data",
      "impact": "Effect on search engine trust and ranking potential"
    }
  ],
  "recommendations": [
    {
      "priority": "Critical | High | Medium | Low",
      "recommendation": "Specific authority-building or trust improvement action",
      "expectedBenefit": "Projected improvement in domain authority and trust",
      "implementationHint": "Strategic guidance for authority building"
    }
  ]
}

INPUT DOMAIN AUTHORITY DATA:
${JSON.stringify(seoJson)}
`;
  const result = await model.generateContent(prompt);
  return safeJsonParse(result.response.text());
}

export async function generateTechFrameworksAudit(seoJson: object): Promise<any> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { temperature: 0, responseMimeType: "application/json" } });
  const prompt = `
You are a Frontend Architecture Specialist and Performance Engineer with expertise in JavaScript frameworks, SEO implications of modern web technologies, and technical stack optimization.

OBJECTIVE:
Analyze the detected technology stack to identify performance bottlenecks, SEO compatibility issues, and optimization opportunities related to the website's technical implementation and framework choices.

SCOPE (TECHNOLOGY STACK AREAS):
- JavaScript framework detection and SEO implications (React, Vue, Angular)
- Client-side rendering vs server-side rendering impact on SEO
- Third-party library performance and security assessment
- CSS framework efficiency and loading optimization
- Build tool configuration and asset optimization
- Progressive Web App capabilities and implementation
- API architecture and data fetching strategies
- Browser compatibility and cross-platform performance
- Security vulnerabilities in detected technologies

ANALYSIS REQUIREMENTS:
- Evaluate framework choices impact on search engine crawlability
- Assess performance implications of technology stack decisions
- Identify security vulnerabilities in detected libraries and frameworks
- Analyze rendering strategies for SEO optimization
- Consider mobile performance and Core Web Vitals impact
- Review modern web standards compliance and best practices
- CRITICAL: Extract URLs from the input data:
  * Use the URL that was analyzed for technology stack
  * Look for URL references in the tech framework detection results
  * For framework-specific issues, use the main analyzed page URL

OUTPUT SCHEMA (STRICT JSON):
{
  "summary": {
    "techStackScore": number,
    "performanceImpact": "Positive | Neutral | Negative",
    "securityIssuesCount": number,
    "compatibilityIssuesCount": number
  },
  "issues": [
    {
      "category": "Performance | Security | SEO | Compatibility | Best Practices",
      "severity": "Critical | High | Medium | Low",
      "issue": "Specific technology stack or framework issue",
      "url": "Specific URL where this issue was found",
      "evidence": "Technology detection data and performance metrics",
      "impact": "Effect on performance, SEO, or user experience"
    }
  ],
  "recommendations": [
    {
      "priority": "Critical | High | Medium | Low",
      "recommendation": "Specific technology optimization or upgrade action",
      "expectedBenefit": "Projected improvement in performance or SEO",
      "implementationHint": "Technical guidance for framework optimization"
    }
  ]
}

INPUT TECHNOLOGY STACK DATA:
${JSON.stringify(seoJson)}
`;
  const result = await model.generateContent(prompt);
  return safeJsonParse(result.response.text());
}

export async function generateIntegratedAudit(seoJson: object): Promise<any> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { temperature: 0, responseMimeType: "application/json" } });
  const prompt = `
You are an Enterprise SEO Consultant and Digital Strategy Director with expertise in holistic website optimization, cross-functional SEO integration, and business impact analysis.

OBJECTIVE:
Analyze the integrated SEO data to provide strategic recommendations that align technical optimization with business objectives, considering the interconnected nature of SEO factors and their cumulative impact on organic performance.

SCOPE (INTEGRATED SEO AREAS):
- Cross-functional SEO factor analysis and interdependency assessment
- Business impact prioritization and ROI-focused optimization
- Technical SEO integration with content and user experience strategies
- Multi-channel digital marketing alignment and SEO synergies
- Enterprise-level SEO governance and implementation frameworks
- Competitive advantage identification through integrated optimization
- Risk assessment and mitigation strategies for SEO changes
- Performance measurement and KPI alignment with business goals
- Scalable SEO processes and workflow optimization

ANALYSIS REQUIREMENTS:
- Evaluate SEO factors holistically rather than in isolation
- Prioritize recommendations based on business impact and resource requirements
- Consider technical constraints and implementation feasibility
- Assess risk-reward ratios for proposed optimization strategies
- Align SEO improvements with broader digital marketing objectives
- Identify quick wins and long-term strategic opportunities
- CRITICAL: Extract URLs from the input data:
  * Use 'url' field from the integrated analysis results
  * Look for 'data.url' or similar URL properties
  * For strategic issues, use the main analyzed domain URL

OUTPUT SCHEMA (STRICT JSON):
{
  "summary": {
    "integratedScore": number,
    "criticalIssuesCount": number,
    "optimizationOpportunities": number,
    "quickWinsAvailable": boolean
  },
  "issues": [
    {
      "category": "Strategic | Technical | Content | Performance | User Experience | Business Impact",
      "severity": "Critical | High | Medium | Low",
      "issue": "Integrated SEO challenge affecting multiple areas",
      "url": "Specific URL where this issue was found",
      "evidence": "Cross-functional data supporting this strategic issue",
      "impact": "Business and organic performance implications"
    }
  ],
  "recommendations": [
    {
      "priority": "Critical | High | Medium | Low",
      "recommendation": "Strategic SEO action with cross-functional benefits",
      "expectedBenefit": "Projected business and SEO performance improvement",
      "implementationHint": "Strategic guidance for integrated SEO optimization"
    }
  ]
}

INPUT INTEGRATED SEO DATA:
${JSON.stringify(seoJson)}
`;
  const result = await model.generateContent(prompt);
  return safeJsonParse(result.response.text());
}

export async function generateSiteWideAudit(seoJson: object): Promise<any> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { temperature: 0, responseMimeType: "application/json" } });
  const prompt = `
You are a Site Architecture Specialist and Large-Scale SEO Auditor with expertise in website crawling, information architecture, and enterprise-level SEO optimization.

OBJECTIVE:
Analyze the site-wide crawling data to identify structural issues, content gaps, and architectural problems that affect overall website performance, user experience, and search engine optimization at scale.

SCOPE (SITE-WIDE ANALYSIS AREAS):
- Website architecture and information hierarchy assessment
- Internal linking structure and PageRank distribution analysis
- Content inventory and gap identification across site sections
- URL structure consistency and SEO-friendly pattern evaluation
- Duplicate content detection and canonicalization issues
- Site navigation and user journey optimization
- Page depth analysis and crawl efficiency assessment
- Content quality distribution and thin content identification
- Technical consistency across different site sections

ANALYSIS REQUIREMENTS:
- Evaluate site architecture efficiency for both users and search engines
- Identify content strategy gaps and optimization opportunities
- Assess internal linking effectiveness for SEO value distribution
- Analyze crawl patterns and potential crawl budget waste
- Consider scalability issues and maintenance requirements
- Review content organization and topical authority development
- CRITICAL: Extract URLs from the input data:
  * Use 'url' field from individual page objects in the pages array
  * Look for 'pagePerformanceAndSiteWide.pages[].url' for specific page URLs
  * Use the main domain URL for site-wide architectural issues

OUTPUT SCHEMA (STRICT JSON):
{
  "summary": {
    "siteHealthScore": number,
    "crawlIssuesCount": number,
    "contentIssuesCount": number,
    "structuralIssuesCount": number
  },
  "issues": [
    {
      "category": "Architecture | Content | Navigation | Internal Linking | URL Structure | Crawlability",
      "severity": "Critical | High | Medium | Low",
      "issue": "Site-wide structural or content issue",
      "url": "Specific URL where this issue was found",
      "evidence": "Crawling data and site analysis supporting this finding",
      "impact": "Effect on overall site performance and user experience"
    }
  ],
  "recommendations": [
    {
      "priority": "Critical | High | Medium | Low",
      "recommendation": "Site-wide optimization or restructuring action",
      "expectedBenefit": "Projected improvement in site performance and SEO",
      "implementationHint": "Strategic guidance for site-wide optimization"
    }
  ]
}

INPUT SITE-WIDE CRAWL DATA:
${JSON.stringify(seoJson)}
`;
  const result = await model.generateContent(prompt);
  return safeJsonParse(result.response.text());
}

export async function generateKeywordRankingAudit(seoJson: object): Promise<any> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { temperature: 0, responseMimeType: "application/json" } });
  const prompt = `
You are a Keyword Research Strategist and SERP Analysis Expert with expertise in search intent optimization, competitive analysis, and ranking factor assessment.

OBJECTIVE:
Analyze the keyword ranking data to identify optimization opportunities, competitive gaps, and strategic keyword targeting improvements that will enhance search visibility and organic traffic growth.

SCOPE (KEYWORD RANKING AREAS):
- Current keyword position analysis and ranking trends
- Search intent alignment and keyword relevance assessment
- Competitive positioning and market opportunity identification
- Long-tail keyword expansion and semantic keyword clustering
- Commercial intent keywords and conversion potential evaluation
- Local search optimization and geo-targeted keyword performance
- Seasonal keyword trends and search volume fluctuations
- SERP feature opportunities (featured snippets, local pack, etc.)

ANALYSIS REQUIREMENTS:
- Evaluate current keyword performance against business objectives
- Identify high-opportunity keywords with ranking potential
- Assess keyword difficulty and competitive landscape
- Analyze search intent match with current content strategy
- Consider user journey stages and conversion funnel alignment
- Review keyword cannibalization and content optimization needs
- CRITICAL: Extract URLs from the input data:
  * Look for 'url' field in the main analysis object
  * For keyword-specific issues, use the URL being analyzed
  * Check for any page-specific data that includes URL references

OUTPUT SCHEMA (STRICT JSON):
{
  "summary": {
    "rankingScore": number,
    "keywordOpportunities": number,
    "competitorGaps": number,
    "rankingIssuesCount": number
  },
  "issues": [
    {
      "category": "Rankings | Intent | Competition | Content | Technical | Local",
      "severity": "Critical | High | Medium | Low",
      "issue": "Specific keyword ranking or optimization problem",
      "url": "Specific URL where this issue was found",
      "evidence": "Ranking data and keyword analysis supporting this finding",
      "impact": "Effect on organic traffic and business conversions"
    }
  ],
  "recommendations": [
    {
      "priority": "Critical | High | Medium | Low",
      "recommendation": "Specific keyword optimization or content strategy action",
      "expectedBenefit": "Projected improvement in keyword rankings and traffic",
      "implementationHint": "Strategic guidance for keyword optimization"
    }
  ]
}

INPUT KEYWORD RANKING DATA:
${JSON.stringify(seoJson)}
`;
  const result = await model.generateContent(prompt);
  return safeJsonParse(result.response.text());
}

export async function generateSitemapAudit(seoJson: object): Promise<any> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { temperature: 0, responseMimeType: "application/json" } });
  const prompt = `
You are a Technical SEO Specialist and XML Sitemap Expert with deep knowledge of search engine crawling protocols, sitemap optimization, and indexing efficiency.

OBJECTIVE:
Analyze the sitemap data to identify structural issues, indexing inefficiencies, and optimization opportunities that affect search engine discovery and crawling of website content.

SCOPE (SITEMAP ANALYSIS AREAS):
- XML sitemap structure and protocol compliance assessment
- URL inclusion accuracy and completeness evaluation
- Priority and changefreq attribute optimization analysis
- Sitemap file size and URL count efficiency review
- Last modification date accuracy and freshness indicators
- Sitemap index organization for large websites
- Search engine submission status and accessibility
- Robots.txt sitemap directive compliance
- Mobile sitemap and AMP page inclusion assessment

ANALYSIS REQUIREMENTS:
- Evaluate sitemap completeness against actual site content
- Assess sitemap organization efficiency for search engine crawling
- Identify missing or incorrectly included URLs in sitemaps
- Analyze priority and frequency settings for optimization
- Consider crawl budget implications of sitemap structure
- Review technical compliance with sitemap protocol standards
- CRITICAL: Extract URLs from the input data:
  * Use the sitemap.xml URL for sitemap-specific issues
  * Look for 'url' field in the sitemap analysis results
  * For URL-specific issues, use the affected page URLs from sitemap

OUTPUT SCHEMA (STRICT JSON):
{
  "summary": {
    "sitemapHealthScore": number,
    "urlIssuesCount": number,
    "structureIssuesCount": number,
    "indexingIssuesCount": number
  },
  "issues": [
    {
      "category": "Structure | URLs | Indexing | Protocol | Accessibility | Organization",
      "severity": "Critical | High | Medium | Low",
      "issue": "Specific sitemap configuration or content issue",
      "url": "Specific URL where this issue was found",
      "evidence": "Sitemap analysis data supporting this finding",
      "impact": "Effect on search engine crawling and indexing efficiency"
    }
  ],
  "recommendations": [
    {
      "priority": "Critical | High | Medium | Low",
      "recommendation": "Specific sitemap optimization or configuration action",
      "expectedBenefit": "Projected improvement in crawling and indexing",
      "implementationHint": "Technical guidance for sitemap optimization"
    }
  ]
}

INPUT SITEMAP DATA:
${JSON.stringify(seoJson)}
`;
  const result = await model.generateContent(prompt);
  return safeJsonParse(result.response.text());
}
export async function generateUniversalSeoIssues(seoJson: object, analysisType: string = 'general'): Promise<any> {
  const maxRetries = 3;
  const retryDelay = 2000;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash", 
        generationConfig: { 
          temperature: 0.1
        } 
      });
      
      const sanitizedData = sanitizeDataForGemini(seoJson);
      const prompt = `Analyze SEO data and return issues in this exact JSON format:
[
  {
    "category": "Structure | URLs | Indexing | Protocol | Accessibility | Organization | Performance | Content | Security | Mobile | Technical",
    "severity": "Critical | High | Medium | Low",
    "issue": "Specific issue description",
    "url": "Specific URL where this issue was found",
    "evidence": "Data supporting this finding",
    "impact": "Effect on SEO and user experience"
  }
]

Data: ${JSON.stringify(sanitizedData).substring(0, 3000)}`;
      
      const result = await model.generateContent(prompt);
      const parsed = safeJsonParse(result.response.text());
      
      return Array.isArray(parsed) ? parsed : [];
    } catch (error: any) {
      console.error(`Gemini attempt ${attempt} failed:`, error.message);
      
      if (error.message?.includes('503') && attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        continue;
      }
      
      return [];
    }
  }
  
  return [];
}