import express, { Request, Response } from 'express';
import { analyzeLighthouseWithAI, saveLighthouseAnalysis } from './lightHouse-analyze-handler';

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
    
    // Save to database for historical tracking
    await saveLighthouseAnalysis(result);
    
    return res.json(result);
  } catch (error: any) {
    console.error('Lighthouse analysis error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to analyze lighthouse data' 
    });
  }
});

export default router;