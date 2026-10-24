(function(root){
 'use strict';
 const hybrid=typeof module!=='undefined'&&module.exports?require('./hybrid.js'):root.HybridSnake;
 const {HybridSnake}=hybrid;
 const edge=(a,b)=>a<b?a+':'+b:b+':'+a;
 function ordered(body,layout,active){
  const map=layout.maps[active];let span=0;
  for(const p of body)if(map[p]<0)return false;
  for(let i=body.length-1;i>0;i--){const d=(map[body[i-1]]-map[body[i]]+layout.m)%layout.m;if(!d)return false;span+=d;}
  return span<layout.m;
 }
 function layoutFrom(c,a=-1,b=-1){
  const n=a<0?c.length:c.length+1,cycles=a<0?[c]:[c,c.map(p=>p===a?b:p)];
  return {cycles,maps:cycles.map(c=>{const m=new Int32Array(n).fill(-1);c.forEach((p,i)=>m[p]=i);return m;}),m:c.length,a,b,gate:a<0?-1:c[(c.indexOf(a)+c.length-1)%c.length],active:0};
 }
 function fitCycle(body,w,h,wrap,current){
  if(current)for(let active=0;active<current.cycles.length;active++)if(ordered(body,current,active))return {cycles:current.cycles,maps:current.maps,m:current.m,a:current.a,b:current.b,gate:current.gate,active};
  // Eight reflected/transposed cycle covers. A successful cover is a certificate;
  // exhausting this bounded search says only "not found", not "impossible".
  const attempts=[];
  for(const transpose of [false,true])for(const flipX of [false,true])for(const flipY of [false,true])attempts.push({transpose,flipX,flipY,ox:0,oy:0});
  if(wrap){const head=body[0];for(const [ox,oy]of [[1,0],[0,1],[1,1],[head%w,Math.floor(head/w)]])for(const transpose of [false,true])attempts.push({transpose,flipX:false,flipY:false,ox,oy});}
  const pinned=new Set(body.slice(1).map((p,i)=>edge(p,body[i])));
  for(const cfg of attempts){
   const W=cfg.transpose?h:w,H=cfg.transpose?w:h;
   const cell=(x,y)=>{if(cfg.flipX)x=W-1-x;if(cfg.flipY)y=H-1-y;let X=cfg.transpose?y:x,Y=cfg.transpose?x:y;return ((Y+cfg.oy)%h)*w+(X+cfg.ox)%w;};
   const standard=hybrid.buildCycles(W,H),base=standard.cycles[0].map(p=>cell(p%W,Math.floor(p/W))),A=standard.a<0?-1:cell(standard.a%W,Math.floor(standard.a/W)),B=standard.b<0?-1:cell(standard.b%W,Math.floor(standard.b/W));
   for(const c of [base,base.slice().reverse()]){const layout=layoutFrom(c,A,B);for(let active=0;active<layout.cycles.length;active++)if(ordered(body,layout,active))return {...layout,active};}
   const adj=Array.from({length:w*h},()=>new Set()),addCycle=c=>c.forEach((p,i)=>{const q=c[(i+1)%c.length];adj[p].add(q);adj[q].add(p);});
   const oddX=W%2===1,oddY=H%2===1,X=oddX?W-3:W,Y=oddY?H-3:H;
   for(let y=0;y<Y;y+=2)for(let x=0;x<X;x+=2)addCycle([cell(x,y),cell(x+1,y),cell(x+1,y+1),cell(x,y+1)]);
   if(oddX)for(let y=0;y<Y;y+=2)addCycle([cell(X,y),cell(X+1,y),cell(X+2,y),cell(X+2,y+1),cell(X+1,y+1),cell(X,y+1)]);
   if(oddY)for(let x=0;x<X;x+=2)addCycle([cell(x,Y),cell(x+1,Y),cell(x+1,Y+1),cell(x+1,Y+2),cell(x,Y+2),cell(x,Y+1)]);
   let a=-1,b=-1;const required=new Set(pinned);
   if(oddX&&oddY){
    a=cell(X+1,Y+1);b=cell(X+2,Y+2);if(body.includes(b))continue;
    addCycle([cell(X,Y),cell(X+1,Y),cell(X+2,Y),cell(X+2,Y+1),a,cell(X+1,Y+2),cell(X,Y+2),cell(X,Y+1)]);
    required.add(edge(a,cell(X+2,Y+1)));required.add(edge(a,cell(X+1,Y+2)));
   }
   const degree=new Int8Array(w*h);let bad=false;
   for(const key of required){const[p,q]=key.split(':').map(Number);if(++degree[p]>2||++degree[q]>2){bad=true;break;}}if(bad)continue;
   const faces=[];
   for(let y=0;y<(wrap?H:H-1);y++)for(let x=0;x<(wrap?W:W-1);x++){
    const p=cell(x,y),q=cell((x+1)%W,y),r=cell(x,(y+1)%H),s=cell((x+1)%W,(y+1)%H);
    if(new Set([p,q,r,s]).size!==4||[p,q,r,s].includes(b))continue;
    faces.push({remove:[[p,q],[r,s]],add:[[p,r],[q,s]]},{remove:[[p,r],[q,s]],add:[[p,q],[r,s]]});
   }
   const components=()=>{const labels=new Int16Array(w*h).fill(-1);let count=0;for(let p=0;p<w*h;p++)if(p!==b&&labels[p]<0){const queue=[p];labels[p]=count;for(let i=0;i<queue.length;i++)for(const q of adj[queue[i]])if(labels[q]<0){labels[q]=count;queue.push(q);}count++;}return {labels,count};};
   const change=(f,undo)=>{const removed=undo?f.add:f.remove,added=undo?f.remove:f.add;for(const[p,q]of removed){adj[p].delete(q);adj[q].delete(p);}for(const[p,q]of added){adj[p].add(q);adj[q].add(p);}};
   let visited=0;
   function merge(){
    if(++visited>72)return false;
    const {labels,count}=components(),missing=[...required].filter(key=>{const[p,q]=key.split(':').map(Number);return !adj[p].has(q);});
    if(count===1)return missing.length===0;
    const legal=faces.filter(f=>f.remove.every(([p,q])=>adj[p].has(q)&&!required.has(edge(p,q)))&&f.add.every(([p,q])=>!adj[p].has(q))&&labels[f.remove[0][0]]!==labels[f.remove[1][0]]);
    let options=legal;
    if(missing.length){
     let minimum=Infinity;
     for(const key of missing){const[p,q]=key.split(':').map(Number);if(labels[p]===labels[q])return false;const choices=legal.filter(f=>f.add.some(([u,v])=>edge(u,v)===key));if(!choices.length)return false;if(choices.length<minimum){options=choices;minimum=choices.length;}}
    }
    for(const f of options){change(f,false);if(merge())return true;change(f,true);}
    return false;
   }
   if(!merge())continue;
   const tail=body.at(-1),c=[tail];let prev=tail,p=body.at(-2);
   while(p!==tail&&c.length<=w*h){c.push(p);const next=[...adj[p]].find(q=>q!==prev);prev=p;p=next;}
   if(p!==tail||c.length!==w*h-(b>=0?1:0))continue;
   const layout=layoutFrom(c,a,b);if(ordered(body,layout,0))return layout;
  }
  return null;
 }
 class BfsHandoffSnake extends HybridSnake{
  constructor(w=9,h=9,seed=1,wrap=true,switchAt=.65,fallbackAt=1){
   super(w,h,seed,wrap,fallbackAt,true);this.switchAt=switchAt;this.phase=this.body.length/this.n>=switchAt?'cycle':'bfs';
   if(!Number.isFinite(switchAt)||switchAt<0||switchAt>1)throw Error('BFS 切换比例必须在 0–1 之间');
   if(this.phase==='cycle'){this.threshold=0;this.lookahead=false;}
   this._foodPlan=null;this.targetLayout=null;this.bfsMeals=0;this.fallbackMeals=0;this.circuitRebuilds=0;this.bfsSteps=0;this.cycleSteps=0;this.lastBfsLength=null;this.lastRejection='';
   this.joinStep=this.phase==='cycle'?0:null;this.joinLength=this.phase==='cycle'?this.body.length:null;
  }
  install(layout){for(const key of ['cycles','maps','m','a','b','gate','active'])this[key]=layout[key];this._planCache=null;}
  simulate(path){
   const body=this.body.slice();for(let i=1;i<path.length;i++){const grow=i===path.length-1;if(path[i]===body[1]||(grow?body:body.slice(0,-1)).includes(path[i]))return null;body.unshift(path[i]);if(!grow)body.pop();}return body;
  }
  shortestPaths(first){
   const blocked=new Set(this.body.slice(1)),distance=new Int16Array(this.n).fill(-1),queue=[this.food];distance[this.food]=0;
   for(let i=0;i<queue.length;i++)for(const q of this.neighbors(queue[i]))if(!blocked.has(q)&&distance[q]<0){distance[q]=distance[queue[i]]+1;queue.push(q);}
   const paths=[first],seen=new Set([first.join(',')]),path=[this.body[0]];
   const visit=p=>{if(paths.length>=4)return;if(p===this.food){const key=path.join(',');if(!seen.has(key)){seen.add(key);paths.push(path.slice());}return;}for(const q of this.neighbors(p))if(distance[q]===distance[p]-1){path.push(q);visit(q);path.pop();if(paths.length>=4)break;}};
   visit(this.body[0]);return paths;
  }
  prepare(){
   if(this._foodPlan)return this._foodPlan;
   if(this.food===-1)return {path:[],actions:[],steps:0,first:null,options:[],kind:'done'};
   this.lastRejection='';
   if(this.phase==='bfs'){
    const path=this.bfs(this.body[0],this.food,new Set(this.body.slice(1)),this.body[1]);
    this.lastBfsLength=path?path.length-1:null;
    if(path){
     for(const candidate of this.shortestPaths(path)){
      const future=this.simulate(candidate),layout=future&&fitCycle(future,this.w,this.h,this.wrap,this);
      if(layout){
       const actions=candidate.slice(1).map(next=>({next,active:this.active,mode:'handoff-bfs'}));this.targetLayout=layout;
       return this._foodPlan={path:candidate,actions,steps:candidate.length-1,first:actions[0],options:[],kind:'bfs',layout};
      }
     }
     this.lastRejection='找到了 BFS 最短路，但至多 4 条等长候选的有限搜索未找到吃后接环证书';
    }else this.lastRejection='当前身体作为障碍时，BFS 找不到食物路径';
   }
   const traced=HybridSnake.prototype.getPlan.call(this);
   const actions=traced.actions.map(p=>({...p,mode:this.phase==='bfs'?'handoff-fallback':p.mode}));
   return this._foodPlan={...traced,actions,first:actions[0],kind:this.phase==='bfs'?'fallback':'cycle'};
  }
  choose(){return this.prepare().first;}
  getPlan(){const p=this.prepare();return {...p,steps:p.path.length-1};}
  explain(){
   const plan=this.prepare(),next=plan.first.next;
   return [[1,0,'右'],[0,1,'下'],[-1,0,'左'],[0,-1,'上']].map(([dx,dy,direction])=>{const p=this.offset(this.body[0],dx,dy);let reason=p<0?'越界':p===this.body[1]?'蛇颈，不能反向':(p===this.food?this.body:this.body.slice(0,-1)).includes(p)?'身体占用':p===next?'选中':plan.kind==='bfs'?'执行已验证的四向 BFS 最短路':'按已验证的保底回路执行';return {direction,cell:p,manhattan:p<0?null:this.heuristic(p),rolloutSteps:p===next?plan.path.length-1:null,reason};});
  }
  tick(){
   if(this.food===-1||this.dead)return false;
   const plan=this.prepare(),p=plan.actions[0],grow=p.next===this.food;
   if(!this.neighbors(this.body[0]).includes(p.next)||p.next===this.body[1]||(grow?this.body:this.body.slice(0,-1)).includes(p.next))throw Error('handoff illegal move');
   const previousActive=this.active;this.body.unshift(p.next);if(!grow)this.body.pop();this.active=p.active;this.mode=p.mode;this.steps++;
   if(plan.kind==='bfs')this.bfsSteps++;else this.cycleSteps++;
   if(plan.kind!=='bfs'&&previousActive!==this.active)this.switches++;
   plan.path.shift();plan.actions.shift();plan.first=plan.actions[0]||null;
   if(grow){
    this.eaten++;
    if(plan.kind==='bfs'){this.install(plan.layout);this.bfsMeals++;this.circuitRebuilds++;}
    else if(plan.kind==='fallback')this.fallbackMeals++;
    if(this.body.length<this.n&&!this.ordered())throw Error('food endpoint lacks handoff certificate');
    if(this.phase==='bfs'&&this.body.length<this.n&&this.body.length/this.n>=this.switchAt){this.phase='cycle';this.joinStep=this.steps;this.joinLength=this.body.length;this.threshold=0;this.lookahead=false;}
    this.spawn();this._foodPlan=null;this.targetLayout=null;this._planCache=null;
   }
   this.route=[];return true;
  }
 }
 const api={BfsHandoffSnake,fitCycle,ordered};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.BfsHandoff=api;
})(typeof globalThis!=='undefined'?globalThis:this);

