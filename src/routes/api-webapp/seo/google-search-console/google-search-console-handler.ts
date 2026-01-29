import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { getToken } from '../../../../services/token-store.service';
import dotenv from 'dotenv';

dotenv.config();

interface GSCAnalysisOptions {
  startDate?: string;
  endDate?: string;
  dimensions?: string[];
  rowLimit?: number;
}

interface GSCAnalysisResult {
  success: boolean;
  url: string;
  timestamp: string;
  processingTime: string;
  data?: GSCReport;
  error?: string;
}

interface GSCReport {
  siteUrl: string;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  searchAnalytics: {
    totalClicks: number;
    totalImpressions: number;
    averageCTR: number;
    averagePosition: number;
    topQueries: QueryData[];
    topPages: PageData[];
    topCountries: CountryData[];
    topDevices: DeviceData[];
  };
  sitemaps: SitemapData[];
  indexStatus: {
    totalIndexed: number;
    totalSubmitted: number;
    indexingRate: number;
    errors: number;
    warnings: number;
  };
  issues: GSCIssue[];
}

interface QueryData {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface PageData {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface CountryData {
  country: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface DeviceData {
  device: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface SitemapData {
  path: string;
  lastSubmitted: string;
  isPending: boolean;
  isSitemapIndex: boolean;
  type: string;
  lastDownloaded: string;
  warnings: number;
  errors: number;
}

interface GSCIssue {
  issueid: string;
  name: string;
  priority: 'High' | 'Medium' | 'Low';
  affected_url: string;
}

class GoogleSearchConsoleClient {
  private oauth2Client: OAuth2Client;
  private searchConsole: any;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    this.searchConsole = google.searchconsole({
      version: 'v1',
      auth: this.oauth2Client
    });
  }

  setCredentials(tokens: any) {
    this.oauth2Client.setCredentials(tokens);
  }

  async getSearchAnalytics(siteUrl: string, options: {
    startDate: string;
    endDate: string;
    dimensions?: string[];
    rowLimit?: number;
  }): Promise<any> {
    const { startDate, endDate, dimensions = ['query'], rowLimit = 1000 } = options;

    const response = await this.searchConsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions,
        rowLimit,
        startRow: 0
      }
    });

    return response.data;
  }

  async getSitemaps(siteUrl: string): Promise<SitemapData[]> {
    try {
      const response = await this.searchConsole.sitemaps.list({
        siteUrl
      });
      
      return (response.data.sitemap || []).map((sitemap: any) => ({
        path: sitemap.path,
        lastSubmitted: sitemap.lastSubmitted,
        isPending: sitemap.isPending || false,
        isSitemapIndex: sitemap.isSitemapIndex || false,
        type: sitemap.type || 'sitemap',
        lastDownloaded: sitemap.lastDownloaded,
        warnings: sitemap.warnings || 0,
        errors: sitemap.errors || 0
      }));
    } catch (error) {
      console.error('Error fetching sitemaps:', error);
      return [];
    }
  }

  async getSites(): Promise<string[]> {
    try {
      const response = await this.searchConsole.sites.list();
      return response.data.siteEntry?.map((site: any) => site.siteUrl) || [];
    } catch (error) {
      console.error('Error fetching sites:', error);
      return [];
    }
  }
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

async function analyzeSearchPerformance(
  client: GoogleSearchConsoleClient,
  siteUrl: string,
  startDate: string,
  endDate: string
): Promise<any> {
  // Get overall performance
  const overallData = await client.getSearchAnalytics(siteUrl, {
    startDate,
    endDate,
    dimensions: [],
    rowLimit: 1
  });

  // Get top queries
  const queryData = await client.getSearchAnalytics(siteUrl, {
    startDate,
    endDate,
    dimensions: ['query'],
    rowLimit: 100
  });

  // Get top pages
  const pageData = await client.getSearchAnalytics(siteUrl, {
    startDate,
    endDate,
    dimensions: ['page'],
    rowLimit: 100
  });

  // Get top countries
  const countryData = await client.getSearchAnalytics(siteUrl, {
    startDate,
    endDate,
    dimensions: ['country'],
    rowLimit: 50
  });

  // Get device breakdown
  const deviceData = await client.getSearchAnalytics(siteUrl, {
    startDate,
    endDate,
    dimensions: ['device'],
    rowLimit: 10
  });

  const overall = overallData.rows?.[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };

  return {
    totalClicks: overall.clicks || 0,
    totalImpressions: overall.impressions || 0,
    averageCTR: overall.ctr || 0,
    averagePosition: overall.position || 0,
    topQueries: (queryData.rows || []).map((row: any) => ({
      query: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position
    })),
    topPages: (pageData.rows || []).map((row: any) => ({
      page: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position
    })),
    topCountries: (countryData.rows || []).map((row: any) => ({
      country: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position
    })),
    topDevices: (deviceData.rows || []).map((row: any) => ({
      device: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position
    }))
  };
}

function generateGSCIssues(report: GSCReport): GSCIssue[] {
  const issues: GSCIssue[] = [];

  // Low CTR issues
  if (report.searchAnalytics.averageCTR < 0.02) {
    issues.push({
      issueid: `gsc_low_ctr_${Date.now()}`,
      name: `Low average CTR (${(report.searchAnalytics.averageCTR * 100).toFixed(2)}%)`,
      priority: 'High',
      affected_url: report.siteUrl
    });
  }

  // High average position issues
  if (report.searchAnalytics.averagePosition > 10) {
    issues.push({
      issueid: `gsc_high_position_${Date.now()}`,
      name: `High average position (${report.searchAnalytics.averagePosition.toFixed(1)})`,
      priority: 'Medium',
      affected_url: report.siteUrl
    });
  }

  // Low impressions
  if (report.searchAnalytics.totalImpressions < 100) {
    issues.push({
      issueid: `gsc_low_impressions_${Date.now()}`,
      name: `Low total impressions (${report.searchAnalytics.totalImpressions})`,
      priority: 'Medium',
      affected_url: report.siteUrl
    });
  }

  // Sitemap errors
  const sitemapErrors = report.sitemaps.reduce((sum, sitemap) => sum + sitemap.errors, 0);
  if (sitemapErrors > 0) {
    issues.push({
      issueid: `gsc_sitemap_errors_${Date.now()}`,
      name: `Sitemap errors detected (${sitemapErrors} errors)`,
      priority: 'High',
      affected_url: report.siteUrl
    });
  }

  // Low indexing rate
  if (report.indexStatus.indexingRate < 80) {
    issues.push({
      issueid: `gsc_low_indexing_${Date.now()}`,
      name: `Low indexing rate (${report.indexStatus.indexingRate}%)`,
      priority: 'High',
      affected_url: report.siteUrl
    });
  }

  return issues;
}

export async function analyzeGoogleSearchConsoleHandler(
  siteUrl: string,
  accountEmail: string,
  options: GSCAnalysisOptions = {}
): Promise<GSCAnalysisResult> {
  const startTime = Date.now();

  try {
    if (!siteUrl) {
      throw new Error('Site URL is required');
    }

    if (!accountEmail) {
      throw new Error('Account email is required');
    }

    console.log(`[${new Date().toISOString()}] GSC analysis for: ${siteUrl}`);

    // Get stored tokens
    const tokenRecord = await getToken('google', accountEmail);
    if (!tokenRecord || !tokenRecord.accessToken) {
      throw new Error('No valid Google tokens found. Please authenticate first.');
    }

    // Initialize client
    const client = new GoogleSearchConsoleClient();
    client.setCredentials({ 
      access_token: tokenRecord.accessToken,
      refresh_token: tokenRecord.refreshToken
    });

    // Set date range (default to last 30 days)
    const endDate = options.endDate || formatDate(new Date());
    const startDate = options.startDate || formatDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

    // Verify site access
    const sites = await client.getSites();
    if (!sites.includes(siteUrl)) {
      const setupInstructions = `
Site ${siteUrl} is not permitted. Please follow these steps to grant access:

 Step 1: Open Google Search Console
Go to: https://search.google.com/search-console
Sign in with the Google account that owns the website.

 Step 2: Select the Correct Property
From the top-left property selector, choose:
• Domain property (recommended), or
• URL-prefix property (e.g. https://example.com/)
⚠️ Make sure it matches the exact site you want to share.

 Step 3: Open Settings
In the left sidebar, scroll down and click Settings.

 Step 4: Users & Permissions
Click Users and permissions.

 Step 5: Add New User
Click Add user
Enter the email address: ${accountEmail}
Choose permission level:
 Full (to access all reports & data)
 Restricted access may block some APIs.

 Step 6: Save
Click Add.

That's it  Access is granted instantly.`;
      
      throw new Error(setupInstructions);
    }

    // Analyze search performance
    const searchAnalytics = await analyzeSearchPerformance(client, siteUrl, startDate, endDate);

    // Analyze sitemaps
    const sitemaps = await client.getSitemaps(siteUrl);

    // Calculate index status
    const indexStatus = {
      totalIndexed: searchAnalytics.topPages.length,
      totalSubmitted: searchAnalytics.topPages.length,
      indexingRate: searchAnalytics.topPages.length > 0 ? 100 : 0,
      errors: sitemaps.reduce((sum, sitemap) => sum + sitemap.errors, 0),
      warnings: sitemaps.reduce((sum, sitemap) => sum + sitemap.warnings, 0)
    };

    const report: GSCReport = {
      siteUrl,
      dateRange: { startDate, endDate },
      searchAnalytics,
      sitemaps,
      indexStatus,
      issues: []
    };

    // Generate issues
    const issues = generateGSCIssues(report);
    report.issues = issues;

    const processingTime = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] GSC analysis complete in ${processingTime}ms`);

    return {
      success: true,
      url: siteUrl,
      timestamp: new Date().toISOString(),
      processingTime: `${processingTime}ms`,
      data: report
    };

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] GSC analysis error after ${processingTime}ms:`, error.message);

    return {
      success: false,
      url: siteUrl,
      timestamp: new Date().toISOString(),
      processingTime: `${processingTime}ms`,
      error: error.message || 'Google Search Console analysis failed'
    };
  }
}

export async function generateGSCAuthUrl(): Promise<string> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const scopes = ['https://www.googleapis.com/auth/webmasters.readonly'];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
}

export async function exchangeGSCCodeForTokens(code: string): Promise<any> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

export async function listGSCSites(accountEmail: string): Promise<string[]> {
  const tokenRecord = await getToken('google', accountEmail);
  if (!tokenRecord || !tokenRecord.accessToken) {
    throw new Error('No valid Google tokens found');
  }

  const client = new GoogleSearchConsoleClient();
  client.setCredentials({ 
    access_token: tokenRecord.accessToken,
    refresh_token: tokenRecord.refreshToken
  });
  
  return await client.getSites();
}