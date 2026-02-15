import { Router, Request, Response } from 'express';
import { analyzeBacklinksHandler } from './backlinks-handler';

const router = Router();

/**
 * POST /backlinks/analyze
 * Analyzes backlink profile for a given URL
 * Returns backlink metrics, referring domains, link quality, and growth trends
 * 
 * Note: This is a simulated backlink analyzer. For production use,
 * integrate with external APIs like Ahrefs, Moz, SEMrush, or Majestic
 */
router.post('/analyze', async (req: Request, res: Response): Promise<any> => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
        example: { url: 'https://example.com' }
      });
    }

    const result = await analyzeBacklinksHandler(url);
    
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Backlink analysis failed'
    });
  }
});

export default router;
