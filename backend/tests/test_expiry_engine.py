import datetime
import pytest
from backend.app.expiry_engine import (
    calculate_days_until_expiry,
    get_expiry_status_category,
    parse_iso_date
)

def test_parse_iso_date():
    assert parse_iso_date("2026-10-14") == datetime.date(2026, 10, 14)
    assert parse_iso_date("2028-02-29") == datetime.date(2028, 2, 29) # Leap year
    assert parse_iso_date("2026-12-31T23:59:59") == datetime.date(2026, 12, 31)

def test_calculate_days_until_expiry():
    today = datetime.date(2026, 10, 14)

    # Already expired (-5 days)
    past_date = "2026-10-09"
    assert calculate_days_until_expiry(past_date, reference_date=today) == -5

    # Expires today (0 days)
    today_str = "2026-10-14"
    assert calculate_days_until_expiry(today_str, reference_date=today) == 0

    # 1-day threshold
    d1 = "2026-10-15"
    assert calculate_days_until_expiry(d1, reference_date=today) == 1

    # 3-day threshold
    d3 = "2026-10-17"
    assert calculate_days_until_expiry(d3, reference_date=today) == 3

    # 5-day threshold
    d5 = "2026-10-19"
    assert calculate_days_until_expiry(d5, reference_date=today) == 5

    # 10-day threshold
    d10 = "2026-10-24"
    assert calculate_days_until_expiry(d10, reference_date=today) == 10

    # Month end boundary (Oct 31 -> Nov 1)
    oct31 = datetime.date(2026, 10, 31)
    nov01 = "2026-11-01"
    assert calculate_days_until_expiry(nov01, reference_date=oct31) == 1

def test_expiry_status_categories():
    assert get_expiry_status_category(-4) == "EXPIRED"
    assert get_expiry_status_category(0) == "EXPIRES_TODAY"
    assert get_expiry_status_category(1) == "CRITICAL_1D"
    assert get_expiry_status_category(3) == "URGENT_3D"
    assert get_expiry_status_category(5) == "APPROACHING_5D"
    assert get_expiry_status_category(10) == "NOTICE_10D"
    assert get_expiry_status_category(11) == "SAFE"
    assert get_expiry_status_category(120) == "SAFE"

if __name__ == "__main__":
    test_parse_iso_date()
    test_calculate_days_until_expiry()
    test_expiry_status_categories()
    print("All expiry engine unit tests PASSED!")
