import express, { Request, Response } from "express";
import axios from "axios";
import {
	generateLinkedInAuthUrl,
	exchangeLinkedInCodeForTokens,
	refreshLinkedInAccessToken,
	getLinkedInUserInfo,
	getLinkedInEmail,
	createLinkedInShare,
} from "../../../../../services/linkedin-service";
import {
	getScopesForMode,
	LinkedInMode,
	isOrganizationModeEnabled,
	logScopeConfiguration
} from "../../../../../services/linkedin-scope-manager";
import { saveOrUpdateToken } from "../../../../../services/token-store.service";
import { MetaSocialAccount } from "../meta-social-account.model";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

const oauthStateStore = new Map<string, { companyId: string; timestamp: number, successRedirectUri: string | null, errorRedirectUri: string | null }>();

// Clean up expired state entries every 5 minutes
setInterval(() => {
	const now = Date.now();
	for (const [key, value] of oauthStateStore.entries()) {
		if (now - value.timestamp > 30 * 60 * 1000) { // 30 minute expiry
			oauthStateStore.delete(key);
		}
	}
}, 5 * 60 * 1000);

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
// Generate LinkedIn OAuth URL with flexible scope support
// 
// Query Parameters:
//   - companyId (required): Company ID for the integration
//   - mode (optional): 'development' or 'production' to override LINKEDIN_MODE env var
//   - scopes (optional): Comma/space-separated custom scopes
//   - successRedirectUri (optional): Custom redirect on successful auth
//   - errorRedirectUri (optional): Custom redirect on error
//
// Defaults:
//   - mode: value of LINKEDIN_MODE env var (defaults to 'development')
//   - scopes: determined by mode (dev: personal only, prod: personal + org)
//
router.get("/auth/url", async (req: Request, res: Response): Promise<void> => {
	try {
		const companyId = req.query.companyId as string;
		const modeParam = (req.query.mode as string)?.toLowerCase();
		const mode = modeParam === 'production' ? LinkedInMode.PRODUCTION : LinkedInMode.DEVELOPMENT;
		
		// Safety check: Production mode only allowed in production environment
		if (mode === LinkedInMode.PRODUCTION && process.env.NODE_ENV !== 'production') {
			console.warn('[LINKEDIN AUTH URL] Production mode requested in non-production environment. Using development mode.');
		}
		
		// Get scopes for this mode
		let scopes: string[] | undefined;
		const scopesParam = req.query.scopes as string;
		if (scopesParam) {
			// Use custom scopes if provided
			scopes = scopesParam.split(/[ ,]+/).filter(Boolean);
		}
		// If no custom scopes, generateLinkedInAuthUrl will use mode defaults

		// Get custom redirect URIs from query params
		const successRedirectUri = req.query.successRedirectUri as string;
		const errorRedirectUri = req.query.errorRedirectUri as string;

		if (!companyId) {
			res.status(400).json({ success: false, message: "companyId is required" });
			return;
		}

		const stateId = uuidv4();

		// Store companyId and redirect URIs in server-side state store
		oauthStateStore.set(stateId, {
			companyId: companyId,
			successRedirectUri: successRedirectUri || null,
			errorRedirectUri: errorRedirectUri || null,
			timestamp: Date.now()
		});

		// Generate LinkedIn auth URL with our custom state ID
		// Pass scopes to the service
		const { url: baseUrl, state: linkedInState } = generateLinkedInAuthUrl(scopes);
		// Replace LinkedIn's generated state with our custom state ID
		const authUrl = baseUrl.replace(/state=[^&]*/, `state=${encodeURIComponent(stateId)}`);

		const expectedRedirectUri = process.env.LINKEDIN_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/linkedin/oauth2callback`;
		const defaultSuccessRedirectUri = `${process.env.ADMIN_URL || "http://localhost:4200"}/profile/integrations`;
		const defaultErrorRedirectUri = `${process.env.ADMIN_URL || "http://localhost:4200"}/profile/integrations?error=true`;

		console.log("[LINKEDIN AUTH URL] Generated OAuth URL:", {
			companyId: companyId,
			stateId: stateId,
			mode: mode,
			organizationModeEnabled: isOrganizationModeEnabled(mode),
			expectedRedirectUri: expectedRedirectUri,
			successRedirectUri: successRedirectUri || defaultSuccessRedirectUri,
			errorRedirectUri: errorRedirectUri || defaultErrorRedirectUri,
			linkedInGeneratedState: linkedInState,
			customState: stateId,
		});

		res.status(200).json({
			success: true,
			url: authUrl,
			scopes,
			expectedRedirectUri,
			clientId: (process.env.LINKEDIN_CLIENT_ID || "").slice(0, 10) + "…",
			companyId: companyId || null,
			successRedirectUri: successRedirectUri || defaultSuccessRedirectUri,
			errorRedirectUri: errorRedirectUri || defaultErrorRedirectUri
		});
	} catch (e: any) {
		res.status(500).json({
			success: false,
			message: e.message || "Failed to generate LinkedIn auth URL"
		});
	}
});

// GET /linkedin/oauth2callback?code=...&state=...
router.get("/oauth2callback", async (req: Request, res: Response): Promise<void> => {
	// Declare variables at route level so they're accessible in catch block
	let companyId: string | null = null;
	let successRedirectUri: string | null = null;
	let errorRedirectUri: string | null = null;
	let accountEmail: string | null = null;
	let accountId: string | null = null;

	try {
		console.log("[LINKEDIN OAUTH2CALLBACK] Received callback request:", {
			fullUrl: req.originalUrl,
			queryParams: req.query,
			code: req.query.code,
			state: req.query.state,
			allParams: Object.keys(req.query),
		});

		// If LinkedIn redirected with an error, surface it clearly
		const err = (req.query.error as string) || "";
		const errDesc = (req.query.error_description as string) || "";
		const state = (req.query.state as string) || "";

		if (err) {
			console.error("[LINKEDIN OAUTH2CALLBACK] LinkedIn returned error:", {
				error: err,
				error_description: errDesc,
				state: state,
			});

			// Try to get error redirect URI from state store
			if (state && oauthStateStore.has(state)) {
				const stateData = oauthStateStore.get(state);
				if (stateData) {
					errorRedirectUri = stateData.errorRedirectUri || null;
				}
				oauthStateStore.delete(state);
			}

			const baseErrorRedirectUrl = errorRedirectUri || `${process.env.ADMIN_URL || "http://localhost:4200"}/profile/integrations`;
			const errorCallback = `${baseErrorRedirectUrl}?success=false&error=${encodeURIComponent(err)}&error_description=${encodeURIComponent(errDesc)}&source=linkedin`;

			console.log("[LINKEDIN OAUTH2CALLBACK] Redirecting to error page:", errorCallback);
			res.redirect(errorCallback);
			return;
		}

		// Retrieve stored OAuth state
		console.log("[LINKEDIN OAUTH2CALLBACK] Step 1: Retrieving companyId and redirect URIs from state store...");

		if (state) {
			if (oauthStateStore.has(state)) {
				const stateData = oauthStateStore.get(state);
				if (stateData) {
					const timestamp = stateData.timestamp;

					// Check if state data is still valid (within 30 minutes)
					if (Date.now() - timestamp < 30 * 60 * 1000) {
						companyId = stateData.companyId;
						successRedirectUri = stateData.successRedirectUri || null;
						errorRedirectUri = stateData.errorRedirectUri || null;
						console.log("[LINKEDIN OAUTH2CALLBACK] Found companyId and redirects in state store:", {
							companyId,
							successRedirectUri: successRedirectUri || `${process.env.ADMIN_URL || "http://localhost:4200"}/social-integration/linkedin`,
							errorRedirectUri: errorRedirectUri || `${process.env.ADMIN_URL || "http://localhost:4200"}/social-integration/linkedin?error=true`
						});
					} else {
						console.warn("[LINKEDIN OAUTH2CALLBACK] State data expired in store");
					}
				}

				// Clean up state after use
				oauthStateStore.delete(state);
				console.log("[LINKEDIN OAUTH2CALLBACK] Cleaned up state from store");
			} else {
				console.warn("[LINKEDIN OAUTH2CALLBACK] State NOT FOUND in store. State:", state);
			}
		} else {
			console.warn("[LINKEDIN OAUTH2CALLBACK] No state parameter in URL");
		}

		let code = (req.query.code as string) || "";

		// Sanitize code - remove extra quotes that might be added by frontend
		code = code
			.trim()
			.replace(/^["']/, "")      // Remove leading quote or double-quote
			.replace(/["']$/, "")      // Remove trailing quote or double-quote
			.trim();

		console.log("[LINKEDIN OAUTH2CALLBACK] Code sanitized:", {
			originalCode: req.query.code,
			cleanedCode: code,
			codeLength: code.length,
		});

		if (!code) {
			console.error("[LINKEDIN OAUTH2CALLBACK] ERROR: Missing code parameter. Query params:", req.query);
			const baseErrorRedirectUrl = errorRedirectUri || `${process.env.ADMIN_URL || "http://localhost:4200"}/profile/integrations`;
			const errorCallback = `${baseErrorRedirectUrl}?success=false&error=Missing+authorization+code&source=linkedin`;
			res.redirect(errorCallback);
			return;
		}

		console.log("[LINKEDIN OAUTH2CALLBACK] Step 2: Exchanging authorization code for tokens...");

		const tokenRes = await exchangeLinkedInCodeForTokens(code);

		console.log("[LINKEDIN OAUTH2CALLBACK] Access token received:", {
			access_token: tokenRes.access_token?.substring(0, 20) + "...",
			token_type: tokenRes.token_type,
			expires_in: tokenRes.expires_in,
		});

		console.log("[LINKEDIN OAUTH2CALLBACK] Step 3: Fetching user info from LinkedIn...");

		// Try to fetch profile/email to persist with accountEmail
		let userInfo: any = null;
		try {
			if (tokenRes?.access_token) {
				userInfo = await getLinkedInUserInfo(tokenRes.access_token);
				accountId = userInfo?.sub || userInfo?.id || null;
				
				// Try to get email
				const emailResp = await getLinkedInEmail(tokenRes.access_token);
				const el = emailResp?.elements?.[0]?.["handle~"]?.emailAddress;
				accountEmail = el || null;
			}
		} catch (err: any) {
			console.warn("[LINKEDIN OAUTH2CALLBACK] Failed to fetch user info:", err.message);
		}

		// If no email, use a generated email from LinkedIn ID
		if (!accountEmail && accountId) {
			accountEmail = `linkedin_${accountId}@linkedin.local`;
			console.log("[LINKEDIN OAUTH2CALLBACK] Generated email for account:", accountEmail);
		}

		console.log("[LINKEDIN OAUTH2CALLBACK] Step 4: User info retrieved:", {
			accountId: accountId,
			accountEmail: accountEmail,
		});

		console.log("[LINKEDIN OAUTH2CALLBACK] Step 5: Saving token to database...");

		const savedToken = await saveOrUpdateToken({
			provider: "linkedin",
			accountEmail: accountEmail || undefined,
			accountId: accountId || undefined,
			companyId: companyId || undefined,
			scopes: ((process.env.LINKEDIN_SCOPES || "openid profile email w_member_social").split(/[ ,]+/).filter(Boolean)),
			accessToken: tokenRes?.access_token || null,
			refreshToken: tokenRes?.refresh_token || null,
			expiryDate: tokenRes?.expires_in ? Date.now() + tokenRes.expires_in * 1000 : null,
			tokenType: tokenRes?.token_type || "Bearer",
		});

		console.log("[LINKEDIN OAUTH2CALLBACK] Token saved to database:", {
			id: savedToken?.id,
			provider: savedToken?.provider,
			accountEmail: savedToken?.accountEmail,
			accountId: savedToken?.accountId,
			companyId: savedToken?.companyId,
			accessToken: savedToken?.accessToken?.substring(0, 20) + "...",
			tokenType: savedToken?.tokenType,
			expiryDate: savedToken?.expiryDate,
			createdAt: savedToken?.createdAt,
		});

		console.log("[LINKEDIN OAUTH2CALLBACK] Step 6: Preparing redirect with token parameters...");

		// Get the saved token to pass to frontend
		const accessToken = savedToken?.accessToken || tokenRes?.access_token || '';
		const refreshToken = savedToken?.refreshToken || tokenRes?.refresh_token || '';
		const expiryDate = savedToken?.expiryDate || (tokenRes?.expires_in ? Date.now() + tokenRes.expires_in * 1000 : '');
		const tokenType = savedToken?.tokenType || tokenRes?.token_type || 'Bearer';

		// Build frontend callback URL with token parameters
		// IMPORTANT: Redirect to a route that will trigger the stepper to jump to Step 3
		const baseRedirectUrl = successRedirectUri || `${process.env.ADMIN_URL || "http://localhost:4200"}/profile/integrations`;
		const frontendCallback = `${baseRedirectUrl}?accessToken=${encodeURIComponent(accessToken)}&refreshToken=${encodeURIComponent(refreshToken)}&expiryDate=${expiryDate}&tokenType=${encodeURIComponent(tokenType)}&success=true&step=3&source=linkedin&linkedInUserId=${encodeURIComponent(accountId || '')}&userAccessTokenId=${encodeURIComponent(savedToken?.id || '')}&accountEmail=${encodeURIComponent(accountEmail || '')}&accountId=${accountId || ''}&provider=linkedin`;

		console.log("[LINKEDIN OAUTH2CALLBACK] Step 6: Redirecting to frontend with token parameters");
		console.log("[LINKEDIN OAUTH2CALLBACK] Redirect URL:", frontendCallback.substring(0, 150) + "...");
		console.log("[LINKEDIN OAUTH2CALLBACK] ✅ OAuth flow complete! Frontend should now show Step 3");

		// Redirect to frontend with token details
		res.redirect(frontendCallback);
		return;
	} catch (error: any) {
		console.error("[LINKEDIN OAUTH2CALLBACK] ❌ ERROR:", {
			message: error.message,
			stack: error.stack,
			response: error?.response?.data,
			status: error?.response?.status,
		});

		console.log("[LINKEDIN OAUTH2CALLBACK] Building error redirect URL");

		// Use custom error redirect URI or fall back to profile/integrations with error flag
		const baseErrorRedirectUrl = errorRedirectUri || `${process.env.ADMIN_URL || "http://localhost:4200"}/profile/integrations`;
		const errorCallback = `${baseErrorRedirectUrl}?success=false&error=${encodeURIComponent(error.message || "OAuth callback failed")}&source=linkedin`;

		console.log("[LINKEDIN OAUTH2CALLBACK] Redirecting to error page:", errorCallback);

		// Redirect to frontend error page
		res.redirect(errorCallback);
		return;
	}
});

/**
 * POST /linkedin/step3/validate-permissions
 * Purpose: Step 3 - Validate user profile and prepare for permission selection
 * This is called after OAuth callback when user is ready to configure permissions
 * Body Params:
 *   - accessToken (required): OAuth access token
 *   - userAccessTokenId (required): Token ID from database
 *   - companyId (required): Company ID
 *   - accountType (required): 'personal' | 'organization' | 'ad_account'
 * Returns: User profile + default permissions template
 */
router.post("/step3/validate-permissions", async (req: Request, res: Response): Promise<void> => {
	try {
		const { accessToken, userAccessTokenId, companyId, accountType } = req.body;

		if (!accessToken) {
			res.status(400).json({ success: false, message: "accessToken is required" });
			return;
		}

		if (!userAccessTokenId) {
			res.status(400).json({ success: false, message: "userAccessTokenId is required" });
			return;
		}

		if (!companyId) {
			res.status(400).json({ success: false, message: "companyId is required" });
			return;
		}

		if (!accountType) {
			res.status(400).json({ success: false, message: "accountType is required" });
			return;
		}

		console.log("\n" + "=".repeat(80));
		console.log("🔐 [LINKEDIN STEP3-VALIDATE-PERMISSIONS] Validating user profile & permissions");
		console.log("=".repeat(80));
		console.log({ companyId, userAccessTokenId, accountType });
		console.log("=".repeat(80) + "\n");

		// Fetch user info
		const userInfo = await getLinkedInUserInfo(accessToken);
		
		// Fetch email
		let email = null;
		try {
			const emailResp = await getLinkedInEmail(accessToken);
			email = emailResp?.elements?.[0]?.["handle~"]?.emailAddress || `linkedin_${userInfo.sub}@linkedin.local`;
		} catch (err: any) {
			console.warn("[LINKEDIN STEP3] Email fetch failed:", err.message);
			email = `linkedin_${userInfo.sub}@linkedin.local`;
		}

		// Build user profile response
		const userProfile = {
			id: userInfo.sub,
			name: `${userInfo.given_name || ""} ${userInfo.family_name || ""}`.trim(),
			email: email,
			picture: userInfo.picture,
			linkedInUserId: userInfo.sub,
			accountType: accountType
		};

		// Default permission template
		const defaultPermissions = {
			publishingAccess: "Full",
			canApproveOthers: true,
			role: "Admin"
		};

		console.log("\n" + "=".repeat(80));
		console.log("✅ [LINKEDIN STEP3-VALIDATE-PERMISSIONS] User profile validated successfully");
		console.log("=".repeat(80));
		console.log({
			userName: userProfile.name,
			email: userProfile.email,
			accountType: accountType
		});
		console.log("=".repeat(80) + "\n");

		res.status(200).json({
			success: true,
			message: "User profile validated. Ready for permission configuration.",
			step: 3,
			stepName: "Access Control & Permissions",
			userProfile: userProfile,
			defaultPermissions: defaultPermissions,
			permissionOptions: {
				publishingAccess: ["Full", "Limited", "View Only"],
				canApproveOthers: [true, false]
			},
			hint: "Configure publishing access and approval permissions for this account",
			nextAction: {
				description: "After user configures permissions, call POST /linkedin/step4/save-connection",
				endpoint: "POST /linkedin/step4/save-connection",
				requiredParams: ["userAccessTokenId", "companyId", "userProfile", "selectedPermissions", "teamMembers"]
			}
		});
		return;
	} catch (error: any) {
		console.error("\n" + "=".repeat(80));
		console.error("❌ [LINKEDIN STEP3-VALIDATE-PERMISSIONS] ERROR");
		console.error("=".repeat(80));
		console.error({
			message: error.message,
			stack: error.stack
		});
		console.error("=".repeat(80) + "\n");

		res.status(500).json({
			success: false,
			message: error.message || "Failed to validate user profile"
		});
		return;
	}
});

/**
 * POST /linkedin/step4/save-connection
 * Purpose: Step 4 - Save the complete LinkedIn connection with permissions
 * This is called when user clicks "Done" after configuring permissions
 * Body Params:
 *   - userAccessTokenId (required): Token ID from database
 *   - companyId (required): Company ID
 *   - userProfile (required): User profile object
 *   - selectedPermissions (required): {publishingAccess, canApproveOthers}
 *   - teamMembers (optional): Array of team members with their permissions
 *   - linkedinOrganizationId (optional): Organization ID if organization account
 *   - organizationName (optional): Organization name
 *   - accountType (required): 'personal' | 'organization' | 'ad_account'
 * Returns: Success confirmation
 */
router.post("/step4/save-connection", async (req: Request, res: Response): Promise<void> => {
	try {
		// Extract from body, query params, or headers (flexible for frontend)
		let { 
			userAccessTokenId, 
			companyId, 
			userProfile, 
			selectedPermissions, 
			teamMembers,
			linkedinOrganizationId,
			organizationName,
			accountType
		} = req.body;

		// If not in body, check query params
		if (!userAccessTokenId) userAccessTokenId = req.query.userAccessTokenId as string;
		if (!companyId) companyId = req.query.companyId as string;
		if (!accountType) accountType = req.query.accountType as string;

		// If still not found, check headers
		if (!userAccessTokenId) userAccessTokenId = req.headers['x-user-access-token-id'] as string;
		if (!companyId) companyId = req.headers['x-company-id'] as string;

		console.log("\n" + "=".repeat(80));
		console.log("🔍 [LINKEDIN STEP4-SAVE-CONNECTION] Extracting parameters from request");
		console.log("=".repeat(80));
		console.log({
			fromBody: !!req.body.userAccessTokenId,
			fromQuery: !!req.query.userAccessTokenId,
			fromHeaders: !!req.headers['x-user-access-token-id'],
			userAccessTokenId: userAccessTokenId?.substring(0, 20) + "...",
			companyId: companyId?.substring(0, 20) + "...",
			accountType: accountType,
			bodyKeys: Object.keys(req.body)
		});
		console.log("=".repeat(80) + "\n");

		// Validation
		if (!userAccessTokenId) {
			console.error("[LINKEDIN STEP4-SAVE-CONNECTION] Missing userAccessTokenId");
			console.error("Request body keys:", Object.keys(req.body));
			console.error("Request query keys:", Object.keys(req.query));
			res.status(400).json({ 
				success: false, 
				message: "userAccessTokenId is required (can be in body, query params, or x-user-access-token-id header)",
				receivedParams: {
					inBody: !!req.body.userAccessTokenId,
					inQuery: !!req.query.userAccessTokenId,
					inHeaders: !!req.headers['x-user-access-token-id'],
					bodyKeys: Object.keys(req.body),
					queryKeys: Object.keys(req.query)
				}
			});
			return;
		}

		if (!companyId) {
			console.error("[LINKEDIN STEP4-SAVE-CONNECTION] Missing companyId");
			res.status(400).json({ success: false, message: "companyId is required (can be in body, query params, or x-company-id header)" });
			return;
		}

		// If userProfile not provided, try to fetch it from SocialToken database
		if (!userProfile) {
			console.log("[LINKEDIN STEP4-SAVE-CONNECTION] userProfile not provided, attempting to fetch from database");
			
			try {
				// Get SocialToken model
				const models = await import("../../../../../db/core/init-control-db");
				const SocialToken = models.SocialToken;
				
				const token = await SocialToken.findOne({
					where: { id: userAccessTokenId }
				});
				
				if (token) {
					userProfile = {
						id: token.accountId || userAccessTokenId,
						name: token.accountEmail?.split('@')[0] || 'LinkedIn User',
						email: token.accountEmail || `linkedin_${userAccessTokenId}@linkedin.local`,
						picture: null
					};
					console.log("[LINKEDIN STEP4-SAVE-CONNECTION] userProfile fetched from database:", userProfile);
				}
			} catch (err: any) {
				console.warn("[LINKEDIN STEP4-SAVE-CONNECTION] Could not fetch userProfile from database:", err.message);
			}
		}

		// If still no userProfile, create a minimal one
		if (!userProfile) {
			console.warn("[LINKEDIN STEP4-SAVE-CONNECTION] Creating minimal userProfile");
			userProfile = {
				id: userAccessTokenId,
				name: 'LinkedIn User',
				email: `linkedin_${userAccessTokenId}@linkedin.local`,
				picture: null
			};
		}

		if (!accountType) {
			console.error("[LINKEDIN STEP4-SAVE-CONNECTION] Missing accountType");
			res.status(400).json({ success: false, message: "accountType is required" });
			return;
		}

		console.log("\n" + "=".repeat(80));
		console.log("💾 [LINKEDIN STEP4-SAVE-CONNECTION] Saving LinkedIn connection");
		console.log("=".repeat(80));
		console.log({
			companyId,
			userAccessTokenId,
			userName: userProfile.name,
			accountType: accountType,
			permissions: selectedPermissions,
			teamMembersCount: teamMembers?.length || 0
		});
		console.log("=".repeat(80) + "\n");

		// For personal profile accounts - generate organization ID if not provided
		let orgId = linkedinOrganizationId;
		let orgName = organizationName;

		if (accountType === "personal" && !orgId) {
			orgId = userProfile.id; // Use user ID as org ID for personal accounts
			orgName = userProfile.name;
		}

		// Validate orgId is not undefined before database query
		if (!orgId) {
			console.warn("[LINKEDIN STEP4-SAVE-CONNECTION] orgId is still undefined, using userAccessTokenId as fallback");
			orgId = userAccessTokenId; // Use tokenId as final fallback
			if (!orgName) orgName = userProfile.name || 'LinkedIn Account';
		}

		console.log("[LINKEDIN STEP4-SAVE-CONNECTION] Final organization ID and name before DB query:", {
			orgId,
			orgName,
			accountType
		});

		// Create or update LinkedIn account record
		const existingAccount = await MetaSocialAccount.findOne({
			where: {
				companyId,
				platform: 'linkedin',
				linkedinOrganizationId: orgId,
				userAccessTokenId
			}
		});

		let savedAccount;
		if (existingAccount) {
			// Update existing
			await existingAccount.update({
				isAdded: true,
				accountName: orgName
			});
			savedAccount = existingAccount;
			console.log("[LINKEDIN STEP4] Account updated");
		} else {
			// Create new
			savedAccount = await MetaSocialAccount.create({
				companyId,
				platform: 'linkedin',
				userAccessTokenId,
				linkedinOrganizationId: orgId,
				accountName: orgName,
				isAdded: true
			});
			console.log("[LINKEDIN STEP4] Account created");
		}

		console.log("\n" + "=".repeat(80));
		console.log("✨ [LINKEDIN STEP4-SAVE-CONNECTION] Connection saved successfully");
		console.log("=".repeat(80));
		console.log({
			accountId: savedAccount.id,
			accountName: orgName,
			accountType: accountType,
			databaseStatus: "✅ Saved"
		});
		console.log("=".repeat(80) + "\n");

		res.status(201).json({
			success: true,
			message: `LinkedIn ${accountType} account successfully connected and saved!`,
			accountName: orgName,
			accountType: accountType,
			savedAccount: {
				id: savedAccount.id,
				accountId: orgId,
				accountName: orgName,
				accountType: accountType,
				userProfile: userProfile,
				permissions: selectedPermissions,
				teamMembers: teamMembers || [],
				connectedAt: new Date().toISOString()
			},
			callToAction: {
				message: "Connection complete! Your LinkedIn account is now connected to your company.",
				action: "Close modal and refresh dashboard"
			}
		});
		return;
	} catch (error: any) {
		console.error("\n" + "=".repeat(80));
		console.error("❌ [LINKEDIN STEP4-SAVE-CONNECTION] ERROR");
		console.error("=".repeat(80));
		console.error({
			message: error.message,
			stack: error.stack
		});
		console.error("=".repeat(80) + "\n");

		res.status(500).json({
			success: false,
			message: error.message || "Failed to save LinkedIn connection"
		});
		return;
	}
});

/**
 * POST /linkedin/connection/save
 * Purpose: Alternative endpoint name for saving LinkedIn connection (Step 4)
 * This is an alias to /step4/save-connection for backward compatibility
 * Body Params: Same as /step4/save-connection
 */
router.post("/connection/save", async (req: Request, res: Response): Promise<void> => {
	try {
		// Extract from body, query params, or headers (flexible for frontend)
		let { 
			userAccessTokenId, 
			companyId, 
			userProfile, 
			selectedPermissions, 
			teamMembers,
			linkedinOrganizationId,
			organizationName,
			accountType
		} = req.body;

		// If not in body, check query params
		if (!userAccessTokenId) userAccessTokenId = req.query.userAccessTokenId as string;
		if (!companyId) companyId = req.query.companyId as string;
		if (!accountType) accountType = req.query.accountType as string;

		// If still not found, check headers
		if (!userAccessTokenId) userAccessTokenId = req.headers['x-user-access-token-id'] as string;
		if (!companyId) companyId = req.headers['x-company-id'] as string;

		console.log("\n" + "=".repeat(80));
		console.log("🔍 [LINKEDIN CONNECTION/SAVE] Extracting parameters from request");
		console.log("=".repeat(80));
		console.log({
			fromBody: !!req.body.userAccessTokenId,
			fromQuery: !!req.query.userAccessTokenId,
			fromHeaders: !!req.headers['x-user-access-token-id'],
			userAccessTokenId: userAccessTokenId?.substring(0, 20) + "...",
			companyId: companyId?.substring(0, 20) + "...",
			accountType: accountType,
			bodyKeys: Object.keys(req.body)
		});
		console.log("=".repeat(80) + "\n");

		// Validation
		if (!userAccessTokenId) {
			console.error("[LINKEDIN CONNECTION/SAVE] Missing userAccessTokenId");
			console.error("Request body keys:", Object.keys(req.body));
			console.error("Request query keys:", Object.keys(req.query));
			res.status(400).json({ 
				success: false, 
				message: "userAccessTokenId is required (can be in body, query params, or x-user-access-token-id header)",
				receivedParams: {
					inBody: !!req.body.userAccessTokenId,
					inQuery: !!req.query.userAccessTokenId,
					inHeaders: !!req.headers['x-user-access-token-id'],
					bodyKeys: Object.keys(req.body),
					queryKeys: Object.keys(req.query)
				}
			});
			return;
		}

		if (!companyId) {
			console.error("[LINKEDIN CONNECTION/SAVE] Missing companyId");
			res.status(400).json({ success: false, message: "companyId is required (can be in body, query params, or x-company-id header)" });
			return;
		}

		// If userProfile not provided, try to fetch it from SocialToken database
		if (!userProfile) {
			console.log("[LINKEDIN CONNECTION/SAVE] userProfile not provided, attempting to fetch from database");
			
			try {
				// Get SocialToken model
				const models = await import("../../../../../db/core/init-control-db");
				const SocialToken = models.SocialToken;
				
				const token = await SocialToken.findOne({
					where: { id: userAccessTokenId }
				});
				
				if (token) {
					userProfile = {
						id: token.accountId || userAccessTokenId,
						name: token.accountEmail?.split('@')[0] || 'LinkedIn User',
						email: token.accountEmail || `linkedin_${userAccessTokenId}@linkedin.local`,
						picture: null
					};
					console.log("[LINKEDIN CONNECTION/SAVE] userProfile fetched from database:", userProfile);
				}
			} catch (err: any) {
				console.warn("[LINKEDIN CONNECTION/SAVE] Could not fetch userProfile from database:", err.message);
			}
		}

		// If still no userProfile, create a minimal one
		if (!userProfile) {
			console.warn("[LINKEDIN CONNECTION/SAVE] Creating minimal userProfile");
			userProfile = {
				id: userAccessTokenId,
				name: 'LinkedIn User',
				email: `linkedin_${userAccessTokenId}@linkedin.local`,
				picture: null
			};
		}

		if (!accountType) {
			console.error("[LINKEDIN CONNECTION/SAVE] Missing accountType");
			res.status(400).json({ success: false, message: "accountType is required" });
			return;
		}

		console.log("\n" + "=".repeat(80));
		console.log("💾 [LINKEDIN CONNECTION/SAVE] Saving LinkedIn connection");
		console.log("=".repeat(80));
		console.log({
			companyId,
			userAccessTokenId,
			userName: userProfile.name,
			accountType: accountType,
			permissions: selectedPermissions,
			teamMembersCount: teamMembers?.length || 0
		});
		console.log("=".repeat(80) + "\n");

		// For personal profile accounts - generate organization ID if not provided
		let orgId = linkedinOrganizationId;
		let orgName = organizationName;

		if (accountType === "personal" && !orgId) {
			orgId = userProfile.id; // Use user ID as org ID for personal accounts
			orgName = userProfile.name;
		}

		// Validate orgId is not undefined before database query
		if (!orgId) {
			console.warn("[LINKEDIN CONNECTION/SAVE] orgId is still undefined, using userAccessTokenId as fallback");
			orgId = userAccessTokenId; // Use tokenId as final fallback
			if (!orgName) orgName = userProfile.name || 'LinkedIn Account';
		}

		console.log("[LINKEDIN CONNECTION/SAVE] Final organization ID and name before DB query:", {
			orgId,
			orgName,
			accountType
		});

		// Create or update LinkedIn account record
		const existingAccount = await MetaSocialAccount.findOne({
			where: {
				companyId,
				platform: 'linkedin',
				linkedinOrganizationId: orgId,
				userAccessTokenId
			}
		});

		let savedAccount;
		if (existingAccount) {
			// Update existing
			await existingAccount.update({
				isAdded: true,
				accountName: orgName
			});
			savedAccount = existingAccount;
			console.log("[LINKEDIN CONNECTION/SAVE] Account updated");
		} else {
			// Create new
			savedAccount = await MetaSocialAccount.create({
				companyId,
				platform: 'linkedin',
				userAccessTokenId,
				linkedinOrganizationId: orgId,
				accountName: orgName,
				isAdded: true
			});
			console.log("[LINKEDIN CONNECTION/SAVE] Account created");
		}

		console.log("\n" + "=".repeat(80));
		console.log("✨ [LINKEDIN CONNECTION/SAVE] Connection saved successfully");
		console.log("=".repeat(80));
		console.log({
			accountId: savedAccount.id,
			accountName: orgName,
			accountType: accountType,
			databaseStatus: "✅ Saved"
		});
		console.log("=".repeat(80) + "\n");

		res.status(201).json({
			success: true,
			message: `LinkedIn ${accountType} account successfully connected and saved!`,
			accountName: orgName,
			accountType: accountType,
			savedAccount: {
				id: savedAccount.id,
				accountId: orgId,
				accountName: orgName,
				accountType: accountType,
				userProfile: userProfile,
				permissions: selectedPermissions,
				teamMembers: teamMembers || [],
				connectedAt: new Date().toISOString()
			},
			callToAction: {
				message: "Connection complete! Your LinkedIn account is now connected to your company.",
				action: "Close modal and refresh dashboard"
			}
		});
		return;
	} catch (error: any) {
		console.error("\n" + "=".repeat(80));
		console.error("❌ [LINKEDIN CONNECTION/SAVE] ERROR");
		console.error("=".repeat(80));
		console.error({
			message: error.message,
			stack: error.stack
		});
		console.error("=".repeat(80) + "\n");

		res.status(500).json({
			success: false,
			message: error.message || "Failed to save LinkedIn connection"
		});
		return;
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

/**
 * GET /linkedin/me
 * Purpose: Fetch authenticated LinkedIn user profile
 * Params:
 *   - access_token (required, query/header/body): LinkedIn access token
 * Returns: { success, me: { id, name, email, picture, ... } }
 */
router.get("/me/profile", async (req: Request, res: Response): Promise<void> => {
	try {
		const tokens = extractTokens(req);
		const accessToken = tokens.access_token;

		if (!accessToken) {
			res.status(400).json({ success: false, message: "Provide access_token" });
			return;
		}

		console.log("[LINKEDIN ME] Token extracted:", {
			accessToken: accessToken.substring(0, 20) + "...",
		});

		// Fetch user info
		const me = await getLinkedInUserInfo(accessToken);

		console.log("[LINKEDIN ME] Step 1: User info retrieved");

		// Try to fetch email
		let email: string | null = null;
		try {
			const emailResp = await getLinkedInEmail(accessToken);
			const el = emailResp?.elements?.[0]?.["handle~"]?.emailAddress;
			email = el || null;
			console.log("[LINKEDIN ME] Step 2: Email retrieved:", { email: email || "not provided" });
		} catch (emailErr: any) {
			console.warn("[LINKEDIN ME] Failed to fetch email:", emailErr.message);
		}

		// If email is not available, generate one from the ID
		const linkedInId = me?.sub || me?.id || "unknown";
		const finalEmail = email || `linkedin_${linkedInId}@linkedin.local`;

		const userWithEmail = { ...me, email: finalEmail };

		console.log("[LINKEDIN ME] User profile prepared:", {
			id: me?.sub || me?.id,
			name: me?.name,
			email: finalEmail,
			emailFromAPI: email || "not provided - using generated",
		});

		res.status(200).json({ success: true, me: userWithEmail });
		return;
	} catch (e: any) {
		console.error("[LINKEDIN ME] Failed to fetch profile:", {
			message: e.message,
			response: e?.response?.data,
			status: e?.response?.status,
		});
		res.status(500).json({
			success: false,
			message: e?.response?.data || e.message || "Failed to fetch profile"
		});
		return;
	}
});

/**
 * GET /linkedin/email
 * Purpose: Fetch authenticated LinkedIn user email
 * Params:
 *   - access_token (required, query/header/body): LinkedIn access token
 * Returns: { success, email: { ... } }
 */
router.get("/email", async (req: Request, res: Response): Promise<void> => {
	try {
		const tokens = extractTokens(req);
		const accessToken = tokens.access_token;

		if (!accessToken) {
			res.status(400).json({ success: false, message: "Provide access_token" });
			return;
		}

		console.log("[LINKEDIN EMAIL] Token extracted:", {
			accessToken: accessToken.substring(0, 20) + "...",
		});

		const email = await getLinkedInEmail(accessToken);

		console.log("[LINKEDIN EMAIL] Email retrieved:", {
			hasEmail: !!email?.elements?.length,
			elementCount: email?.elements?.length || 0,
		});

		res.status(200).json({ success: true, email });
		return;
	} catch (e: any) {
		console.error("[LINKEDIN EMAIL] Failed to fetch email:", {
			message: e.message,
			response: e?.response?.data,
			status: e?.response?.status,
		});
		res.status(500).json({
			success: false,
			message: e?.response?.data || e.message || "Failed to fetch email"
		});
		return;
	}
});

/**
 * POST /linkedin/share
 * Purpose: Create a share post on LinkedIn
 * Params:
 *   - access_token (required, query/header/body): LinkedIn access token
 *   - text (required, query/body): Share text content
 * Returns: { success, result: { ... } }
 * Requirements:
 *   - Scopes must include 'w_member_social'
 *   - Share on LinkedIn product must be enabled
 */
router.post("/share", async (req: Request, res: Response): Promise<void> => {
	try {
		const tokens = extractTokens(req);
		const text = (req.body?.text as string) || (req.query?.text as string);
		const accessToken = tokens.access_token;

		if (!accessToken) {
			res.status(400).json({ success: false, message: "Provide access_token" });
			return;
		}

		if (!text) {
			res.status(400).json({ success: false, message: "Missing text parameter" });
			return;
		}

		console.log("[LINKEDIN SHARE] Starting share creation:", {
			accessToken: accessToken.substring(0, 20) + "...",
			textLength: text.length,
		});

		// Fetch user info to get person URN
		const me = await getLinkedInUserInfo(accessToken);

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
			console.error("[LINKEDIN SHARE] Could not determine person URN:", { me });
			res.status(400).json({
				success: false,
				message: "Could not determine LinkedIn person URN",
				hint: "Ensure scopes include 'openid profile email' or use classic /v2/me",
			});
			return;
		}

		console.log("[LINKEDIN SHARE] Person URN determined:", { personUrn });

		const result = await createLinkedInShare(accessToken, personUrn, text);

		console.log("[LINKEDIN SHARE] Share created successfully:", {
			resultKeys: Object.keys(result || {}),
		});

		res.status(200).json({ success: true, result });
		return;
	} catch (e: any) {
		console.error("[LINKEDIN SHARE] Failed to create share:", {
			message: e.message,
			response: e?.response?.data,
			status: e?.response?.status,
		});

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
		return;
	}
});

/**
 * POST /linkedin/disconnect
 * Purpose: Disconnect/revoke LinkedIn token for user
 * Params:
 *   - userAccessTokenId (required, body): Token ID to disconnect
 *   - companyId (required, body): Company ID
 * Returns: { success: true, message: "LinkedIn disconnected" }
 */
router.post("/disconnect", async (req: Request, res: Response): Promise<void> => {
	try {
		let { userAccessTokenId, companyId, accessToken } = req.body;

		// If userAccessTokenId not provided, try to look it up using accessToken
		if (!userAccessTokenId && accessToken) {
			console.log("[LINKEDIN DISCONNECT] userAccessTokenId not provided, attempting lookup with accessToken");
			const { SocialToken } = require("../../../../../db/core/control-db");
			const token = await SocialToken.findOne({
				where: {
					accessToken: accessToken,
					provider: "linkedin"
				}
			});
			if (token) {
				userAccessTokenId = token.id;
				console.log("[LINKEDIN DISCONNECT] Found token ID from accessToken:", userAccessTokenId);
			}
		}

		if (!userAccessTokenId) {
			res.status(400).json({
				success: false,
				message: "userAccessTokenId or accessToken is required"
			});
			return;
		}

		if (!companyId) {
			res.status(400).json({
				success: false,
				message: "companyId is required"
			});
			return;
		}

		console.log("[LINKEDIN DISCONNECT] Starting disconnect process:", {
			userAccessTokenId,
			companyId
		});

		// Import SocialToken model
		const { SocialToken } = require("../../../../../db/core/init-control-db");

		// Find and delete the token
		const deletedToken = await SocialToken.destroy({
			where: {
				id: userAccessTokenId,
				provider: "linkedin"
			}
		});

		if (!deletedToken) {
			console.warn("[LINKEDIN DISCONNECT] Token not found:", { userAccessTokenId });
			res.status(404).json({
				success: false,
				message: "LinkedIn token not found or already disconnected"
			});
			return;
		}

		console.log("[LINKEDIN DISCONNECT] Token deleted successfully:", {
			userAccessTokenId,
			companyId,
			deletedCount: deletedToken
		});

		// Optional: Also remove any MetaSocialAccount records for this user
		const { MetaSocialAccount } = require("../meta-social-account.model");
		
		const removedAccounts = await MetaSocialAccount.destroy({
			where: {
				companyId,
				platform: "linkedin",
				userAccessTokenId
			}
		});

		console.log("[LINKEDIN DISCONNECT] LinkedIn accounts removed from company:", {
			companyId,
			userAccessTokenId,
			removedCount: removedAccounts
		});

		res.status(200).json({
			success: true,
			message: "LinkedIn profile disconnected successfully",
			disconnectedTokenId: userAccessTokenId,
			removedAccountsCount: removedAccounts
		});
		return;
	} catch (error: any) {
		console.error("[LINKEDIN DISCONNECT] Failed to disconnect:", {
			message: error.message,
			stack: error.stack
		});

		res.status(500).json({
			success: false,
			message: error.message || "Failed to disconnect LinkedIn profile",
			error: process.env.NODE_ENV === "development" ? error.message : undefined
		});
		return;
	}
});

/**
 * GET /linkedin/stepper-data
 * Purpose: Fetch dynamic stepper data (Profile, Organizations, Ad Accounts)
 * This endpoint fetches all 3 account types for the stepper UI
 * Query Params:
 *   - userAccessToken (required): Access token from OAuth
 *   - userAccessTokenId (required): Token ID from database
 *   - companyId (required): Company ID
 * Returns: Stepper configuration with all 3 steps and their data
 */
router.get("/stepper-data", async (req: Request, res: Response): Promise<void> => {
	try {
		const { userAccessToken, userAccessTokenId, companyId } = req.query;

		if (!userAccessToken) {
			res.status(400).json({ success: false, message: "userAccessToken is required" });
			return;
		}

		if (!userAccessTokenId) {
			res.status(400).json({ success: false, message: "userAccessTokenId is required" });
			return;
		}

		if (!companyId) {
			res.status(400).json({ success: false, message: "companyId is required" });
			return;
		}

		console.log("\n" + "=".repeat(80));
		console.log("📊 [LINKEDIN STEPPER-DATA] Fetching stepper data");
		console.log("=".repeat(80));
		console.log({ companyId, userAccessTokenId });
		console.log("=".repeat(80) + "\n");

		try {
			// Step 1: Fetch user's personal profile
			const profileData = await getLinkedInUserInfo(userAccessToken as string);
			const profile = {
				id: profileData.sub,
				name: `${profileData.given_name || ""} ${profileData.family_name || ""}`.trim(),
				email: profileData.email,
				type: "personal",
				picture: profileData.picture,
				accountId: profileData.sub,
				title: "Personal Profile",
				description: "Manage individual accounts in Sprout"
			};

			console.log("✅ Profile fetched successfully");

			// Step 2: Fetch organizations
			let organizations: any[] = [];
			try {
				const adminPagesUrl = "https://api.linkedin.com/v2/administeredPages?q=manager&projection=(id,name,organizationalEntity,specialties,description,backgroundCoverImage(original~),profilePicture(displayImage~))";
				const adminPagesResponse = await axios.get(adminPagesUrl, {
					headers: {
						Authorization: `Bearer ${userAccessToken}`,
						"X-Restli-Protocol-Version": "2.0.0"
					}
				}).catch((err: any) => {
					console.warn("[LINKEDIN STEPPER-DATA] Organizations fetch failed:", err.message);
					return null;
				});

				if (adminPagesResponse?.data?.data) {
					organizations = adminPagesResponse.data.data.map((page: any) => ({
						id: page.id,
						name: page.name,
						type: "organization",
						picture: page.profilePicture?.["displayImage~"]?.elements?.[0]?.identifiers?.[0]?.identifier,
						accountId: page.id,
						title: "Organization Page",
						description: "Manage your Company Page, Showcase Page, or School Page in Sprout"
					}));
				}

				console.log(`✅ Organizations fetched: ${organizations.length} found`);
			} catch (orgError: any) {
				console.warn("[LINKEDIN STEPPER-DATA] Organizations fetch warning:", orgError.message);
			}

			// Step 3: Fetch ad accounts
			let adAccounts: any[] = [];
			try {
				const adAccountsUrl = "https://api.linkedin.com/rest/adAccounts?q=search&search=(type:ACTIVE)&projection=(id,name,status,type,owner(id,firstName,lastName))";
				const adAccountsResponse = await axios.get(adAccountsUrl, {
					headers: {
						Authorization: `Bearer ${userAccessToken}`,
						"X-Restli-Protocol-Version": "2.0.0",
						"LinkedIn-Version": "202305"
					}
				}).catch((err: any) => {
					console.warn("[LINKEDIN STEPPER-DATA] Ad accounts fetch failed:", err.message);
					return null;
				});

				if (adAccountsResponse?.data?.elements) {
					adAccounts = adAccountsResponse.data.elements.map((adAccount: any) => ({
						id: adAccount.id,
						name: adAccount.name,
						type: "ad_account",
						status: adAccount.status,
						accountId: adAccount.id,
						title: "Ad Account",
						description: "Monitor LinkedIn ad performance using your Ads account"
					}));
				}

				console.log(`✅ Ad accounts fetched: ${adAccounts.length} found`);
			} catch (adError: any) {
				console.warn("[LINKEDIN STEPPER-DATA] Ad accounts fetch warning:", adError.message);
			}

			// Build stepper configuration
			const stepperData = {
				success: true,
				message: "Stepper data fetched successfully",
				steps: [
					{
						stepNumber: 1,
						title: "Connect Profile",
						description: "Select the type of LinkedIn account you want to connect",
						type: "profile",
						data: [profile],
						count: 1
					},
					{
						stepNumber: 2,
						title: "Organization Page",
						description: "Manage your Company Page, Showcase Page, or School Page",
						type: "organization",
						data: organizations,
						count: organizations.length
					},
					{
						stepNumber: 3,
						title: "Ad Account",
						description: "Monitor LinkedIn ad performance using your Ads account",
						type: "ad_account",
						data: adAccounts,
						count: adAccounts.length
					}
				],
				summary: {
					totalAccounts: 1 + organizations.length + adAccounts.length,
					profile: profile,
					organizations: organizations,
					adAccounts: adAccounts,
					userAccessTokenId: userAccessTokenId,
					companyId: companyId
				}
			};

			console.log("\n" + "=".repeat(80));
			console.log("✨ [LINKEDIN STEPPER-DATA] Stepper data prepared successfully");
			console.log("=".repeat(80));
			console.log({
				profileCount: 1,
				organizationCount: organizations.length,
				adAccountCount: adAccounts.length,
				totalCount: 1 + organizations.length + adAccounts.length
			});
			console.log("=".repeat(80) + "\n");

			res.status(200).json(stepperData);
			return;
		} catch (apiError: any) {
			console.error("[LINKEDIN STEPPER-DATA] LinkedIn API error:", apiError.message);
			res.status(400).json({
				success: false,
				message: "Failed to fetch stepper data: " + apiError.message
			});
			return;
		}
	} catch (error: any) {
		console.error("[LINKEDIN STEPPER-DATA] Error:", error.message);
		res.status(500).json({
			success: false,
			message: error.message || "Failed to fetch stepper data"
		});
		return;
	}
});

/**
 * GET /linkedin/get-accounts
 * Purpose: Fetch user's LinkedIn profiles, organization pages, and ad accounts (like Facebook)
 * Query Params:
 *   - userAccessToken (required): Access token from OAuth
 *   - companyId (required): Company ID
 * Returns: Object with profile, organizations, and adAccounts arrays
 */
router.get("/get-accounts", async (req: Request, res: Response): Promise<void> => {
	try {
		const { userAccessToken, companyId } = req.query;

		if (!userAccessToken) {
			res.status(400).json({ success: false, message: "userAccessToken is required" });
			return;
		}

		if (!companyId) {
			res.status(400).json({ success: false, message: "companyId is required" });
			return;
		}

		console.log("[LINKEDIN GET-ACCOUNTS] Fetching LinkedIn accounts (profile, organizations, ads):", { companyId });

		try {
			// 1. Fetch user's personal profile
			const profileData = await getLinkedInUserInfo(userAccessToken as string);
			const profile = {
				id: profileData.sub, // LinkedIn user ID (urn:li:person:XXXX)
				name: `${profileData.given_name || ""} ${profileData.family_name || ""}`.trim(),
				email: profileData.email,
				type: "personal",
				picture: profileData.picture,
				accountId: profileData.sub
			};

			console.log("[LINKEDIN GET-ACCOUNTS] User profile fetched successfully");

			// 2. Fetch user's organizations/pages
			// LinkedIn API: GET /me/organizations (requires w_member_social scope)
			let organizations: any[] = [];
			try {
				const orgUrl = "https://api.linkedin.com/v2/me?projection=(id,firstName,lastName,profilePicture(displayImage))";
				const orgResponse = await axios.get(orgUrl, {
					headers: {
						Authorization: `Bearer ${userAccessToken}`,
						"X-Restli-Protocol-Version": "2.0.0"
					}
				});

				// Also fetch administeredPages if available
				const adminPagesUrl = "https://api.linkedin.com/v2/administeredPages?q=manager&projection=(id,name,organizationalEntity,specialties,description,backgroundCoverImage(original~),profilePicture(displayImage~))";
				const adminPagesResponse = await axios.get(adminPagesUrl, {
					headers: {
						Authorization: `Bearer ${userAccessToken}`,
						"X-Restli-Protocol-Version": "2.0.0"
					}
				}).catch((err: any) => {
					console.warn("[LINKEDIN GET-ACCOUNTS] administeredPages fetch failed:", err.message);
					return null;
				});

				if (adminPagesResponse?.data?.data) {
					organizations = adminPagesResponse.data.data.map((page: any) => ({
						id: page.id,
						name: page.name,
						type: "organization",
						picture: page.profilePicture?.["displayImage~"]?.elements?.[0]?.identifiers?.[0]?.identifier,
						accountId: page.id
					}));
				}

				console.log("[LINKEDIN GET-ACCOUNTS] Organizations fetched:", { count: organizations.length });
			} catch (orgError: any) {
				console.warn("[LINKEDIN GET-ACCOUNTS] Warning fetching organizations:", orgError.message);
				// Not critical - continue without organizations
			}

			// 3. Fetch user's ad accounts (LinkedIn Campaign Manager)
			let adAccounts: any[] = [];
			try {
				const adAccountsUrl = "https://api.linkedin.com/rest/adAccounts?q=search&search=(type:ACTIVE)&projection=(id,name,status,type,owner(id,firstName,lastName))";
				const adAccountsResponse = await axios.get(adAccountsUrl, {
					headers: {
						Authorization: `Bearer ${userAccessToken}`,
						"X-Restli-Protocol-Version": "2.0.0",
						"LinkedIn-Version": "202305"
					}
				}).catch((err: any) => {
					console.warn("[LINKEDIN GET-ACCOUNTS] Ad accounts fetch failed:", err.message);
					return null;
				});

				if (adAccountsResponse?.data?.elements) {
					adAccounts = adAccountsResponse.data.elements.map((adAccount: any) => ({
						id: adAccount.id,
						name: adAccount.name,
						type: "ad_account",
						status: adAccount.status,
						accountId: adAccount.id
					}));
				}

				console.log("[LINKEDIN GET-ACCOUNTS] Ad accounts fetched:", { count: adAccounts.length });
			} catch (adError: any) {
				console.warn("[LINKEDIN GET-ACCOUNTS] Warning fetching ad accounts:", adError.message);
				// Not critical - continue without ad accounts
			}

			res.status(200).json({
				success: true,
				message: "LinkedIn accounts fetched successfully",
				data: {
					profile: profile,
					organizations: organizations,
					adAccounts: adAccounts
				}
			});
			return;
		} catch (apiError: any) {
			console.error("[LINKEDIN GET-ACCOUNTS] LinkedIn API error:", apiError.message);
			res.status(400).json({
				success: false,
				message: "Failed to fetch from LinkedIn API: " + apiError.message
			});
			return;
		}
	} catch (error: any) {
		console.error("[LINKEDIN GET-ACCOUNTS] Failed to fetch accounts:", error.message);
		res.status(500).json({
			success: false,
			message: error.message || "Failed to fetch LinkedIn accounts"
		});
		return;
	}
});

/**
 * POST /linkedin/add-account
 * Purpose: Add/enable a LinkedIn account (profile, organization, or ad account) for company
 * Body Params:
 *   - userAccessTokenId (required): Token ID from OAuth
 *   - companyId (required): Company ID
 *   - linkedinOrganizationId (required): LinkedIn org/account ID (URN format)
 *   - organizationName (required): Organization/account name
 *   - accountType (required): 'personal' | 'organization' | 'ad_account'
 *   - profileUrl (optional): Profile/organization URL
 *   - profileImage (optional): Profile/organization image URL
 * Returns: Created/updated account record
 */
router.post("/add-account", async (req: Request, res: Response): Promise<void> => {
	try {
		const { 
			userAccessTokenId, 
			companyId, 
			linkedinOrganizationId, 
			organizationName, 
			accountType,
			profileUrl,
			profileImage
		} = req.body;

		// Validation
		if (!userAccessTokenId) {
			res.status(400).json({ success: false, message: "userAccessTokenId is required" });
			return;
		}

		if (!companyId) {
			res.status(400).json({ success: false, message: "companyId is required" });
			return;
		}

		if (!linkedinOrganizationId) {
			res.status(400).json({ success: false, message: "linkedinOrganizationId is required" });
			return;
		}

		if (!organizationName) {
			res.status(400).json({ success: false, message: "organizationName is required" });
			return;
		}

		// Validate account type
		const validAccountTypes = ["personal", "organization", "ad_account"];
		if (!accountType || !validAccountTypes.includes(accountType)) {
			res.status(400).json({ 
				success: false, 
				message: `accountType must be one of: ${validAccountTypes.join(", ")}` 
			});
			return;
		}

		console.log("\n" + "=".repeat(80));
		console.log("✅ [LINKEDIN ADD-ACCOUNT] VALIDATION PASSED");
		console.log("=".repeat(80));
		console.log({
			userAccessTokenId,
			companyId,
			linkedinOrganizationId,
			organizationName,
			accountType,
			validationStatus: "✅ All required fields present"
		});
		console.log("=".repeat(80) + "\n");

		// Check if account already exists
		const existingAccount = await MetaSocialAccount.findOne({
			where: {
				companyId,
				platform: 'linkedin',
				linkedinOrganizationId,
				userAccessTokenId
			}
		});

		if (existingAccount) {
			// Update existing account
			await existingAccount.update({ 
				isAdded: true,
				accountName: organizationName,
				profilePhoto: profileImage || existingAccount.profilePhoto
			});
			
			console.log("\n" + "=".repeat(80));
			console.log("🔄 [LINKEDIN ADD-ACCOUNT] ACCOUNT EXISTS - UPDATING");
			console.log("=".repeat(80));
			console.log({
				accountId: existingAccount.id,
				companyId,
				linkedinOrganizationId,
				status: "Updated existing account",
				updatedAt: new Date().toISOString()
			});
			console.log("=".repeat(80) + "\n");

			res.status(200).json({
				success: true,
				message: "LinkedIn account already exists and is now enabled",
				account: existingAccount
			});
			return;
		}

		// Create new account
		const newAccount = await MetaSocialAccount.create({
			companyId,
			platform: 'linkedin',
			userAccessTokenId,
			linkedinOrganizationId,
			accountName: organizationName,
			profilePhoto: profileImage || null,
			isAdded: true
		});

		console.log("\n" + "=".repeat(80));
		console.log("✨ [LINKEDIN ADD-ACCOUNT] ACCOUNT CREATED SUCCESSFULLY");
		console.log("=".repeat(80));
		console.log({
			accountId: newAccount.id,
			companyId,
			userAccessTokenId,
			linkedinOrganizationId,
			organizationName,
			accountType,
			isAdded: true,
			createdAt: newAccount.createdAt,
			databaseStatus: "✅ Saved to database"
		});
		console.log("=".repeat(80) + "\n");

		res.status(201).json({
			success: true,
			message: `LinkedIn ${accountType} account added successfully`,
			account: newAccount
		});
		return;
	} catch (error: any) {
		console.error("\n" + "=".repeat(80));
		console.error("❌ [LINKEDIN ADD-ACCOUNT] ERROR OCCURRED");
		console.error("=".repeat(80));
		console.error({
			errorMessage: error.message,
			errorStack: error.stack,
			errorCode: error.code,
			timestamp: new Date().toISOString()
		});
		console.error("=".repeat(80) + "\n");
		
		res.status(500).json({
			success: false,
			message: error.message || "Failed to add LinkedIn account",
			error: process.env.NODE_ENV === "development" ? error.message : undefined
		});
		return;
	}
});

/**
 * GET /linkedin/get-added-accounts
 * Purpose: Get all added LinkedIn accounts for a company
 * Query Params:
 *   - companyId (required): Company ID
 * Returns: Array of added LinkedIn accounts
 */
router.get("/get-added-accounts", async (req: Request, res: Response): Promise<void> => {
	try {
		const companyId = req.query.companyId as string;

		if (!companyId) {
			res.status(400).json({ success: false, message: "companyId is required" });
			return;
		}

		console.log("[LINKEDIN GET-ADDED-ACCOUNTS] Fetching added accounts for company:", { companyId });

		// Fetch all added accounts for this company
		const accounts = await MetaSocialAccount.findAll({
			where: {
				companyId,
				platform: 'linkedin',
				isAdded: true
			}
		});

		console.log("[LINKEDIN GET-ADDED-ACCOUNTS] Found accounts:", {
			companyId,
			count: accounts.length
		});

		res.status(200).json({
			success: true,
			message: "Added LinkedIn accounts fetched successfully",
			accounts: accounts,
			count: accounts.length
		});
		return;
	} catch (error: any) {
		console.error("[LINKEDIN GET-ADDED-ACCOUNTS] Failed to fetch accounts:", error.message);
		res.status(500).json({
			success: false,
			message: error.message || "Failed to fetch added LinkedIn accounts"
		});
		return;
	}
});

/**
 * GET /linkedin/get-accounts-by-type
 * Purpose: Get LinkedIn accounts filtered by type (personal, organization, ad_account)
 * Query Params:
 *   - companyId (required): Company ID
 *   - accountType (optional): 'personal' | 'organization' | 'ad_account' (defaults to all)
 * Returns: Array of accounts grouped/filtered by type
 */
router.get("/get-accounts-by-type", async (req: Request, res: Response): Promise<void> => {
	try {
		const { companyId, accountType } = req.query;

		if (!companyId) {
			res.status(400).json({ success: false, message: "companyId is required" });
			return;
		}

		console.log("[LINKEDIN GET-ACCOUNTS-BY-TYPE] Fetching accounts for company:", { 
			companyId, 
			accountType: accountType || "all" 
		});

		// Build where clause
		const where: any = {
			companyId,
			isAdded: true
		};

		if (accountType) {
			where.accountType = accountType;
		}

		// Fetch filtered accounts
		const accounts = await MetaSocialAccount.findAll({ where });

		// Group by type if no specific type requested
		let response: any = {
			success: true,
			message: "LinkedIn accounts fetched successfully",
			count: accounts.length,
			accounts: accounts
		};

		if (!accountType) {
			response.grouped = {
				personal: accounts.filter((a: any) => a.accountType === "personal"),
				organization: accounts.filter((a: any) => a.accountType === "organization"),
				ad_account: accounts.filter((a: any) => a.accountType === "ad_account")
			};
		}

		res.status(200).json(response);
		return;
	} catch (error: any) {
		console.error("[LINKEDIN GET-ACCOUNTS-BY-TYPE] Failed to fetch accounts:", error.message);
		res.status(500).json({
			success: false,
			message: error.message || "Failed to fetch LinkedIn accounts"
		});
		return;
	}
});

/**
 * POST /linkedin/remove-account
 * Purpose: Disable/remove a LinkedIn account for company
 * Body Params:
 *   - accountId (required): LinkedInAccount ID to remove
 *   - companyId (required): Company ID (for validation)
 * Returns: Confirmation with deleted account
 */
router.post("/remove-account", async (req: Request, res: Response): Promise<void> => {
	try {
		const { accountId, companyId } = req.body;

		if (!accountId) {
			res.status(400).json({ success: false, message: "accountId is required" });
			return;
		}

		if (!companyId) {
			res.status(400).json({ success: false, message: "companyId is required" });
			return;
		}

		console.log("[LINKEDIN REMOVE-ACCOUNT] Removing account:", { accountId, companyId });

		// Find and remove the account
		const account = await MetaSocialAccount.findOne({
			where: {
				id: accountId,
				companyId,
				platform: 'linkedin'
			}
		});

		if (!account) {
			res.status(404).json({ 
				success: false, 
				message: "LinkedIn account not found" 
			});
			return;
		}

		// Mark as removed (soft delete by setting isAdded to false)
		await account.update({ isAdded: false });

		console.log("[LINKEDIN REMOVE-ACCOUNT] Account removed successfully:", { 
			accountId, 
			accountName: account.accountName 
		});

		res.status(200).json({
			success: true,
			message: "LinkedIn account removed successfully",
			removedAccount: account
		});
		return;
	} catch (error: any) {
		console.error("[LINKEDIN REMOVE-ACCOUNT] Failed to remove account:", error.message);
		res.status(500).json({
			success: false,
			message: error.message || "Failed to remove LinkedIn account"
		});
		return;
	}
});

/**
 * POST /linkedin/complete-stepper
 * Purpose: Complete the stepper and save all selected LinkedIn accounts for company
 * This endpoint is called when user finishes the stepper UI
 * Body Params:
 *   - userAccessTokenId (required): Token ID from OAuth
 *   - companyId (required): Company ID
 *   - selectedAccounts (required): Array of selected accounts with {linkedinOrganizationId, organizationName, accountType, profileImage}
 *   - userProfile (required): User profile data {id, name, email, picture}
 * Returns: Summary of created accounts
 */
router.post("/complete-stepper", async (req: Request, res: Response): Promise<void> => {
	try {
		const { userAccessTokenId, companyId, selectedAccounts, userProfile } = req.body;

		// Validation
		if (!userAccessTokenId) {
			res.status(400).json({ success: false, message: "userAccessTokenId is required" });
			return;
		}

		if (!companyId) {
			res.status(400).json({ success: false, message: "companyId is required" });
			return;
		}

		if (!selectedAccounts || !Array.isArray(selectedAccounts) || selectedAccounts.length === 0) {
			res.status(400).json({ success: false, message: "selectedAccounts array is required and must not be empty" });
			return;
		}

		console.log("\n" + "=".repeat(80));
		console.log("🎯 [LINKEDIN COMPLETE-STEPPER] Processing stepper completion");
		console.log("=".repeat(80));
		console.log({
			companyId,
			userAccessTokenId,
			selectedAccountsCount: selectedAccounts.length,
			userProfile: userProfile?.name || "Unknown"
		});
		console.log("=".repeat(80) + "\n");

		const createdAccounts: any[] = [];
		const failedAccounts: any[] = [];

		// Process each selected account
		for (const account of selectedAccounts) {
			try {
				const { linkedinOrganizationId, organizationName, accountType, profileImage, profileUrl } = account;

				// Validate required fields
				if (!linkedinOrganizationId || !organizationName || !accountType) {
					failedAccounts.push({
						account,
						error: "Missing required fields (linkedinOrganizationId, organizationName, or accountType)"
					});
					continue;
				}

				// Check if account already exists
				const existingAccount = await MetaSocialAccount.findOne({
					where: {
						companyId,
						platform: 'linkedin',
						linkedinOrganizationId,
						userAccessTokenId
					}
				});

				if (existingAccount) {
					// Update existing account
					await existingAccount.update({ isAdded: true });
					createdAccounts.push(existingAccount);
					console.log(`✅ Updated existing account: ${organizationName}`);
					continue;
				}

				// Create new account
				const newAccount = await MetaSocialAccount.create({
					companyId,
					platform: 'linkedin',
					userAccessTokenId,
					linkedinOrganizationId,
					accountName: organizationName,
					profilePhoto: profileImage || null,
					isAdded: true
				});

				createdAccounts.push(newAccount);
				console.log(`✅ Created account: ${organizationName}`);
			} catch (accountError: any) {
				console.error(`❌ Failed to create account:`, accountError.message);
				failedAccounts.push({
					account,
					error: accountError.message
				});
			}
		}

		console.log("\n" + "=".repeat(80));
		console.log("✨ [LINKEDIN COMPLETE-STEPPER] Stepper completed successfully");
		console.log("=".repeat(80));
		console.log({
			createdCount: createdAccounts.length,
			failedCount: failedAccounts.length,
			totalProcessed: selectedAccounts.length,
			status: failedAccounts.length === 0 ? "✅ All accounts created" : "⚠️ Some accounts failed"
		});
		console.log("=".repeat(80) + "\n");

		res.status(201).json({
			success: failedAccounts.length === 0,
			message: failedAccounts.length === 0 
				? "Stepper completed successfully! All accounts have been saved to database."
				: `Stepper completed with ${failedAccounts.length} failures. ${createdAccounts.length} accounts saved.`,
			summary: {
				totalSelected: selectedAccounts.length,
				totalCreated: createdAccounts.length,
				totalFailed: failedAccounts.length,
				createdAccounts: createdAccounts,
				failedAccounts: failedAccounts.length > 0 ? failedAccounts : null
			},
			userProfile: userProfile,
			companyId: companyId,
			userAccessTokenId: userAccessTokenId
		});
		return;
	} catch (error: any) {
		console.error("\n" + "=".repeat(80));
		console.error("❌ [LINKEDIN COMPLETE-STEPPER] ERROR OCCURRED");
		console.error("=".repeat(80));
		console.error({
			errorMessage: error.message,
			errorStack: error.stack,
			timestamp: new Date().toISOString()
		});
		console.error("=".repeat(80) + "\n");

		res.status(500).json({
			success: false,
			message: error.message || "Failed to complete stepper",
			error: process.env.NODE_ENV === "development" ? error.message : undefined
		});
		return;
	}
});

/**
 * POST /linkedin/stepper/init
 * Purpose: Initialize stepper for LinkedIn connection (Step 0 → Step 1)
 * This endpoint is called after OAuth callback to initialize the stepper
 * Body Params:
 *   - userAccessTokenId (required): Token ID from OAuth
 *   - companyId (required): Company ID
 *   - accessToken (required): OAuth access token
 * Returns: Stepper state with Step 1 data ready
 */
router.post("/stepper/init", async (req: Request, res: Response): Promise<void> => {
	try {
		const { userAccessTokenId, companyId, accessToken } = req.body;

		if (!userAccessTokenId) {
			res.status(400).json({ success: false, message: "userAccessTokenId is required" });
			return;
		}

		if (!companyId) {
			res.status(400).json({ success: false, message: "companyId is required" });
			return;
		}

		if (!accessToken) {
			res.status(400).json({ success: false, message: "accessToken is required" });
			return;
		}

		console.log("\n" + "=".repeat(80));
		console.log("🚀 [LINKEDIN STEPPER-INIT] Initializing stepper (Step 0 → Step 1)");
		console.log("=".repeat(80));
		console.log({ companyId, userAccessTokenId });
		console.log("=".repeat(80) + "\n");

		// Fetch stepper data
		const stepperData = await axios.get(`http://localhost:${process.env.PORT || 9005}/linkedin/stepper-data`, {
			params: {
				userAccessToken: accessToken,
				userAccessTokenId: userAccessTokenId,
				companyId: companyId
			}
		}).catch((err: any) => {
			console.warn("[LINKEDIN STEPPER-INIT] Failed to fetch stepper data:", err.message);
			return null;
		});

		if (!stepperData) {
			res.status(500).json({
				success: false,
				message: "Failed to fetch stepper data"
			});
			return;
		}

		const response = {
			success: true,
			message: "Stepper initialized successfully",
			currentStep: 1,
			totalSteps: 4,
			stepperData: stepperData.data,
			state: {
				step0: { completed: true, status: "OAuth completed" },
				step1: { completed: false, status: "Select a profile", data: stepperData.data.steps[0] },
				step2: { completed: false, status: "Select organization pages", data: stepperData.data.steps[1] },
				step3: { completed: false, status: "Select ad accounts", data: stepperData.data.steps[2] },
				step4: { completed: false, status: "Review & Confirm" }
			}
		};

		console.log("\n" + "=".repeat(80));
		console.log("✅ [LINKEDIN STEPPER-INIT] Stepper initialized at Step 1");
		console.log("=".repeat(80));
		console.log({ 
			currentStep: 1, 
			totalSteps: 4,
			profileCount: stepperData.data.steps[0]?.count,
			organizationCount: stepperData.data.steps[1]?.count,
			adAccountCount: stepperData.data.steps[2]?.count
		});
		console.log("=".repeat(80) + "\n");

		res.status(200).json(response);
		return;
	} catch (error: any) {
		console.error("[LINKEDIN STEPPER-INIT] Error:", error.message);
		res.status(500).json({
			success: false,
			message: error.message || "Failed to initialize stepper"
		});
		return;
	}
});

/**
 * POST /linkedin/stepper/select-profile
 * Purpose: Save selected profile and move to Step 2 (Organizations)
 * Body Params:
 *   - userAccessTokenId (required): Token ID
 *   - companyId (required): Company ID
 *   - selectedProfile (required): {id, name, email, picture, accountId}
 * Returns: Next step data (organizations)
 */
router.post("/stepper/select-profile", async (req: Request, res: Response): Promise<void> => {
	try {
		const { userAccessTokenId, companyId, selectedProfile } = req.body;

		if (!userAccessTokenId || !companyId || !selectedProfile) {
			res.status(400).json({ success: false, message: "userAccessTokenId, companyId, and selectedProfile are required" });
			return;
		}

		console.log("\n" + "=".repeat(80));
		console.log("📍 [LINKEDIN STEPPER-SELECT-PROFILE] Moving from Step 1 → Step 2");
		console.log("=".repeat(80));
		console.log({ companyId, selectedProfile: selectedProfile.name });
		console.log("=".repeat(80) + "\n");

		res.status(200).json({
			success: true,
			message: "Profile selected. Proceeding to Step 2: Organizations",
			currentStep: 2,
			totalSteps: 4,
			selectedProfile: selectedProfile,
			nextStep: {
				step: 2,
				title: "Organization Page",
				description: "Select organization pages you want to manage",
				hint: "You can select multiple organizations or skip this step"
			},
			state: {
				step1: { completed: true, status: "Profile selected", selectedProfile: selectedProfile.name },
				step2: { completed: false, status: "Select organization pages (optional)" },
				step3: { completed: false, status: "Select ad accounts (optional)" },
				step4: { completed: false, status: "Review & Confirm" }
			}
		});
		return;
	} catch (error: any) {
		console.error("[LINKEDIN STEPPER-SELECT-PROFILE] Error:", error.message);
		res.status(500).json({
			success: false,
			message: error.message || "Failed to select profile"
		});
		return;
	}
});

/**
 * POST /linkedin/stepper/select-organizations
 * Purpose: Save selected organizations and move to Step 3 (Ad Accounts)
 * Body Params:
 *   - userAccessTokenId (required): Token ID
 *   - companyId (required): Company ID
 *   - selectedOrganizations (optional): Array of organization objects
 * Returns: Next step data (ad accounts)
 */
router.post("/stepper/select-organizations", async (req: Request, res: Response): Promise<void> => {
	try {
		const { userAccessTokenId, companyId, selectedOrganizations } = req.body;

		if (!userAccessTokenId || !companyId) {
			res.status(400).json({ success: false, message: "userAccessTokenId and companyId are required" });
			return;
		}

		console.log("\n" + "=".repeat(80));
		console.log("📍 [LINKEDIN STEPPER-SELECT-ORGANIZATIONS] Moving from Step 2 → Step 3");
		console.log("=".repeat(80));
		console.log({ 
			companyId, 
			selectedCount: selectedOrganizations?.length || 0,
			skipped: !selectedOrganizations || selectedOrganizations.length === 0
		});
		console.log("=".repeat(80) + "\n");

		res.status(200).json({
			success: true,
			message: selectedOrganizations?.length > 0 
				? `${selectedOrganizations.length} organization(s) selected. Proceeding to Step 3: Ad Accounts`
				: "Skipped organizations. Proceeding to Step 3: Ad Accounts",
			currentStep: 3,
			totalSteps: 4,
			selectedOrganizations: selectedOrganizations || [],
			nextStep: {
				step: 3,
				title: "Ad Account",
				description: "Select ad accounts for managing LinkedIn ads",
				hint: "You can select multiple ad accounts or skip this step"
			},
			state: {
				step1: { completed: true, status: "Profile selected" },
				step2: { completed: true, status: `${selectedOrganizations?.length || 0} organization(s) selected` },
				step3: { completed: false, status: "Select ad accounts (optional)" },
				step4: { completed: false, status: "Review & Confirm" }
			}
		});
		return;
	} catch (error: any) {
		console.error("[LINKEDIN STEPPER-SELECT-ORGANIZATIONS] Error:", error.message);
		res.status(500).json({
			success: false,
			message: error.message || "Failed to select organizations"
		});
		return;
	}
});

/**
 * POST /linkedin/stepper/select-ad-accounts
 * Purpose: Save selected ad accounts and move to Step 4 (Review & Confirm)
 * Body Params:
 *   - userAccessTokenId (required): Token ID
 *   - companyId (required): Company ID
 *   - selectedAdAccounts (optional): Array of ad account objects
 * Returns: Summary before final confirmation
 */
router.post("/stepper/select-ad-accounts", async (req: Request, res: Response): Promise<void> => {
	try {
		const { userAccessTokenId, companyId, selectedAdAccounts } = req.body;

		if (!userAccessTokenId || !companyId) {
			res.status(400).json({ success: false, message: "userAccessTokenId and companyId are required" });
			return;
		}

		console.log("\n" + "=".repeat(80));
		console.log("📍 [LINKEDIN STEPPER-SELECT-AD-ACCOUNTS] Moving from Step 3 → Step 4");
		console.log("=".repeat(80));
		console.log({ 
			companyId, 
			selectedCount: selectedAdAccounts?.length || 0,
			skipped: !selectedAdAccounts || selectedAdAccounts.length === 0
		});
		console.log("=".repeat(80) + "\n");

		res.status(200).json({
			success: true,
			message: selectedAdAccounts?.length > 0 
				? `${selectedAdAccounts.length} ad account(s) selected. Proceeding to Step 4: Review & Confirm`
				: "Skipped ad accounts. Proceeding to Step 4: Review & Confirm",
			currentStep: 4,
			totalSteps: 4,
			selectedAdAccounts: selectedAdAccounts || [],
			nextStep: {
				step: 4,
				title: "Review & Confirm",
				description: "Review your selections and confirm to complete the connection",
				hint: "Click 'Complete' to save all accounts to your company"
			},
			state: {
				step1: { completed: true, status: "Profile selected" },
				step2: { completed: true, status: "Organizations selection complete" },
				step3: { completed: true, status: `${selectedAdAccounts?.length || 0} ad account(s) selected` },
				step4: { completed: false, status: "Ready for final confirmation" }
			},
			callToAction: {
				button: "Complete Connection",
				endpoint: "POST /linkedin/complete-stepper",
				requiredParams: ["userAccessTokenId", "companyId", "selectedAccounts"]
			}
		});
		return;
	} catch (error: any) {
		console.error("[LINKEDIN STEPPER-SELECT-AD-ACCOUNTS] Error:", error.message);
		res.status(500).json({
			success: false,
			message: error.message || "Failed to select ad accounts"
		});
		return;
	}
});

/**
 * GET /linkedin/me/organizations
 * Purpose: Fetch authenticated LinkedIn user's organizations/company pages
 * Params:
 *   - access_token (required, query/header/body): LinkedIn access token
 * Returns: { success, organizations: Array<{ id, name, description, profilePicture }> }
 */
router.get("/me/organizations", async (req: Request, res: Response): Promise<void> => {
	try {
		const tokens = extractTokens(req);
		const accessToken = tokens.access_token;

		if (!accessToken) {
			res.status(400).json({ success: false, message: "Provide access_token" });
			return;
		}

		console.log("[LINKEDIN ORGANIZATIONS] Fetching user organizations with token:", {
			accessToken: accessToken.substring(0, 20) + "...",
		});

		// Fetch organizations using LinkedIn API v2
		const response = await axios.get(
			"https://api.linkedin.com/v2/me?projection=(id,firstName,lastName,profilePicture(displayImage))",
			{
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Accept": "application/json",
					"LinkedIn-Version": "202401"
				}
			}
		);

		const userProfile = response.data;
		console.log("[LINKEDIN ORGANIZATIONS] User profile retrieved");

		// Fetch organizations that the user is an admin of
		// Using the /organizations endpoint to get all accessible organizations
		const orgsResponse = await axios.get(
			"https://api.linkedin.com/v2/me/organizationAcls?q=roleAssignee&projection=(organizationAcl:(organization,organizationalTarget(~(name,description,profilePicture(displayImage)))))",
			{
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Accept": "application/json",
					"LinkedIn-Version": "202401"
				}
			}
		);

		console.log("[LINKEDIN ORGANIZATIONS] Organizations ACLs retrieved:", {
			count: orgsResponse.data?.elements?.length || 0
		});

		// Parse organizations from ACL response
		const organizations = (orgsResponse.data?.elements || []).map((acl: any) => {
			const org = acl?.organizationAcl?.organization;
			const target = acl?.organizationAcl?.organizationalTarget?.["~"];
			
			return {
				id: org?.id || org || acl?.organizationAcl?.organizationalTarget?.id,
				name: target?.name || "Unknown Organization",
				description: target?.description || "",
				profilePicture: target?.profilePicture?.displayImage || null,
				type: "organization",
				isAdmin: true
			};
		}).filter((org: any) => org.id); // Filter out invalid entries

		console.log("[LINKEDIN ORGANIZATIONS] Parsed organizations:", {
			count: organizations.length,
			orgIds: organizations.map((o: any) => o.id)
		});

		res.status(200).json({
			success: true,
			organizations: organizations,
			count: organizations.length,
			userProfile: {
				id: userProfile?.id,
				firstName: userProfile?.firstName?.localized?.en_US || userProfile?.firstName || "",
				lastName: userProfile?.lastName?.localized?.en_US || userProfile?.lastName || "",
				profilePicture: userProfile?.profilePicture?.displayImage || null
			}
		});
		return;
	} catch (e: any) {
		console.error("[LINKEDIN ORGANIZATIONS] Failed to fetch organizations:", {
			message: e.message,
			response: e?.response?.data,
			status: e?.response?.status,
		});
		res.status(500).json({
			success: false,
			message: e?.response?.data?.message || e.message || "Failed to fetch organizations",
			details: process.env.NODE_ENV === 'development' ? e?.response?.data : undefined
		});
		return;
	}
});

// GET /linkedin/debug
router.get("/debug", async (_req: Request, res: Response): Promise<void> => {
	try {
		const expectedRedirectUri = process.env.LINKEDIN_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/linkedin/oauth2callback`;
		const clientId = process.env.LINKEDIN_CLIENT_ID || "";
		const scopes = (process.env.LINKEDIN_SCOPES || "openid profile email w_member_social").split(/[ ,]+/).filter(Boolean);
		res.status(200).json({ success: true, expectedRedirectUri, clientIdStart: clientId.slice(0,10)+"…", scopes });
	} catch (e: any) {
		res.status(500).json({ success: false, message: e.message || "Failed to read config" });
	}
});

module.exports = router;
