#!/usr/bin/env node
/*
 * Pre-generate a curated set of Rush Hour puzzles for the web app.
 *
 * Technique: repeatedly build a random "solved" board (target at the exit,
 * plus 11-13 random blocks), fully enumerate the reachable component,
 * then run a multi-source BFS from ALL solved states in that component
 * to get the TRUE minimum-moves-to-solve for every reachable state.
 *
 * Usage:
 *   node tools/generate-puzzles.js           # overwrites puzzles.js
 *   node tools/generate-puzzles.js --budget 60000    # 60s per tier
 *
 * Output: puzzles.js at repo root, exporting PUZZLES = { simple, moderate,
 * difficult } each an array of { blocks, minMoves } entries.
 *
 * Depth ranges (true min solution length):
 *   simple    : 5  – 8
 *   moderate  : 9  – 13
 *   difficult : 14 – 30
 */

"use strict";

const fs = require("fs");
const path = require("path");

const GRID = 6;
const EXIT_ROW = 2;
const TARGET_LEN = 2;

const TIERS = {
  simple: { min: 5, max: 8, target: 30 },
  moderate: { min: 9, max: 13, target: 30 },
  difficult: { min: 14, max: 30, target: 30 },
};

// How long to spend per tier before moving on (ms). Override with --budget N.
let TIME_BUDGET_MS = 40000;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--budget") TIME_BUDGET_MS = parseInt(argv[i + 1], 10);
}

// ---- Board primitives (mirrors app.js) ----
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

function buildGrid(blocks) {
  const g = Array.from({ length: GRID }, () => new Array(GRID).fill(-1));
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.orient === "h") {
      for (let k = 0; k < b.len; k++) g[b.row][b.col + k] = i;
    } else {
      for (let k = 0; k < b.len; k++) g[b.row + k][b.col] = i;
    }
  }
  return g;
}

function canPlace(g, b) {
  if (b.orient === "h") {
    if (b.col < 0 || b.col + b.len > GRID || b.row < 0 || b.row >= GRID)
      return false;
    for (let k = 0; k < b.len; k++)
      if (g[b.row][b.col + k] !== -1) return false;
  } else {
    if (b.row < 0 || b.row + b.len > GRID || b.col < 0 || b.col >= GRID)
      return false;
    for (let k = 0; k < b.len; k++)
      if (g[b.row + k][b.col] !== -1) return false;
  }
  return true;
}

function placeOn(g, b, idx) {
  if (b.orient === "h")
    for (let k = 0; k < b.len; k++) g[b.row][b.col + k] = idx;
  else for (let k = 0; k < b.len; k++) g[b.row + k][b.col] = idx;
}

function encode(blocks) {
  let s = "";
  for (const b of blocks) s += b.row * GRID + b.col + ",";
  return s;
}

function legalMoves(blocks) {
  const g = buildGrid(blocks);
  const out = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.orient === "h") {
      for (let k = 1; b.col - k >= 0 && g[b.row][b.col - k] === -1; k++)
        out.push({ i, dr: 0, dc: -k });
      for (
        let k = 1;
        b.col + b.len - 1 + k < GRID &&
        g[b.row][b.col + b.len - 1 + k] === -1;
        k++
      )
        out.push({ i, dr: 0, dc: k });
    } else {
      for (let k = 1; b.row - k >= 0 && g[b.row - k][b.col] === -1; k++)
        out.push({ i, dr: -k, dc: 0 });
      for (
        let k = 1;
        b.row + b.len - 1 + k < GRID &&
        g[b.row + b.len - 1 + k][b.col] === -1;
        k++
      )
        out.push({ i, dr: k, dc: 0 });
    }
  }
  return out;
}

function apply(blocks, m) {
  const n = blocks.slice();
  const b = n[m.i];
  n[m.i] = { ...b, row: b.row + m.dr, col: b.col + m.dc };
  return n;
}

function isSolved(blocks) {
  const t = blocks[0];
  return t.col + t.len === GRID;
}

// ---- Solved-state generator with optional structural bias ----
function randomSolvedBoard(opts = {}) {
  const blocks = [];
  const g = Array.from({ length: GRID }, () => new Array(GRID).fill(-1));
  const target = {
    id: 0,
    row: EXIT_ROW,
    col: GRID - TARGET_LEN,
    len: TARGET_LEN,
    orient: "h",
    isTarget: true,
  };
  placeOn(g, target, 0);
  blocks.push(target);

  // Optional bias: pre-place a few structural blockers so the reachable
  // component has deeper max-depth. These are the patterns that make
  // Rush Hour boards hard.
  if (opts.bias === "hard") {
    // Add 2-3 vertical blocks crossing the exit row at columns 1-4.
    const verticals = [];
    const cols = [1, 2, 3, 4].sort(() => Math.random() - 0.5);
    for (const col of cols) {
      if (verticals.length >= randInt(2, 3)) break;
      const len = Math.random() < 0.5 ? 2 : 3;
      const maxRow = Math.min(EXIT_ROW, GRID - len);
      const minRow = Math.max(0, EXIT_ROW - len + 1);
      if (minRow > maxRow) continue;
      const row = randInt(minRow, maxRow);
      const cand = {
        id: blocks.length,
        row,
        col,
        len,
        orient: "v",
        isTarget: false,
      };
      if (canPlace(g, cand)) {
        placeOn(g, cand, blocks.length);
        blocks.push(cand);
        verticals.push(cand);
      }
    }
  }

  const desired = randInt(11, 13);
  let att = 0;
  while (blocks.length < desired && att < 500) {
    att++;
    const len = Math.random() < 0.7 ? 2 : 3;
    const orient = Math.random() < 0.5 ? "h" : "v";
    const row =
      orient === "v" ? randInt(0, GRID - len) : randInt(0, GRID - 1);
    const col =
      orient === "h" ? randInt(0, GRID - len) : randInt(0, GRID - 1);
    const cand = {
      id: blocks.length,
      row,
      col,
      len,
      orient,
      isTarget: false,
    };
    if (canPlace(g, cand)) {
      placeOn(g, cand, blocks.length);
      blocks.push(cand);
    }
  }
  return blocks;
}

// Fully enumerate the reachable component, then multi-source BFS from
// every solved state inside it. Returns { byDepth, size } or null if the
// component is too large.
function analyzeComponent(solved, sizeCap = 200000) {
  const seen = new Map();
  seen.set(encode(solved), solved);
  let frontier = [solved];
  while (frontier.length) {
    const next = [];
    for (const s of frontier) {
      for (const m of legalMoves(s)) {
        const ns = apply(s, m);
        const k = encode(ns);
        if (seen.has(k)) continue;
        seen.set(k, ns);
        next.push(ns);
        if (seen.size > sizeCap) return null;
      }
    }
    frontier = next;
  }
  const dist = new Map();
  const sources = [];
  for (const [k, s] of seen) {
    if (isSolved(s)) {
      dist.set(k, 0);
      sources.push(s);
    }
  }
  const byDepth = new Map([[0, sources]]);
  let front = sources;
  let d = 0;
  while (front.length) {
    const next = [];
    for (const s of front) {
      for (const m of legalMoves(s)) {
        const ns = apply(s, m);
        const k = encode(ns);
        if (dist.has(k)) continue;
        dist.set(k, d + 1);
        next.push(ns);
      }
    }
    d++;
    if (next.length) byDepth.set(d, next);
    front = next;
  }
  return { byDepth, size: seen.size };
}

// Strip the `id` field from blocks — the app re-assigns ids by array index.
function stripBlocks(blocks) {
  return blocks.map((b) => ({
    row: b.row,
    col: b.col,
    len: b.len,
    orient: b.orient,
    isTarget: !!b.isTarget,
  }));
}

function collectPuzzles(tierName) {
  const cfg = TIERS[tierName];
  const produced = [];
  const seenKeys = new Set();
  const deadline = Date.now() + TIME_BUDGET_MS;
  let attempts = 0;
  let tooLarge = 0;

  const biased = tierName === "difficult";
  while (produced.length < cfg.target && Date.now() < deadline) {
    attempts++;
    const solved = randomSolvedBoard({ bias: biased ? "hard" : "none" });
    if (solved.length < 10) continue;
    const res = analyzeComponent(solved);
    if (!res) {
      tooLarge++;
      continue;
    }
    // Collect states whose true depth falls in the tier range.
    const bag = [];
    for (let d = cfg.min; d <= cfg.max; d++) {
      const arr = res.byDepth.get(d);
      if (!arr) continue;
      for (const s of arr) bag.push({ state: s, depth: d });
    }
    if (!bag.length) continue;
    // Sample 1-3 distinct states from this component (so one lucky board
    // doesn't dominate the pool).
    const picks = Math.min(3, bag.length);
    for (let i = 0; i < picks && produced.length < cfg.target; i++) {
      const idx = Math.floor(Math.random() * bag.length);
      const chosen = bag.splice(idx, 1)[0];
      const key = encode(chosen.state);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      produced.push({
        blocks: stripBlocks(chosen.state),
        minMoves: chosen.depth,
      });
    }
  }
  console.log(
    `  ${tierName.padEnd(9)} produced=${produced.length}/${cfg.target}` +
      `  attempts=${attempts}  tooLarge=${tooLarge}`
  );
  // Sort by depth for deterministic output.
  produced.sort((a, b) => a.minMoves - b.minMoves);
  return produced;
}

function main() {
  console.log(`Generating puzzles (budget ${TIME_BUDGET_MS}ms per tier)...`);
  const out = { simple: [], moderate: [], difficult: [] };
  for (const tier of ["simple", "moderate", "difficult"]) {
    out[tier] = collectPuzzles(tier);
  }

  // Serialize to puzzles.js (plain script so the app can <script src=> it).
  const lines = [];
  lines.push("/* AUTO-GENERATED by tools/generate-puzzles.js — do not edit. */");
  lines.push(
    "/* Each puzzle: { blocks: [{row,col,len,orient:'h'|'v',isTarget?}], minMoves } */"
  );
  lines.push("window.PUZZLES = {");
  for (const tier of ["simple", "moderate", "difficult"]) {
    lines.push(`  ${tier}: [`);
    for (const p of out[tier]) {
      const bs = p.blocks
        .map((b) => {
          const parts = [
            `row:${b.row}`,
            `col:${b.col}`,
            `len:${b.len}`,
            `orient:"${b.orient}"`,
          ];
          if (b.isTarget) parts.push("isTarget:true");
          return `{${parts.join(",")}}`;
        })
        .join(",");
      lines.push(`    { minMoves: ${p.minMoves}, blocks: [${bs}] },`);
    }
    lines.push("  ],");
  }
  lines.push("};");
  lines.push("");

  const outPath = path.resolve(__dirname, "..", "puzzles.js");
  fs.writeFileSync(outPath, lines.join("\n"));
  console.log(`Wrote ${outPath}`);
  console.log(
    `Totals: simple=${out.simple.length}, moderate=${out.moderate.length}, difficult=${out.difficult.length}`
  );
}

main();
