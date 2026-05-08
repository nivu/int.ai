"""Email service powered by Resend."""

from __future__ import annotations

import resend
from typing import TypedDict

from app.config import settings

# ---------------------------------------------------------------------------
# Client initialisation
# ---------------------------------------------------------------------------
resend.api_key = settings.RESEND_API_KEY.get_secret_value()

FROM_ADDRESS = "int.ai <noreply@intai.nunnarilabs.com>"


class EmailAttachment(TypedDict):
    filename: str
    content_type: str
    content_base64: str


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
    interview_url: str,
) -> str:
    """Send an interview invitation with a direct link to the AI interview.

    Returns the Resend message ID.
    """
    subject = f"You're through! Complete your AI Interview — {job_title}"
    html = f"""\
<html>
<body style="font-family: sans-serif; color: #1a1a1a; max-width: 600px; margin: 0 auto;">
  <h2>Hi {candidate_name},</h2>
  <p>Congratulations! Your resume has been reviewed and you've been selected
  to move forward in the hiring process for the <strong>{job_title}</strong> position.</p>
  <p>The next step is a short AI-assisted interview. Please complete it before
  <strong>{interview_deadline}</strong>.</p>
  <p style="margin: 24px 0;">
    <a href="{interview_url}"
       style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px;
              text-decoration: none; border-radius: 6px; font-weight: 600;">
      Start Your AI Interview
    </a>
  </p>
  <p style="font-size: 0.9em; color: #555;">
    Or copy this link into your browser:<br/>
    <a href="{interview_url}" style="color: #4f46e5;">{interview_url}</a>
  </p>
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


def send_resume_rejection(
    candidate_email: str,
    candidate_name: str,
    job_title: str,
) -> str:
    """Alias kept for call-site clarity — delegates to send_rejection."""
    return send_rejection(candidate_email, candidate_name, job_title)


def send_rejection(
    candidate_email: str,
    candidate_name: str,
    job_title: str,
) -> str:
    """Send a rejection email when the candidate doesn't meet the threshold.

    Returns the Resend message ID.
    """
    subject = f"Application Update — {job_title}"
    html = f"""\
<html>
<body style="font-family: sans-serif; color: #1a1a1a;">
  <h2>Hi {candidate_name},</h2>
  <p>Thank you for your interest in the <strong>{job_title}</strong> position
  and for taking the time to apply.</p>
  <p>After carefully reviewing your application, we've decided to move forward
  with other candidates whose qualifications more closely match the
  requirements for this role.</p>
  <p>We encourage you to apply for future positions that align with your
  experience and skills. We wish you the best in your career.</p>
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


def send_interview_completed(
    candidate_email: str,
    candidate_name: str,
    job_title: str,
    recommendation: str,
    portal_url: str,
) -> str:
    """Send a post-interview outcome email based on the evaluation result.

    Returns the Resend message ID.
    """
    if recommendation == "advance":
        subject = f"Interview Update — {job_title}"
        body_middle = (
            f"<p>Thank you for completing your interview for the <strong>{job_title}</strong> position.</p>"
            f"<p>We were impressed by your responses. Our team is currently reviewing your results "
            f"and will be in touch with you soon regarding the next steps.</p>"
            f'<p>You can track your application status anytime: <a href="{portal_url}" style="color: #4f46e5;">View Portal</a></p>'
        )
    elif recommendation == "borderline":
        subject = f"Interview Update — {job_title}"
        body_middle = (
            f"<p>Thank you for completing your interview for the "
            f"<strong>{job_title}</strong> position. We appreciate the time and "
            f"effort you put into your responses.</p>"
            f"<p>Your application is currently under review by our hiring team. "
            f"We'll reach out with an update as soon as a decision has been made.</p>"
            f'<p>You can track your status anytime: <a href="{portal_url}" style="color: #4f46e5;">View Portal</a></p>'
        )
    else:
        subject = f"Interview Update — {job_title}"
        body_middle = (
            f"<p>Thank you for taking the time to complete your interview for the "
            f"<strong>{job_title}</strong> position. We truly appreciate your interest "
            f"and the effort you put into the process.</p>"
            f"<p>After careful review, we've decided to move forward with other "
            f"candidates whose experience more closely aligns with the requirements "
            f"for this particular role.</p>"
            f"<p>This does not reflect on your abilities — hiring decisions involve "
            f"many factors. We encourage you to apply for future openings that match "
            f"your skills and experience.</p>"
        )

    html = (
        '<html><body style="font-family: sans-serif; color: #1a1a1a;">'
        f"<h2>Hi {candidate_name},</h2>"
        f"{body_middle}"
        "<p>We wish you all the best in your career.</p>"
        "<br/><p>— The int.ai Team</p>"
        "</body></html>"
    )

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


def send_shortlisted(
    candidate_email: str,
    candidate_name: str,
    job_title: str,
) -> str:
    """Send a shortlist notification email triggered by a manual admin action.

    Returns the Resend message ID.
    """
    subject = f"Congratulations! You've been shortlisted — {job_title}"
    html = f"""\
<html>
<body style="font-family: sans-serif; color: #1a1a1a; max-width: 600px; margin: 0 auto;">
  <h2>Hi {candidate_name},</h2>
  <p>Congratulations! You've <strong>cleared the interview</strong> for the
  <strong>{job_title}</strong> position.</p>
  <p>Our team will be reaching out to you shortly to schedule an
  <strong>in-person interview — the final round</strong>. Please keep an eye
  on your inbox (and check your spam folder just in case).</p>
  <p>We look forward to meeting you in person!</p>
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


def send_interview_completed_with_body(
    candidate_email: str,
    candidate_name: str,
    job_title: str,
    body_text: str,
    portal_url: str,
) -> str:
    """Send post-interview email with an LLM-generated plain-text body.

    The body_text comes from the evaluator's synthesis step.  It must not
    contain numeric scores or the band decision — that is enforced upstream
    when generating the text.

    Returns the Resend message ID.
    """
    subject = f"Interview Update — {job_title}"
    # Wrap plain-text paragraphs in simple HTML
    paragraphs = [p.strip() for p in body_text.split("\n\n") if p.strip()]
    body_html = "".join(f"<p>{p}</p>" for p in paragraphs)

    html = (
        '<html><body style="font-family: sans-serif; color: #1a1a1a; max-width: 600px;">'
        f"<h2>Hi {candidate_name},</h2>"
        f"{body_html}"
        f'<p>You can track your application at any time: '
        f'<a href="{portal_url}" style="color: #4f46e5;">View Portal</a></p>'
        "<br/><p>— The int.ai Team</p>"
        "</body></html>"
    )

    response = resend.Emails.send(
        {
            "from": FROM_ADDRESS,
            "to": [candidate_email],
            "subject": subject,
            "html": html,
        }
    )
    return response["id"]


def send_interview_terminated(
    candidate_email: str,
    candidate_name: str,
    job_title: str,
    reason: str,
) -> str:
    """Send an email when an interview is terminated due to a violation.

    reason: 'tab_switch' or 'no_response'
    Returns the Resend message ID.
    """
    if reason == "tab_switch":
        subject = f"Interview Terminated — {job_title}"
        detail = (
            "Our system detected that you switched browser tabs during your interview session. "
            "Tab switching is not permitted as this is a monitored assessment."
        )
    else:
        subject = f"Interview Terminated — {job_title}"
        detail = (
            "Your interview session was ended because no response was detected for more than "
            "15 seconds across multiple questions. Candidates are required to respond promptly during the session."
        )

    html = f"""\
<html>
<body style="font-family: sans-serif; color: #1a1a1a;">
  <h2>Hi {candidate_name},</h2>
  <p>Your interview session for the <strong>{job_title}</strong> position has been terminated.</p>
  <p>{detail}</p>
  <p>Unfortunately, as a result your application can no longer proceed. We appreciate
  the time you took to apply and wish you the best in your job search.</p>
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


def send_team_invitation(
    to_email: str,
    role: str,
    login_url: str,
) -> str:
    """Send a team member invitation email.

    Returns the Resend message ID.
    """
    role_label = role.replace("_", " ").title()
    subject = "You've been invited to int.ai"
    html = f"""\
<html>
<body style="font-family: sans-serif; color: #1a1a1a;">
  <h2>You're invited to join int.ai</h2>
  <p>You have been invited to join the int.ai hiring platform as a
  <strong>{role_label}</strong>.</p>
  <p>Click the link below to sign in and get started:</p>
  <p><a href="{login_url}" style="color: #4f46e5;">Accept Invitation</a></p>
  <br/>
  <p>— The int.ai Team</p>
</body>
</html>"""

    response = resend.Emails.send(
        {
            "from": FROM_ADDRESS,
            "to": [to_email],
            "subject": subject,
            "html": html,
        }
    )
    return response["id"]


def send_custom_email(
    to_email: str,
    subject: str,
    body_text: str,
    attachments: list[EmailAttachment] | None = None,
) -> str:
    """Send a custom recruiter-authored email with optional attachments."""
    paragraphs = [p.strip() for p in body_text.split("\n\n") if p.strip()]
    body_html = "".join(f"<p>{p}</p>" for p in paragraphs) or f"<p>{body_text}</p>"

    payload: dict[str, object] = {
        "from": FROM_ADDRESS,
        "to": [to_email],
        "subject": subject,
        "html": (
            '<html><body style="font-family: sans-serif; color: #1a1a1a;">'
            f"{body_html}"
            "<br/><p>— The int.ai Team</p>"
            "</body></html>"
        ),
    }
    if attachments:
        payload["attachments"] = [
            {
                "filename": a["filename"],
                "content": a["content_base64"],
                "type": a["content_type"],
            }
            for a in attachments
        ]

    response = resend.Emails.send(payload)
    return response["id"]
