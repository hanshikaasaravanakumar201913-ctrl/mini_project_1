"""Add member language preferences and canonical multilingual NLP medicine catalog.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-10
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _col_names(inspector, table_name: str) -> set[str]:
    return {c["name"] for c in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())

    if "household_members" in existing and "preferred_language" not in _col_names(
        inspector, "household_members"
    ):
        with op.batch_alter_table("household_members") as batch_op:
            batch_op.add_column(
                sa.Column("preferred_language", sa.String(10), nullable=False, server_default="en")
            )

    if "canonical_medicines" not in existing:
        op.create_table(
            "canonical_medicines",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("canonical_code", sa.String(60), nullable=False, unique=True),
            sa.Column("canonical_name", sa.String(180), nullable=False),
            sa.Column("generic_name", sa.String(180), nullable=False),
            sa.Column("active_ingredient", sa.String(180), nullable=False),
            sa.Column("brand_names_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("strength", sa.String(80), nullable=True),
            sa.Column("dosage_form", sa.String(60), nullable=True),
            sa.Column("therapeutic_category", sa.String(100), nullable=True),
            sa.Column("simple_explanation", sa.Text(), nullable=True),
            sa.Column("review_status", sa.String(30), nullable=False, server_default="APPROVED"),
            sa.Column("verified_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_canonical_medicines_code", "canonical_medicines", ["canonical_code"], unique=True)
        op.create_index("ix_canonical_medicines_name", "canonical_medicines", ["canonical_name"])
        op.create_index("ix_canonical_medicines_generic", "canonical_medicines", ["generic_name"])

    if "medicine_multilingual_aliases" not in existing:
        op.create_table(
            "medicine_multilingual_aliases",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "canonical_medicine_id",
                sa.Integer(),
                sa.ForeignKey("canonical_medicines.id"),
                nullable=False,
            ),
            sa.Column("language_code", sa.String(10), nullable=False),
            sa.Column("alias_text", sa.String(220), nullable=False),
            sa.Column("normalized_alias", sa.String(220), nullable=False),
            sa.Column("alias_type", sa.String(40), nullable=False, server_default="SYMPTOM_OR_USE"),
            sa.Column("script_name", sa.String(40), nullable=True),
            sa.Column("review_status", sa.String(30), nullable=False, server_default="APPROVED"),
            sa.Column("notes", sa.String(255), nullable=True),
            sa.Column("approved_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_med_alias_canon_id", "medicine_multilingual_aliases", ["canonical_medicine_id"])
        op.create_index("ix_med_alias_lang", "medicine_multilingual_aliases", ["language_code"])
        op.create_index("ix_med_alias_norm", "medicine_multilingual_aliases", ["normalized_alias"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())
    if "medicine_multilingual_aliases" in existing:
        op.drop_table("medicine_multilingual_aliases")
    if "canonical_medicines" in existing:
        op.drop_table("canonical_medicines")
    if "household_members" in existing and "preferred_language" in _col_names(
        inspector, "household_members"
    ):
        with op.batch_alter_table("household_members") as batch_op:
            batch_op.drop_column("preferred_language")
