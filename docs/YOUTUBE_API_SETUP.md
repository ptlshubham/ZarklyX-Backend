# YouTube API integration

This backend exposes a minimal YouTube integration using Google OAuth 2.0.

## Prerequisites
- In Google Cloud Console, enable these APIs:
  - YouTube Data API v3
  - People API (optional)
- Create an OAuth 2.0 Client (Web application) with these Authorized redirect URIs:
  - http://localhost:9005/youtube/oauth2callback
- Set the following env variables in `.env`:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
YOUTUBE_REDIRECT_URI=http://localhost:9005/youtube/oauth2callback
YOUTUBE_SCOPES=https://www.googleapis.com/auth/youtube.readonly
```

## Endpoints
Base path: `/youtube`

- GET `/auth/url`
  - Returns an OAuth consent URL with YouTube scopes.
  - Optional query: `scopes` (comma-separated) to override.

- GET `/oauth2callback?code=...`
  - OAuth redirect target. Exchanges code for tokens.
  - Response includes `access_token`, `refresh_token` (first consent with access_type=offline), and expiry.

- GET `/me/channels`
  - Requires tokens via headers or query:
    - `x-access-token` or `?access_token=`
    - optional `x-refresh-token` or `?refresh_token=`
  - Responds with authorized channel details.

- GET `/me/playlists`
  - Same auth as `/me/channels`.
  - Optional `pageToken` to paginate.

## Notes
- For production, do not return tokens in JSON. Set secure, httpOnly cookies or store server-side per user.
- If you need upload or manage scopes, extend `YOUTUBE_SCOPES` accordingly, e.g.:
  - `https://www.googleapis.com/auth/youtube`
  - `https://www.googleapis.com/auth/youtube.upload`
