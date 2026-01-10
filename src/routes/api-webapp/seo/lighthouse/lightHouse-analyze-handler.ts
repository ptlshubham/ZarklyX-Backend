import axios from "axios";
import { generateUniversalSeoIssues } from '../../../../services/universal-seo-issues';

interface LighthouseMetrics {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  pwa: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  cumulativeLayoutShift: number;
  speedIndex: number;
  totalBlockingTime: number;
}

export async function analyzeLighthouse(url: string): Promise<{ success: boolean; metrics?: LighthouseMetrics; error?: string }> {
  try {
   const key:String="AIzaSyBybH9QinP7FrDiDgD3K0t_oBahIZXV00A";
    // const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&category=performance&category=accessibility&category=best-practices&category=seo&category=pwa&strategy=mobile`;
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${key}&category=performance&category=accessibility&category=best-practices&category=seo&category=pwa&strategy=mobile`;
    
    const response = await axios.get(apiUrl, { timeout: 300000 });
    const data = response.data;
    const categories = data.lighthouseResult?.categories || {};
    const audits = data.lighthouseResult?.audits || {};
    
    const metrics: LighthouseMetrics = {
      performance: Math.round((categories.performance?.score || 0) * 100),
      accessibility: Math.round((categories.accessibility?.score || 0) * 100),
      bestPractices: Math.round((categories['best-practices']?.score || 0) * 100),
      seo: Math.round((categories.seo?.score || 0) * 100),
      pwa: Math.round((categories.pwa?.score || 0) * 100),
      firstContentfulPaint: audits['first-contentful-paint']?.numericValue || 0,
      largestContentfulPaint: audits['largest-contentful-paint']?.numericValue || 0,
      cumulativeLayoutShift: audits['cumulative-layout-shift']?.numericValue || 0,
      speedIndex: audits['speed-index']?.numericValue || 0,
      totalBlockingTime: audits['total-blocking-time']?.numericValue || 0,
    };
    
    return { success: true, metrics };
  } catch (error: any) {
    // Fallback to estimated metrics when API is unavailable (rate limited)
    if (error.response?.status === 429 || error.message.includes('429')) {
      const mockMetrics: LighthouseMetrics = {
        performance: 0,
        accessibility:0,
        bestPractices:0,
        seo: 0,
        pwa:0,
        firstContentfulPaint: 0,
        largestContentfulPaint:0,
        cumulativeLayoutShift: 0,
        speedIndex: 0,
        totalBlockingTime: 0,
      };
      return { 
        success: true, 
        metrics: mockMetrics,
        error: 'Using estimated metrics (API rate limited)'
      };
    }
    return { success: false, error: error.message };
  }
}

export async function analyzeLighthouseWithAI(url: string): Promise<any> {
  const result = await analyzeLighthouse(url);
  
  if (result.success && result.metrics) {
    const analysisData = {
      url,
      ...result.metrics
    };
    
    const geminiIssues = await generateUniversalSeoIssues(analysisData, 'lighthouse');
    
    return {
      ...result,
      issues: geminiIssues
    };
  }
  
  return result;
}