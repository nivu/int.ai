"""Script to send interview invitation to a candidate."""

import sys
from datetime import datetime, timedelta, timezone
from app.services.supabase import supabase as sb
from app.services.email import send_interview_invitation

def send_invitation(email: str, job_title: str = None) -> None:
    """Send interview invitation to a candidate.
    
    Args:
        email: Candidate email address
        job_title: Optional job title to filter applications
    """
    email = email.lower().strip()
    
    print(f"🔍 Looking for candidate with email: {email}")
    
    # 1. Find the candidate
    try:
        candidate_resp = sb.table("candidates").select("*").eq("email", email).execute()
        if not candidate_resp.data:
            print(f"❌ No candidate found with email: {email}")
            return
        
        candidate = candidate_resp.data[0]
        candidate_id = candidate["id"]
        
        print(f"✅ Found candidate: {candidate['full_name']} (ID: {candidate_id})")
        
    except Exception as e:
        print(f"❌ Error finding candidate: {e}")
        return
    
    # 2. Find applications in 'screened' status
    try:
        query = sb.table("applications").select("*, hiring_posts(*)").eq("candidate_id", candidate_id).eq("status", "screened")
        apps_resp = query.execute()
        applications = apps_resp.data
        
        if not applications:
            print(f"❌ No screened applications found for this candidate")
            return
        
        # Filter by job title if provided
        if job_title:
            applications = [app for app in applications if app.get("hiring_posts", {}).get("title", "").lower() == job_title.lower()]
            if not applications:
                print(f"❌ No screened applications found for job title: {job_title}")
                return
        
        print(f"📋 Found {len(applications)} screened application(s)")
        
    except Exception as e:
        print(f"❌ Error finding applications: {e}")
        return
    
    # 3. Send invitation for each application
    for app in applications:
        app_id = app["id"]
        hiring_post = app.get("hiring_posts", {})
        job_name = hiring_post.get("title", "Unknown")
        template_id = hiring_post.get("interview_template_id")
        
        print(f"\n📝 Processing application for: {job_name}")
        print(f"   Application ID: {app_id}")
        
        if not template_id:
            print(f"   ⚠️  No interview template configured for this job")
            continue
        
        # Create interview session
        try:
            deadline = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
            
            session_resp = sb.table("interview_sessions").insert({
                "application_id": app_id,
                "template_id": template_id,
                "status": "pending",
                "deadline": deadline,
            }).execute()
            
            session = session_resp.data[0]
            session_id = session["id"]
            
            print(f"   ✅ Created interview session: {session_id}")
            print(f"   Deadline: {deadline}")
            
        except Exception as e:
            print(f"   ❌ Error creating interview session: {e}")
            continue
        
        # Update application status
        try:
            sb.table("applications").update({
                "status": "interview_sent",
                "interview_deadline": deadline
            }).eq("id", app_id).execute()
            
            print(f"   ✅ Updated application status to 'interview_sent'")
            
        except Exception as e:
            print(f"   ⚠️  Error updating application status: {e}")
        
        # Send invitation email
        try:
            from app.config import settings
            
            interview_url = f"{settings.FRONTEND_URL.rstrip('/')}/candidate/interview"
            
            message_id = send_interview_invitation(
                candidate_email=email,
                candidate_name=candidate['full_name'],
                job_title=job_name,
                interview_url=interview_url,
                interview_deadline=deadline
            )
            
            print(f"   ✅ Sent interview invitation email")
            print(f"   Message ID: {message_id}")
            
        except Exception as e:
            print(f"   ⚠️  Error sending invitation email: {e}")
            print(f"   The session was created, but the email failed to send")
    
    print(f"\n{'='*60}")
    print(f"✨ Interview invitation process complete")
    print(f"{'='*60}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python send_interview_invitation.py <email> [job_title]")
        print("\nExamples:")
        print("  python send_interview_invitation.py team@nunnarilabs.com")
        print("  python send_interview_invitation.py team@nunnarilabs.com 'Beginner Python Dev'")
        sys.exit(1)
    
    email = sys.argv[1]
    job_title = sys.argv[2] if len(sys.argv) > 2 else None
    
    send_invitation(email, job_title)
