import { Router, Request, Response } from 'express';
import { analyzeSecurityHandler } from './security-analyze-handler';
import { saveSeoAnalysis } from '../seo-middleware';
import { serverError } from '../../../../utils/responseHandler';

const router = Router();

router.post('/analyze-security', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required in request body'
      });
    }
    
    await saveSeoAnalysis(url, 'security', { url });
    return analyzeSecurityHandler(req, res);
  } catch (error: any) {
    serverError(res, error.message || 'Security analysis failed');
  }
});

export default router;