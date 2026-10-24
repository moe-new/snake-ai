(function (root) {
  'use strict';
  class Snake {
    constructor(width = 9, height = 9, seed = 1, wrap = true) {
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || width > 32 || height > 32) throw new Error('宽、高必须为 2–32 的整数');
      this.w = width; this.h = height; this.n = width * height; this.wrap = wrap;
      this.body = [1, 0]; this.rng = (seed >>> 0) || 1;
      this.steps = 0; this.eaten = 0; this.route = []; this.mode = 'tail'; this.dead = false;
      this.spawn();
    }
    random() { let x = this.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return this.rng = x >>> 0; }
    spawn() {
      const occupied = new Set(this.body), free = [];
      for (let p = 0; p < this.n; p++) if (!occupied.has(p)) free.push(p);
      this.food = free.length ? free[this.random() % free.length] : -1;
    }
    offset(p, dx, dy) {
      let x = p % this.w + dx, y = Math.floor(p / this.w) + dy;
      if (this.wrap) return ((y + this.h) % this.h) * this.w + (x + this.w) % this.w;
      return x >= 0 && y >= 0 && x < this.w && y < this.h ? y * this.w + x : -1;
    }
    neighbors(p) { return [...new Set([[1,0],[0,1],[-1,0],[0,-1]].map(([x,y]) => this.offset(p,x,y)).filter(q => q >= 0))]; }
    bfs(start, goal, blocked, banFirst = -1) {
      const prev = new Int32Array(this.n).fill(-2), queue = [start]; prev[start] = -1;
      for (let i = 0; i < queue.length; i++) {
        let p = queue[i];
        if (p === goal) {
          const path = [];
          while (p !== -1) { path.push(p); p = prev[p]; }
          return path.reverse();
        }
        for (const q of this.neighbors(p)) if (!blocked.has(q) && prev[q] === -2 && !(p === start && q === banFirst)) { prev[q] = p; queue.push(q); }
      }
      return null;
    }
    plan() {
      if (this.body.length === this.n-1 && this.neighbors(this.body[0]).includes(this.food)) {
        this.route = [this.body[0],this.food]; this.mode = 'finish'; return this.food;
      }
      const head = this.body[0], tail = this.body[this.body.length - 1], blocked = new Set(this.body.slice(1, -1));
      let route = this.bfs(head, tail, blocked, this.body[1]);
      if (!route) { this.route = []; this.mode = 'escape'; return this.escape(); }
      const foodPath = this.bfs(head,this.food,new Set(this.body.slice(1)),this.body[1]);
      if (foodPath) {
        const history = [...this.body].reverse().concat(foodPath.slice(1));
        const virtual = history.slice(-(this.body.length+1)).reverse();
        if (virtual.length === this.n || this.bfs(virtual[0],virtual[virtual.length-1],new Set(virtual.slice(1,-1)),virtual[1])) {
          this.route = foodPath; this.mode = 'shortest-food'; return foodPath[1];
        }
      }
      if (this.mode === 'tail' && this.route.length > 1) return this.route[1];
      // First establish a tail route; then insert food as a detour in that route.
      if (!route.includes(this.food)) {
        const reserved = new Set([...route, ...blocked]);
        for (let i = 0; i < route.length - 1; i++) {
          const a = route[i], b = route[i+1], obstacles = new Set(reserved); obstacles.delete(a); obstacles.delete(b);
          const first = this.bfs(a, this.food, new Set([...obstacles, b]), i === 0 ? this.body[1] : -1);
          if (!first) continue;
          const second = this.bfs(this.food, b, new Set([...obstacles, ...first.slice(0,-1)]));
          if (second) { route = [...route.slice(0,i), ...first, ...second.slice(1), ...route.slice(i+2)]; break; }
        }
      }
      const used = new Set([...route, ...blocked]);
      let i = 0;
      while (!route.includes(this.food) && i < route.length - 1) {
        const a = route[i], b = route[i+1];
        const turns = Math.floor(a/this.w) === Math.floor(b/this.w) ? [[0,-1],[0,1]] : [[-1,0],[1,0]];
        let extended = false;
        for (const [dx,dy] of turns) {
          const u = this.offset(a,dx,dy), v = this.offset(b,dx,dy);
          if (u >= 0 && v >= 0 && u !== v && !used.has(u) && !used.has(v) && !(i === 0 && u === this.body[1])) {
            route.splice(i+1,0,u,v); used.add(u); used.add(v); extended = true; break;
          }
        }
        if (!extended) i++;
      }
      this.mode = route.includes(this.food) ? 'food-on-tail-route' : 'tail';
      if (this.mode === 'food-on-tail-route') route = route.slice(0,route.indexOf(this.food)+1);
      this.route = route;
      return route[1];
    }
    escape() {
      let best = null, bestScore = -1;
      for (const p of this.neighbors(this.body[0])) {
        if (p === this.body[1] || (p === this.food ? this.body : this.body.slice(0,-1)).includes(p)) continue;
        const body = [p, ...(p === this.food ? this.body : this.body.slice(0,-1))];
        const blocked = new Set(body.slice(1)), seen = new Set([p]), queue = [p];
        for (let i = 0; i < queue.length; i++) for (const q of this.neighbors(queue[i])) if (!blocked.has(q) && !seen.has(q)) { seen.add(q); queue.push(q); }
        const score = seen.size * 2 + Number(p === this.food);
        if (score > bestScore) { best = p; bestScore = score; }
      }
      return best;
    }
    tick() {
      if (this.dead || this.food === -1) return false;
      const p = this.route.length > 1 && this.mode !== 'tail' ? this.route[1] : this.plan();
      if (p === null) { this.dead = true; return false; }
      const grow = p === this.food;
      if (p === this.body[1] || (grow ? this.body : this.body.slice(0,-1)).includes(p)) throw new Error('planner produced an illegal move');
      this.body.unshift(p);
      if (grow) { this.eaten++; this.spawn(); this.route = []; }
      else { this.body.pop(); if (this.route.length) this.route.shift(); }
      this.steps++; return true;
    }
  }
  function run(w,h,seed,steps,wrap=true) {
    const game = new Snake(w,h,seed,wrap);
    for (let i = 0; i < steps; i++) if (!game.tick()) break;
    return {steps:game.steps,length:game.body.length,food:game.food,head:game.body[0],rng:game.rng,won:game.food===-1,dead:game.dead,body:game.body};
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {Snake,run};
    if (require.main === module) {
      const args = process.argv.slice(2), value = (key, fallback) => args.includes(key) ? Number(args[args.indexOf(key)+1]) : fallback;
      const w=value('--width',9), h=value('--height',9), seed=value('--seed',1), steps=value('--steps',1000), repeat=value('--repeat',5), batch=value('--batch',20), wrap=!args.includes('--no-wrap');
      if (![steps,repeat,batch].every(Number.isInteger) || steps<1 || repeat<1 || repeat>100 || batch<1 || batch>1000) throw new Error('Invalid steps/repeat/batch');
      if (args.includes('--bench')) {
        for(let i=0;i<3;i++) run(w,h,seed,steps,wrap);
        const samples=[]; let result;
        for(let i=0;i<repeat;i++){ const start=process.hrtime.bigint(); for(let j=0;j<batch;j++) result=run(w,h,seed,steps,wrap); samples.push(Number(process.hrtime.bigint()-start)/1e6); }
        delete result.body; const sorted=[...samples].sort((a,b)=>a-b), mid=Math.floor(sorted.length/2);
        console.log(JSON.stringify({language:'JavaScript (Node.js)',batch,median_ms:sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2,samples_ms:samples,result}));
      } else console.log(JSON.stringify(run(w,h,seed,steps,wrap)));
    }
  } else root.TailSnake = {Snake,run};
})(typeof globalThis !== 'undefined' ? globalThis : this);

