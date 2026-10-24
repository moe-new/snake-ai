/* 32×32 snake in the terminal, played by the 2024 AI in ../c-original.c, which is compiled in
 * unchanged. For screen recording and timing: no speed limit, the board drawn at most 60 times a
 * second (or after every step with --every), the time each game takes shown as it runs.
 *
 *   macOS / Linux:  make record      (cc -O2 -Icompat record.c compat/compat.c -o record)
 *   Windows (MSVC): cl /O2 /std:c17 record.c
 *
 *   ./record                  one game from seed 1; any key starts it, Esc or q quits
 *   ./record --games 50       fifty games in a row, seeds 1, 2, 3, …
 *   ./record --every          draw after every step (much slower: the terminal is the limit)
 *   ./record --headless --games 5    no drawing; one line per game on stderr
 *   ./record --headless --size 8 --games 1000    the same on 8×8, to time one step
 * Other options: --seed N (first seed), --size N (side of the board, 2–64, default 32),
 * --gap S (seconds to show a full board, default 0), --now (start without waiting for a key). */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define main original_main   /* the original's own menu and game loop are not used */
#define read original_read   /* its read(min, max) would shadow POSIX read() */
#include "../c-original.c"
#undef main
#undef read

#ifdef _WIN32
static double now(void) { LARGE_INTEGER f, t; QueryPerformanceFrequency(&f); QueryPerformanceCounter(&t); return (double)t.QuadPart / f.QuadPart; }
#else
static double now(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec + t.tv_nsec * 1e-9; }
#endif

#ifdef _WIN32
static void show_cursor(int on) { CONSOLE_CURSOR_INFO c = {1, on}; SetConsoleCursorInfo(hOut, &c); }
#else
static void show_cursor(int on) { printf(on ? "\033[0m\033[?25h" : "\033[?25l"); }   /* and the colours back to the terminal's */
#endif

/* The food: MSVC's rand(), so a seed plays the same game on every system. */
static unsigned lcg;
static void place_food(void) {
    do lcg = lcg * 214013u + 2531011u; while (map[apple = (lcg >> 16 & 0x7fff) % size] || apple == head);
}

/* A new game, set up as the original's init() leaves it, with the AI on. */
static void new_game(unsigned seed, int side) {
    width = height = side, size = width * height, wall = 0;
    memset(map, 0, sizeof map), memset(bfs_p, 0, sizeof bfs_p);
    l = head = 0, r = 1, len = delta = 1, queue[r] = head, map[head] = 1;
    bfs_p_len = 0, bfs_flag = 1, lcg = seed;
    place_food();
}

/* One move, as in the original's game() without the drawing; 0 once the game is over. */
static int step(void) {
    head = bfs_p_len >= 0 ? bfs_p[bfs_p_len--] : shift(head, delta);
    if (head == apple) ++len >= size - wall ? map[head] = 1 : (place_food(), 0);
    else map[queue[l = (l + 1) % size]] = 0;
    if (map[head]) return 0;
    map[queue[r = (r + 1) % size] = head] = 1;
    ai();
    return 1;
}

/* The board in the original's colours, redrawing only the cells that changed. */
static short shown[MAX_SIZE];
static void draw(const char *status1, const char *status2) {
    for (int p = 0; p < size; ++p) {
        short c = p == head ? COLOR_SNAKE ^ 0x80 : p == apple && len < size ? COLOR_FOOD : map[p] ? COLOR_SNAKE : COLOR_AIR;
        if (shown[p] != c) set_brush(p % width * 2, p / width, c), printf("  "), shown[p] = c;
    }
    set_brush(0, height, COLOR_TEXT), printf("%-64s", status1);
    set_brush(0, height + 1, COLOR_TEXT), printf("%-64s", status2);
    set_brush(0, height + 2, COLOR_TEXT), printf("%-64s", "[Esc] quit");
    fflush(stdout);
}

int main(int argc, char **argv) {
    unsigned seed = 1;
    int games = 1, every = 0, headless = 0, wait = 1, side = 32;
    double gap = 0;
    for (int i = 1; i < argc; ++i) {
        if (!strcmp(argv[i], "--every")) every = 1;
        else if (!strcmp(argv[i], "--headless")) headless = 1;
        else if (!strcmp(argv[i], "--now")) wait = 0;
        else if (!strcmp(argv[i], "--seed") && i + 1 < argc) seed = (unsigned)strtoul(argv[++i], NULL, 10);
        else if (!strcmp(argv[i], "--games") && i + 1 < argc) games = atoi(argv[++i]);
        else if (!strcmp(argv[i], "--size") && i + 1 < argc && (side = atoi(argv[++i])) >= 2 && side <= 64) {}
        else if (!strcmp(argv[i], "--gap") && i + 1 < argc) gap = atof(argv[++i]);
        else { fprintf(stderr, "usage: record [--seed N] [--games N] [--size N] [--every] [--headless] [--gap S] [--now]\n"); return 2; }
    }
    hOut = GetStdHandle(STD_OUTPUT_HANDLE), SetConsoleOutputCP(65001);
    if (!headless) system("cls"), show_cursor(0);
    char s1[96], s2[96], (*results)[96] = calloc(games > 0 ? games : 1, 96);   /* one line per game */
    int won = 0, quit = 0, done = 0;
    double total = 0;
    for (int g = 0; g < games && !quit; ++g, ++seed) {
        new_game(seed, side);
        long long steps = 0, frames = 0;
        if (!headless && g == 0 && wait) {   /* repaint after the key, in case the window was resized meanwhile */
            snprintf(s1, sizeof s1, "Size:%dx%d  AI:On", width, height);
            draw(s1, "Press any key to start"), quit = getch() == 27;
            system("cls"), memset(shown, 0, sizeof shown);
        }
        double t0 = now(), next = 0;
        for (int going = 1; going && !quit; ) {
            going = step(), ++steps;
            if (headless) continue;
            double t = now();
            if (!every && going && t < next) continue;   /* at most 60 frames a second */
            t -= t0;
            snprintf(s1, sizeof s1, "Size:%dx%d  Seed:%u  Game:%d/%d  Score:%d/%d", width, height, seed, g + 1, games, len, size);
            snprintf(s2, sizeof s2, "Steps:%lld  Time:%.3fs  Won:%d  Total:%.3fs", steps, t, won + (len == size && !going), total + t);
            draw(s1, s2), ++frames;
            next = now() + 1.0 / 60;
            if (kbhit()) { int c = getch(); quit = c == 27 || c == 'q'; }
        }
        double seconds = now() - t0;
        if (quit) break;
        won += len == size, total += seconds;
        snprintf(results[done++], 96, "game=%d seed=%u seconds=%.6f steps=%lld length=%d won=%d frames=%lld", g + 1, seed, seconds, steps, len, len == size, frames);
        if (headless) fprintf(stderr, "%s\n", results[done - 1]);
        if (!headless && gap > 0) Sleep((DWORD)(gap * 1000));
    }
    if (!headless) {   /* the results, then the prompt, under the status lines */
        set_brush(0, height + 3, COLOR_TEXT), show_cursor(1), fflush(stdout);
        for (int g = 0; g < done; ++g) fprintf(stderr, "%s\n", results[g]);
    }
    free(results);
    return quit ? 1 : 0;
}
