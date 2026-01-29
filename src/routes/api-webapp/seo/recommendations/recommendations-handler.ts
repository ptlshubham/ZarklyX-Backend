import { Request, Response } from 'express';
import { generateSeoRecommendations } from '../../../../services/gemini-seo-recommendations';
import { serverError } from '../../../../utils/responseHandler';

export async function generateRecommendationsHandler(req: Request, res: Response) {
  const startTime = Date.now();
  
  // try {
    const { issues } = req.body;

    if (!issues || !Array.isArray(issues)) {
      return res.status(400).json({
        success: false,
        error: 'Issues array is required in request body'
      });
    }

    if (issues.length === 0) {
      return res.json({
        success: true,
        recommendations: [],
        message: 'No issues provided'
      });
    }

    console.log(`[${new Date().toISOString()}] Generating recommendations for ${issues.length} issues`);

    const recommendations = await generateSeoRecommendations(issues);
    const processingTime = Date.now() - startTime;
    console.log(recommendations);
    

    console.log(`[${new Date().toISOString()}] Generated ${recommendations.length} recommendations in ${processingTime}ms`);

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      processingTime: `${processingTime}ms`,
      totalIssues: issues.length,
      totalRecommendations: recommendations.length,
      recommendations
    });

  // } catch (error: any) {
  //   const processingTime = Date.now() - startTime;
  //   console.error(`[${new Date().toISOString()}] Error after ${processingTime}ms:`, error.message);
  //   serverError(res, error.message || 'Recommendation generation failed');
  // }
}