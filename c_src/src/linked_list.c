#include "../include/linked_list.h"
#include <stdlib.h>
#include <string.h>

LinkedList* ll_create(void) {
    LinkedList* list = (LinkedList*)malloc(sizeof(LinkedList));
    if (!list) return NULL;
    list->head = NULL;
    list->tail = NULL;
    list->count = 0;
    return list;
}

int ll_append(LinkedList* list, MedicineEvent event) {
    if (!list) return 0;

    ListNode* new_node = (ListNode*)malloc(sizeof(ListNode));
    if (!new_node) return 0;

    new_node->data = event;
    new_node->next = NULL;

    if (list->tail == NULL) {
        list->head = new_node;
        list->tail = new_node;
    } else {
        list->tail->next = new_node;
        list->tail = new_node;
    }

    list->count++;
    return 1;
}

int ll_prepend(LinkedList* list, MedicineEvent event) {
    if (!list) return 0;

    ListNode* new_node = (ListNode*)malloc(sizeof(ListNode));
    if (!new_node) return 0;

    new_node->data = event;
    new_node->next = list->head;
    list->head = new_node;

    if (list->tail == NULL) {
        list->tail = new_node;
    }

    list->count++;
    return 1;
}

ListNode* ll_search_by_action(const LinkedList* list, const char* action) {
    if (!list || !action) return NULL;

    ListNode* current = list->head;
    while (current != NULL) {
        if (strcmp(current->data.action, action) == 0) {
            return current;
        }
        current = current->next;
    }

    return NULL;
}

size_t ll_search_all_by_action(const LinkedList* list, const char* action, MedicineEvent* out_events, size_t max_results) {
    if (!list || !action || !out_events || max_results == 0) return 0;

    size_t found = 0;
    ListNode* current = list->head;
    while (current != NULL && found < max_results) {
        if (strcmp(current->data.action, action) == 0) {
            out_events[found++] = current->data;
        }
        current = current->next;
    }
    return found;
}

int ll_get_at(const LinkedList* list, size_t index, MedicineEvent* out_event) {
    if (!list || !out_event || index >= list->count) return 0;

    ListNode* current = list->head;
    size_t i = 0;
    while (current != NULL && i < index) {
        current = current->next;
        i++;
    }
    if (!current) return 0;
    *out_event = current->data;
    return 1;
}

int ll_delete_by_id(LinkedList* list, int event_id) {
    if (!list || list->head == NULL) return 0;

    ListNode* current = list->head;
    ListNode* prev = NULL;

    while (current != NULL) {
        if (current->data.event_id == event_id) {
            if (prev == NULL) {
                list->head = current->next;
            } else {
                prev->next = current->next;
            }

            if (current == list->tail) {
                list->tail = prev;
            }

            free(current);
            list->count--;
            return 1;
        }
        prev = current;
        current = current->next;
    }

    return 0;
}

void ll_clear(LinkedList* list) {
    if (!list) return;

    ListNode* current = list->head;
    while (current != NULL) {
        ListNode* temp = current;
        current = current->next;
        free(temp);
    }

    list->head = NULL;
    list->tail = NULL;
    list->count = 0;
}

size_t ll_size(const LinkedList* list) {
    return list ? list->count : 0;
}

int ll_is_empty(const LinkedList* list) {
    return (!list || list->count == 0);
}

void ll_free(LinkedList* list) {
    if (!list) return;
    ll_clear(list);
    free(list);
}
