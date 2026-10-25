'use strict';
// The film's six snakes and three more from c/compare, run by the project's own engine
// (web/engine, inlined by build.js), and recorded move by move with why each move was made.

const SNAKES = [
  { id: 'greedy', name: '莽夫', en: 'GREEDY', line: '只认最短路，从不想吃完以后' },
  { id: 'bfs-tail', name: '谨慎', en: 'LOOK BEFORE YOU EAT', line: '先在脑子里试吃：回得到尾巴才吃' },
  { id: 'cycle', name: '循规蹈矩', en: 'HAMILTONIAN CYCLE', line: '沿一条走遍全盘的环线，一步不偏' },
  { id: 'hybrid', name: '抄近路', en: 'SHORTCUTS', line: '沿着环线，能跳就跳，只要不越过尾巴' },
  { id: 'c-directed', name: '单行道', en: 'ONE-WAY STREETS', line: '每格只开两个出口，找到路就敢吃' },
  { id: 'tiled-directed', name: '步步为营', en: 'ONE SAFE STEP AT A TIME', line: '吃之前先画好退路图：吃完整条躺在一条环线上' },
  { id: 'local-cycle', name: '动态回路', full: '局部动态回路', en: 'LOCAL CYCLE REPAIR', line: '沿一条环线走，但环线会改：每一步试着换两处接口，让食物更近', even: true },
  { id: 'reachability-guard', name: '可达保护', full: 'BFS＋可达性保护', en: 'REACHABILITY GUARD', line: '单行道的规则，吃之前多查一遍：吃完空地有没有被隔开' },
  { id: 'cell-tree', name: '加权 Cell', full: '加权 Cell＋安全尾段裁剪', en: 'WEIGHTED CELL TREE', line: '2×2 小格连成一棵树，只在树允许的方向上找最短路', even: true },
];
// 动态回路 and 加权 Cell are built on 2×2 squares and walls: both sides even, no wrapping.
const supports = (id, w, h, wrap) => !SNAKES.find(s => s.id === id).even || (!wrap && w % 2 === 0 && h % 2 === 0);

// Lv0 (莽夫): straight at the food by BFS, no safety check; when the food is out of reach, the
// neighbour that keeps the most room (the base class's escape()). As in the film, and in web/check.js.
class GreedySnake extends TailSnake.Snake {
  decide() {
    const path = this.bfs(this.body[0], this.food, new Set(this.body.slice(1)), this.body[1]);
    if (path) return { next: path[1], kind: 'food', path };
    const next = this.escape();
    return next === null || next === undefined ? null : { next, kind: 'escape', path: null };
  }
  tick() {
    if (this.dead || this.food < 0) return false;
    const d = this.decide();
    if (!d) { this.dead = true; return false; }
    const grow = d.next === this.food;
    if ((grow ? this.body : this.body.slice(0, -1)).includes(d.next)) { this.dead = true; return false; }
    this.body.unshift(d.next);
    if (grow) { this.eaten++; this.spawn(); } else this.body.pop();
    this.steps++; this.mode = d.kind;
    return true;
  }
}
const makeGame = (id, w, h, seed, wrap) => (id === 'greedy' ? new GreedySnake(w, h, seed, wrap) : HybridSnake.createGame(id, w, h, seed, wrap));

// The body once the head has followed `route` to the food and eaten it.
const afterEat = (body, route) => body.slice().reverse().concat(route.slice(1)).slice(-(body.length + 1)).reverse();
// From `from` forward along a loop (cells in order) to `to`, both included.
function along(loop, pos, from, to) {
  const out = [], n = loop.length;
  for (let k = pos.get(from), i = 0; i <= n; i++, k = (k + 1) % n) { out.push(loop[k]); if (loop[k] === to) return out; }
  return null;
}
const positions = loop => { const m = new Map(); loop.forEach((c, i) => m.set(c, i)); return m; };
// Along one-way roads from the head through empty cells to the tail.
function roadBack(g, body) {
  const to = body.at(-1), blocked = new Set(body.slice(0, -1)), prev = new Map([[body[0], -1]]), queue = [body[0]];
  for (let i = 0; i < queue.length; i++) for (const q of g.directedNeighbors(queue[i])) {
    if (prev.has(q) || (q !== to && blocked.has(q))) continue;
    prev.set(q, queue[i]);
    if (q === to) { const out = [q]; for (let c = queue[i]; c !== -1; c = prev.get(c)) out.push(c); return out.reverse(); }
    queue.push(q);
  }
  return null;
}

// Why the snake is about to make its next move: what it looked at, what it found, what it does.
// kind names the decision; cell lists are kept compact (Uint16Array). What can be worked out
// again from the board when it is drawn (the imagined body, the way back along a loop) is not kept.
const u16 = a => (a ? Uint16Array.from(a) : null);
function probe(id, g) {
  const body = g.body, head = body[0];
  if (id === 'greedy') {
    const d = g.decide();
    if (!d) return { kind: 'stuck' };
    return d.kind === 'food' ? { kind: 'food', route: u16(d.path), far: d.path.length - 1 - manhattan(g, head, g.food) } : { kind: 'escape' };
  }
  if (id === 'bfs-tail') {   // 谨慎's test: eat in imagination, then look for the tail
    const route = g.bfs(head, g.food, new Set(body.slice(1)));
    let back = null;
    if (route) { const ghost = afterEat(body, route); back = ghost.length === g.n ? [] : g.bfs(ghost[0], ghost.at(-1), new Set(ghost.slice(1, -1))); }
    const d = g.decide();
    if (!d) return { kind: 'stuck', route: u16(route) };
    return d.kind === 'food' ? { kind: 'food', route: u16(route), back: u16(back) } : { kind: 'tail', route: u16(route), back: u16(back), tail: u16(d.path) };
  }
  if (id === 'cycle' || id === 'hybrid') {   // along the ring; 抄近路 jumps ahead when it passes neither the food nor the tail
    const c = g.context(), choice = g.choose(), loop = g.cycles[g.active], plan = id === 'hybrid' && g.food >= 0 ? g.getPlan() : null;
    const kind = { 'hybrid-shortcut': 'jump', 'hybrid-wait': 'wait', 'hybrid-switch': 'switch', 'hybrid-finish': 'finish' }[choice.mode] || 'ring';
    return { kind, loop, route: plan ? u16(plan.path) : null, jump: kind === 'jump' ? g.distance(head, choice.next) : 1, ahead: c.foodDistance, late: !c.useShortcut, alt: c.options.filter(q => q !== c.base).length };
  }
  if (id === 'c-directed') {   // the C rule: a road to the food, and from there back to the tail, means eat; else follow the tail
    if (g.mode === 'c-disabled') return { kind: 'stuck', route: u16(g.route) };   // no road anywhere: it keeps to the route it had
    const route = g.searchInfo.foodPath ? g.searchInfo.foodPath.slice() : null, eats = g.mode === 'c-food';
    return { kind: eats ? (body.length + 1 >= g.n ? 'finish' : 'food') : 'tail', route: u16(route), back: u16(roadBack(g, eats ? afterEat(body, route) : body)) };
  }
  if (id === 'tiled-directed') {   // a plan whose eaten body lies on one loop (the way back), or keep to the loop it is on
    const p = g.prepare(), loop = p.layout ? p.layout.cycles[p.layout.active] : null, first = p.first ? p.first.mode : null;
    const kind = p.kind === 'bfs' ? (loop ? 'bfs' : 'finish') : first === 'tile-finish' ? 'finish' : first === 'tile-switch' ? 'switch' : p.kind;
    return { kind, route: p.path ? u16(p.path) : null, loop, eats: p.kind === 'bfs' && p.path && p.path.at(-1) === g.food };
  }
  if (id === 'local-cycle') {   // along its loop; where the head is on a port, a pair of swaps that brings the food closer
    const d = g.decide(), loop = d.swap || !g._loop ? (g._loop = Uint16Array.from(loopAfter(g, d))) : g._loop;
    return { kind: d.kind, loop, ahead: d.ahead, saved: d.saved || 0, tried: d.tried || 0, swap: d.swap ? u16(d.swap.source) : null };
  }
  if (id === 'reachability-guard') {   // the C rule's route, checked: once eaten, is every empty cell still reached?
    const d = g.decide(), c = g.mode === 'c-food' || g.mode === 'c-tail' ? g.mode : 'c-disabled';
    if (d.kind === 'safe') return { kind: body.length + 1 >= g.n ? 'finish' : 'food', route: u16(d.route), back: u16(roadBack(g, afterEat(body, Array.from(d.route)))) };
    if (d.kind === 'guard') return { kind: 'guard', route: u16(d.route), cut: u16(d.cut), cutOff: d.cutOff, tailBack: d.tailBack, next: d.next, missing: d.missing };
    if (d.kind === 'spread') return { kind: 'spread', next: d.next, missing: d.missing, from: c, choices: d.options.length };
    return { kind: d.kind, next: d.next, from: c, checked: !!d.checked, route: u16(d.route), cut: u16(d.cut) };   // relax / relaxed / no-safe
  }
  if (id === 'cell-tree') {   // A* inside the tree of squares; first to a cell that eating would cut off
    const d = g.decide();
    return { kind: d.kind, route: u16(d.route), food: u16(d.food), target: d.target ?? -1, unreachable: d.unreachable || 0, trimmed: d.trimmed || 0, why: d.why || null };
  }
  return { kind: '?' };
}
// 动态回路's loop as it will be for this move (the swap, if any, made), from the head.
function loopAfter(g, d) {
  const s = g.successor.slice();
  if (d.swap) d.swap.source.forEach((p, k) => { s[p] = d.swap.target[k]; });
  const out = [];
  for (let p = g.body[0], i = 0; i < g.n; i++, p = s[p]) out.push(p);
  return out;
}
const manhattan = (g, a, b) => {
  let dx = Math.abs(a % g.w - b % g.w), dy = Math.abs(Math.floor(a / g.w) - Math.floor(b / g.w));
  if (g.wrap) { dx = Math.min(dx, g.w - dx); dy = Math.min(dy, g.h - dy); }
  return dx + dy;
};

const ROADS = new Set(['c-directed', 'tiled-directed', 'reachability-guard', 'cell-tree']);   // the snakes kept to one-way roads

// One game, recorded in slices so the page never stalls. The snake's path is kept as the
// list of cells its head has been on (the body is always the last `len` of them).
class Recording {
  constructor(id, w, h, seed, wrap) {
    this.id = id; this.w = w; this.h = h; this.cells = w * h; this.seed = seed; this.wrap = wrap;
    this.maxSteps = Math.max(60000, this.cells * this.cells);   // 循规蹈矩 needs about cells² / 2
    this.why = []; this.ate = []; this.outcome = null; this.loop = null; this.seen = new Map();
    if (!supports(id, w, h, wrap)) { this.outcome = 'na'; this.heads = [0, 1]; this.lens = [2]; this.foods = [-1]; this.roads = null; return; }
    this.g = makeGame(id, w, h, seed, wrap);
    this.heads = [this.g.body[1], this.g.body[0]]; this.lens = [2]; this.foods = [this.g.food];
    this.roads = ROADS.has(id) ? Array.from({ length: this.cells }, (_, p) => this.g.directedNeighbors(p).slice()) : null;
  }
  get steps() { return this.lens.length - 1; }
  body(k) { const L = this.lens[k], out = new Array(L); for (let j = 0; j < L; j++) out[j] = this.heads[k + 1 - j]; return out; }
  advance(budgetMs = 8) {
    const g = this.g, t0 = performance.now();
    while (!this.outcome && performance.now() - t0 < budgetMs) {
      for (let i = 0; i < 25 && !this.outcome; i++) {
        if (g.food === -1) { this.outcome = 'won'; break; }
        if (g.dead) { this.outcome = 'dead'; break; }
        if (g.steps >= this.maxSteps) { this.outcome = 'limit'; break; }
        const key = JSON.stringify([g.body, g.food, g.rng, g.mode, g.route, g.active ?? -1, g.stateKey ? g.stateKey() : null]);
        if (this.seen.has(key)) { this.outcome = 'cycle'; this.loop = { start: this.seen.get(key), length: g.steps - this.seen.get(key) }; break; }
        this.seen.set(key, g.steps);
        const why = probe(this.id, g), len = g.body.length;
        if (!g.tick() || g.dead) { this.why.push(why); this.outcome = g.food === -1 ? 'won' : 'dead'; this.crash = g.collision ?? -1; break; }
        if (g.body.length !== len) this.seen.clear();
        this.why.push(why); this.ate.push(g.body.length !== len);
        this.heads.push(g.body[0]); this.lens.push(g.body.length); this.foods.push(g.food);
      }
    }
    if (!this.outcome && g.food === -1) this.outcome = 'won';
    return this.outcome;
  }
}
