#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>

#include "../include/priority_queue.h"
#include "../include/hash_table.h"
#include "../include/linked_list.h"

static int g_tests_passed = 0;
static int g_tests_failed = 0;

#define TEST_ASSERT(cond, msg) do { \
    if (cond) { \
        printf("[PASS] %s\n", msg); \
        g_tests_passed++; \
    } else { \
        printf("[FAIL] %s (Line %d)\n", msg, __LINE__); \
        g_tests_failed++; \
    } \
} while(0)

/* --- 1. Priority Queue Tests --- */
void test_priority_queue(void) {
    printf("\n=== RUNNING PRIORITY QUEUE (MIN-HEAP) TESTS ===\n");

    PriorityQueue* pq = pq_create(4);
    TEST_ASSERT(pq != NULL, "Priority queue initialized successfully");
    TEST_ASSERT(pq_is_empty(pq) == 1, "Priority queue initially empty");
    TEST_ASSERT(pq_size(pq) == 0, "Priority queue initial size is 0");

    ExpiryEvent dummy;
    TEST_ASSERT(pq_peek(pq, &dummy) == 0, "Peeking empty queue returns 0");
    TEST_ASSERT(pq_extract_min(pq, &dummy) == 0, "Extracting from empty queue returns 0");

    /* Insert events with different expiry days */
    ExpiryEvent e1 = {101, "Paracetamol 500mg", "BATCH-A1", 10, "2026-10-24", 1, 1, "EXPIRY"};
    ExpiryEvent e2 = {102, "Amoxicillin 250mg", "BATCH-B2", 3, "2026-10-17", 1, 1, "EXPIRY"};
    ExpiryEvent e3 = {103, "Cetirizine 10mg",   "BATCH-C3", 1, "2026-10-15", 2, 1, "EXPIRY"};
    ExpiryEvent e4 = {104, "Expired Cough Syr", "BATCH-D4", -5, "2026-10-09", 2, 1, "EXPIRY"};
    ExpiryEvent e5 = {105, "Metformin 500mg",   "BATCH-E5", 5, "2026-10-19", 1, 1, "REFILL"};

    pq_insert(pq, e1);
    pq_insert(pq, e2);
    pq_insert(pq, e3);
    pq_insert(pq, e4);
    pq_insert(pq, e5);

    TEST_ASSERT(pq_size(pq) == 5, "Queue has 5 elements after inserts (with dynamic resize)");

    /* Peek must be the most urgent: e4 with -5 days */
    ExpiryEvent top;
    TEST_ASSERT(pq_peek(pq, &top) == 1, "Peek succeeded");
    TEST_ASSERT(top.medicine_id == 104 && top.days_until_expiry == -5, "Most urgent event is expired item (-5 days)");

    /* Remove by medicine_id + event_type */
    int removed = pq_remove_by_medicine(pq, 104, "EXPIRY");
    TEST_ASSERT(removed == 1 && pq_size(pq) == 4, "Removed medicine 104 from heap cleanly");
    pq_peek(pq, &top);
    TEST_ASSERT(top.medicine_id == 103 && top.days_until_expiry == 1, "New min after removal is 1 day");

    /* Extract remaining in order: 1, 3, 5, 10 */
    ExpiryEvent ext1, ext2, ext3, ext4;
    pq_extract_min(pq, &ext1);
    pq_extract_min(pq, &ext2);
    pq_extract_min(pq, &ext3);
    pq_extract_min(pq, &ext4);

    TEST_ASSERT(ext1.days_until_expiry == 1,  "1st extracted is 1 day");
    TEST_ASSERT(ext2.days_until_expiry == 3,  "2nd extracted is 3 days");
    TEST_ASSERT(ext3.days_until_expiry == 5,  "3rd extracted is 5 days");
    TEST_ASSERT(ext4.days_until_expiry == 10, "4th extracted is 10 days");
    TEST_ASSERT(pq_is_empty(pq) == 1, "Queue is empty after extracting all");

    /* Test build_heap + clear + rebuild */
    ExpiryEvent bulk[3] = {
        {201, "Insulin Glargine", "IN-01", 14, "2026-10-28", 1, 1, "EXPIRY"},
        {202, "Aspirin 75mg",      "AS-02", 2,  "2026-10-16", 1, 1, "EXPIRY"},
        {203, "Ibuprofen 400mg",   "IB-03", 7,  "2026-10-21", 2, 1, "REFILL"}
    };
    pq_build_heap(pq, bulk, 3);
    TEST_ASSERT(pq_size(pq) == 3, "build_heap populated 3 elements");
    pq_peek(pq, &top);
    TEST_ASSERT(top.medicine_id == 202 && top.days_until_expiry == 2, "build_heap arranged min-heap correctly");

    ExpiryEvent idx0;
    TEST_ASSERT(pq_get_at(pq, 0, &idx0) == 1 && idx0.medicine_id == 202, "pq_get_at(0) returns root");
    TEST_ASSERT(pq_get_at(pq, 99, &idx0) == 0, "pq_get_at out of bounds returns 0");

    pq_clear(pq);
    TEST_ASSERT(pq_size(pq) == 0 && pq_is_empty(pq) == 1, "pq_clear empties heap cleanly");

    /* Stress test: repeated insert and extract */
    for (int i = 50; i >= 1; i--) {
        ExpiryEvent ev = {i, "StressMed", "ST", i, "2026-12-01", 1, 1, "EXPIRY"};
        pq_insert(pq, ev);
    }
    TEST_ASSERT(pq_size(pq) == 50, "Stress insert 50 items succeeded");
    pq_peek(pq, &top);
    TEST_ASSERT(top.days_until_expiry == 1, "Min after 50 reverse inserts is 1");

    pq_free(pq);
}

/* --- 2. Hash Table Tests --- */
void test_hash_table(void) {
    printf("\n=== RUNNING HASH TABLE TESTS ===\n");

    HashTable* ht = ht_create(3); /* Very small bucket count to force collisions */
    TEST_ASSERT(ht != NULL, "Hash table initialized successfully");
    TEST_ASSERT(ht_size(ht) == 0, "Hash table initially empty");
    TEST_ASSERT(ht_bucket_count(ht) == 3, "Bucket count matches 3");

    MedicineRecord dummy;
    TEST_ASSERT(ht_search(ht, "med-999", &dummy) == 0, "Search on empty table returns 0");

    MedicineRecord m1 = {"med-001", "Paracetamol", "Calpol", "500mg", "Tablet", 20, "2026-11-01", 1, 1};
    MedicineRecord m2 = {"med-002", "Amoxicillin", "Moxikind", "250mg", "Capsule", 15, "2026-10-20", 1, 1};
    MedicineRecord m3 = {"med-003", "Cetirizine", "Alerid", "10mg", "Tablet", 10, "2026-12-15", 1, 1};
    MedicineRecord m4 = {"med-004", "Azithromycin", "Azithral", "500mg", "Tablet", 5, "2027-01-10", 0, 1};

    TEST_ASSERT(ht_insert(ht, m1.id, m1) == 1, "Insert med-001 succeeded");
    TEST_ASSERT(ht_insert(ht, m2.id, m2) == 1, "Insert med-002 succeeded");
    TEST_ASSERT(ht_insert(ht, m3.id, m3) == 1, "Insert med-003 succeeded");
    TEST_ASSERT(ht_insert(ht, m4.id, m4) == 1, "Insert med-004 succeeded");
    TEST_ASSERT(ht_size(ht) == 4, "Hash table size is 4");
    TEST_ASSERT(ht_collision_count(ht) >= 1, "Separate chaining collisions tracked (>= 1)");

    /* Search existing */
    MedicineRecord res;
    TEST_ASSERT(ht_search(ht, "med-002", &res) == 1, "Search for med-002 found");
    TEST_ASSERT(strcmp(res.name, "Amoxicillin") == 0, "med-002 name matches Amoxicillin");
    TEST_ASSERT(strcmp(res.brand, "Moxikind") == 0, "med-002 brand matches Moxikind");

    /* Update existing key */
    MedicineRecord m1_updated = m1;
    m1_updated.quantity = 45;
    TEST_ASSERT(ht_insert(ht, "med-001", m1_updated) == 1, "Updating med-001 succeeded");
    TEST_ASSERT(ht_size(ht) == 4, "Size remains 4 after key update");
    ht_search(ht, "med-001", &res);
    TEST_ASSERT(res.quantity == 45, "Updated quantity (45) retrieved correctly");

    /* Delete key */
    TEST_ASSERT(ht_delete(ht, "med-003") == 1, "Delete med-003 succeeded");
    TEST_ASSERT(ht_size(ht) == 3, "Size decreased to 3 after deletion");
    TEST_ASSERT(ht_search(ht, "med-003", &res) == 0, "Search for deleted key med-003 returns 0");
    TEST_ASSERT(ht_delete(ht, "med-003") == 0, "Deleting already deleted key returns 0");

    /* Clear & reuse */
    ht_clear(ht);
    TEST_ASSERT(ht_size(ht) == 0 && ht_collision_count(ht) == 0, "ht_clear freed all nodes");
    TEST_ASSERT(ht_insert(ht, m1.id, m1) == 1 && ht_size(ht) == 1, "Insert after clear works cleanly");

    ht_free(ht);
}

/* --- 3. Linked List Tests --- */
void test_linked_list(void) {
    printf("\n=== RUNNING LINKED LIST TESTS ===\n");

    LinkedList* list = ll_create();
    TEST_ASSERT(list != NULL, "Linked list created successfully");
    TEST_ASSERT(ll_is_empty(list) == 1, "Linked list is initially empty");
    TEST_ASSERT(ll_size(list) == 0, "Initial size is 0");

    MedicineEvent ev1 = {1, "med-001", "CREATED", "2026-10-14T09:00:00Z", "Added via manual entry", 20, 1};
    MedicineEvent ev2 = {2, "med-001", "DOSE_TAKEN", "2026-10-14T12:30:00Z", "Took 1 tablet with water", -1, 1};
    MedicineEvent ev3 = {3, "med-001", "DOSE_TAKEN", "2026-10-14T20:30:00Z", "Took evening tablet", -1, 1};

    ll_append(list, ev1);
    ll_append(list, ev2);
    ll_append(list, ev3);

    TEST_ASSERT(ll_size(list) == 3, "Size is 3 after 3 appends");
    TEST_ASSERT(ll_is_empty(list) == 0, "List is not empty");

    /* Search by action */
    ListNode* found_dose = ll_search_by_action(list, "DOSE_TAKEN");
    TEST_ASSERT(found_dose != NULL && found_dose->data.quantity_delta == -1, "Found DOSE_TAKEN event");

    MedicineEvent matches[5];
    size_t match_count = ll_search_all_by_action(list, "DOSE_TAKEN", matches, 5);
    TEST_ASSERT(match_count == 2, "ll_search_all_by_action found 2 DOSE_TAKEN nodes");

    MedicineEvent node_ev;
    TEST_ASSERT(ll_get_at(list, 1, &node_ev) == 1 && node_ev.event_id == 2, "ll_get_at(1) returned event 2");

    /* Prepend test */
    MedicineEvent ev0 = {0, "med-001", "SCANNED_OCR", "2026-10-14T08:55:00Z", "Draft extracted via package camera", 0, 1};
    ll_prepend(list, ev0);
    TEST_ASSERT(ll_size(list) == 4 && list->head->data.event_id == 0, "Prepend placed event 0 at head");

    /* Delete by ID */
    TEST_ASSERT(ll_delete_by_id(list, 2) == 1 && ll_size(list) == 3, "Deleted event_id 2");
    TEST_ASSERT(ll_delete_by_id(list, 999) == 0, "Deleting missing event_id 999 returns 0");

    /* Clear & reuse */
    ll_clear(list);
    TEST_ASSERT(ll_size(list) == 0 && ll_is_empty(list) == 1, "ll_clear emptied linked list");
    TEST_ASSERT(ll_append(list, ev1) == 1 && ll_size(list) == 1, "Append after ll_clear works cleanly");

    ll_free(list);
}

int main(void) {
    printf("==================================================\n");
    printf("   MEDORA C DATA STRUCTURES ACADEMIC TEST SUITE    \n");
    printf("==================================================\n");

    test_priority_queue();
    test_hash_table();
    test_linked_list();

    printf("\n==================================================\n");
    printf("TEST RESULTS: %d Passed, %d Failed\n", g_tests_passed, g_tests_failed);
    printf("==================================================\n");

    return (g_tests_failed == 0) ? 0 : 1;
}
