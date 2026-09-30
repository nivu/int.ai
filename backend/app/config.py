from pydantic import SecretStr
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: SecretStr
    OPENAI_API_KEY: SecretStr
    DEEPGRAM_API_KEY: SecretStr
    LIVEKIT_URL: str
    LIVEKIT_API_KEY: str
    LIVEKIT_API_SECRET: SecretStr
    REDIS_URL: str = "redis://localhost:6379/0"
    RESEND_API_KEY: SecretStr
    FRONTEND_URL: str = "https://intai.nunnarilabs.com"
    # Public base URL of this API. Advertised by the MCP server as its resource
    # identifier (see docs/guides/mcp-server.md). Set on Railway to the backend's domain.
    BACKEND_PUBLIC_URL: str = "http://localhost:8000"

    # Run a Celery worker inside the API process.
    #
    # Production deploys a dedicated `celery` service, so this must stay off
    # there — otherwise two pools consume the same queue and the API container
    # carries a worker's memory footprint alongside uvicorn.
    #
    # Useful locally, where it saves running a second process by hand.
    # Set RUN_EMBEDDED_WORKER=true to opt in.
    RUN_EMBEDDED_WORKER: bool = False

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }


settings = Settings()
