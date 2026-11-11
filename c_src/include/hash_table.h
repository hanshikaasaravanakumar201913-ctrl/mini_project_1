#ifndef HASH_TABLE_H
#define HASH_TABLE_H

#include <stddef.h>

#if defined(_WIN32) && defined(MEDORA_BUILDING_DLL)
  #define MEDORA_API __declspec(dllexport)
#else
  #define MEDORA_API
#endif

/**
 * Hash Table with Separate Chaining for Medicine Record Indexing & Lookup.
 * Key: Medicine ID (string format, e.g. "1" or "med-101").
 * Hash Function: Daniel J. Bernstein's djb2.
 *
 * Operations & Complexities:
 *   - ht_create:           O(k) where k = num_buckets
 *   - ht_insert:           O(1) average, O(n) worst
 *   - ht_search:           O(1) average, O(n) worst
 *   - ht_delete:           O(1) average, O(n) worst
 *   - ht_clear:            O(n + k)
 *   - ht_size:             O(1)
 *   - ht_collision_count:  O(k)
 *   - ht_free:             O(n + k)
 */

typedef struct {
    char id[32];
    char name[64];
    char brand[64];
    char strength[32];
    char dosage_form[32];
    int quantity;
    char expiry_date[12];
    int is_confirmed;
    int household_id;
} MedicineRecord;

typedef struct HashNode {
    char key[32];
    MedicineRecord data;
    struct HashNode* next;
} HashNode;

typedef struct {
    HashNode** buckets;
    size_t num_buckets;
    size_t count;
} HashTable;

MEDORA_API HashTable* ht_create(size_t num_buckets);
MEDORA_API int ht_insert(HashTable* ht, const char* key, MedicineRecord record);
MEDORA_API int ht_search(const HashTable* ht, const char* key, MedicineRecord* out_record);
MEDORA_API int ht_delete(HashTable* ht, const char* key);
MEDORA_API void ht_clear(HashTable* ht);
MEDORA_API size_t ht_size(const HashTable* ht);
MEDORA_API size_t ht_bucket_count(const HashTable* ht);
MEDORA_API size_t ht_collision_count(const HashTable* ht);
MEDORA_API void ht_free(HashTable* ht);

#endif /* HASH_TABLE_H */
