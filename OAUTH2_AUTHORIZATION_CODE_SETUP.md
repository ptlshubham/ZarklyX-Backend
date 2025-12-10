# OAuth2 Authorization Code Flow Setup Guide

## Overview

The backend now supports **OAuth2 Authorization Code flow** for Google authentication. This is more reliable than the ID Token flow and doesn't depend on browser-specific FedCM restrictions.

## What Changed

### Old Flow (ID Token - Still Supported)
```
Frontend → Google → ID Token → Backend Verification
```

### New Flow (Authorization Code - Recommended)
```
Frontend → Google → Authorization Code → Backend → Token Exchange → User Info
```

## Backend Setup

### 1. Install Required Package

✅ **Already Done** - googleapis is installed:
```bash
npm install googleapis
```

### 2. Update .env File

Add your Google Client Secret to `.env`:

```env
GOOGLE_CLIENT_ID=930106307738-da8bio1u9of5o2h4ordqb1c8fahhnb61.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=PASTE_YOUR_CLIENT_SECRET_HERE
JWT_SECRET=your-super-secret-jwt-key-change-in-production
```

### 3. Get Google Client Secret

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **APIs & Services** > **Credentials**
4. Click on your OAuth 2.0 Client ID
5. Copy the **Client Secret** from the dialog
6. Paste it in your `.env` file as `GOOGLE_CLIENT_SECRET`

### 4. Configure Authorized Redirect URIs

In Google Cloud Console, under your OAuth 2.0 Client credentials:

**Authorized JavaScript origins:**
- `http://localhost:4200` (Frontend)
- `http://localhost:9005` (Backend)
- `https://yourdomain.com` (Production)

**Authorized redirect URIs:**
- `http://localhost:4200` (Frontend)
- `http://localhost:9005` (Backend)
- `https://yourdomain.com` (Production)

## API Endpoints

### POST /api/user/auth/google

**Description:** Authenticate user with Google (supports both flows)

**Request Body (Authorization Code):**
```json
{
  "code": "4/0AY0e-g7sWd..."
}
```

**Request Body (ID Token - Backward Compatible):**
```json
{
  "credential": "eyJhbGciOiJSUzI1NiIsImtpZCI6..."
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Account created successfully",
  "data": {
    "userId": 1,
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "isNew": true
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Failed to exchange authorization code"
}
```

### POST /api/user/auth/verify-google

**Description:** Verify Google token without creating/logging in user

**Request Body:**
```json
{
  "credential": "eyJhbGciOiJSUzI1NiIsImtpZCI6..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Token verified successfully",
  "data": {
    "googleId": "123456789",
    "email": "user@example.com",
    "emailVerified": true,
    "firstName": "John",
    "lastName": "Doe",
    "picture": "https://..."
  }
}
```

## Frontend Implementation

### With Authorization Code Flow

```typescript
// Frontend sends authorization code
async function googleLogin(authResult: any) {
  if (authResult.code) {
    // Send code to backend
    const response = await fetch('http://localhost:9005/api/user/auth/google', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: authResult.code  // Authorization code
      })
    });
    
    const result = await response.json();
    if (result.success) {
      localStorage.setItem('auth_token', result.data.token);
      // Redirect to dashboard
    }
  }
}
```

### With ID Token Flow (Backward Compatible)

```typescript
// Frontend sends credential token
async function googleLogin(credentialResponse: any) {
  const response = await fetch('http://localhost:9005/api/user/auth/google', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      credential: credentialResponse.credential  // ID Token
    })
  });
  
  const result = await response.json();
  if (result.success) {
    localStorage.setItem('auth_token', result.data.token);
  }
}
```

## How It Works

### Authorization Code Flow (New)

1. **Frontend initiates login** - User clicks "Sign in with Google"
2. **Google shows consent screen** - User selects account
3. **Frontend receives authorization code** - Not the token itself
4. **Frontend sends code to backend** - POST `/api/user/auth/google`
5. **Backend exchanges code** - Uses `google.auth.OAuth2.getToken()`
6. **Backend gets user info** - Calls Google API with access token
7. **User is created/logged in** - Backend uses `socialLoginHandler`
8. **JWT token returned** - Frontend stores token in localStorage
9. **Redirect to dashboard** - User is logged in

### ID Token Flow (Old - Still Supported)

1. **Frontend receives ID Token** - From Google SDK directly
2. **Frontend sends token to backend** - POST `/api/user/auth/google`
3. **Backend verifies token** - Uses `OAuth2Client.verifyIdToken()`
4. **User is created/logged in** - Backend uses `socialLoginHandler`
5. **JWT token returned** - Frontend stores token
6. **User is logged in** - Redirect to dashboard

## Benefits of Authorization Code Flow

✅ **More secure** - Code is short-lived and single-use  
✅ **Server-side token management** - Never exposed to frontend  
✅ **No FedCM restrictions** - Works in all browsers  
✅ **Better compatibility** - Works with browser privacy settings  
✅ **Full control** - Backend handles all authentication logic  
✅ **Backward compatible** - Old ID Token flow still works  

## Testing

### Test Authorization Code Flow

```bash
# 1. Start backend server
npm start

# 2. Frontend makes request
curl -X POST http://localhost:9005/api/user/auth/google \
  -H "Content-Type: application/json" \
  -d '{"code": "4/0AY0e-g7sWd..."}'

# 3. Check response
# Should return JWT token and user data
```

### Test ID Token Flow

```bash
# 1. Start backend server
npm start

# 2. Frontend makes request
curl -X POST http://localhost:9005/api/user/auth/google \
  -H "Content-Type: application/json" \
  -d '{"credential": "eyJhbGciOiJSUzI1NiIsImtpZCI6..."}'

# 3. Check response
# Should return JWT token and user data
```

## Troubleshooting

### Error: "GOOGLE_CLIENT_SECRET not set"

**Solution:** Add `GOOGLE_CLIENT_SECRET` to your `.env` file and restart the server.

### Error: "Failed to exchange authorization code"

**Possible causes:**
- Invalid authorization code
- Authorization code already used (single-use)
- Authorization code expired (10 minutes)
- Incorrect `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET`

**Solution:** Ensure the code is fresh and credentials are correct.

### Error: "Token verification failed"

**Possible causes:**
- Invalid Google token
- Token expired
- Incorrect `GOOGLE_CLIENT_ID`

**Solution:** Ensure the token is valid and not expired.

### Error: "Wrong recipient, payload audience != requiredAudience"

**Causes:**
- Frontend and backend using different Google Client IDs
- ID Token created with different audience

**Solution:** Ensure both frontend and backend use the same `GOOGLE_CLIENT_ID`.

## Environment Variables

### Required

```env
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
JWT_SECRET=your_jwt_secret
```

### Optional

```env
NODE_ENV=development
API_URL=http://localhost:9005
ADMIN_URL=http://localhost:4200
```

## Code Structure

### Main Endpoint

**File:** `src/routes/api-webapp/authentication/user/user-api.ts`

```typescript
router.post("/auth/google", async (req: Request, res: Response) => {
  const { code, credential } = req.body;
  
  if (code) {
    // Authorization code flow
    await handleAuthorizationCode(code, req, res);
  } else if (credential) {
    // ID token flow (backward compatible)
    await handleCredentialToken(credential, req, res);
  }
});
```

### Helper Functions

1. **handleAuthorizationCode()** - Exchanges code for user info
2. **handleCredentialToken()** - Verifies ID token
3. **processGoogleUser()** - Creates/updates user and returns JWT

### Integration

Uses existing `socialLoginHandler()` for consistent user processing:
- Creates new user on first login
- Links accounts by email
- Generates JWT token
- Returns user data

## Production Deployment

### Before Deployment

1. ✅ Update `GOOGLE_CLIENT_SECRET` in production `.env`
2. ✅ Add production domain to Google Console credentials
3. ✅ Update `API_URL` and `ADMIN_URL` to production URLs
4. ✅ Set `NODE_ENV=production`
5. ✅ Change `JWT_SECRET` to production value
6. ✅ Enable HTTPS (required for OAuth)

### Deployment Steps

```bash
# 1. Update .env with production values
# 2. Build and deploy backend
npm run build
npm start

# 3. Test with production URLs
# 4. Monitor logs for errors
```

## Security Considerations

✅ **Authorization code is single-use** - Cannot be reused  
✅ **Authorization code expires in 10 minutes** - Time-limited  
✅ **Client secret never exposed to frontend** - Server-side only  
✅ **Access token never stored in frontend** - Server handles it  
✅ **JWT token has 7-day expiration** - Configurable in code  
✅ **HTTPS required for production** - Encrypts all communication  

## Support

For issues or questions:

1. Check the **Troubleshooting** section above
2. Verify `.env` configuration
3. Check backend logs for errors
4. Ensure Google Console settings are correct
5. Review the code structure above

---

**Last Updated:** December 3, 2025  
**Version:** 1.0.0 (OAuth2 Authorization Code Flow Support)
