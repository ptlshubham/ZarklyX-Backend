import { Router, Request, Response } from 'express';
import { analyzeInternalSEOHandler } from './internalseo-analyze-handler';
import { saveSeoAnalysis } from '../seo-middleware';

const router = Router();

router.post('/analyze-internal-seo', async (req: Request, res: Response): Promise<any> => {
  try {
    const { url, maxDepth = 3, maxPages = 30, fast = false } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    if (url) {
      await saveSeoAnalysis(url, 'internal-seo', { url, maxDepth, maxPages, fast });
    }

    const result = await analyzeInternalSEOHandler(url, {
      maxDepth,
      maxPages,
      fast
    });

    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal SEO analysis failed'
    });
  }
});

router.post('/onpage-seo-score', async (req: Request, res: Response): Promise<any> => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    await saveSeoAnalysis(url, 'onpage-seo-score', { url });

    const result = await analyzeInternalSEOHandler(url, { maxDepth: 2, maxPages: 10, fast: true });
    
    if (!result.success) {
      return res.status(500).json({ error: (result as any).error || 'Analysis failed' });
    }

    const { technicalArchitechure, orphanPages, brokenLinks, performance, totalPages } = result.data;
    
    const breakdown = {
      technical: { score: technicalArchitechure, weight: 40 },
      structure: { score: Math.max(0, 100 - (orphanPages.length * 10)), weight: 30 },
      links: { score: Math.max(0, 100 - (brokenLinks.length * 15)), weight: 20 },
      performance: { score: Math.max(0, 100 - Math.max(0, (performance.averageLoadTime - 2000) / 50)), weight: 10 }
    };

    const overallScore = Math.round(
      Object.values(breakdown).reduce((total, item) => total + (item.score * item.weight / 100), 0)
    );

    return res.json({
      success: true,
      url,
      timestamp: new Date().toISOString(),
      onPageSeoScore: overallScore,
      breakdown,
      metrics: {
        totalPages,
        orphanPages: orphanPages.length,
        brokenLinks: brokenLinks.length,
        avgLoadTime: performance.averageLoadTime + 'ms'
      }
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'On-page SEO score calculation failed'
    });
  }
});

export default router;