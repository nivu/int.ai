#!/usr/bin/env python3
"""
List all candidates in the database.
"""

from dotenv import load_dotenv
load_dotenv()

from app.services.supabase import supabase

def list_candidates():
    """List all candidates."""
    result = supabase.table("candidates").select("id, full_name, email").execute()
    
    candidates = result.data or []
    
    print()
    print("=" * 80)
    print(f"ALL CANDIDATES ({len(candidates)} total)")
    print("=" * 80)
    print()
    
    if not candidates:
        print("No candidates found.")
    else:
        for i, candidate in enumerate(candidates, 1):
            print(f"{i}. {candidate.get('full_name', 'Unknown')} ({candidate['email']})")
            print(f"   ID: {candidate['id']}")
            print()
    
    return candidates

if __name__ == "__main__":
    list_candidates()
