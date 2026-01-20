import express, { Request, Response } from 'express';
import { analyzeLighthouseWithAI } from './lightHouse-analyze-handler';
import { saveSeoAnalysis } from '../seo-middleware';
import { serverError } from '../../../../utils/responseHandler';

const router = express.Router();

router.post('/analyze-lighthouse', async (req: Request, res: Response): Promise<any> => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    const result = await analyzeLighthouseWithAI(url);
    
    // Save to database
    await saveSeoAnalysis(url, 'lighthouse', result);
    
    return res.json(result);
  } catch (error: any) {
    serverError(res, error.message || 'Lighthouse analysis failed');
  }
});

export default router;