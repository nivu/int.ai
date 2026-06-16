# Candidate Name Priority Fix

## Issue
When clicking on a candidate, the system was displaying the name parsed from the resume instead of the name provided in the application form's name section.

## Root Cause
The candidate detail page was prioritizing `resumeData.parsed_name` (extracted from the resume by the AI parser) over `application.candidate.full_name` (the name entered in the application form).

## Solution
Updated the priority order in `frontend/app/(admin)/candidates/[id]/candidate-detail-client.tsx`:

### 1. Page Title (Line 126)
**Before:**
```tsx
{resumeData?.parsed_name || application.candidate?.full_name || "Candidate"}
```

**After:**
```tsx
{application.candidate?.full_name || resumeData?.parsed_name || "Candidate"}
```

### 2. Contact Card (Lines 248-265)
**Before:**
- Displayed parsed name from resume first
- No indication when names differed

**After:**
- Displays the application form name first
- Shows email from multiple sources (parsed, form, or candidate record)
- If the resume name differs from the application name, it's shown as supplementary information: "Name on resume: [parsed_name]"

## Benefits
1. **Consistency**: The name the candidate provided in the form is now the primary identifier
2. **Transparency**: When resume name differs, it's still visible but clearly labeled
3. **Data Integrity**: Respects the candidate's self-identified name from the application form

## Testing
To verify the fix:
1. Create a candidate application with a specific name (e.g., "John Smith")
2. Upload a resume with a different name (e.g., "Jonathan Smith")
3. Click on the candidate in the admin panel
4. Verify the title shows "John Smith" (from the form)
5. Check the Contact card shows "John Smith" as the primary name
6. If different, verify "Name on resume: Jonathan Smith" appears as supplementary info

## Files Modified
- `frontend/app/(admin)/candidates/[id]/candidate-detail-client.tsx`
