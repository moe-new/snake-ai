#include "snake.h"
#include <string.h>
#include "snake.h"
int gb_verify=1;
static Game game,copy;
int main(void){
    for(int side=10;side<=31;++side){
        gb_init(&game,side,side,1);gb_require(game.body[0]==1&&game.body[1]==0,"initial body");
        gb_require(gb_direction(&game,side*side-1,-1)==-1,"out-of-board sentinel is not an edge");
        copy=game;StepEvent e;
        gb_require(!gb_step(&game,-1,&e),"reject invalid sentinel move");
        gb_require(!memcmp(&game,&copy,sizeof(game)),"invalid move must not mutate game");
        /* A non-growing move may enter the tail that vacates simultaneously. */
        game.food=side+1;gb_require(gb_step(&game,0,&e)&&game.body[0]==0&&game.body[1]==1,"vacating tail");
        game.food=1;copy=game;gb_require(!gb_step(&game,1,&e),"growing move cannot enter occupied tail");
        gb_require(!memcmp(&game,&copy,sizeof(game)),"rejected growth must not mutate state");
    }
    gb_init(&game,6,6,1);
    int body[]={7,8,14,13,12},mask[GB_MAX],result[GB_MAX];
    game.length=5;game.food=35;memset(game.occupied,0,sizeof(game.occupied));
    memcpy(game.body,body,sizeof(body));for(int i=0;i<5;++i)game.occupied[body[i]]=1;
    memcpy(mask,game.occupied,sizeof(mask));copy=game;
    gb_require(gt_trim(&game,body,5,mask)==1,"only provably released suffix may be removed");
    gb_require(!mask[12]&&mask[13],"adjacent second-tail cell is not immediately free");
    gb_require(!memcmp(&game,&copy,sizeof(game)),"search trim must preserve real occupancy and food");
    int bad[]={7,13},valid[]={7,6,12,13};
    gb_require(!gt_project(&game,bad,2,result,mask),"cannot enter second-tail cell on move one");
    gb_require(gt_project(&game,valid,4,result,mask)==5&&result[0]==13,"later arrival may use released body");
    gb_init(&game,6,6,1);game.food=2;int growth[]={1,2};
    gb_require(gt_project(&game,growth,2,result,mask)==3&&result[2]==0,"food growth keeps the old tail");
    int after_food[]={1,2,8};
    gb_require(!gt_project(&game,after_food,3,result,mask),"current-food planning must stop at growth");
    const Solver *agents[]={&fixed_cycle_solver,&oneway_bfs_solver,&tiled_solver,&local_cycle_solver,&guard_solver,&twan_manhattan_solver,&twan_phc_solver,&twan_dhcr_solver,&twan_variant_solver};
    for(int k=0;k<9;++k){gb_init(&game,10,10,1);gb_require(agents[k]->init(&game),"agent init");
        while(game.food>=0&&game.steps<20000){copy=game;int next=agents[k]->choose(&game);gb_require(!memcmp(&game,&copy,sizeof(game)),"choose cannot mutate game");
            StepEvent event;if(!gb_step(&game,next,&event))break;if(agents[k]->after_step)agents[k]->after_step(&game,&event);}
        if(k!=7)gb_require(game.length==game.n,"representative smoke fills board");
    }
    puts("game, tail-release and nine-agent smoke checks passed");return 0;
}
