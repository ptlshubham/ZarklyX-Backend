import { Router, Request, Response } from 'express';
import { getDashboardSummaryHandler, getDashboardFromComprehensiveHandler } from './dashboard-handler';

const router = Router();

/**
 * POST /dashboard/summary
 * Quick dashboard metrics with basic page analysis
 * For full analysis, use /seo/queue/comprehensive instead
 */
router.post('/summary', async (req: Request, res: Response): Promise<any> => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
        example: { url: 'https://example.com' }
      });
    }

    const result = await getDashboardSummaryHandler(url);
    
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate dashboard summary'
    });
  }
});

/**
 * POST /dashboard/from-comprehensive
 * Generate dashboard from comprehensive SEO analysis results
 * This is much more accurate than quick summary
 */
router.post('/from-comprehensive', async (req: Request, res: Response): Promise<any> => {
  try {
    const { comprehensiveResult } = req.body;
    
    if (!comprehensiveResult) {
      return res.status(400).json({
        success: false,
        error: 'Comprehensive analysis result is required',
        note: 'Use /seo/queue/comprehensive first, then pass the result here'
      });
    }

    const dashboard = await getDashboardFromComprehensiveHandler(comprehensiveResult);
    
    return res.json(dashboard);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate dashboard from comprehensive result'
    });
  }
});

export default router;
