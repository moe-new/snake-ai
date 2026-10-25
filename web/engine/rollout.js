(function(root){
 'use strict';
 // Two helpers shared by 可达保护 and 加权 Cell, translated from c/compare/src/game.c.
 // project(): the body after the head walks `path` (head first), exactly as the game would
 // move it, tail cells freeing as it goes. Null if a move is illegal or the path runs on past
 // the food. No food is drawn: the board after eating is looked at without the next apple.
 function project(g,path){
  const mask=new Uint8Array(g.n),history=g.body.slice().reverse();let first=0,length=g.body.length;
  for(const p of g.body)mask[p]=1;
  for(let i=1;i<path.length;i++){
   const p=path[i],grow=p===g.food;
   if(!g.neighbors(history.at(-1)).includes(p))return null;
   if(!grow)mask[history[first++]]=0;else length++;
   if(mask[p])return null;
   history.push(p);mask[p]=1;
   if(grow&&i+1<path.length)return null;
  }
  return {body:history.slice(-length).reverse(),mask};
 }
 // trim(): free the tail cells that will have left before the head could reach them. A body cell
 // i places from the head leaves in length − i moves; if that is no more than its Manhattan
 // distance from the head, the head cannot get there first. Counted from the tail, up to the
 // first cell that might still be there. Returns how many cells were freed in `mask`.
 function trim(g,body,length,mask){
  const head=body[0],hx=head%g.w,hy=Math.floor(head/g.w);let removed=0;
  for(let i=length-1;i>0;i--){
   const p=body[i],lower=Math.abs(hx-p%g.w)+Math.abs(hy-Math.floor(p/g.w));
   if(length-i>lower)break;
   mask[p]=0;removed++;
  }
  return removed;
 }
 const api={project,trim};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Rollout=api;
})(typeof globalThis!=='undefined'?globalThis:this);
