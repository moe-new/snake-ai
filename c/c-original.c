#include <conio.h>
#include <stdio.h>
#include <time.h>
#include <windows.h>

#define MAX_SIZE 0x1000
int width, height, speed, wall, size, l, r, len, head, apple, delta;
int map[MAX_SIZE], queue[MAX_SIZE], input_map[255] = {['a'] = -1, ['d'] = 1};
short COLOR_AIR = 240, COLOR_SNAKE = 192, COLOR_FOOD = 160, COLOR_TEXT = 15;
HANDLE hOut;
COORD coord;
int bfs_q[MAX_SIZE], bfs_m[MAX_SIZE], bfs_f[MAX_SIZE], bfs_p[MAX_SIZE];
int bfs_q_l, bfs_q_r, bfs_p_len = 0, bfs_flag;
void set_brush(int x, int y, short color) {
    coord.X = x, coord.Y = y;
    SetConsoleCursorPosition(hOut, coord);
    SetConsoleTextAttribute(hOut, color);
}
void set_value(int index, short color, int value) {
    set_brush(index % width * 2, index / width, color), printf("  ");
    if (value >= 0) map[index] = value;
}
void new_food() {
    while (map[apple = rand() % size] || apple == head) {}
    set_value(apple, COLOR_FOOD, -1);
}
int get_wall(FILE **f) {
    int c = *f ? fgetc(*f) : '\n';
    return c == '\n' ? -1 : c == EOF ? fclose(*f), *f = NULL, -1 : c == '1';
}
void build() {
    FILE *f_wall = wall ? wall = 0, fopen("WALL.txt", "a+") : NULL;
    size = width * height, input_map['w'] = -width, input_map['s'] = width;
    l = r = head = 0, len = delta = 1, set_brush(0, 0, COLOR_TEXT);
    system("cls"), set_brush(0, 0, COLOR_AIR);
    for (int y = 0, i = 0, x, c; y < height; ++y, printf("\n"))
        for (x = c = 0; ~c && ~(c = get_wall(&f_wall)) || x < width; ++x)
            if (x < width) printf((map[i++] = c == 1) ? wall++, "[]" : "  ");
    for (f_wall &&fclose(f_wall); head < size && map[head] != 0;) head++;
}
void default_config() { width = height = speed = 10, wall = 0; }
void init() {
    if (build(), head >= size || wall >= size - 1) {
        set_brush(0, height, COLOR_TEXT), puts("Init Failed!\nFallback...");
        getch(), default_config(), build();
    }
    set_value(queue[++r] = head, COLOR_SNAKE, 1), new_food();
}
int shift(int i, int d) {
    int y = (i / width + d / width + height) % height;
    return y * width + (i + d + width) % width;
}
int bfs_find(int father, int i) {
    if (bfs_m[i] == 0) bfs_q[++bfs_q_r] = i, bfs_f[i] = father, bfs_m[i] = 1;
    return bfs_flag = bfs_m[i] == -1;
}
void bfs(int start, int end, int path) {
    int i = (bfs_m[end] = -1, bfs_q_l = 0, bfs_q[bfs_q_r = 1] = start);
    while (bfs_q_l < bfs_q_r) {
        i = bfs_q[++bfs_q_l];
        if (bfs_find(i, shift(i, (i % width) % 2 ? width : -width))) break;
        if (bfs_find(i, shift(i, (i / width) % 2 ? 1 : -1))) break;
    }
    if (bfs_flag && path) {
        bfs_p[bfs_p_len = 0] = end;
        while (i != start) bfs_p[++bfs_p_len] = i, i = bfs_f[i];
    }
}
void ai() {
    if (!bfs_flag) return;
    for (int i = 0; i < size; ++i) bfs_m[i] = map[i];
    if (bfs(head, apple, 1), bfs_flag) {
        if (len + 1 >= size - wall) return;
        for (int i = 0; i < size; ++i) bfs_m[i] = map[i];
        for (int i = len < bfs_p_len ? len : bfs_p_len; i > 0; --i) {
            bfs_m[queue[(l + i) % size]] = 0;
            bfs_m[bfs_p[i]] = 1;
        }
        int t = len <= bfs_p_len ? bfs_p[len] : queue[(l + 1 + bfs_p_len) % size];
        if (bfs(apple, t, 0), bfs_flag) return;
    }
    int tail = queue[(l + 1) % size], p, t = -1, tl = -1;
    if (!map[p = shift(head, (head % width) % 2 ? width : -width)]) {
        for (int i = 0; i < size; ++i) bfs_m[i] = map[i];
        if (bfs(p, tail, 1), bfs_flag) t = p, tl = bfs_p_len;
    }
    if (!map[p = shift(head, (head / width) % 2 ? 1 : -1)]) {
        for (int i = 0; i < size; ++i) bfs_m[i] = map[i];
        if (bfs(p, tail, 1), bfs_flag && bfs_p_len > tl) t = p;
    }
    if (t >= 0) bfs_p[bfs_p_len = 0] = t;
    else { bfs(head, tail, 1); }
}
void print_time(int i) {
    set_brush(12, height, COLOR_TEXT);
    printf("Time:%d.%02ds", i / 1000, i % 1000 / 10);
}
void game() {
    for (int st = clock(), et = 0, c; et += 1000 / speed; ai()) {
        if (kbhit() && (c = getch())) {
            if (c == 27) break;
            if (c == ' ') st -= clock(), getch(), st += clock();
            if ((c = input_map[c]) != 0 && delta != -c) delta = c;
        }
        set_value(head, COLOR_SNAKE, -1);
        head = bfs_p_len >= 0 ? bfs_p[bfs_p_len--] : shift(head, delta);
        if (head == apple) ++len >= size - wall ? map[head] = 1 : new_food();
        else { set_value(queue[l = (l + 1) % size], COLOR_AIR, 0); }
        if (map[head]) break;
        set_value(queue[r = (r + 1) % size] = head, COLOR_SNAKE ^ 0x80, 1);
        set_brush(0, height, COLOR_TEXT);
        printf("Score:%d\nhead:(%d,%d) ", len, head % width, head / width);
        printf("food:(%d,%d)    ", apple % width, apple / width);
        for (int i; print_time(i = clock() - st), i < et; Sleep(1)) {}
    }
}
void menu(int color) {
    set_brush(0, height, color);
    printf("Size:%dx%d /Speed:%d(step/s) /", width, height, speed);
    printf("Wall:%d/ AI:%s      \n\n", wall, bfs_flag ? "On" : "Off");
    puts("<Menu>   [Space] Start Game [1] Map Resize  [3] -Speed [5] Refresh");
    puts("           [Esc] Exit Game  [2] Enable Wall [4] +Speed [6] Enable AI");
    puts("<Game> [A/S/D/W] Move     [Esc] Stop    [Space] Pause");
}
int read(int min, int max) {
    int x = 0, c;
    while ('0' <= (c = getchar()) && c <= '9') x = x * 10 + (c - '0');
    return x < min ? min : (x > max ? max : x);
}
int main() {
    hOut = GetStdHandle(STD_OUTPUT_HANDLE), SetConsoleOutputCP(65001);
    srand((unsigned) time(0)), default_config(), init();
    for (int c; c != 27; fflush(stdin), c == '5' ? init() : 0) {
        if (menu(COLOR_TEXT), (c = getch()) == ' ') {
            menu(COLOR_TEXT & 0xf0), game(), c = '5';
            set_brush(0, height + 2, COLOR_TEXT);
            puts(len < size - wall ? "Game over!" : "(´･ω･`)?");
            for (puts("Press [Space] to continue."); getch() != ' ';) {}
        } else if (c == '1') {
            printf("Enter width and height (1x1 ~ 80x48):");
            c = '5', width = read(1, 80), height = read(1, 48);
        }
        if (c == '2') wall = !wall, c = '5';
        if (c == '3' && 1 < speed) speed -= speed > 100 ? 100 : (speed > 10 ? 5 : 1);
        if (c == '4' && speed < 1000) speed += speed >= 100 ? 100 : (speed >= 10 ? 5 : 1);
        if (c == '6') bfs_flag = !bfs_flag;
    }
}