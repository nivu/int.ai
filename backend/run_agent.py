"""Start the LiveKit interview agent.

Usage:
    cd backend && python run_agent.py
"""

from dotenv import load_dotenv

# Load environment variables before importing anything else so that
# pydantic-settings and LiveKit SDK pick them up.
load_dotenv()

from livekit.agents import WorkerOptions, cli  # noqa: E402

from app.config import settings  # noqa: E402
from app.interview.entrypoint import entrypoint, prewarm  # noqa: E402


def main() -> None:
    """Configure and start the LiveKit agents worker."""
    opts = WorkerOptions(
        entrypoint_fnc=entrypoint,
        prewarm_fnc=prewarm,
        ws_url=settings.LIVEKIT_URL,
        api_key=settings.LIVEKIT_API_KEY,
        api_secret=settings.LIVEKIT_API_SECRET.get_secret_value(),
    )
    cli.run_app(opts)


if __name__ == "__main__":
    main()
