import { Router, Request, Response } from 'express';
import { analyzePaginationHandler } from './pagination-analyze-handler';
import { saveSeoAnalysis } from '../seo-middleware';

const router = Router();

router.post('/analyze-pagination', async (req: Request, res: Response): Promise<any> => {
  try {
    const { url, maxPages = 10, followPagination = true } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        success: false,
        error: 'URL is required',
        example: { url: 'https://example.com' }
      });
    }

    if (url) {
      await saveSeoAnalysis(url, 'pagination', { url, maxPages, followPagination });
    }

    const result = await analyzePaginationHandler(url, {
      maxPages,
      followPagination
    });

    return res.json(result);
  } catch (error: any) {
    // Handle JSON parsing errors
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({
        success: false,
        error: 'Invalid JSON format in request body',
        details: 'Please ensure your request body is valid JSON',
        example: { url: 'https://example.com', maxPages: 10 }
      });
    }
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Pagination analysis failed',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;