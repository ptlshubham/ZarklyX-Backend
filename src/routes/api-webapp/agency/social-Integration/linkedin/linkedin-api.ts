import express, { Request, Response } from "express";
import {
	generateLinkedInAuthUrl,
	exchangeLinkedInCodeForTokens,
	refreshLinkedInAccessToken,
	getLinkedInUserInfo,
	getLinkedInEmail,
	createLinkedInShare,
} from "../../../../../services/linkedin-service";
import { saveOrUpdateToken } from "../../../../../services/token-store.service";

const router = express.Router();

// Helper: extract tokens from headers/query/body
function extractTokens(req: Request) {
	const at = ((req.headers["x-access-token"] as string) || (req.query.access_token as string) || (req.body?.access_token as string) || "").trim();
	const rt = ((req.headers["x-refresh-token"] as string) || (req.query.refresh_token as string) || (req.body?.refresh_token as string) || "").trim();
	const tokens: any = {};
	if (at) tokens.access_token = at;
	if (rt) tokens.refresh_token = rt;
	return tokens;
}

// GET /linkedin/auth/url
router.get("/auth/url", async (req: Request, res: Response): Promise<void> => {
	try {
		const scopesParam = (req.query.scopes as string) || process.env.LINKEDIN_SCOPES || "r_liteprofile r_emailaddress w_member_social";
		const scopes = scopesParam.split(/[ ,]+/).filter(Boolean);
		const { url, state } = generateLinkedInAuthUrl(scopes);
		const expectedRedirectUri = process.env.LINKEDIN_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/linkedin/oauth2callback`;
		res.status(200).json({ success: true, url, state, expectedRedirectUri, clientId: (process.env.LINKEDIN_CLIENT_ID || "").slice(0,10)+"…" });
	} catch (e: any) {
		res.status(500).json({ success: false, message: e.message || "Failed to generate auth URL" });
	}
});

// GET /linkedin/oauth2callback?code=...
router.get("/oauth2callback", async (req: Request, res: Response): Promise<void> => {
	try {
		// If LinkedIn redirected with an error, surface it clearly
		const err = (req.query.error as string) || "";
		const errDesc = (req.query.error_description as string) || "";
		if (err) {
			const expectedScopes = (process.env.LINKEDIN_SCOPES || "r_liteprofile r_emailaddress w_member_social").split(/[ ,]+/).filter(Boolean);
			const hints = [
				"Ensure your LinkedIn app has Products enabled for the scopes you request:",
				"- Sign In with LinkedIn → r_liteprofile, r_emailaddress",
				"- Share on LinkedIn → w_member_social",
				"If you only have basic profile/email, remove w_member_social or set LINKEDIN_SCOPES_BASIC.",
				"Scopes must be space-separated; avoid commas.",
				`Authorized redirect must match exactly: ${process.env.LINKEDIN_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/linkedin/oauth2callback`}`,
			];
			res.status(400).json({ success: false, error: err, error_description: errDesc, expectedScopes, hints });
			return;
		}
		const code = req.query.code as string;
		if (!code) { res.status(400).json({ success: false, message: "Missing 'code' parameter" }); return; }
		const tokenRes = await exchangeLinkedInCodeForTokens(code);

		// Try to fetch profile/email to persist with accountEmail
		let email: string | null = null;
		try {
			if (tokenRes?.access_token) {
				const emailResp = await getLinkedInEmail(tokenRes.access_token);
				const el = emailResp?.elements?.[0]?.["handle~"]?.emailAddress;
				email = el || null;
			}
		} catch {}

		await saveOrUpdateToken({
			accountEmail: email,
			provider: "linkedin",
			scopes: ((process.env.LINKEDIN_SCOPES || "r_liteprofile r_emailaddress w_member_social").split(/[ ,]+/).filter(Boolean)),
			accessToken: tokenRes?.access_token || null,
			refreshToken: tokenRes?.refresh_token || null,
			expiryDate: tokenRes?.expires_in ? Date.now() + tokenRes.expires_in * 1000 : null,
			tokenType: "Bearer",
		});

		res.status(200).json({ success: true, tokens: tokenRes, accountEmail: email });
	} catch (e: any) {
		res.status(500).json({ success: false, message: e.response?.data || e.message || "OAuth callback failed" });
	}
});

// POST /linkedin/token/refresh { refresh_token }
router.post("/token/refresh", async (req: Request, res: Response): Promise<void> => {
	try {
		const rt = (req.body?.refresh_token as string) || (req.headers["x-refresh-token"] as string) || (req.query.refresh_token as string);
		if (!rt) { res.status(400).json({ success: false, message: "Missing refresh_token" }); return; }
		const tokens = await refreshLinkedInAccessToken(rt);
		res.status(200).json({ success: true, tokens });
	} catch (e: any) {
		res.status(500).json({ success: false, message: e.response?.data || e.message || "Failed to refresh token" });
	}
});

// GET /linkedin/me
router.get("/me", async (req: Request, res: Response): Promise<void> => {
	try {
		const tokens = extractTokens(req);
		if (!tokens.access_token) { res.status(400).json({ success: false, message: "Provide access_token" }); return; }
		const me = await getLinkedInUserInfo(tokens.access_token);
		res.status(200).json({ success: true, me });
	} catch (e: any) {
		res.status(500).json({ success: false, message: e.response?.data || e.message || "Failed to fetch profile" });
	}
});

// GET /linkedin/email
router.get("/email", async (req: Request, res: Response): Promise<void> => {
	try {
		const tokens = extractTokens(req);
		if (!tokens.access_token) { res.status(400).json({ success: false, message: "Provide access_token" }); return; }
		const email = await getLinkedInEmail(tokens.access_token);
		res.status(200).json({ success: true, email });
	} catch (e: any) {
		res.status(500).json({ success: false, message: e.response?.data || e.message || "Failed to fetch email" });
	}
});

// POST /linkedin/share { text }
router.post("/share", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    const text = (req.body?.text as string) || (req.query?.text as string);

    if (!tokens.access_token) {
      res.status(400).json({ success: false, message: "Provide access_token" });
      return;
    }

    if (!text) {
      res.status(400).json({ success: false, message: "Missing text" });
      return;
    }

    // OpenID user info
    const me = await getLinkedInUserInfo(tokens.access_token);

    let personUrn: string | null = null;

    // OpenID → sub already contains URN
    if ((me as any)?.sub?.startsWith("urn:li:person:")) {
      personUrn = (me as any).sub;
    }
    // Fallback for classic /v2/me
    else if ((me as any)?.id) {
      personUrn = `urn:li:person:${(me as any).id}`;
    }

    if (!personUrn) {
      res.status(400).json({
        success: false,
        message: "Could not determine LinkedIn person URN",
        hint: "Ensure scopes include 'openid profile email' or use classic /v2/me",
      });
      return;
    }

    const result = await createLinkedInShare(tokens.access_token, personUrn, text);

    res.status(200).json({ success: true, result });
  } catch (e: any) {
    const msg = e?.response?.data || e?.message || "Failed to create share";
    res.status(500).json({
      success: false,
      message: msg,
      hints: [
        "Posting requires 'w_member_social' scope",
        "Ensure 'Share on LinkedIn' product is enabled",
        "Re-consent after updating scopes",
      ],
    });
  }
});

// GET /linkedin/debug
router.get("/debug", async (_req: Request, res: Response): Promise<void> => {
	try {
		const expectedRedirectUri = process.env.LINKEDIN_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/linkedin/oauth2callback`;
		const clientId = process.env.LINKEDIN_CLIENT_ID || "";
		const scopes = (process.env.LINKEDIN_SCOPES || "r_liteprofile r_emailaddress w_member_social").split(/[ ,]+/).filter(Boolean);
		res.status(200).json({ success: true, expectedRedirectUri, clientIdStart: clientId.slice(0,10)+"…", scopes });
	} catch (e: any) {
		res.status(500).json({ success: false, message: e.message || "Failed to read config" });
	}
});

module.exports = router;
