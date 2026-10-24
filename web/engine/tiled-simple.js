(function(root){
  'use strict';
  const base=typeof module!=='undefined'&&module.exports?require('./snake.js'):root.TailSnake;
  const graph=typeof module!=='undefined'&&module.exports?require('./simple-directed-graph.js'):root.SimpleDirectedGraph;

  class SimpleTiledSnake extends base.Snake{
    constructor(w=9,h=9,seed=1,wrap=false){
      super(w,h,seed,wrap);
      // Paired unit interfaces define the static roads. Decisions below use
      // only BFS/tail reachability; no cycle layout or certificate is stored.
      this.network=graph.buildSimpleGraph(w,h,wrap);
      this.tiles=this.network.tiles;
      this.mode='simple-ready';
      this.stopped=false;
      delete this.route;
    }
    directedNeighbors(p){return this.network.roads[p];}
    // The temporary path is used only by the current decision/preview.
    directedBfs(start,end,blocked){
      const prev=new Int32Array(this.n).fill(-2),queue=[start];prev[start]=-1;
      for(let i=0;i<queue.length;i++){
        const p=queue[i];
        if(p===end){const path=[];for(let q=p;q>=0;q=prev[q])path.push(q);return path.reverse();}
        for(const q of this.directedNeighbors(p))if(prev[q]===-2&&!blocked.has(q)){prev[q]=p;queue.push(q);}
      }
      return null;
    }
    decide(){
      if(this.food<0||this.stopped)return null;
      const head=this.body[0],tail=this.body.at(-1);
      const foodPath=this.directedBfs(head,this.food,new Set(this.body.slice(1)));
      if(foodPath){
        const future=this.body.slice().reverse().concat(foodPath.slice(1)).slice(-(this.body.length+1)).reverse();
        if(future.length===this.n||this.directedBfs(future[0],future.at(-1),new Set(future.slice(1,-1))))
          return {next:foodPath[1],kind:'food',path:foodPath};
      }
      const occupied=new Set(this.body),blocked=new Set(this.body.slice(0,-1));
      for(const next of this.directedNeighbors(head))if(!occupied.has(next)&&this.directedBfs(next,tail,blocked))
        return {next,kind:'tail',path:[head,next]};
      // Only after empty-neighbor candidates fail, permit entering the tail
      // cell that will be freed by a non-growing move.
      const path=this.directedBfs(head,tail,new Set(this.body.slice(1,-1)));
      return path?{next:path[1],kind:'tail',path}:null;
    }
    getPlan(){
      const decision=this.decide();
      if(!decision)return {next:null,kind:this.food<0?'done':'stopped',path:[],steps:0,label:this.food<0?'已吃满':'无可行路线 · 停止'};
      return {...decision,steps:decision.path.length-1,label:decision.kind==='food'?'有向 BFS · 吃后可追尾':'第一个可行追尾候选'};
    }
    plan(){return this.decide()?.next??null;}
    tick(){
      if(this.dead||this.stopped||this.food<0)return false;
      const decision=this.decide();
      if(!decision){this.stopped=true;this.dead=true;this.mode='simple-stopped';return false;}
      const next=decision.next,grow=next===this.food;
      if(!this.directedNeighbors(this.body[0]).includes(next)||(grow?this.body:this.body.slice(0,-1)).includes(next))
        throw Error('simple tiled planner produced an illegal move');
      this.body.unshift(next);
      if(grow){this.eaten++;this.spawn();}else this.body.pop();
      this.steps++;this.mode=decision.kind==='food'?'simple-food':'simple-tail';
      return true;
    }
    explain(){
      const plan=this.getPlan(),allowed=this.directedNeighbors(this.body[0]);
      return [[1,0,'右'],[0,1,'下'],[-1,0,'左'],[0,-1,'上']].map(([dx,dy,direction])=>{
        const cell=this.offset(this.body[0],dx,dy);
        const blocked=(cell===this.food?this.body:this.body.slice(0,-1)).includes(cell);
        return {direction,cell,manhattan:cell<0?null:Math.abs(cell%this.w-this.food%this.w)+Math.abs(Math.floor(cell/this.w)-Math.floor(this.food/this.w)),rolloutSteps:null,
          reason:cell<0?'越界':cell===plan.next?'选中 · '+plan.label:!allowed.includes(cell)?'方向图不允许':blocked?'身体占用':'按固定顺序选可行追尾候选，不比较距离'};
      });
    }
  }
  const api={SimpleTiledSnake};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TiledSimple=api;
})(typeof globalThis!=='undefined'?globalThis:this);

