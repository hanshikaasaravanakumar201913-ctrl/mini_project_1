# Medora Academic Module: Data Structures in C99

This module provides native C99 implementations (`c_src/`) integrated with the FastAPI backend via `ctypes` (`backend/app/c_engine_bridge.py`), with household-scoped multi-tenant filtering and synchronized pure-Python simulation fallback when a compiled shared library is absent or restricted by host execution policy.

---

## 1. Data Structures & Time/Space Complexities

| Data Structure | Source Files | Key Operations | Average / Typical Time | Worst Time | Space | Role in Medora |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Min-Heap Priority Queue** | `priority_queue.h`<br>`priority_queue.c` | `pq_insert`, `pq_peek`, `pq_extract_min`, `pq_get_at`, `pq_remove_by_medicine`, `pq_clear` | Insert $O(\log n)$<br>Peek $O(1)$<br>Extract $O(\log n)$ | $O(\log n)$ / $O(n)$ cleanup | $O(n)$ | Orders urgent `EXPIRY`, `REFILL`, and `PRESCRIPTION` deadlines by minimum `days_remaining`, supporting household filtering and record removal. |
| **Hash Table (Separate Chaining)** | `hash_table.h`<br>`hash_table.c` | `ht_insert`, `ht_search`, `ht_delete`, `ht_clear`, `ht_bucket_count`, `ht_collision_count` | $O(1)$ amortized | $O(n)$ | $O(n + B)$ | Fast medicine lookup by string ID with `djb2` hashing, household isolation checks, and diagnostic collision reporting. |
| **Singly Linked List** | `linked_list.h`<br>`linked_list.c` | `ll_prepend`, `ll_append`, `ll_get_at`, `ll_search`, `ll_search_all_by_action`, `ll_clear` | Prepend/Append $O(1)$<br>Traversal/Filter $O(n)$ | $O(n)$ | $O(n)$ | Stores chronological medicine lifecycle events (created, scanned, dose taken, adjusted, disposed) with household filtering. |

---

## 2. Enhancements Added for Multi-Tenant Platform Safety

- **Windows DLL Exports (`MEDORA_API`)**: Conditional `__declspec(dllexport)` macro under `MEDORA_BUILDING_DLL` in `c_src/include/priority_queue.h`, `hash_table.h`, and `linked_list.h`.
- **Household Scoping (`household_id`)**: Added `int household_id` fields to heap items, hash entries, and audit nodes so shared C state never exposes one household's records to another in `/api/c-engine/*`.
- **Event Categorization (`event_type`)**: Heap nodes distinguish `"EXPIRY"`, `"REFILL"`, and `"PRESCRIPTION"` events.
- **State Consistency & Cleanup**: Exposed `pq_clear`, `ht_clear`, `ll_clear`, and `pq_remove_by_medicine` so `repopulate_c_structures()` resets all three structures cleanly without stale entries or duplicates after edits/disposals/deletes.

---

## 3. Compiling Native Library & Running C Tests

```bash
cd c_src
make
make run_tests
```

Or with CMake:
```bash
cd c_src
mkdir -p build && cd build
cmake ..
cmake --build .
ctest --output-on-failure
```

To inspect active engine mode (`NATIVE_C_SHARED_LIBRARY` vs `FALLBACK_PYTHON_SIMULATION`) and live node counts while running FastAPI, call authenticated `GET /api/c-engine/status` or open **Settings & C99** in the web interface.
