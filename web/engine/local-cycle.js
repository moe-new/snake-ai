(function(root){
 'use strict';
 const node=typeof module!=='undefined'&&module.exports;
 const base=node?require('./snake.js'):root.TailSnake,tiles=node?require('./tiled-directed.js'):root.TiledDirected;
 // 动态回路 (局部动态回路), translated from c/compare/src/cycle.c. The snake always follows one
 // loop through every cell, but the loop is not fixed: where the head stands on a port between
 // two 2×2 squares, try swapping that port and one more nearby (within the 3×3 squares around
 // it) at once. Two swaps of a single loop can leave a single loop; keep the pair that does and
 // brings the food closest along it. Cells the body is on are never re-routed, so the body stays
 // on the loop and the way back to the tail is always the loop itself.

 // The starting loop: up and down the columns, home along the top row (c/compare's gb_cycle_build).
 function fullCycle(w,h){
  const n=w*h,c=[];
  for(let x=0;x<w;x++){if(x%2===0)for(let y=1;y<h;y++)c.push(y*w+x);else for(let y=h-1;y>=1;y--)c.push(y*w+x);}
  for(let x=w-1;x>=0;x--)c.push(x);
  let zero=c.indexOf(0);if(c[(zero+1)%n]!==1)c.reverse();
  zero=c.indexOf(0);return c.slice(zero).concat(c.slice(0,zero));
 }
 class LocalCycleSnake extends base.Snake{
  constructor(w=8,h=8,seed=1,wrap=false){
   super(w,h,seed,wrap);
   if(wrap||w%2||h%2)throw Error('动态回路需要宽、高都是偶数，不穿边');
   const n=this.n,cycle=fullCycle(w,h);this.network=tiles.buildTiles(w,h,false);
   this.successor=new Int32Array(n);cycle.forEach((p,i)=>{this.successor[p]=cycle[(i+1)%n];});
   this.order=new Int32Array(n);this.rank();
   const ports=this.network.ports;this.cellPort=new Int32Array(n).fill(-1);
   for(const p of ports){this.cellPort[p.u]=this.cellPort[p.x]=p.id;}
   const square=p=>[Math.floor(p%w/2),Math.floor(Math.floor(p/w)/2)];
   // The same bounded neighbourhood on every board: other ports within the 3×3 squares, at most 17.
   this.partners=ports.map(p=>{const[tx,ty]=square(p.u),out=[];for(const q of ports){if(q.id===p.id)continue;const[x,y]=square(q.u);if(Math.abs(x-tx)<=1&&Math.abs(y-ty)<=1&&out.length<17)out.push(q.id);}return out;});
   this._decision=null;this._decidedAt=-1;this.proposals=0;this.accepted=0;this.saved=0;this.version=0;
  }
  // Number every cell by its place along the loop, from the head.
  rank(){let p=this.body[0];for(let i=0;i<this.n;i++){this.order[p]=i;p=this.successor[p];}if(p!==this.body[0])throw Error('local cycle lost');}
  distance(a,b){return (this.order[b]-this.order[a]+this.n)%this.n;}
  loop(){const out=new Array(this.n);let p=this.body[0];for(let i=0;i<this.n;i++){out[i]=p;p=this.successor[p];}return out;}
  // A port's two cells swap their exits: the loop runs across to the next square, or back.
  toggle(id,on){
   const p=this.network.ports[id],head=this.body[0];
   if((on[p.u]&&p.u!==head)||(on[p.x]&&p.x!==head))return null;
   const s=this.successor;
   if(s[p.u]===p.v&&s[p.x]===p.y)return {source:[p.u,p.x],target:[p.y,p.v]};
   if(s[p.u]===p.y&&s[p.x]===p.v)return {source:[p.u,p.x],target:[p.v,p.y]};
   return null;
  }
  // Walk the loop with four exits changed: if it is still one loop through every cell, how far
  // the food is along it (-1 if it falls apart).
  candidate(source,target){
   for(let i=0;i<4;i++)for(let j=0;j<i;j++)if(source[i]===source[j])return -1;
   const n=this.n,head=this.body[0];let p=head,total=0,visited=0,food=-1;
   for(let it=0;it<5;it++){
    let chosen=-1,nearest=n;
    for(let k=0;k<4;k++){const d=this.distance(p,source[k]);if(d<nearest){chosen=k;nearest=d;}}
    const fd=this.distance(p,this.food);if(food<0&&fd<=nearest)food=total+fd;
    total+=nearest;
    if(visited&(1<<chosen))return source[chosen]===head&&total===n&&visited===15?food:-1;
    visited|=1<<chosen;total++;p=target[chosen];if(total>n)return -1;
   }
   return -1;
  }
  decide(){
   if(this._decision&&this._decidedAt===this.steps)return this._decision;
   const head=this.body[0],ahead=this.distance(head,this.food),d={ahead,kind:'ring',next:this.successor[head]};
   this._decision=d;this._decidedAt=this.steps;
   const on=new Uint8Array(this.n);for(const p of this.body)on[p]=1;
   const first=this.cellPort[head],a=first>=0?this.toggle(first,on):null;
   if(!a)return d;
   d.kind='tried';d.tried=0;let best=ahead,swap=null;
   for(const second of this.partners[first]){
    const b=this.toggle(second,on);if(!b)continue;d.tried++;
    const source=[...a.source,...b.source],target=[...a.target,...b.target],f=this.candidate(source,target);
    if(f>0&&f<best){best=f;swap={source,target,ports:[first,second]};}
   }
   if(swap){d.kind='swap';d.swap=swap;d.ahead=best;d.saved=ahead-best;const at=swap.source.indexOf(head);d.next=at>=0?swap.target[at]:this.successor[head];}
   return d;
  }
  plan(){return this.decide().next;}
  // The loop is part of the state (for spotting a game that goes round for ever); kept as a string, remade only when it changes.
  stateKey(){if(this._keyAt!==this.version){this._key=this.successor.join(',');this._keyAt=this.version;}return this._key;}
  tick(){
   if(this.dead||this.food===-1)return false;
   const d=this.decide();this._decision=null;this.proposals+=d.tried||0;
   if(d.swap){d.swap.source.forEach((p,k)=>{this.successor[p]=d.swap.target[k];});this.accepted++;this.saved+=d.saved;this.version++;this.rank();}
   const head=this.body[0],next=this.successor[head],grow=next===this.food;
   if(!this.neighbors(head).includes(next)||(grow?this.body:this.body.slice(0,-1)).includes(next)){this.dead=true;return false;}
   this.body.unshift(next);if(grow){this.eaten++;this.spawn();}else this.body.pop();
   this.steps++;return true;
  }
 }
 const api={LocalCycleSnake,fullCycle};if(node)module.exports=api;else root.LocalCycle=api;
})(typeof globalThis!=='undefined'?globalThis:this);
