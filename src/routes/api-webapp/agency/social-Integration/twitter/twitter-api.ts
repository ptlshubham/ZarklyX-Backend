import express from "express";
import {
    generateTwitterAuthUrl,
    exchangeCodeForTokens,
    getUserByUsername,
    postTweet,
} from "../../../../../services/twitter-service";
import axios from "axios";
import { saveOrUpdateToken } from "../../../../../services/token-store.service";
import { successResponse, serverError } from "../../../../../utils/responseHandler";

const router = express.Router();

// Generate authorization URL (returns url + code_verifier for PKCE)
router.get("/authorize", async (req: any, res: any): Promise<any> => {
    try {
        const scopes = (req.query.scopes as string | undefined)?.split(/[ ,]+/) || undefined;
        const data = generateTwitterAuthUrl(scopes);
        // Return the url and code_verifier to the client; client should store code_verifier securely (e.g., client-side storage)
        return successResponse(res, "Twitter auth url generated", data);
    } catch (err: any) {
        return serverError(res, err?.message || "Failed to generate Twitter auth url");
    }
});

// Exchange authorization code for tokens. Accepts POST body { code, code_verifier }
router.post("/exchange", async (req: any, res: any): Promise<any> => {
    try {
        const { code, code_verifier } = req.body || {};
        if (!code) return serverError(res, "code is required");
        const tokens = await exchangeCodeForTokens(code, code_verifier);
        // Try to fetch the authenticated user's id (providerUserId) using the user access token
        let providerUserId: string | null = null;
        let profile: any = null;
        try {
            if (tokens && tokens.access_token) {
                const meRes = await axios.get("https://api.twitter.com/2/users/me?user.fields=id,name,username,profile_image_url", {
                    headers: { Authorization: `Bearer ${tokens.access_token}` },
                });
                profile = meRes.data;
                if (profile && profile.data && profile.data.id) providerUserId = String(profile.data.id);
            }
        } catch (e) {
            // non-fatal: we'll still persist the token record without provider user id
            // console.warn("Failed to fetch twitter /me profile:", e?.response?.data || e?.message || e);
        }

        // Persist tokens in our social token store. accountEmail is not available from Twitter OAuth by default.
        const scopes = (tokens && tokens.scope) ? (String(tokens.scope).split(/[ ,]+/).filter(Boolean)) : [];
        const expiry = tokens && tokens.expires_in ? (Date.now() + Number(tokens.expires_in) * 1000) : null;

        try {
            await saveOrUpdateToken({
                accountEmail: null,
                provider: "twitter",
                scopes,
                accessToken: tokens.access_token || null,
                refreshToken: tokens.refresh_token || null,
                expiryDate: expiry,
                tokenType: tokens.token_type || null,
            });
        } catch (e) {
            // Persist failure should not block the OAuth response
            // console.error("Failed to persist twitter tokens:", e?.message || e);
        }

        return successResponse(res, "Exchanged code for tokens", { tokens, providerUserId, profile });
    } catch (err: any) {
        return serverError(res, err?.response?.data || err?.message || "Failed to exchange code");
    }
});

// Get public profile by username (uses app bearer token by default). Optional query param access_token to use a user token.
router.get("/profile/:username", async (req: any, res: any): Promise<any> => {
    try {
        const username = req.params.username;
        const access_token = (req.query.access_token as string | undefined) || undefined;
        if (!username) return serverError(res, "username is required");
        const profile = await getUserByUsername(username, access_token);
        return successResponse(res, "Twitter profile fetched", profile);
    } catch (err: any) {
        return serverError(res, err?.response?.data || err?.message || "Failed to fetch profile");
    }
});

// Post a tweet on behalf of a user. Body: { 6text, access_token }
router.post("/tweet", async (req: any, res: any): Promise<any> => {
    try {
        const { text, access_token } = req.body || {};
        if (!text) return serverError(res, "text is required");
        if (!access_token) return serverError(res, "access_token (user) is required to post a tweet");
        const result = await postTweet(text, access_token);
        return successResponse(res, "Tweet posted", result);
    } catch (err: any) {
        return serverError(res, err?.response?.data || err?.message || "Failed to post tweet");
    }
});

export default router;