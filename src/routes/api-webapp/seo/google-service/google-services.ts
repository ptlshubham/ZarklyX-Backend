import { Router, Request, Response } from 'express';
import { saveOrUpdateToken } from '../../../../services/token-store.service';
import { analyzeGoogleAnalyticsHandler } from '../google-analytics/google-analytics-handler';
import { analyzeGoogleSearchConsoleHandler, listGSCSites } from '../google-search-console/google-search-console-handler';

const router = Router();

// POST /google-services/setup-tokens (unified token setup for GA4 + GSC)
router.post('/setup-tokens', async (req: Request, res: Response): Promise<any> => {
  try {
    const { accessToken, refreshToken, accountEmail } = req.body;
    
    if (!accessToken || !refreshToken || !accountEmail) {
      return res.status(400).json({ 
        success: false, 
        error: 'accessToken, refreshToken, and accountEmail are required' 
      });
    }

    // Save unified tokens for both GA4 and GSC
    await saveOrUpdateToken({
      provider: 'google',
      accountEmail,
      accountId: 'unified_ga4_gsc',
      scopes: [
        'https://www.googleapis.com/auth/analytics.readonly',
        'https://www.googleapis.com/auth/webmasters.readonly'
      ],
      accessToken,
      refreshToken,
      expiryDate: null,
      tokenType: 'Bearer'
    });

    return res.json({
      success: true,
      accountEmail,
      message: 'Google Analytics + Search Console tokens saved successfully',
      services: ['GA4', 'GSC']
    });
  } catch (error: any) {
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to save tokens' 
    });
  }
});

// POST /google-services/analyze-both (analyze both GA4 and GSC)
router.post('/analyze-both', async (req: Request, res: Response): Promise<any> => {
  try {
    const { 
      propertyId = '498347631',
      siteUrl,
      accountEmail,
      startDate, 
      endDate 
    } = req.body;
    
    if (!accountEmail) {
      return res.status(400).json({ 
        success: false, 
        error: 'Account email is required' 
      });
    }

    const results = {
      analytics: null as any,
      searchConsole: null as any,
      success: true,
      errors: [] as string[]
    };

    // Analyze GA4
    try {
      results.analytics = await analyzeGoogleAnalyticsHandler(propertyId, accountEmail, {
        startDate,
        endDate
      });
    } catch (error: any) {
      results.errors.push(`GA4 Error: ${error.message}`);
    }

    // Analyze GSC if siteUrl provided
    if (siteUrl) {
      try {
        results.searchConsole = await analyzeGoogleSearchConsoleHandler(siteUrl, accountEmail, {
          startDate,
          endDate
        });
      } catch (error: any) {
        results.errors.push(`GSC Error: ${error.message}`);
      }
    }

    return res.json(results);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Combined analysis failed',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;