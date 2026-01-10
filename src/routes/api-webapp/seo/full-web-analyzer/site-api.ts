import express, { Request, Response } from 'express';
import { crawlAndAnalyzeSPA } from './site-analyze-handler';
import { saveSeoAnalysis } from '../seo-middleware';

const router = express.Router();

router.post('/analyze-site', async (req: Request, res: Response): Promise<any> => {
  try {
    const { url, maxPages } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    const result = await crawlAndAnalyzeSPA(url, maxPages);
    
    // Save to database
    await saveSeoAnalysis(url, 'site', result);
    
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Site analysis failed'
    });
  }
});

export default router;