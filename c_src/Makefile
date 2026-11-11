CC ?= gcc
CFLAGS ?= -std=c99 -Wall -Wextra -O2 -I./include
LDFLAGS ?=

SRC = src/priority_queue.c src/hash_table.c src/linked_list.c
TEST_SRC = tests/test_data_structures.c
TEST_BIN = bin/test_data_structures
TEST_EXE = bin/test_data_structures.exe
LIB_SHARED = bin/libmedora_ds.so
LIB_DLL = bin/medora_ds.dll

all: test_bin shared_lib

bin:
	mkdir -p bin

test_bin: bin
ifeq ($(OS),Windows_NT)
	$(CC) $(CFLAGS) $(SRC) $(TEST_SRC) -o $(TEST_EXE)
else
	$(CC) $(CFLAGS) $(SRC) $(TEST_SRC) -o $(TEST_BIN)
endif

shared_lib: bin
ifeq ($(OS),Windows_NT)
	$(CC) $(CFLAGS) -DMEDORA_BUILDING_DLL -shared $(SRC) -o $(LIB_DLL)
else
	$(CC) $(CFLAGS) -fPIC -shared $(SRC) -o $(LIB_SHARED)
endif

run_tests: test_bin
ifeq ($(OS),Windows_NT)
	./$(TEST_EXE)
else
	./$(TEST_BIN)
endif

clean:
	rm -rf bin *.o *.so *.dll *.exe
