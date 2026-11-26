#!/usr/bin/env node
// Reachability bot for pips-coin-hop.html.
//
// Loads the game's own script with stubbed DOM objects, then for each level
// BFS-searches every standing position using the game's physics()/moveBody().
// From each position it tries every direction x run-up x jump-hold length,
// plus walking (and walking off ledges). Moving platforms are simulated over
// time: positions near a platform are tried at many phases of its travel, and
// a position riding a platform can wait any number of frames before acting.
// It also checks the level-design rules per gap and the per-level counts.
//
//   node tools/pips-coin-hop-bot.js [all|1-5] [path/to/pips-coin-hop.html]
//
// Exits non-zero if anything fails.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const which = process.argv[2] || 'all';
const htmlPath = process.argv[3] || path.join(__dirname, '..', 'pips-coin-hop.html');

// ---------------------------------------------------------------- load game
const html = fs.readFileSync(htmlPath, 'utf8');
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
  console, Math, setTimeout, clearTimeout, JSON,
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
const { MH, TILE, C, GROUND_Y } = G;

// ---------------------------------------------------------------- simulate
const RUNUPS = [0, 4, 8, 14, 24, 40];
const HOLDS = [2, 6, 10, Infinity];
const WALKS = [4, 8, 14, 24, 40];
const DEATH_Y = MH * TILE + 24;
const PHASES = 12;     // start phases tried from ground positions near a platform
const WAIT_STEP = 8;   // a rider may wait 0, 8, 16, ... frames (one full period)

const PLANS = [];
for (const dir of [-1, 1]) for (const frames of WALKS) PLANS.push({ kind: 'walk', dir, frames });
for (const dir of [-1, 0, 1]) for (const runup of RUNUPS) for (const hold of HOLDS) PLANS.push({ kind: 'jump', dir, runup, hold });

let LV; // current level context
function platsAt(t) {
  return LV.defs.map((d) => { const x = G.platX(d, t); return { x, y: d.y, w: d.w, dx: x - G.platX(d, t - 1) }; });
}
function feetTiles(b) {
  const r = Math.floor((b.y + b.h + 1) / TILE);
  return [G.tileAt(Math.floor(b.x / TILE), r), G.tileAt(Math.floor((b.x + b.w - 0.001) / TILE), r)];
}

// start: {x, feet, ride?}; runs `wait` idle frames, then the plan.
function sim(start, h, plan, t0, wait) {
  const b = { x: start.x, y: start.feet - h, w: C.W, h, vx: 0, vy: 0, onGround: true, coyote: 0, jbuf: 0, face: 1,
    ride: start.ride == null ? null : start.ride };
  const got = { coins: [], gems: [], boxes: [], flag: false };
  const hasPlats = LV.defs.length > 0;
  let t = t0;
  const step = (inp) => {
    t++;
    const res = G.physics(b, inp, hasPlats ? platsAt(t) : null);
    if (res.r.head) {
      const tt = G.tileAt(res.r.head.c, res.r.head.r);
      if (tt === 4 || tt === 7) got.boxes.push(`${res.r.head.c},${res.r.head.r}`);
    }
    for (let i = 0; i < LV.coins.length; i++) if (G.overlap(b, G.coinRect(LV.coins[i]))) got.coins.push(i);
    for (let i = 0; i < LV.gems.length; i++) if (G.overlap(b, G.gemRect(LV.gems[i]))) got.gems.push(i);
    if (G.overlap(b, LV.flag)) got.flag = true;
    return b.y <= DEATH_Y;
  };
  for (let f = 0; f < wait; f++) if (!step({ dir: 0, jump: false, jumpPressed: false })) return { end: null, got };

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
    if (!step({ dir, jump, jumpPressed })) return { end: null, got };
    if (!b.onGround) airborne = true;
    if (phase === 'air') {
      if (airborne && b.onGround) phase = 'stop';
      else if (!airborne && f > jumpAt + 3) phase = 'stop'; // the jump never left the ground
    }
    if (phase === 'stop' && b.onGround && b.vx === 0) {
      return { end: { x: b.x, feet: b.y + b.h, tiles: feetTiles(b), ride: b.ride, t }, got };
    }
  }
  return { end: null, got }; // never settled: treat as unusable
}

function nearPlat(x) {
  for (const d of LV.defs) if (x > d.c0 * TILE - 110 && x < (d.c0 + d.span) * TILE + 110) return d;
  return null;
}

// BFS over standing positions. Strict rules applied to every move:
//  - rule 3: a move may not end more than 32px above where it started
//  - rule 5: a move may not end standing on brick
function bfs(h) {
  const start = { x: G.START.x, feet: G.START.feet, ride: null, t: 0 };
  const key = (s) => (s.ride == null
    ? `G|${Math.round(s.x)}|${Math.round(s.feet)}`
    : `R|${s.ride}|${Math.round((s.x - G.platX(LV.defs[s.ride], s.t)) / 2)}|${Math.round(s.feet)}`);
  const seen = new Set([key(start)]);
  const queue = [start];
  const gotCoins = new Set(), gotGems = new Set(), gotBoxes = new Set();
  let flag = false, sims = 0, riderStates = 0;
  while (queue.length) {
    const s = queue.shift();
    let starts;
    if (s.ride != null) {
      riderStates++;
      const per = G.platPeriod(LV.defs[s.ride]);
      starts = [];
      for (let w = 0; w < per; w += WAIT_STEP) starts.push([s.t, w]);
    } else {
      const d = nearPlat(s.x);
      if (d) { const per = G.platPeriod(d); starts = []; for (let k = 0; k < PHASES; k++) starts.push([Math.round(k * per / PHASES), 0]); }
      else starts = [[0, 0]];
    }
    for (const [t0, wait] of starts) {
      for (const plan of PLANS) {
        sims++;
        const { end, got } = sim(s, h, plan, t0, wait);
        if (end) {
          if (s.feet - end.feet > 32 + 0.01) continue;                 // rule 3
          if (end.ride == null && end.tiles.some((t) => t === 3)) continue; // rule 5
        }
        got.coins.forEach((i) => gotCoins.add(i));
        got.gems.forEach((i) => gotGems.add(i));
        got.boxes.forEach((b) => gotBoxes.add(b));
        if (got.flag) flag = true;
        if (end) {
          const k = key(end);
          if (!seen.has(k)) { seen.add(k); queue.push({ x: end.x, feet: end.feet, ride: end.ride, t: end.t }); }
        }
      }
    }
  }
  return { states: seen.size, riderStates, sims, flag, coins: gotCoins, gems: gotGems, boxes: gotBoxes };
}

// ---------------------------------------------------------------- level rules
function findGaps() {
  const gaps = [];
  let s = -1;
  for (let c = 0; c <= LV.MW; c++) {
    const empty = c < LV.MW && !G.solid(c, 15) && !G.solid(c, 16) && !G.solid(c, 17);
    if (empty && s < 0) s = c;
    if (!empty && s >= 0) {
      const g = { s, e: c - 1, w: c - s };
      g.plat = LV.defs.findIndex((d) => d.y === GROUND_Y && d.c0 <= g.s && d.c0 + d.span - 1 >= g.e);
      gaps.push(g); s = -1;
    }
  }
  return gaps;
}
function overheadClear(g) {
  const bad = [];
  for (let c = g.s - 2; c <= g.e + 2; c++) for (let r = 6; r <= 14; r++) if (c >= 0 && c < LV.MW && G.solid(c, r)) bad.push(`${c},${r}`);
  return bad;
}
// cleared = came to rest on solid tiles fully past the gap (any height; e.g.
// landing on the first step of a staircase counts)
function landsAcross(end, g, dir) {
  if (!end || end.ride != null || end.feet > GROUND_Y + 0.01) return false;
  return dir > 0 ? end.x > g.e * TILE : end.x < g.s * TILE;
}
function standingJump(g, h, dir) {
  const x = dir > 0 ? g.s * TILE - C.W : (g.e + 1) * TILE;
  return landsAcross(sim({ x, feet: GROUND_Y }, h, { kind: 'jump', dir, runup: 0, hold: Infinity }, 0, 0).end, g, dir);
}
// From a platform crossing: stand on the platform (left edge / middle / right
// edge) at every 2nd frame of its travel, and do a standing jump both ways.
function platformJumps(g, h) {
  const d = LV.defs[g.plat], per = G.platPeriod(d);
  let tried = 0, fails = [];
  for (let t = 0; t < per; t += 2) {
    const px = G.platX(d, t);
    for (const off of [0, d.w / 2 - C.W / 2, d.w - C.W]) {
      for (const dir of [1, -1]) {
        tried++;
        const { end } = sim({ x: px + off, feet: d.y, ride: g.plat }, h, { kind: 'jump', dir, runup: 0, hold: Infinity }, t, 0);
        if (!landsAcross(end, g, dir)) fails.push(`t=${t} off=${off} dir=${dir}`);
      }
    }
  }
  return { tried, fails };
}
function clearanceProblems() { // rule 4: >= 16px under every floating block
  const bad = [];
  for (let r = 0; r < MH - 1; r++) for (let c = 0; c < LV.MW; c++) {
    if (!G.solid(c, r) || G.solid(c, r + 1)) continue;
    let empty = 0, rr = r + 1;
    while (rr < MH && !G.solid(c, rr)) { empty++; rr++; }
    if (rr < MH && empty * TILE < 16) bad.push(`${c},${r}`);
  }
  for (const d of LV.defs) { // a raised platform needs the same room underneath
    if (d.y === GROUND_Y) continue;
    for (let c = d.c0; c < d.c0 + d.span; c++) {
      let r = Math.floor((d.y + TILE) / TILE); while (r < MH && !G.solid(c, r)) r++;
      if (r < MH && r * TILE - (d.y + TILE) < 16) bad.push(`plat@${c}`);
    }
  }
  return bad;
}
function gemPerchProblems() { // rule 5: gem perches are stone
  const bad = [];
  LV.gems.forEach((g, i) => {
    const r = Math.floor((g.y + 8) / TILE);
    const cs = [Math.floor((g.x + 1) / TILE), Math.floor((g.x + 6) / TILE)];
    if (!cs.every((c) => G.tileAt(c, r) === 6)) bad.push(i);
  });
  return bad;
}

// ---------------------------------------------------------------- run
let anyFail = false;
const rows = [];
const levels = which === 'all' ? G.LEVELS.map((_, i) => i + 1) : [parseInt(which, 10)];

for (const n of levels) {
  G.setLevel(n);
  LV = { n, MW: G.MW, coins: G.coins, gems: G.gems, defs: G.platDefs, flag: G.FLAG_RECT, map: G.map };
  const boxes = [];
  let cboxes = 0;
  for (let r = 0; r < MH; r++) for (let c = 0; c < LV.MW; c++) {
    const t = LV.map[r * LV.MW + c];
    if (t === 4 || t === 7) boxes.push(`${c},${r}`);
    if (t === 4) cboxes++;
  }
  const def = G.LEVELS[n - 1];
  let fail = false;
  const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail = true; };
  const note = (msg) => console.log(`NOTE  ${msg}`);

  console.log(`\n=== Level ${n}: ${def.name} ===`);
  console.log(`length ${LV.MW} tiles, coins ${LV.coins.length} + ${cboxes} in boxes = ${G.coinTotal}, gems ${LV.gems.length}, ` +
    `sprout boxes ${G.sproutTotal}, coin boxes ${cboxes}, enemies ${G.enemies.length} ` +
    `(${G.enemies.filter((e) => e.type === 'bug').length} bugs), moving platforms ${LV.defs.length}`);
  check(LV.MW >= 200 && LV.MW <= 240, `length ${LV.MW} in 200-240`);
  check(LV.gems.length === 3, `exactly 3 gems`);
  check(G.sproutTotal >= 2, `at least 2 sprout boxes (${G.sproutTotal})`);
  check(cboxes >= 6 && cboxes <= 10, `6-10 coin boxes (${cboxes})`);
  check(G.enemies.length >= 5 && G.enemies.length <= 10, `5-10 enemies (${G.enemies.length})`);
  if (n === 1 && (G.coinTotal < 80 || G.coinTotal > 110)) note(`coins ${G.coinTotal} outside 80-110: level 1 is kept unchanged on purpose`);
  else check(G.coinTotal >= 80 && G.coinTotal <= 110, `80-110 coins (${G.coinTotal})`);
  for (const d of LV.defs) check(d.speed <= 0.5, `platform at col ${d.c0} moves ${d.speed} px/frame (max 0.5)`);

  const gaps = findGaps();
  console.log(`Gaps (${gaps.length}):`);
  for (const g of gaps) {
    const oh = overheadClear(g);
    const tag = `gap cols ${g.s}-${g.e} (w${g.w}${g.plat >= 0 ? ', moving platform' : ''})`;
    check(g.w <= 3 || g.plat >= 0, `${tag}: width <= 3, or crossed by a moving platform`);
    check(oh.length === 0, `${tag}: overhead check, no solid tile in rows 6-14 within 2 cols${oh.length ? ' (found ' + oh.join(' ') + ')' : ''}`);
    for (const h of [C.SMALL_H, C.BIG_H]) {
      if (g.plat >= 0) {
        const r = platformJumps(g, h);
        check(r.fails.length === 0, `${tag}: standing jump off the platform lands on ground both ways, ${r.tried} tries over its whole travel (h=${h})${r.fails.length ? '  fails: ' + r.fails.slice(0, 4).join('; ') : ''}`);
      } else {
        check(standingJump(g, h, 1) && standingJump(g, h, -1), `${tag}: standing jump from the edge clears it both ways (h=${h})`);
      }
    }
  }
  const cl = clearanceProblems();
  check(cl.length === 0, `every floating block / raised platform has >= 16px clearance underneath${cl.length ? ' (bad: ' + cl.join(' ') + ')' : ''}`);
  const gp = gemPerchProblems();
  check(gp.length === 0, `every gem perch is stone${gp.length ? ' (bad gems: ' + gp.join(',') + ')' : ''}`);

  const res = {};
  for (const h of [C.SMALL_H, C.BIG_H]) {
    const t0 = Date.now();
    const r = bfs(h);
    res[h] = r;
    console.log(`Reachability, hitbox 8x${h}: ${r.states} standing positions (${r.riderStates} riding a platform), ${r.sims} sims, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    check(r.flag, `flag reachable (h=${h})`);
    check(r.coins.size === LV.coins.length, `coins ${r.coins.size}/${LV.coins.length} (h=${h})${r.coins.size < LV.coins.length ? '  missing: ' + LV.coins.map((k, i) => (r.coins.has(i) ? null : `(${k.x / TILE},${k.y / TILE})`)).filter(Boolean).join(' ') : ''}`);
    check(r.gems.size === 3, `gems ${r.gems.size}/3 (h=${h})${r.gems.size < LV.gems.length ? '  missing: ' + LV.gems.map((g, i) => (r.gems.has(i) ? null : `#${i}`)).filter(Boolean).join(' ') : ''}`);
    check(r.boxes.size === boxes.length, `boxes ${r.boxes.size}/${boxes.length} (h=${h})${r.boxes.size < boxes.length ? '  missing: ' + boxes.filter((b) => !r.boxes.has(b)).join(' ') : ''}`);
  }
  rows.push({ n, name: def.name, len: LV.MW, coins: `${LV.coins.length}+${cboxes}=${G.coinTotal}`, gems: LV.gems.length,
    sprouts: G.sproutTotal, enemies: G.enemies.length, result: fail ? 'FAIL' : 'PASS' });
  if (fail) anyFail = true;
}

console.log('\n| Level | Name | Length | Coins (loose+boxes) | Gems | Sprouts | Enemies | Bot |');
console.log('|---|---|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.n} | ${r.name} | ${r.len} | ${r.coins} | ${r.gems} | ${r.sprouts} | ${r.enemies} | ${r.result} |`);
console.log(anyFail ? '\nRESULT: FAIL' : '\nRESULT: ALL PASS');
process.exit(anyFail ? 1 : 0);
