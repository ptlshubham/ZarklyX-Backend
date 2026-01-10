import axios from "axios";
import express, { Request, Response } from "express";
import jwt from 'jsonwebtoken'
import { exchangeInstagramCodeForTokens, exchangeShortLivedForLongLived, generateInstagramAuthUrl, getAddedIgAccountDetails, getBusinessIgAccounts, getFacebookUser, getIgAccountsAndBusinesses, getPageAdminIgAccounts } from "../../../../../services/instagram-service";
import { saveOrUpdateToken } from "../../../../../services/token-store.service";
import { v4 as uuidv4 } from "uuid";
import { getAddedInstagramAccountsFromDb, markInstagramAccountsAsAddedInDb, saveInstagramAccountsToDb } from './instagram-handler'

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

function extractTokens(req: Request) {
    const at = ((req.headers["x-access-token"] as string) || (req.query.access_token as string) || (req.body?.access_token as string) || "").trim();
    const rt = ((req.headers["x-refresh-token"] as string) || (req.query.refresh_token as string) || (req.body?.refresh_token as string) || "").trim();
    const tokens: any = {};
    if (at) tokens.access_token = at;
    if (rt) tokens.refresh_token = rt;
    return tokens;
}


router.get("/auth/url", async (req: Request, res: Response) => {
    try {
        const scopesParam =
            (req.query.scopes as string) ||
            process.env.INSTAGRAM_SCOPES ||
            "email,public_profile,pages_show_list,business_management,instagram_basic,instagram_content_publish";
        const scopes = scopesParam.split(/[ ,]+/).filter(Boolean);
        const companyId = req.query.companyId as string;

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


        // Generate Instagram auth URL with our custom state ID
        const { url: baseUrl, state: fbState } = generateInstagramAuthUrl(scopes);
        // Replace Instagram's generated state with our custom state ID
        const authUrl = baseUrl.replace(/state=[^&]*/, `state=${encodeURIComponent(stateId)}`);

        const expectedRedirectUri = (
            process.env.INSTAGRAM_REDIRECT_URI ||
            `${process.env.API_URL || "http://localhost:9005"}/instagram/oauth2callback`
        );

        const defaultSuccessRedirectUri = `${process.env.ADMIN_URL || "http://localhost:4200"}/social-integration/instagram`;
        const defaultErrorRedirectUri = `${process.env.ADMIN_URL || "http://localhost:4200"}/social-integration/instagram?error=true`;

        console.log("[INSTAGRAM AUTH URL] Generated OAuth URL:", {
            companyId: companyId,
            stateId: stateId,
            scopes: scopes,
            expectedRedirectUri: expectedRedirectUri,
            successRedirectUri: successRedirectUri || defaultSuccessRedirectUri,
            errorRedirectUri: errorRedirectUri || defaultErrorRedirectUri,
            fbGeneratedState: fbState,
            customState: stateId,
        });

        res.status(200).json({
            success: true,
            url: authUrl,
            scopes,
            expectedRedirectUri,
            clientId: (process.env.FACEBOOK_APP_ID || "").slice(0, 10) + "",
            companyId: companyId || null,
            successRedirectUri: successRedirectUri || defaultSuccessRedirectUri,
            errorRedirectUri: errorRedirectUri || defaultErrorRedirectUri
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error.message || "Failed to generate Facebook auth URL",
        });
    }
});


router.get("/oauth2callback", async (req: Request, res: Response): Promise<void> => {
    // Declare variables at route level so they're accessible in catch block
    let companyId: string | null = null;
    let successRedirectUri: string | null = null;
    let errorRedirectUri: string | null = null;
    let accountEmail: string | null = null;
    let accountId: string | null = null;

    try {
        console.log("[FACEBOOK OAUTH2CALLBACK] Received callback request:", {
            fullUrl: req.originalUrl,
            queryParams: req.query,
            code: req.query.code,
            state: req.query.state,
            allParams: Object.keys(req.query),
        });

        let code = (req.query.code as string) || "";
        const state = req.query.state as string;

        // Sanitize code - remove extra quotes that might be added by frontend
        code = code
            .trim()
            .replace(/^["']/, "")      // Remove leading quote or double-quote
            .replace(/["']$/, "")      // Remove trailing quote or double-quote
            .trim();

        console.log("[FACEBOOK OAUTH2CALLBACK] Code sanitized:", {
            originalCode: req.query.code,
            cleanedCode: code,
            codeLength: code.length,
        });

        if (!code) {
            console.error("[FACEBOOK OAUTH2CALLBACK] ERROR: Missing code parameter. Query params:", req.query);
            res.status(400).json({
                success: false,
                message: "Missing code parameter",
                received: {
                    code: code || null,
                    state: state || null,
                    allParams: req.query,
                }
            });
            return;
        }

        // Exchange short-lived auth code for short-lived token
        const shortToken = await exchangeInstagramCodeForTokens(code);
        console.log("[INSTAGRAM OAUTH2CALLBACK] Short-lived token received:", {
            access_token: shortToken.access_token?.substring(0, 20) + "...",
            token_type: shortToken.token_type,
            expires_in: shortToken.expires_in,
        });

        // Exchange short-lived token for long-lived token (valid for ~60 days)
        const longToken = await exchangeShortLivedForLongLived(shortToken.access_token);
        console.log("[INSTAGRAM OAUTH2CALLBACK] Long-lived token received:", {
            access_token: longToken.access_token?.substring(0, 20) + "...",
            token_type: longToken.token_type,
            expires_in: longToken.expires_in,
            refresh_token: longToken.refresh_token ? longToken.refresh_token.substring(0, 20) + "..." : null,
        });

        let accountEmail: string | null = null;
        let accountId: string | null = null;

        console.log("[INSTAGRAM OAUTH2CALLBACK] Step 1: Fetching user info from INSTAGRAM...");

        // Fetch user info using the long-lived token
        const userinfo = await axios.get("https://graph.facebook.com/me?fields=id,name,email,picture", {
            headers: { Authorization: `Bearer ${longToken.access_token}` },
        });
        accountEmail = userinfo.data.email || null;
        accountId = userinfo.data.id || null;

        console.log("[INSTAGRAM OAUTH2CALLBACK] Step 2: User info retrieved:", {
            accountId: accountId,
            accountEmail: accountEmail,
            userName: userinfo.data.name,
            emailFromAPI: userinfo.data.email || 'not provided - will use generated email',
        });

        if (!accountId) {
            console.error("[INSTAGRAM OAUTH2CALLBACK] ERROR: No accountId returned from INSTAGRAM");
            res.status(400).json({
                success: false,
                message: "Failed to resolve Facebook account ID",
            });
            return;
        }

        // If no email, use a generated email from Facebook ID
        if (!accountEmail) {
            accountEmail = `instagram_${accountId}@facebook.local`;
            console.log("[FACEBOOK OAUTH2CALLBACK] Generated email for account:", accountEmail);
        }

        // Retrieve companyId and redirect URIs from state store (more reliable than session for OAuth)
        console.log("[INSTAGRAM OAUTH2CALLBACK] Step 3: Retrieving companyId and redirect URIs from state store...");

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
                        console.log("[INSTAGRAM OAUTH2CALLBACK] Found companyId and redirects in state store:", {
                            companyId,
                            successRedirectUri: successRedirectUri || `${process.env.ADMIN_URL || "http://localhost:4200"}/dashboard`,
                            errorRedirectUri: errorRedirectUri || `${process.env.ADMIN_URL || "http://localhost:4200"}/auth/error`
                        });
                    } else {
                        console.warn(" [INSTAGRAM OAUTH2CALLBACK] State data expired in store");
                    }
                }

                // Clean up state after use
                oauthStateStore.delete(state);
                console.log("[INSTAGRAM OAUTH2CALLBACK] Cleaned up state from store");
            } else {
                console.warn(" [INSTAGRAM OAUTH2CALLBACK] State NOT FOUND in store. State:", state);
            }
        } else {
            console.warn(" [INSTAGRAM OAUTH2CALLBACK] No state parameter in URL");
        }

        console.log("[INSTAGRAM OAUTH2CALLBACK] Step 4: Fetching INSTAGRAM pages...");

        // Fetch pages linked to this account
        // const pagesResponse = await getFacebookPages(longToken.access_token);
        // const pages = pagesResponse?.data || [];

        // console.log("[FACEBOOK OAUTH2CALLBACK] Step 5: Pages fetched. Count:", pages.length);

        // Save tokens with companyId for multiple accounts support
        console.log("[INSTAGRAM OAUTH2CALLBACK] Step 6: Saving token to database...");

        const savedToken = await saveOrUpdateToken({
            provider: "instagram",
            accountEmail,
            accountId,
            companyId,
            scopes: (process.env.INSTAGRAM_SCOPES || "").split(/[ ,]+/).filter(Boolean),
            accessToken: longToken.access_token || null,
            refreshToken: longToken.refresh_token || null,
            expiryDate: longToken.expires_in ? Date.now() + longToken.expires_in * 1000 : null,
            tokenType: longToken.token_type || "Bearer",
            //   meta: {
            //     pages: pages.map((p: any) => ({ id: p.id, name: p.name, category: p.category })),
            //   }
        });

        console.log("[INSTAGRAM OAUTH2CALLBACK] Token saved to database:", {
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

        console.log("[INSTAGRAM OAUTH2CALLBACK] Step 7: Notifying users of connection...");

        // Notify company users of successful connection
        if (companyId) {
            //     try {
            //         await notifySocialConnectionAdded(companyId, {
            //             provider: "facebook",
            //             accountEmail: accountEmail ?? undefined,
            //             accountId: accountId ?? undefined,
            // accountName: accountEmail.split("@")[0],
            //         });
            //         console.log("[FACEBOOK OAUTH2CALLBACK] Users notified successfully");
            //     } catch (err: any) {
            //         console.warn("[FACEBOOK OAUTH2CALLBACK] Failed to notify social connection added:", err.message);
            //     }
        } else {
            console.log("[INSTAGRAM OAUTH2CALLBACK] No companyId, skipping notification");
        }

        console.log("[INSTAGRAM OAUTH2CALLBACK] Step 8: Preparing redirect with token parameters...");

        // Get the saved token to pass to frontend
        const accessToken = savedToken?.accessToken || longToken.access_token || '';
        const refreshToken = savedToken?.refreshToken || longToken.refresh_token || '';
        const expiryDate = savedToken?.expiryDate || (longToken.expires_in ? Date.now() + longToken.expires_in * 1000 : '');
        const tokenType = savedToken?.tokenType || longToken.token_type || 'Bearer';

        // Build frontend callback URL with token parameters
        const baseRedirectUrl = successRedirectUri || `${process.env.ADMIN_URL || "http://localhost:4200"}/profile/integrations`;
        const frontendCallback = `${baseRedirectUrl}?accessToken=${encodeURIComponent(accessToken)}&refreshToken=${encodeURIComponent(refreshToken)}&expiryDate=${expiryDate}&tokenType=${encodeURIComponent(tokenType)}&success=true&page=4&source=instagram&facebookUserId=${encodeURIComponent(accountId)}&userAccessTokenId=${encodeURIComponent(savedToken.id)}&accountEmail=${encodeURIComponent(accountEmail || '')}&accountId=${accountId || ''}&provider=instagram`;

        console.log("[INSTAGRAM OAUTH2CALLBACK] Step 8: Redirecting to frontend with token parameters");
        console.log("[INSTAGRAM OAUTH2CALLBACK] Redirect URL:", frontendCallback);

        // Redirect to frontend with token details
        res.redirect(frontendCallback);
        return;
    } catch (error: any) {
        console.error("[INSTAGRAM OAUTH2CALLBACK] ❌ ERROR:", {
            message: error.message,
            stack: error.stack,
            response: error?.response?.data,
            status: error?.response?.status,
        });

        console.log("[INSTAGRAM OAUTH2CALLBACK] Building error redirect URL");

        // Use custom error redirect URI or fall back to profile/integrations with error flag
        const baseErrorRedirectUrl = errorRedirectUri || `${process.env.ADMIN_URL || "http://localhost:4200"}/profile/integrations`;
        const errorCallback = `${baseErrorRedirectUrl}?success=false&error=${encodeURIComponent(error.message || "OAuth callback failed")}&source=instagram&page=4`;

        console.log("[INSTAGRAM OAUTH2CALLBACK] Redirecting to error page:", errorCallback);

        // Redirect to frontend error page
        res.redirect(errorCallback);
        return;
    }
});

// GET /instagram/get-accounts-businesses
router.get("/get-accounts-businesses", async (req: Request, res: Response): Promise<void> => {
    try {
        const tokens = extractTokens(req);
        if (!tokens.access_token) {
            res.status(400).json({ success: false, message: "Provide access_token" });
            return;
        }

        const { companyId, facebookUserId, userAccessTokenId } = req.query;

        if (!companyId || !facebookUserId || !userAccessTokenId) {
            res.status(400).json({
                success: false,
                message: "companyId, facebookUserId, and userAccessTokenId are required"
            });
            return;
        }

        const { accounts, businesses } = await getIgAccountsAndBusinesses(tokens.access_token);

        await saveInstagramAccountsToDb(
            { accounts, businesses },
            String(companyId),
            null,
            String(facebookUserId),
            String(userAccessTokenId)
        );

        res.status(200).json({ success: true, data: { accounts, businesses } });

    } catch (e: any) {
        res.status(500).json({
            success: false,
            message: e.response?.data || e.message || "Failed to fetch pages"
        });
    }
});


// POST /instagram/add-instagram-account
router.post("/add-instagram-account", async (req: Request, res: Response): Promise<void> => {
    try {
        const { companyId, instagramAccounts } = req.body;

        if (!companyId) {
            res.status(400).json({ success: false, message: "companyId is required" });
            return;
        }

        if (!Array.isArray(instagramAccounts) || instagramAccounts.length === 0) {
            res.status(400).json({
                success: false,
                message: "instagramAccounts must be a non-empty array",
            });
            return;
        }

        const instagramBusinessIds = instagramAccounts.map((acc: any) => acc.id);

        // Update DB
        const updatedCount = await markInstagramAccountsAsAddedInDb(
            companyId,
            instagramBusinessIds
        );

        res.status(200).json({
            success: true,
            message: "Instagram accounts marked as added",
            updatedCount,
        });

    } catch (error: any) {
        console.error("addInstagramAccountsHandler:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Failed to add Instagram accounts",
        });
    }
})

// GET instagram/added-accounts
router.get('/get-added-accounts', async (req: Request, res: Response): Promise<void> => {
    try {
        const tokens = extractTokens(req);
        if (!tokens.access_token) {
            res.status(400).json({ success: false, message: "Provide access_token" });
            return;
        }

        const { companyId } = req.query;

        if (!companyId) {
            res.status(400).json({ success: false, message: "companyId is required" });
            return;
        }

        const accounts = await getAddedInstagramAccountsFromDb(String(companyId));

        const accountsDetails = await getAddedIgAccountDetails(tokens.access_token, accounts)

        res.status(200).json({
            success: true,
            data: accountsDetails
        });

    } catch (error: any) {
        console.error("getAddedInstagramAccountsHandler:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch added Instagram accounts",
        });
    }
})



//GET /instagram/businesses
router.get("/businesses", async (req: Request, res: Response): Promise<void> => {
    try {
        const tokens = extractTokens(req);
        if (!tokens.access_token) { res.status(400).json({ success: false, message: "Provide access_token" }); return; }
        const pages = await getBusinessIgAccounts(tokens.access_token);
        res.status(200).json({ success: true, pages });
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.response?.data || e.message || "Failed to fetch pages" });
    }
});


// POST /instagram/social/post/instagram
router.post("/social/post/instagram", async (req: Request, res: Response): Promise<void> => {
    try {
        const { instagramBusinessId, userAccessToken, caption, imageUrl } = req.body;

        if (!instagramBusinessId || !userAccessToken || !imageUrl) {
            res.status(400).json({
                success: false,
                message: "instagramBusinessId, userAccessToken, and imageUrl are required"
            });
            return
        }

        const createMediaUrl = `https://graph.facebook.com/v19.0/${instagramBusinessId}/media`;

        const mediaRes = await axios.post(createMediaUrl, {
            image_url: imageUrl,
            caption: caption || "",
            access_token: userAccessToken
        });

        const creationId = mediaRes.data.id;

        const publishUrl = `https://graph.facebook.com/v19.0/${instagramBusinessId}/media_publish`;

        const publishRes = await axios.post(publishUrl, {
            creation_id: creationId,
            access_token: userAccessToken
        });

        res.json({
            success: true,
            platform: "instagram",
            mediaId: creationId,
            postId: publishRes.data.id,
            response: publishRes.data
        });
        return
    } catch (error: any) {
        console.error("Instagram Post Error:", error.response?.data || error.message);
        res.status(500).json({
            success: false,
            platform: "instagram",
            error: error.response?.data || error.message
        });
        return
    }
});

module.exports = router;