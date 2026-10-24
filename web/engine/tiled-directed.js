(function(root){
 'use strict';
 const base=typeof module!=='undefined'&&module.exports?require('./snake.js'):root.TailSnake;
 const key=(a,b,n)=>a*n+b;
 function parts(n){const out=[];for(let p=0;p<n;){const size=n-p===3?3:2;out.push({start:p,size});p+=size;}return out;}
 function buildTiles(w,h,wrap=false){
  const n=w*h,tiles=[],tileOf=new Int32Array(n),odd=w%2&&h%2;
  const next=Array.from({length:odd?2:1},()=>new Int32Array(n).fill(-1));let a=-1,b=-1;
  for(const Y of parts(h))for(const X of parts(w)){
   const tile={x:X.start,y:Y.start,w:X.size,h:Y.size,id:tiles.length};tiles.push(tile);
   const cell=(x,y)=>(tile.y+y)*w+tile.x+x;
   for(let y=0;y<tile.h;y++)for(let x=0;x<tile.w;x++)tileOf[cell(x,y)]=tile.id;
   let local=[];
   if(tile.w===3&&tile.h===3){a=cell(1,1);b=cell(2,2);local=[[0,0],[1,0],[2,0],[2,1],[1,1],[1,2],[0,2],[0,1]];}
   else{
    for(let x=0;x<tile.w;x++)local.push([x,0]);
    for(let y=1;y<tile.h;y++)local.push([tile.w-1,y]);
    for(let x=tile.w-2;x>=0;x--)local.push([x,tile.h-1]);
    for(let y=tile.h-2;y>0;y--)local.push([0,y]);
   }
   const cycle=local.map(([x,y])=>cell(x,y));
   for(let phase=0;phase<next.length;phase++){const c=phase&&tile.w===3&&tile.h===3?cycle.map(p=>p===a?b:p):cycle;for(let i=0;i<c.length;i++)next[phase][c[i]]=c[(i+1)%c.length];}
  }
  // Only ports shared by both 3x3 variants are allowed. This preserves the
  // common gate -> a/b -> exit branch when the merged cycle is reconstructed.
  const ports=[],bridge=new Map(),roads=Array.from({length:n},()=>new Set());
  for(const variant of next)for(let p=0;p<n;p++)if(variant[p]>=0)roads[p].add(variant[p]);
  const add=(u,v,x,y)=>{
   if(!next.every(c=>c[u]===v&&c[x]===y))return;
   const port={u,v,x,y,left:tileOf[u],right:tileOf[x],id:ports.length};ports.push(port);
   for(const[p,q]of [[u,y],[x,v]]){roads[p].add(q);const k=key(p,q,n);if(bridge.has(k))throw Error('ambiguous tile port');bridge.set(k,port.id);}
  };
  for(let y=0;y<(wrap?h:h-1);y++)for(let x=0;x<(wrap?w:w-1);x++){
   const p=y*w+x,q=y*w+(x+1)%w,r=((y+1)%h)*w+x,s=((y+1)%h)*w+(x+1)%w;
   if(new Set([p,q,r,s]).size!==4)continue;
   if(tileOf[p]===tileOf[r]&&tileOf[q]===tileOf[s]&&tileOf[p]!==tileOf[q])add(p,r,s,q);
   if(tileOf[p]===tileOf[q]&&tileOf[r]===tileOf[s]&&tileOf[p]!==tileOf[r])add(q,p,r,s);
  }
  const vertical=(p,q)=>p%w===q%w;
  return {w,h,n,tiles,tileOf,next,ports,bridge,a,b,roads:roads.map((s,p)=>[...s].sort((x,y)=>Number(vertical(p,y))-Number(vertical(p,x))||x-y))};
 }
 function ordered(body,layout,active=layout.active){
  const map=layout.maps[active];let span=0;
  for(const p of body)if(map[p]<0)return false;
  for(let i=body.length-1;i>0;i--){const d=(map[body[i-1]]-map[body[i]]+layout.m)%layout.m;if(!d)return false;span+=d;}
  return span<layout.m;
 }
 function layoutOf(network,cycle,phase,joins){
  const {n,a,b}=network,cycles=a<0?[cycle]:phase?[cycle.map(p=>p===b?a:p),cycle]:[cycle,cycle.map(p=>p===a?b:p)];
  const maps=cycles.map(c=>{const m=new Int32Array(n).fill(-1);c.forEach((p,i)=>m[p]=i);return m;});
  const c=cycles[0];return {cycles,maps,active:phase,m:c.length,a,b,gate:a<0?-1:c[(c.indexOf(a)+c.length-1)%c.length],joins};
 }
 function certifyExact(network,body,current=null){
  if(current)for(let phase=0;phase<current.cycles.length;phase++)if(ordered(body,current,phase))return {cycles:current.cycles,maps:current.maps,m:current.m,a:current.a,b:current.b,gate:current.gate,joins:current.joins,active:phase};
  const {n,next,ports,tiles,bridge}=network,required=new Set();
  for(let i=body.length-1;i>0;i--)required.add(key(body[i],body[i-1],n));
  for(let phase=0;phase<next.length;phase++){
   if(body.some(p=>next[phase][p]<0))continue;
   const allowed=ports.map(p=>!required.has(key(p.u,p.v,n))&&!required.has(key(p.x,p.y,n))),forced=new Set();let bad=false;
   for(let i=body.length-1;i>0;i--){const p=body[i],q=body[i-1];if(next[phase][p]===q)continue;const id=bridge.get(key(p,q,n));if(id===undefined||!allowed[id]){bad=true;break;}forced.add(id);}
   if(bad)continue;
   const parent=Int32Array.from({length:tiles.length},(_,i)=>i),rank=new Int8Array(tiles.length),successor=next[phase].slice(),joins=[];let components=tiles.length;
   const find=x=>{while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x];}return x;};
   const join=id=>{const p=ports[id];let x=find(p.left),y=find(p.right);if(x===y)return false;if(rank[x]<rank[y])[x,y]=[y,x];parent[y]=x;if(rank[x]===rank[y])rank[x]++;successor[p.u]=p.y;successor[p.x]=p.v;joins.push(id);components--;return true;};
   for(const id of forced)if(!join(id)){bad=true;break;}
   if(bad)continue;
   for(const p of ports)if(allowed[p.id]&&!forced.has(p.id))join(p.id);
   if(components!==1)continue;
   const cycle=[],seen=new Set();let p=body.at(-1);
   while(p>=0&&!seen.has(p)){seen.add(p);cycle.push(p);p=successor[p];}
   if(p!==cycle[0]||cycle.length!==n-(network.a>=0?1:0))continue;
   const layout=layoutOf(network,cycle,phase,joins);if(ordered(body,layout))return layout;
  }
  return null;
 }
 function certify(network,body,current=null){
  const exact=certifyExact(network,body,current);if(exact)return exact;
  // Body edges need not be edges of the recovery cycle: only cyclic body
  // order is required. Prefer those edges when building alternative trees,
  // then verify the complete cycle and its order, rather than forcing them.
  const {n,next,ports,tiles}=network,required=new Set();
  for(let i=body.length-1;i>0;i--)required.add(key(body[i],body[i-1],n));
  for(let phase=0;phase<next.length;phase++){
   if(body.some(p=>next[phase][p]<0))continue;
   for(let scheme=0;scheme<4;scheme++){
    const buckets=Array.from({length:23},()=>[]),gain=scheme<2?8:2;
    for(const p of ports){const gained=Number(required.has(key(p.u,p.y,n)))+Number(required.has(key(p.x,p.v,n))),lost=Number(required.has(key(p.u,p.v,n)))+Number(required.has(key(p.x,p.y,n)));buckets[gained*gain-lost*3+6].push(p);}
    const parent=Int32Array.from({length:tiles.length},(_,i)=>i),rank=new Int8Array(tiles.length),successor=next[phase].slice(),joins=[];let components=tiles.length;
    const find=x=>{while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x];}return x;};
    for(let score=buckets.length-1;score>=0;score--){const bucket=buckets[score];for(let j=0;j<bucket.length;j++){
     const p=bucket[scheme%2?bucket.length-1-j:j];let a=find(p.left),b=find(p.right);if(a===b)continue;
     if(rank[a]<rank[b])[a,b]=[b,a];parent[b]=a;if(rank[a]===rank[b])rank[a]++;successor[p.u]=p.y;successor[p.x]=p.v;joins.push(p.id);components--;
    }}
    if(components!==1)continue;
    const cycle=[],seen=new Set();let p=body.at(-1);
    while(p>=0&&!seen.has(p)){seen.add(p);cycle.push(p);p=successor[p];}
    if(p!==cycle[0]||cycle.length!==n-(network.a>=0?1:0))continue;
    const layout=layoutOf(network,cycle,phase,joins);
    if(ordered(body,layout)){layout.method='ordered-merge';return layout;}
   }
  }
  return null;
 }
 class TiledDirectedSnake extends base.Snake{
  constructor(w=9,h=9,seed=1,wrap=false){
   super(w,h,seed,wrap);this.network=buildTiles(w,h,wrap);this.tiles=this.network.tiles;
   const layout=certify(this.network,this.body);if(!layout)throw Error('initial tiled cycle unavailable');Object.assign(this,layout);
   this._foodPlan=null;this._checkedStep=-1;this.targetLayout=null;this.mode='tile-ready';this.searchInfo={};this.lastRejection='';
   this.bfsMeals=0;this.fallbackMeals=0;this.bfsSteps=0;this.cycleSteps=0;this.switches=0;this.rebuilds=0;this.certifiedMeals=0;this.replans=0;this.relaxedPlans=0;
  }
  directedNeighbors(p){return this.network.roads[p];}
  directedBfs(start,end,blocked){
   const prev=new Int32Array(this.n).fill(-2),queue=[start];prev[start]=-1;
   for(let i=0;i<queue.length;i++){const p=queue[i];if(p===end){const path=[];for(let q=p;q>=0;q=prev[q])path.push(q);return path.reverse();}for(const q of this.directedNeighbors(p))if(prev[q]===-2&&!blocked.has(q)){prev[q]=p;queue.push(q);}}
   return null;
  }
  fallback(){
   const queue=this.body.slice().reverse(),occupied=new Set(queue),path=[this.body[0]],actions=[];let front=0,active=this.active;
   for(let i=0;i<2*this.m+2;i++){
    const head=queue.at(-1),excluded=this.cycles.length===2?(active?this.a:this.b):-1;let next,mode='tile-ring';
    if(queue.length-front===this.n-1&&this.directedNeighbors(head).includes(this.food)){next=this.food;mode='tile-finish';}
    else if(this.food===excluded&&head===this.gate&&ordered(queue.slice(front).reverse(),this,1-active)){next=excluded;active=1-active;mode='tile-switch';}
    else next=this.cycles[active][(this.maps[active][head]+1)%this.m];
    const grow=next===this.food,tail=queue[front];if(occupied.has(next)&&(grow||next!==tail))throw Error('tiled fallback collision');
    if(!grow){occupied.delete(tail);front++;}queue.push(next);occupied.add(next);path.push(next);actions.push({next,active,mode});
    if(grow)return {kind:'fallback',path,actions,first:actions[0],steps:actions.length,layout:{cycles:this.cycles,maps:this.maps,m:this.m,a:this.a,b:this.b,gate:this.gate,active,joins:this.joins}};
   }
   throw Error('tiled fallback exceeded progress bound');
  }
  prepare(){
   if(this._foodPlan&&this._checkedStep===this.steps)return this._foodPlan;
   if(this.food<0)return {kind:'done',path:[],actions:[],steps:0,first:null};
   this._checkedStep=this.steps;this.lastRejection='';const previous=this._foodPlan;
   if(!previous)this.targetLayout=null;
   const path=this.directedBfs(this.body[0],this.food,new Set(this.body.slice(1)));
   this.searchInfo={foodSteps:path?path.length-1:null,tailReachable:null,certificate:false};
   if(path&&(!previous||path.length<previous.path.length)){
    const future=this.body.slice().reverse().concat(path.slice(1)).slice(-(this.body.length+1)).reverse();
    const full=future.length===this.n,tailPath=full?[]:this.directedBfs(future[0],future.at(-1),new Set(future.slice(1,-1)));
    this.searchInfo.tailReachable=!!tailPath;
    const layout=full?null:tailPath&&certify(this.network,future,this);
    if(full||layout){const actions=path.slice(1).map(next=>({next,active:this.active,mode:'tile-bfs'}));this.searchInfo.certificate=true;this.targetLayout=layout;if(previous)this.replans++;if(layout?.method==='ordered-merge')this.relaxedPlans++;return this._foodPlan={kind:'bfs',path,actions,steps:actions.length,first:actions[0],layout};}
    this.lastRejection=tailPath?'有向最短路吃后无法用允许的拼接口合并成保底回路':'有向最短路吃后无法追尾';
   }else this.lastRejection=path?'新有向最短路没有比剩余计划更短':'当前身体障碍下没有有向食物路线';
   // A certified plan is a progress bound. Replan only when strictly shorter,
   // otherwise retain its legal continuation even while off the old cycle.
   if(previous)return previous;
   return this._foodPlan=this.fallback();
  }
  getPlan(){const p=this.prepare();return {...p,path:p.path.slice(),steps:p.path.length?p.path.length-1:0,label:p.kind==='bfs'?'小环有向 BFS · 吃后拼接已验证':p.kind==='done'?'已吃满':'小环回路保底'};}
  plan(){return this.prepare().first?.next;}
  stateKey(){return [this.active,this.cycles,this._foodPlan?{path:this._foodPlan.path,actions:this._foodPlan.actions,kind:this._foodPlan.kind,layout:this._foodPlan.layout?.cycles}:null];}
  explain(){const plan=this.prepare();return [[1,0,'右'],[0,1,'下'],[-1,0,'左'],[0,-1,'上']].map(([dx,dy,direction])=>{const p=this.offset(this.body[0],dx,dy);return {direction,cell:p,manhattan:p<0?null:Math.abs(p%this.w-this.food%this.w)+Math.abs(Math.floor(p/this.w)-Math.floor(this.food/this.w)),rolloutSteps:p===plan.first?.next?plan.path.length-1:null,reason:p<0?'越界':p===plan.first?.next?'选中':!this.directedNeighbors(this.body[0]).includes(p)?'小环方向不允许':this.body.slice(0,-1).includes(p)?'身体占用':'本颗执行已验证方案'};});}
  tick(){
   if(this.food<0||this.dead)return false;
   const plan=this.prepare(),p=plan.first,grow=p.next===this.food;
   if(!this.directedNeighbors(this.body[0]).includes(p.next)||(grow?this.body:this.body.slice(0,-1)).includes(p.next))throw Error('tiled illegal move');
   if(p.active!==this.active)this.switches++;this.active=p.active;this.mode=p.mode;this.steps++;
   this.body.unshift(p.next);if(!grow)this.body.pop();
   if(plan.kind==='bfs')this.bfsSteps++;else this.cycleSteps++;
   plan.path.shift();plan.actions.shift();plan.first=plan.actions[0]||null;
   if(grow){
    this.eaten++;if(plan.kind==='bfs'){this.bfsMeals++;this.certifiedMeals++;}else this.fallbackMeals++;
    if(plan.layout){if(plan.kind==='bfs')this.rebuilds++;Object.assign(this,plan.layout);}
    if(this.body.length<this.n&&!ordered(this.body,this))throw Error('tiled endpoint certificate lost');
    this.spawn();this._foodPlan=null;this.targetLayout=null;
   }
   this.route=[];return true;
  }
 }
 const api={TiledDirectedSnake,buildTiles,certify,certifyExact,ordered};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TiledDirected=api;
})(typeof globalThis!=='undefined'?globalThis:this);

