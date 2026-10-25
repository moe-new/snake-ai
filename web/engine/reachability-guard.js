(function(root){
 'use strict';
 const node=typeof module!=='undefined'&&module.exports;
 const c=node?require('./c-directed.js'):root.CDirected,roll=node?require('./rollout.js'):root.Rollout;
 // 可达保护: the C rule (c-directed.js) with one more test, translated from c/compare/src/bfs.c.
 // Before following a road to the food, eat in imagination and flood the roads from the new
 // head: every empty cell, and the tail, must still be reached. If not (or when the C rule is
 // only following its tail), take whichever exit leaves the fewest empty cells cut off, the
 // tail furthest away on a tie. After 2 × cells moves without a meal the test is dropped
 // until the next one, so the guard cannot hold the snake in a loop for ever.
 class GuardSnake extends c.CDirectedSnake{
  constructor(w=9,h=9,seed=1,wrap=false){
   super(w,h,seed,wrap);this.roads=Array.from({length:this.n},(_,p)=>this.directedNeighbors(p));
   this.sinceFood=0;this.relaxed=false;this._decision=null;this._decidedAt=-1;
   this.checks=0;this.risky=0;this.overrides=0;this.relaxations=0;this.noSafe=0;
  }
  // From the head along the roads through cells not in `mask`: how many empty cells, how many
  // moves to the tail (-1 if none), and which cells were reached.
  flood(mask,head,tail){
   const seen=new Uint8Array(this.n),distance=new Int32Array(this.n),queue=[head];seen[head]=1;let empty=0,toTail=-1;
   for(let i=0;i<queue.length;i++){const p=queue[i];for(const q of this.roads[p]){
    if(q===tail&&toTail<0)toTail=distance[p]+1;
    if(mask[q]||seen[q])continue;seen[q]=1;distance[q]=distance[p]+1;queue.push(q);empty++;
   }}
   return {empty,tail:toTail,seen};
  }
  // This move, worked out once per step without changing anything.
  decide(){
   if(this._decision&&this._decidedAt===this.steps)return this._decision;
   const n=this.n,head=this.body[0],base=this.nextCell(),d={next:base,kind:'base',base};
   this._decidedAt=this.steps;this._decision=d;
   if(this.relaxed){d.kind='relaxed';return d;}
   if(this.sinceFood>=2*n){d.kind='relax';d.relax=true;return d;}
   const plan=this.stackLen>=0?this.bufferedPath():[];
   if(plan.length&&plan.at(-1)===this.food){
    d.checked=true;d.route=[head,...plan];
    const r=roll.project(this,d.route);let safe=!!r;
    if(r&&r.body.length<n){const f=this.flood(r.mask,r.body[0],r.body.at(-1));d.cutOff=n-r.body.length-f.empty;d.tailBack=f.tail>=0;safe=d.cutOff===0&&d.tailBack;
     if(!safe){d.ghost=r.body;d.cut=[];for(let p=0;p<n;p++)if(!r.mask[p]&&!f.seen[p])d.cut.push(p);}}
    if(safe){d.kind='safe';return d;}
   }
   const out=this.roads[head],candidates=[base,...out.filter(q=>q!==base)];let best=-1,missingBest=n+1,tailBest=-1;
   d.options=[];
   for(const q of candidates){
    if(!out.includes(q))continue;const r=roll.project(this,[head,q]);if(!r)continue;
    const f=this.flood(r.mask,r.body[0],r.body.at(-1)),missing=n-r.body.length-f.empty;
    d.options.push({cell:q,missing,tail:f.tail});
    if(r.body.length<n&&f.tail<0)continue;if(q===this.food&&missing>0)continue;
    if(missing<missingBest||(missing===missingBest&&f.tail>tailBest)){best=q;missingBest=missing;tailBest=f.tail;}
   }
   if(best<0){d.kind='no-safe';return d;}
   // As in C, the choice replaces the remembered route even when it is the same move.
   Object.assign(d,{next:best,kind:d.checked?'guard':'spread',override:true,missing:missingBest});
   return d;
  }
  plan(){return this.decide().next;}
  stateKey(){return [...super.stateKey(),this.relaxed,Math.min(this.sinceFood,2*this.n)];}
  tick(){
   if(this.dead||this.food===-1)return false;
   const d=this.decide();this._decision=null;
   if(d.checked)this.checks++;if(d.checked&&d.kind!=='safe')this.risky++;if(d.kind==='no-safe')this.noSafe++;
   if(d.relax){this.relaxed=true;this.relaxations++;}
   if(d.override){if(d.next!==d.base)this.overrides++;this.stackLen=0;this.stack[0]=d.next;this.aiFlag=true;}
   const grew=d.next===this.food,ok=super.tick();
   if(ok&&grew){this.relaxed=false;this.sinceFood=0;}else this.sinceFood++;
   return ok;
  }
 }
 const api={GuardSnake};if(node)module.exports=api;else root.ReachabilityGuard=api;
})(typeof globalThis!=='undefined'?globalThis:this);
