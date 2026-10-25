/* C port of twanvl/snake CellTreeAgent, MIT; see README.md and NOTICES.txt.
 * Reflect Y to match the common initial body [1,0]. A* tie operations mirror
 * std::priority_queue's Floyd heap (right child chosen on equal keys).
 * The tail variant changes only search occupancy/tree, not real food/body
 * or the exact post-food rollout used for the reachability check. */
#include "snake.h"
#include <limits.h>
#include <stdlib.h>
#include <string.h>
typedef struct{int p,key;} Item;
static int mode,tile[GB_MAX],scan[GB_MAX],tile_count;
static int tree[GB_MAX],future_tree[GB_MAX],mask[GB_MAX],future_mask[GB_MAX],future[GB_MAX];
static int distance_to[GB_MAX],father[GB_MAX],reverse_path[GB_MAX+2],forward[GB_MAX+2];
static int cached[GB_MAX+2],cache_count,seen[GB_MAX],queue[GB_MAX];
static Item heap[4*GB_MAX];static int heap_count;
static long long searches,expanded,detours,cached_steps,no_path,removed_total,removed_max,rollout_rejected;
static long long invalid_detours;
static long long no_path_cached;
static const int directions[4]={GB_DOWN,GB_UP,GB_LEFT,GB_RIGHT}; /* reflected source U,D,L,R */
static void push(Item value){
    int at=heap_count++;gb_require(heap_count<=4*GB_MAX,"Cell heap capacity");
    while(at){int p=(at-1)/2;if(heap[p].key<=value.key)break;heap[at]=heap[p];at=p;}heap[at]=value;
}
static Item pop(void){
    Item result=heap[0],value=heap[--heap_count];int at=0;
    if(!heap_count)return result;
    while(2*at+2<heap_count){
        int child=2*at+2;if(heap[child].key>heap[child-1].key)--child;
        heap[at]=heap[child];at=child;
    }
    if(2*at+1<heap_count){int child=2*at+1;heap[at]=heap[child];at=child;}
    while(at){int parent=(at-1)/2;if(heap[parent].key<=value.key)break;heap[at]=heap[parent];at=parent;}
    heap[at]=value;return result;
}
static void parents(const int *body,int length,int *out){
    for(int i=0;i<tile_count;++i)out[i]=-1;
    int parent=-2;
    for(int i=length-1;i>=0;--i){int cell=tile[body[i]];if(out[cell]==-1)out[cell]=parent;parent=cell;}
}
static int allowed(const Game *g,const int *parents,int p,int q){
    int legal=0;for(int k=0;k<g->road_degree[p];++k)legal|=g->roads[p][k]==q;
    return legal&&(tile[p]==tile[q]||parents[tile[q]]==-1||parents[tile[p]]==tile[q]);
}
static int astar(const Game *g){
    ++searches;heap_count=0;
    for(int p=0;p<g->n;++p){distance_to[p]=INT_MAX;father[p]=-1;}
    int head=g->body[0],goal=g->food;
    distance_to[head]=0;
    push((Item){head,1000*(abs(head%g->w-goal%g->w)+abs(head/g->w-goal/g->w))});
    while(heap_count){
        int p=pop().p;++expanded;if(p==goal)break;
        for(int k=0;k<4;++k){
            int q=gb_offset(g,p,directions[k]);if(q<0||mask[q]||!allowed(g,tree,p,q))continue;
            int penalty=0;if(mode>=2)penalty=tile[q]==tree[tile[p]]?0:tile[p]==tile[q]?499:2400;
            int d=distance_to[p]+1000+penalty;
            if(d<distance_to[q]){
                distance_to[q]=d;father[q]=p;
                int h=1000*(abs(q%g->w-goal%g->w)+abs(q/g->w-goal/g->w));push((Item){q,d+h});
            }
        }
    }
    if(distance_to[goal]==INT_MAX)return 0;
    int count=0;for(int p=goal;p!=head;p=father[p]){gb_require(count<g->n&&p>=0,"Cell A* parent");reverse_path[count++]=p;}
    return count;
}
static int initial(Game *g,int selected){
    mode=selected;cache_count=0;searches=expanded=detours=cached_steps=no_path=removed_total=removed_max=rollout_rejected=invalid_detours=no_path_cached=0;
    tile_count=g->n/4;
    for(int p=0;p<g->n;++p){tile[p]=(p/g->w/2)*(g->w/2)+(p%g->w/2);scan[p]=(g->h-1-p/g->w)*g->w+p%g->w;}
    return 1;
}
static int init_variant(Game *g){return initial(g,2);}
static int init_manhattan(Game *g){return initial(g,4);}
static int fallback(const Game *g){
    if(cache_count){++cached_steps;return cached[--cache_count];}
    for(int k=0;k<4;++k){int q=gb_offset(g,g->body[0],directions[k]);if(q>=0&&!g->occupied[q]&&allowed(g,tree,g->body[0],q))return q;}
    return -1;
}
static int choose(const Game *g){
    if(mode==1&&cache_count){++cached_steps;return cached[--cache_count];}
    memcpy(mask,g->occupied,(size_t)g->n*sizeof(int));
    int removed=mode==4?gt_trim(g,g->body,g->length,mask):0;
    removed_total+=removed;if(removed>removed_max)removed_max=removed;
    parents(g->body,g->length-removed,tree);
    int count=astar(g);
    int length;
    if(!count){
        ++no_path;
        if(cache_count){++no_path_cached;return fallback(g);} /* Upstream keeps INVALID in the path here. */
        /* Literal source's deliberate "pretend we are at the goal" probe.
         * This is an analysis state, never an executed teleport. */
        reverse_path[0]=g->food;count=1;length=g->length+1;
        future[0]=g->food;memcpy(future+1,g->body,(size_t)g->length*sizeof(int));
        memcpy(future_mask,g->occupied,(size_t)g->n*sizeof(int));future_mask[g->food]=1;
    }else{
        forward[0]=g->body[0];for(int i=0;i<count;++i)forward[i+1]=reverse_path[count-1-i];
        length=gt_project(g,forward,count+1,future,future_mask);
    }
    if(!length){++rollout_rejected;return fallback(g);}
    parents(future,length,future_tree);
    memset(seen,0,sizeof(seen));int first=0,last=1;queue[0]=future[0];seen[future[0]]=1;
    while(first<last){int p=queue[first++];
        for(int k=0;k<4;++k){int q=gb_offset(g,p,directions[k]);
            if(q<0||seen[q]||future_mask[q]||!allowed(g,future_tree,p,q))continue;
            seen[q]=1;queue[last++]=q;
        }
    }
    int unreachable=0,nearest=-1,best=INT_MAX;
    for(int i=0;i<g->n;++i){int p=scan[i];if(!future_mask[p]&&!seen[p]){
        unreachable=1;if(distance_to[p]<best){nearest=p;best=distance_to[p];}
    }}
    if(unreachable){
        if(nearest>=0&&nearest!=g->body[0]){
            int p=nearest,head=g->body[0],guard=0;
            while(father[p]!=head){p=father[p];gb_require(p>=0&&++guard<g->n,"Cell detour parent");}
            cache_count=0;++detours;return p;
        }
        if(nearest==g->body[0])++invalid_detours;
        if(cache_count){++cached_steps;return cached[--cache_count];}
    }
    memcpy(cached,reverse_path,(size_t)count*sizeof(int));cache_count=count;
    return cached[--cache_count];
}
static void inspect(FILE *f){
    fprintf(f,"{\"searches\":%lld,\"expanded\":%lld,\"detours\":%lld,\"cached_steps\":%lld,\"no_path\":%lld,\"rollout_rejected\":%lld,\"removed_total\":%lld,\"removed_max\":%lld,\"invalid_detours\":%lld,\"no_path_cached\":%lld}",
        searches,expanded,detours,cached_steps,no_path,rollout_rejected,removed_total,removed_max,invalid_detours,no_path_cached);
}
const Solver twan_variant_solver={"twanvl-cell-variant","twanvl 带权 Cell tree","twanvl/snake MIT; reflected Y","oneway",gb_even,init_variant,choose,NULL,NULL,inspect,NULL};
const Solver twan_manhattan_solver={"twanvl-cell-tail-manhattan","twanvl 带权＋曼哈顿裁尾","project search-only tail ablation","oneway",gb_even,init_manhattan,choose,NULL,NULL,inspect,NULL};

