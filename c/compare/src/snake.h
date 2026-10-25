#ifndef SNAKE_H
#define SNAKE_H
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#define GB_MAX 1024
extern int gb_verify;
enum {GB_RIGHT,GB_DOWN,GB_LEFT,GB_UP};
typedef struct {
    int w,h,n,body[GB_MAX],occupied[GB_MAX],length,food,heading;
    int degree[GB_MAX],neighbors[GB_MAX][4],steps,since_food;
    int offsets[GB_MAX][4],road_degree[GB_MAX],roads[GB_MAX][2];
    uint32_t rng;uint64_t trace;unsigned seed;
} Game;
typedef struct {int before_head,next,grew,old_tail;} StepEvent;
void gb_require(int ok,const char *message);
uint32_t gb_random(uint32_t *state);
int gb_offset(const Game *g,int p,int direction);
int gb_direction(const Game *g,int from,int to);
void gb_init(Game *g,int w,int h,unsigned seed);
int gb_step(Game *g,int next,StepEvent *event);
int gb_even(const Game *g);
void gb_oneway(const Game *g,int p,int *out,int *count);
void gb_spawn(Game *g);
uint64_t gb_hash(const int *data,int count,uint64_t h);
double gb_time(void);
int gb_bfs(const Game *g,int start,int goal,const int *blocked,int directed,int *path);
int gb_reachable(const Game *g,int directed,int *food_distance);
void gb_cycle_build(const Game *g,int *cycle,int *rank);
typedef struct Solver {
    const char *id,*label,*source,*moves;
    int (*supports)(const Game *);
    int (*init)(Game *);
    int (*choose)(const Game *);
    void (*after_step)(const Game *,const StepEvent *);
    uint64_t (*fingerprint)(void);
    void (*inspect)(FILE *);
    void (*destroy)(void);
} Solver;
const Solver *gb_solver(const char *id);
const Solver **gb_solvers(int *count);
extern const Solver fixed_cycle_solver,oneway_bfs_solver,tiled_solver,local_cycle_solver,guard_solver;
extern const Solver twan_manhattan_solver,twan_variant_solver,twan_phc_solver,twan_dhcr_solver;
int gt_trim(const Game *g,const int *body,int length,int *mask);
int gt_project(const Game *g,const int *path,int count,int *out_body,int *mask);
void gb_machine(char *out,size_t size);
#endif
