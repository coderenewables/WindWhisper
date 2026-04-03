from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "GoKaatru API"
    app_version: str = Field(default="0.1.0", alias="APP_VERSION")
    debug: bool = Field(default=False, alias="DEBUG")
    seed_demo_data: bool = Field(default=True, alias="SEED_DEMO_DATA")
    database_url: str = Field(
        default="postgresql+asyncpg://windwhisper:windwhisper@localhost:5432/windwhisper",
        alias="DATABASE_URL",
    )
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"],
        alias="CORS_ORIGINS",
    )

    # AI settings
    ai_enabled: bool = Field(default=True, alias="AI_ENABLED")
    llm_provider: str = Field(default="openai", alias="LLM_PROVIDER")
    llm_api_key: str = Field(default="", alias="LLM_API_KEY")
    llm_model: str = Field(default="gpt-4o-mini", alias="LLM_MODEL")
    llm_base_url: str | None = Field(default=None, alias="LLM_BASE_URL")
    ai_max_tokens_per_request: int = Field(default=4096, alias="AI_MAX_TOKENS_PER_REQUEST")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
