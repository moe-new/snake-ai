/* Migrated snapshot: provenance and license in README.md and NOTICES.txt. */
/* C translation of root snake-ai/web/engine/tiled-directed.js.
 * Food-directed BFS, an endpoint cycle certificate, and a retained safe plan.
 * Includes exact/ordered tile merges and odd-board two-variant switching.
 * No local greedy four-edge repair is substituted for the source policy.
 */
#define TS_N 1024
#define TS_PORTS 2048
#define TS_PATH (2*TS_N+4)
typedef struct {int u,v,x,y,left,right;} TSPort;
typedef struct {
    int w,h,n,wrap,translated,phases,a,b,tiles,ports;
    int tile[TS_N],next[2][TS_N],degree[TS_N],road[TS_N][4];
    int bridges[TS_N],bridge_to[TS_N][4],bridge_port[TS_N][4];
    TSPort port[TS_PORTS];
} TSNetwork;
typedef struct {
    int phases,m,active,a,b,gate,join_count,method;
    int cycle[2][TS_N],rank[2][TS_N],joins[TS_PORTS];
} TSLayout;
typedef struct {
    int valid,kind,count,index,has_layout;
    int path[TS_PATH],phase[TS_PATH],mode[TS_PATH];
    TSLayout layout;
} TSPlan;
typedef struct {
    long long bfs_calls,bfs_nodes,certificate_calls,reused,exact_merges,ordered_merges,schemes;
    long long bfs_meals,fallback_meals,bfs_steps,cycle_steps,switches,rebuilds,replans,relaxed_plans;
} TSCounts;
typedef struct {
    const int *body; int length,food,steps,eaten,checked,mode;
    uint32_t rng;long long rng_calls;int native_rng;
    TSLayout layout;TSPlan plan;TSCounts counts;
} TSState;
static TSNetwork ts_net;
static TSState ts_game;
static int ts_required[TS_N],ts_parent[TS_N],ts_successor[TS_N],ts_seen[TS_N],ts_cycle[TS_N];
static unsigned char ts_rank_dsu[TS_N],ts_allowed[TS_PORTS],ts_forced[TS_PORTS];
static int ts_forced_list[TS_PORTS],ts_bucket_count[23],ts_bucket[23][TS_PORTS];
static int ts_prev[TS_N],ts_queue[TS_N],ts_reverse[TS_N],ts_blocked[TS_N];
static int ts_food_path[TS_N],ts_tail_path[TS_N],ts_future[TS_N],ts_history[2*TS_N];
static int ts_sim_queue[3*TS_N+8],ts_sim_body[TS_N],ts_occupied[TS_N];
static TSLayout ts_candidate;

static int ts_cell(int x,int y) {
    if(ts_net.translated)y=(y+ts_net.h-1)%ts_net.h;
    return y*ts_net.w+x;
}
static int ts_bridge(int p,int q) {
    for(int k=0;k<ts_net.bridges[p];++k)if(ts_net.bridge_to[p][k]==q)return ts_net.bridge_port[p][k];
    return -1;
}
static void ts_road_add(int p,int q) {
    for(int k=0;k<ts_net.degree[p];++k)if(ts_net.road[p][k]==q)return;
    gb_require(ts_net.degree[p]<4,"tile road degree");ts_net.road[p][ts_net.degree[p]++]=q;
}
static void ts_port_add(int u,int v,int x,int y) {
    for(int phase=0;phase<ts_net.phases;++phase)if(ts_net.next[phase][u]!=v||ts_net.next[phase][x]!=y)return;
    int id=ts_net.ports++;gb_require(id<TS_PORTS,"tile port capacity");
    ts_net.port[id]=(TSPort){u,v,x,y,ts_net.tile[u],ts_net.tile[x]};
    int from[2]={u,x},to[2]={y,v};
    for(int j=0;j<2;++j) {
        int p=from[j],q=to[j];gb_require(ts_bridge(p,q)<0,"ambiguous tile port");
        int k=ts_net.bridges[p]++;gb_require(k<4,"tile bridge degree");
        ts_net.bridge_to[p][k]=q;ts_net.bridge_port[p][k]=id;ts_road_add(p,q);
    }
}
static void ts_build(int w,int h,int wrap,int translated) {
    gb_require(w>=2&&w<=32&&h>=2&&h<=32,"tile dimensions");
    gb_require(!translated||(wrap&&w%2==0&&h%2==0),"tile graph translation needs even wrap board");
    memset(&ts_net,0,sizeof(ts_net));ts_net.w=w;ts_net.h=h;ts_net.n=w*h;
    ts_net.wrap=wrap;ts_net.translated=translated;ts_net.phases=w%2&&h%2?2:1;ts_net.a=ts_net.b=-1;
    for(int k=0;k<2;++k)for(int p=0;p<ts_net.n;++p)ts_net.next[k][p]=-1;
    for(int y=0;y<h;) {
        int th=h-y==3?3:2;
        for(int x=0;x<w;) {
            int tw=w-x==3?3:2,id=ts_net.tiles++,ring[12],count=0;
            for(int yy=0;yy<th;++yy)for(int xx=0;xx<tw;++xx)ts_net.tile[ts_cell(x+xx,y+yy)]=id;
            if(tw==3&&th==3) {
                const int xx[8]={0,1,2,2,1,1,0,0},yy[8]={0,0,0,1,1,2,2,1};
                ts_net.a=ts_cell(x+1,y+1);ts_net.b=ts_cell(x+2,y+2);
                for(int k=0;k<8;++k)ring[count++]=ts_cell(x+xx[k],y+yy[k]);
            } else {
                for(int xx=0;xx<tw;++xx)ring[count++]=ts_cell(x+xx,y);
                for(int yy=1;yy<th;++yy)ring[count++]=ts_cell(x+tw-1,y+yy);
                for(int xx=tw-2;xx>=0;--xx)ring[count++]=ts_cell(x+xx,y+th-1);
                for(int yy=th-2;yy>0;--yy)ring[count++]=ts_cell(x,y+yy);
            }
            for(int phase=0;phase<ts_net.phases;++phase)for(int k=0;k<count;++k) {
                int p=ring[k],q=ring[(k+1)%count];
                if(phase&&tw==3&&th==3){if(p==ts_net.a)p=ts_net.b;if(q==ts_net.a)q=ts_net.b;}
                ts_net.next[phase][p]=q;
            }
            x+=tw;
        }
        y+=th;
    }
    for(int phase=0;phase<ts_net.phases;++phase)for(int p=0;p<ts_net.n;++p)
        if(ts_net.next[phase][p]>=0)ts_road_add(p,ts_net.next[phase][p]);
    for(int y=0;y<(wrap?h:h-1);++y)for(int x=0;x<(wrap?w:w-1);++x) {
        int p=ts_cell(x,y),q=ts_cell((x+1)%w,y),r=ts_cell(x,(y+1)%h),s=ts_cell((x+1)%w,(y+1)%h);
        if(p==q||p==r||p==s||q==r||q==s||r==s)continue;
        if(ts_net.tile[p]==ts_net.tile[r]&&ts_net.tile[q]==ts_net.tile[s]&&ts_net.tile[p]!=ts_net.tile[q])ts_port_add(p,r,s,q);
        if(ts_net.tile[p]==ts_net.tile[q]&&ts_net.tile[r]==ts_net.tile[s]&&ts_net.tile[p]!=ts_net.tile[r])ts_port_add(q,p,r,s);
    }
    for(int p=0;p<ts_net.n;++p)for(int i=1;i<ts_net.degree[p];++i) {
        int q=ts_net.road[p][i],j=i,qv=p%w==q%w;
        while(j>0) {
            int v=ts_net.road[p][j-1],vv=p%w==v%w;
            if(vv>qv||(vv==qv&&v<q))break;
            ts_net.road[p][j]=v;--j;
        }
        ts_net.road[p][j]=q;
    }
}
static int ts_legal(int p,int q) {
    if(p<0||p>=ts_net.n||q<0||q>=ts_net.n)return 0;
    for(int k=0;k<ts_net.degree[p];++k)if(ts_net.road[p][k]==q)return 1;
    return 0;
}
static int ts_ordered(const int *body,int length,const TSLayout *layout,int active) {
    int span=0;
    for(int i=0;i<length;++i)if(layout->rank[active][body[i]]<0)return 0;
    for(int i=length-1;i>0;--i) {
        int d=(layout->rank[active][body[i-1]]-layout->rank[active][body[i]]+layout->m)%layout->m;
        if(!d)return 0;span+=d;
    }
    return span<layout->m;
}
static void ts_layout_make(TSLayout *out,const int *cycle,int count,int phase,const int *joins,int join_count) {
    memset(out,0,sizeof(*out));out->phases=ts_net.phases;out->m=count;out->active=phase;
    out->a=ts_net.a;out->b=ts_net.b;out->gate=-1;out->join_count=join_count;
    memcpy(out->joins,joins,(size_t)join_count*sizeof(int));
    for(int ph=0;ph<out->phases;++ph) {
        for(int p=0;p<ts_net.n;++p)out->rank[ph][p]=-1;
        for(int i=0;i<count;++i) {
            int p=cycle[i];
            if(ph!=phase){if(phase&&p==out->b)p=out->a;else if(!phase&&p==out->a)p=out->b;}
            out->cycle[ph][i]=p;out->rank[ph][p]=i;
        }
    }
    if(out->a>=0){int at=out->rank[0][out->a];out->gate=out->cycle[0][(at+count-1)%count];}
}
static int ts_find(int p) {
    while(ts_parent[p]!=p){ts_parent[p]=ts_parent[ts_parent[p]];p=ts_parent[p];}return p;
}
static void ts_dsu_init(int phase) {
    for(int i=0;i<ts_net.tiles;++i){ts_parent[i]=i;ts_rank_dsu[i]=0;}
    memcpy(ts_successor,ts_net.next[phase],(size_t)ts_net.n*sizeof(int));
}
static int ts_join(int id,int *joins,int *join_count) {
    TSPort p=ts_net.port[id];int a=ts_find(p.left),b=ts_find(p.right);
    if(a==b)return 0;
    if(ts_rank_dsu[a]<ts_rank_dsu[b]){int t=a;a=b;b=t;}
    ts_parent[b]=a;if(ts_rank_dsu[a]==ts_rank_dsu[b])++ts_rank_dsu[a];
    ts_successor[p.u]=p.y;ts_successor[p.x]=p.v;joins[(*join_count)++]=id;return 1;
}
static int ts_collect_layout(const int *body,int length,int phase,const int *joins,int join_count,TSLayout *out) {
    memset(ts_seen,0,(size_t)ts_net.n*sizeof(int));int p=body[length-1],start=p,count=0;
    while(p>=0&&p<ts_net.n&&!ts_seen[p]){ts_seen[p]=1;ts_cycle[count++]=p;p=ts_successor[p];}
    if(p!=start||count!=ts_net.n-(ts_net.a>=0))return 0;
    ts_layout_make(out,ts_cycle,count,phase,joins,join_count);
    return ts_ordered(body,length,out,phase);
}
static int ts_certify(TSState *state,const int *body,int length,const TSLayout *current,TSLayout *out) {
    ++state->counts.certificate_calls;
    if(current)for(int phase=0;phase<current->phases;++phase)if(ts_ordered(body,length,current,phase)) {
        *out=*current;out->active=phase;out->method=0;++state->counts.reused;return 1;
    }
    for(int p=0;p<ts_net.n;++p)ts_required[p]=-1;
    for(int i=length-1;i>0;--i)ts_required[body[i]]=body[i-1];
    int joins[TS_PORTS];
    for(int phase=0;phase<ts_net.phases;++phase) {
        int bad=0;for(int i=0;i<length;++i)if(ts_net.next[phase][body[i]]<0){bad=1;break;}if(bad)continue;
        memset(ts_forced,0,(size_t)ts_net.ports);int forced_count=0;
        for(int id=0;id<ts_net.ports;++id) {
            TSPort p=ts_net.port[id];ts_allowed[id]=ts_required[p.u]!=p.v&&ts_required[p.x]!=p.y;
        }
        for(int i=length-1;i>0;--i) {
            int p=body[i],q=body[i-1];if(ts_net.next[phase][p]==q)continue;
            int id=ts_bridge(p,q);if(id<0||!ts_allowed[id]){bad=1;break;}
            if(!ts_forced[id]){ts_forced[id]=1;ts_forced_list[forced_count++]=id;}
        }
        if(bad)continue;
        ts_dsu_init(phase);int components=ts_net.tiles,join_count=0;
        for(int i=0;i<forced_count;++i) {
            if(!ts_join(ts_forced_list[i],joins,&join_count)){bad=1;break;}--components;
        }
        if(bad)continue;
        for(int id=0;id<ts_net.ports;++id)if(ts_allowed[id]&&!ts_forced[id])
            components-=ts_join(id,joins,&join_count);
        if(components==1&&ts_collect_layout(body,length,phase,joins,join_count,out)) {
            ++state->counts.exact_merges;return 1;
        }
    }
    for(int phase=0;phase<ts_net.phases;++phase) {
        int bad=0;for(int i=0;i<length;++i)if(ts_net.next[phase][body[i]]<0){bad=1;break;}if(bad)continue;
        for(int scheme=0;scheme<4;++scheme) {
            ++state->counts.schemes;memset(ts_bucket_count,0,sizeof(ts_bucket_count));int gain=scheme<2?8:2;
            for(int id=0;id<ts_net.ports;++id) {
                TSPort p=ts_net.port[id];
                int gained=(ts_required[p.u]==p.y)+(ts_required[p.x]==p.v);
                int lost=(ts_required[p.u]==p.v)+(ts_required[p.x]==p.y),score=gained*gain-lost*3+6;
                gb_require(score>=0&&score<23,"tile bucket score");ts_bucket[score][ts_bucket_count[score]++]=id;
            }
            ts_dsu_init(phase);int components=ts_net.tiles,join_count=0;
            for(int score=22;score>=0;--score)for(int j=0;j<ts_bucket_count[score];++j) {
                int at=scheme%2?ts_bucket_count[score]-1-j:j,id=ts_bucket[score][at];
                components-=ts_join(id,joins,&join_count);
            }
            if(components==1&&ts_collect_layout(body,length,phase,joins,join_count,out)) {
                out->method=1;++state->counts.ordered_merges;return 1;
            }
        }
    }
    return 0;
}
static void ts_check_layout(const TSLayout *layout) {
    gb_require(layout->m==ts_net.n-(ts_net.a>=0),"tile layout size");
    for(int ph=0;ph<layout->phases;++ph) {
        memset(ts_seen,0,(size_t)ts_net.n*sizeof(int));
        for(int i=0;i<layout->m;++i) {
            int p=layout->cycle[ph][i],q=layout->cycle[ph][(i+1)%layout->m];
            gb_require(p>=0&&p<ts_net.n&&!ts_seen[p]&&ts_legal(p,q),"tile layout edge/uniqueness");
            ts_seen[p]=1;gb_require(layout->rank[ph][p]==i,"tile layout rank");
        }
    }
}
static int ts_bfs(TSState *state,int start,int goal,const int *blocked,int *path) {
    ++state->counts.bfs_calls;
    for(int p=0;p<ts_net.n;++p)ts_prev[p]=-2;
    int first=0,last=1;ts_queue[0]=start;ts_prev[start]=-1;
    while(first<last) {
        int p=ts_queue[first++];++state->counts.bfs_nodes;
        if(p==goal) {
            int count=0;for(int q=p;q>=0;q=ts_prev[q])ts_reverse[count++]=q;
            for(int i=0;i<count;++i)path[i]=ts_reverse[count-1-i];return count;
        }
        for(int j=0;j<ts_net.degree[p];++j) {
            int q=ts_net.road[p][j];
            if(ts_prev[q]==-2&&!blocked[q]){ts_prev[q]=p;ts_queue[last++]=q;}
        }
    }
    return 0;
}


static void ts_fallback(TSState *state) {
    TSPlan *plan=&state->plan;plan->valid=1;plan->kind=0;plan->index=0;plan->count=1;plan->path[0]=state->body[0];plan->has_layout=1;
    for(int i=0;i<state->length;++i)ts_sim_queue[i]=state->body[state->length-1-i];
    memset(ts_occupied,0,(size_t)ts_net.n*sizeof(int));
    for(int i=0;i<state->length;++i)ts_occupied[state->body[i]]=1;
    int front=0,last=state->length,active=state->layout.active;
    for(int step=0;step<2*state->layout.m+2;++step) {
        int head=ts_sim_queue[last-1],excluded=state->layout.phases==2?(active?state->layout.a:state->layout.b):-1,next=-1,mode=0;
        if(last-front==ts_net.n-1&&ts_legal(head,state->food)){next=state->food;mode=3;}
        else if(state->food==excluded&&head==state->layout.gate) {
            int length=last-front;
            for(int i=0;i<length;++i)ts_sim_body[i]=ts_sim_queue[last-1-i];
            if(ts_ordered(ts_sim_body,length,&state->layout,1-active)){next=excluded;active=1-active;mode=2;}
        }
        if(next<0)next=state->layout.cycle[active][(state->layout.rank[active][head]+1)%state->layout.m];
        int grows=next==state->food,tail=ts_sim_queue[front];
        gb_require(!ts_occupied[next]||(!grows&&next==tail),"tile fallback collision");
        if(!grows){ts_occupied[tail]=0;++front;}
        ts_sim_queue[last++]=next;ts_occupied[next]=1;
        int at=plan->count-1;plan->phase[at]=active;plan->mode[at]=mode;plan->path[plan->count++]=next;
        if(grows){plan->layout=state->layout;plan->layout.active=active;plan->layout.method=0;return;}
    }
    gb_require(0,"tile fallback exceeded progress bound");
}
static TSPlan *ts_prepare(TSState *state) {
    TSPlan *plan=&state->plan;
    if(plan->valid&&state->checked==state->steps)return plan;
    gb_require(state->food>=0,"tile prepare after win");state->checked=state->steps;
    memset(ts_blocked,0,(size_t)ts_net.n*sizeof(int));
    for(int i=1;i<state->length;++i)ts_blocked[state->body[i]]=1;
    int count=ts_bfs(state,state->body[0],state->food,ts_blocked,ts_food_path);
    if(count&&(!plan->valid||count<plan->count-plan->index)) {
        int history=0;
        for(int i=state->length-1;i>=0;--i)ts_history[history++]=state->body[i];
        for(int i=1;i<count;++i)ts_history[history++]=ts_food_path[i];
        int length=state->length+1;
        for(int i=0;i<length;++i)ts_future[i]=ts_history[history-1-i];
        int full=length==ts_net.n,tail_ok=full,has_layout=0;
        if(!full) {
            memset(ts_blocked,0,(size_t)ts_net.n*sizeof(int));
            for(int i=1;i<length-1;++i)ts_blocked[ts_future[i]]=1;
            tail_ok=ts_bfs(state,ts_future[0],ts_future[length-1],ts_blocked,ts_tail_path)>0;
            if(tail_ok)has_layout=ts_certify(state,ts_future,length,&state->layout,&ts_candidate);
        }
        if(full||has_layout) {
            if(plan->valid)++state->counts.replans;
            if(has_layout&&ts_candidate.method==1)++state->counts.relaxed_plans;
            plan->valid=1;plan->kind=1;plan->index=0;plan->count=count;plan->has_layout=has_layout;
            memcpy(plan->path,ts_food_path,(size_t)count*sizeof(int));
            for(int i=0;i<count-1;++i){plan->phase[i]=state->layout.active;plan->mode[i]=1;}
            if(has_layout){plan->layout=ts_candidate;if(verify)ts_check_layout(&plan->layout);}
            return plan;
        }
    }
    if(plan->valid)return plan;
    ts_fallback(state);return plan;
}

static uint32_t ts_hash_array(const int *data,int count) {
    uint32_t h=2166136261u;
    for(int i=0;i<count;++i)h=(h^(uint32_t)(data[i]+1))*16777619u;return h;
}
static uint32_t ts_hash_layout(const TSLayout *layout) {
    uint32_t h=2166136261u;
    int header[]={layout->phases,layout->m,layout->active,layout->a,layout->b,layout->gate,layout->join_count};
    for(int i=0;i<7;++i)h=(h^(uint32_t)(header[i]+1))*16777619u;
    for(int ph=0;ph<layout->phases;++ph)for(int i=0;i<layout->m;++i)h=(h^(uint32_t)(layout->cycle[ph][i]+1))*16777619u;
    for(int i=0;i<layout->join_count;++i)h=(h^(uint32_t)(layout->joins[i]+1))*16777619u;
    return h;
}
