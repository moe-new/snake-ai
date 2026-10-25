'use strict';
// Play the film's games again with the lab's engine and compare them with the numbers in the video;
// the same for the three snakes added since (动态回路, 可达保护, 加权 Cell).
//   node web/check.js
//   node web/check.js --c c/compare/snake-compare   also replay against the C comparison program, move by move
// 8×8, walls (no wrapping). Seed 409 is the game the chapters follow, 395 the race at the end,
// and seeds 1–100 the averages. Exits with 1 if anything differs.
const fs = require('fs'), path = require('path'), vm = require('vm'), { execFileSync } = require('child_process');

// The engine, loaded the way the page loads it: one shared global scope, files in order. (This
// script's own; a separate vm context would make every global lookup in the engine slow.)
const ctx = globalThis;
for (const f of ['snake.js', 'four-way.js', 'hybrid.js', 'bfs-handoff.js', 'adaptive.js', 'tiled-directed.js', 'simple-directed-graph.js', 'tiled-simple.js', 'c-directed.js', 'rollout.js', 'reachability-guard.js', 'local-cycle.js', 'cell-tree.js'])
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'engine', f), 'utf8'), { filename: f });

// 莽夫: BFS straight at the food, no safety check (as in lab/play.js).
const GreedySnake = vm.runInThisContext(`(class extends TailSnake.Snake {
  decide() {
    const path = this.bfs(this.body[0], this.food, new Set(this.body.slice(1)), this.body[1]);
    if (path) return { next: path[1], path };
    const next = this.escape();
    return next === null || next === undefined ? null : { next, path: null };
  }
  tick() {
    const d = this.decide();
    if (!d) { this.dead = true; return false; }
    const grow = d.next === this.food;
    if ((grow ? this.body : this.body.slice(0, -1)).includes(d.next)) { this.dead = true; return false; }
    this.body.unshift(d.next);
    if (grow) { this.eaten++; this.spawn(); } else this.body.pop();
    this.steps++;
    return true;
  }
})`);

const SNAKES = [['greedy', '莽夫'], ['bfs-tail', '谨慎'], ['cycle', '循规蹈矩'], ['hybrid', '抄近路'], ['c-directed', '单行道'], ['tiled-directed', '步步为营']];
const MORE = [['local-cycle', '动态回路'], ['reachability-guard', '可达保护'], ['cell-tree', '加权 Cell']];
// One game to its end: 'won', 'dead', or 'cycle' when a whole state comes back (it would go round for ever).
function play(id, seed, n = 8) {
  const g = id === 'greedy' ? new GreedySnake(n, n, seed, false) : ctx.HybridSnake.createGame(id, n, n, seed, false), seen = new Map();
  while (g.steps < 20000) {
    if (g.food === -1) return { outcome: 'won', steps: g.steps, length: g.body.length };
    if (g.dead) break;
    const key = JSON.stringify([g.body, g.food, g.rng, g.mode, g.route, g.active ?? -1, g.stateKey ? g.stateKey() : null]);
    if (seen.has(key)) return { outcome: 'cycle', steps: seen.get(key), length: g.body.length };
    seen.set(key, g.steps);
    const length = g.body.length;
    if (!g.tick()) { if (g.food === -1) return { outcome: 'won', steps: g.steps, length: g.body.length }; break; }
    if (g.body.length !== length) seen.clear();
  }
  return { outcome: 'dead', steps: g.steps, length: g.body.length };
}

let bad = 0;
const expect = (what, got, want) => { const ok = got === want; if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${what}：${got}${ok ? '' : `（应为 ${want}）`}`); };
const say = r => (r.outcome === 'won' ? `${r.steps} 步吃满` : r.outcome === 'dead' ? `第 ${r.steps} 步撞死` : `第 ${r.steps} 步起绕圈`);

console.log('种子 409（各章跟着的那一局）');
const g409 = { greedy: '第 155 步撞死', 'cycle': '1107 步吃满', hybrid: '591 步吃满', 'c-directed': '485 步吃满', 'tiled-directed': '523 步吃满' };
for (const [id, name] of SNAKES) if (g409[id]) expect(`  ${name}`, say(play(id, 409)), g409[id]);

console.log('种子 395（终章的比赛）');
const g395 = { greedy: '第 104 步撞死', 'bfs-tail': '第 119 步起绕圈', cycle: '1079 步吃满', hybrid: '643 步吃满', 'c-directed': '526 步吃满', 'tiled-directed': '445 步吃满' };
for (const [id, name] of SNAKES) expect(`  ${name}`, say(play(id, 395)), g395[id]);

console.log('种子 1–100');
const runs = Object.fromEntries(SNAKES.map(([id]) => [id, Array.from({ length: 100 }, (_, k) => play(id, k + 1))]));
const wins = id => runs[id].filter(r => r.outcome === 'won').length, mean = id => runs[id].reduce((s, r) => s + r.steps, 0) / 100;
expect('  莽夫吃满', `${wins('greedy')} 局`, '0 局');
expect('  莽夫平均占满', `${Math.round(runs.greedy.reduce((s, r) => s + r.length, 0) / 100 / 64 * 100)}%`, '42%');
expect('  谨慎吃满', `${wins('bfs-tail')} 局`, '2 局');
for (const [id, want] of [['cycle', '1010'], ['hybrid', '674'], ['c-directed', '558'], ['tiled-directed', '536']])
  expect(`  ${SNAKES.find(s => s[0] === id)[1]}：吃满 ${wins(id)} 局，平均步数`, mean(id).toFixed(0), want);
const fewer = runs['tiled-directed'].filter((r, k) => r.steps < runs['c-directed'][k].steps).length;
expect('  步步为营比单行道步数少的局数', String(fewer), '59');


console.log('\n后加的三条（视频里没有）');
const more409 = { 'local-cycle': '629 步吃满', 'reachability-guard': '465 步吃满', 'cell-tree': '431 步吃满' }, more395 = { 'local-cycle': '505 步吃满', 'reachability-guard': '421 步吃满', 'cell-tree': '459 步吃满' };
for (const [id, name] of MORE) expect(`  ${name}：种子 409`, say(play(id, 409)), more409[id]);
for (const [id, name] of MORE) expect(`  ${name}：种子 395`, say(play(id, 395)), more395[id]);
for (const [id, name, want] of [['local-cycle', '动态回路', '577.0'], ['reachability-guard', '可达保护', '483.2'], ['cell-tree', '加权 Cell', '468.5']]) {
  runs[id] = Array.from({ length: 100 }, (_, k) => play(id, k + 1));
  expect(`  ${name}：种子 1–100 吃满 ${wins(id)} 局，平均步数`, mean(id).toFixed(1), want);
}

// With --c: the C comparison program (c/compare) plays the same games; each move must be the same.
// Compared by the program's trace, a hash of (head, food, length) after every move.
const at = process.argv.indexOf('--c');
if (at > 0) {
  const bin = process.argv[at + 1], PRIME = 1099511628211n, MASK = (1n << 64n) - 1n;
  const PAIRS = [['cycle', 'fixed-cycle'], ['c-directed', 'oneway-bfs'], ['tiled-directed', 'tiled-certificate'], ['local-cycle', 'local-cycle'], ['reachability-guard', 'reachability-guard'], ['cell-tree', 'twanvl-cell-tail-manhattan']];
  const name = id => [...SNAKES, ...MORE].find(s => s[0] === id)[1];
  console.log(`\n和 C 对照程序逐步比对（${bin}）`);
  for (const [w, h, games] of [[8, 8, 100], [10, 10, 100], [30, 30, 3]]) for (const [id, cid] of PAIRS) {
    if (id === 'cycle' && w > 10) continue;
    const lines = execFileSync(bin, ['--algorithm', cid, '--width', String(w), '--height', String(h), '--seed', '1', '--games', String(games), '--trace']).toString().trim().split('\n').slice(1);
    let same = 0;
    for (const line of lines) {
      const [, seed, status, steps, , , trace] = line.split(' ');
      const g = ctx.HybridSnake.createGame(id, w, h, +seed, false);
      let hash = 1469598103934665603n, still = 0, mine = 'step-limit';
      while (g.food >= 0 && g.steps < 2000000) {
        if (still >= 8 * g.n) { mine = 'stall-budget'; break; }
        const length = g.body.length;
        if (!g.tick() || g.dead) { mine = 'dead'; break; }
        still = g.body.length !== length ? 0 : still + 1;
        for (const d of [g.body[0], g.food, g.body.length]) hash = ((hash ^ BigInt(d + 1)) * PRIME) & MASK;
      }
      if (g.food < 0) mine = 'full';
      if (mine === status && hash.toString(16).padStart(16, '0') === trace && (status !== 'full' || g.steps === +steps)) same++;
    }
    expect(`  ${w}×${h} ${name(id)}：种子 1–${games} 一步不差`, `${same} 局`, `${lines.length} 局`);
  }
}

console.log(bad ? `\n${bad} 项不一致` : '\n全部一致');
process.exit(bad ? 1 : 0);
