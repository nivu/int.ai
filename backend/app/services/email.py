"""Email service powered by Resend."""

from __future__ import annotations

import resend

from app.config import settings

# ---------------------------------------------------------------------------
# Client initialisation
# ---------------------------------------------------------------------------
resend.api_key = settings.RESEND_API_KEY.get_secret_value()

FROM_ADDRESS = "noreply@int.ai"


# ---------------------------------------------------------------------------
# Email methods
# ---------------------------------------------------------------------------

def send_confirmation(
    candidate_email: str,
    candidate_name: str,
    job_title: str,
    portal_url: str,
) -> str:
    """Send an application-received confirmation email.

    Returns the Resend message ID.
    """
    subject = f"Application Received — {job_title}"
    html = f"""\
<html>
<body style="font-family: sans-serif; color: #1a1a1a;">
  <h2>Hi {candidate_name},</h2>
  <p>Thank you for applying for the <strong>{job_title}</strong> position.
  We have received your application and it is currently under review.</p>
  <p>You can track your application status at any time:</p>
  <p><a href="{portal_url}" style="color: #4f46e5;">View Application Portal</a></p>
  <p>We will be in touch with next steps soon.</p>
  <br/>
  <p>— The int.ai Team</p>
</body>
</html>"""

    response = resend.Emails.send(
        {
            "from": FROM_ADDRESS,
            "to": [candidate_email],
            "subject": subject,
            "html": html,
        }
    )
    return response["id"]


def send_interview_invitation(
    candidate_email: str,
    candidate_name: str,
    job_title: str,
    interview_deadline: str,
    portal_url: str,
) -> str:
    """Send an interview invitation with a deadline.

    Returns the Resend message ID.
    """
    subject = f"Interview Invitation — {job_title}"
    html = f"""\
<html>
<body style="font-family: sans-serif; color: #1a1a1a;">
  <h2>Hi {candidate_name},</h2>
  <p>Great news! You have been invited to complete an AI-assisted interview
  for the <strong>{job_title}</strong> position.</p>
  <p>Please complete the interview before
  <strong>{interview_deadline}</strong>.</p>
  <p><a href="{portal_url}" style="color: #4f46e5;">Start Interview</a></p>
  <p>If you have any questions, feel free to reply to this email.</p>
  <br/>
  <p>— The int.ai Team</p>
</body>
</html>"""

    response = resend.Emails.send(
        {
            "from": FROM_ADDRESS,
            "to": [candidate_email],
            "subject": subject,
            "html": html,
        }
    )
    return response["id"]


def send_status_update(
    candidate_email: str,
    candidate_name: str,
    job_title: str,
    new_status: str,
) -> str:
    """Send a status-change notification.

    Returns the Resend message ID.
    """
    subject = f"Application Update — {job_title}"
    html = f"""\
<html>
<body style="font-family: sans-serif; color: #1a1a1a;">
  <h2>Hi {candidate_name},</h2>
  <p>There is an update on your application for
  <strong>{job_title}</strong>.</p>
  <p>Your application status has been changed to:
  <strong>{new_status}</strong>.</p>
  <p>If you have any questions, feel free to reply to this email.</p>
  <br/>
  <p>— The int.ai Team</p>
</body>
</html>"""

    response = resend.Emails.send(
        {
            "from": FROM_ADDRESS,
            "to": [candidate_email],
            "subject": subject,
            "html": html,
        }
    )
    return response["id"]
