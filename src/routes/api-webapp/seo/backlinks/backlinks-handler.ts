/**
 * ⚠️ ⚠️ ⚠️ WARNING: DEMO/SIMULATED DATA ⚠️ ⚠️ ⚠️
 * 
 * This backlinks module returns SIMULATED data for demonstration purposes.
 * DO NOT use in production without integrating a real backlink API.
 * 
 * For production, integrate with:
 * - Ahrefs API (recommended)
 * - Moz API
 * - SEMrush API
 * - Majestic API
 * 
 * Simulated data is generated deterministically based on domain hash
 * to provide consistent demo results.
 */

// Removed unused axios import - backlinks uses simulated data
import axios from 'axios'; // Re-added for URL verification

interface BacklinkAnalysis {
  success: boolean;
  isDemoData: boolean; // ⚠️ Flag indicating this is simulated data
  dataSource: string;  // Where the data comes from
  url: string;
  timestamp: string;
  summary: {
    citationFlow: number;
    trustFlow: number;
    totalBacklinks: number;
    referringDomains: number;
    doFollowLinks: string;
    noFollowLinks: string;
  };
  linkQuality: {
    domainAuthority: number;
    spamScore: string;
    linkRelevance: string;
  };
  linkTypeDistribution: {
    textLinks: string;
    imageLinks: string;
    redirectLinks: string;
  };
  linkGrowth: {
    newLinks: number;
    lostLinks: number;
    netGrowth: number;
    last30Days: any[];
  };
  tldDistribution: {
    com: string;
    org: string;
    net: string;
    other: string;
  };
  topReferringDomains: string[];
  topAnchorTexts: Array<{ text: string; count: number }>;
  toxicLinks: string[];
  note: string;
}

/**
 * Analyze backlinks for a given URL
 * 
 * ⚠️ ⚠️ ⚠️ CRITICAL WARNING ⚠️ ⚠️ ⚠️
 * 
 * This function returns SIMULATED/DEMO DATA ONLY.
 * 
 * Status: DEMO MODE
 * Production Ready: NO
 * Real Data: NO
 * 
 * Before using in production:
 * 1. Hide this endpoint from production API
 * 2. OR integrate with real backlink service (Ahrefs, Moz, SEMrush)
 * 3. OR clearly mark as "Demo" in UI
 * 
 * Real backlink APIs:
 * - Ahrefs API: https://ahrefs.com/api (Recommended)
 * - Moz API: https://moz.com/products/api
 * - SEMrush API: https://www.semrush.com/api/
 * - Majestic API: https://majestic.com/reports/api-documentation
 * 
 * @param url - URL to analyze (only used for demo data generation)
 * @returns BacklinkAnalysis - SIMULATED data marked with isDemoData: true
 */
export async function analyzeBacklinksHandler(url: string): Promise<BacklinkAnalysis> {
  const timestamp = new Date().toISOString();
  
  try {
    // Verify URL is accessible
    await axios.head(url, { timeout: 10000 }).catch(() => {
      // Continue even if head request fails
    });

    // Generate realistic simulated data based on domain
    const domain = new URL(url).hostname;
    const domainHash = hashCode(domain);
    
    // Use hash to generate consistent but varied numbers for the same domain
    const totalBacklinks = 800 + (Math.abs(domainHash) % 1500);
    const referringDomains = 150 + (Math.abs(domainHash) % 200);
    const citationFlow = 60 + (Math.abs(domainHash) % 40);
    const trustFlow = 55 + (Math.abs(domainHash) % 35);
    const domainAuthority = 30 + (Math.abs(domainHash) % 70);
    const newLinks = 600 + (Math.abs(domainHash) % 400);
    const lostLinks = 150 + (Math.abs(domainHash) % 200);

    // Generate last 30 days trend data
    const last30Days = generateLast30DaysTrend(domainHash);

    // Generate top referring domains
    const topReferringDomains = generateTopReferringDomains(domain, domainHash);

    // Generate top anchor texts
    const topAnchorTexts = generateTopAnchorTexts(domain, domainHash);

    // Generate toxic links (few examples)
    const toxicLinks = generateToxicLinks(domainHash);

    const result: BacklinkAnalysis = {
      success: true,
      isDemoData: true, // ⚠️ This is simulated data
      dataSource: 'SIMULATED - Not real backlink data. Integrate Ahrefs/Moz/SEMrush API for production.',
      url,
      timestamp,
      summary: {
        citationFlow,
        trustFlow,
        totalBacklinks,
        referringDomains,
        doFollowLinks: '78%',
        noFollowLinks: '22%'
      },
      linkQuality: {
        domainAuthority,
        spamScore: '3%',
        linkRelevance: '82%'
      },
      linkTypeDistribution: {
        textLinks: '68%',
        imageLinks: '22%',
        redirectLinks: '10%'
      },
      linkGrowth: {
        newLinks,
        lostLinks,
        netGrowth: newLinks - lostLinks,
        last30Days
      },
      tldDistribution: {
        com: '58%',
        org: '18%',
        net: '12%',
        other: '12%'
      },
      topReferringDomains,
      topAnchorTexts,
      toxicLinks,
      note: '⚠️ DEMO DATA ONLY - This is simulated backlink data for demonstration purposes. Integrate with Ahrefs, Moz, SEMrush, or Majestic API for real backlink analysis. DO NOT use in production.'
    };

    return result;

  } catch (error: any) {
    console.error('Backlink analysis error:', error);
    throw new Error(`Failed to analyze backlinks: ${error.message}`);
  }
}

// Helper: Generate hash code from string
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

// Helper: Generate last 30 days trend
function generateLast30DaysTrend(seed: number): any[] {
  const trend = [];
  const today = new Date();
  
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    const dayHash = seed + i;
    const newLinks = 20 + (Math.abs(dayHash * 13) % 30);
    const lostLinks = 5 + (Math.abs(dayHash * 7) % 15);
    
    trend.push({
      date: dateStr,
      newLinks,
      lostLinks,
      netChange: newLinks - lostLinks
    });
  }
  
  return trend;
}

// Helper: Generate top referring domains
function generateTopReferringDomains(domain: string, seed: number): string[] {
  const commonDomains = [
    'medium.com/@example',
    'dev.to/developers/example',
    'github.com/repos/example',
    'stackoverflow.com/questions/example',
    'reddit.com/r/example',
    'docs.google.com/document/d/example',
    'linkedin.com/in/example',
    'twitter.com/example/status',
    'facebook.com/example/posts',
    'youtube.com/watch?v=example'
  ];
  
  const customDomains = [
    `blog.${domain.split('.')[0]}.com`,
    `forum.${domain.split('.')[0]}.io`,
    `docs.${domain.split('.')[0]}.org`
  ];
  
  const allDomains = [...customDomains, ...commonDomains];
  const selected: string[] = [];
  
  for (let i = 0; i < 10; i++) {
    const index = Math.abs((seed + i * 17) % allDomains.length);
    if (!selected.includes(allDomains[index])) {
      selected.push(allDomains[index]);
    }
  }
  
  return selected.slice(0, 10);
}

// Helper: Generate top anchor texts
function generateTopAnchorTexts(domain: string, seed: number): Array<{ text: string; count: number }> {
  const domainName = domain.split('.')[0];
  
  const anchorTexts = [
    { text: domainName, count: 180 + (Math.abs(seed) % 50) },
    { text: 'click here', count: 95 + (Math.abs(seed * 2) % 30) },
    { text: `visit ${domainName}`, count: 72 + (Math.abs(seed * 3) % 25) },
    { text: `${domainName} website`, count: 58 + (Math.abs(seed * 4) % 20) },
    { text: 'learn more', count: 45 + (Math.abs(seed * 5) % 15) },
    { text: 'official site', count: 38 + (Math.abs(seed * 6) % 12) },
    { text: domain, count: 32 + (Math.abs(seed * 7) % 10) },
    { text: 'read more', count: 28 + (Math.abs(seed * 8) % 8) },
    { text: `${domainName} review`, count: 24 + (Math.abs(seed * 9) % 6) },
    { text: 'homepage', count: 19 + (Math.abs(seed * 10) % 5) }
  ];
  
  return anchorTexts;
}

// Helper: Generate toxic links examples
function generateToxicLinks(seed: number): string[] {
  const toxicExamples = [
    'https://spammy-site.ru/example',
    'https://low-quality-directory.info/links',
    'https://suspicious-domain.xyz/backlinks'
  ];
  
  // Return 0-2 toxic links based on hash
  const count = Math.abs(seed) % 3;
  return toxicExamples.slice(0, count);
}

/**
 * Integration Guide for Production:
 * 
 * 1. Ahrefs API Integration:
 *    - Endpoint: https://api.ahrefs.com/v2/backlinks
 *    - Requires API token
 *    - Cost: Paid subscription
 * 
 * 2. Moz API Integration:
 *    - Endpoint: https://lsapi.seomoz.com/v2/url_metrics
 *    - Requires Access ID and Secret Key
 *    - Cost: Paid subscription
 * 
 * 3. SEMrush API Integration:
 *    - Endpoint: https://api.semrush.com/
 *    - Requires API key
 *    - Cost: Paid subscription
 * 
 * 4. Majestic API Integration:
 *    - Endpoint: https://developer.majestic.com/api
 *    - Requires API key
 *    - Cost: Paid subscription
 * 
 * Example Ahrefs Integration:
 * ```typescript
 * import axios from 'axios';
 * 
 * async function getAhrefsBacklinks(url: string) {
 *   const response = await axios.get('https://api.ahrefs.com/v2/backlinks', {
 *     params: {
 *       target: url,
 *       mode: 'domain'
 *     },
 *     headers: {
 *       'Authorization': `Bearer ${process.env.AHREFS_API_TOKEN}`
 *     }
 *   });
 *   return response.data;
 * }
 * ```
 */
