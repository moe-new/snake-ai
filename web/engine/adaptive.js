(function(root){
 'use strict';
 const hybrid=typeof module!=='undefined'&&module.exports?require('./hybrid.js'):root.HybridSnake;
 const handoff=typeof module!=='undefined'&&module.exports?require('./bfs-handoff.js'):root.BfsHandoff;
 const {HybridSnake}=hybrid,{BfsHandoffSnake,fitCycle}=handoff;
 function layoutOf(s,active=s.active){return {cycles:s.cycles,maps:s.maps,m:s.m,a:s.a,b:s.b,gate:s.gate,active};}
 function ringClone(s,body,layout,food,shortcuts=false){
  return Object.assign(Object.create(HybridSnake.prototype),s,layout,{body:body.slice(),food,threshold:shortcuts?1:0,lookahead:shortcuts,_planCache:null,route:[]});
 }
 // A layout heuristic: enumerate empty cells, without reading/spawning future food.
 function meanNextRingDistance(s,body,layout){
  if(body.length===s.n)return 0;
  const occupied=new Set(body),map=layout.maps[layout.active],head=map[body[0]];let total=0;
  for(let p=0;p<s.n;p++)if(!occupied.has(p)){
   if(map[p]>=0&&body.length<s.n-1)total+=(map[p]-head+layout.m)%layout.m;
   else total+=HybridSnake.prototype.getPlan.call(ringClone(s,body,layout,p)).steps;
  }
  return total/(s.n-body.length);
 }
 class AdaptiveSnake extends BfsHandoffSnake{
  constructor(w=9,h=9,seed=1,wrap=true,allowBfs=true){super(w,h,seed,wrap,1,1);this.allowBfs=allowBfs;this.evaluations=[];this.layoutRejected=0;this.cycleMeals=0;this.shortcutMeals=0;}
  prepare(){
   if(this._foodPlan)return this._foodPlan;
   if(this.food===-1)return {path:[],actions:[],steps:0,first:null,options:[],kind:'done'};
   this.lastRejection='';this.targetLayout=null;const candidates=[];
   const add=(plan,body,layout,label)=>{
    const futureMean=meanNextRingDistance(this,body,layout),score=plan.steps+futureMean;
    candidates.push({...plan,layout,label,futureMean,score});
   };
   for(const shortcuts of [false,true]){
    const clone=ringClone(this,this.body,layoutOf(this),this.food,shortcuts),traced=HybridSnake.prototype.getPlan.call(clone);
    const body=this.simulate(traced.path),active=traced.actions.at(-1).active;
    const actions=traced.actions.map(p=>({...p,mode:shortcuts?'adaptive-shortcut':'adaptive-cycle'}));
    add({...traced,actions,first:actions[0],kind:'fallback'},body,layoutOf(this,active),shortcuts?'环序捷径':'纯沿环');
   }
   const path=this.allowBfs?this.bfs(this.body[0],this.food,new Set(this.body.slice(1)),this.body[1]):null;this.lastBfsLength=path?path.length-1:null;
   if(path&&this.body.length<this.n-1)for(const candidate of this.shortestPaths(path)){
    const body=this.simulate(candidate),layout=body&&fitCycle(body,this.w,this.h,this.wrap,this);
    if(layout){const actions=candidate.slice(1).map(next=>({next,active:this.active,mode:'handoff-bfs'}));add({path:candidate,actions,first:actions[0],steps:candidate.length-1,options:[],kind:'bfs'},body,layout,`四向 BFS ${candidates.filter(p=>p.kind==='bfs').length+1}`);}
   }
   candidates.sort((a,b)=>a.score-b.score||a.futureMean-b.futureMean||a.steps-b.steps);
   const chosen=candidates[0];this.evaluations=candidates.map(p=>({label:p.label,steps:p.steps,futureMean:p.futureMean,score:p.score,selected:p===chosen}));
   if(chosen.kind==='bfs')this.targetLayout=chosen.layout;
   else if(candidates.some(p=>p.kind==='bfs')){const bestBfs=candidates.find(p=>p.kind==='bfs');this.lastRejection=bestBfs.score>chosen.score?'BFS 虽能安全接环，但当前步数加吃后空格均距更大':'BFS 与当前方案同分，沿用现有回路，无需重建';this.layoutRejected++;}
   else this.lastRejection=!this.allowBfs?'本模式只比较环序捷径和纯沿环':path?'有限搜索未找到 BFS 吃后接环证书':'当前身体障碍下没有 BFS 食物路线';
   return this._foodPlan=chosen;
  }
  tick(){
   if(this.food===-1||this.dead)return false;
   const plan=this.prepare(),grow=plan.first.next===this.food,mode=plan.first.mode;
   const skip=plan.kind!=='bfs'&&plan.first.active===this.active&&plan.first.next!==this.cycles[this.active][(this.maps[this.active][this.body[0]]+1)%this.m];
   const moved=super.tick();if(skip)this.shortcuts++;
   if(grow&&plan.kind!=='bfs'){if(mode==='adaptive-cycle')this.cycleMeals++;else this.shortcutMeals++;}
   return moved;
  }
 }
 const api={AdaptiveSnake,meanNextRingDistance,layoutOf};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AdaptiveSnake=api;
})(typeof globalThis!=='undefined'?globalThis:this);

