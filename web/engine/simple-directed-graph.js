(function(root){
  'use strict';
  function buildSimpleGraph(w,h,wrap=false){
    const n=w*h,tiles=[],tileOf=new Int32Array(n);
    // These local successor maps are construction data only. The controller
    // receives allowed roads, not a global cycle or a runtime certificate.
    const next=Array.from({length:w%2&&h%2?2:1},()=>new Int32Array(n).fill(-1));
    const parts=n=>{const out=[];for(let start=0;start<n;){const size=n-start===3?3:2;out.push({start,size});start+=size;}return out;};
    for(const Y of parts(h))for(const X of parts(w)){
      const tile={x:X.start,y:Y.start,w:X.size,h:Y.size,id:tiles.length};tiles.push(tile);
      const cell=(x,y)=>(tile.y+y)*w+tile.x+x;
      for(let y=0;y<tile.h;y++)for(let x=0;x<tile.w;x++)tileOf[cell(x,y)]=tile.id;
      const corner=tile.w===3&&tile.h===3,ring=[];
      if(corner)for(const [x,y]of [[0,0],[1,0],[2,0],[2,1],[1,1],[1,2],[0,2],[0,1]])ring.push(cell(x,y));
      else{
        for(let x=0;x<tile.w;x++)ring.push(cell(x,0));
        for(let y=1;y<tile.h;y++)ring.push(cell(tile.w-1,y));
        for(let x=tile.w-2;x>=0;x--)ring.push(cell(x,tile.h-1));
        for(let y=tile.h-2;y>0;y--)ring.push(cell(0,y));
      }
      for(let phase=0;phase<next.length;phase++){
        const cycle=corner&&phase?ring.map(p=>p===cell(1,1)?cell(2,2):p):ring;
        for(let i=0;i<cycle.length;i++)next[phase][cycle[i]]=cycle[(i+1)%cycle.length];
      }
    }
    const roads=Array.from({length:n},()=>new Set());
    for(const variant of next)for(let p=0;p<n;p++)if(variant[p]>=0)roads[p].add(variant[p]);
    // Two opposite local edges u->v and x->y permit the paired crossings
    // u->y and x->v. Both local edges must exist in every 3x3 variant.
    const connect=(u,v,x,y)=>{
      if(next.every(variant=>variant[u]===v&&variant[x]===y)){
        roads[u].add(y);roads[x].add(v);
      }
    };
    for(let y=0;y<(wrap?h:h-1);y++)for(let x=0;x<(wrap?w:w-1);x++){
      const p=y*w+x,q=y*w+(x+1)%w,r=((y+1)%h)*w+x,s=((y+1)%h)*w+(x+1)%w;
      if(new Set([p,q,r,s]).size!==4)continue;
      if(tileOf[p]===tileOf[r]&&tileOf[q]===tileOf[s]&&tileOf[p]!==tileOf[q])connect(p,r,s,q);
      if(tileOf[p]===tileOf[q]&&tileOf[r]===tileOf[s]&&tileOf[p]!==tileOf[r])connect(q,p,r,s);
    }
    // Preserve the original graph's BFS tie order: vertical before
    // horizontal, then ascending cell index for two same-axis outlets.
    const vertical=(p,q)=>p%w===q%w;
    return {w,h,n,wrap,tiles,roads:roads.map((s,p)=>[...s].sort((a,b)=>Number(vertical(p,b))-Number(vertical(p,a))||a-b))};
  }
  const api={buildSimpleGraph};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SimpleDirectedGraph=api;
})(typeof globalThis!=='undefined'?globalThis:this);

