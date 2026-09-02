# Rejected Candidates Email Button Fix

## Issue
The "Send Bulk Email to Rejected Candidates" button was greyed out (disabled) even though there were 4 candidates with "Resume Rejected" status visible in the table.

## Root Cause
The button was filtering for **only `interview_rejected`** status candidates:

```typescript
const rejectedRecipients = useMemo(
  () => sourceCandidates.filter((candidate) => candidate.status === "interview_rejected"),
  [sourceCandidates]
);
```

However, the candidates in the table had `resume_rejected` status, not `interview_rejected`, so the filter returned 0 candidates and the button was disabled.

## Solution
Updated the filter to include **both types of rejected candidates**:
- `resume_rejected` - Candidates rejected during resume screening
- `interview_rejected` - Candidates rejected after interview

### Code Changes

**File**: `frontend/components/admin/job-candidate-management-section.tsx`

**Change 1**: Updated rejected recipients filter
```typescript
const rejectedRecipients = useMemo(
  () => sourceCandidates.filter((candidate) => 
    candidate.status === "interview_rejected" || candidate.status === "resume_rejected"
  ),
  [sourceCandidates]
);
```

**Change 2**: Updated modal title and description
```typescript
<DialogTitle>Email Rejected Candidates</DialogTitle>
<DialogDescription>
  Sending to {rejectedRecipients.length} Rejected candidates (Resume Rejected + Interview Rejected)
</DialogDescription>
```

**Change 3**: Updated button tooltip
```typescript
title={!canSendRejected ? "No rejected candidates for this role" : undefined}
```

## Testing
With the current data showing 4 "Resume Rejected" candidates:
- ✅ Button should now be enabled
- ✅ Clicking the button should open the modal
- ✅ Modal should show "Sending to 4 Rejected candidates"
- ✅ Email should be sent to all 4 resume rejected candidates

## Impact
- **Before**: Button disabled, couldn't send emails to resume rejected candidates
- **After**: Button enabled, can send emails to both resume rejected AND interview rejected candidates

## Status
✅ **FIXED** - Rejected candidates email button now works for both rejection types
