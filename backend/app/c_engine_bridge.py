import ctypes
import heapq
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
from backend.app.config import PROJECT_ROOT, settings


# --- C Structures (ctypes) matching c_src/include/priority_queue.h ---
class CExpiryEvent(ctypes.Structure):
    _fields_ = [
        ("medicine_id", ctypes.c_int),
        ("medicine_name", ctypes.c_char * 64),
        ("batch_number", ctypes.c_char * 32),
        ("days_until_expiry", ctypes.c_int),
        ("expiry_date", ctypes.c_char * 12),
        ("assigned_member_id", ctypes.c_int),
        ("household_id", ctypes.c_int),
        ("event_type", ctypes.c_char * 16),
    ]


# --- C Structures matching c_src/include/hash_table.h ---
class CMedicineRecord(ctypes.Structure):
    _fields_ = [
        ("id", ctypes.c_char * 32),
        ("name", ctypes.c_char * 64),
        ("brand", ctypes.c_char * 64),
        ("strength", ctypes.c_char * 32),
        ("dosage_form", ctypes.c_char * 32),
        ("quantity", ctypes.c_int),
        ("expiry_date", ctypes.c_char * 12),
        ("is_confirmed", ctypes.c_int),
        ("household_id", ctypes.c_int),
    ]


# --- C Structures matching c_src/include/linked_list.h ---
class CMedicineEvent(ctypes.Structure):
    _fields_ = [
        ("event_id", ctypes.c_int),
        ("medicine_id", ctypes.c_char * 32),
        ("action", ctypes.c_char * 32),
        ("timestamp", ctypes.c_char * 32),
        ("description", ctypes.c_char * 128),
        ("quantity_delta", ctypes.c_int),
        ("household_id", ctypes.c_int),
    ]


def _decode_c_str(raw: bytes) -> str:
    return raw.split(b"\x00", 1)[0].decode("utf-8", errors="ignore")


def _c_event_to_dict(c_event: CExpiryEvent) -> Dict[str, Any]:
    return {
        "medicine_id": c_event.medicine_id,
        "medicine_name": _decode_c_str(c_event.medicine_name),
        "batch_number": _decode_c_str(c_event.batch_number),
        "days_until_expiry": c_event.days_until_expiry,
        "expiry_date": _decode_c_str(c_event.expiry_date),
        "assigned_member_id": c_event.assigned_member_id,
        "household_id": c_event.household_id,
        "event_type": _decode_c_str(c_event.event_type) or "EXPIRY",
    }


def _c_record_to_dict(c_rec: CMedicineRecord) -> Dict[str, Any]:
    return {
        "id": _decode_c_str(c_rec.id),
        "name": _decode_c_str(c_rec.name),
        "brand": _decode_c_str(c_rec.brand),
        "strength": _decode_c_str(c_rec.strength),
        "dosage_form": _decode_c_str(c_rec.dosage_form),
        "quantity": c_rec.quantity,
        "expiry_date": _decode_c_str(c_rec.expiry_date),
        "is_confirmed": c_rec.is_confirmed,
        "household_id": c_rec.household_id,
    }


def _c_ll_event_to_dict(c_ev: CMedicineEvent) -> Dict[str, Any]:
    return {
        "event_id": c_ev.event_id,
        "medicine_id": _decode_c_str(c_ev.medicine_id),
        "action": _decode_c_str(c_ev.action),
        "timestamp": _decode_c_str(c_ev.timestamp),
        "description": _decode_c_str(c_ev.description),
        "quantity_delta": c_ev.quantity_delta,
        "household_id": c_ev.household_id,
    }


class CDataStructuresBridge:
    """
    Python <-> C99 FFI Bridge using ctypes.
    Loads the compiled C99 shared library (medora_ds.dll / libmedora_ds.so)
    with full native reads, writes, deletes, clears, and collision diagnostics.
    Falls back cleanly to equivalent pure-Python algorithms when native binary is absent.
    """

    def __init__(self, lib_path: Optional[str] = None):
        self.mode = "FALLBACK_PYTHON_SIMULATION"
        self.loaded_lib_path: Optional[str] = None
        self.load_error: Optional[str] = None
        self.c_lib = None
        self._c_pq = None
        self._c_ht = None
        self._c_ll = None

        # Pure-Python algorithmic fallback state (only used when native C lib unavailable)
        self._py_min_heap: List[tuple] = []
        self._py_heap_seq: int = 0
        self._py_hash_table: Dict[str, dict] = {}
        self._py_linked_list: List[dict] = []

        self._init_c_library(lib_path)

    def _init_c_library(self, override_path: Optional[str] = None):
        candidates = [
            override_path,
            settings.C_LIB_PATH,
            str(PROJECT_ROOT / "c_src" / "bin" / "medora_ds.dll"),
            str(PROJECT_ROOT / "c_src" / "bin" / "libmedora_ds.so"),
            str(PROJECT_ROOT / "c_src" / "bin" / "medora_ds.so"),
            str(PROJECT_ROOT / "backend" / "app" / "libc_engine.dll"),
        ]

        for candidate in candidates:
            if not candidate:
                continue
            path_obj = Path(candidate)
            if path_obj.exists():
                try:
                    lib = ctypes.CDLL(str(path_obj.resolve()))
                    self.c_lib = lib
                    self._bind_c_functions()
                    self._c_pq = self.c_lib.pq_create(16)
                    self._c_ht = self.c_lib.ht_create(31)
                    self._c_ll = self.c_lib.ll_create()
                    if not (self._c_pq and self._c_ht and self._c_ll):
                        raise MemoryError("C data structure allocation returned NULL")
                    self.mode = "NATIVE_C_SHARED_LIBRARY"
                    self.loaded_lib_path = str(path_obj.resolve())
                    self.load_error = None
                    return
                except Exception as exc:
                    self.load_error = str(exc)
                    self.c_lib = None
                    self._c_pq = None
                    self._c_ht = None
                    self._c_ll = None
                    self.mode = "FALLBACK_PYTHON_SIMULATION"

    def _bind_c_functions(self):
        # PriorityQueue (Min-Heap)
        self.c_lib.pq_create.restype = ctypes.c_void_p
        self.c_lib.pq_create.argtypes = [ctypes.c_size_t]
        self.c_lib.pq_insert.restype = ctypes.c_int
        self.c_lib.pq_insert.argtypes = [ctypes.c_void_p, CExpiryEvent]
        self.c_lib.pq_peek.restype = ctypes.c_int
        self.c_lib.pq_peek.argtypes = [ctypes.c_void_p, ctypes.POINTER(CExpiryEvent)]
        self.c_lib.pq_extract_min.restype = ctypes.c_int
        self.c_lib.pq_extract_min.argtypes = [ctypes.c_void_p, ctypes.POINTER(CExpiryEvent)]
        self.c_lib.pq_get_at.restype = ctypes.c_int
        self.c_lib.pq_get_at.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.POINTER(CExpiryEvent)]
        self.c_lib.pq_remove_by_medicine.restype = ctypes.c_int
        self.c_lib.pq_remove_by_medicine.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_char_p]
        self.c_lib.pq_clear.restype = None
        self.c_lib.pq_clear.argtypes = [ctypes.c_void_p]
        self.c_lib.pq_size.restype = ctypes.c_size_t
        self.c_lib.pq_size.argtypes = [ctypes.c_void_p]
        self.c_lib.pq_free.restype = None
        self.c_lib.pq_free.argtypes = [ctypes.c_void_p]

        # HashTable (Separate Chaining)
        self.c_lib.ht_create.restype = ctypes.c_void_p
        self.c_lib.ht_create.argtypes = [ctypes.c_size_t]
        self.c_lib.ht_insert.restype = ctypes.c_int
        self.c_lib.ht_insert.argtypes = [ctypes.c_void_p, ctypes.c_char_p, CMedicineRecord]
        self.c_lib.ht_search.restype = ctypes.c_int
        self.c_lib.ht_search.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.POINTER(CMedicineRecord)]
        self.c_lib.ht_delete.restype = ctypes.c_int
        self.c_lib.ht_delete.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
        self.c_lib.ht_clear.restype = None
        self.c_lib.ht_clear.argtypes = [ctypes.c_void_p]
        self.c_lib.ht_size.restype = ctypes.c_size_t
        self.c_lib.ht_size.argtypes = [ctypes.c_void_p]
        self.c_lib.ht_bucket_count.restype = ctypes.c_size_t
        self.c_lib.ht_bucket_count.argtypes = [ctypes.c_void_p]
        self.c_lib.ht_collision_count.restype = ctypes.c_size_t
        self.c_lib.ht_collision_count.argtypes = [ctypes.c_void_p]
        self.c_lib.ht_free.restype = None
        self.c_lib.ht_free.argtypes = [ctypes.c_void_p]

        # LinkedList (Audit Trail)
        self.c_lib.ll_create.restype = ctypes.c_void_p
        self.c_lib.ll_create.argtypes = []
        self.c_lib.ll_append.restype = ctypes.c_int
        self.c_lib.ll_append.argtypes = [ctypes.c_void_p, CMedicineEvent]
        self.c_lib.ll_prepend.restype = ctypes.c_int
        self.c_lib.ll_prepend.argtypes = [ctypes.c_void_p, CMedicineEvent]
        self.c_lib.ll_search_all_by_action.restype = ctypes.c_size_t
        self.c_lib.ll_search_all_by_action.argtypes = [
            ctypes.c_void_p,
            ctypes.c_char_p,
            ctypes.POINTER(CMedicineEvent),
            ctypes.c_size_t,
        ]
        self.c_lib.ll_get_at.restype = ctypes.c_int
        self.c_lib.ll_get_at.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.POINTER(CMedicineEvent)]
        self.c_lib.ll_delete_by_id.restype = ctypes.c_int
        self.c_lib.ll_delete_by_id.argtypes = [ctypes.c_void_p, ctypes.c_int]
        self.c_lib.ll_clear.restype = None
        self.c_lib.ll_clear.argtypes = [ctypes.c_void_p]
        self.c_lib.ll_size.restype = ctypes.c_size_t
        self.c_lib.ll_size.argtypes = [ctypes.c_void_p]
        self.c_lib.ll_free.restype = None
        self.c_lib.ll_free.argtypes = [ctypes.c_void_p]

    @property
    def is_native(self) -> bool:
        return self.mode == "NATIVE_C_SHARED_LIBRARY" and self.c_lib is not None

    # --- Min-Heap Priority Queue Methods ---
    def pq_insert_event(
        self,
        medicine_id: int,
        name: str,
        batch: str,
        days: int,
        exp_date: str,
        member_id: int = 0,
        household_id: int = 1,
        event_type: str = "EXPIRY",
    ) -> bool:
        event = {
            "medicine_id": medicine_id,
            "medicine_name": name,
            "batch_number": batch,
            "days_until_expiry": days,
            "expiry_date": exp_date,
            "assigned_member_id": member_id,
            "household_id": household_id,
            "event_type": event_type,
        }
        self._py_heap_seq += 1
        heapq.heappush(self._py_min_heap, (days, self._py_heap_seq, event))

        if self.is_native and self._c_pq:
            c_event = CExpiryEvent(
                medicine_id=medicine_id,
                medicine_name=name.encode("utf-8")[:63],
                batch_number=batch.encode("utf-8")[:31],
                days_until_expiry=days,
                expiry_date=exp_date.encode("utf-8")[:11],
                assigned_member_id=member_id,
                household_id=household_id,
                event_type=event_type.encode("utf-8")[:15],
            )
            return self.c_lib.pq_insert(self._c_pq, c_event) == 1
        return True

    def pq_peek_urgent(self, household_id: Optional[int] = None) -> Optional[dict]:
        if household_id is None:
            if self.is_native and self._c_pq and self.c_lib.pq_size(self._c_pq) > 0:
                c_event = CExpiryEvent()
                if self.c_lib.pq_peek(self._c_pq, ctypes.byref(c_event)) == 1:
                    return _c_event_to_dict(c_event)
            if not self._py_min_heap:
                return None
            return self._py_min_heap[0][2]

        events = self.pq_get_all_events(household_id=household_id)
        return events[0] if events else None

    def pq_extract_urgent(self) -> Optional[dict]:
        if self.is_native and self._c_pq and self.c_lib.pq_size(self._c_pq) > 0:
            c_event = CExpiryEvent()
            if self.c_lib.pq_extract_min(self._c_pq, ctypes.byref(c_event)) == 1:
                if self._py_min_heap:
                    heapq.heappop(self._py_min_heap)
                return _c_event_to_dict(c_event)
        if not self._py_min_heap:
            return None
        return heapq.heappop(self._py_min_heap)[2]

    def pq_get_all_events(self, household_id: Optional[int] = None, limit: int = 50) -> List[dict]:
        items: List[dict] = []
        if self.is_native and self._c_pq:
            total = self.c_lib.pq_size(self._c_pq)
            c_ev = CExpiryEvent()
            for idx in range(total):
                if self.c_lib.pq_get_at(self._c_pq, idx, ctypes.byref(c_ev)) == 1:
                    ev = _c_event_to_dict(c_ev)
                    if household_id is None or ev["household_id"] == household_id:
                        items.append(ev)
        else:
            for _, _, ev in self._py_min_heap:
                if household_id is None or ev["household_id"] == household_id:
                    items.append(dict(ev))
        items.sort(key=lambda x: x["days_until_expiry"])
        return items[:limit]

    def pq_remove_medicine(self, medicine_id: int, event_type: str = "") -> int:
        self._py_min_heap = [
            item
            for item in self._py_min_heap
            if not (
                item[2]["medicine_id"] == medicine_id
                and (not event_type or item[2]["event_type"] == event_type)
            )
        ]
        heapq.heapify(self._py_min_heap)
        if self.is_native and self._c_pq:
            type_bytes = event_type.encode("utf-8") if event_type else b""
            return self.c_lib.pq_remove_by_medicine(self._c_pq, medicine_id, type_bytes)
        return 1

    def pq_size(self) -> int:
        if self.is_native and self._c_pq:
            return int(self.c_lib.pq_size(self._c_pq))
        return len(self._py_min_heap)

    def pq_clear(self):
        self._py_min_heap.clear()
        if self.is_native and self._c_pq:
            self.c_lib.pq_clear(self._c_pq)

    # --- Hash Table Methods ---
    def ht_insert_medicine(self, key: str, record: dict) -> bool:
        self._py_hash_table[key] = dict(record)
        if self.is_native and self._c_ht:
            c_rec = CMedicineRecord(
                id=str(record.get("id", key)).encode("utf-8")[:31],
                name=str(record.get("name", "")).encode("utf-8")[:63],
                brand=str(record.get("brand", "")).encode("utf-8")[:63],
                strength=str(record.get("strength", "")).encode("utf-8")[:31],
                dosage_form=str(record.get("dosage_form", "")).encode("utf-8")[:31],
                quantity=int(record.get("quantity", 0)),
                expiry_date=str(record.get("expiry_date", "")).encode("utf-8")[:11],
                is_confirmed=int(record.get("is_confirmed", 1)),
                household_id=int(record.get("household_id", 1)),
            )
            return self.c_lib.ht_insert(self._c_ht, key.encode("utf-8"), c_rec) == 1
        return True

    def ht_search_medicine(self, key: str, household_id: Optional[int] = None) -> Optional[dict]:
        found: Optional[dict] = None
        if self.is_native and self._c_ht:
            c_rec = CMedicineRecord()
            if self.c_lib.ht_search(self._c_ht, key.encode("utf-8"), ctypes.byref(c_rec)) == 1:
                found = _c_record_to_dict(c_rec)
        else:
            found = self._py_hash_table.get(key)

        if found is not None and household_id is not None and found.get("household_id") != household_id:
            return None
        return found

    def ht_delete_medicine(self, key: str) -> bool:
        c_deleted = False
        if self.is_native and self._c_ht:
            c_deleted = self.c_lib.ht_delete(self._c_ht, key.encode("utf-8")) == 1
        py_deleted = self._py_hash_table.pop(key, None) is not None
        return c_deleted if self.is_native else py_deleted

    def ht_size(self) -> int:
        if self.is_native and self._c_ht:
            return int(self.c_lib.ht_size(self._c_ht))
        return len(self._py_hash_table)

    def ht_stats(self) -> Dict[str, int]:
        if self.is_native and self._c_ht:
            return {
                "size": int(self.c_lib.ht_size(self._c_ht)),
                "buckets": int(self.c_lib.ht_bucket_count(self._c_ht)),
                "collisions": int(self.c_lib.ht_collision_count(self._c_ht)),
            }
        return {
            "size": len(self._py_hash_table),
            "buckets": 31,
            "collisions": 0,
        }

    def ht_clear(self):
        self._py_hash_table.clear()
        if self.is_native and self._c_ht:
            self.c_lib.ht_clear(self._c_ht)

    # --- Linked List Timeline Methods ---
    def ll_append_event(
        self,
        event_id: int,
        medicine_id: str,
        action: str,
        timestamp: str,
        description: str,
        delta: int = 0,
        household_id: int = 1,
    ) -> bool:
        ev = {
            "event_id": event_id,
            "medicine_id": str(medicine_id),
            "action": action,
            "timestamp": timestamp,
            "description": description,
            "quantity_delta": delta,
            "household_id": household_id,
        }
        self._py_linked_list.append(ev)
        if self.is_native and self._c_ll:
            c_ev = CMedicineEvent(
                event_id=event_id,
                medicine_id=str(medicine_id).encode("utf-8")[:31],
                action=action.encode("utf-8")[:31],
                timestamp=timestamp.encode("utf-8")[:31],
                description=description.encode("utf-8")[:127],
                quantity_delta=delta,
                household_id=household_id,
            )
            return self.c_lib.ll_append(self._c_ll, c_ev) == 1
        return True

    def ll_prepend_event(
        self,
        event_id: int,
        medicine_id: str,
        action: str,
        timestamp: str,
        description: str,
        delta: int = 0,
        household_id: int = 1,
    ) -> bool:
        ev = {
            "event_id": event_id,
            "medicine_id": str(medicine_id),
            "action": action,
            "timestamp": timestamp,
            "description": description,
            "quantity_delta": delta,
            "household_id": household_id,
        }
        self._py_linked_list.insert(0, ev)
        if self.is_native and self._c_ll:
            c_ev = CMedicineEvent(
                event_id=event_id,
                medicine_id=str(medicine_id).encode("utf-8")[:31],
                action=action.encode("utf-8")[:31],
                timestamp=timestamp.encode("utf-8")[:31],
                description=description.encode("utf-8")[:127],
                quantity_delta=delta,
                household_id=household_id,
            )
            return self.c_lib.ll_prepend(self._c_ll, c_ev) == 1
        return True

    def ll_search_action(self, action: str, household_id: Optional[int] = None, max_results: int = 100) -> List[dict]:
        if self.is_native and self._c_ll:
            buf = (CMedicineEvent * max_results)()
            count = self.c_lib.ll_search_all_by_action(self._c_ll, action.encode("utf-8"), buf, max_results)
            results = [_c_ll_event_to_dict(buf[i]) for i in range(count)]
        else:
            results = [ev for ev in self._py_linked_list if ev["action"] == action]

        if household_id is not None:
            results = [ev for ev in results if ev.get("household_id") == household_id]
        return results

    def ll_get_all_events(self, household_id: Optional[int] = None) -> List[dict]:
        if self.is_native and self._c_ll:
            total = int(self.c_lib.ll_size(self._c_ll))
            results: List[dict] = []
            c_ev = CMedicineEvent()
            for idx in range(total):
                if self.c_lib.ll_get_at(self._c_ll, idx, ctypes.byref(c_ev)) == 1:
                    ev = _c_ll_event_to_dict(c_ev)
                    if household_id is None or ev.get("household_id") == household_id:
                        results.append(ev)
            return results

        if household_id is None:
            return list(self._py_linked_list)
        return [ev for ev in self._py_linked_list if ev.get("household_id") == household_id]

    def ll_size(self) -> int:
        if self.is_native and self._c_ll:
            return int(self.c_lib.ll_size(self._c_ll))
        return len(self._py_linked_list)

    def ll_clear(self):
        self._py_linked_list.clear()
        if self.is_native and self._c_ll:
            self.c_lib.ll_clear(self._c_ll)

    def clear_all(self):
        self.pq_clear()
        self.ht_clear()
        self.ll_clear()


c_engine = CDataStructuresBridge()
