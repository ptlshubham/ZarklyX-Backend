import { Router, Request, Response } from 'express';
import { aggregateAllIssuesHandler } from './all-issues-handler';

const router = Router();

/**
 * GET /all-issues/aggregate
 * Aggregates issues from multiple SEO analysis endpoints
 * Returns all critical, high, medium, low issues categorized by analysis type
 */
router.post('/aggregate', async (req: Request, res: Response): Promise<any> => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
        example: { url: 'https://example.com' }
      });
    }

    const result = await aggregateAllIssuesHandler(url);
    
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to aggregate issues'
    });
  }
});

export default router;
