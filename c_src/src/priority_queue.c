#include "../include/priority_queue.h"
#include <stdlib.h>
#include <string.h>

#define DEFAULT_CAPACITY 16

static void swap_events(ExpiryEvent* a, ExpiryEvent* b) {
    ExpiryEvent temp = *a;
    *a = *b;
    *b = temp;
}

static void heapify_up(PriorityQueue* pq, size_t index) {
    while (index > 0) {
        size_t parent = (index - 1) / 2;
        if (pq->items[index].days_until_expiry < pq->items[parent].days_until_expiry) {
            swap_events(&pq->items[index], &pq->items[parent]);
            index = parent;
        } else {
            break;
        }
    }
}

static void heapify_down(PriorityQueue* pq, size_t index) {
    size_t smallest = index;
    while (1) {
        size_t left = 2 * index + 1;
        size_t right = 2 * index + 2;

        if (left < pq->size && pq->items[left].days_until_expiry < pq->items[smallest].days_until_expiry) {
            smallest = left;
        }
        if (right < pq->size && pq->items[right].days_until_expiry < pq->items[smallest].days_until_expiry) {
            smallest = right;
        }

        if (smallest != index) {
            swap_events(&pq->items[index], &pq->items[smallest]);
            index = smallest;
        } else {
            break;
        }
    }
}

PriorityQueue* pq_create(size_t initial_capacity) {
    PriorityQueue* pq = (PriorityQueue*)malloc(sizeof(PriorityQueue));
    if (!pq) return NULL;

    size_t cap = (initial_capacity > 0) ? initial_capacity : DEFAULT_CAPACITY;
    pq->items = (ExpiryEvent*)malloc(sizeof(ExpiryEvent) * cap);
    if (!pq->items) {
        free(pq);
        return NULL;
    }
    pq->size = 0;
    pq->capacity = cap;
    return pq;
}

int pq_insert(PriorityQueue* pq, ExpiryEvent event) {
    if (!pq) return 0;

    if (pq->size >= pq->capacity) {
        size_t new_cap = pq->capacity * 2;
        ExpiryEvent* new_items = (ExpiryEvent*)realloc(pq->items, sizeof(ExpiryEvent) * new_cap);
        if (!new_items) return 0;
        pq->items = new_items;
        pq->capacity = new_cap;
    }

    pq->items[pq->size] = event;
    heapify_up(pq, pq->size);
    pq->size++;
    return 1;
}

int pq_peek(const PriorityQueue* pq, ExpiryEvent* out_event) {
    if (!pq || pq->size == 0) return 0;
    if (out_event) {
        *out_event = pq->items[0];
    }
    return 1;
}

int pq_extract_min(PriorityQueue* pq, ExpiryEvent* out_event) {
    if (!pq || pq->size == 0) return 0;

    if (out_event) {
        *out_event = pq->items[0];
    }

    pq->items[0] = pq->items[pq->size - 1];
    pq->size--;

    if (pq->size > 0) {
        heapify_down(pq, 0);
    }

    return 1;
}

void pq_build_heap(PriorityQueue* pq, ExpiryEvent* events, size_t count) {
    if (!pq || !events || count == 0) return;

    if (count > pq->capacity) {
        ExpiryEvent* new_items = (ExpiryEvent*)realloc(pq->items, sizeof(ExpiryEvent) * count * 2);
        if (!new_items) return;
        pq->items = new_items;
        pq->capacity = count * 2;
    }

    memcpy(pq->items, events, sizeof(ExpiryEvent) * count);
    pq->size = count;

    if (pq->size > 1) {
        for (int i = (int)(pq->size / 2) - 1; i >= 0; i--) {
            heapify_down(pq, (size_t)i);
        }
    }
}

int pq_get_at(const PriorityQueue* pq, size_t index, ExpiryEvent* out_event) {
    if (!pq || index >= pq->size || !out_event) return 0;
    *out_event = pq->items[index];
    return 1;
}

int pq_remove_by_medicine(PriorityQueue* pq, int medicine_id, const char* event_type) {
    if (!pq || pq->size == 0) return 0;

    size_t removed = 0;
    size_t write_idx = 0;
    for (size_t i = 0; i < pq->size; i++) {
        int match_med = (pq->items[i].medicine_id == medicine_id);
        int match_type = (event_type == NULL || event_type[0] == '\0' || strcmp(pq->items[i].event_type, event_type) == 0);
        if (match_med && match_type) {
            removed++;
        } else {
            if (write_idx != i) {
                pq->items[write_idx] = pq->items[i];
            }
            write_idx++;
        }
    }

    pq->size = write_idx;
    if (removed > 0 && pq->size > 1) {
        for (int i = (int)(pq->size / 2) - 1; i >= 0; i--) {
            heapify_down(pq, (size_t)i);
        }
    }
    return (int)removed;
}

void pq_clear(PriorityQueue* pq) {
    if (!pq) return;
    pq->size = 0;
}

size_t pq_size(const PriorityQueue* pq) {
    return pq ? pq->size : 0;
}

int pq_is_empty(const PriorityQueue* pq) {
    return (!pq || pq->size == 0);
}

void pq_free(PriorityQueue* pq) {
    if (pq) {
        if (pq->items) {
            free(pq->items);
        }
        free(pq);
    }
}
