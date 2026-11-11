#include "../include/hash_table.h"
#include <stdlib.h>
#include <string.h>

#define DEFAULT_BUCKETS 31

/* djb2 string hashing algorithm */
static unsigned long hash_string(const char* str) {
    unsigned long hash = 5381;
    int c;
    while ((c = (unsigned char)*str++)) {
        hash = ((hash << 5) + hash) + c; /* hash * 33 + c */
    }
    return hash;
}

HashTable* ht_create(size_t num_buckets) {
    HashTable* ht = (HashTable*)malloc(sizeof(HashTable));
    if (!ht) return NULL;

    size_t buckets = (num_buckets > 0) ? num_buckets : DEFAULT_BUCKETS;
    ht->buckets = (HashNode**)calloc(buckets, sizeof(HashNode*));
    if (!ht->buckets) {
        free(ht);
        return NULL;
    }

    ht->num_buckets = buckets;
    ht->count = 0;
    return ht;
}

int ht_insert(HashTable* ht, const char* key, MedicineRecord record) {
    if (!ht || !key) return 0;

    unsigned long h = hash_string(key) % ht->num_buckets;
    HashNode* current = ht->buckets[h];

    /* Check if key already exists, update in place */
    while (current != NULL) {
        if (strcmp(current->key, key) == 0) {
            current->data = record;
            return 1;
        }
        current = current->next;
    }

    /* Key does not exist, insert new node at head of chain */
    HashNode* new_node = (HashNode*)malloc(sizeof(HashNode));
    if (!new_node) return 0;

    strncpy(new_node->key, key, sizeof(new_node->key) - 1);
    new_node->key[sizeof(new_node->key) - 1] = '\0';
    new_node->data = record;
    new_node->next = ht->buckets[h];

    ht->buckets[h] = new_node;
    ht->count++;
    return 1;
}

int ht_search(const HashTable* ht, const char* key, MedicineRecord* out_record) {
    if (!ht || !key) return 0;

    unsigned long h = hash_string(key) % ht->num_buckets;
    HashNode* current = ht->buckets[h];

    while (current != NULL) {
        if (strcmp(current->key, key) == 0) {
            if (out_record) {
                *out_record = current->data;
            }
            return 1;
        }
        current = current->next;
    }

    return 0; /* Not found */
}

int ht_delete(HashTable* ht, const char* key) {
    if (!ht || !key) return 0;

    unsigned long h = hash_string(key) % ht->num_buckets;
    HashNode* current = ht->buckets[h];
    HashNode* prev = NULL;

    while (current != NULL) {
        if (strcmp(current->key, key) == 0) {
            if (prev == NULL) {
                ht->buckets[h] = current->next;
            } else {
                prev->next = current->next;
            }
            free(current);
            ht->count--;
            return 1;
        }
        prev = current;
        current = current->next;
    }

    return 0; /* Key not found */
}

void ht_clear(HashTable* ht) {
    if (!ht || !ht->buckets) return;

    for (size_t i = 0; i < ht->num_buckets; i++) {
        HashNode* current = ht->buckets[i];
        while (current != NULL) {
            HashNode* temp = current;
            current = current->next;
            free(temp);
        }
        ht->buckets[i] = NULL;
    }
    ht->count = 0;
}

size_t ht_size(const HashTable* ht) {
    return ht ? ht->count : 0;
}

size_t ht_bucket_count(const HashTable* ht) {
    return ht ? ht->num_buckets : 0;
}

size_t ht_collision_count(const HashTable* ht) {
    if (!ht || !ht->buckets) return 0;
    size_t collisions = 0;
    for (size_t i = 0; i < ht->num_buckets; i++) {
        HashNode* current = ht->buckets[i];
        size_t bucket_len = 0;
        while (current != NULL) {
            bucket_len++;
            current = current->next;
        }
        if (bucket_len > 1) {
            collisions += (bucket_len - 1);
        }
    }
    return collisions;
}

void ht_free(HashTable* ht) {
    if (!ht) return;
    ht_clear(ht);
    free(ht->buckets);
    free(ht);
}
