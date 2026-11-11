#ifndef LINKED_LIST_H
#define LINKED_LIST_H

#include <stddef.h>

#if defined(_WIN32) && defined(MEDORA_BUILDING_DLL)
  #define MEDORA_API __declspec(dllexport)
#else
  #define MEDORA_API
#endif

/**
 * Singly Linked List for Medicine Event History & Audit Log.
 * Records chronological actions (CREATED, OCR_SCANNED, DOSE_TAKEN, STOCK_UPDATED, DISPOSED).
 *
 * Operations & Complexities:
 *   - ll_create:               O(1)
 *   - ll_append:               O(1) using tail pointer
 *   - ll_prepend:              O(1) using head pointer
 *   - ll_search_by_action:     O(n)
 *   - ll_search_all_by_action: O(n)
 *   - ll_get_at:               O(n)
 *   - ll_delete_by_id:         O(n)
 *   - ll_clear:                O(n)
 *   - ll_size / ll_is_empty:   O(1)
 *   - ll_free:                 O(n)
 */

typedef struct {
    int event_id;
    char medicine_id[32];
    char action[32];      /* "CREATED", "OCR_SCANNED", "DOSE_TAKEN", "DISPOSED", etc. */
    char timestamp[32];   /* ISO-8601 string */
    char description[128];
    int quantity_delta;   /* e.g. -1 for dose taken, +30 for refill */
    int household_id;     /* Household isolation key */
} MedicineEvent;

typedef struct ListNode {
    MedicineEvent data;
    struct ListNode* next;
} ListNode;

typedef struct {
    ListNode* head;
    ListNode* tail;
    size_t count;
} LinkedList;

MEDORA_API LinkedList* ll_create(void);
MEDORA_API int ll_append(LinkedList* list, MedicineEvent event);
MEDORA_API int ll_prepend(LinkedList* list, MedicineEvent event);
MEDORA_API ListNode* ll_search_by_action(const LinkedList* list, const char* action);
MEDORA_API size_t ll_search_all_by_action(const LinkedList* list, const char* action, MedicineEvent* out_events, size_t max_results);
MEDORA_API int ll_get_at(const LinkedList* list, size_t index, MedicineEvent* out_event);
MEDORA_API int ll_delete_by_id(LinkedList* list, int event_id);
MEDORA_API void ll_clear(LinkedList* list);
MEDORA_API size_t ll_size(const LinkedList* list);
MEDORA_API int ll_is_empty(const LinkedList* list);
MEDORA_API void ll_free(LinkedList* list);

#endif /* LINKED_LIST_H */
