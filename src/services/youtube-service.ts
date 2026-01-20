import { google, youtube_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";

// const DEFAULT_SCOPES = 
// (process.env.YOUTUBE_SCOPES || "https://www.googleapis.com/auth/youtube.readonly").split(",").map(s => s.trim()).filter(Boolean);
/* -------------------- helpers -------------------- */
export function parseScopes(scopes?: string): string[] {
  return (scopes || "")
    .split(/[ ,]+/) // split by space OR comma
    .map(s => s.trim())
    .filter(Boolean);
}

/* -------------------- config -------------------- */
const DEFAULT_SCOPES = parseScopes(
  process.env.YOUTUBE_SCOPES ||
    "https://www.googleapis.com/auth/youtube.readonly"
);

function getRedirectUri() {
    return process.env.YOUTUBE_REDIRECT_URI ||
        process.env.GOOGLE_REDIRECT_URI ||
        `${process.env.API_URL ||
        "http://localhost:9005"}/youtube/oauth2callback`;
}

export function getOAuthClient(redirectUri?: string) {
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
    const redirect = redirectUri || getRedirectUri();
    return new google.auth.OAuth2(clientId, clientSecret, redirect);
}

export function generateAuthUrl(scopes: string[] = DEFAULT_SCOPES, accessType: "online" | "offline" = "offline", prompt: "consent" | "none" = "consent") {
    const oauth2Client = getOAuthClient();
    return oauth2Client.generateAuthUrl({
        access_type: accessType,
        scope: scopes,
        prompt,
    });
}

export async function exchangeCodeForTokens(code: string, redirectUri?: string) {
    const oauth2Client = getOAuthClient(redirectUri);
    const { tokens } = await oauth2Client.getToken(code);
    return tokens; // { access_token, refresh_token, expiry_date, id_token, ... }
}

export function getYouTubeClientFromTokens(tokens: { access_token?: string; refresh_token?: string; expiry_date?: number; id_token?: string; token_type?: string; }) {
    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials(tokens);
    return google.youtube({ version: "v3", auth: oauth2Client });
}

export async function listMyChannels(tokens: { access_token?: string; refresh_token?: string; expiry_date?: number; id_token?: string; token_type?: string; }) {
    const yt = getYouTubeClientFromTokens(tokens);
    const res = await yt.channels.list({ part: ["id", "snippet", "contentDetails", "statistics"], mine: true });
    return res.data;
}

export async function listMyPlaylists(tokens: { access_token?: string; refresh_token?: string; expiry_date?: number; id_token?: string; token_type?: string; }, pageToken?: string) {
    const yt = getYouTubeClientFromTokens(tokens);
    // Primary: list playlists that the authenticated user created/owns
    const res = await yt.playlists.list({ part: ["id", "snippet", "contentDetails"], mine: true, maxResults: 25, pageToken });
    // If the user has no playlists (totalResults === 0) it's still often useful
    // to return the channel's uploads (the 'uploads' related playlist contains
    // all uploaded videos). So fall back to the uploads playlist when needed.
    if ((res.data?.pageInfo?.totalResults || 0) === 0) {
        try {
            const ch = await yt.channels.list({ part: ["contentDetails"], mine: true });
            const channel = ch.data.items && ch.data.items.length > 0 ? ch.data.items[0] : undefined;
            const uploadsId = channel?.contentDetails?.relatedPlaylists?.uploads;
            if (uploadsId) {
                const items = await yt.playlistItems.list({ part: ["id", "snippet", "contentDetails"], playlistId: uploadsId, maxResults: 25, pageToken });
                // Normalize response shape to look similar to playlists.list
                return {
                    kind: "youtube#playlistListResponse",
                    etag: res.data.etag,
                    pageInfo: items.data.pageInfo || { totalResults: items.data.items ? items.data.items.length : 0, resultsPerPage: items.data.items ? items.data.items.length : 0 },
                    items: items.data.items || []
                } as unknown as youtube_v3.Schema$PlaylistListResponse;
            }
        } catch (e) {
            // ignore fallback failures and return the original playlists response
        }
    }
    return res.data;
}

export async function refreshAccessToken(refreshToken: string) {
    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await oauth2Client.refreshAccessToken();
    return credentials; // includes new access_token and expiry_date
}

export async function getAccessTokenInfo(accessToken: string) {
    // The google-auth-library's getTokenInfo is intended for id_tokens (JWT).
    // For access tokens we should call the OAuth2 tokeninfo endpoint which
    // returns the granted scopes. Use googleapis oauth2 v2 tokeninfo.
    try {
        const oauth2 = google.oauth2("v2");
        const res = await oauth2.tokeninfo({ access_token: accessToken } as any);
        return res.data; // {aud, scope, expires_in, ...}
    } catch (err) {
        // Fallback: some tokens may be id_tokens instead of access tokens.
        // Try tokeninfo with id_token param before giving up to provide
        // a more helpful error to callers.
        try {
            const oauth2 = google.oauth2("v2");
            const res = await oauth2.tokeninfo({ id_token: accessToken } as any);
            return res.data;
        } catch (e) {
            // Rethrow the original error for higher-level handlers
            throw err;
        }
    }
}

    /**
     * Create a new playlist for the authenticated user.
     * tokens: object with access_token or refresh_token (same shape used by other helpers)
     */
    export async function createPlaylist(
        tokens: { access_token?: string; refresh_token?: string; expiry_date?: number; id_token?: string; token_type?: string; },
        title: string,
        description?: string,
        privacyStatus: "private" | "public" | "unlisted" = "private"
    ) {
        const yt = getYouTubeClientFromTokens(tokens);
        const res = await yt.playlists.insert({
            part: ["snippet", "status"],
            requestBody: {
                snippet: {
                    title: title,
                    description: description || ""
                },
                status: {
                    privacyStatus
                }
            }
        } as any);
        return res.data;
    }
