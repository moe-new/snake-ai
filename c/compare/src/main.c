#include "snake.h"
#include <string.h>
#include <stdlib.h>
#include <inttypes.h>
#ifdef _WIN32
#include <windows.h>
#endif

static const Solver *list[]={&fixed_cycle_solver,&oneway_bfs_solver,&tiled_solver,&local_cycle_solver,&guard_solver,&twan_manhattan_solver,&twan_phc_solver,&twan_dhcr_solver,&twan_variant_solver};
static const char *labels[]={"固定回路","单行道 BFS＋追尾","步步为营","局部动态回路","BFS＋可达性保护","加权 Cell＋安全尾段裁剪","twanvl PHC","twanvl DHCR","twanvl 加权 Cell"};
const Solver **gb_solvers(int *count){*count=(int)(sizeof(list)/sizeof(list[0]));return list;}
const Solver *gb_solver(const char *id){int count;const Solver **all=gb_solvers(&count);for(int i=0;i<count;++i)if(!strcmp(id,all[i]->id))return all[i];return NULL;}
int gb_verify=0;
static Game game;
static int width=10,height=10,first_seed=1,games=1,repeats=1,step_limit=2000000,stall_factor=8;
typedef struct {const char *status;int steps,length;double seconds;uint64_t trace;} Result;
typedef struct {int full,dead,stall,limit,na,failed;long long steps;double seconds;} Summary;

static void verify_body(void){
    int seen[GB_MAX]={0};
    for(int i=0;i<game.length;++i){int p=game.body[i];gb_require(p>=0&&p<game.n&&!seen[p],"body cell invariant");seen[p]=1;
        if(i)gb_require(gb_direction(&game,p,game.body[i-1])>=0,"body adjacency invariant");}
    for(int p=0;p<game.n;++p)gb_require(seen[p]==game.occupied[p],"occupancy invariant");
    gb_require(game.food<0||(game.food<game.n&&!seen[game.food]),"food invariant");
}
static Result play(const Solver *s,unsigned seed){
    Result r={0};r.status="step-limit";double begin=gb_time();gb_init(&game,width,height,seed);
    if(s->supports&&!s->supports(&game)){r.status="N/A";r.length=game.length;return r;}
    if(!s->init(&game)){r.status="init-failed";r.length=game.length;return r;}
    if(gb_verify)verify_body();
    while(game.food>=0&&game.steps<step_limit){
        if(game.since_food>=stall_factor*game.n){r.status="stall-budget";break;}
        int next=s->choose(&game);StepEvent event;
        if(!gb_step(&game,next,&event)){r.status="dead";break;}
        if(s->after_step)s->after_step(&game,&event);if(gb_verify)verify_body();
    }
    r.seconds=gb_time()-begin;r.steps=game.steps;r.length=game.length;r.trace=game.trace;
    if(game.food<0)r.status="full";if(s->destroy)s->destroy();return r;
}
static void summarize(Summary *s,const Result *r){
    if(!strcmp(r->status,"full")){++s->full;s->steps+=r->steps;s->seconds+=r->seconds;}
    else if(!strcmp(r->status,"dead"))++s->dead;
    else if(!strcmp(r->status,"stall-budget"))++s->stall;
    else if(!strcmp(r->status,"step-limit"))++s->limit;
    else if(!strcmp(r->status,"N/A"))++s->na;else ++s->failed;
}
static int benchmark(int samples){
    int count;const Solver **agents=gb_solvers(&count);gb_require(count==9,"nine representative agents");
    char machine[256];gb_machine(machine,sizeof(machine));
    printf("参考机器：%s\n平均值仅统计吃满局；每项先热身一局。%s\n",machine,gb_verify?"已开启逐步校验，耗时包含校验。":"耗时不含终端输出。");
    for(int board=0;board<3;++board){
        Summary sums[9]={{0}};int n=board==2&&samples>10?10:samples;width=height=board==0?10:board==1?30:31;
        printf("\n%d×%d，种子 %d–%d，每种子一次%s\n",width,height,first_seed,first_seed+n-1,board==2?"（兼容性抽测）":"");fflush(stdout);
        for(int j=0;j<count;++j)play(agents[j],(unsigned)first_seed);
        for(int seed=first_seed;seed<first_seed+n;++seed)for(int j=0;j<count;++j){int k=(j+seed)%count;Result r=play(agents[k],(unsigned)seed);summarize(&sums[k],&r);}
        if(board<2){
            puts("| 算法 | 平均步数 | 参考耗时 ms／局 |\n|---|---:|---:|");
            for(int j=0;j<count;++j){Summary *s=&sums[j];if(s->full)printf("| %s | %.2f | %.2f |\n",labels[j],(double)s->steps/s->full,1000*s->seconds/s->full);else printf("| %s | — | — |\n",labels[j]);}
        }
        for(int j=0;j<count;++j){Summary *s=&sums[j];
            if(board==2&&s->na==n){printf("%s：N/A\n",labels[j]);continue;}
            if(board<2&&s->full==n)continue;
            printf("%s：%d/%d 吃满",labels[j],s->full,n);
            if(s->stall)printf("，%d 局达到无增长预算",s->stall);
            if(s->dead)printf("，%d 局碰撞／非法动作",s->dead);
            if(s->limit)printf("，%d 局达到步数上限",s->limit);
            if(s->failed)printf("，%d 局初始化失败",s->failed);puts("。");
        }
        if(board<2)puts("未单列的策略全部吃满。");
    }
    puts("\n预算停止不证明死循环。结果只打印到终端，不生成文件，也不修改 README。");return 0;
}
static void usage(void){
    puts("snake-compare --bench [--games N]\nsnake-compare --list\nsnake-compare --algorithm ID|all --width N --height N --seed N --games N [--verify] [--trace]");
}
int main(int argc,char **argv){
#ifdef _WIN32
    if(GetFileType(GetStdHandle(STD_OUTPUT_HANDLE))==FILE_TYPE_CHAR)SetConsoleOutputCP(CP_UTF8);
#endif
    const char *selected="all";int batch=0,games_set=0,trace=0;
    for(int i=1;i<argc;++i){
        if(!strcmp(argv[i],"--bench")){batch=1;continue;}
        if(!strcmp(argv[i],"--list")){int count;const Solver **all=gb_solvers(&count);for(int j=0;j<count;++j)printf("%s\t%s\n",all[j]->id,all[j]->source);return 0;}
        if(!strcmp(argv[i],"--verify")){gb_verify=1;continue;}
        if(!strcmp(argv[i],"--trace")){trace=1;continue;}
        if(!strcmp(argv[i],"--help")){usage();return 0;}
        if(i+1>=argc){usage();return 2;}const char *key=argv[i],*value=argv[++i];
        if(!strcmp(key,"--algorithm"))selected=value;
        else if(!strcmp(key,"--width"))width=atoi(value);
        else if(!strcmp(key,"--height"))height=atoi(value);
        else if(!strcmp(key,"--seed"))first_seed=atoi(value);
        else if(!strcmp(key,"--games")){games=atoi(value);games_set=1;}
        else if(!strcmp(key,"--repeats"))repeats=atoi(value);
        else if(!strcmp(key,"--step-limit"))step_limit=atoi(value);
        else if(!strcmp(key,"--stall-factor"))stall_factor=atoi(value);
        else{usage();return 2;}
    }
    gb_require(width>=3&&height>=3&&width<=32&&height<=32&&width*height<=GB_MAX,"dimensions must be 3..32");
    gb_require(games>0&&repeats>0&&first_seed>0&&stall_factor>0&&step_limit>0,"positive run parameters");
    if(batch)return benchmark(games_set?games:100);
    gb_require(!strcmp(selected,"all")||gb_solver(selected),"unknown algorithm");
    int count;const Solver **all=gb_solvers(&count);
    if(!gb_verify)for(int j=0;j<count;++j)if(!strcmp(selected,"all")||!strcmp(selected,all[j]->id))play(all[j],(unsigned)first_seed);
    printf("algorithm seed status steps length ms%s\n",trace?" trace":"");
    for(int rep=0;rep<repeats;++rep)for(int seed=first_seed;seed<first_seed+games;++seed)for(int j=0;j<count;++j){
        const Solver *s=all[(j+seed+rep)%count];if(strcmp(selected,"all")&&strcmp(selected,s->id))continue;
        Result r=play(s,(unsigned)seed);printf("%s %d %s %d %d %.3f",s->id,seed,r.status,r.steps,r.length,1000*r.seconds);
        if(trace)printf(" %016" PRIx64,r.trace);putchar('\n');fflush(stdout);
    }return 0;
}
