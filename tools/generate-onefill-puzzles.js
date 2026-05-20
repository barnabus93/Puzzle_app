#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROWS = 6;
const COLS = 6;
const TOTAL = ROWS * COLS;
const DIRS = [[-1,0],[1,0],[0,-1],[0,1]];
const TIERS = {
  simple:    { minObs: 2, maxObs: 4, target: 30 },
  moderate:  { minObs: 5, maxObs: 8, target: 30 },
  difficult: { minObs: 9, maxObs: 14, target: 30 },
};

let BUDGET = 90000;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--budget") BUDGET = parseInt(argv[i + 1], 10);
}

function inBounds(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Inverse Random Walker: trace a random Hamiltonian-ish path,
// unvisited cells become obstacles. Uses Warnsdorff's heuristic
// to maximize coverage (minimize obstacles).
function randomWalk(targetObs) {
  const visited = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
  const sr = Math.floor(Math.random() * ROWS);
  const sc = Math.floor(Math.random() * COLS);
  visited[sr][sc] = 1;
  const pathCells = [[sr, sc]];
  let r = sr, c = sc;

  while (true) {
    // Neighbors sorted by Warnsdorff's: fewest onward moves first
    const neighbors = [];
    for (const [dr, dc] of DIRS) {
      const nr = r + dr, nc = c + dc;
      if (inBounds(nr, nc) && !visited[nr][nc]) {
        let deg = 0;
        for (const [dr2, dc2] of DIRS) {
          const nr2 = nr + dr2, nc2 = nc + dc2;
          if (inBounds(nr2, nc2) && !visited[nr2][nc2]) deg++;
        }
        neighbors.push({ r: nr, c: nc, deg });
      }
    }
    if (neighbors.length === 0) break;
    // Sort by degree (Warnsdorff), break ties randomly
    neighbors.sort((a, b) => a.deg - b.deg || Math.random() - 0.5);
    const next = neighbors[0];
    r = next.r; c = next.c;
    visited[r][c] = 1;
    pathCells.push([r, c]);
  }

  const obsCount = TOTAL - pathCells.length;
  return { sr, sc, pathCells, obsCount, visited };
}

// Quick solvability check: DFS with connectivity pruning.
// Returns true if at least 1 Hamiltonian path exists from (sr,sc).
// Caps work to avoid hanging on hard instances.
function isSolvable(grid, sr, sc, emptyCount) {
  const vis = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
  vis[sr][sc] = 1;
  let found = false;
  let ops = 0;
  const MAX_OPS = 500000;

  function dfs(r, c, depth) {
    if (found || ops > MAX_OPS) return;
    if (depth === emptyCount) { found = true; return; }
    ops++;
    for (const [dr, dc] of DIRS) {
      const nr = r + dr, nc = c + dc;
      if (!inBounds(nr, nc) || grid[nr][nc] !== 0 || vis[nr][nc]) continue;
      vis[nr][nc] = 1;
      dfs(nr, nc, depth + 1);
      vis[nr][nc] = 0;
      if (found) return;
    }
  }

  dfs(sr, sc, 1);
  return found;
}

function generatePuzzle(tier) {
  const { minObs, maxObs } = tier;
  // Keep walking until we get the right obstacle count
  const walk = randomWalk();
  if (walk.obsCount < minObs || walk.obsCount > maxObs) return null;

  // Build the grid
  const grid = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
  const obstacles = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!walk.visited[r][c]) {
        grid[r][c] = 1;
        obstacles.push([r, c]);
      }
    }
  }

  // The walk already proves solvability, but verify with DFS
  const emptyCount = TOTAL - obstacles.length;
  if (!isSolvable(grid, walk.sr, walk.sc, emptyCount)) return null;

  return {
    start: [walk.sr, walk.sc],
    obstacles,
    pathLen: emptyCount,
  };
}

function main() {
  console.log("Generating One Fill Line puzzles...");
  const results = { simple: [], moderate: [], difficult: [] };

  for (const tierName of ["simple", "moderate", "difficult"]) {
    const tier = TIERS[tierName];
    const t0 = Date.now();
    let attempts = 0;
    const keys = new Set();

    while (results[tierName].length < tier.target && Date.now() - t0 < BUDGET) {
      attempts++;
      const p = generatePuzzle(tier);
      if (!p) continue;
      const key = JSON.stringify(p.obstacles) + "|" + p.start.join(",");
      if (keys.has(key)) continue;
      keys.add(key);
      results[tierName].push(p);
    }

    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    const obs = results[tierName].map((p) => p.obstacles.length);
    console.log(
      `  ${tierName.padEnd(9)} ${results[tierName].length}/${tier.target} puzzles, ` +
      `obstacles ${Math.min(...obs)}-${Math.max(...obs)}, ${attempts} attempts, ${dt}s`
    );
  }

  const lines = ['window.ONEFILL_PUZZLES = ' + JSON.stringify({ version: 1, ...results }, null, 2) + ';'];
  const outPath = path.resolve(__dirname, "..", "onefill-puzzles.js");
  fs.writeFileSync(outPath, lines.join("\n"));
  console.log("Wrote " + outPath);
  const total = results.simple.length + results.moderate.length + results.difficult.length;
  console.log("Total: " + total + " puzzles");
}

main();
