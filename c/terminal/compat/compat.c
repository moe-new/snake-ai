/* The Windows console calls of compat/windows.h and compat/conio.h, on a POSIX terminal. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <termios.h>
#include <time.h>
#include <unistd.h>
#include <sys/select.h>
#include "windows.h"
#undef clock
#undef system

HANDLE GetStdHandle(DWORD which) { (void)which; return stdout; }
int SetConsoleOutputCP(unsigned page) { (void)page; return 1; }   /* the terminal is UTF-8 already */

int SetConsoleCursorPosition(HANDLE out, COORD at) {
    fprintf((FILE *)out, "\033[%d;%dH", at.Y + 1, at.X + 1);
    return 1;
}

const char *compat_sgr(WORD attributes) {
    static const int ansi[8] = {0, 4, 2, 6, 1, 5, 3, 7};   /* Windows order: black blue green cyan red magenta yellow white */
    static char code[24];
    int fg = attributes & 15, bg = attributes >> 4 & 15;
    snprintf(code, sizeof code, "\033[%d;%dm", (fg & 8 ? 90 : 30) + ansi[fg & 7], (bg & 8 ? 100 : 40) + ansi[bg & 7]);
    return code;
}
int SetConsoleTextAttribute(HANDLE out, WORD attributes) { fputs(compat_sgr(attributes), (FILE *)out); return 1; }

void Sleep(DWORD ms) { fflush(stdout); usleep(ms * 1000); }

long compat_clock_ms(void) {
    struct timespec now;
    clock_gettime(CLOCK_MONOTONIC, &now);
    return now.tv_sec * 1000L + now.tv_nsec / 1000000L;
}

int compat_system(const char *command) {
    if (!strcmp(command, "cls")) { fputs("\033[0m\033[2J\033[H", stdout); return 0; }
    return system(command);
}

/* Raw mode from the first key read until exit. */
static struct termios saved;
static int raw;
static void restore(void) { tcsetattr(STDIN_FILENO, TCSANOW, &saved); fputs("\033[0m\033[?25h", stdout); fflush(stdout); }
static void enter_raw(void) {
    if (raw || !isatty(STDIN_FILENO)) return;
    struct termios t;
    tcgetattr(STDIN_FILENO, &saved); t = saved;
    t.c_lflag &= ~(ICANON | ECHO); t.c_cc[VMIN] = 1; t.c_cc[VTIME] = 0;
    tcsetattr(STDIN_FILENO, TCSANOW, &t);
    raw = 1; atexit(restore);
}
int kbhit(void) {
    enter_raw(); fflush(stdout);
    fd_set in; FD_ZERO(&in); FD_SET(STDIN_FILENO, &in);
    struct timeval none = {0, 0};
    return select(STDIN_FILENO + 1, &in, NULL, NULL, &none) > 0;
}
int getch(void) {
    unsigned char c;
    enter_raw(); fflush(stdout);
    return read(STDIN_FILENO, &c, 1) == 1 ? c : 27;
}
