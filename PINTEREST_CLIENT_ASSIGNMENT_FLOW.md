# Pinterest Client Assignment Flow - Complete Guide

## Overview
This document describes the complete flow for assigning clients to Pinterest profiles, including both new assignments and editing existing assignments.

## Components Involved

1. **pinterest-config.component.ts** - Main profile management component
2. **pinterest-client-assign.component.ts** - Client assignment modal
3. **pinterest-integration.service.ts** - Service layer for API calls
4. **Backend APIs** - Assignment endpoints

## Flow Diagrams

### 1. NEW ASSIGNMENT Flow (No client assigned yet)

```
User clicks "Assign Client" button
    ↓
openAssignClientModal(profileId) called
    ↓
Clear pinterestAssignmentData from sessionStorage
sessionStorage.setItem('selectedPinterestProfileId', profileId)
sessionStorage.setItem('selectedPinterestProfileDetails', profile)
    ↓
showClientAssignModal = true (modal opens)
    ↓
Client-Assign Component Initializes:
  - isEditMode = false (no pinterestAssignmentData found)
  - Loads available clients
  - Shows empty "Select Client" dropdown
    ↓
User selects client and clicks "Assign Client"
    ↓
assignProfileToClient() called (because isEditMode = false)
    ↓
POST /api/pinterest/{profileId}/assign-client
  Body: { companyId, clientId }
    ↓
SUCCESS: New PinterestAssignment record created in database
    ↓
assignmentComplete event emitted
    ↓
Config Component receives event
  - Calls loadProfileClientAssignments()
  - Updates UI to show assigned client
  - Modal closes
```

### 2. EDIT ASSIGNMENT Flow (Client already assigned)

```
User clicks "Edit" button next to assigned client
    ↓
editProfileAssignment(profileId) called
    ↓
getProfileAssignment(profileId) API call to fetch current assignment
    ↓
SUCCESS: Assignment data received
  {
    profileId: "xxx",
    currentClientId: "123",
    currentClientName: "John Doe",
    currentClientEmail: "john@example.com"
  }
    ↓
Store in sessionStorage:
  pinterestAssignmentData = {
    profileId, currentClientId, currentClientName,
    editMode: true  ← KEY DIFFERENCE
  }
    ↓
showClientAssignModal = true (modal opens)
    ↓
Client-Assign Component Initializes:
  - isEditMode = true (pinterestAssignmentData found with editMode: true)
  - currentClientId = "123"
  - Pre-selects current client in dropdown
  - Shows "Edit" mode in modal
    ↓
User selects NEW client and clicks "Update"
    ↓
updateProfileAssignment() called (because isEditMode = true)
    ↓
PUT /api/pinterest/profiles/update-client-assignment
  Body: {
    companyId,
    profileId,
    newClientId: "456",
    oldClientId: "123"
  }
    ↓
SUCCESS: PinterestAssignment record updated in database
    ↓
assignmentComplete event emitted
    ↓
Config Component receives event
  - Calls loadProfileClientAssignments()
  - Updates UI to show new assigned client
  - Modal closes
```

### 3. FAILED NEW ASSIGNMENT Flow (No assignment exists)

```
User tries to reassign without existing assignment
    ↓
editProfile(profileId) called
    ↓
getProfileAssignment(profileId) API call
    ↓
ERROR 404: No assignment found
    ↓
Error handler checks: if (error?.status === 404)
    ↓
Create NEW assignmentData with editMode: FALSE
  {
    profileId,
    currentClientId: null,
    editMode: false  ← Sets to FALSE for new assignment
  }
    ↓
Modal opens in NEW ASSIGNMENT MODE
    ↓
Rest follows "NEW ASSIGNMENT" flow above
```

## Key Points

### Mode Detection
- **NEW Assignment Mode (editMode = false)**: Uses `assignProfileToClient()` → POST endpoint
- **EDIT Mode (editMode = true)**: Uses `updateProfileAssignment()` → PUT endpoint

### SessionStorage Keys
- `selectedPinterestProfileId` - Profile ID being assigned
- `selectedPinterestProfileDetails` - Profile object
- `pinterestAssignmentData` - Assignment metadata (ONLY for edit mode)

### Important: Clear Assignment Data
When opening modal for NEW assignment, **always clear** `pinterestAssignmentData`:
```typescript
sessionStorage.removeItem('pinterestAssignmentData');
```

This prevents accidentally opening in EDIT mode when no assignment exists.

## API Endpoints

### 1. Create New Assignment
```
POST /api/pinterest/{profileId}/assign-client
Body: { companyId, clientId }
```

### 2. Update Existing Assignment
```
PUT /api/pinterest/profiles/update-client-assignment
Body: {
  companyId,
  profileId,
  newClientId,
  oldClientId (optional)
}
```

### 3. Get Assignment Details
```
GET /api/pinterest/profiles/get-assignment/{profileId}
Returns: { currentClientId, currentClientName, currentClientEmail, profileName }
```

## Error Handling

### 404 Not Found (Assignment doesn't exist)
- When updating: Check if assignment record exists
- When creating: Profile not found in database

### 400 Bad Request
- Missing required parameters
- Invalid client ID
- Invalid profile ID

### 409 Conflict
- Assignment was changed by another user
- Retry with fresh data

## Testing Checklist

- [ ] Click "Assign Client" on unassigned profile
  - Modal should open in NEW mode
  - No client should be pre-selected
  - Submit calls `assignProfileToClient()`

- [ ] Click "Edit" on assigned profile
  - Modal should open in EDIT mode
  - Current client should be pre-selected
  - Submit calls `updateProfileAssignment()`

- [ ] Reassign to different client
  - Old client should be in currentClientId
  - New client should be newClientId
  - Backend updates assignment record

- [ ] Error cases
  - 404 on edit → Should open NEW assignment modal
  - 400 on submit → Show error alert
  - 409 on update → Show conflict error

## Debugging

Enable console logging to see:
- `[PINTEREST CONFIG]` - Config component logs
- `[PINTEREST CLIENT ASSIGN]` - Modal component logs
- `[PINTEREST SERVICE]` - Service layer logs
- `[PINTEREST UPDATE ASSIGNMENT]` - Backend logs (from API response)

Look for logs indicating mode:
- `✅ NEW ASSIGNMENT MODE`
- `✅ EDIT MODE`
