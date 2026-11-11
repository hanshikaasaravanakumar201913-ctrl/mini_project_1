"""Expand schema for Auth, Caregivers, Prescriptions, Refill Predictions & Pharmacy Ecosystem.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-10
"""
from typing import Sequence, Union
import uuid
from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _col_names(inspector, table_name: str) -> set[str]:
    return {c["name"] for c in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())

    # 1. Users & Auth Tables
    if "users" not in existing:
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("email", sa.String(160), unique=True, nullable=False),
            sa.Column("full_name", sa.String(120), nullable=False),
            sa.Column("phone", sa.String(30)),
            sa.Column("password_hash", sa.String(255), nullable=False),
            sa.Column("role", sa.String(40), nullable=False, server_default="HOUSEHOLD_OWNER"),
            sa.Column("preferred_language", sa.String(10), nullable=False, server_default="en"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime()),
            sa.Column("updated_at", sa.DateTime()),
        )
        op.create_index("ix_users_email", "users", ["email"], unique=True)

    if "user_sessions" not in existing:
        op.create_table(
            "user_sessions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("token_hash", sa.String(128), unique=True, nullable=False),
            sa.Column("device_info", sa.String(200)),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("revoked_at", sa.DateTime()),
            sa.Column("created_at", sa.DateTime()),
        )
        op.create_index("ix_user_sessions_token_hash", "user_sessions", ["token_hash"], unique=True)

    if "password_reset_tokens" not in existing:
        op.create_table(
            "password_reset_tokens",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("token_hash", sa.String(128), unique=True, nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("used_at", sa.DateTime()),
            sa.Column("created_at", sa.DateTime()),
        )

    # 2. Household & Caregiver tables + columns
    hh_cols = _col_names(inspector, "households")
    with op.batch_alter_table("households") as batch_op:
        if "owner_user_id" not in hh_cols:
            batch_op.add_column(sa.Column("owner_user_id", sa.Integer()))
        if "address_city" not in hh_cols:
            batch_op.add_column(sa.Column("address_city", sa.String(100)))
        if "postal_code" not in hh_cols:
            batch_op.add_column(sa.Column("postal_code", sa.String(20)))
        if "latitude" not in hh_cols:
            batch_op.add_column(sa.Column("latitude", sa.Float()))
        if "longitude" not in hh_cols:
            batch_op.add_column(sa.Column("longitude", sa.Float()))

    hm_cols = _col_names(inspector, "household_members")
    with op.batch_alter_table("household_members") as batch_op:
        if "linked_user_id" not in hm_cols:
            batch_op.add_column(sa.Column("linked_user_id", sa.Integer()))

    if "caregiver_invitations" not in existing:
        op.create_table(
            "caregiver_invitations",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("household_id", sa.Integer(), sa.ForeignKey("households.id"), nullable=False),
            sa.Column("invited_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("caregiver_email", sa.String(160), nullable=False),
            sa.Column("caregiver_user_id", sa.Integer(), sa.ForeignKey("users.id")),
            sa.Column("invite_token", sa.String(64), unique=True, nullable=False),
            sa.Column("status", sa.String(30), nullable=False, server_default="PENDING"),
            sa.Column("can_view_medicines", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("can_edit_medicines", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("can_view_prescriptions", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("can_manage_schedules", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("can_record_doses", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("can_view_notifications", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("can_manage_refills", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime()),
            sa.Column("responded_at", sa.DateTime()),
        )

    if "caregiver_permissions" not in existing:
        op.create_table(
            "caregiver_permissions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("household_id", sa.Integer(), sa.ForeignKey("households.id"), nullable=False),
            sa.Column("caregiver_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("can_view_medicines", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("can_edit_medicines", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("can_view_prescriptions", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("can_manage_schedules", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("can_record_doses", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("can_view_notifications", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("can_manage_refills", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime()),
            sa.Column("updated_at", sa.DateTime()),
            sa.UniqueConstraint("household_id", "caregiver_user_id", name="uq_caregiver_household"),
        )

    # 3. Prescriptions
    if "prescriptions" not in existing:
        op.create_table(
            "prescriptions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("household_id", sa.Integer(), sa.ForeignKey("households.id"), nullable=False),
            sa.Column("member_id", sa.Integer(), sa.ForeignKey("household_members.id")),
            sa.Column("uploaded_by_user_id", sa.Integer(), sa.ForeignKey("users.id")),
            sa.Column("title", sa.String(160), nullable=False),
            sa.Column("doctor_name", sa.String(120)),
            sa.Column("clinic_name", sa.String(150)),
            sa.Column("prescribed_date", sa.String(20), nullable=False),
            sa.Column("valid_until", sa.String(20)),
            sa.Column("notes", sa.Text()),
            sa.Column("original_filename", sa.String(255), nullable=False),
            sa.Column("mime_type", sa.String(80), nullable=False),
            sa.Column("file_size_bytes", sa.Integer(), nullable=False),
            sa.Column("storage_key", sa.String(255), unique=True, nullable=False),
            sa.Column("ocr_extracted_text", sa.Text()),
            sa.Column("created_at", sa.DateTime()),
        )

    # 4. Expand medicine_records, expiry_notifications, medicine_event_history, disposal_records
    med_cols = _col_names(inspector, "medicine_records")
    with op.batch_alter_table("medicine_records") as batch_op:
        if "household_id" not in med_cols:
            batch_op.add_column(sa.Column("household_id", sa.Integer(), server_default="1"))
        if "manufacturer" not in med_cols:
            batch_op.add_column(sa.Column("manufacturer", sa.String(120)))
        if "category" not in med_cols:
            batch_op.add_column(sa.Column("category", sa.String(60), server_default="General"))
        if "prescribed_dosage" not in med_cols:
            batch_op.add_column(sa.Column("prescribed_dosage", sa.String(120)))
        if "prescription_required" not in med_cols:
            batch_op.add_column(sa.Column("prescription_required", sa.Boolean(), server_default=sa.false()))
        if "manufacturing_date" not in med_cols:
            batch_op.add_column(sa.Column("manufacturing_date", sa.String(20)))
        if "quantity_unit" not in med_cols:
            batch_op.add_column(sa.Column("quantity_unit", sa.String(30), server_default="units"))
        if "prescription_id" not in med_cols:
            batch_op.add_column(sa.Column("prescription_id", sa.Integer()))
        if "passport_token" not in med_cols:
            batch_op.add_column(sa.Column("passport_token", sa.String(64)))

    # Backfill passport_token for existing rows safely without modifying user fields
    rows = bind.execute(sa.text("SELECT id FROM medicine_records WHERE passport_token IS NULL")).fetchall()
    for (med_id,) in rows:
        token = f"MDP-{uuid.uuid4().hex[:16].upper()}"
        bind.execute(
            sa.text("UPDATE medicine_records SET passport_token = :tok, household_id = COALESCE(household_id, 1) WHERE id = :id"),
            {"tok": token, "id": med_id},
        )

    notif_cols = _col_names(inspector, "expiry_notifications")
    with op.batch_alter_table("expiry_notifications") as batch_op:
        if "household_id" not in notif_cols:
            batch_op.add_column(sa.Column("household_id", sa.Integer(), server_default="1"))
        if "user_id" not in notif_cols:
            batch_op.add_column(sa.Column("user_id", sa.Integer()))
        if "notification_type" not in notif_cols:
            batch_op.add_column(sa.Column("notification_type", sa.String(40), server_default="EXPIRY", nullable=False))
        if "reference_id" not in notif_cols:
            batch_op.add_column(sa.Column("reference_id", sa.Integer()))
        if "severity" not in notif_cols:
            batch_op.add_column(sa.Column("severity", sa.String(20), server_default="WARNING"))
        batch_op.alter_column("medicine_id", existing_type=sa.Integer(), nullable=True)

    ev_cols = _col_names(inspector, "medicine_event_history")
    with op.batch_alter_table("medicine_event_history") as batch_op:
        if "household_id" not in ev_cols:
            batch_op.add_column(sa.Column("household_id", sa.Integer(), server_default="1"))
        if "actor_user_id" not in ev_cols:
            batch_op.add_column(sa.Column("actor_user_id", sa.Integer()))

    disp_cols = _col_names(inspector, "disposal_records")
    with op.batch_alter_table("disposal_records") as batch_op:
        if "household_id" not in disp_cols:
            batch_op.add_column(sa.Column("household_id", sa.Integer(), server_default="1"))
        if "quantity_disposed" not in disp_cols:
            batch_op.add_column(sa.Column("quantity_disposed", sa.Integer(), server_default="0"))
        if "reason" not in disp_cols:
            batch_op.add_column(sa.Column("reason", sa.String(120), server_default="Expired"))

    # 5. Refill Predictions
    if "refill_predictions" not in existing:
        op.create_table(
            "refill_predictions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("household_id", sa.Integer(), sa.ForeignKey("households.id"), nullable=False),
            sa.Column("medicine_id", sa.Integer(), sa.ForeignKey("medicine_records.id"), nullable=False, unique=True),
            sa.Column("schedule_id", sa.Integer(), sa.ForeignKey("medication_schedules.id")),
            sa.Column("estimated_daily_consumption", sa.Float(), nullable=False, server_default="0"),
            sa.Column("remaining_days", sa.Integer()),
            sa.Column("estimated_depletion_date", sa.String(20)),
            sa.Column("suggested_refill_date", sa.String(20)),
            sa.Column("confidence_level", sa.String(30), nullable=False, server_default="LOW"),
            sa.Column("adherence_ratio", sa.Float()),
            sa.Column("calculation_notes", sa.Text()),
            sa.Column("updated_at", sa.DateTime()),
        )

    # 6. Pharmacy Ecosystem
    if "pharmacies" not in existing:
        op.create_table(
            "pharmacies",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("name", sa.String(150), nullable=False),
            sa.Column("license_number", sa.String(80), nullable=False),
            sa.Column("address", sa.String(255), nullable=False),
            sa.Column("city", sa.String(80), nullable=False),
            sa.Column("state", sa.String(80)),
            sa.Column("postal_code", sa.String(20)),
            sa.Column("phone", sa.String(30), nullable=False),
            sa.Column("email", sa.String(160)),
            sa.Column("latitude", sa.Float(), nullable=False),
            sa.Column("longitude", sa.Float(), nullable=False),
            sa.Column("business_hours", sa.String(120)),
            sa.Column("supports_pickup", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("supports_delivery", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("delivery_radius_km", sa.Float(), server_default="10"),
            sa.Column("estimated_fulfilment_note", sa.String(160)),
            sa.Column("verification_status", sa.String(30), nullable=False, server_default="PENDING"),
            sa.Column("data_origin", sa.String(30), nullable=False, server_default="PARTNER_REGISTERED"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime()),
            sa.Column("updated_at", sa.DateTime()),
        )

    if "pharmacy_staff" not in existing:
        op.create_table(
            "pharmacy_staff",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("pharmacy_id", sa.Integer(), sa.ForeignKey("pharmacies.id"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("staff_role", sa.String(30), nullable=False, server_default="OWNER"),
            sa.Column("created_at", sa.DateTime()),
            sa.UniqueConstraint("pharmacy_id", "user_id", name="uq_pharmacy_staff_user"),
        )

    if "pharmacy_medicines" not in existing:
        op.create_table(
            "pharmacy_medicines",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("pharmacy_id", sa.Integer(), sa.ForeignKey("pharmacies.id"), nullable=False),
            sa.Column("medicine_name", sa.String(150), nullable=False),
            sa.Column("generic_name", sa.String(150)),
            sa.Column("brand", sa.String(100)),
            sa.Column("strength", sa.String(50)),
            sa.Column("dosage_form", sa.String(50)),
            sa.Column("manufacturer", sa.String(120)),
            sa.Column("category", sa.String(60)),
            sa.Column("prescription_required", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("unit_price_paise", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("stock_quantity", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("reserved_quantity", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_available", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("inventory_source", sa.String(30), nullable=False, server_default="SAMPLE_DEMO"),
            sa.Column("updated_at", sa.DateTime()),
        )

    if "inventory_transactions" not in existing:
        op.create_table(
            "inventory_transactions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("pharmacy_medicine_id", sa.Integer(), sa.ForeignKey("pharmacy_medicines.id"), nullable=False),
            sa.Column("pharmacy_id", sa.Integer(), sa.ForeignKey("pharmacies.id"), nullable=False),
            sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id")),
            sa.Column("tx_type", sa.String(30), nullable=False),
            sa.Column("quantity_change", sa.Integer(), nullable=False),
            sa.Column("balance_after", sa.Integer(), nullable=False),
            sa.Column("reference_type", sa.String(40)),
            sa.Column("reference_id", sa.Integer()),
            sa.Column("notes", sa.String(255)),
            sa.Column("created_at", sa.DateTime()),
        )

    if "refill_requests" not in existing:
        op.create_table(
            "refill_requests",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("household_id", sa.Integer(), sa.ForeignKey("households.id"), nullable=False),
            sa.Column("requested_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("pharmacy_id", sa.Integer(), sa.ForeignKey("pharmacies.id"), nullable=False),
            sa.Column("medicine_record_id", sa.Integer(), sa.ForeignKey("medicine_records.id")),
            sa.Column("pharmacy_medicine_id", sa.Integer(), sa.ForeignKey("pharmacy_medicines.id")),
            sa.Column("prescription_id", sa.Integer(), sa.ForeignKey("prescriptions.id")),
            sa.Column("medicine_name", sa.String(150), nullable=False),
            sa.Column("requested_quantity", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("fulfilment_type", sa.String(20), nullable=False, server_default="PICKUP"),
            sa.Column("delivery_address", sa.String(255)),
            sa.Column("status", sa.String(30), nullable=False, server_default="PENDING"),
            sa.Column("pharmacist_notes", sa.Text()),
            sa.Column("created_at", sa.DateTime()),
            sa.Column("updated_at", sa.DateTime()),
        )

    if "pharmacy_orders" not in existing:
        op.create_table(
            "pharmacy_orders",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("order_number", sa.String(40), unique=True, nullable=False),
            sa.Column("household_id", sa.Integer(), sa.ForeignKey("households.id"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("pharmacy_id", sa.Integer(), sa.ForeignKey("pharmacies.id"), nullable=False),
            sa.Column("prescription_id", sa.Integer(), sa.ForeignKey("prescriptions.id")),
            sa.Column("fulfilment_type", sa.String(20), nullable=False, server_default="PICKUP"),
            sa.Column("delivery_address", sa.String(255)),
            sa.Column("payment_method", sa.String(30), nullable=False, server_default="PAY_AT_PICKUP"),
            sa.Column("payment_status", sa.String(40), nullable=False, server_default="UNPAID_PAY_AT_PICKUP"),
            sa.Column("status", sa.String(30), nullable=False, server_default="PENDING"),
            sa.Column("total_amount_paise", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("notes", sa.Text()),
            sa.Column("created_at", sa.DateTime()),
            sa.Column("updated_at", sa.DateTime()),
        )

    if "pharmacy_order_items" not in existing:
        op.create_table(
            "pharmacy_order_items",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("order_id", sa.Integer(), sa.ForeignKey("pharmacy_orders.id"), nullable=False),
            sa.Column("pharmacy_medicine_id", sa.Integer(), sa.ForeignKey("pharmacy_medicines.id"), nullable=False),
            sa.Column("medicine_name", sa.String(150), nullable=False),
            sa.Column("strength", sa.String(50)),
            sa.Column("quantity", sa.Integer(), nullable=False),
            sa.Column("unit_price_paise", sa.Integer(), nullable=False),
            sa.Column("line_total_paise", sa.Integer(), nullable=False),
        )

    if "order_status_history" not in existing:
        op.create_table(
            "order_status_history",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("order_id", sa.Integer(), sa.ForeignKey("pharmacy_orders.id"), nullable=False),
            sa.Column("status", sa.String(30), nullable=False),
            sa.Column("changed_by_user_id", sa.Integer(), sa.ForeignKey("users.id")),
            sa.Column("notes", sa.String(255)),
            sa.Column("created_at", sa.DateTime()),
        )


def downgrade() -> None:
    pass
