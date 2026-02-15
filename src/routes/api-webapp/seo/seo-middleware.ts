import { seo } from './seo-model';

/**
 * Save SEO analysis to database
 * @param url - The URL being analyzed
 * @param analysisType - Type of analysis (lighthouse, keyword-ranking, responsive, etc.)
 * @param analysisData - The analysis result object
 * @returns Promise<void>
 */
export async function saveSeoAnalysis(url: string, analysisType: string, analysisData: any): Promise<void> {
  try {
    // Serialize analysisData to JSON string for storage
    const dataString = analysisData ? JSON.stringify(analysisData) : undefined;
    
    await seo.create({
      url: url,
      analysisType: analysisType,
      analysisData: dataString,
      isDeleted: false
    });
  } catch (error) {
    console.error(`Failed to save SEO analysis (${analysisType}) to database:`, error);
    // Don't throw error to avoid breaking the analysis response
  }
}