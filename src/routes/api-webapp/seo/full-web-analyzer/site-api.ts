import express, { Request, Response } from 'express';
import { crawlAndAnalyzeSPA } from './site-analyze-handler';
import { saveSeoAnalysis } from '../seo-middleware';
import { serverError } from '../../../../utils/responseHandler';

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

    if (maxPages) {
      return res.status(400).json({
        success: false,
        error: 'maxpage is required'
      });
    }

    const result = await crawlAndAnalyzeSPA(url, maxPages);
    
    // Save to database
    await saveSeoAnalysis(url, 'site', result);
    
    return res.json(result);
  } catch (error: any) {
    serverError(res, error.message || 'Site analysis failed');
  }
});

export default router;