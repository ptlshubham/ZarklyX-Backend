import express, { Request, Response } from 'express';
import { analyzeAccessibility } from './accessibility-analyze-handler';
import { saveSeoAnalysis } from '../seo-middleware';

const router = express.Router();

router.post('/analyze-accessibility', async (req: Request, res: Response): Promise<any> => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format'
      });
    }

    // Analyze accessibility
    const result = await analyzeAccessibility(url);
    
    // Save to database
    if (result.success) {
      await saveSeoAnalysis(url, 'accessibility', result);
    }

    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Accessibility analysis failed'
    });
  }
});

export default router;
