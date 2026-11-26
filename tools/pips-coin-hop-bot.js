#!/usr/bin/env node
// Reachability bot for pips-coin-hop.html.
//
// Loads the game's own script with stubbed DOM objects, then BFS-searches every
// standing position using the game's physics()/moveBody(). From each position
// it tries every direction x run-up x jump-hold length, plus walking (and
// walking off ledges). It also checks the level-design rules per gap.
//
//   node tools/pips-coin-hop-bot.js [path/to/pips-coin-hop.html]
//
// Exits non-zero if anything fails.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---------------------------------------------------------------- load game
const html = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'pips-coin-hop.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (!scripts.length) throw new Error('no inline <script> found');

const ctxStub = () => new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});
const elStub = () => ({
  style: {}, dataset: {}, width: 0, height: 0,
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  addEventListener() {}, removeEventListener() {}, setAttribute() {},
  releasePointerCapture() {}, focus() {},
  getContext: () => ctxStub(),
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 160, height: 144 }),
});
const els = {};
const sandbox = {
  console, Math, setTimeout, clearTimeout,
  document: {
    getElementById: (id) => els[id] || (els[id] = elStub()),
    createElement: () => elStub(),
    addEventListener() {}, querySelectorAll: () => [],
  },
  performance: { now: () => 0 },
  requestAnimationFrame() {}, cancelAnimationFrame() {},
  addEventListener() {}, removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  innerWidth: 400, innerHeight: 800, navigator: {},
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(scripts.join('\n'), sandbox, { filename: 'pips-coin-hop.html' });
const G = sandbox.__g;
if (!G) throw new Error('window.__g debug hook missing');

const { MW, MH, TILE, C, GROUND_Y } = G;
const map = G.map;
const coins = G.coins, gems = G.gems;
const boxes = [];
for (let r = 0; r < MH; r++) for (let c = 0; c < MW; c++) { const t = map[r * MW + c]; if (t === 4 || t === 7) boxes.push(`${c},${r}`); }

// ---------------------------------------------------------------- simulate
const RUNUPS = [0, 4, 8, 14, 24, 40];
const HOLDS = [2, 6, 10, Infinity];
const WALKS = [4, 8, 14, 24, 40];
const DEATH_Y = MH * TILE + 24;

function feetTiles(b) {
  const r = Math.floor((b.y + b.h + 1) / TILE);
  return [G.tileAt(Math.floor(b.x / TILE), r), G.tileAt(Math.floor((b.x + b.w - 0.001) / TILE), r)];
}

// plan: { kind:'jump', dir, runup, hold } | { kind:'walk', dir, frames }
function sim(start, h, plan) {
  const b = { x: start.x, y: start.feet - h, w: C.W, h, vx: 0, vy: 0, onGround: true, coyote: 0, jbuf: 0, face: 1 };
  const got = { coins: [], gems: [], boxes: [], flag: false };
  let phase = plan.kind === 'jump' ? 'run' : 'walk';
  let airborne = false, holdLeft = 0, jumpAt = -1;
  for (let f = 0; f < 420; f++) {
    let dir = 0, jump = false, jumpPressed = false;
    if (phase === 'run') {
      dir = plan.dir;
      if (f >= plan.runup) { jumpPressed = true; jump = true; holdLeft = plan.hold - 1; phase = 'air'; jumpAt = f; airborne = false; }
    } else if (phase === 'air') {
      dir = plan.dir; jump = holdLeft > 0; holdLeft--;
    } else if (phase === 'walk') {
      dir = f < plan.frames ? plan.dir : 0;
      if (f >= plan.frames) phase = 'stop';
    }
    const res = G.physics(b, { dir, jump, jumpPressed });
    if (res.r.head) {
      const t = G.tileAt(res.r.head.c, res.r.head.r);
      if (t === 4 || t === 7) got.boxes.push(`${res.r.head.c},${res.r.head.r}`);
    }
    for (let i = 0; i < coins.length; i++) if (G.overlap(b, G.coinRect(coins[i]))) got.coins.push(i);
    for (let i = 0; i < gems.length; i++) if (G.overlap(b, G.gemRect(gems[i]))) got.gems.push(i);
    if (G.overlap(b, G.FLAG_RECT)) got.flag = true;
    if (b.y > DEATH_Y) return { end: null, got };
    if (!b.onGround) airborne = true;
    if (phase === 'air') {
      if (airborne && b.onGround) phase = 'stop';
      else if (!airborne && f > jumpAt + 3) phase = 'stop'; // jump never left the ground
    }
    if (phase === 'stop' && b.onGround && b.vx === 0) return { end: { x: b.x, feet: b.y + b.h, tiles: feetTiles(b) }, got };
  }
  return { end: null, got }; // never settled: treat as unusable
}

function plans() {
  const out = [];
  for (const dir of [-1, 1]) for (const frames of WALKS) out.push({ kind: 'walk', dir, frames });
  for (const dir of [-1, 0, 1]) for (const runup of RUNUPS) for (const hold of HOLDS) out.push({ kind: 'jump', dir, runup, hold });
  return out;
}
const PLANS = plans();

// BFS over standing positions. Strict rules applied to every move:
//  - rule 3: a move may not end more than 32px above where it started
//  - rule 5: a move may not end standing on brick
function bfs(h) {
  const startFeet = G.START.feet;
  const start = { x: G.START.x, feet: startFeet };
  const key = (s) => `${Math.round(s.x)}|${Math.round(s.feet)}`;
  const seen = new Set([key(start)]);
  const queue = [start];
  const gotCoins = new Set(), gotGems = new Set(), gotBoxes = new Set();
  let flag = false, sims = 0;
  while (queue.length) {
    const s = queue.shift();
    for (const plan of PLANS) {
      sims++;
      const { end, got } = sim(s, h, plan);
      if (end) {
        if (s.feet - end.feet > 32 + 0.01) continue;        // rule 3
        if (end.tiles.some((t) => t === 3)) continue;        // rule 5
      }
      got.coins.forEach((i) => gotCoins.add(i));
      got.gems.forEach((i) => gotGems.add(i));
      got.boxes.forEach((b) => gotBoxes.add(b));
      if (got.flag) flag = true;
      if (end) {
        const k = key(end);
        if (!seen.has(k)) { seen.add(k); queue.push({ x: end.x, feet: end.feet }); }
      }
    }
  }
  return { states: seen.size, sims, flag, coins: gotCoins, gems: gotGems, boxes: gotBoxes };
}

// ---------------------------------------------------------------- level rules
function findGaps() {
  const gaps = [];
  let s = -1;
  for (let c = 0; c <= MW; c++) {
    const empty = c < MW && !G.solid(c, 15) && !G.solid(c, 16) && !G.solid(c, 17);
    if (empty && s < 0) s = c;
    if (!empty && s >= 0) { gaps.push({ s, e: c - 1, w: c - s }); s = -1; }
  }
  return gaps;
}
function overheadClear(g) {
  const bad = [];
  for (let c = g.s - 2; c <= g.e + 2; c++) for (let r = 6; r <= 14; r++) if (c >= 0 && c < MW && G.solid(c, r)) bad.push(`${c},${r}`);
  return bad;
}
function standingJump(g, h, dir) {
  const x = dir > 0 ? g.s * TILE - C.W : (g.e + 1) * TILE;
  const { end } = sim({ x, feet: GROUND_Y }, h, { kind: 'jump', dir, runup: 0, hold: Infinity });
  if (!end || Math.abs(end.feet - GROUND_Y) > 0.01) return false;
  return dir > 0 ? end.x > g.e * TILE : end.x + C.W < (g.s + 1) * TILE;
}
function clearanceProblems() { // rule 4: >= 16px under every floating block
  const bad = [];
  for (let r = 0; r < MH - 1; r++) for (let c = 0; c < MW; c++) {
    if (!G.solid(c, r) || G.solid(c, r + 1)) continue;
    let empty = 0, rr = r + 1;
    while (rr < MH && !G.solid(c, rr)) { empty++; rr++; }
    if (rr < MH && empty * TILE < 16) bad.push(`${c},${r}`);
  }
  return bad;
}
function gemPerchProblems() { // rule 5: gem perches are stone
  const bad = [];
  gems.forEach((g, i) => {
    const r = Math.floor((g.y + 8) / TILE);
    const cs = [Math.floor((g.x + 1) / TILE), Math.floor((g.x + 6) / TILE)];
    if (!cs.every((c) => G.tileAt(c, r) === 6)) bad.push(i);
  });
  return bad;
}

// ---------------------------------------------------------------- report
let fail = false;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail = true; };

console.log(`Level ${MW}x${MH}  coins ${coins.length} (+${G.coinTotal - coins.length} in boxes)  gems ${gems.length}  boxes ${boxes.length}`);
console.log(`Jump: v=${C.JUMP_V} g=${C.GRAV}  max rise ${(() => { let v = C.JUMP_V, y = 0, m = 0; for (;;) { v += C.GRAV; y += v; m = Math.min(m, y); if (v > 0) break; } return (-m).toFixed(1); })()}px\n`);

const gaps = findGaps();
console.log(`Gaps (${gaps.length}):`);
for (const g of gaps) {
  const oh = overheadClear(g);
  check(g.w <= 3, `gap cols ${g.s}-${g.e}: width ${g.w} <= 3`);
  check(oh.length === 0, `gap cols ${g.s}-${g.e}: no solid tile in rows 6-14 within 2 cols${oh.length ? ' (found ' + oh.join(' ') + ')' : ''}`);
  for (const h of [C.SMALL_H, C.BIG_H]) {
    check(standingJump(g, h, 1) && standingJump(g, h, -1), `gap cols ${g.s}-${g.e}: standing jump clears it both ways (hitbox h=${h})`);
  }
}
const cl = clearanceProblems();
check(cl.length === 0, `every floating block has >= 16px clearance underneath${cl.length ? ' (bad: ' + cl.join(' ') + ')' : ''}`);
const gp = gemPerchProblems();
check(gp.length === 0, `every gem perch is stone${gp.length ? ' (bad gems: ' + gp.join(',') + ')' : ''}`);
check(gems.length === 3, `level has exactly 3 gems`);
console.log('');

for (const h of [C.SMALL_H, C.BIG_H]) {
  const t0 = Date.now();
  const r = bfs(h);
  console.log(`Reachability, hitbox 8x${h}  (${r.states} standing positions, ${r.sims} sims, ${((Date.now() - t0) / 1000).toFixed(1)}s; climbs <= 32px, never standing on brick)`);
  check(r.flag, `flag reachable (h=${h})`);
  check(r.coins.size === coins.length, `coins ${r.coins.size}/${coins.length} (h=${h})${r.coins.size < coins.length ? '  missing: ' + coins.map((k, i) => (r.coins.has(i) ? null : `#${i}@(${k.x / TILE},${k.y / TILE})`)).filter(Boolean).join(' ') : ''}`);
  check(r.gems.size === gems.length, `gems ${r.gems.size}/3 (h=${h})${r.gems.size < gems.length ? '  missing: ' + gems.map((g, i) => (r.gems.has(i) ? null : `#${i}`)).filter(Boolean).join(' ') : ''}`);
  check(r.boxes.size === boxes.length, `boxes ${r.boxes.size}/${boxes.length} (h=${h})${r.boxes.size < boxes.length ? '  missing: ' + boxes.filter((b) => !r.boxes.has(b)).join(' ') : ''}`);
  console.log('');
}

console.log(fail ? 'RESULT: FAIL' : 'RESULT: ALL PASS');
process.exit(fail ? 1 : 0);
