'use strict';
// Play the film's games again with the lab's engine and compare them with the numbers in the video.
//   node web/check.js
// 8×8, walls (no wrapping). Seed 409 is the game the chapters follow, 395 the race at the end,
// and seeds 1–100 the averages. Exits with 1 if anything differs.
const fs = require('fs'), path = require('path'), vm = require('vm');

// The engine, loaded the way the page loads it: one shared global scope, files in order.
const ctx = vm.createContext({ console });
for (const f of ['snake.js', 'four-way.js', 'hybrid.js', 'bfs-handoff.js', 'adaptive.js', 'tiled-directed.js', 'simple-directed-graph.js', 'tiled-simple.js', 'c-directed.js'])
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'engine', f), 'utf8'), ctx, { filename: f });

// 莽夫: BFS straight at the food, no safety check (as in lab/play.js).
const GreedySnake = vm.runInContext(`(class extends TailSnake.Snake {
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
})`, ctx);

const SNAKES = [['greedy', '莽夫'], ['bfs-tail', '谨慎'], ['cycle', '循规蹈矩'], ['hybrid', '抄近路'], ['c-directed', '单行道'], ['tiled-directed', '步步为营']];
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
const expect = (what, got, want) => { const ok = got === want; if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${what}：${got}${ok ? '' : `（视频里是 ${want}）`}`); };
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

console.log(bad ? `\n${bad} 项和视频不一致` : '\n全部和视频一致');
process.exit(bad ? 1 : 0);
