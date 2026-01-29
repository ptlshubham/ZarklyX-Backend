import { Router, Request, Response } from 'express';
import { 
  analyzeGoogleSearchConsoleHandler,
  generateGSCAuthUrl,
  exchangeGSCCodeForTokens,
  listGSCSites
} from './google-search-console-handler';
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

// GET /google-search-console/auth-url
router.get('/auth-url', async (req: Request, res: Response): Promise<any> => {
  try {
    const authUrl = await generateGSCAuthUrl();
    const expectedRedirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.API_URL}/google/oauth2callback`;
    return res.json({ 
      success: true, 
      authUrl, 
      expectedRedirectUri,
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly']
    });
  } catch (error: any) {
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to generate auth URL' 
    });
  }
});

// POST /google-search-console/tokens
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
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
      accessToken,
      refreshToken,
      expiryDate: null,
      tokenType: 'Bearer'
    });

    return res.json({
      success: true,
      accountEmail,
      message: 'Google Search Console tokens saved successfully'
    });
  } catch (error: any) {
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to save tokens' 
    });
  }
});

// GET /google-search-console/callback
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

    console.log('Received authorization code:', code.substring(0, 20) + '...');
    console.log('Using redirect URI:', process.env.GOOGLE_REDIRECT_URI);

    const tokens = await exchangeGSCCodeForTokens(code);
    console.log('Token exchange successful');

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
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
      accessToken: tokens.access_token || null,
      refreshToken: tokens.refresh_token || null,
      expiryDate: tokens.expiry_date || null,
      tokenType: tokens.token_type || 'Bearer'
    });

    return res.json({
      success: true,
      accountEmail,
      accountId,
      message: 'Google Search Console authentication successful'
    });
  } catch (error: any) {
    console.error('OAuth callback error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to exchange code for token' 
    });
  }
});

// POST /google-search-console/sites
router.post('/sites', async (req: Request, res: Response): Promise<any> => {
  try {
    const { accountEmail } = extractTokens(req);
    
    if (!accountEmail) {
      return res.status(400).json({ 
        success: false, 
        error: 'Account email is required' 
      });
    }

    const sites = await listGSCSites(accountEmail);
    return res.json({ success: true, sites });
  } catch (error: any) {
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch sites' 
    });
  }
});

// POST /google-search-console/analyze
router.post('/analyze', async (req: Request, res: Response): Promise<any> => {
  try {
    const { 
      siteUrl, 
      accountEmail,
      startDate, 
      endDate, 
      dimensions, 
      rowLimit 
    } = req.body;
    
    if (!siteUrl) {
      return res.status(400).json({ 
        success: false, 
        error: 'Site URL is required' 
      });
    }

    if (!accountEmail) {
      return res.status(400).json({ 
        success: false, 
        error: 'Account email is required' 
      });
    }

    // Save analysis request
    await saveSeoAnalysis(siteUrl, 'google-search-console', { 
      siteUrl, 
      accountEmail,
      startDate, 
      endDate, 
      dimensions, 
      rowLimit 
    });

    const result = await analyzeGoogleSearchConsoleHandler(siteUrl, accountEmail, {
      startDate,
      endDate,
      dimensions,
      rowLimit
    });

    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Google Search Console analysis failed',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;