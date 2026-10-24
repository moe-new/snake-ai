(function(root){
 'use strict';
 const base=typeof module!=='undefined'&&module.exports?require('./snake.js'):root.TailSnake;
 // Decision rules translated from the user's C bfs()/ai(), including the shared
 // bfs_flag latch and persistent reverse-path buffer. Rendering, initial body,
 // food RNG and terminal-win recording use the common demo environment.
 class CDirectedSnake extends base.Snake{
  constructor(w=9,h=9,seed=1,wrap=true){
   super(w,h,seed,wrap);this.cMap=new Int32Array(this.n);this.scratch=new Int32Array(this.n);
   this.father=new Int32Array(this.n);this.stack=new Int32Array(this.n+2);this.stackLen=-1;this.aiFlag=true;this.delta=1;
   this.foodSteps=0;this.tailSteps=0;this.disabledSteps=0;this.collision=null;this.searchInfo={};this.syncMap();this.ai();this.syncRoute();
  }
  syncMap(){this.cMap.fill(0);for(const p of this.body)this.cMap[p]=1;}
  get boundaryAligned(){return !this.wrap&&this.w%2===0&&this.h%2===0;}
  directedNeighbors(p){
   // On an even-by-even bounded board, shift only the row parity phase.
   // This leaves one entrance and one exit at each corner. Native wrap rules
   // remain identical to the supplied C source; odd sizes keep the old graph.
   let horizontal=Math.floor(p/this.w)%2?1:-1;
   if(this.boundaryAligned)horizontal=-horizontal;
   return [this.offset(p,0,p%this.w%2?1:-1),this.offset(p,horizontal,0)].filter(q=>q>=0);
  }
  cBfs(start,end,savePath){
   this.scratch[end]=-1;const queue=[start];let foundFrom=start;this.aiFlag=false;
   search:for(let l=0;l<queue.length;l++){
    const p=queue[l];for(const q of this.directedNeighbors(p)){
     if(this.scratch[q]===0){queue.push(q);this.father[q]=p;this.scratch[q]=1;}
     this.aiFlag=this.scratch[q]===-1;if(this.aiFlag){foundFrom=p;break search;}
    }
   }
   if(this.aiFlag&&savePath){this.stackLen=0;this.stack[0]=end;let p=foundFrom;while(p!==start){this.stack[++this.stackLen]=p;p=this.father[p];if(this.stackLen>this.n)throw Error('C path predecessor cycle');}}
   return this.aiFlag;
  }
  bufferedPath(){return Array.from(this.stack.subarray(0,this.stackLen+1)).reverse();}
  ai(){
   if(!this.aiFlag){this.mode='c-disabled';return;}
   const head=this.body[0],len=this.body.length,tail=this.body.at(-1);this.searchInfo={foodPath:null,afterFoodTail:null,virtualTail:null,tailCandidates:[]};
   this.scratch.set(this.cMap);this.cBfs(head,this.food,true);
   if(this.aiFlag){
    this.searchInfo.foodPath=[head,...this.bufferedPath()];
    if(len+1>=this.n){this.mode='c-food';return;}
    this.scratch.set(this.cMap);
    for(let i=Math.min(len,this.stackLen);i>0;i--){this.scratch[this.body[len-i]]=0;this.scratch[this.stack[i]]=1;}
    const t=len<=this.stackLen?this.stack[len]:this.body[len-1-this.stackLen];this.searchInfo.virtualTail=t;
    this.cBfs(this.food,t,false);this.searchInfo.afterFoodTail=this.aiFlag;
    if(this.aiFlag){this.mode='c-food';return;}
   }
   let chosen=-1,bestLength=-1;
   for(const p of this.directedNeighbors(head))if(!this.cMap[p]){
    this.scratch.set(this.cMap);this.cBfs(p,tail,true);
    this.searchInfo.tailCandidates.push({cell:p,reachable:this.aiFlag,length:this.aiFlag?this.stackLen+1:null});
    if(this.aiFlag&&this.stackLen>bestLength){chosen=p;bestLength=this.stackLen;}
   }
   if(chosen>=0){this.stackLen=0;this.stack[0]=chosen;this.mode='c-tail';}
   else{
    // Original C does not reset bfs_m before this final fallback. Preserve it.
    this.cBfs(head,tail,true);this.mode=this.aiFlag?'c-tail':'c-disabled';
   }
  }
  nextCell(){return this.stackLen>=0?this.stack[this.stackLen]:this.offset(this.body[0],this.delta,0);}
  syncRoute(){this.route=this.food===-1?[]:[this.body[0],...(this.stackLen>=0?this.bufferedPath():[this.nextCell()].filter(p=>p>=0))];}
  getPlan(){return {path:this.route.slice(),steps:Math.max(0,this.route.length-1),kind:'c-directed',label:this.dead?'C 碰撞停止':this.food===-1?'C 已吃满':this.mode==='c-food'?'C 有向 BFS 吃食物':this.mode==='c-disabled'?'C 搜索失败锁定 / 缓存续走':'C 有向追尾'};}
  plan(){return this.nextCell();}
  heuristic(p){let dx=Math.abs(p%this.w-this.food%this.w),dy=Math.abs(Math.floor(p/this.w)-Math.floor(this.food/this.w));if(this.wrap){dx=Math.min(dx,this.w-dx);dy=Math.min(dy,this.h-dy);}return dx+dy;}
  explain(){
   const head=this.body[0],allowed=this.directedNeighbors(head),next=this.nextCell();
   return [[1,0,'右'],[0,1,'下'],[-1,0,'左'],[0,-1,'上']].map(([dx,dy,direction])=>{const p=this.offset(head,dx,dy),grow=p===this.food;return {direction,cell:p,manhattan:p<0?null:this.heuristic(p),rolloutSteps:p===next&&this.mode==='c-food'?this.getPlan().steps:null,reason:p<0?'越界':p===next?'选中 · '+this.getPlan().label:!allowed.includes(p)?'C 奇偶方向不允许':(grow?this.body:this.body.slice(0,-1)).includes(p)?'身体占用':'C 有向图候选'};});
  }
  stateKey(){return [this.aiFlag,this.stackLen,Array.from(this.stack.subarray(0,this.stackLen+1)),this.delta];}
  tick(){
   if(this.dead||this.food===-1)return false;
   const next=this.nextCell(),grow=next===this.food,mode=this.mode;if(this.stackLen>=0)this.stackLen--;this.steps++;
   if(mode==='c-food')this.foodSteps++;else if(mode==='c-disabled')this.disabledSteps++;else this.tailSteps++;
   if(!this.neighbors(this.body[0]).includes(next)||(grow?this.body:this.body.slice(0,-1)).includes(next)){
    this.dead=true;this.collision=next;this.mode='c-collision';this.syncRoute();return false;
   }
   this.body.unshift(next);if(!grow)this.body.pop();else{this.eaten++;this.spawn();}
   this.syncMap();if(this.food===-1){this.mode='c-won';this.syncRoute();return true;}
   this.ai();this.syncRoute();return true;
  }
 }
 const api={CDirectedSnake};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CDirected=api;
})(typeof globalThis!=='undefined'?globalThis:this);
