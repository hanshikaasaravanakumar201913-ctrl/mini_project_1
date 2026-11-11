import os
import secrets
from pathlib import Path
from dotenv import load_dotenv

# Resolve project root directory: <repo_root>/backend/app/config.py -> parents[2]
PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = PROJECT_ROOT / "backend"

# Load .env from backend/ or project root if present
load_dotenv(BACKEND_DIR / ".env")
load_dotenv(PROJECT_ROOT / ".env")


def _default_database_url() -> str:
    env_url = os.getenv("DATABASE_URL", "").strip()
    if env_url:
        return env_url
    db_path = (PROJECT_ROOT / "medora.db").as_posix()
    return f"sqlite:///{db_path}"


def _default_c_lib_path() -> str:
    env_path = os.getenv("C_LIB_PATH", "").strip()
    if env_path:
        return env_path
    ext = "medora_ds.dll" if os.name == "nt" else "libmedora_ds.so"
    return str(PROJECT_ROOT / "c_src" / "bin" / ext)


def _default_upload_dir() -> Path:
    env_dir = os.getenv("PRIVATE_UPLOAD_DIR", "").strip()
    if env_dir:
        p = Path(env_dir)
        return p if p.is_absolute() else (PROJECT_ROOT / p)
    return BACKEND_DIR / "private_uploads"


def _parse_cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "").strip()
    if raw:
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]


class Settings:
    PROJECT_NAME: str = os.getenv("PROJECT_NAME", "Medora Multilingual Smart Medicine Management")
    VERSION: str = os.getenv("VERSION", "2.0.0")
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    API_PREFIX: str = "/api"
    DATABASE_URL: str = _default_database_url()
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    C_LIB_PATH: str = _default_c_lib_path()
    PRIVATE_UPLOAD_DIR: Path = _default_upload_dir()
    MAX_UPLOAD_SIZE_BYTES: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "10")) * 1024 * 1024
    SECRET_KEY: str = os.getenv("SECRET_KEY", "").strip() or secrets.token_urlsafe(32)
    SESSION_TTL_HOURS: int = int(os.getenv("SESSION_TTL_HOURS", "72"))
    CORS_ORIGINS: list[str] = _parse_cors_origins()
    TESSERACT_CMD: str = os.getenv("TESSERACT_CMD", "").strip()
    OPENCAGE_API_KEY: str = os.getenv("OPENCAGE_API_KEY", "").strip()
    GEOCODING_PROVIDER: str = os.getenv("GEOCODING_PROVIDER", "auto").strip().lower()
    NOMINATIM_USER_AGENT: str = os.getenv(
        "NOMINATIM_USER_AGENT",
        "MedoraHealthPlatform/2.0 (academic-pharmacy-discovery)",
    ).strip()
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "disabled").strip().lower()
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "").strip()
    LLM_BASE_URL: str = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1").strip().rstrip("/")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "gpt-4o-mini").strip()
    LLM_TIMEOUT_SEC: float = float(os.getenv("LLM_TIMEOUT_SEC", "8.0"))


settings = Settings()
settings.PRIVATE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
