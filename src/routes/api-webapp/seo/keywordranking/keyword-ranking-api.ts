import express, { Request, Response } from 'express';
import { keywordRenkChecker } from './keywordranking-analyze-handler';
import { saveSeoAnalysis } from '../seo-middleware';
import { serverError } from '../../../../utils/responseHandler';

const router = express.Router();

router.post('/analyze-keyword', async (req: Request, res: Response): Promise<any> => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    const result = await keywordRenkChecker(url);
    
    // Save to database
    await saveSeoAnalysis(url, 'keyword-ranking', result);
    
    return res.json(result);
  } catch (error: any) {
    serverError(res, error.message || 'Keyword ranking analysis failed');
  }
});

export default router;