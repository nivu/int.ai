#!/usr/bin/env python3
"""
Celery worker starter with automatic daily restart using schedule library.
This is a more reliable cross-platform solution than bash scripts.
"""

import os
import signal
import subprocess
import sys
import time
from datetime import datetime

import schedule


class CeleryWorkerManager:
    def __init__(self):
        self.worker_process = None
        
    def start_worker(self):
        """Start the Celery worker process."""
        if self.worker_process:
            print(f"[{datetime.now()}] Worker already running with PID: {self.worker_process.pid}")
            return
            
        print(f"[{datetime.now()}] Starting Celery worker...")
        
        # Find celery command - try venv first, then system
        celery_cmd = "celery"
        script_dir = os.path.dirname(os.path.abspath(__file__))
        venv_celery = os.path.join(script_dir, ".venv", "bin", "celery")
        
        if os.path.exists(venv_celery):
            celery_cmd = venv_celery
            print(f"[{datetime.now()}] Using venv celery: {celery_cmd}")
        
        self.worker_process = subprocess.Popen(
            [celery_cmd, "-A", "app.worker", "worker", "--loglevel=info", "--concurrency=4"],
            stdout=sys.stdout,
            stderr=sys.stderr,
            cwd=script_dir
        )
        print(f"[{datetime.now()}] Celery worker started with PID: {self.worker_process.pid}")
        
    def stop_worker(self):
        """Stop the Celery worker process gracefully."""
        if not self.worker_process:
            print(f"[{datetime.now()}] No worker process to stop")
            return
            
        print(f"[{datetime.now()}] Stopping Celery worker (PID: {self.worker_process.pid})...")
        try:
            # Send SIGTERM for graceful shutdown
            self.worker_process.terminate()
            # Wait up to 30 seconds for graceful shutdown
            self.worker_process.wait(timeout=30)
        except subprocess.TimeoutExpired:
            print(f"[{datetime.now()}] Worker didn't stop gracefully, forcing shutdown...")
            self.worker_process.kill()
            self.worker_process.wait()
        
        self.worker_process = None
        print(f"[{datetime.now()}] Celery worker stopped")
        
    def restart_worker(self):
        """Restart the Celery worker."""
        print(f"[{datetime.now()}] Restarting Celery worker...")
        self.stop_worker()
        time.sleep(2)  # Brief pause between stop and start
        self.start_worker()
        
    def cleanup(self, signum=None, frame=None):
        """Cleanup handler for graceful shutdown."""
        print(f"\n[{datetime.now()}] Received shutdown signal, cleaning up...")
        self.stop_worker()
        sys.exit(0)


def main():
    manager = CeleryWorkerManager()
    
    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, manager.cleanup)
    signal.signal(signal.SIGTERM, manager.cleanup)
    
    # Start the worker initially
    manager.start_worker()
    
    # Schedule daily restart at 3:00 AM
    schedule.every().day.at("03:00").do(manager.restart_worker)
    
    print(f"[{datetime.now()}] Worker manager started. Daily restart scheduled at 03:00 AM")
    print(f"[{datetime.now()}] Press Ctrl+C to stop")
    
    # Keep the script running and check schedule
    try:
        while True:
            schedule.run_pending()
            time.sleep(60)  # Check every minute
            
            # Check if worker process is still alive
            if manager.worker_process and manager.worker_process.poll() is not None:
                print(f"[{datetime.now()}] Worker process died unexpectedly, restarting...")
                manager.worker_process = None
                manager.start_worker()
    except KeyboardInterrupt:
        manager.cleanup()


if __name__ == "__main__":
    main()
