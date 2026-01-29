import express, { Request, Response } from 'express';
import { detectWebsiteTechStackWithAI, compareJSRendering } from './tech-js-analyze-handler';
import { saveSeoAnalysis } from '../seo-middleware';
import { serverError } from '../../../../utils/responseHandler';
import * as cheerio from 'cheerio';
import axios from 'axios';

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
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 30000
    });

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
    
    // Save to database
    await saveSeoAnalysis(url, 'tech-js', result);

    return res.json(result);
  } catch (error: any) {
    serverError(res, error.message || 'Tech and JS analysis failed');
  }
});

export default router;