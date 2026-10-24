/* conio.h's kbhit and getch for macOS and Linux: the terminal in raw mode, keys read unechoed. */
#ifndef COMPAT_CONIO_H
#define COMPAT_CONIO_H
int kbhit(void);
int getch(void);
#endif
