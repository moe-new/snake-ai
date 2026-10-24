# macOS / Linux. On Windows (MSVC): cl /O2 /std:c17 record.c
CFLAGS ?= -O2

all: record original

record: record.c ../c-original.c compat/windows.h compat/conio.h compat/compat.c
	$(CC) $(CFLAGS) -Icompat record.c compat/compat.c -o $@

# The original reads an unset local in its menu loop; zero-initialised locals keep it running as on Windows.
original: original.c ../c-original.c compat/windows.h compat/conio.h compat/compat.c
	$(CC) $(CFLAGS) -ftrivial-auto-var-init=zero -Icompat original.c compat/compat.c -o $@

clean:
	rm -f record original

.PHONY: all clean
