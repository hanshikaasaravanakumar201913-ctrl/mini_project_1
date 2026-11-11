from pathlib import Path
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from backend.app.config import PROJECT_ROOT
from backend.app.database import engine


def run_migrations() -> None:
    """
    Runs Alembic migrations safely to head.
    If upgrading an existing pre-Alembic medora.db, stamps baseline 0001 first
    so existing household/medicine records are preserved without deletion.
    """
    ini_path = PROJECT_ROOT / "alembic.ini"
    alembic_cfg = Config(str(ini_path))
    alembic_cfg.set_main_option("script_location", str(PROJECT_ROOT / "backend" / "alembic"))

    with engine.begin() as conn:
        inspector = inspect(conn)
        tables = set(inspector.get_table_names())
        alembic_cfg.attributes["connection"] = conn

        if "households" in tables and "alembic_version" not in tables:
            command.stamp(alembic_cfg, "0001")

        command.upgrade(alembic_cfg, "head")
