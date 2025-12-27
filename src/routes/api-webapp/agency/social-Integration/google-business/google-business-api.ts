import express, { Request, Response } from "express";
import { generateBusinessAuthUrl, exchangeBusinessCodeForTokens, listBusinessAccounts, listBusinessLocations, getBusinessLocation, getBusinessAccessTokenInfo } from "../../../../../services/business-profile-service";

const router = express.Router();

// Helper: extract tokens from headers/query/body
function extractTokens(req: Request) {
  const headerAT = (req.headers["x-access-token"] as string) || (req.headers["access_token"] as string);
  const queryAT = (req.query.access_token as string) || (req.body && (req.body.access_token as string));
  const headerRT = (req.headers["x-refresh-token"] as string) || (req.headers["refresh_token"] as string);
  const queryRT = (req.query.refresh_token as string) || (req.body && (req.body.refresh_token as string));

  const access_token = (headerAT || queryAT || "").trim();
  const refresh_token = (headerRT || queryRT || "").trim();
  const tokens: any = {};
  if (access_token) tokens.access_token = access_token;
  if (refresh_token) tokens.refresh_token = refresh_token;
  return tokens;
}

// GET /google-business/auth/url
router.get("/auth/url", async (req: Request, res: Response): Promise<void> => {
  try {
    const scopesParam = (req.query.scopes as string) || process.env.GOOGLE_BUSINESS_SCOPES || "https://www.googleapis.com/auth/business.manage";
    const scopes = scopesParam.split(",").map(s => s.trim()).filter(Boolean);
    const url = generateBusinessAuthUrl(scopes);
    const expectedRedirectUri = process.env.GOOGLE_BUSINESS_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/google-business/oauth2callback`;
    res.status(200).json({ success: true, url, expectedRedirectUri, clientId: (process.env.GOOGLE_CLIENT_ID || "").slice(0,10) + "…" });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to generate auth URL" });
    return;
  }
});

// GET /google-business/oauth2callback?code=...
router.get("/oauth2callback", async (req: Request, res: Response): Promise<void> => {
  try {
    const code = req.query.code as string;
    if (!code) {  
      res.status(400).json({ success: false, message: "Missing 'code' parameter" });
      return;
    }
    // Compute the redirectUri we expect Google to verify against
    const expectedRedirectUri = process.env.GOOGLE_BUSINESS_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/google-business/oauth2callback`;
    const tokens = await exchangeBusinessCodeForTokens(code, expectedRedirectUri);
    res.status(200).json({ success: true, tokens });
    return;
  } catch (error: any) {
    // Improve diagnostics for common invalid_grant causes
    const expectedRedirectUri = process.env.GOOGLE_BUSINESS_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/google-business/oauth2callback`;
    const root = (error?.response?.data?.error) || (error?.message) || "OAuth callback failed";
    const details = error?.response?.data || undefined;
    const hints = [
      "Confirm you generated the code using /google-business/auth/url (not a different app/redirect).",
      `Google Console → OAuth Client → Authorized redirect URIs MUST include: ${expectedRedirectUri}`,
      "The 'code' can only be used once and expires quickly—try again with a fresh consent.",
      "Ensure the OAuth consent screen is in Testing and your account is added as a test user (or publish).",
      "Check system time (clock skew) and client secret/id for the same project you used to consent.",
      "Scopes should include https://www.googleapis.com/auth/business.manage.",
    ];
    res.status(500).json({ success: false, message: root, expectedRedirectUri, details, hints });
    return;
  }
});

// GET /google-business/debug -> show effective config used to build auth client
router.get("/debug", async (_req: Request, res: Response): Promise<void> => {
  try {
    const expectedRedirectUri = process.env.GOOGLE_BUSINESS_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/google-business/oauth2callback`;
    const apiUrl = process.env.API_URL || "(unset)";
    const clientId = process.env.GOOGLE_CLIENT_ID || "(unset)";
    const clientSecretSet = Boolean(process.env.GOOGLE_CLIENT_SECRET);
    const scopes = (process.env.GOOGLE_BUSINESS_SCOPES || "https://www.googleapis.com/auth/business.manage").split(",").map(s => s.trim()).filter(Boolean);
    res.status(200).json({ success: true, expectedRedirectUri, apiUrl, clientIdStart: clientId.slice(0,10)+"…", clientSecretSet, scopes });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || "Failed to read config" });
  }
});

// GET /google-business/me/accounts
router.get("/me/accounts", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    const data = await listBusinessAccounts(tokens);
    res.status(200).json({ success: true, data });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to fetch accounts" });
    return;
  }
});

// GET /google-business/me/locations?accountName=accounts/XXXXXXXXXXXXXXXX
router.get("/me/locations", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    const accountName = (req.query.accountName as string) || "";
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    if (!accountName) {
      res.status(400).json({ success: false, message: "Missing accountName (e.g., accounts/123456789)" });
      return;
    }
    const data = await listBusinessLocations(tokens, accountName);
    res.status(200).json({ success: true, data });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to fetch locations" });
    return;
  }
});

// GET /google-business/me/location?name=locations/XXX
router.get("/me/location", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    const name = (req.query.name as string) || "";
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    if (!name) {
      res.status(400).json({ success: false, message: "Missing location name (e.g., locations/123456789)" });
      return;
    }
    const data = await getBusinessLocation(tokens, name);
    res.status(200).json({ success: true, data });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to fetch location" });
    return;
  }
});

// GET /google-business/tokeninfo
router.get("/tokeninfo", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    const info = await getBusinessAccessTokenInfo(tokens);
    res.status(200).json({ success: true, info });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to inspect token" });
    return;
  }
});

module.exports = router;
