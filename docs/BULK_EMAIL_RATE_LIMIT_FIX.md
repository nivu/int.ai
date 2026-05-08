# Bulk Email Rate Limit Fix

## Issue
When sending bulk emails to 3 shortlisted candidates, only 2 received the email and 1 failed. The error message showed "Sent to 2 candidates (1 failed)".

## Root Cause
**Resend API Rate Limiting**: The free tier of Resend allows only **2 requests per second**. When sending emails to 3 candidates in quick succession without any delay, the 3rd email was rejected with a rate limit error:

```
Too many requests. You can only make 2 requests per second.
```

## Investigation
1. Verified all 3 candidates had `status = 'shortlisted'` in the database:
   - Test (team@nunnarilabs.com)
   - Sriram Tantri (sriramtantri2005@gmail.com)
   - Sriram Tantri (sriramtantri25@gmail.com)

2. Confirmed frontend correctly filtered and sent all 3 email addresses to the API

3. Tested email sending without delay → 2 succeeded, 1 failed with rate limit error

4. Tested email sending with 0.6-second delay → All 3 succeeded ✅

## Solution
Added a 0.6-second delay between each email send in the bulk email endpoint to respect Resend's rate limit of 2 requests/second.

### Code Changes

**File**: `backend/app/api/email.py`

**Change**: Added `await asyncio.sleep(0.6)` between email sends in the `send_bulk_custom_email` function.

```python
for index, recipient in enumerate(body.to):
    try:
        logger.info("Sending bulk custom email to %s", recipient)
        email_service.send_custom_email(
            to_email=recipient,
            subject=body.subject.strip(),
            body_text=body.body.strip(),
            attachments=[...],
        )
        sent_count += 1
        logger.info("Successfully sent bulk custom email to %s", recipient)
        
        # Add delay to respect Resend rate limit (2 requests/second)
        # Wait 0.6 seconds between emails to stay under the limit
        if index < len(body.to) - 1:  # Don't wait after the last email
            await asyncio.sleep(0.6)
    except Exception as exc:
        logger.exception("Failed sending bulk custom email to %s", recipient)
        failed_count += 1
        failed_recipients.append(recipient)
```

### Additional Improvements
- Added detailed logging for each email send attempt
- Added tracking of failed recipients for better debugging
- Added warning log when partial failures occur

## Testing
✅ Tested with 3 recipients - all emails sent successfully  
✅ Backend restarted with fix applied  
✅ Rate limit respected (0.6s delay = ~1.67 emails/second, under 2/second limit)

## Impact
- **Before**: Only 2 out of 3 shortlisted candidates received emails
- **After**: All shortlisted candidates receive emails successfully
- **Performance**: Minimal impact - adds 0.6 seconds per additional recipient (e.g., 10 recipients = ~6 seconds total)

## Future Considerations
1. **Upgrade Resend Plan**: Consider upgrading to a paid plan for higher rate limits if bulk emails become frequent
2. **Batch API**: Check if Resend offers a batch email API that handles rate limiting internally
3. **Queue System**: For very large recipient lists (100+), consider using a background job queue (Celery) to handle email sending asynchronously

## Status
✅ **FIXED** - All shortlisted candidates now receive bulk emails successfully
