import { Router, Request, Response } from 'express';
import { analyzeSecurityHandler } from './security-analyze-handler';
import { saveSeoAnalysis } from '../seo-middleware';

const router = Router();

router.post('/analyze-security', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (url) {
      await saveSeoAnalysis(url, 'security', { url });
    }
    return analyzeSecurityHandler(req, res);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Security analysis failed'
    });
  }
});

export default router;