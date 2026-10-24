/* The 2024 program itself, unchanged, for macOS and Linux:
 *   make original    (cc -O2 -ftrivial-auto-var-init=zero -Icompat original.c compat/compat.c -o original)
 * The original reads one local before setting it (`for (int c; c != 27; …)`), which MSVC lets
 * pass and clang's optimiser turns into a trap; zero-initialised locals keep it as it ran.
 * On Windows, build ../c-original.c directly: cl /O2 /std:c17 ..\c-original.c */
#define read original_read   /* its read(min, max) would shadow POSIX read() */
#include "../c-original.c"
