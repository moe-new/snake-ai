(function(root){
 'use strict';
 const base=typeof module!=='undefined'&&module.exports?require('./snake.js'):root.TailSnake;
 class ShortestTailSnake extends base.Snake{
  constructor(w=9,h=9,seed=1,wrap=false){super(w,h,seed,wrap);delete this.route;this.mode='bfs-ready';}
  decide(){
   if(this.dead||this.food<0)return null;
   const head=this.body[0],tail=this.body.at(-1),path=this.bfs(head,this.food,new Set(this.body.slice(1)));
   if(path){
    const future=this.body.slice().reverse().concat(path.slice(1)).slice(-(this.body.length+1)).reverse();
    if(future.length===this.n||this.bfs(future[0],future.at(-1),new Set(future.slice(1,-1))))return {next:path[1],kind:'food',path};
   }
   // An unsafe food cell cannot be consumed incidentally on a tail route.
   const blocked=new Set(this.body.slice(1,-1));blocked.add(this.food);
   const tailPath=this.bfs(head,tail,blocked);
   return tailPath?{next:tailPath[1],kind:'tail',path:tailPath}:null;
  }
  getPlan(){const decision=this.decide();return decision?{...decision,steps:decision.path.length-1,label:decision.kind==='food'?'四向最短 BFS 吃食物':'四向最短追尾'}:{next:null,kind:this.food<0?'done':'stopped',path:[],steps:0,label:this.food<0?'已吃满':'无可行路线'};}
  plan(){return this.decide()?.next??null;}
  tick(){
   if(this.dead||this.food<0)return false;
   const decision=this.decide();if(!decision){this.dead=true;this.mode='bfs-stopped';return false;}
   const next=decision.next,grow=next===this.food;
   if(!this.neighbors(this.body[0]).includes(next)||(grow?this.body:this.body.slice(0,-1)).includes(next))throw Error('four-way BFS produced an illegal move');
   this.body.unshift(next);if(grow){this.eaten++;this.spawn();}else this.body.pop();this.steps++;this.mode=decision.kind==='food'?'bfs-food':'bfs-tail';return true;
  }
 }
 // Preserve the original four-way demo's route extension, food detours, space
 // fallback and execution cache. Preview runs on a private copy only.
 class DetourTailSnake extends base.Snake{
  getPlan(){
   if(this.food<0||this.dead)return {path:[],steps:0,kind:this.food<0?'done':'stopped',label:this.food<0?'已吃满':'已停止'};
   const copy=Object.assign(Object.create(Object.getPrototypeOf(this)),this,{body:this.body.slice(),route:this.route.slice()});
   const next=copy.route.length>1&&copy.mode!=='tail'?copy.route[1]:copy.plan();
   const path=copy.route.length>1?copy.route.slice():Number.isInteger(next)?[copy.body[0],next]:[];
   return {next,kind:path.includes(this.food)?'food':'tail',path,steps:Math.max(0,path.length-1),label:copy.mode==='shortest-food'?'四向最短 BFS 吃食物':copy.mode==='food-on-tail-route'?'绕行吃食物':copy.mode==='escape'?'空域兜底':'延长路线追尾'};
  }
 }
 const api={ShortestTailSnake,DetourTailSnake};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FourWay=api;
})(typeof globalThis!=='undefined'?globalThis:this);

