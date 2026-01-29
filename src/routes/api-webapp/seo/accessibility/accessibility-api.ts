import { Router, Request, Response } from 'express';
import { analyzeMobileHandler } from './accessibility-analyze-handler';
import { saveSeoAnalysis } from '../seo-middleware';
import { serverError } from '../../../../utils/responseHandler';

const router = Router();

router.post('/analyze-accessibility', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required in request body'
      });
    }
    
    await saveSeoAnalysis(url, 'accessibility', { url });
    
    return analyzeMobileHandler(req, res);
  } catch (error: any) {
    serverError(res, error.message || 'Accessibility analysis failed');
  }
});

export default router;