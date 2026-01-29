import { google } from 'googleapis';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { getToken } from '../../../../services/token-store.service';
import dotenv from 'dotenv';

dotenv.config();

interface GAAnalysisOptions {
  startDate?: string;
  endDate?: string;
  metrics?: string[];
  dimensions?: string[];
}

interface GAAnalysisResult {
  success: boolean;
  websiteUrl: string;
  timestamp: string;
  processingTime: string;
  data?: GAReport;
  error?: string;
}

interface GAReport {
  websiteUrl: string;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  overview: {
    totalUsers: number;
    totalSessions: number;
    totalPageviews: number;
    bounceRate: number;
    averageSessionDuration: number;
    conversions: number;
  };
  topPages: PageMetric[];
  topSources: SourceMetric[];
  topCountries: CountryMetric[];
  topDevices: DeviceMetric[];
  issues: GAIssue[];
}

interface PageMetric {
  page: string;
  pageviews: number;
  users: number;
  sessions: number;
}

interface SourceMetric {
  source: string;
  medium: string;
  users: number;
  sessions: number;
}

interface CountryMetric {
  country: string;
  users: number;
  sessions: number;
}

interface DeviceMetric {
  deviceCategory: string;
  users: number;
  sessions: number;
}

interface GAIssue {
  issueid: string;
  name: string;
  priority: 'High' | 'Medium' | 'Low';
  affected_url: string;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

async function createGA4Client(refreshToken: string): Promise<BetaAnalyticsDataClient> {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  auth.setCredentials({
    refresh_token: refreshToken,
  });

  // Force access token refresh
  await auth.getAccessToken();

  return new BetaAnalyticsDataClient({
    authClient: auth,
  });
}

async function analyzeOverviewMetrics(
  client: BetaAnalyticsDataClient,
  startDate: string,
  endDate: string
): Promise<any> {
  const [response] = await client.runReport({
    property: `properties/498347631`,
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: 'totalUsers' },
      { name: 'sessions' },
      { name: 'screenPageViews' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
      { name: 'conversions' }
    ]
  });

  const row = response.rows?.[0];
  if (!row) {
    return {
      totalUsers: 0,
      totalSessions: 0,
      totalPageviews: 0,
      bounceRate: 0,
      averageSessionDuration: 0,
      conversions: 0
    };
  }

  return {
    totalUsers: parseInt(row.metricValues?.[0]?.value || '0'),
    totalSessions: parseInt(row.metricValues?.[1]?.value || '0'),
    totalPageviews: parseInt(row.metricValues?.[2]?.value || '0'),
    bounceRate: parseFloat(row.metricValues?.[3]?.value || '0'),
    averageSessionDuration: parseFloat(row.metricValues?.[4]?.value || '0'),
    conversions: parseInt(row.metricValues?.[5]?.value || '0')
  };
}

async function analyzeTopPages(
  client: BetaAnalyticsDataClient,
  startDate: string,
  endDate: string
): Promise<PageMetric[]> {
  const [response] = await client.runReport({
    property: `properties/498347631`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'fullPageUrl' }],
    metrics: [
      { name: 'screenPageViews' },
      { name: 'totalUsers' },
      { name: 'sessions' }
    ]
  });

  return (response.rows || []).map((row: any) => ({
    page: row.dimensionValues?.[0]?.value || '',
    pageviews: parseInt(row.metricValues?.[0]?.value || '0'),
    users: parseInt(row.metricValues?.[1]?.value || '0'),
    sessions: parseInt(row.metricValues?.[2]?.value || '0')
  }));
}

async function analyzeTopSources(
  client: BetaAnalyticsDataClient,
  startDate: string,
  endDate: string
): Promise<SourceMetric[]> {
  const [response] = await client.runReport({
    property: `properties/498347631`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'source' }, { name: 'medium' }],
    metrics: [
      { name: 'totalUsers' },
      { name: 'sessions' }
    ]
  });

  return (response.rows || []).map((row: any) => ({
    source: row.dimensionValues?.[0]?.value || '',
    medium: row.dimensionValues?.[1]?.value || '',
    users: parseInt(row.metricValues?.[0]?.value || '0'),
    sessions: parseInt(row.metricValues?.[1]?.value || '0')
  }));
}

async function analyzeTopCountries(
  client: BetaAnalyticsDataClient,
  startDate: string,
  endDate: string
): Promise<CountryMetric[]> {
  const [response] = await client.runReport({
    property: `properties/498347631`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'country' }],
    metrics: [
      { name: 'totalUsers' },
      { name: 'sessions' }
    ]
  });

  return (response.rows || []).map((row: any) => ({
    country: row.dimensionValues?.[0]?.value || '',
    users: parseInt(row.metricValues?.[0]?.value || '0'),
    sessions: parseInt(row.metricValues?.[1]?.value || '0')
  }));
}

async function analyzeTopDevices(
  client: BetaAnalyticsDataClient,
  startDate: string,
  endDate: string
): Promise<DeviceMetric[]> {
  const [response] = await client.runReport({
    property: `properties/498347631`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'deviceCategory' }],
    metrics: [
      { name: 'totalUsers' },
      { name: 'sessions' }
    ]
  });

  return (response.rows || []).map((row: any) => ({
    deviceCategory: row.dimensionValues?.[0]?.value || '',
    users: parseInt(row.metricValues?.[0]?.value || '0'),
    sessions: parseInt(row.metricValues?.[1]?.value || '0')
  }));
}

function generateGAIssues(report: GAReport): GAIssue[] {
  const issues: GAIssue[] = [];

  // High bounce rate
  if (report.overview.bounceRate > 0.7) {
    issues.push({
      issueid: `ga_high_bounce_${Date.now()}`,
      name: `High bounce rate (${(report.overview.bounceRate * 100).toFixed(1)}%)`,
      priority: 'High',
      affected_url: report.websiteUrl
    });
  }

  // Low session duration
  if (report.overview.averageSessionDuration < 60) {
    issues.push({
      issueid: `ga_low_session_${Date.now()}`,
      name: `Low average session duration (${report.overview.averageSessionDuration.toFixed(1)}s)`,
      priority: 'Medium',
      affected_url: report.websiteUrl
    });
  }

  // Low user engagement
  if (report.overview.totalUsers < 100) {
    issues.push({
      issueid: `ga_low_users_${Date.now()}`,
      name: `Low total users (${report.overview.totalUsers})`,
      priority: 'Medium',
      affected_url: report.websiteUrl
    });
  }

  // No conversions
  if (report.overview.conversions === 0) {
    issues.push({
      issueid: `ga_no_conversions_${Date.now()}`,
      name: 'No conversions tracked',
      priority: 'High',
      affected_url: report.websiteUrl
    });
  }

  return issues;
}

export async function analyzeGoogleAnalyticsHandler(
  websiteUrl: string,
  accountEmail: string,
  options: GAAnalysisOptions = {}
): Promise<GAAnalysisResult> {
  const startTime = Date.now();

  try {
    if (!websiteUrl) {
      throw new Error('Website URL is required');
    }

    if (!accountEmail) {
      throw new Error('Account email is required');
    }

    console.log(`[${new Date().toISOString()}] GA analysis for website: ${websiteUrl}`);

    // Get stored tokens
    const tokenRecord = await getToken('google', accountEmail);
    if (!tokenRecord || !tokenRecord.refreshToken) {
      throw new Error('No valid Google refresh token found. Please authenticate first.');
    }

    // Create GA4 client
    const client = await createGA4Client(tokenRecord.refreshToken);

    // Set date range (default to last 30 days)
    const endDate = options.endDate || formatDate(new Date());
    const startDate = options.startDate || formatDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

    // Analyze overview metrics
    const overview = await analyzeOverviewMetrics(client, startDate, endDate);

    // Analyze top pages
    const topPages = await analyzeTopPages(client, startDate, endDate);

    // Analyze top sources
    const topSources = await analyzeTopSources(client, startDate, endDate);

    // Analyze top countries
    const topCountries = await analyzeTopCountries(client, startDate, endDate);

    // Analyze top devices
    const topDevices = await analyzeTopDevices(client, startDate, endDate);

    const report: GAReport = {
      websiteUrl,
      dateRange: { startDate, endDate },
      overview,
      topPages,
      topSources,
      topCountries,
      topDevices,
      issues: []
    };

    // Generate issues
    const issues = generateGAIssues(report);
    report.issues = issues;

    const processingTime = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] GA analysis complete in ${processingTime}ms`);

    return {
      success: true,
      websiteUrl,
      timestamp: new Date().toISOString(),
      processingTime: `${processingTime}ms`,
      data: report
    };

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] GA analysis error after ${processingTime}ms:`, error.message);

    return {
      success: false,
      websiteUrl,
      timestamp: new Date().toISOString(),
      processingTime: `${processingTime}ms`,
      error: error.message || 'Google Analytics analysis failed'
    };
  }
}

export async function generateGAAuthUrl(): Promise<string> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const scopes = ['https://www.googleapis.com/auth/analytics.readonly'];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
}

export async function exchangeGACodeForTokens(code: string): Promise<any> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}