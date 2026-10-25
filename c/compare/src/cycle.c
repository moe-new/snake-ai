#include "snake.h"
static int fx_cycle[GB_MAX],rank[GB_MAX];
static int fx_init(Game *g){gb_cycle_build(g,fx_cycle,rank);return 1;}
static int fx_choose(const Game *g){return fx_cycle[(rank[g->body[0]]+1)%g->n];}
const Solver fixed_cycle_solver={"fixed-cycle","固定回路","common baseline","cycle",gb_even,fx_init,fx_choose,NULL,NULL,NULL,NULL};

/* Project-specific paired tile-port exchanges, not an upstream Phoenix port. */
#include "snake.h"
#include <stdlib.h>
#include <string.h>
#define verify gb_verify
#include "tile.h"
static int lc_successor[GB_MAX],lc_order[GB_MAX],lc_partners[TS_PORTS][18],lc_partner_count[TS_PORTS],lc_cell_port[GB_MAX];
static long long lc_proposals,lc_accepted,lc_saved_distance;
static int lc_repair_mode;
static int lc_distance(const Game *g,int a,int b){return (lc_order[b]-lc_order[a]+g->n)%g->n;}
static void lc_rank_cycle(const Game *g){
    int p=g->body[0],seen[GB_MAX]={0};for(int i=0;i<g->n;++i){
        if(gb_verify)gb_require(p>=0&&p<g->n&&!seen[p],"repair Hamilton certificate");
        seen[p]=1;lc_order[p]=i;p=lc_successor[p];
    }gb_require(p==g->body[0],"repair cycle closure");
    if(gb_verify)for(int i=1;i<g->length;++i)gb_require(lc_successor[g->body[i]]==g->body[i-1],"repair body continuity");
}
static int lc_init_repair(Game *g,int mode){
    lc_repair_mode=mode;lc_proposals=lc_accepted=lc_saved_distance=0;
    ts_build(g->w,g->h,0,0);
    /* The fixed, local and global controls start with the same full ring. */
    gb_cycle_build(g,ts_cycle,lc_order);
    for(int i=0;i<g->n;++i)lc_successor[ts_cycle[i]]=ts_cycle[(i+1)%g->n];
    lc_rank_cycle(g);for(int p=0;p<g->n;++p)lc_cell_port[p]=-1;
    for(int id=0;id<ts_net.ports;++id){
        TSPort p=ts_net.port[id];lc_cell_port[p.u]=lc_cell_port[p.x]=id;lc_partner_count[id]=0;
        int tx=p.u%g->w/2,ty=p.u/g->w/2;
        /* Same bounded 3x3 tile-port neighborhood for every board size.
         * No toroidal partners at the edges. At most 17 other ports. */
        for(int j=0;j<ts_net.ports;++j)if(j!=id){
            TSPort q=ts_net.port[j];int dx=q.u%g->w/2-tx,dy=q.u/g->w/2-ty;
            if(abs(dx)<=1&&abs(dy)<=1&&lc_partner_count[id]<17)lc_partners[id][lc_partner_count[id]++]=j;
        }
    }return 1;
}
static int lc_toggle(const Game *g,int id,int *source,int *target){
    TSPort p=ts_net.port[id];
    if((g->occupied[p.u]&&p.u!=g->body[0])||(g->occupied[p.x]&&p.x!=g->body[0]))return 0;
    source[0]=p.u;source[1]=p.x;
    if(lc_successor[p.u]==p.v&&lc_successor[p.x]==p.y){target[0]=p.y;target[1]=p.v;}
    else if(lc_successor[p.u]==p.y&&lc_successor[p.x]==p.v){target[0]=p.v;target[1]=p.y;}
    else return 0;
    return 1;
}
static int lc_candidate_distance(const Game *g,const int *source,const int *target){
    for(int i=0;i<4;++i)for(int j=0;j<i;++j)if(source[i]==source[j])return -1;
    int p=g->body[0],total=0,visited=0,food_distance=-1;
    for(int iteration=0;iteration<5;++iteration){
        int chosen=-1,nearest=g->n;
        for(int k=0;k<4;++k){int d=lc_distance(g,p,source[k]);if(d<nearest){chosen=k;nearest=d;}}
        int fd=lc_distance(g,p,g->food);if(food_distance<0&&fd<=nearest)food_distance=total+fd;
        total+=nearest;
        if(visited&(1<<chosen))return source[chosen]==g->body[0]&&total==g->n&&visited==15?food_distance:-1;
        visited|=1<<chosen;++total;p=target[chosen];if(total>g->n)return -1;
    }return -1;
}
static int lc_choose_repair(const Game *g){
    int first=lc_cell_port[g->body[0]],source[4],target[4];if(first<0||!lc_toggle(g,first,source,target))return lc_successor[g->body[0]];
    int old=lc_distance(g,g->body[0],g->food),best=old,bs[4],bt[4];
    int count=lc_repair_mode?ts_net.ports:lc_partner_count[first];
    for(int j=0;j<count;++j){
        int second=lc_repair_mode?j:lc_partners[first][j];if(second==first||!lc_toggle(g,second,source+2,target+2))continue;
        ++lc_proposals;int d=lc_candidate_distance(g,source,target);
        if(d>0&&d<best){best=d;memcpy(bs,source,sizeof(bs));memcpy(bt,target,sizeof(bt));}
    }
    if(best<old){for(int k=0;k<4;++k)lc_successor[bs[k]]=bt[k];++lc_accepted;lc_saved_distance+=old-best;lc_rank_cycle(g);}
    return lc_successor[g->body[0]];
}
static uint64_t lc_repair_fingerprint(void){return gb_hash(lc_successor,ts_net.n,UINT64_C(1469598103934665603));}
static void lc_repair_inspect(FILE *f){fprintf(f,"{\"proposals\":%lld,\"accepted\":%lld,\"saved_distance\":%lld}",lc_proposals,lc_accepted,lc_saved_distance);}

static int lc_init(Game *g){return lc_init_repair(g,0);}
const Solver local_cycle_solver={"local-cycle","局部动态回路","project four-edge repair","oneway",gb_even,lc_init,lc_choose_repair,NULL,lc_repair_fingerprint,lc_repair_inspect,NULL};

/* C port of twanvl/snake PerturbedHamiltonianCycle, pinned ee180ede; MIT.
 * Source coordinates are reflected vertically to fit common body [1,0]. */
#include "snake.h"
static int ph_cycle[GB_MAX],ph_rank[GB_MAX];
static long long ph_shortcuts;
void twan_zigzag(const Game *g,int *next){
    for(int p=0;p<g->n;++p){int x=p%g->w,y=g->h-1-p/g->w,d;
        if(y==0&&x>0)d=GB_LEFT;
        else if(x%2==0)d=y==g->h-1?GB_RIGHT:GB_UP;
        else d=y==1&&x!=g->w-1?GB_RIGHT:GB_DOWN;
        next[p]=gb_offset(g,p,d);gb_require(next[p]>=0,"twan zigzag bounds");
    }
}
static int ph_init(Game *g){
    ph_shortcuts=0;twan_zigzag(g,ph_cycle);int p=(g->h-1)*g->w;
    for(int i=0;i<g->n;++i){ph_rank[p]=i;p=ph_cycle[p];}return 1;
}
static int ph_distance(const Game *g,int a,int b){int d=ph_rank[b]-ph_rank[a];return d>0?d:d+g->n;}
static int ph_choose(const Game *g){
    int head=g->body[0],next=ph_cycle[head],fd=ph_distance(g,head,g->food),td=ph_distance(g,head,g->body[g->length-1]);
    int max=fd<td-3?fd:td-3,best=1;
    if(g->length>g->n*50/100)max=0;
    if(fd<td){--max;if((td-fd)*4>g->n-g->length)max-=10;}
    const int dirs[]={GB_DOWN,GB_UP,GB_LEFT,GB_RIGHT};
    if(max>0)for(int k=0;k<4;++k){int q=gb_offset(g,head,dirs[k]);
        if(q>=0&&!g->occupied[q]){int d=ph_distance(g,head,q);if(d<=max&&d>best){next=q;best=d;}}
    }
    ph_shortcuts+=best>1;return next;
}
static void ph_inspect(FILE *f){fprintf(f,"{\"shortcuts\":%lld}",ph_shortcuts);}
const Solver twan_phc_solver={"twanvl-phc","twanvl PHC","twanvl/snake MIT; reflected Y","four-way",gb_even,ph_init,ph_choose,NULL,NULL,ph_inspect,NULL};

/* Literal default DHCR from twanvl/snake ee180ede; MIT, reflected Y.
 * This is its closed-loop repair, not AlphaPhoenix's full two-stage repair.
 * Undefined no-path input is handled by following the retained cycle. */
#include "snake.h"
#include <string.h>
#include <stdlib.h>
#include <limits.h>
void twan_zigzag(const Game *g,int *next);
typedef struct {int p,key;} dh_Item;
static dh_Item dh_heap[4*GB_MAX];
static int dh_heap_count,dh_cycle[GB_MAX],dh_cycle_distance[GB_MAX],dh_distance_to[GB_MAX],dh_parent[GB_MAX],dh_part[GB_MAX];
static long long dh_searches,dh_expanded,dh_repairs,dh_accepted,dh_no_path;
static void dh_push(dh_Item value){
    int at=dh_heap_count++;gb_require(dh_heap_count<=4*GB_MAX,"DHCR heap capacity");
    while(at){int p=(at-1)/2;if(dh_heap[p].key<=value.key)break;dh_heap[at]=dh_heap[p];at=p;}dh_heap[at]=value;
}
/* Match the original MSVC std::priority_queue's equal-key Floyd heap. */
static dh_Item dh_pop(void){
    dh_Item out=dh_heap[0],value=dh_heap[--dh_heap_count];int at=0;if(!dh_heap_count)return out;
    while(2*at+2<dh_heap_count){int child=2*at+2;if(dh_heap[child].key>dh_heap[child-1].key)--child;dh_heap[at]=dh_heap[child];at=child;}
    if(2*at+1<dh_heap_count){int child=2*at+1;dh_heap[at]=dh_heap[child];at=child;}
    while(at){int p=(at-1)/2;if(dh_heap[p].key<=value.key)break;dh_heap[at]=dh_heap[p];at=p;}dh_heap[at]=value;return out;
}
static void dh_check_cycle(const Game *g){
    int seen[GB_MAX]={0},p=0;
    for(int i=0;i<g->n;++i){gb_require(p>=0&&p<g->n&&!seen[p],"DHCR full cycle");seen[p]=1;
        gb_require(gb_direction(g,p,dh_cycle[p])>=0,"DHCR cycle edge");p=dh_cycle[p];}
    gb_require(p==0,"DHCR closure");
}
static int dh_init(Game *g){dh_searches=dh_expanded=dh_repairs=dh_accepted=dh_no_path=0;twan_zigzag(g,dh_cycle);if(gb_verify)dh_check_cycle(g);return 1;}
static int dh_astar(const Game *g){
    ++dh_searches;int p=g->food,d=g->n-1;
    do{p=dh_cycle[p];dh_cycle_distance[p]=d--;}while(p!=g->food);
    for(int q=0;q<g->n;++q){dh_distance_to[q]=INT_MAX;dh_parent[q]=-1;}
    int head=g->body[0],goal=g->food;dh_distance_to[head]=0;dh_heap_count=0;
    dh_push((dh_Item){head,1000000*(abs(head%g->w-goal%g->w)+abs(head/g->w-goal/g->w))});
    const int dirs[]={GB_DOWN,GB_UP,GB_LEFT,GB_RIGHT};
    while(dh_heap_count){p=dh_pop().p;++dh_expanded;if(p==goal)break;
        for(int k=0;k<4;++k){int q=gb_offset(g,p,dirs[k]);if(q<0||g->occupied[q])continue;
            int cost=dh_distance_to[p]+1000000+dh_cycle_distance[q];
            if(cost<dh_distance_to[q]){dh_distance_to[q]=cost;dh_parent[q]=p;
                int h=1000000*(abs(q%g->w-goal%g->w)+abs(q/g->w-goal/g->w));dh_push((dh_Item){q,cost+h});}
        }
    }
    if(dh_distance_to[goal]==INT_MAX){++dh_no_path;return -1;}
    p=goal;int count=0;while(dh_parent[p]!=head){p=dh_parent[p];gb_require(p>=0&&++count<g->n,"DHCR path parent");}return p;
}
static int dh_repair(const Game *g,int a,int d){
    ++dh_repairs;int b=dh_cycle[a],c=0;while(dh_cycle[c]!=d)++c;
    if(gb_direction(g,b,c)<0)return 0;
    memset(dh_part,0,sizeof(dh_part));for(int p=d;p!=a;p=dh_cycle[p])dh_part[p]=1;dh_part[a]=1;
    for(int x=b;x!=c;x=dh_cycle[x]){int y=dh_cycle[x],xy=gb_direction(g,x,y);
        /* Reflection reverses clockwise and counter-clockwise order. */
        int dirs[]={(xy+3)%4,(xy+1)%4};
        for(int k=0;k<2;++k){int u=gb_offset(g,y,dirs[k]),v=gb_offset(g,x,dirs[k]);
            if(u>=0&&v>=0&&dh_part[u]&&dh_part[v]&&dh_cycle[u]==v&&!g->occupied[u]&&!g->occupied[v]){
                dh_cycle[a]=d;dh_cycle[c]=b;dh_cycle[x]=v;dh_cycle[u]=y;++dh_accepted;if(gb_verify)dh_check_cycle(g);return 1;
            }
        }
    }return 0;
}
static int dh_choose(const Game *g){int next=dh_astar(g),head=g->body[0];if(next>=0&&dh_cycle[head]!=next)dh_repair(g,head,next);return dh_cycle[head];}
static void dh_inspect(FILE *f){fprintf(f,"{\"searches\":%lld,\"expanded\":%lld,\"repairs\":%lld,\"accepted\":%lld,\"no_path_guard\":%lld}",dh_searches,dh_expanded,dh_repairs,dh_accepted,dh_no_path);}
const Solver twan_dhcr_solver={"twanvl-dhcr","twanvl DHCR","twanvl/snake MIT; reflected Y","four-way",gb_even,dh_init,dh_choose,NULL,NULL,dh_inspect,NULL};
