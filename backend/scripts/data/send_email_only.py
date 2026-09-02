"""Script to send interview invitation email only (session already exists)."""

import sys
from app.services.supabase import supabase as sb
from app.services.email import send_interview_invitation
from app.config import settings

def send_email(email: str) -> None:
    """Send interview invitation email to a candidate."""
    email = email.lower().strip()
    
    print(f"🔍 Looking for candidate with email: {email}")
    
    # Find the candidate
    try:
        candidate_resp = sb.table("candidates").select("*").eq("email", email).execute()
        if not candidate_resp.data:
            print(f"❌ No candidate found with email: {email}")
            return
        
        candidate = candidate_resp.data[0]
        candidate_id = candidate["id"]
        
        print(f"✅ Found candidate: {candidate['full_name']}")
        
    except Exception as e:
        print(f"❌ Error finding candidate: {e}")
        return
    
    # Find applications with interview_sent status
    try:
        apps_resp = sb.table("applications").select("*, hiring_posts(title)").eq("candidate_id", candidate_id).eq("status", "interview_sent").execute()
        applications = apps_resp.data
        
        if not applications:
            print(f"❌ No applications with interview_sent status found")
            return
        
        print(f"📋 Found {len(applications)} application(s) with pending interviews")
        
    except Exception as e:
        print(f"❌ Error finding applications: {e}")
        return
    
    # Send email for each application
    for app in applications:
        app_id = app["id"]
        job_title = app.get("hiring_posts", {}).get("title", "Unknown")
        deadline = app.get("interview_deadline", "")
        
        print(f"\n📧 Sending email for: {job_title}")
        
        try:
            interview_url = f"{settings.FRONTEND_URL.rstrip('/')}/candidate/interview"
            
            message_id = send_interview_invitation(
                candidate_email=email,
                candidate_name=candidate['full_name'],
                job_title=job_title,
                interview_url=interview_url,
                interview_deadline=deadline
            )
            
            print(f"   ✅ Email sent successfully!")
            print(f"   Message ID: {message_id}")
            print(f"   Interview URL: {interview_url}")
            
        except Exception as e:
            print(f"   ❌ Error sending email: {e}")
    
    print(f"\n{'='*60}")
    print(f"✨ Email sending complete")
    print(f"{'='*60}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python send_email_only.py <email>")
        sys.exit(1)
    
    email = sys.argv[1]
    send_email(email)
