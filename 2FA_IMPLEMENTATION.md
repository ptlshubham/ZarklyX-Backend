# Two-Factor Authentication (2FA) Implementation

## Overview
This document describes the complete 2FA implementation for ZarklyX backend. The system uses Time-Based One-Time Password (TOTP) via authenticator apps and backup codes as fallback.

## Database Schema
The following fields have been added to the `User` model:
- `twofactorEnabled` (BOOLEAN, default: false) - Whether 2FA is enabled
- `twofactorSecret` (STRING) - The TOTP secret key
- `twofactorVerified` (BOOLEAN, default: false) - Whether 2FA setup is verified
- `twofactorBackupCodes` (JSON) - Array of 10 backup codes

## API Endpoints

### 1. Generate 2FA Secret and QR Code
**Endpoint:** `POST /user/2fa/setup`  
**Authentication:** Required (Bearer token)  
**Description:** Generates a new 2FA secret and returns a QR code for scanning

**Response:**
```json
{
  "success": true,
  "message": "2FA secret generated. Please scan the QR code with an authenticator app.",
  "data": {
    "secret": "JBSWY3DPEBLW64TMMQ======",
    "qrCode": "data:image/png;base64,...",
    "manualEntryKey": "JBSWY3DPEBLW64TMMQ======"
  }
}
```

**Client Flow:**
1. User clicks "Enable 2FA"
2. Frontend calls this endpoint
3. Display QR code to user
4. User scans with authenticator app (Google Authenticator, Authy, etc.)
5. User proceeds to verification endpoint

---

### 2. Enable 2FA (Verify Secret)
**Endpoint:** `POST /user/2fa/enable`  
**Authentication:** Required (Bearer token)  
**Description:** Verifies the 2FA secret and enables 2FA for the user

**Request Body:**
```json
{
  "secret": "JBSWY3DPEBLW64TMMQ======",
  "verificationCode": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "2FA has been enabled successfully.",
  "data": {
    "twofactorEnabled": true,
    "backupCodes": [
      "ABC12345",
      "DEF67890",
      "GHI23456",
      "JKL78901",
      "MNO34567",
      "PQR89012",
      "STU45678",
      "VWX90123",
      "YZ456789",
      "ABC01234"
    ],
    "warning": "Save these backup codes in a safe place. You will need them if you lose access to your authenticator app."
  }
}
```

**Notes:**
- Verification code is a 6-digit TOTP code from the authenticator app
- System allows ±2 time windows for code verification (±60 seconds)
- 10 backup codes are auto-generated when 2FA is enabled
- User must save backup codes immediately

---

### 3. Disable 2FA
**Endpoint:** `POST /user/2fa/disable`  
**Authentication:** Required (Bearer token)  
**Description:** Disables 2FA for the user (requires password verification)

**Request Body:**
```json
{
  "password": "user_password"
}
```

**Response:**
```json
{
  "success": true,
  "message": "2FA has been disabled successfully.",
  "data": {
    "twofactorEnabled": false
  }
}
```

**Security:**
- Requires password verification
- Clears the secret and backup codes
- Records the action in audit logs

---

### 4. Verify 2FA Code During Login
**Endpoint:** `POST /user/2fa/verify-login`  
**Authentication:** Not required (this is part of login flow)  
**Description:** Verifies 2FA code during login process

**Request Body - Option 1 (TOTP Code):**
```json
{
  "userId": "user-uuid-here",
  "totpCode": "123456"
}
```

**Request Body - Option 2 (Backup Code):**
```json
{
  "userId": "user-uuid-here",
  "backupCode": "ABC12345"
}
```

**Response:**
```json
{
  "success": true,
  "message": "2FA verified successfully for user@example.com.",
  "data": {
    "userId": "user-uuid-here",
    "companyId": "company-uuid-or-null",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "sessionId": "session-id-here"
  }
}
```

**Error Response (Invalid Code):**
```json
{
  "success": false,
  "message": "Invalid 2FA code or backup code."
}
```

**Important Notes:**
- Backup code can only be used once (automatically deleted after verification)
- TOTP codes can be reused within the time window
- Failed attempts are logged in login history

---

### 5. Get 2FA Status
**Endpoint:** `GET /user/2fa/status`  
**Authentication:** Required (Bearer token)  
**Description:** Retrieves the 2FA status for the authenticated user

**Response:**
```json
{
  "success": true,
  "message": "2FA status retrieved successfully.",
  "data": {
    "twofactorEnabled": true,
    "twofactorVerified": true
  }
}
```

---

### 6. Regenerate Backup Codes
**Endpoint:** `POST /user/2fa/regenerate-backup-codes`  
**Authentication:** Required (Bearer token)  
**Description:** Generates new backup codes (requires password verification)

**Request Body:**
```json
{
  "password": "user_password"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Backup codes regenerated successfully.",
  "data": {
    "backupCodes": [
      "ABC12345",
      "DEF67890",
      "GHI23456",
      "JKL78901",
      "MNO34567",
      "PQR89012",
      "STU45678",
      "VWX90123",
      "YZ456789",
      "ABC01234"
    ],
    "warning": "Save these new backup codes in a safe place. The old codes are no longer valid."
  }
}
```

---

## Login Flow with 2FA

### Step 1: Initial Login (Password Verification)
```
POST /user/login
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response if 2FA is disabled:**
```json
{
  "success": true,
  "userId": "user-uuid",
  "companyId": "company-uuid",
  "token": "jwt-token",
  "message": "Password verified. user@example.com."
}
```

**Response if 2FA is enabled:**
```json
{
  "success": true,
  "message": "Password verified. Please provide 2FA code to complete login.",
  "data": {
    "userId": "user-uuid",
    "requires2FA": true
  }
}
```

### Step 2: 2FA Verification (if enabled)
```
POST /user/2fa/verify-login
{
  "userId": "user-uuid",
  "totpCode": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "2FA verified successfully for user@example.com.",
  "data": {
    "userId": "user-uuid",
    "companyId": "company-uuid",
    "token": "jwt-token",
    "sessionId": "session-id"
  }
}
```

---

## Frontend Implementation Guide

### Setup 2FA Flow:
1. **User clicks "Enable 2FA"**
   - Frontend calls `POST /user/2fa/setup`
   - Receives QR code and secret

2. **Display QR Code**
   - User scans with authenticator app
   - Or manually enters the secret key

3. **Verify Code**
   - User enters 6-digit code from authenticator
   - Frontend calls `POST /user/2fa/enable`
   - Receives backup codes

4. **Save Backup Codes**
   - Display to user with warning
   - User downloads or prints codes

### Login with 2FA:
1. **Initial Login**
   - User enters email/password
   - `POST /user/login`

2. **Check if 2FA Required**
   - If response includes `requires2FA: true`, proceed to Step 3
   - Otherwise, login is complete

3. **Enter 2FA Code**
   - Display input field for 6-digit code
   - `POST /user/2fa/verify-login`
   - On success, store JWT token

4. **Backup Code Option**
   - If user doesn't have authenticator, provide backup code input
   - Same endpoint, just use `backupCode` instead of `totpCode`

### Disable 2FA:
1. **User clicks "Disable 2FA"**
2. **Prompt for Password**
3. **Call `POST /user/2fa/disable`**
4. **Show confirmation message**

---

## Recommended Authenticator Apps

- **Google Authenticator** (iOS, Android)
- **Authy** (iOS, Android, Chrome Extension)
- **Microsoft Authenticator** (iOS, Android)
- **1Password** (iOS, Android, Desktop)
- **LastPass** (iOS, Android, Desktop)

---

## Security Considerations

1. **Secret Storage**: Secrets are stored in the database encrypted (via hashing recommended in production)
2. **Backup Codes**: One-time use only, should be stored securely
3. **Time Window**: ±2 time windows (±60 seconds) for code acceptance
4. **Failed Attempts**: All failed 2FA attempts are logged
5. **Password Protection**: Sensitive operations (disable, regenerate) require password re-entry
6. **Session Tracking**: Login history records include device info and IP address

---

## Error Codes & Messages

| Error | Status | Message |
|-------|--------|---------|
| Invalid Secret | 400 | "Invalid verification code. Please try again." |
| 2FA Not Enabled | 400 | "2FA is not enabled for this user." |
| Invalid Code | 400 | "Invalid 2FA code or backup code." |
| Invalid Password | 401 | "Invalid password." |
| User Not Found | 404 | "User not found" |
| Missing Fields | 400 | "secret and verificationCode are required" |

---

## Testing Checklist

- [ ] Generate 2FA secret and QR code
- [ ] Scan QR code with authenticator app
- [ ] Enable 2FA with valid code
- [ ] Verify backup codes are generated
- [ ] Login with 2FA enabled
- [ ] Verify login with TOTP code
- [ ] Verify login with backup code
- [ ] Verify backup code deletion after use
- [ ] Disable 2FA with password
- [ ] Regenerate backup codes
- [ ] Test with expired/invalid codes
- [ ] Check login history records

---

## Troubleshooting

### "QR Code not displaying"
- Check if qrcode package is installed: `npm list qrcode`
- Verify speakeasy is generating otpauth_url correctly

### "Verification code always fails"
- Check system time synchronization on server
- Time window is ±2 (±60 seconds)
- Try code from different time period

### "Backup codes not working"
- Verify backup code format matches (8 characters)
- Check if code has already been used
- Generate new codes if needed

### "Lost access to authenticator"
- User can use any remaining backup code to login
- After login, can regenerate codes
- Admin can manually disable 2FA if needed (requires separate admin endpoint)

---

## Database Queries

### Get users with 2FA enabled:
```sql
SELECT * FROM user WHERE twofactorEnabled = true;
```

### Disable 2FA for a user (admin):
```sql
UPDATE user SET 
  twofactorEnabled = false, 
  twofactorVerified = false, 
  twofactorSecret = NULL, 
  twofactorBackupCodes = NULL 
WHERE id = 'user-uuid';
```

---

## Future Enhancements

1. **SMS 2FA**: Add SMS-based 2FA as alternative
2. **Push Notifications**: Send push notifications for 2FA verification
3. **Security Keys**: Support hardware security keys (FIDO2)
4. **Biometric**: Support biometric authentication
5. **Admin Panel**: Dashboard to manage user 2FA status
6. **Recovery Codes**: Generate downloadable recovery codes
7. **Trusted Devices**: Remember trusted devices for 30 days

---

## Support

For issues or questions about 2FA implementation, please contact the development team.
