import { Router, Request, Response } from 'express';
import { 
  analyzeGoogleAnalyticsHandler,
  generateGAAuthUrl,
  exchangeGACodeForTokens
} from './google-analytics-handler';
import { saveSeoAnalysis } from '../seo-middleware';
import { saveOrUpdateToken } from '../../../../services/token-store.service';
import jwt from 'jsonwebtoken';
import axios from 'axios';

const router = Router();

// Helper: extract tokens from headers/query/body
function extractTokens(req: Request) {
  const accountEmail = ((req.headers['x-account-email'] as string) || (req.query.accountEmail as string) || (req.body?.accountEmail as string) || '').trim();
  return { accountEmail };
}

// GET /google-analytics/auth-url
router.get('/auth-url', async (req: Request, res: Response): Promise<any> => {
  try {
    const authUrl = await generateGAAuthUrl();
    const expectedRedirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.API_URL}/google/oauth2callback`;
    return res.json({ 
      success: true, 
      authUrl, 
      expectedRedirectUri,
      scopes: ['https://www.googleapis.com/auth/analytics.readonly']
    });
  } catch (error: any) {
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to generate auth URL' 
    });
  }
});

// POST /google-analytics/tokens
router.post('/tokens', async (req: Request, res: Response): Promise<any> => {
  try {
    const { accessToken, refreshToken, accountEmail } = req.body;
    
    if (!accessToken || !refreshToken || !accountEmail) {
      return res.status(400).json({ 
        success: false, 
        error: 'accessToken, refreshToken, and accountEmail are required' 
      });
    }

    // Save tokens directly to token store
    await saveOrUpdateToken({
      provider: 'google',
      accountEmail,
      accountId: 'manual_setup',
      scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
      accessToken,
      refreshToken,
      expiryDate: null,
      tokenType: 'Bearer'
    });

    return res.json({
      success: true,
      accountEmail,
      message: 'Google Analytics tokens saved successfully'
    });
  } catch (error: any) {
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to save tokens' 
    });
  }
});

// GET /google-analytics/callback
router.get('/callback', async (req: Request, res: Response): Promise<any> => {
  try {
    const code = req.query.code as string;
    const error = req.query.error as string;
    
    if (error) {
      return res.status(400).json({ 
        success: false, 
        error: `OAuth error: ${error}` 
      });
    }
    
    if (!code) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing authorization code' 
      });
    }

    const tokens = await exchangeGACodeForTokens(code);

    let accountEmail: string | null = null;
    let accountId: string | null = null;

    // Extract email from ID token
    if (tokens.id_token) {
      const decoded: any = jwt.decode(tokens.id_token);
      accountEmail = decoded?.email || null;
      accountId = decoded?.sub || null;
    }

    // Fallback: get user info from access token
    if (!accountEmail && tokens.access_token) {
      const userinfo = await axios.get(
        'https://openidconnect.googleapis.com/v1/userinfo',
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      accountEmail = userinfo.data.email;
      accountId = userinfo.data.sub;
    }

    if (!accountEmail) {
      return res.status(400).json({
        success: false,
        error: 'Failed to resolve Google account email'
      });
    }

    // Save tokens using existing token store
    await saveOrUpdateToken({
      provider: 'google',
      accountEmail,
      accountId,
      scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
      accessToken: tokens.access_token || null,
      refreshToken: tokens.refresh_token || null,
      expiryDate: tokens.expiry_date || null,
      tokenType: tokens.token_type || 'Bearer'
    });

    return res.json({
      success: true,
      accountEmail,
      accountId,
      message: 'Google Analytics authentication successful'
    });
  } catch (error: any) {
    console.error('OAuth callback error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to exchange code for token' 
    });
  }
});

// POST /google-analytics/analyze
router.post('/analyze', async (req: Request, res: Response): Promise<any> => {
  try {
    const { 
      propertyId , // Default property ID
      accountEmail,
      startDate, 
      endDate, 
      metrics, 
      dimensions 
    } = req.body;
    
    if (!accountEmail) {
      return res.status(400).json({ 
        success: false, 
        error: 'Account email is required' 
      });
    }

    // Save analysis request
    await saveSeoAnalysis(`Property: ${propertyId}`, 'google-analytics', { 
      propertyId, 
      accountEmail,
      startDate, 
      endDate, 
      metrics, 
      dimensions 
    });

    const result = await analyzeGoogleAnalyticsHandler(propertyId, accountEmail, {
      startDate,
      endDate,
      metrics,
      dimensions
    });

    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Google Analytics analysis failed',
      timestamp: new Date().toISOString()
    });
  }
});

// POST /google-analytics/analyze-property (with custom property ID)
router.post('/analyze-property', async (req: Request, res: Response): Promise<any> => {
  try {
    const { 
      propertyId,
      accountEmail,
      startDate, 
      endDate, 
      metrics, 
      dimensions 
    } = req.body;
    
    if (!propertyId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Property ID is required' 
      });
    }

    if (!accountEmail) {
      return res.status(400).json({ 
        success: false, 
        error: 'Account email is required' 
      });
    }

    const result = await analyzeGoogleAnalyticsHandler(propertyId, accountEmail, {
      startDate,
      endDate,
      metrics,
      dimensions
    });

    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Google Analytics analysis failed',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;