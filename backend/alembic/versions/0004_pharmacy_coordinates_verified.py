"""Add coordinates_verified flag to pharmacies table.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-11
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _col_names(inspector, table_name: str) -> set[str]:
    return {c["name"] for c in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())

    if "pharmacies" in existing and "coordinates_verified" not in _col_names(inspector, "pharmacies"):
        with op.batch_alter_table("pharmacies") as batch_op:
            batch_op.add_column(
                sa.Column("coordinates_verified", sa.Boolean(), nullable=False, server_default=sa.false())
            )
        # Mark already-verified pharmacies with valid non-zero coordinates as coordinates_verified=true
        bind.execute(
            sa.text(
                "UPDATE pharmacies SET coordinates_verified = 1 "
                "WHERE verification_status = 'VERIFIED' "
                "AND latitude BETWEEN -90 AND 90 "
                "AND longitude BETWEEN -180 AND 180 "
                "AND (ABS(latitude) > 0.0001 OR ABS(longitude) > 0.0001)"
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "pharmacies" in set(inspector.get_table_names()) and "coordinates_verified" in _col_names(inspector, "pharmacies"):
        with op.batch_alter_table("pharmacies") as batch_op:
            batch_op.drop_column("coordinates_verified")
