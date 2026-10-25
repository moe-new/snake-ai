(function(root){
 'use strict';
 const node=typeof module!=='undefined'&&module.exports;
 const base=node?require('./snake.js'):root.TailSnake,roll=node?require('./rollout.js'):root.Rollout;
 // 加权 Cell (加权 Cell＋安全尾段裁剪), translated from c/compare/src/cell.c: a port of
 // twanvl/snake's CellTreeAgent (github.com/twanvl/snake, ee180ede) with one change of this
 // project's, the tail trim. Not an original cell-tree algorithm. The source's licence:
 //
 //   MIT License. Copyright (c) 2020 Twan van Laarhoven
 //   Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 //   and associated documentation files (the "Software"), to deal in the Software without
 //   restriction, including without limitation the rights to use, copy, modify, merge, publish,
 //   distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
 //   Software is furnished to do so, subject to the following conditions:
 //   The above copyright notice and this permission notice shall be included in all copies or
 //   substantial portions of the Software.
 //   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
 //   BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 //   NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 //   DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 //   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 //
 // The board is cut into 2×2 squares. Walked from the tail, the body enters squares one after
 // another; each square's parent is the one the body came from. The head may move within its
 // square, into a square the body is not on, or back to its square's parent, and only along the
 // one-way roads (the C rule's). Kept to that, the body's squares form a tree, and a loop round
 // a tree of squares through all their cells always exists: the snake cannot shut itself in.
 // Within those moves, A* to the food, moves that leave the tree cost more. Before following the
 // path, eat in imagination: if some empty cell could then not be reached, head first for the
 // nearest such cell. Tail cells that will have left before the head could reach them count as
 // free while searching (rollout.js trim()); the real body is used for everything else.
 const DOWN=[0,1],UP=[0,-1],LEFT=[-1,0],RIGHT=[1,0],DIRS=[DOWN,UP,LEFT,RIGHT];   // the source's U, D, L, R, reflected
 const MAX=0x7fffffff;
 class CellTreeSnake extends base.Snake{
  constructor(w=8,h=8,seed=1,wrap=false){
   super(w,h,seed,wrap);
   if(wrap||w%2||h%2)throw Error('加权 Cell 需要宽、高都是偶数，不穿边');
   const n=this.n;this.square=new Int32Array(n);this.scan=new Int32Array(n);this.squares=n/4;
   for(let p=0;p<n;p++){const x=p%w,y=Math.floor(p/w);this.square[p]=(y>>1)*(w>>1)+(x>>1);this.scan[p]=(h-1-y)*w+x;}
   // The one-way roads of the C rule on an even board (as c-directed.js): first up or down, then left or right.
   this.roads=Array.from({length:n},(_,p)=>{const x=p%w,y=Math.floor(p/w);return [this.offset(p,0,x%2?1:-1),this.offset(p,y%2?-1:1,0)].filter(q=>q>=0);});
   this.cache=[];this.cacheCount=0;this._decision=null;this._decidedAt=-1;
   this.searches=0;this.detours=0;this.cachedSteps=0;this.noPath=0;this.trimmed=0;
   // A binary heap with the same order on equal keys as the source's std::priority_queue (MSVC),
   // so that ties break the same way and the games come out move for move the same.
   this.heapP=new Int32Array(4*n);this.heapK=new Int32Array(4*n);this.heapN=0;
   this.dist=new Int32Array(n);this.father=new Int32Array(n);
  }
  directedNeighbors(p){return this.roads[p];}
  push(p,key){
   const P=this.heapP,K=this.heapK;let at=this.heapN++;
   while(at){const up=(at-1)>>1;if(K[up]<=key)break;P[at]=P[up];K[at]=K[up];at=up;}
   P[at]=p;K[at]=key;
  }
  pop(){
   const P=this.heapP,K=this.heapK,out=P[0],n=--this.heapN,vp=P[n],vk=K[n];let at=0;
   if(!n)return out;
   while(2*at+2<n){let child=2*at+2;if(K[child]>K[child-1])child--;P[at]=P[child];K[at]=K[child];at=child;}
   if(2*at+1<n){const child=2*at+1;P[at]=P[child];K[at]=K[child];at=child;}
   while(at){const up=(at-1)>>1;if(K[up]<=vk)break;P[at]=P[up];K[at]=K[up];at=up;}
   P[at]=vp;K[at]=vk;return out;
  }
  // Each square's parent along the body (from the tail): -1 not on the body, -2 the tail's square.
  parents(body,length){
   const out=new Int32Array(this.squares).fill(-1);let parent=-2;
   for(let i=length-1;i>=0;i--){const s=this.square[body[i]];if(out[s]===-1)out[s]=parent;parent=s;}
   return out;
  }
  allowed(tree,p,q){
   if(!this.roads[p].includes(q))return false;
   const a=this.square[p],b=this.square[q];return a===b||tree[b]===-1||tree[a]===b;
  }
  manhattan(a,b){return Math.abs(a%this.w-b%this.w)+Math.abs(Math.floor(a/this.w)-Math.floor(b/this.w));}
  // A* from the head to the food over allowed moves; a move costs 1000, plus 499 within a square
  // the tree does not lead out of, plus 2400 into another square than the parent. Returns the path
  // backwards (food first, head left out), or null.
  astar(mask,tree){
   this.searches++;const n=this.n,dist=this.dist,father=this.father,head=this.body[0],goal=this.food,sq=this.square;
   dist.fill(MAX);father.fill(-1);this.heapN=0;dist[head]=0;this.push(head,1000*this.manhattan(head,goal));
   while(this.heapN){
    const p=this.pop();if(p===goal)break;
    for(const [dx,dy] of DIRS){
     const q=this.offset(p,dx,dy);if(q<0||mask[q]||!this.allowed(tree,p,q))continue;
     const penalty=sq[q]===tree[sq[p]]?0:sq[p]===sq[q]?499:2400,d=dist[p]+1000+penalty;
     if(d<dist[q]){dist[q]=d;father[q]=p;this.push(q,d+1000*this.manhattan(q,goal));}
    }
   }
   if(dist[goal]===MAX)return null;
   const back=[];for(let p=goal;p!==head;p=father[p]){if(back.length>=n||p<0)throw Error('Cell A* parent');back.push(p);}
   return back;
  }
  // This move, worked out once per step without changing anything: the remembered path is
  // handed on as (cache, count), never edited in place.
  decide(){
   if(this._decision&&this._decidedAt===this.steps)return this._decision;
   const n=this.n,body=this.body,head=body[0],L=body.length,occupied=new Uint8Array(n);for(const p of body)occupied[p]=1;
   let cache=this.cache,count=this.cacheCount;
   // d.route: where it is going (the remembered path from here, or the detour).
   const done=d=>{d.cache=cache;d.count=count;if(!d.route&&d.next>=0)d.route=[head,d.next,...cache.slice(0,count).reverse()];this._decision=d;this._decidedAt=this.steps;return d;};
   const mask=occupied.slice(),removed=roll.trim(this,body,L,mask),tree=this.parents(body,L-removed);
   const fallback=kind=>{
    if(count)return done({next:cache[--count],kind:'cached',why:kind});
    for(const [dx,dy] of DIRS){const q=this.offset(head,dx,dy);if(q>=0&&!occupied[q]&&this.allowed(tree,head,q))return done({next:q,kind:'step',why:kind});}
    return done({next:-1,kind:'stuck',why:kind});
   };
   let back=this.astar(mask,tree),future,futureMask,found=!!back;
   if(!back){
    if(count)return fallback('no-path');
    // The source's own probe: as if the head were already on the food (looked at, never moved).
    back=[this.food];future=[this.food,...body];futureMask=occupied.slice();futureMask[this.food]=1;
   }else{
    const r=roll.project(this,[head,...back.slice().reverse()]);
    if(!r)return fallback('rejected');
    future=r.body;futureMask=r.mask;
   }
   // After eating: which empty cells can the new head still reach, by allowed moves?
   const futureTree=this.parents(future,future.length),seen=new Uint8Array(n),queue=[future[0]];seen[future[0]]=1;
   for(let i=0;i<queue.length;i++){const p=queue[i];for(const [dx,dy] of DIRS){const q=this.offset(p,dx,dy);if(q<0||seen[q]||futureMask[q]||!this.allowed(futureTree,p,q))continue;seen[q]=1;queue.push(q);}}
   let unreachable=0,nearest=-1,best=MAX;
   for(let i=0;i<n;i++){const p=this.scan[i];if(!futureMask[p]&&!seen[p]){unreachable++;if(this.dist[p]<best){nearest=p;best=this.dist[p];}}}
   const path=found?[head,...back.slice().reverse()]:null;
   if(unreachable){
    if(nearest>=0&&nearest!==head){
     let p=nearest,guard=0;while(this.father[p]!==head){p=this.father[p];if(p<0||++guard>=n)throw Error('Cell detour parent');}
     const toward=[nearest];for(let q=nearest;this.father[q]!==-1&&q!==head;q=this.father[q])toward.push(this.father[q]);
     cache=[];count=0;return done({next:p,kind:'detour',unreachable,target:nearest,food:path,route:toward.reverse()});
    }
    if(count)return done({next:cache[--count],kind:'cached',why:'unreachable',unreachable,food:path});
   }
   cache=back.slice();count=back.length;
   return done({next:cache[--count],kind:found?'path':'probe',food:path,trimmed:removed});
  }
  plan(){return this.decide().next;}
  stateKey(){return this.cache.slice(0,this.cacheCount);}
  tick(){
   if(this.dead||this.food===-1)return false;
   const d=this.decide();this._decision=null;
   this.cache=d.cache;this.cacheCount=d.count;if(d.kind==='detour')this.detours++;if(d.kind==='cached')this.cachedSteps++;if(d.why==='no-path')this.noPath++;this.trimmed+=d.trimmed||0;
   const head=this.body[0],next=d.next,grow=next===this.food;
   if(next<0||!this.neighbors(head).includes(next)||(grow?this.body:this.body.slice(0,-1)).includes(next)){this.dead=true;return false;}
   this.body.unshift(next);if(grow){this.eaten++;this.spawn();}else this.body.pop();
   this.steps++;return true;
  }
 }
 const api={CellTreeSnake};if(node)module.exports=api;else root.CellTree=api;
})(typeof globalThis!=='undefined'?globalThis:this);
