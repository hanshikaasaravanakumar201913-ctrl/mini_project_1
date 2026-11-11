"""Initial 8-table Medora schema baseline.

Revision ID: 0001
Revises:
Create Date: 2026-11-10
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())

    if "households" not in existing:
        op.create_table(
            "households",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("created_at", sa.DateTime()),
        )

    if "household_members" not in existing:
        op.create_table(
            "household_members",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("household_id", sa.Integer(), sa.ForeignKey("households.id"), nullable=False),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("relationship_role", sa.String(50)),
            sa.Column("age", sa.Integer()),
            sa.Column("allergies", sa.String(255)),
            sa.Column("notes", sa.Text()),
            sa.Column("created_at", sa.DateTime()),
        )

    if "medicine_records" not in existing:
        op.create_table(
            "medicine_records",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("medicine_name", sa.String(150), nullable=False),
            sa.Column("brand", sa.String(100)),
            sa.Column("strength", sa.String(50)),
            sa.Column("dosage_form", sa.String(50)),
            sa.Column("batch_number", sa.String(50)),
            sa.Column("printed_expiry_date", sa.String(20), nullable=False),
            sa.Column("purchase_date", sa.String(20)),
            sa.Column("opened_date", sa.String(20)),
            sa.Column("quantity", sa.Integer()),
            sa.Column("stock_threshold", sa.Integer()),
            sa.Column("storage_instructions", sa.String(255)),
            sa.Column("notes", sa.Text()),
            sa.Column("package_photo_url", sa.Text()),
            sa.Column("prescription_url", sa.Text()),
            sa.Column("assigned_member_id", sa.Integer(), sa.ForeignKey("household_members.id")),
            sa.Column("data_source", sa.String(30)),
            sa.Column("is_confirmed", sa.Boolean()),
            sa.Column("is_disposed", sa.Boolean()),
            sa.Column("created_at", sa.DateTime()),
            sa.Column("updated_at", sa.DateTime()),
        )

    if "expiry_notifications" not in existing:
        op.create_table(
            "expiry_notifications",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("medicine_id", sa.Integer(), sa.ForeignKey("medicine_records.id"), nullable=False),
            sa.Column("threshold_days", sa.Integer(), nullable=False),
            sa.Column("message", sa.String(255), nullable=False),
            sa.Column("is_read", sa.Boolean()),
            sa.Column("triggered_at", sa.DateTime()),
        )

    if "medication_schedules" not in existing:
        op.create_table(
            "medication_schedules",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("medicine_id", sa.Integer(), sa.ForeignKey("medicine_records.id"), nullable=False),
            sa.Column("member_id", sa.Integer(), sa.ForeignKey("household_members.id")),
            sa.Column("reminder_time", sa.String(10), nullable=False),
            sa.Column("frequency", sa.String(50)),
            sa.Column("days_of_week", sa.String(50)),
            sa.Column("dose_quantity", sa.Integer()),
            sa.Column("status", sa.String(20)),
            sa.Column("created_at", sa.DateTime()),
        )

    if "schedule_logs" not in existing:
        op.create_table(
            "schedule_logs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("schedule_id", sa.Integer(), sa.ForeignKey("medication_schedules.id"), nullable=False),
            sa.Column("logged_at", sa.DateTime()),
            sa.Column("status", sa.String(20), nullable=False),
            sa.Column("notes", sa.String(255)),
        )

    if "medicine_event_history" not in existing:
        op.create_table(
            "medicine_event_history",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("medicine_id", sa.Integer(), sa.ForeignKey("medicine_records.id"), nullable=False),
            sa.Column("action", sa.String(50), nullable=False),
            sa.Column("timestamp", sa.DateTime()),
            sa.Column("description", sa.String(255), nullable=False),
            sa.Column("quantity_delta", sa.Integer()),
        )

    if "disposal_records" not in existing:
        op.create_table(
            "disposal_records",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("medicine_id", sa.Integer(), sa.ForeignKey("medicine_records.id"), nullable=False, unique=True),
            sa.Column("member_id", sa.Integer(), sa.ForeignKey("household_members.id")),
            sa.Column("disposed_date", sa.String(20), nullable=False),
            sa.Column("disposal_method", sa.String(100)),
            sa.Column("notes", sa.Text()),
            sa.Column("created_at", sa.DateTime()),
        )


def downgrade() -> None:
    pass
