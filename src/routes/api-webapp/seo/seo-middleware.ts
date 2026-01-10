import { seo } from './seo-model';

export async function saveSeoAnalysis(url: string, analysisType: string, analysisData: any): Promise<void> {
  try {
    await seo.create({
      url: url,
      isDeleted: false
    });
  } catch (error) {
    console.error('Failed to save SEO analysis to database:', error);
    // Don't throw error to avoid breaking the analysis response
  }
}