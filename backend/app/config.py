from pydantic import SecretStr
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: SecretStr
    GEMINI_API_KEY: SecretStr
    DEEPGRAM_API_KEY: SecretStr
    LIVEKIT_URL: str
    LIVEKIT_API_KEY: str
    LIVEKIT_API_SECRET: SecretStr
    REDIS_URL: str = "redis://localhost:6379/0"
    RESEND_API_KEY: SecretStr
    FRONTEND_URL: str = "http://localhost:3000"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }


settings = Settings()
