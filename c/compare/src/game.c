#ifndef _WIN32
#define _POSIX_C_SOURCE 200809L
#endif
#include "snake.h"
#include <stdlib.h>
#include <string.h>
void gb_require(int ok,const char *message){if(!ok){fprintf(stderr,"ERROR: %s\n",message);exit(3);}}
uint32_t gb_random(uint32_t *state){uint32_t x=*state;x^=x<<13;x^=x>>17;x^=x<<5;return *state=x;}
uint64_t gb_hash(const int *data,int count,uint64_t h){
    for(int i=0;i<count;++i)h=(h^(uint64_t)(data[i]+1))*UINT64_C(1099511628211);return h;
}
int gb_offset(const Game *g,int p,int d){
    return p>=0&&p<g->n&&d>=0&&d<4?g->offsets[p][d]:-1;
}
int gb_direction(const Game *g,int a,int b){
    if(a<0||a>=g->n||b<0||b>=g->n)return -1;
    for(int d=0;d<4;++d)if(gb_offset(g,a,d)==b)return d;return -1;
}
int gb_even(const Game *g){return !(g->w%2)&&!(g->h%2);}
void gb_oneway(const Game *g,int p,int *out,int *count){
    *count=g->road_degree[p];for(int k=0;k<*count;++k)out[k]=g->roads[p][k];
}
void gb_spawn(Game *g){
    int count=g->n-g->length;if(!count){g->food=-1;return;}
    unsigned at=gb_random(&g->rng)%(unsigned)count;
    for(int p=0;p<g->n;++p)if(!g->occupied[p]&&at--==0){g->food=p;return;}
    gb_require(0,"food sampling");
}
void gb_init(Game *g,int w,int h,unsigned seed){
    gb_require(w>=3&&h>=3&&w*h<=GB_MAX,"board size");memset(g,0,sizeof(*g));
    g->w=w;g->h=h;g->n=w*h;g->seed=seed;g->rng=seed?seed:1;g->length=2;
    g->body[0]=1;g->body[1]=0;g->occupied[0]=g->occupied[1]=1;g->heading=GB_RIGHT;
    for(int p=0;p<g->n;++p){
        int x=p%w,y=p/w;
        g->offsets[p][GB_RIGHT]=x+1<w?p+1:-1;g->offsets[p][GB_DOWN]=y+1<h?p+w:-1;
        g->offsets[p][GB_LEFT]=x>0?p-1:-1;g->offsets[p][GB_UP]=y>0?p-w:-1;
        for(int d=0;d<4;++d){int q=gb_offset(g,p,d);if(q>=0)g->neighbors[p][g->degree[p]++]=q;}
        int vertical=x%2?GB_DOWN:GB_UP,horizontal=y%2?GB_RIGHT:GB_LEFT;
        if(gb_even(g))horizontal=(horizontal+2)%4;
        int a=gb_offset(g,p,vertical),b=gb_offset(g,p,horizontal);
        if(a>=0)g->roads[p][g->road_degree[p]++]=a;if(b>=0)g->roads[p][g->road_degree[p]++]=b;
    }
    gb_spawn(g);g->trace=UINT64_C(1469598103934665603);
}
int gb_step(Game *g,int next,StepEvent *event){
    event->before_head=g->body[0];event->next=next;event->grew=next==g->food;event->old_tail=g->body[g->length-1];
    int direction=gb_direction(g,g->body[0],next);
    if(direction<0)return 0;
    if(g->occupied[next]&&(event->grew||next!=event->old_tail))return 0;
    if(!event->grew)g->occupied[event->old_tail]=0;else ++g->length;
    memmove(g->body+1,g->body,(size_t)(g->length-1)*sizeof(int));g->body[0]=next;g->occupied[next]=1;
    ++g->steps;++g->since_food;g->heading=direction;
    if(event->grew){g->since_food=0;gb_spawn(g);}
    int data[]={next,g->food,g->length};g->trace=gb_hash(data,3,g->trace);return 1;
}
void gb_cycle_build(const Game *g,int *cycle,int *rank){
    gb_require(gb_even(g),"full cycle requires even dimensions");int count=0;
    for(int x=0;x<g->w;++x){
        if(x%2==0)for(int y=1;y<g->h;++y)cycle[count++]=y*g->w+x;
        else for(int y=g->h-1;y>=1;--y)cycle[count++]=y*g->w+x;
    }
    for(int x=g->w-1;x>=0;--x)cycle[count++]=x;
    int zero=0;while(cycle[zero]!=0)++zero;
    if(cycle[(zero+1)%g->n]!=1)for(int a=0,b=g->n-1;a<b;++a,--b){int t=cycle[a];cycle[a]=cycle[b];cycle[b]=t;}
    zero=0;while(cycle[zero]!=0)++zero;int copy[GB_MAX];memcpy(copy,cycle,(size_t)g->n*sizeof(int));
    for(int i=0;i<g->n;++i){cycle[i]=copy[(zero+i)%g->n];rank[cycle[i]]=i;}
}

#ifdef _WIN32
#include <windows.h>
double gb_time(void){static LARGE_INTEGER f;LARGE_INTEGER t;if(!f.QuadPart)QueryPerformanceFrequency(&f);QueryPerformanceCounter(&t);return (double)t.QuadPart/(double)f.QuadPart;}

#else
#include <time.h>
double gb_time(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return (double)t.tv_sec+1e-9*t.tv_nsec;}

#endif

#include "snake.h"
#include <string.h>
static int prev[GB_MAX],queue[GB_MAX],back[GB_MAX];
int gb_bfs(const Game *g,int start,int goal,const int *blocked,int directed,int *path){
    for(int p=0;p<g->n;++p)prev[p]=-2;prev[start]=-1;queue[0]=start;int first=0,last=1;
    while(first<last){
        int p=queue[first++];
        if(p==goal){int count=0;for(int q=p;q>=0;q=prev[q])back[count++]=q;
            if(path)for(int i=0;i<count;++i)path[i]=back[count-1-i];return count;}
        int choices[4],count=0;
        if(directed)gb_oneway(g,p,choices,&count);else{count=g->degree[p];memcpy(choices,g->neighbors[p],(size_t)count*sizeof(int));}
        for(int k=0;k<count;++k){int q=choices[k];if(prev[q]==-2&&(!blocked[q]||q==goal)){prev[q]=p;queue[last++]=q;}}
    }
    return 0;
}
/* Tail is blocked here. A separate call to gb_bfs may allow a tail target. */
int gb_reachable(const Game *g,int directed,int *food_distance){
    for(int p=0;p<g->n;++p)prev[p]=-1;int root=g->body[0];prev[root]=0;queue[0]=root;int first=0,last=1;
    *food_distance=root==g->food?0:-1;
    while(first<last){
        int p=queue[first++],choices[4],count;
        if(directed)gb_oneway(g,p,choices,&count);else{count=g->degree[p];memcpy(choices,g->neighbors[p],(size_t)count*sizeof(int));}
        for(int k=0;k<count;++k){int q=choices[k];if(prev[q]<0&&!g->occupied[q]){
            prev[q]=prev[p]+1;queue[last++]=q;if(q==g->food)*food_distance=prev[q];
        }}
    }
    return last-1;
}

#include <stdlib.h>
int gt_trim(const Game *g,const int *body,int length,int *mask){
    int head=body[0],removed=0;
    for(int i=length-1;i>0;--i){
        int p=body[i],lower=abs(head%g->w-p%g->w)+abs(head/g->w-p/g->w);
        if(length-i>lower)break;
        mask[p]=0;++removed;
    }return removed;
}

/* Exact physical rollout, using a queue rather than shifting L cells per
 * predicted move. Path is forward and includes the initial head. No RNG. */
int gt_project(const Game *g,const int *path,int count,int *out_body,int *mask){
    int history[2*GB_MAX+4],first=0,last=g->length,length=g->length;
    memcpy(mask,g->occupied,(size_t)g->n*sizeof(int));
    for(int i=0;i<length;++i)history[i]=g->body[length-1-i];
    for(int i=1;i<count;++i){
        int p=path[i],grow=p==g->food;
        if(gb_direction(g,history[last-1],p)<0)return 0;
        if(!grow)mask[history[first++]]=0;else ++length;
        if(mask[p])return 0;
        history[last++]=p;mask[p]=1;
        if(grow&&i+1<count)return 0; /* No unmodelled post-food growth. */
    }
    for(int i=0;i<length;++i)out_body[i]=history[last-1-i];
    return length;
}

/* Human-readable host information; no external command or runtime needed. */
#if defined(_MSC_VER) && (defined(_M_X64) || defined(_M_IX86))
#include <intrin.h>
#endif
#if defined(__APPLE__)
#include <sys/sysctl.h>
#endif
void gb_machine(char *out,size_t size){
#if defined(_MSC_VER) && (defined(_M_X64) || defined(_M_IX86))
    int regs[4];__cpuid(regs,(int)0x80000000u);
    if((unsigned)regs[0]>=0x80000004u){char brand[49]={0};for(int i=0;i<3;++i){__cpuid(regs,(int)(0x80000002u+i));memcpy(brand+16*i,regs,16);}snprintf(out,size,"%s",brand);return;}
#elif defined(__APPLE__)
    size_t count=size;if(!sysctlbyname("machdep.cpu.brand_string",out,&count,NULL,0))return;
#endif
    const char *value=getenv("PROCESSOR_IDENTIFIER");snprintf(out,size,"%s",value?value:"native CPU");
}
