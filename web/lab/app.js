'use strict';
// 《退路》实验台: watch the nine snakes (the film's six and three more) play any opening (one game,
// step by step, with the lines that explain each move), or race all nine on the same opening.

const $ = (s, el = document) => el.querySelector(s);
const SPEEDS = [{ label: '慢', sps: 3 }, { label: '1×', sps: 8 }, { label: '4×', sps: 32 }, { label: '16×', sps: 128 }, { label: '64×', sps: 512 }];
const SIZES = [6, 8, 9, 10, 12, 16, 20, 30], SIDE = [3, 30];   // the presets, and the range of a custom side
const MARGIN = 34;   // board units around the board: its rim and the gold flash
// "{金} [红] <蓝>" → spans
const rich = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  .replace(/\{([^}]*)\}/g, '<b class="gold">$1</b>').replace(/\[([^\]]*)\]/g, '<b class="red">$1</b>').replace(/&lt;([^&]*)&gt;/g, '<b class="blue">$1</b>');

const S = {   // what the page shows
  view: 'single', snake: 'tiled-directed', n: 8, wrap: false, custom: false, cw: 8, ch: 8, seed: 409, raceSeed: 395, speed: 1, playing: true, lines: true, sound: false,
};
const side = (v, was = 8) => Math.max(SIDE[0], Math.min(SIDE[1], Math.round(+v) || was));
try { Object.assign(S, JSON.parse(localStorage.getItem('tuilu-lab') || '{}'), { playing: true }); } catch (e) { /* private mode: defaults */ }
S.cw = side(S.cw); S.ch = side(S.ch);
const save = () => { try { localStorage.setItem('tuilu-lab', JSON.stringify({ view: S.view, snake: S.snake, n: S.n, wrap: S.wrap, custom: S.custom, cw: S.cw, ch: S.ch, seed: S.seed, raceSeed: S.raceSeed, speed: S.speed, lines: S.lines })); } catch (e) { /* ignore */ } };
// The board's width and height: a preset square, or the custom size.
const dims = () => (S.custom ? [S.cw, S.ch] : [S.n, S.n]);

// ---- a canvas that keeps its backing store in step with its CSS size -----------------------
function fit(canvas) {
  const r = canvas.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1), w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return { w, h, dpr };
}
function boardTransform(ctx, canvas, B) {
  const { w, h } = fit(canvas), k = Math.min(w / (B.W + 2 * MARGIN), h / (B.H + 2 * MARGIN));
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
  ctx.setTransform(k, 0, 0, k, (w - B.W * k) / 2, (h - B.H * k) / 2);
  return k;
}

// ---- sound: the film's language, small (eat climbs with length, crash, full) -----------------
const Sound = (() => {
  let ac = null;
  const PENTA = [0, 2, 4, 7, 9], note = d => 440 * Math.pow(2, (72 + PENTA[((d % 5) + 5) % 5] + 12 * Math.floor(d / 5) - 69) / 12);
  const env = (g, t, a, peak, decay) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + decay); };
  function tone(f, t, { type = 'sine', peak = 0.2, decay = 0.25, a = 0.003 } = {}) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f; env(g, t, a, peak, decay);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + a + decay + 0.05);
  }
  return {
    on() { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); },
    eat(p) { if (!ac || !S.sound) return; const t = ac.currentTime, f = note(Math.round(p * 10)); tone(f, t, { peak: 0.16, decay: 0.28 }); tone(f * 4, t, { peak: 0.03, decay: 0.04 }); },
    crash() { if (!ac || !S.sound) return; const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.25); env(g, t, 0.003, 0.5, 0.35); o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.45); },
    full() { if (!ac || !S.sound) return; const t = ac.currentTime; [0, 7, 12, 16].forEach((s, k) => tone(523.25 * Math.pow(2, s / 12), t + 0.06 * k, { peak: 0.12, decay: 1.2 })); },
  };
})();

// ---- explaining a move -------------------------------------------------------------------------
function whyText(id, w, rec, k) {
  if (!w) return '';
  const steps = p => (p ? p.length - 1 : 0);
  switch (id) {
    case 'greedy':
      if (w.kind === 'food') return w.far > 0 ? `最短路 <${steps(w.route)} 步> 去吃：身子挡在中间，[绕了 ${w.far} 步]` : `最短路 <${steps(w.route)} 步>，直奔食物`;
      if (w.kind === 'escape') return '[够不着食物]：往空地最多的方向走';
      return '[无路可走]';
    case 'bfs-tail':
      if (w.kind === 'food') return `试吃 <${steps(w.route)} 步>：吃完{回得到尾巴} → 去吃`;
      if (w.kind === 'tail' && w.route) return '试吃：吃完[回不到尾巴] → 先{追着尾巴}走';
      if (w.kind === 'tail') return '[够不着食物] → {追着尾巴}走';
      return '[无路可走]';
    case 'cycle':
    case 'hybrid':
      if (w.kind === 'jump') return `<抄近路>：往前跳 ${w.jump} 格，既不越过食物，也{不越过尾巴}`;
      if (w.kind === 'wait') return '食物在道岔留下的那格：先沿环线等，时机到了再{扳道岔}';
      if (w.kind === 'switch') return '扳{道岔}：换一条环线，去吃留下的那格';
      if (w.kind === 'finish') return '最后一口，{不需要退路}';
      if (id === 'cycle') return `沿环线走：食物在前方 ${w.ahead} 步，{退路}一直通到尾巴`;
      if (w.late) return `身子占满六成五以后，{不再抄近路}，只沿环线走（食物在前方 ${w.ahead} 步）`;
      if (w.ahead === 1) return '沿环线走一步，就吃到';
      return w.alt ? `沿环线走：试过往前跳，不会更快（食物在前方 ${w.ahead} 步）` : `沿环线走：旁边没有能跳的近路，不能越过食物，也[不能越过尾巴]（食物在前方 ${w.ahead} 步）`;
    case 'c-directed':
      if (w.kind === 'food') return `沿单行道找到路 <${steps(w.route)} 步> → {就吃}${rec.w % 2 || rec.h % 2 || rec.wrap ? '：试吃过，吃完{回得到尾巴}' : '：吃完蛇头总能绕回尾巴'}`;
      if (w.kind === 'finish') return '最后一口，{不需要退路}';
      if (w.kind === 'tail' && w.route) return '找到路，可试吃：吃完[回不到尾巴] → 先{跟着尾巴}走';
      if (w.kind === 'tail') return '单行道上[没有路]通到食物 → {跟着尾巴}走，等路通';
      if (w.kind === 'stuck') return '[走投无路]：去食物、回尾巴，单行道上都没有路了 → 只能照着记下的路走';
      return '';
    case 'tiled-directed':
      if (w.kind === 'bfs') return `画出{退路图} → 吃 <${steps(w.route)} 步>：吃完整条躺在一条环线上`;
      if (w.kind === 'fallback') return '[画不出退路图] → 沿{原来的环线}走，不冒险';
      if (w.kind === 'finish') return '最后一口，{不需要退路}：吃完棋盘就满了';
      return w.kind === 'switch' ? '扳{道岔}：换一条环线，去吃留下的那格' : '沿环线走';
    case 'local-cycle':
      if (w.kind === 'swap') return `{改道}：换掉两处接口，环线还是一整条，食物近了 ${w.saved} 步（在前方 <${w.ahead} 步>）`;
      if (w.ahead === 1) return '沿环线走一步，就吃到';
      if (w.kind === 'tried') return w.tried ? `试了 ${w.tried} 种换法，[都没有更近] → 沿环线走（食物在前方 ${w.ahead} 步）` : `脚下的接口能换，附近的[都有身子占着] → 沿环线走（食物在前方 ${w.ahead} 步）`;
      return `沿环线走：食物在前方 ${w.ahead} 步，{退路}就是这条环线`;
    case 'reachability-guard':
      if (w.kind === 'food') return `沿单行道找到路 <${steps(w.route)} 步>，试吃：空地{连成一片}，回得到尾巴 → 去吃`;
      if (w.kind === 'finish') return '最后一口，{不需要退路}';
      if (w.kind === 'guard') return `试吃：吃完会有 [${w.cutOff} 格空地被隔开]${w.tailBack ? '' : '，也[回不到尾巴]'} → 换个出口，${w.missing ? `隔开的最少（${w.missing} 格）` : '{空地不被隔开}'}`;
      if (w.kind === 'spread') return `${w.from === 'c-disabled' ? '单行道上[没有路]' : '去吃的路吃完回不到尾巴'} → 挑个出口：${w.missing ? `隔开的空地最少（${w.missing} 格）` : '{空地不被隔开}'}，离尾巴最远`;
      if (w.kind === 'relax') return `[${2 * rec.cells} 步没吃到]：放下检查，照单行道的原规则走，吃到为止`;
      if (w.kind === 'relaxed') return '检查暂时放下：照单行道的原规则走，吃到下一口再恢复';
      if (w.kind === 'no-safe') return w.checked ? '[每个出口都会隔开空地]，只好照原来的路去吃' : '[每个出口都不安全] → 照单行道的原规则走';
      return '';
    case 'cell-tree':
      if (w.kind === 'path') return `树里找到路 <${steps(w.route)} 步>，试吃：吃完每格空地都{还到得了} → 去吃${w.trimmed ? `（尾巴最后 ${w.trimmed} 格会先让开，当作空地）` : ''}`;
      if (w.kind === 'detour') return `试吃：吃完有 [${w.unreachable} 格到不了] → 先绕去最近的那格，{别把它关在外面}`;
      if (w.kind === 'cached') return w.why === 'no-path' ? `这一步树里[找不到路] → 照记下的路走（还剩 ${steps(w.route)} 步）`
        : w.why === 'unreachable' ? `吃完会有 [${w.unreachable} 格到不了]，又没处可绕 → 照记下的路走` : `照记下的路走（还剩 <${steps(w.route)} 步>）`;
      if (w.kind === 'step') return '[找不到路] → 往树允许的方向先走一步';
      if (w.kind === 'probe') return '树里[没有去食物的路]';
      return '[无路可走]';
  }
  return '';
}
// Once a game is over: how it ended, and why.
function endText(id, r) {
  if (r.outcome === 'won') return `{吃满}：${r.steps} 步走满 ${r.cells} 格。往回拖进度条，看每一步怎么选的`;
  if (r.outcome === 'limit') return `走了 ${r.steps} 步还没吃满，先停在这里`;
  if (r.outcome === 'na') return naText(id);
  if (id === 'c-directed' || id === 'reachability-guard') return `[撞死]：单行道上没有路了，照着记下的路往前走，撞上了${r.crash >= 0 ? '自己' : '墙'}`;
  return `[撞死]：四面${r.wrap ? '都' : '不是墙就'}是自己的身子，出口被自己堵死了。往回拖，看是哪一口吃坏的`;
}
// 动态回路 and 加权 Cell: why this board will not do.
const naText = id => `${SNAKES.find(s => s.id === id).name}：用 2×2 小格拼棋盘，要[宽、高都是偶数、不穿边]。换一块棋盘试试`;
// The one-way streets need both sides even; a loop through every cell needs an even number of cells.
function hintFor(id, w, h, wrap) {
  const odd = (w * h) % 2;
  if (!supports(id, w, h, wrap)) return naText(id) + '。';
  if ((id === 'c-directed' || id === 'reachability-guard') && (w % 2 || h % 2)) return wrap ? '有一边是奇数：穿边以后每格都进得去、出得来，但单行道[没有保证]了，多半还是撞死。'
    : '有一边是奇数：单行道有的格子[进不去]，有的[出不来]，多半撞死（视频第 07 章）。';
  if ((id === 'cycle' || id === 'hybrid') && odd) return '格子数是奇数，画不出走遍全盘的环线：这里用两条环线，靠{道岔}换着走。';
  if (id === 'tiled-directed' && odd) return '格子数是奇数：小环拼成环线，留下的那格放在{道岔}上，最后一口吃掉它。';
  if (wrap) return '穿边：从一边出去，从对边回来。';
  return '';
}

// ---- one game -----------------------------------------------------------------------------------
const Single = {
  rec: null, B: null, p: 0, ended: false, flash: 0,
  start() {
    const [w, h] = dims(); this.rec = new Recording(S.snake, w, h, S.seed, S.wrap); this.B = new Board(w, h, S.wrap);
    this.p = 0; this.ended = false; this.flash = 0; S.playing = true;
    renderControls();
  },
  // the state shown at playhead p (circling snakes keep going round their loop)
  at(p) {
    const r = this.rec;
    let k = Math.floor(p), f = p - k;
    if (r.outcome === 'cycle' && k >= r.loop.start) k = r.loop.start + ((k - r.loop.start) % r.loop.length);
    else if (k >= r.steps) { k = r.steps; f = 0; }
    return { k, f };
  },
  tick(dt) {
    const r = this.rec;
    if (!r.outcome) r.advance(6);
    if (!S.playing) return;
    const sps = SPEEDS[S.speed].sps, end = r.outcome === 'cycle' ? Infinity : r.outcome ? r.steps : r.steps - 1;
    const before = this.p;
    this.p = Math.min(end, this.p + sps * dt);
    // meals passed since the last frame make a sound
    if (sps <= 32) for (let k = Math.floor(before); k < Math.floor(this.p) && k < r.ate.length; k++) { const kk = this.at(k).k; if (r.ate[kk]) Sound.eat((r.lens[kk + 1] - 2) / (r.cells - 2)); }
    if (r.outcome && r.outcome !== 'cycle' && this.p >= r.steps && !this.ended) {
      this.ended = true; S.playing = false; renderControls();
      if (r.outcome === 'won') { this.flash = performance.now() / 1000; Sound.full(); } else if (r.outcome === 'dead') Sound.crash();
    }
  },
  draw() {
    const cv = $('#board'), ctx = cv.getContext('2d'), r = this.rec, B = this.B, now = performance.now() / 1000;
    boardTransform(ctx, cv, B);
    drawBase(ctx, B);
    const { k, f } = this.at(this.p), body = r.body(k), next = k < r.steps ? r.body(k + 1) : null, w = r.why[k], sps = SPEEDS[S.speed].sps;
    const calm = sps <= 8 ? 1 : sps <= 32 ? 0.75 : 0.35, lines = S.lines && w, ringy = S.snake === 'cycle' || S.snake === 'hybrid' || S.snake === 'local-cycle';
    const eatsAt = w && w.route && w.route.length > 1 && w.route[w.route.length - 1] === r.foods[k];
    const ghost = w && w.route && (w.kind === 'food' || w.kind === 'tail' || w.eats || ((w.kind === 'guard' || w.kind === 'path') && eatsAt)) && w.route.length > 1 ? afterEat(body, Array.from(w.route)) : null;
    if (lines && r.roads) drawRoads(ctx, B, r.roads, S.snake === 'c-directed' || S.snake === 'reachability-guard' ? 0.45 : 0.22);
    if (lines && S.snake === 'cell-tree') drawSquareTree(ctx, B, body, body.length - (w.trimmed || 0), 0.5 * calm);
    if (lines) {
      if (w.loop) drawLoop(ctx, B, w.loop, { alpha: S.snake === 'tiled-directed' ? 0.9 * calm : 0.32, width: S.snake === 'tiled-directed' ? 3 : 2.4 });
      if (ringy && w.loop) {   // the way back: from the head forward along the ring to the tail; and, for 循规蹈矩, the way to the food
        const pos = positions(w.loop), back = pos.has(body[0]) && pos.has(body.at(-1)) ? along(w.loop, pos, body[0], body.at(-1)) : null;
        if (back && back.length > 1) drawPath(ctx, B, back, C.gold, { width: 4, alpha: 0.7 * calm });
        if ((S.snake === 'cycle' || S.snake === 'local-cycle') && r.foods[k] >= 0 && pos.has(r.foods[k])) drawPath(ctx, B, along(w.loop, pos, body[0], r.foods[k]), C.blue, { width: 6, alpha: calm });
        if (w.swap) for (const c of w.swap) { const [x, y] = B.xy(c); glowDot(ctx, x, y, 40, C.gold, 0.7 * calm); }
      }
      if (w.cut) for (const c of w.cut) { const [x, y] = B.xy(c); cross(ctx, x, y, 9, C.red, 0.6 * calm, 3.5); }
      if ((w.kind === 'spread' || w.kind === 'guard') && w.next >= 0) drawPath(ctx, B, [body[0], w.next], C.gold, { width: 6, alpha: calm });
      if (S.snake === 'cell-tree' && w.kind === 'detour') {
        if (w.food) drawPath(ctx, B, w.food, C.red, { width: 3, alpha: 0.45 * calm });
        if (w.target >= 0) { const [x, y] = B.xy(w.target); cross(ctx, x, y, 16, C.red, 0.9 * calm); }
      }
      if (w.route && w.route.length > 1 && w.kind !== 'tail' && w.kind !== 'spread') drawPath(ctx, B, w.route, w.kind === 'stuck' || w.kind === 'guard' ? C.red : w.kind === 'detour' ? C.gold : C.blue, { width: 5, alpha: 0.9 * calm });
      if (w.kind === 'tail' && w.tail) drawPath(ctx, B, w.tail, C.gold, { width: 4, alpha: 0.85 * calm });
      if ((S.snake === 'bfs-tail' || S.snake === 'c-directed' || S.snake === 'reachability-guard') && w.back && w.back.length > 1 && sps <= 32) drawPath(ctx, B, w.back, C.gold, { width: 4, alpha: 0.8 * calm });
    }
    drawApple(ctx, B, r.foods[k], now);
    // the imagined body (eaten in imagination) only while stepping or slow, with the real one stepped back
    const dead = r.outcome === 'dead' && k >= r.steps ? 1 : 0, imagine = lines && ghost && w.kind !== 'tail' && (!S.playing || sps <= 3) ? 1 : 0;
    if (r.outcome !== 'na') drawSnake(ctx, B, body, next, f, { dead, dim: 0.55 * imagine });
    if (imagine) drawGhost(ctx, B, ghost, 0.8);
    if (lines && w.kind === 'tail' && ghost && S.snake === 'bfs-tail' && sps <= 32) { const [x, y] = B.xy(ghost[0]); cross(ctx, x, y, 18, C.red, 0.9 * calm); }
    // bites: a gold ring off the head for half a second of play (by the playhead, so scrubbing shows them too)
    const span = Math.max(1, sps * 0.5), pk = this.p;
    if (sps <= 32) for (let j = Math.max(0, Math.floor(pk - span)); j <= Math.floor(pk) && j < r.ate.length; j++) {
      if (!r.ate[j]) continue;
      const u = (pk - (j + 1)) / span;
      if (u < 0 || u > 1) continue;
      const [x, y] = B.xy(r.heads[j + 2]); ctx.save(); ctx.strokeStyle = rgba(C.gold, 0.85 * (1 - u)); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 18 + 52 * outCubic(u), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    if (this.flash) drawFullFlash(ctx, B, (now - this.flash) / 0.9);
    if (dead) { const [x, y] = B.xy(body[0]); glowDot(ctx, x, y, 110, C.red, 0.35); if (r.crash >= 0) { const [cx, cy] = B.xy(r.crash); cross(ctx, cx, cy, 16, C.red, 0.95); } }
    // text
    $('#len').textContent = r.outcome === 'na' ? '—' : body.length; $('#cells').textContent = `/ ${r.cells}`;
    $('#step').textContent = `第 ${k} 步`;
    $('#why').innerHTML = sps > 32 && S.playing ? '<span class="dim">快进中</span>' : rich(r.outcome && k >= r.steps && r.outcome !== 'cycle' ? endText(S.snake, r) : whyText(S.snake, w, r, k));
    const banner = $('#banner'), out = r.outcome === 'cycle' && this.p >= r.loop.start + r.loop.length ? 'cycle' : r.outcome && r.outcome !== 'cycle' && k >= r.steps ? r.outcome : null;
    banner.className = out ? `banner show ${out}` : 'banner';
    if (out) banner.innerHTML = out === 'na' ? '<b>不适用</b><span>宽、高都要是偶数，不穿边</span>' : out === 'won' ? `<b>吃满</b><span>${r.steps} 步 · 吃了 ${r.lens[r.steps] - 2} 口</span>`
      : out === 'dead' ? `<b>撞死</b><span>${r.lens[r.steps]} / ${r.cells} · 第 ${r.steps} 步</span>`
      : out === 'cycle' ? `<b>原地绕圈</b><span>${r.lens[r.loop.start]} / ${r.cells} · 第 ${r.loop.start} 步起，每 ${r.loop.length} 步一圈</span>`
      : `<b>到上限了</b><span>${r.steps} 步</span>`;
    drawScrubber();
  },
};

// The scrubber: the whole game as a track, meals as gold ticks, the recorded part lit.
function drawScrubber() {
  const cv = $('#scrub'), ctx = cv.getContext('2d'), { w, h, dpr } = fit(cv), r = Single.rec;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
  const pad = 10 * dpr, x0 = pad, x1 = w - pad, y = h / 2, total = Math.max(r.steps, 1), X = k => x0 + (x1 - x0) * Math.min(1, k / total);
  const done = !!r.outcome, est = done ? total : total * 1.15;
  const XX = k => x0 + (x1 - x0) * Math.min(1, k / est);
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 6 * dpr; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  ctx.strokeStyle = 'rgba(142,166,216,0.35)'; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(XX(r.steps), y); ctx.stroke();
  ctx.fillStyle = rgba(C.gold, 0.8);
  let lastX = -1;
  r.ate.forEach((a, k) => { if (!a) return; const x = XX(k + 1); if (x - lastX < 2 * dpr) return; lastX = x; ctx.fillRect(x - 0.75 * dpr, y - 7 * dpr, 1.5 * dpr, 14 * dpr); });
  const p = Math.min(Single.p, r.steps), px = XX(p);
  ctx.strokeStyle = rgba(C.text, 0.9); ctx.lineWidth = 6 * dpr; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(px, y); ctx.stroke();
  ctx.fillStyle = rgba(C.text); ctx.beginPath(); ctx.arc(px, y, 8 * dpr, 0, Math.PI * 2); ctx.fill();
  if (done && r.outcome !== 'na') { ctx.fillStyle = rgba(r.outcome === 'won' ? C.gold : C.red); ctx.beginPath(); ctx.arc(x1, y, 5 * dpr, 0, Math.PI * 2); ctx.fill(); }
  return { x0: x0 / dpr, x1: x1 / dpr, est };
}

// ---- the race: six snakes, one opening ------------------------------------------------------
const Race = {
  recs: [], B: null, s: 0, flashes: {}, done: false,
  start() {
    const [w, h] = dims(); this.recs = SNAKES.map(sn => new Recording(sn.id, w, h, S.raceSeed, S.wrap)); this.B = new Board(w, h, S.wrap);
    this.s = 0; this.flashes = {}; this.done = false; S.playing = true;
    $('#racegrid').innerHTML = SNAKES.map((sn, j) => `<div class="card" data-j="${j}"><canvas></canvas><div class="name">${sn.name}</div><div class="status" id="rs${j}">0 步</div></div>`).join('');
    $('#results').innerHTML = '';
    renderControls();
  },
  endOf: r => (!r.outcome ? Infinity : r.outcome === 'cycle' ? r.loop.start : r.steps),
  tick(dt) {
    for (const r of this.recs) if (!r.outcome) r.advance(3);
    if (!S.playing) return;
    const sps = SPEEDS[S.speed].sps, limit = Math.min(...this.recs.map(r => (r.outcome ? Infinity : r.steps - 1)));
    const before = this.s;
    this.s = Math.min(limit, this.s + sps * dt);
    this.recs.forEach((r, j) => {
      const e = this.endOf(r);
      if (before < e && this.s >= e && r.outcome !== 'cycle') { this.flashes[j] = performance.now() / 1000; if (r.outcome === 'won') Sound.full(); else if (r.outcome === 'dead') Sound.crash(); }
    });
    const last = Math.max(...this.recs.map(r => (r.outcome === 'won' || r.outcome === 'dead' || r.outcome === 'limit' || r.outcome === 'na' ? r.steps : r.outcome === 'cycle' ? r.loop.start : Infinity)));
    if (this.s >= last && !this.done) { this.s = last; this.done = true; S.playing = false; this.results(); renderControls(); }
  },
  results() {
    const rows = this.recs.map((r, j) => ({ j, r })), won = rows.filter(x => x.r.outcome === 'won').sort((a, b) => a.r.steps - b.r.steps), rest = rows.filter(x => x.r.outcome !== 'won');
    $('#results').innerHTML = [...won.map((x, i) => `<li class="${i ? '' : 'first'}"><span class="rank">${i + 1}</span><span>${SNAKES[x.j].name}</span><span class="num">${x.r.steps} 步吃满</span></li>`),
      ...rest.map(x => `<li class="out"><span class="rank">—</span><span>${SNAKES[x.j].name}</span><span class="num">${x.r.outcome === 'dead' ? `撞死 · ${x.r.lens[x.r.steps]} 格` : x.r.outcome === 'cycle' ? `原地绕圈 · ${x.r.lens[x.r.loop.start]} 格` : x.r.outcome === 'na' ? '这块棋盘不适用' : '到上限'}</span></li>`)].join('');
  },
  draw() {
    const now = performance.now() / 1000;
    this.recs.forEach((r, j) => {
      const card = $(`.card[data-j="${j}"]`), cv = card.querySelector('canvas'), ctx = cv.getContext('2d'), B = this.B;
      boardTransform(ctx, cv, B); drawBase(ctx, B);
      const e = this.endOf(r);
      let k = Math.floor(this.s), f = this.s - k;
      if (r.outcome === 'cycle' && k >= r.loop.start) k = r.loop.start + ((k - r.loop.start) % r.loop.length);
      else if (k >= r.steps) { k = r.steps; f = 0; }
      const over = r.outcome && r.outcome !== 'cycle' && this.s >= r.steps;
      drawApple(ctx, B, r.foods[k], now);
      if (r.outcome !== 'na') drawSnake(ctx, B, r.body(k), k < r.steps ? r.body(k + 1) : null, f, { dead: over && r.outcome === 'dead' ? 1 : 0 });
      if (this.flashes[j] && r.outcome === 'won') drawFullFlash(ctx, B, (now - this.flashes[j]) / 0.9);
      card.className = `card ${over ? r.outcome : r.outcome === 'cycle' && this.s >= e ? 'cycle' : ''}`;
      const len = r.lens[k], rank = over && r.outcome === 'won' ? 1 + this.recs.filter(q => q.outcome === 'won' && q.steps < r.steps && this.s >= q.steps).length : 0;
      $(`#rs${j}`).textContent = over ? (r.outcome === 'won' ? `第 ${rank} · ${r.steps} 步吃满` : r.outcome === 'dead' ? `撞死 · ${len} / ${r.cells}` : r.outcome === 'na' ? '不适用' : `${r.steps} 步`)
        : r.outcome === 'cycle' && this.s >= e ? `绕圈 · ${len} / ${r.cells}` : `${Math.floor(Math.min(this.s, r.steps))} 步 · ${len} 格`;
    });
    $('#racestep').textContent = `第 ${Math.floor(this.s)} 步`;
  },
};

// ---- controls ---------------------------------------------------------------------------------
function renderControls() {
  document.body.dataset.view = S.view;
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === S.view)));
  const sn = SNAKES.find(x => x.id === S.snake);
  $('#name').textContent = sn.name; $('#en').textContent = sn.en; $('#line').textContent = sn.full ? `${sn.full}：${sn.line}` : sn.line;
  const [bw, bh] = dims();
  document.querySelectorAll('.chip').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.id === S.snake)); b.classList.toggle('na', !supports(b.dataset.id, bw, bh, S.wrap)); });
  document.querySelectorAll('[data-size]').forEach(b => b.setAttribute('aria-pressed', String(!S.custom && +b.dataset.size === S.n)));
  $('#wrap').checked = S.wrap; $('#custom').checked = S.custom; $('#dims').hidden = !S.custom; $('#cw').value = S.cw; $('#ch').value = S.ch; $('#lines').checked = S.lines; $('#sound').setAttribute('aria-pressed', String(S.sound));
  $('#seed').value = S.view === 'race' ? S.raceSeed : S.seed;
  document.querySelectorAll('.play').forEach(b => { b.setAttribute('aria-label', S.playing ? '暂停' : '播放'); b.dataset.state = S.playing ? 'pause' : 'play'; });
  document.querySelectorAll('.speed').forEach(b => { b.textContent = SPEEDS[S.speed].label; });
  $('#hint').innerHTML = S.view === 'single' ? rich(hintFor(S.snake, ...dims(), S.wrap)) : '';
}
const restart = () => { save(); (S.view === 'race' ? Race : Single).start(); };
function bind() {
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { if (S.view !== b.dataset.view) { S.view = b.dataset.view; restart(); } }));
  document.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => { S.snake = b.dataset.id; restart(); }));
  document.querySelectorAll('[data-size]').forEach(b => b.addEventListener('click', () => { S.n = +b.dataset.size; S.custom = false; restart(); }));
  $('#wrap').addEventListener('change', e => { S.wrap = e.target.checked; restart(); });
  // a custom size starts from the board on screen; the game restarts only once the size changes
  $('#custom').addEventListener('change', e => {
    const before = dims().join();
    S.custom = e.target.checked;
    if (S.custom) S.cw = S.ch = S.n;
    if (dims().join() !== before) restart(); else { save(); renderControls(); }
  });
  for (const id of ['cw', 'ch']) $(`#${id}`).addEventListener('change', e => { S[id] = side(e.target.value, S[id]); restart(); });
  $('#lines').addEventListener('change', e => { S.lines = e.target.checked; save(); });
  $('#sound').addEventListener('click', () => { S.sound = !S.sound; if (S.sound) Sound.on(); renderControls(); });
  const setSeed = v => { v = Math.max(1, Math.min(99999, Math.round(+v) || 1)); if (S.view === 'race') S.raceSeed = v; else S.seed = v; restart(); };
  $('#seed').addEventListener('change', e => setSeed(e.target.value));
  $('#dice').addEventListener('click', () => setSeed(1 + Math.floor(Math.random() * 9999)));
  const togglePlay = () => {
    const m = S.view === 'race' ? Race : Single;
    if (!S.playing && S.view === 'single' && Single.ended) { Single.p = 0; Single.ended = false; Single.flash = 0; }
    if (!S.playing && S.view === 'race' && Race.done) { Race.s = 0; Race.done = false; Race.flashes = {}; $('#results').innerHTML = ''; }
    S.playing = !S.playing; if (S.sound) Sound.on(); renderControls(); void m;
  };
  document.querySelectorAll('.play').forEach(b => b.addEventListener('click', togglePlay));
  $('#board').addEventListener('click', togglePlay);
  document.querySelectorAll('.speed').forEach(b => b.addEventListener('click', () => { S.speed = (S.speed + 1) % SPEEDS.length; save(); renderControls(); }));
  document.querySelectorAll('.step').forEach(b => b.addEventListener('click', () => { S.playing = false; Single.p = Math.max(0, Math.min(Single.rec.steps, Math.round(Single.p) + +b.dataset.d)); renderControls(); }));
  // dragging the scrubber
  const scrub = $('#scrub');
  let dragging = false;
  const seek = e => { const g = drawScrubber(), r = scrub.getBoundingClientRect(), x = (e.clientX - r.left - g.x0) / (g.x1 - g.x0); Single.p = Math.max(0, Math.min(Single.rec.steps, Math.round(x * g.est))); Single.ended = false; Single.flash = 0; };
  scrub.addEventListener('pointerdown', e => { dragging = true; scrub.setPointerCapture(e.pointerId); S.playing = false; renderControls(); seek(e); });
  scrub.addEventListener('pointermove', e => { if (dragging) seek(e); });
  scrub.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { if (S.view !== 'single') return; e.preventDefault(); S.playing = false; Single.p = Math.max(0, Math.min(Single.rec.steps, Math.round(Single.p) + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1))); renderControls(); }
    else if (e.key >= '1' && e.key <= '9' && S.view === 'single') { S.snake = SNAKES[+e.key - 1].id; restart(); }
    else if (e.key === 'r' || e.key === 'R') $('#dice').click();
  });
}

let lastT = 0;
function step(t) {   // one frame at time t (ms)
  const dt = Math.min(0.1, (t - lastT) / 1000 || 0); lastT = t;
  const m = S.view === 'race' ? Race : Single;
  m.tick(dt); m.draw();
}
function frame(t) { step(t); requestAnimationFrame(frame); }
window.__lab = { step, S, Single, Race };   // for testing the page headless (no animation frames there)
function init() {
  $('#chips').innerHTML = SNAKES.map((sn, j) => `<button class="chip" data-id="${sn.id}" aria-pressed="false"><b>${sn.name}</b><span>${String(j + 1).padStart(2, '0')}</span></button>`).join('');
  $('#sizes').innerHTML = SIZES.map(n => `<button data-size="${n}" aria-pressed="false">${n}×${n}</button>`).join('');
  bind(); restart(); requestAnimationFrame(frame);
}
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
