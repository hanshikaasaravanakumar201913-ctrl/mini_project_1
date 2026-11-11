from backend.app.c_engine_bridge import CDataStructuresBridge


def test_c_engine_priority_queue():
    engine = CDataStructuresBridge()
    assert engine.pq_size() == 0
    assert engine.pq_peek_urgent() is None

    engine.pq_insert_event(101, "Paracetamol", "B1", 10, "2026-10-24", 1, household_id=1, event_type="EXPIRY")
    engine.pq_insert_event(102, "Cetirizine", "B2", 1, "2026-10-15", 2, household_id=1, event_type="EXPIRY")
    engine.pq_insert_event(103, "Amoxicillin", "B3", -3, "2026-10-11", 1, household_id=1, event_type="EXPIRY")
    engine.pq_insert_event(104, "Metformin", "B4", 5, "2026-10-19", 1, household_id=2, event_type="REFILL")

    assert engine.pq_size() == 4

    urgent = engine.pq_peek_urgent()
    assert urgent is not None
    assert urgent["medicine_id"] == 103
    assert urgent["days_until_expiry"] == -3

    # Household-scoped peek must isolate household 2
    hh2_urgent = engine.pq_peek_urgent(household_id=2)
    assert hh2_urgent is not None and hh2_urgent["medicine_id"] == 104

    # Remove medicine 103 cleanly
    engine.pq_remove_medicine(103, "EXPIRY")
    assert engine.pq_size() == 3
    assert engine.pq_peek_urgent()["medicine_id"] == 102

    e1 = engine.pq_extract_urgent()
    e2 = engine.pq_extract_urgent()
    e3 = engine.pq_extract_urgent()

    assert e1["days_until_expiry"] == 1
    assert e2["days_until_expiry"] == 5
    assert e3["days_until_expiry"] == 10
    assert engine.pq_size() == 0

    engine.pq_insert_event(201, "Temp", "B9", 2, "2026-11-01", 1)
    engine.pq_clear()
    assert engine.pq_size() == 0


def test_c_engine_hash_table():
    engine = CDataStructuresBridge()
    assert engine.ht_size() == 0
    assert engine.ht_search_medicine("med-001") is None

    m1 = {"id": "med-001", "name": "Dolo 650", "quantity": 15, "household_id": 1}
    m2 = {"id": "med-002", "name": "Alerid", "quantity": 6, "household_id": 2}

    engine.ht_insert_medicine("med-001", m1)
    engine.ht_insert_medicine("med-002", m2)
    assert engine.ht_size() == 2

    found = engine.ht_search_medicine("med-001", household_id=1)
    assert found is not None and found["name"] == "Dolo 650"
    # Household scoping rejects cross-household hash lookup
    assert engine.ht_search_medicine("med-002", household_id=1) is None

    m1_updated = {"id": "med-001", "name": "Dolo 650", "quantity": 40, "household_id": 1}
    engine.ht_insert_medicine("med-001", m1_updated)
    assert engine.ht_size() == 2
    assert engine.ht_search_medicine("med-001")["quantity"] == 40

    assert engine.ht_delete_medicine("med-002") is True
    assert engine.ht_size() == 1
    assert engine.ht_search_medicine("med-002") is None
    assert engine.ht_delete_medicine("med-999") is False

    stats = engine.ht_stats()
    assert stats["size"] == 1
    engine.ht_clear()
    assert engine.ht_size() == 0


def test_c_engine_linked_list():
    engine = CDataStructuresBridge()
    assert engine.ll_size() == 0

    engine.ll_append_event(1, "med-001", "CREATED", "2026-10-14T10:00:00", "Created manual entry", 20, household_id=1)
    engine.ll_append_event(2, "med-001", "DOSE_TAKEN", "2026-10-14T12:00:00", "Took dose", -1, household_id=1)
    engine.ll_prepend_event(0, "med-002", "OCR_SCANNED", "2026-10-14T09:30:00", "Scanned package", 0, household_id=2)

    assert engine.ll_size() == 3
    events_all = engine.ll_get_all_events()
    assert events_all[0]["event_id"] == 0

    events_hh1 = engine.ll_get_all_events(household_id=1)
    assert len(events_hh1) == 2

    doses = engine.ll_search_action("DOSE_TAKEN", household_id=1)
    assert len(doses) == 1
    assert doses[0]["quantity_delta"] == -1

    engine.ll_clear()
    assert engine.ll_size() == 0
