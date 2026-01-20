# OTP Verification API Update

## Overview
Updated both user registration and client signup OTP verification endpoints to support **either email OTP OR mobile OTP** verification, instead of requiring both.

## Changes Made

### 1. User Registration API (`src/routes/api-webapp/authentication/user/user-api.ts`)

#### `/register/start` - OTP Sending
- Generates separate email OTP and mobile OTP
- Stores both `otp` (email) and `mbOTP` (mobile) in the database
- Sends OTP to both email and contact

**Request:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "contact": "9876543210",
  "password": "password123",
  "confirmPassword": "password123",
  "countryCode": "+91"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Signup step 1 done. OTP sent to john@example.com and 9876543210.",
  "data": {
    "otpRefId": 123,
    "email": "john@example.com",
    "contact": "9876543210",
    "countryCode": "+91"
  }
}
```

#### `/register/verify-otp` - OTP Verification
- Now accepts **EITHER** email OTP or mobile OTP (or both)
- Verifies with the OTP provided and marks the corresponding channel as verified
- Creates user with appropriate verification flags

**Request (Email OTP only):**
```json
{
  "email": "john@example.com",
  "otp": "123456"
}
```

**Request (Mobile OTP only):**
```json
{
  "email": "john@example.com",
  "mbOTP": "789012"
}
```

**Request (Both OTPs):**
```json
{
  "email": "john@example.com",
  "otp": "123456",
  "mbOTP": "789012"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP verified. User created. Proceed to categories selection.",
  "data": {
    "userId": 1,
    "secretCode": "xyz123",
    "countryCode": "+91",
    "email": "john@example.com",
    "sessionId": "session_id"
  }
}
```

### 2. Client Signup API (`src/routes/api-webapp/agency/clients/clients-api.ts`)

#### `/clientSignup/verify-otp` - OTP Verification
- Updated to match user-api.ts pattern
- Accepts **EITHER** email OTP or mobile OTP
- Sets `isEmailVerified` and `isMobileVerified` based on which OTP was used

**Request (Email OTP only):**
```json
{
  "email": "client@example.com",
  "otp": "123456"
}
```

**Request (Mobile OTP only):**
```json
{
  "email": "client@example.com",
  "mbOTP": "789012"
}
```

## Verification Logic

### Database Query Pattern
```typescript
// Build conditions for EITHER email OTP OR mobile OTP
const whereConditions: any[] = [];

if (otp) {
  whereConditions.push({
    otp: String(otp),
    otpExpiresAt: { [Op.gt]: new Date() }, // Check expiry
  });
}

if (mbOTP) {
  whereConditions.push({
    mbOTP: String(mbOTP),
    mbOTPExpiresAt: { [Op.gt]: new Date() }, // Check expiry
  });
}

// Find OTP record matching EITHER condition
const otpRecord = await Otp.findOne({
  where: {
    email,
    otpVerify: false,
    [Op.or]: whereConditions, // Match EITHER condition
  },
});
```

### Verification Flags
```typescript
let isEmailVerified = false;
let isMobileVerified = false;

if (otp && otpRecord.otp === String(otp)) {
  isEmailVerified = true;
}

if (mbOTP && otpRecord.mbOTP === String(mbOTP)) {
  isMobileVerified = true;
}

// Create user with appropriate flags
const user = await User.create({
  ...tempUserData,
  isEmailVerified: isEmailVerified,    // true if email OTP was verified
  isMobileVerified: isMobileVerified,  // true if mobile OTP was verified
  isRegistering: true,
  registrationStep: 2,
  isActive: false,
});
```

## OTP Record Cleanup
- Only clears the OTP field that was verified
- Keeps the other OTP field in case user wants to verify the second channel later

```typescript
// Clear only the verified OTP
if (isEmailVerified) {
  otpRecord.otp = null;
  otpRecord.otpExpiresAt = null;
}
if (isMobileVerified) {
  otpRecord.mbOTP = null;
  otpRecord.mbOTPExpiresAt = null;
}
```

## Error Handling
- **Invalid/Missing Email:** Returns 400 error
- **Missing OTP:** Returns 400 error (requires at least one OTP)
- **Invalid OTP:** Returns 400 error with message "Invalid / expired OTP."
- **Expired OTP:** Returns 400 error (expiry checked in database query)
- **OTP Already Used:** Returns 400 error (otpVerify flag is true)

## Testing Checklist

- [ ] Send OTP to both email and contact
- [ ] Verify with email OTP only
- [ ] Verify with mobile OTP only
- [ ] Verify with both OTPs
- [ ] Test expired OTP (wait 10+ minutes)
- [ ] Test invalid OTP
- [ ] Verify correct email/contact flags are set
- [ ] Test duplicate email/contact rejection

## Benefits

1. **Flexible Verification:** Users can verify through either email or mobile
2. **Better UX:** Users don't have to verify both channels if not needed
3. **Accurate Flags:** `isEmailVerified` and `isMobileVerified` reflect actual verification method
4. **Efficient Database Queries:** Uses `Op.gt` for expiry checks in database query
5. **Backward Compatible:** Supports both single and dual OTP verification

