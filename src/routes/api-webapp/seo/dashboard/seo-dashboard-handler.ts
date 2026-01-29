import axios from 'axios';
import * as cheerio from 'cheerio';

interface SEOScore {
  score: number;
  grade: string;
}

interface CoreWebVitals {
  lcp: number;
  fid: number;
  cls: number;
}

interface SEODashboardResponse {
  overallScore: SEOScore;
  technicalSeoScore: SEOScore;
  onPageSeoScore: SEOScore;
  technicalArchitecture: SEOScore;
  seoScore: SEOScore;
  performanceScore: SEOScore;
  bestPracticeScore: SEOScore;
  accessibilityScore: SEOScore;
  coreWebVitals: CoreWebVitals;
}

function calculateGrade(score: number): string {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 85) return 'B+';
  if (score >= 80) return 'B';
  if (score >= 75) return 'C+';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function createScore(value: number): SEOScore {
  return {
    score: Math.round(value),
    grade: calculateGrade(value)
  };
}



export async function analyzeSEODashboard(url: string): Promise<SEODashboardResponse> {
 
    const [internalSeoResult, lighthouseResult] = await Promise.allSettled([
      import('../internalseo/internalseo-analyze-handler').then(m => m.analyzeInternalSEOHandler(url)),
      import('../lighthouse/lightHouse-analyze-handler').then(m => m.analyzeLighthouse(url))
    ]);

    const technicalSeoScore = internalSeoResult.status === 'fulfilled' && internalSeoResult.value.success 
      ? internalSeoResult.value.data.technicalArchitechure : 0;
    
    const lighthouseMetrics = lighthouseResult.status === 'fulfilled' && lighthouseResult.value.success
      ? lighthouseResult.value.metrics : null;

    const onPageSeoScore = lighthouseMetrics?.seo || 0;
    const performanceScore = lighthouseMetrics?.performance || 0;
    const bestPracticeScore = lighthouseMetrics?.bestPractices || 0;
    const accessibilityScore = lighthouseMetrics?.accessibility || 0;

    // Calculate average of all 5 categories for overall score
    const overallScore = Math.round(
      (technicalSeoScore + onPageSeoScore + performanceScore + bestPracticeScore + accessibilityScore) / 5
    );

    return {
      overallScore: createScore(overallScore),
      technicalSeoScore: createScore(technicalSeoScore),
      onPageSeoScore: createScore(onPageSeoScore),
      technicalArchitecture: createScore(technicalSeoScore),
      seoScore: createScore(performanceScore),
      performanceScore: createScore(performanceScore),
      bestPracticeScore: createScore(bestPracticeScore),
      accessibilityScore: createScore(accessibilityScore),
      coreWebVitals: {
        lcp: Math.round(lighthouseMetrics?.largestContentfulPaint || 0),
        fid: Math.round(lighthouseMetrics?.totalBlockingTime || 0),
        cls: Math.round((lighthouseMetrics?.cumulativeLayoutShift || 0) * 1000) / 1000
      }
    };

  
}