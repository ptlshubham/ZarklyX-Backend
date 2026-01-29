import { Router, Request, Response } from 'express';
import { analyzeSEODashboard } from './seo-dashboard-handler';

const router = Router();

router.post('/analyze-dashboard', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url } = req.body;

    if (!url) {
      res.status(400).json({
        success: false,
        error: 'URL is required'
      });
      return;
    }

    const result = await analyzeSEODashboard(url);

    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'SEO Dashboard analysis failed'
    });
  }
});

export = router;