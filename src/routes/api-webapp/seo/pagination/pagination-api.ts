import { Router, Request, Response } from 'express';
import { analyzePaginationHandler, savePaginationAnalysis } from './pagination-analyze-handler';

const router = Router();

router.post('/analyze-pagination', async (req: Request, res: Response): Promise<any> => {
  try {
    const { url, maxPages = 10, followPagination = true } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL is required',
        details: { example: { url: 'https://example.com' } }
      });
    }

    const result = await analyzePaginationHandler(url, {
      maxPages,
      followPagination
    });
    
    // Save to database for historical tracking
    await savePaginationAnalysis(result);

    return res.json(result);
  } catch (error: any) {
    console.error('Pagination analysis error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to analyze pagination' 
    });
  }
});

export default router;