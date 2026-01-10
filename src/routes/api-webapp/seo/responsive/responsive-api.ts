import { Router, Request, Response } from 'express';
import { analyzeMobileHandler } from './responsive-analyze-handler';
import { saveSeoAnalysis } from '../seo-middleware';

const router = Router();

router.post('/analyze-responsive', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (url) {
      await saveSeoAnalysis(url, 'responsive', { url });
    }
    return analyzeMobileHandler(req, res);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Responsive analysis failed'
    });
  }
});

export default router;