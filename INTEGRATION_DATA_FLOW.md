# Integration Data Flow - Complete Documentation

## Overview
When users complete the OAuth stepper for any social integration (Pinterest, Facebook, LinkedIn, GMB), their account data is:
1. **Stored in the database** (backend SocialToken model)
2. **Fetched from the database** (frontend calls backend API)
3. **Displayed in the integrations page** (main component)
4. **Displayed in the configuration panel** (platform-specific config components)

---

## Data Storage Flow (Backend)

### OAuth Callback Handler
When user completes OAuth and returns to the callback endpoint:

**Pinterest OAuth Callback: `GET /pinterest/oauth2callback`**
```typescript
// Receives authorization code from Pinterest
// Exchanges code for access token
// Fetches user profile from Pinterest API
// Stores in database: SocialToken table
await SocialToken.create({
  companyId,           // Which company owns this
  provider: 'pinterest',
  accountId,          // Pinterest profile ID (e.g., "894738788377699066")
  accountEmail,       // Pinterest username
  displayName,        // Full name from Pinterest
  pictureUrl,         // Profile picture URL
  accessToken,        // Secure token
  refreshToken,       // For token refresh
  expiryDate,         // Token expiration
  tokenType,          // 'Bearer'
  scopes              // Authorized scopes
});
```

**Similar flow for:**
- Facebook: `GET /facebook/oauth2callback`
- LinkedIn: `GET /linkedin/oauth2callback`  
- GMB: `GET /gmb/oauth2callback`

---

## Data Retrieval Flow (Frontend)

### Step 1: Integration Component Lifecycle
When `integrations.component.ts` initializes:

```typescript
ngOnInit() {
  // Called automatically when component loads
  this.checkFacebookConnection();
  this.checkLinkedInConnection();
  this.checkPinterestConnection();
  this.checkGMBConnection();
}
```

### Step 2: Check Connection (Priority System)

Each `check<Platform>Connection()` method uses a **3-level priority system**:

**Priority 1: localStorage** (Fastest)
```typescript
const tokensJson = localStorage.getItem('pinterestTokens');
if (tokensJson) {
  const tokens = JSON.parse(tokensJson);
  if (tokens.accessToken) {
    this.pinterestConnected = true;
    this.loadPinterestProfile();
    return; // ← Exit early if found
  }
}
```

**Priority 2: sessionStorage** (Session-based)
```typescript
const userInfo = sessionStorage.getItem('pinterest_user');
if (userInfo) {
  this.pinterestUser = JSON.parse(userInfo);
  this.pinterestConnected = true;
  this.loadPinterestProfile();
  return; // ← Exit early if found
}
```

**Priority 3: Database** (Most Reliable)
```typescript
const companyId = localStorage.getItem('company_id');
if (companyId) {
  this.checkDatabaseForConnectedPinterest(companyId);
  return;
}
```

### Step 3: Fetch from Database

If data not in localStorage/sessionStorage, call backend API:

```typescript
checkDatabaseForConnectedPinterest(companyId: string) {
  this.pinterestIntegrationService.getPinterestProfile().subscribe({
    next: (response: any) => {
      if (response.success && response.user) {
        // Backend returned profile from database
        const userData = response.user;
        
        // Extract and normalize picture URL
        let pictureUrl = userData.picture?.data?.url || 
                        userData.picture?.url || 
                        userData.picture;
        
        // Create user object
        this.pinterestUser = {
          id: userData.id || userData.pinterestId,
          name: userData.name,
          email: userData.email || userData.accountEmail,
          picture: { data: { url: pictureUrl } }
        };
        
        // Cache locally for next time
        localStorage.setItem('pinterestConnection', JSON.stringify(this.pinterestUser));
        
        // Update UI
        this.pinterestConnected = true;
      } 
    }
  });
}
```

---

## Backend API Endpoints

### Get User Profile (Database-backed)

**Endpoint:** `GET /pinterest/me/profile`

**What it does:**
1. Resolves access token from multiple sources:
   - Query parameter: `?access_token=xxx`
   - Header: `Authorization: Bearer xxx`
   - Database lookup: `?companyId=xxx&accountId=xxx`
2. Fetches user profile from Pinterest API (using stored token)
3. Handles token refresh if expired
4. Returns profile data

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "894738788377699066",
    "username": "john_doe",
    "name": "John Doe",
    "email": "john@example.com",
    "profile_image": {
      "original": {
        "url": "https://s.pinimg.com/images/user/john.jpg"
      }
    }
  }
}
```

**Similar endpoints for other platforms:**
- Facebook: `GET /facebook/me`
- LinkedIn: `GET /linkedin/me`
- GMB: `GET /gmb/me`

---

## Frontend Data Display

### Integration List Page (`integrations.component.html`)

Shows connection status and quick info for each platform:

```html
<!-- Pinterest Section -->
<div *ngIf="connections.pinterest.isConnected" class="integration-card">
  <img [src]="pinterestUser?.picture?.data?.url" />
  <span>{{ pinterestUser?.name }}</span>
  <button (click)="openPinterestConfig()">Configure</button>
</div>
```

### Configuration Panel (`pinterest-config.component.html`)

Displays detailed profile information and account management:

```html
<div *ngIf="pinterestAccount">
  <img [src]="pinterestAccount.picture?.data?.url" />
  <h3>{{ pinterestAccount.name }}</h3>
  <p>Email: {{ pinterestAccount.email }}</p>
  <p>ID: {{ pinterestAccount.accountId }}</p>
  <button (click)="disconnect()">Disconnect</button>
</div>
```

---

## Complete Data Flow Example: Pinterest

### Step 1: User Clicks "Connect Pinterest"
```
Frontend: initiatePinterestConnection()
  ├─ Sets activeModel = 'pinterest'
  └─ Stepper displays Step 1: "Authorize Pinterest"
```

### Step 2: User Authorizes
```
Frontend: User clicks "Continue to Pinterest"
  └─ Redirects to Pinterest OAuth page
     └─ User logs in and grants permissions
        └─ Pinterest redirects to backend callback
```

### Step 3: Backend Processes Authorization
```
Backend: GET /pinterest/oauth2callback?code=xxx&state=xxx
  ├─ Validates state parameter
  ├─ Exchanges code for access token
  ├─ Fetches user profile from Pinterest API
  ├─ Stores in database (SocialToken table)
  └─ Redirects to frontend: /profile/integrations?success=true&accountId=...
```

### Step 4: Frontend Processes Callback
```
Frontend: integrations.component.ts - redirectPinterestModal()
  ├─ Detects OAuth callback in URL params
  ├─ Stores callback data in sessionStorage
  ├─ Clears URL params (clean browser history)
  └─ Stepper detects callback data
     └─ Loads user profile from backend API
        └─ Displays Step 2: "Setup Complete"
```

### Step 5: User Completes Stepper
```
Frontend: User clicks "Done" button
  ├─ Stepper calls openConfiguration()
  │  ├─ Saves connection to localStorage
  │  ├─ Clears OAuth callback data
  │  └─ Emits closeModal({ action: 'openConfig' })
  └─ Parent handles closeModal event
     ├─ Sets activeModel = '' (hides stepper)
     ├─ Sets activeTab = 'pinterest' (shows config)
     └─ Config panel loads and displays account
```

### Step 6: Data Available Everywhere
```
Integration List Page:
  └─ Loads pinterestUser from localStorage
     └─ Displays account name, picture, email

Configuration Panel:
  └─ Loads full profile data
     └─ Displays account details, actions

After Page Refresh:
  ├─ Component.ngOnInit() calls checkPinterestConnection()
  ├─ Checks localStorage (finds it!)
  ├─ Calls loadPinterestProfile()
  └─ Everything is restored correctly
```

---

## Data Persistence Strategy

### localStorage
- **When set**: After user authorizes and profile is loaded
- **What stores**: Tokens, user profile, connection metadata
- **Lifetime**: Persists until manually cleared or user logs out
- **Use case**: Fast access without API call

### sessionStorage  
- **When set**: During OAuth callback processing
- **What stores**: OAuth callback data, temporary flags
- **Lifetime**: Persists until browser tab closed
- **Use case**: Temporary communication between components during OAuth

### Database (SocialToken table)
- **When set**: During OAuth callback (backend)
- **What stores**: Access tokens, refresh tokens, user metadata
- **Lifetime**: Until user disconnects
- **Use case**: Authoritative source of truth, survives client logout

---

## Troubleshooting Guide

### Issue: Profile Not Showing After Connection
**Check in order:**
1. ✅ localStorage has 'pinterestConnection'?
   ```javascript
   console.log(localStorage.getItem('pinterestConnection'));
   ```

2. ✅ sessionStorage has 'pinterest_user'?
   ```javascript
   console.log(sessionStorage.getItem('pinterest_user'));
   ```

3. ✅ Backend has data in SocialToken table?
   ```sql
   SELECT * FROM SocialToken WHERE provider='pinterest' AND companyId='xxx';
   ```

4. ✅ Backend API `/pinterest/me/profile` returns data?
   ```bash
   curl "http://localhost:9005/pinterest/me/profile?companyId=xxx"
   ```

### Issue: Page Refresh Loses Profile
**Solution**: Check `checkDatabaseForConnectedPinterest()` is being called
```typescript
// Should be called in checkPinterestConnection() at Priority 3
const companyId = localStorage.getItem('company_id');
if (companyId) {
  this.checkDatabaseForConnectedPinterest(companyId); // ← Ensure this is called
}
```

### Issue: Token Expired/Refresh Not Working
**Check:**
1. ✅ Refresh token stored in database?
   ```sql
   SELECT refreshToken FROM SocialToken WHERE accountId='xxx';
   ```

2. ✅ Backend `/me/profile` endpoint has refresh logic?
   - Lines 728-740 in pinterest-api.ts handle token refresh

3. ✅ Refresh token valid with Pinterest API?
   - Test with: `refreshPinterestAccessToken(refreshToken)`

---

## Implementation Checklist

For each new integration (e.g., TikTok), ensure:

- [ ] **Backend OAuth Callback**
  - [ ] Exchanges code for tokens
  - [ ] Fetches user profile from API
  - [ ] Stores in SocialToken table with all fields
  - [ ] Redirects with success params

- [ ] **Backend Profile API**
  - [ ] Endpoint to fetch stored profile from database
  - [ ] Handles token refresh if expired
  - [ ] Returns user data in standard format

- [ ] **Frontend Data Fetching**
  - [ ] `check<Platform>Connection()` method with 3-tier priority
  - [ ] `checkDatabaseFor<Platform>()` method
  - [ ] Service method to call backend API

- [ ] **Frontend Display**
  - [ ] Integration list shows connection status
  - [ ] Config panel displays full profile
  - [ ] localStorage caching for performance
  - [ ] Page refresh restores data

---

## Summary

The integration system uses a **three-layer caching strategy**:

1. **Frontend Cache (localStorage)** - For instant display
2. **Session Data (sessionStorage)** - For OAuth communication
3. **Database (Backend)** - For persistent, authoritative storage

This ensures:
- ✅ Fast performance (no API call if cached)
- ✅ Reliable data (database is source of truth)
- ✅ Cross-device sync (database survives logout/login)
- ✅ Easy debugging (can trace data through all layers)
