'use strict';
// Drawing for the lab, ported from the film's renderer (not in this repository) so the page
// looks like the video: the night palette, a flat snake with dot eyes, an apple, and
// glowing lines that explain. Boards are drawn in board units (CELL per cell) and scaled.

const CELL = 88;
const hex = s => { const n = parseInt(s.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const C = Object.fromEntries(Object.entries({
  bgTop: '#0f1117', bgBot: '#161925', board: '#1a1e29', board2: '#1e2331', boardEdge: '#272d3d', text: '#f1efe9', dim: '#8a8fa6',
  head: '#86ecc2', body: '#62d6a6', tail: '#2b8a70', edge: '#123a31', eye: '#1b1e27', deadBody: '#5f6874', deadTail: '#3b424d', ghost: '#eef4ff',
  food: '#ff6a55', leaf: '#57c38f', stem: '#6b4a2a', wire: '#8ea6d8', blue: '#6aa8ff', gold: '#f2c14e', goldDim: '#c8a76b', red: '#ff5f6e', hot: '#ff6b78', dimTo: '#1c2130',
}).map(([k, v]) => [k, hex(v)]));

const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a)).toFixed(4)})`;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const lerp = (a, b, t) => a + (b - a) * t;
const lerp2 = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const ramp = (t, a, b) => clamp01((t - a) / (b - a));
const outCubic = x => 1 - (1 - clamp01(x)) ** 3;

function polyline(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); }
function lengthOf(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
function prefix(pts, d) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length && d > 0; i++) {
    const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (L <= d) { out.push(pts[i]); d -= L; } else { out.push(lerp2(pts[i - 1], pts[i], d / L)); d = 0; }
  }
  return out;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
// A stroke with additive halos under a solid core.
function glowStroke(ctx, pts, color, width, { alpha = 1, halos = [[3.4, 0.05], [2, 0.11]], core = true } = {}) {
  if (pts.length < 2 || alpha <= 0) return;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'lighter';
  for (const [k, a] of halos) { ctx.strokeStyle = rgba(color, a * alpha); ctx.lineWidth = width * k; polyline(ctx, pts); ctx.stroke(); }
  ctx.globalCompositeOperation = 'source-over';
  if (core) { ctx.strokeStyle = rgba(color, alpha); ctx.lineWidth = width; polyline(ctx, pts); ctx.stroke(); }
  ctx.restore();
}
function glowDot(ctx, x, y, r, color, alpha = 1) {
  if (alpha <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha)); g.addColorStop(0.35, rgba(color, alpha * 0.35)); g.addColorStop(1, rgba(color, 0));
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

// One board: w × h cells, with or without wrapping round the edges.
// On a wrapping board a line is never broken where it crosses an edge: it is laid out unwrapped
// (`unwrap`, running on off the board), cut into one piece per copy of the board it passes
// through (`fold`), and drawn clipped to the board (`clip`). So it runs into one edge and out of
// the opposite one, cut off flush, and the only round ends are its real ones.
class Board {
  constructor(w, h, wrap) { this.w = w; this.h = h; this.wrap = wrap; this.W = w * CELL; this.H = h * CELL; }
  xy(c) { return [(c % this.w + 0.5) * CELL, (Math.floor(c / this.w) + 0.5) * CELL]; }
  // The step from cell a to its neighbour b, in cells (across the edge on a wrapping board).
  delta(a, b) {
    let dx = b % this.w - a % this.w, dy = Math.floor(b / this.w) - Math.floor(a / this.w);
    if (dx > 1) dx -= this.w; else if (dx < -1) dx += this.w;
    if (dy > 1) dy -= this.h; else if (dy < -1) dy += this.h;
    return [dx, dy];
  }
  far(a, b) { return Math.abs(a % this.w - b % this.w) + Math.abs(Math.floor(a / this.w) - Math.floor(b / this.w)) > 1; }
  // A path of neighbouring cells as one unbroken polyline, starting on the board.
  unwrap(cells) {
    const out = [this.xy(cells[0])];
    for (let i = 1; i < cells.length; i++) { const [dx, dy] = this.delta(cells[i - 1], cells[i]), p = out[i - 1]; out.push([p[0] + dx * CELL, p[1] + dy * CELL]); }
    return out;
  }
  // An unwrapped polyline cut into pieces, one per copy of the board: { idx: point indices, ox, oy:
  // the shift back onto the board }. A segment that crosses an edge belongs to the pieces on both sides.
  fold(pts) {
    if (!this.wrap || pts.length < 2) return [{ idx: pts.map((_, i) => i), ox: 0, oy: 0 }];
    const tile = p => [Math.floor(p[0] / this.W), Math.floor(p[1] / this.H)], out = [], open = new Map();
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = tile(pts[i]), b = tile(pts[i + 1]);
      for (const t of a[0] === b[0] && a[1] === b[1] ? [a] : [a, b]) {
        const key = `${t[0]},${t[1]}`, cur = open.get(key);
        if (cur && cur.idx.at(-1) === i) cur.idx.push(i + 1);
        else { const piece = { idx: [i, i + 1], ox: -t[0] * this.W, oy: -t[1] * this.H }; out.push(piece); open.set(key, piece); }
      }
    }
    return out;
  }
  // A polyline as the pieces to draw: point lists on the board.
  lines(pts) { return this.fold(pts).map(({ idx, ox, oy }) => idx.map(i => [pts[i][0] + ox, pts[i][1] + oy])); }
  clip(ctx) { if (this.wrap) { ctx.beginPath(); ctx.rect(0, 0, this.W, this.H); ctx.clip(); } }
  // The shifts onto the board of every copy of it that a disc of radius r round p reaches.
  copies([x, y], r) {
    if (!this.wrap) return [[0, 0]];
    const xs = new Set([Math.floor((x - r) / this.W), Math.floor((x + r) / this.W)]), ys = new Set([Math.floor((y - r) / this.H), Math.floor((y + r) / this.H)]);
    return [...xs].flatMap(tx => [...ys].map(ty => [-tx * this.W, -ty * this.H]));
  }
  // The snake's polyline head → tail, unwrapped, part way (f) towards the next state.
  bodyPts(body, next, f) {
    const pts = this.unwrap(body);
    if (next && f > 0 && next[0] !== body[0]) {
      const [dx, dy] = this.delta(body[0], next[0]);
      if (next.length === body.length && pts.length > 1) pts[pts.length - 1] = lerp2(pts.at(-1), pts.at(-2), f);
      pts.unshift([pts[0][0] + dx * CELL * f, pts[0][1] + dy * CELL * f]);
    }
    return pts;
  }
}

function drawBase(ctx, B) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 50 * (ctx.getTransform().a || 1); ctx.shadowOffsetY = 14 * (ctx.getTransform().a || 1);
  roundRect(ctx, -12, -12, B.W + 24, B.H + 24, 22); ctx.fillStyle = rgba(C.boardEdge); ctx.fill();
  ctx.restore();
  for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) { ctx.fillStyle = rgba((x + y) % 2 ? C.board2 : C.board); ctx.fillRect(x * CELL, y * CELL, CELL, CELL); }
  if (B.wrap) {   // a wrapping board: dashed rim, the edges lead round
    ctx.save(); ctx.setLineDash([10, 12]); ctx.strokeStyle = rgba(C.wire, 0.45); ctx.lineWidth = 3; ctx.strokeRect(-6, -6, B.W + 12, B.H + 12); ctx.restore();
  }
}
function drawApple(ctx, B, cell, t, alpha = 1) {
  if (cell < 0 || alpha <= 0) return;
  const [x, y] = B.xy(cell), r = CELL * 0.2 * (1 + 0.05 * Math.sin(t * 5.2));
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, y + r * 0.95, r * 0.8, r * 0.25, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = rgba(C.food); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.28, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = rgba(C.stem); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y - r * 0.85); ctx.lineTo(x + r * 0.12, y - r * 1.3); ctx.stroke();
  ctx.fillStyle = rgba(C.leaf); ctx.beginPath(); ctx.ellipse(x + r * 0.42, y - r * 1.12, r * 0.42, r * 0.2, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
// A solid body and a head with eyes (crosses once dead). On a wrapping board the snake is one
// line folded onto the board, so a head halfway across an edge shows on both sides.
function drawSnake(ctx, B, body, next, f, { dead = 0, dim = 0 } = {}) {
  const pts = B.bodyPts(body, next, f), w = CELL * 0.6, tint = c => mix(c, C.dimTo, dim);
  const bodyCol = tint(mix(C.body, C.deadBody, dead)), tailCol = tint(mix(C.tail, C.deadTail, dead)), edgeCol = tint(mix(C.edge, C.deadTail, dead));
  const D = [0];
  for (let i = 1; i < pts.length; i++) D.push(D[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const colAt = i => rgba(mix(bodyCol, tailCol, D.at(-1) > 0 ? D[i] / D.at(-1) : 0));
  const pieces = B.fold(pts), at = (P, i) => [pts[i][0] + P.ox, pts[i][1] + P.oy];
  ctx.save(); B.clip(ctx); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 14 * ctx.getTransform().a; ctx.shadowOffsetY = 6 * ctx.getTransform().a;
  ctx.strokeStyle = rgba(edgeCol); ctx.fillStyle = rgba(edgeCol); ctx.lineWidth = w + 6;
  for (const P of pieces) {
    if (P.idx.length > 1) { polyline(ctx, P.idx.map(i => at(P, i))); ctx.stroke(); }
    else { const [x, y] = at(P, P.idx[0]); ctx.beginPath(); ctx.arc(x, y, (w + 6) / 2, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.shadowColor = 'transparent';
  for (const P of pieces) for (const i of P.idx) { if (!i) continue; const [x, y] = at(P, i); ctx.fillStyle = colAt(i); ctx.beginPath(); ctx.arc(x, y, w / 2, 0, Math.PI * 2); ctx.fill(); }
  ctx.lineCap = 'butt'; ctx.lineWidth = w;
  for (let k = pieces.length - 1; k >= 0; k--) {   // tail first, so the body nearer the head lies on top
    const P = pieces[k];
    for (let j = P.idx.length - 2; j >= 0; j--) {
      const i = P.idx[j], [ax, ay] = at(P, i), [bx, by] = at(P, i + 1), L = Math.hypot(bx - ax, by - ay);
      if (L < 1e-6) continue;
      const ux = (bx - ax) / L * 0.75, uy = (by - ay) / L * 0.75, g = ctx.createLinearGradient(ax, ay, bx, by);
      g.addColorStop(0, colAt(i)); g.addColorStop(1, colAt(i + 1));
      ctx.strokeStyle = g; ctx.beginPath(); ctx.moveTo(ax - ux, ay - uy); ctx.lineTo(bx + ux, by + uy); ctx.stroke();
    }
  }
  const q = pts[1] || [pts[0][0] - 1, pts[0][1]], r = w * 0.56;
  let dx = pts[0][0] - q[0], dy = pts[0][1] - q[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  for (const [ox, oy] of B.copies(pts[0], r + 3)) {   // the head, on every copy of the board it reaches
    const hx = pts[0][0] + ox, hy = pts[0][1] + oy;
    ctx.fillStyle = rgba(edgeCol); ctx.beginPath(); ctx.arc(hx, hy, r + 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgba(tint(mix(C.head, C.deadBody, dead))); ctx.beginPath(); ctx.arc(hx, hy, r, 0, Math.PI * 2); ctx.fill();
    for (const side of [-1, 1]) {
      const ex = hx + dx * r * 0.3 - dy * r * 0.42 * side, ey = hy + dy * r * 0.3 + dx * r * 0.42 * side, eye = rgba(tint(C.eye));
      if (dead > 0.5) {
        const k = r * 0.13; ctx.strokeStyle = eye; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(ex - k, ey - k); ctx.lineTo(ex + k, ey + k); ctx.moveTo(ex - k, ey + k); ctx.lineTo(ex + k, ey - k); ctx.stroke();
      } else { ctx.fillStyle = eye; ctx.beginPath(); ctx.arc(ex, ey, r * 0.17, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  ctx.restore();
}
// Glowing lines along an unwrapped polyline, folded onto the board.
function glowFolded(ctx, B, pts, color, width, opts) {
  ctx.save(); B.clip(ctx);
  for (const q of B.lines(pts)) glowStroke(ctx, q, color, width, opts);
  ctx.restore();
}
function drawGhost(ctx, B, body, alpha) {   // the snake as it would be after eating, in imagination
  if (!body || alpha <= 0) return;
  const pts = B.unwrap(body);
  glowFolded(ctx, B, pts.length > 1 ? pts : [pts[0], [pts[0][0] + 0.01, pts[0][1]]], C.ghost, 22, { alpha: 0.55 * alpha, halos: [[2.6, 0.14]] });
  const [hx, hy] = B.xy(body[0]);
  ctx.save(); ctx.strokeStyle = rgba(C.ghost, 0.9 * alpha); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(hx, hy, 22, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
}
// A route of cells (blue: the way to the food; gold: a way back), drawn up to p (0–1).
function drawPath(ctx, B, cells, color, { width = 5, alpha = 0.9, p = 1 } = {}) {
  if (!cells || cells.length < 2 || alpha <= 0) return;
  const pts = B.unwrap(cells);
  glowFolded(ctx, B, p < 1 ? prefix(pts, lengthOf(pts) * p) : pts, color, width, { alpha, halos: [[4.2, 0.1], [2.2, 0.18]] });
}
function drawLoop(ctx, B, loop, { alpha = 1, width = 3, color = C.gold } = {}) {
  if (!loop || loop.length < 2 || alpha <= 0) return;
  glowFolded(ctx, B, B.unwrap([...loop, loop[0]]), color, width, { alpha: 0.85 * alpha, halos: [[4.5, 0.1], [2.2, 0.18]] });
}
function cross(ctx, x, y, r, color, alpha, width = 5) {
  if (alpha <= 0) return;
  glowStroke(ctx, [[x - r, y - r], [x + r, y + r]], color, width, { alpha });
  glowStroke(ctx, [[x - r, y + r], [x + r, y - r]], color, width, { alpha });
}
function tickMark(ctx, x, y, r, color, alpha, width = 5) {
  if (alpha <= 0) return;
  glowStroke(ctx, [[x - r, y], [x - r * 0.3, y + r * 0.7], [x + r, y - r * 0.8]], color, width, { alpha });
}
// One-way streets (the C rule): a chevron halfway along each road, pointing the way. A road across
// the edge gets one just inside the edge it leaves by, and one inside the edge it comes in at.
function drawRoads(ctx, B, roads, alpha = 0.5) {
  if (!roads || alpha <= 0) return;
  ctx.save(); ctx.strokeStyle = rgba(C.wire, alpha); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
  const s = 9, chevron = (mx, my, ux, uy) => {
    ctx.moveTo(mx - (ux + uy) * s, my - (uy + ux) * s); ctx.lineTo(mx + ux * s * 0.6, my + uy * s * 0.6); ctx.lineTo(mx - (ux - uy) * s, my - (uy - ux) * s);
  };
  roads.forEach((qs, p) => qs.forEach(q => {
    const [x0, y0] = B.xy(p), [ux, uy] = B.delta(p, q), h = CELL / 2;
    if (!B.far(p, q)) { chevron(x0 + ux * h, y0 + uy * h, ux, uy); return; }
    const [x1, y1] = B.xy(q), k = h - 16;
    chevron(x0 + ux * k, y0 + uy * k, ux, uy); chevron(x1 - ux * k, y1 - uy * k, ux, uy);
  }));
  ctx.stroke(); ctx.restore();
}
// 加权 Cell's tree of 2×2 squares: walked from the tail, each square the body enters is linked
// to the one it came from. Faint outlines of those squares, and the links between their centres.
function drawSquareTree(ctx, B, body, length, alpha = 0.5) {
  if (alpha <= 0 || length < 1) return;
  const sw = B.w >> 1, centre = s => [((s % sw) * 2 + 1) * CELL, (Math.floor(s / sw) * 2 + 1) * CELL], seen = new Set(), links = [];
  let parent = -1;
  for (let i = length - 1; i >= 0; i--) {
    const c = body[i], s = (Math.floor(c / B.w) >> 1) * sw + ((c % B.w) >> 1);
    if (!seen.has(s)) { seen.add(s); if (parent >= 0) links.push([centre(parent), centre(s)]); }
    parent = s;
  }
  ctx.save(); ctx.strokeStyle = rgba(C.goldDim, 0.35 * alpha); ctx.lineWidth = 2;
  for (const s of seen) { const [x, y] = centre(s); ctx.strokeRect(x - CELL + 6, y - CELL + 6, 2 * CELL - 12, 2 * CELL - 12); }
  ctx.restore();
  for (const [a, b] of links) glowStroke(ctx, [a, b], C.goldDim, 3, { alpha: 0.8 * alpha, halos: [[3, 0.08]] });
}
function drawFullFlash(ctx, B, u) {   // a gold frame bursts off a board that just filled
  if (u < 0 || u > 1) return;
  ctx.save(); ctx.strokeStyle = rgba(C.gold, 0.8 * (1 - u)); ctx.lineWidth = 3 + 10 * (1 - u);
  ctx.shadowColor = rgba(C.gold, 0.8 * (1 - u)); ctx.shadowBlur = 40 * ctx.getTransform().a;
  ctx.strokeRect(-6 - 20 * u, -6 - 20 * u, B.W + 12 + 40 * u, B.H + 12 + 40 * u); ctx.restore();
}
