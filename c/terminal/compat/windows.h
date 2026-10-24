/* The few Windows console calls c-original.c makes, for macOS and Linux: cursor moves and
 * colours become ANSI escape codes. Only used when building on a non-Windows system. */
#ifndef COMPAT_WINDOWS_H
#define COMPAT_WINDOWS_H
#include <stdlib.h>   /* c-original.c uses rand, srand and system; windows.h brings them in on Windows */

typedef void *HANDLE;
typedef unsigned short WORD;
typedef unsigned long DWORD;
typedef struct { short X, Y; } COORD;
#define STD_OUTPUT_HANDLE ((DWORD)-11)

HANDLE GetStdHandle(DWORD which);
int SetConsoleOutputCP(unsigned page);
int SetConsoleCursorPosition(HANDLE out, COORD at);
int SetConsoleTextAttribute(HANDLE out, WORD attributes);
void Sleep(DWORD ms);

/* On Windows clock() counts wall-clock milliseconds, which the original's timer relies on;
 * elsewhere it is processor time. And there is no "cls" to run. */
long compat_clock_ms(void);
int compat_system(const char *command);
#define clock() compat_clock_ms()
#define system(command) compat_system(command)

/* The Windows console's 16 colours as ANSI SGR codes: attribute low nibble is the text colour,
 * high nibble the background. */
const char *compat_sgr(WORD attributes);
#endif
