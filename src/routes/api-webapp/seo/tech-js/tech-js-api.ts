import express, { Request, Response } from 'express';
import { detectWebsiteTechStackWithAI, compareJSRendering, saveTechJsAnalysis } from './tech-js-analyze-handler';
import * as cheerio from 'cheerio';
import { httpClient } from '../utils/http-client';

const router = express.Router();

router.post('/analyze-tech-js', async (req: Request, res: Response): Promise<any> => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL is required' 
      });
    }

    // Fetch the webpage
    const response = await httpClient.get(url);

    const $ = cheerio.load(response.data);
    const headers = response.headers;

    // Detect tech stack with AI recommendations
    const techStackResult = await detectWebsiteTechStackWithAI($, response.data, headers as Record<string, string | string[] | undefined>, url);
    
    // Compare JS rendering
    const renderingComparison = await compareJSRendering(url, response.data);

    const result = {
      ...techStackResult,
      renderingComparison
    };
    
    // Save to database for historical tracking
    await saveTechJsAnalysis(url, result);

    return res.json(result);
  } catch (error: any) {
    console.error('Tech/JS analysis error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to analyze tech stack and JS rendering' 
    });
  }
});

export default router;