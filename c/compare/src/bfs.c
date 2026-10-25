/* Decision-equivalent port of web/engine/c-directed.js, including its latch. */
#include "snake.h"
#include <string.h>
static int ob_scratch[GB_MAX],ob_father[GB_MAX],ob_queue[GB_MAX],ob_stack[GB_MAX+2],ob_top,ob_flag;
static int ob_bfs(const Game *g,int start,int end,int save){
    if(end<0)return ob_flag=0;
    ob_scratch[end]=-1;int last=1,found=start;ob_queue[0]=start;ob_flag=0;
    for(int front=0;front<last&&!ob_flag;++front){
        int p=ob_queue[front],out[2],count;gb_oneway(g,p,out,&count);
        for(int k=0;k<count;++k){int q=out[k];
            if(!ob_scratch[q]){gb_require(last<GB_MAX,"original BFS queue");ob_queue[last++]=q;ob_father[q]=p;ob_scratch[q]=1;}
            ob_flag=ob_scratch[q]==-1;if(ob_flag){found=p;break;}
        }
    }
    if(ob_flag&&save){ob_top=0;ob_stack[0]=end;for(int p=found;p!=start;p=ob_father[p]){
        gb_require(ob_top<g->n,"original BFS predecessor cycle");ob_stack[++ob_top]=p;
    }}
    return ob_flag;
}
static void ob_ai(const Game *g){
    if(!ob_flag)return;
    int head=g->body[0],tail=g->body[g->length-1],length=g->length;
    memcpy(ob_scratch,g->occupied,(size_t)g->n*sizeof(int));ob_bfs(g,head,g->food,1);
    if(ob_flag){
        if(length+1>=g->n)return;
        memcpy(ob_scratch,g->occupied,(size_t)g->n*sizeof(int));
        for(int i=length<ob_top?length:ob_top;i>0;--i){ob_scratch[g->body[length-i]]=0;ob_scratch[ob_stack[i]]=1;}
        int t=length<=ob_top?ob_stack[length]:g->body[length-1-ob_top];
        if(ob_bfs(g,g->food,t,0))return;
    }
    int selected=-1,best=-1,out[2],count;gb_oneway(g,head,out,&count);
    for(int k=0;k<count;++k)if(!g->occupied[out[k]]){
        memcpy(ob_scratch,g->occupied,(size_t)g->n*sizeof(int));ob_bfs(g,out[k],tail,1);
        if(ob_flag&&ob_top>best){selected=out[k];best=ob_top;}
    }
    if(selected>=0){ob_top=0;ob_stack[0]=selected;}
    else ob_bfs(g,head,tail,1); /* Deliberately retain the last scratch map. */
}
int gb_original_init(Game *g){memset(ob_scratch,0,sizeof(ob_scratch));memset(ob_father,0,sizeof(ob_father));memset(ob_stack,0,sizeof(ob_stack));ob_top=-1;ob_flag=1;ob_ai(g);return 1;}
int gb_original_choose(const Game *g){return ob_top>=0?ob_stack[ob_top]:gb_offset(g,g->body[0],GB_RIGHT);}
void gb_original_after(const Game *g,const StepEvent *event){(void)event;if(ob_top>=0)--ob_top;if(g->food>=0)ob_ai(g);}
void gb_original_override(int next){ob_top=0;ob_stack[0]=next;ob_flag=1;}
int gb_original_plan(int *out){for(int i=ob_top;i>=0;--i)out[ob_top-i]=ob_stack[i];return ob_top+1;}
static uint64_t ob_fingerprint(void){uint64_t h=gb_hash(ob_stack,ob_top+1,UINT64_C(1469598103934665603));int d[]={ob_top,ob_flag};return gb_hash(d,2,h);}
const Solver oneway_bfs_solver={"oneway-bfs","单行道 BFS＋追尾","root c-directed.js","oneway",NULL,gb_original_init,gb_original_choose,gb_original_after,ob_fingerprint,NULL,NULL};

#include "snake.h"
#include <string.h>
#include "snake.h"
int gb_original_init(Game *g);int gb_original_choose(const Game *g);
void gb_original_after(const Game *g,const StepEvent *e);void gb_original_override(int next);int gb_original_plan(int *out);
static int rg_blocked[GB_MAX],rg_body[GB_MAX],rg_work[GB_MAX],rg_seen[GB_MAX],rg_plan[GB_MAX+2],rg_relaxed;
static long long rg_checks,rg_risky,rg_overrides,rg_relaxations,rg_no_safe;
typedef struct{int empty,tail;} rg_Flood;
static rg_Flood rg_flood(const Game *g,int head,int tail){
    memset(rg_seen,0,sizeof(rg_seen));int front=0,last=1;rg_work[0]=head;rg_seen[head]=1;
    static int distance[GB_MAX];distance[head]=0;rg_Flood f={0,-1};
    while(front<last){int p=rg_work[front++],out[2],count;gb_oneway(g,p,out,&count);
        for(int k=0;k<count;++k){int q=out[k];if(q==tail&&f.tail<0)f.tail=distance[p]+1;
            if(rg_blocked[q]||rg_seen[q])continue;rg_seen[q]=1;distance[q]=distance[p]+1;rg_work[last++]=q;++f.empty;
        }
    }return f;
}
static int rg_simulate(const Game *g,const int *path,int count,int *length){
    int forward[GB_MAX+2];forward[0]=g->body[0];memcpy(forward+1,path,(size_t)count*sizeof(int));
    *length=gt_project(g,forward,count+1,rg_body,rg_blocked);return *length>0;
}
static int rg_init(Game *g){rg_relaxed=0;rg_checks=rg_risky=rg_overrides=rg_relaxations=rg_no_safe=0;return gb_original_init(g);}
static int rg_choose(const Game *g){
    int base=gb_original_choose(g);if(rg_relaxed)return base;
    if(g->since_food>=2*g->n){rg_relaxed=1;++rg_relaxations;return base;}
    int count=gb_original_plan(rg_plan),length;
    if(count>0&&rg_plan[count-1]==g->food){
        ++rg_checks;int safe=rg_simulate(g,rg_plan,count,&length);
        if(safe&&length<g->n){rg_Flood f=rg_flood(g,rg_body[0],rg_body[length-1]);safe=f.empty==g->n-length&&f.tail>=0;}
        if(safe)return base;++rg_risky;
    }
    int out[2],degree;gb_oneway(g,g->body[0],out,&degree);
    int candidates[3]={base,-1,-1},used=1;for(int k=0;k<degree;++k)if(out[k]!=base)candidates[used++]=out[k];
    int best=-1,missing_best=g->n+1,tail_best=-1;
    for(int k=0;k<used;++k){int q=candidates[k],legal=0;for(int j=0;j<degree;++j)legal|=q==out[j];
        if(!legal||!rg_simulate(g,&q,1,&length))continue;rg_Flood f=rg_flood(g,rg_body[0],rg_body[length-1]);
        int missing=g->n-length-f.empty;if(length<g->n&&f.tail<0)continue;if(q==g->food&&missing>0)continue;
        if(missing<missing_best||(missing==missing_best&&f.tail>tail_best)){best=q;missing_best=missing;tail_best=f.tail;}
    }
    if(best<0){++rg_no_safe;return base;}if(best!=base)++rg_overrides;gb_original_override(best);return best;
}
static void rg_after(const Game *g,const StepEvent *e){if(e->grew)rg_relaxed=0;gb_original_after(g,e);}
static void rg_inspect(FILE *f){fprintf(f,"{\"checks\":%lld,\"risky\":%lld,\"overrides\":%lld,\"relaxations\":%lld,\"no_safe\":%lld}",rg_checks,rg_risky,rg_overrides,rg_relaxations,rg_no_safe);}
const Solver guard_solver={"reachability-guard","单行道 BFS＋空地可达保护","project adaptation","oneway",NULL,rg_init,rg_choose,rg_after,NULL,rg_inspect,NULL};
