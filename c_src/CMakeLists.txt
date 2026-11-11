cmake_minimum_required(VERSION 3.10)
project(MedoraDataStructures C)

set(CMAKE_C_STANDARD 99)

include_directories(include)

set(SOURCES
    src/priority_queue.c
    src/hash_table.c
    src/linked_list.c
)

add_library(medora_ds SHARED ${SOURCES})
target_compile_definitions(medora_ds PRIVATE MEDORA_BUILDING_DLL)

add_executable(test_data_structures tests/test_data_structures.c ${SOURCES})

enable_testing()
add_test(NAME DSUnitTests COMMAND test_data_structures)
