from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Database
    postgres_db: str = Field(default="blue_sentinel", env="POSTGRES_DB")
    postgres_user: str = Field(default="sentinel", env="POSTGRES_USER")
    postgres_password: str = Field(default="changeme_default_must_overwrite", env="POSTGRES_PASSWORD")
    postgres_host: str = Field(default="postgres", env="POSTGRES_HOST")
    postgres_port: int = Field(default=5432, env="POSTGRES_PORT")

    # Redis
    redis_host: str = Field(default="redis", env="REDIS_HOST")
    redis_port: int = Field(default=6379, env="REDIS_PORT")
    redis_password: str = Field(default="", env="REDIS_PASSWORD")
    # fail-open (False): se o Redis cair, o rate limit deixa passar.
    # fail-closed (True): se o Redis cair, as requições limitadas são bloqueadas.
    rate_limit_fail_closed: bool = Field(default=False, env="RATE_LIMIT_FAIL_CLOSED")

    # Agent authentication
    agent_api_key: str = Field(default="dev-agent-key-must-change-in-production", env="AGENT_API_KEY")
    agent_hmac_secret: str = Field(default="this-is-a-dev-secret-must-change-prod-min-32-chars", env="AGENT_HMAC_SECRET")

    # API
    api_v1_str: str = Field(default="/api/v1", env="API_V1_STR")
    secret_key: str = Field(default="this-is-a-dev-secret-key-must-change-min-32-chars", env="SECRET_KEY")
    debug: bool = Field(default=True, env="DEBUG")
    allowed_hosts: str = Field(default="localhost,127.0.0.1,[::1]", env="ALLOWED_HOSTS")

    # Performance
    ingestion_batch_size: int = Field(default=1000, env="INGESTION_BATCH_SIZE")
    redis_queue_maxlen: int = Field(default=5000, env="REDIS_QUEUE_MAXLEN")

    # Monitoring
    metrics_export_port: int = Field(default=9090, env="METRICS_EXPORT_PORT")

    # Email (Contact Form Worker)
    email_provider: str = Field(default="console", env="EMAIL_PROVIDER")
    sendgrid_api_key: str = Field(default="", env="SENDGRID_API_KEY")
    resend_api_key: str = Field(default="", env="RESEND_API_KEY")
    smtp_host: str = Field(default="", env="SMTP_HOST")
    smtp_port: int = Field(default=587, env="SMTP_PORT")
    smtp_user: str = Field(default="", env="SMTP_USER")
    smtp_password: str = Field(default="", env="SMTP_PASSWORD")
    smtp_from: str = Field(default="noreply@blue-sentinel.local", env="SMTP_FROM")
    email_to: str = Field(default="owner@blue-sentinel.local", env="EMAIL_TO")

    # GitHub API (Stats)
    github_token: str = Field(default="", env="GITHUB_TOKEN")
    github_username: str = Field(default="your-github-username", env="GITHUB_USERNAME")


settings = Settings()