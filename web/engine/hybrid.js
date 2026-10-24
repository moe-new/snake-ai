(function(root){
  'use strict';
  const api=typeof module!=='undefined'&&module.exports?require('./snake.js'):root.TailSnake;
  function buildCycles(w,h){
    const cell=(x,y)=>y*w+x;
    let c=[],a=-1,b=-1;
    if(w%2&&h%2){
      const add=(x,y)=>c.push(cell(x,y));
      for(let x=0;x<w-3;x+=2){for(let y=1;y<h;y++)add(x,y);for(let y=h-1;y>=1;y--)add(x+1,y);}
      for(let y=1;y<h;y++)add(w-3,y);
      add(w-2,h-1);add(w-2,h-2);add(w-1,h-2);
      for(let j=(h-3)/2;j>=1;j--){add(w-1,2*j);add(w-2,2*j);add(w-2,2*j-1);add(w-1,2*j-1);}
      for(let x=w-1;x>=0;x--)add(x,0);
      a=cell(w-2,h-2);b=cell(w-1,h-1);
    }else{
      // Reserve the top row; transpose when only the height is even.
      const transpose=w%2!==0,W=transpose?h:w,H=transpose?w:h;
      const add=(x,y)=>c.push(transpose?cell(y,x):cell(x,y));
      for(let x=0;x<W;x++){
        if(x%2===0)for(let y=1;y<H;y++)add(x,y);
        else for(let y=H-1;y>=1;y--)add(x,y);
      }
      for(let x=W-1;x>=0;x--)add(x,0);
    }
    // Both controllers start at head 1, tail 0. Orient the cycle 0 -> 1.
    if(c[(c.indexOf(0)+1)%c.length]!==1)c.reverse();
    const start=c.indexOf(0);c=c.slice(start).concat(c.slice(0,start));
    const cycles=a<0?[c]:[c,c.map(p=>p===a?b:p)];
    const maps=cycles.map(c=>{const map=new Int32Array(w*h).fill(-1);c.forEach((p,i)=>map[p]=i);return map;});
    return {cycles,maps,a,b,m:c.length,gate:a<0?-1:c[(c.indexOf(a)-1+c.length)%c.length]};
  }
  class HybridSnake extends api.Snake{
    constructor(width=9,height=9,seed=1,wrap=true,threshold=.65,lookahead=true){
      super(width,height,seed,wrap);
      if(!Number.isFinite(threshold)||threshold<0||threshold>1)throw Error('捷径阈值必须在 0–1 之间');
      Object.assign(this,buildCycles(width,height));this.threshold=threshold;this.active=0;this.switches=0;this.shortcuts=0;this.mode=threshold===0?'hybrid-cycle':'hybrid-ready';
      this.route=[];this.lastSwitch=false;this.lookahead=lookahead;this._planCache=null;
    }
    distance(from,to,active=this.active){const map=this.maps[active];return (map[to]-map[from]+this.m)%this.m;}
    ordered(body=this.body,active=this.active){
      if(body.some(p=>this.maps[active][p]<0))return false;
      let span=0;for(let i=body.length-1;i>0;i--){const d=this.distance(body[i],body[i-1],active);if(!d)return false;span+=d;}
      return span<this.m;
    }
    heuristic(p){
      let dx=Math.abs(p%this.w-this.food%this.w),dy=Math.abs(Math.floor(p/this.w)-Math.floor(this.food/this.w));
      if(this.wrap){dx=Math.min(dx,this.w-dx);dy=Math.min(dy,this.h-dy);}return dx+dy;
    }
    context(){
      const head=this.body[0],tail=this.body.at(-1),excluded=this.cycles.length===2?(this.active===0?this.b:this.a):-1;
      const c=this.cycles[this.active],base=c[(this.maps[this.active][head]+1)%this.m];
      const useShortcut=this.body.length/this.n<this.threshold&&this.food!==excluded;
      const foodDistance=this.distance(head,this.food),tailDistance=this.distance(head,tail);
      const options=useShortcut?this.neighbors(head).filter(p=>p!==this.body[1]&&this.maps[this.active][p]>=0).filter(p=>{
        const d=this.distance(head,p),grow=p===this.food;
        return d>0&&d<=foodDistance&&(d<tailDistance||d===tailDistance&&!grow)&&!(grow?this.body:this.body.slice(0,-1)).includes(p);
      }):[];
      options.sort((a,b)=>this.heuristic(a)-this.heuristic(b)||this.distance(head,b)-this.distance(head,a));
      return {head,excluded,base,useShortcut,foodDistance,tailDistance,options};
    }
    choiceFor(next,context){return {next,active:this.active,mode:this.food===context.excluded?'hybrid-wait':next!==context.base?'hybrid-shortcut':context.useShortcut?'hybrid-forward':'hybrid-cycle'};}
    chooseGreedy(){
      const head=this.body[0],tail=this.body.at(-1),excluded=this.cycles.length===2?(this.active===0?this.b:this.a):-1;
      if(this.body.length===this.n-1&&this.neighbors(head).includes(this.food))return {next:this.food,active:this.active,mode:'hybrid-finish'};
      if(this.food===excluded&&head===this.gate&&this.ordered(this.body,1-this.active))return {next:excluded,active:1-this.active,mode:'hybrid-switch'};
      const context=this.context();return this.choiceFor(context.options[0]??context.base,context);
    }
    trace(first){
      // Roll out on a private body. Stop before spawning the next food: no RNG use.
      const s=Object.assign(Object.create(Object.getPrototypeOf(this)),this,{body:this.body.slice(),route:[],_planCache:null});
      const path=[s.body[0]],actions=[];let p=first;
      for(let i=0;i<2*this.m+2;i++){
        actions.push(p);path.push(p.next);const grow=p.next===s.food;
        s.body.unshift(p.next);s.active=p.active;if(grow)return {first,path,actions,steps:path.length-1};s.body.pop();
        p=s.chooseGreedy();
      }
      throw Error('food rollout exceeded progress bound');
    }
    getPlan(){
      if(this.food===-1)return {first:null,path:[],actions:[],steps:0,options:[]};
      const stamp=[this.steps,this.food,this.body.length,this.body[0],this.active,this.threshold,this.lookahead].join(':');
      if(this._planCache&&this._planCache.stamp===stamp)return this._planCache.plan;
      const first=this.chooseGreedy(),context=this.context();
      const alternatives=this.lookahead&&context.options.length>1&&!['hybrid-finish','hybrid-switch'].includes(first.mode)?context.options.map(next=>this.choiceFor(next,context)):[first];
      const plans=alternatives.map(p=>this.trace(p));
      plans.sort((a,b)=>a.steps-b.steps||this.heuristic(a.first.next)-this.heuristic(b.first.next)||this.distance(context.head,b.first.next)-this.distance(context.head,a.first.next));
      const plan={...plans[0],options:plans.map(p=>({next:p.first.next,steps:p.steps}))};
      this._planCache={stamp,plan};return plan;
    }
    choose(){
      if(this.lookahead&&this.food!==-1&&this.body.length/this.n<this.threshold&&this.context().options.length>1)return this.getPlan().first;
      return this.chooseGreedy();
    }
    explain(){
      const c=this.context(),plan=this.getPlan();
      return [[1,0,'右'],[0,1,'下'],[-1,0,'左'],[0,-1,'上']].map(([dx,dy,direction])=>{
        const p=this.offset(c.head,dx,dy),rollout=plan.options.find(o=>o.next===p);let reason='';
        if(p<0)reason='越界';
        else if(p===this.body[1])reason='蛇颈，不能反向';
        else if((p===this.food?this.body:this.body.slice(0,-1)).includes(p))reason='身体占用';
        else if(p===plan.first.next)reason='选中';
        else if(this.food===c.excluded)reason='先沿环等待安全切换';
        else if(!c.useShortcut)reason='后期关闭捷径，仅沿当前环';
        else if(this.maps[this.active][p]<0)reason='不在当前回路';
        else if(this.distance(c.head,p)>c.foodDistance)reason='沿环会越过食物';
        else if(this.distance(c.head,p)>c.tailDistance||this.distance(c.head,p)===c.tailDistance&&p===this.food)reason='沿环会越过尾巴';
        else reason='安全候选';
        return {direction,cell:p,manhattan:p<0?null:this.heuristic(p),rolloutSteps:rollout?rollout.steps:null,reason};
      });
    }
    plan(){const p=this.getPlan();this.mode=p.first.mode;this.route=p.path.slice();return p.first.next;}
    tick(){
      if(this.dead||this.food===-1)return false;
      const p=this.choose(),grow=p.next===this.food;
      if(!this.neighbors(this.body[0]).includes(p.next)||p.next===this.body[1]||(grow?this.body:this.body.slice(0,-1)).includes(p.next))throw Error('hybrid produced an illegal move');
      this.lastSwitch=p.active!==this.active;
      if(this.lastSwitch)this.switches++;
      else if(p.mode==='hybrid-shortcut')this.shortcuts++;
      this.active=p.active;this.mode=p.mode;this.body.unshift(p.next);
      if(grow){this.eaten++;this.spawn();}else this.body.pop();
      this.steps++;
      if(this.food!==-1&&!this.ordered())throw Error('hybrid cycle order lost');
      this.route=[];this._planCache=null;
      return true;
    }
  }
  function createGame(strategy,w,h,seed,wrap,options={}){
    if(strategy==='bfs-tail'||strategy==='original'){const four=typeof module!=='undefined'&&module.exports?require('./four-way.js'):root.FourWay;return strategy==='bfs-tail'?new four.ShortestTailSnake(w,h,seed,wrap):new four.DetourTailSnake(w,h,seed,wrap);}
    if(strategy==='tiled-simple'){const simple=typeof module!=='undefined'&&module.exports?require('./tiled-simple.js'):root.TiledSimple;return new simple.SimpleTiledSnake(w,h,seed,wrap);}
    if(strategy==='tiled-directed'){const tiled=typeof module!=='undefined'&&module.exports?require('./tiled-directed.js'):root.TiledDirected;return new tiled.TiledDirectedSnake(w,h,seed,wrap);}
    if(strategy==='c-directed'){const c=typeof module!=='undefined'&&module.exports?require('./c-directed.js'):root.CDirected;return new c.CDirectedSnake(w,h,seed,wrap);}
    if(strategy==='adaptive'||strategy==='adaptive-ring'){const adaptive=typeof module!=='undefined'&&module.exports?require('./adaptive.js'):root.AdaptiveSnake;return new adaptive.AdaptiveSnake(w,h,seed,wrap,strategy==='adaptive');}
    if(['bfs-handoff','bfs-always','bfs-always-matched'].includes(strategy)){const handoff=typeof module!=='undefined'&&module.exports?require('./bfs-handoff.js'):root.BfsHandoff;return new handoff.BfsHandoffSnake(w,h,seed,wrap,strategy==='bfs-handoff'?options.switchAt??.65:1,strategy==='bfs-always-matched'?options.switchAt??.65:1);}
    return new HybridSnake(w,h,seed,wrap,strategy==='cycle'?0:.65,strategy!=='hybrid-greedy');
  }
  class Trial{
    constructor(strategy,w,h,seed,wrap,maxSteps=20000,options={}){this.strategy=strategy;this.game=createGame(strategy,w,h,seed,wrap,options);this.maxSteps=maxSteps;this.seen=new Map();this.result=null;this.startLength=this.game.body.length;}
    advance(budget=200){
      const g=this.game;
      for(let i=0;i<budget&&!this.result;i++){
        if(g.food===-1){this.end('won');break;}
        if(g.dead){this.end('dead');break;}
        if(g.steps>=this.maxSteps){this.end('limit');break;}
        // Includes the RNG and cached path: this is an exact deterministic cycle.
        const handoffState=g.phase?[g.phase,g.cycles,g.targetLayout?g.targetLayout.cycles:null,g.targetLayout?g.targetLayout.active:null,g._foodPlan?g._foodPlan.path:null,g._foodPlan?g._foodPlan.actions.map(p=>[p.next,p.active]):null]:null;
        const key=JSON.stringify([g.body,g.food,g.rng,g.mode,g.route,g.active??-1,handoffState,g.stateKey?g.stateKey():null]);
        if(this.seen.has(key)){this.end('cycle',{cycleStart:this.seen.get(key),cycleLength:g.steps-this.seen.get(key)});break;}
        this.seen.set(key,g.steps);
        const length=g.body.length;g.tick();if(g.body.length!==length)this.seen.clear();
      }
      if(!this.result&&g.food===-1)this.end('won');
      return this.result;
    }
    end(status,extra={}){const g=this.game;this.result={strategy:this.strategy,status,steps:g.steps,length:g.body.length,total:g.n,switches:g.switches||0,shortcuts:g.shortcuts||0,...(['bfs-handoff','bfs-always','bfs-always-matched','adaptive','adaptive-ring'].includes(this.strategy)?{bfsMeals:g.bfsMeals,fallbackMeals:g.fallbackMeals,joinStep:g.joinStep,joinLength:g.joinLength,bfsSteps:g.bfsSteps,cycleSteps:g.cycleSteps}:{}),...(['adaptive','adaptive-ring'].includes(this.strategy)?{cycleMeals:g.cycleMeals,shortcutMeals:g.shortcutMeals,layoutRejected:g.layoutRejected}:{}),...(this.strategy==='c-directed'?{foodSteps:g.foodSteps,tailSteps:g.tailSteps,disabledSteps:g.disabledSteps,aiEnabled:g.aiFlag,collision:g.collision}:{}),...(this.strategy==='tiled-directed'?{bfsMeals:g.bfsMeals,fallbackMeals:g.fallbackMeals,bfsSteps:g.bfsSteps,cycleSteps:g.cycleSteps,rebuilds:g.rebuilds,replans:g.replans,relaxedPlans:g.relaxedPlans,tiles:g.tiles.length}:{}),...extra};}
  }
  const exported={HybridSnake,buildCycles,createGame,Trial};
  if(typeof module!=='undefined'&&module.exports)module.exports=exported;else root.HybridSnake=exported;
})(typeof globalThis!=='undefined'?globalThis:this);

