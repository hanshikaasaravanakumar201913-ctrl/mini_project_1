#ifndef PRIORITY_QUEUE_H
#define PRIORITY_QUEUE_H

#include <stddef.h>

#if defined(_WIN32) && defined(MEDORA_BUILDING_DLL)
  #define MEDORA_API __declspec(dllexport)
#else
  #define MEDORA_API
#endif

/**
 * Priority Queue (Min-Heap) for time-sensitive household medicine events.
 * Supports expiry alerts, upcoming refill predictions, and prescription validity alerts.
 * Urgency is determined by days_until_expiry (lower value = higher priority / more urgent).
 *
 * Operations & Complexities:
 *   - pq_create:               O(1)
 *   - pq_insert:               O(log n) amortized (2x dynamic array growth)
 *   - pq_peek:                 O(1)
 *   - pq_extract_min:          O(log n)
 *   - pq_build_heap:           O(n) bottom-up heapification
 *   - pq_get_at:               O(1)
 *   - pq_remove_by_medicine:   O(n) filter + bottom-up heapify
 *   - pq_clear:                O(1)
 *   - pq_size / pq_is_empty:   O(1)
 *   - pq_free:                 O(1)
 */

typedef struct {
    int medicine_id;
    char medicine_name[64];
    char batch_number[32];
    int days_until_expiry;   /* Priority key: smaller/negative = most urgent */
    char expiry_date[12];    /* YYYY-MM-DD */
    int assigned_member_id;
    int household_id;        /* Household isolation scope */
    char event_type[16];     /* "EXPIRY", "REFILL", "PRESCRIPTION" */
} ExpiryEvent;

typedef struct {
    ExpiryEvent* items;
    size_t size;
    size_t capacity;
} PriorityQueue;

MEDORA_API PriorityQueue* pq_create(size_t initial_capacity);
MEDORA_API int pq_insert(PriorityQueue* pq, ExpiryEvent event);
MEDORA_API int pq_peek(const PriorityQueue* pq, ExpiryEvent* out_event);
MEDORA_API int pq_extract_min(PriorityQueue* pq, ExpiryEvent* out_event);
MEDORA_API void pq_build_heap(PriorityQueue* pq, ExpiryEvent* events, size_t count);
MEDORA_API int pq_get_at(const PriorityQueue* pq, size_t index, ExpiryEvent* out_event);
MEDORA_API int pq_remove_by_medicine(PriorityQueue* pq, int medicine_id, const char* event_type);
MEDORA_API void pq_clear(PriorityQueue* pq);
MEDORA_API size_t pq_size(const PriorityQueue* pq);
MEDORA_API int pq_is_empty(const PriorityQueue* pq);
MEDORA_API void pq_free(PriorityQueue* pq);

#endif /* PRIORITY_QUEUE_H */
