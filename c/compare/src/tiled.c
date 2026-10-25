#include "snake.h"
#include <string.h>
#include <stdlib.h>
#define verify gb_verify
#include "tile.h"
static void sync(const Game *g){ts_game.body=g->body;ts_game.length=g->length;ts_game.food=g->food;ts_game.steps=g->steps;}
static int init(Game *g){
    ts_build(g->w,g->h,0,0);memset(&ts_game,0,sizeof(ts_game));sync(g);ts_game.checked=-1;ts_game.mode=-1;
    return ts_certify(&ts_game,g->body,g->length,NULL,&ts_game.layout);
}
static int choose(const Game *g){sync(g);TSPlan *p=ts_prepare(&ts_game);return p->path[p->index+1];}
static void after(const Game *g,const StepEvent *e){
    TSPlan *p=&ts_game.plan;int at=p->index;
    if(p->phase[at]!=ts_game.layout.active)++ts_game.counts.switches;
    ts_game.layout.active=p->phase[at];ts_game.mode=p->mode[at];
    if(p->kind)++ts_game.counts.bfs_steps;else ++ts_game.counts.cycle_steps;++p->index;
    if(e->grew){
        ++ts_game.eaten;if(p->kind)++ts_game.counts.bfs_meals;else ++ts_game.counts.fallback_meals;
        if(p->has_layout){if(p->kind)++ts_game.counts.rebuilds;ts_game.layout=p->layout;}p->valid=0;
    }sync(g);
}
static uint64_t fingerprint(void){return ts_hash_layout(&ts_game.layout);}
static void inspect(FILE *f){
    fprintf(f,"{\"layout_hash\":%u,\"plan_hash\":%u,\"active\":%d,\"plan_kind\":%d,\"plan_index\":%d,\"bfs_meals\":%lld,\"cycle_meals\":%lld,\"switches\":%lld,\"rebuilds\":%lld,\"replans\":%lld}",
        ts_hash_layout(&ts_game.layout),ts_hash_array(ts_game.plan.path,ts_game.plan.count),ts_game.layout.active,ts_game.plan.kind,ts_game.plan.index,
        ts_game.counts.bfs_meals,ts_game.counts.fallback_meals,ts_game.counts.switches,ts_game.counts.rebuilds,ts_game.counts.replans);
}
const Solver tiled_solver={"tiled-certificate","步步为营／端点回路证书","root tiled-directed.js","tiled",NULL,init,choose,after,fingerprint,inspect,NULL};
