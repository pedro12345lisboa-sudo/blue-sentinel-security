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

    # Database tuning (pool + statement timeouts)
    db_pool_size: int = Field(default=10, env="DB_POOL_SIZE")
    db_max_overflow: int = Field(default=20, env="DB_MAX_OVERFLOW")
    db_statement_timeout_ms: int = Field(default=5000, env="DB_STATEMENT_TIMEOUT_MS")

    # Cache (cache-aside)
    cache_default_ttl: int = Field(default=3600, env="CACHE_DEFAULT_TTL")
    # Jitter evita que todos os keys expirem no mesmo instante (thundering herd).
    cache_jitter_ratio: float = Field(default=0.15, env="CACHE_JITTER_RATIO")
    # Vida extra do espelho "stale": usado quando a fonte (API) está fora.
    cache_stale_ttl: int = Field(default=86400, env="CACHE_STALE_TTL")
    # Lock distribuído anti-stampede (segundos).
    cache_lock_ttl: int = Field(default=10, env="CACHE_LOCK_TTL")

    # Workers / filas
    worker_enabled: bool = Field(default=True, env="WORKER_ENABLED")
    scheduler_enabled: bool = Field(default=True, env="SCHEDULER_ENABLED")
    email_queue_key: str = Field(default="queue:email", env="EMAIL_QUEUE_KEY")
    email_dead_letter_key: str = Field(default="queue:email:dead", env="EMAIL_DEAD_LETTER_KEY")
    # Backpressure: acima deste tamanho a fila recusa novos jobs (429/503).
    email_queue_max_len: int = Field(default=500, env="EMAIL_QUEUE_MAX_LEN")
    email_max_attempts: int = Field(default=5, env="EMAIL_MAX_ATTEMPTS")
    email_retry_base_seconds: float = Field(default=2.0, env="EMAIL_RETRY_BASE_SECONDS")
    email_worker_poll_seconds: float = Field(default=1.0, env="EMAIL_WORKER_POLL_SECONDS")

    # Retenção / limpeza
    contact_retention_days: int = Field(default=90, env="CONTACT_RETENTION_DAYS")
    lab_session_retention_days: int = Field(default=30, env="LAB_SESSION_RETENTION_DAYS")
    temp_retention_hours: int = Field(default=24, env="TEMP_RETENTION_HOURS")
    temp_dir: str = Field(default="", env="TEMP_DIR")
    log_dir: str = Field(default="", env="LOG_DIR")
    log_max_bytes: int = Field(default=10 * 1024 * 1024, env="LOG_MAX_BYTES")
    log_keep_files: int = Field(default=5, env="LOG_KEEP_FILES")
    log_max_age_days: int = Field(default=14, env="LOG_MAX_AGE_DAYS")

    # Monitoramento / proteção do sistema
    metrics_export_port: int = Field(default=9090, env="METRICS_EXPORT_PORT")
    metrics_token: str = Field(default="", env="METRICS_TOKEN")
    resource_sample_interval: int = Field(default=15, env="RESOURCE_SAMPLE_INTERVAL")
    disk_alert_threshold: float = Field(default=80.0, env="DISK_ALERT_THRESHOLD")
    disk_critical_threshold: float = Field(default=90.0, env="DISK_CRITICAL_THRESHOLD")
    cpu_degrade_threshold: float = Field(default=90.0, env="CPU_DEGRADE_THRESHOLD")
    memory_degrade_threshold: float = Field(default=90.0, env="MEMORY_DEGRADE_THRESHOLD")
    # Degradação controlada: o laboratório é desligado antes do site.
    lab_degrade_enabled: bool = Field(default=True, env="LAB_DEGRADE_ENABLED")

    # Compressão HTTP
    compression_min_size: int = Field(default=500, env="COMPRESSION_MIN_SIZE")

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