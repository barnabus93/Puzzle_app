#!/usr/bin/env node
"use strict";

// =============================================================================
// One Fill Line Puzzle Generator
// =============================================================================
// Generates 6x6 grid puzzles where a player draws a continuous path through
// all empty cells. Uses random obstacle placement with DFS uniqueness
// verification to find puzzles with exactly one Hamiltonian path solution.
// =============================================================================

const fs = require("fs");
const path = require("path");

const ROWS = 6;
const COLS = 6;
const TOTAL_CELLS = ROWS * COLS;

const DIRS = [
  [-1, 0], // up
  [1, 0],  // down
  [0, -1], // left
  [0, 1],  // right
];

const TIERS = {
  simple: { minObs: 2, maxObs: 4 },
  moderate: { minObs: 5, maxObs: 8 },
  difficult: { minObs: 9, maxObs: 14 },
};

const PUZZLES_PER_TIER = 30;

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------

let BUDGET = 90000;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--budget" && argv[i + 1]) {
    BUDGET = parseInt(argv[i + 1], 10);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inBounds(r, c) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Connectivity check: are all unvisited empty cells connected?
// ---------------------------------------------------------------------------

function isConnectedRemaining(grid, visited, expectedCount) {
  let sr = -1;
  let sc = -1;
  for (let r = 0; r < ROWS && sr === -1; r++) {
    for (let c = 0; c < COLS && sr === -1; c++) {
      if (grid[r][c] === 0 && !visited[r][c]) {
        sr = r;
        sc = c;
      }
    }
  }
  if (sr === -1) return expectedCount === 0;

  const queue = [[sr, sc]];
  const seen = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
  seen[sr][sc] = 1;
  let count = 1;
  let head = 0;
  while (head < queue.length) {
    const [r, c] = queue[head++];
    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (
        inBounds(nr, nc) &&
        grid[nr][nc] === 0 &&
        !visited[nr][nc] &&
        !seen[nr][nc]
      ) {
        seen[nr][nc] = 1;
        queue.push([nr, nc]);
        count++;
      }
    }
  }
  return count === expectedCount;
}

// ---------------------------------------------------------------------------
// DFS Uniqueness Solver
// ---------------------------------------------------------------------------
// Counts Hamiltonian paths from start through all empty cells.
// Returns the count, stopping early once it exceeds maxCount.

function countSolutions(grid, startR, startC, maxCount) {
  if (maxCount === undefined) maxCount = 1;

  let emptyCount = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] === 0) emptyCount++;
    }
  }

  const visited = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
  visited[startR][startC] = 1;
  let solutions = 0;

  function dfs(r, c, depth) {
    if (depth === emptyCount) {
      solutions++;
      return;
    }

    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (inBounds(nr, nc) && grid[nr][nc] === 0 && !visited[nr][nc]) {
        visited[nr][nc] = 1;
        // Connectivity pruning
        if (depth < emptyCount - 1) {
          if (!isConnectedRemaining(grid, visited, emptyCount - depth - 1)) {
            visited[nr][nc] = 0;
            continue;
          }
        }
        dfs(nr, nc, depth + 1);
        visited[nr][nc] = 0;
        if (solutions > maxCount) return;
      }
    }
  }

  dfs(startR, startC, 1);
  return solutions;
}

// ---------------------------------------------------------------------------
// Check if all empty cells on a grid form a connected region
// ---------------------------------------------------------------------------

function areEmptyCellsConnected(grid) {
  let sr = -1;
  let sc = -1;
  let emptyCount = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] === 0) {
        emptyCount++;
        if (sr === -1) {
          sr = r;
          sc = c;
        }
      }
    }
  }
  if (emptyCount === 0) return false;

  const seen = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
  const queue = [[sr, sc]];
  seen[sr][sc] = 1;
  let count = 1;
  let head = 0;
  while (head < queue.length) {
    const [r, c] = queue[head++];
    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (inBounds(nr, nc) && grid[nr][nc] === 0 && !seen[nr][nc]) {
        seen[nr][nc] = 1;
        queue.push([nr, nc]);
        count++;
      }
    }
  }
  return count === emptyCount;
}

// ---------------------------------------------------------------------------
// Puzzle Generation: Random obstacle placement
// ---------------------------------------------------------------------------

function generatePuzzle(tierName) {
  const { minObs, maxObs } = TIERS[tierName];
  const obsCount = minObs + Math.floor(Math.random() * (maxObs - minObs + 1));

  // Build list of all cells, shuffle, pick first obsCount as obstacles
  const allCells = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      allCells.push([r, c]);
    }
  }
  shuffle(allCells);

  const grid = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
  for (let i = 0; i < obsCount; i++) {
    const [r, c] = allCells[i];
    grid[r][c] = 1;
  }

  // Check connectivity of empty cells
  if (!areEmptyCellsConnected(grid)) {
    return null;
  }

  // Collect empty cells, shuffle to try different start positions
  const emptyCells = [];
  for (let i = obsCount; i < allCells.length; i++) {
    emptyCells.push(allCells[i]);
  }
  shuffle(emptyCells);

  // Try a few start cells
  const maxStarts = Math.min(4, emptyCells.length);
  for (let si = 0; si < maxStarts; si++) {
    const [sr, sc] = emptyCells[si];
    const sols = countSolutions(grid, sr, sc, 1);
    if (sols === 1) {
      const obstacles = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (grid[r][c] === 1) obstacles.push([r, c]);
        }
      }
      return {
        start: [sr, sc],
        obstacles: obstacles,
        pathLen: TOTAL_CELLS - obsCount,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log("Generating One Fill Line puzzles...");
  console.log("Budget per tier: " + (BUDGET / 1000) + "s");

  const results = { simple: [], moderate: [], difficult: [] };
  const stats = {};

  // Generate difficult first (fastest), then moderate, then simple
  const tierOrder = ["difficult", "moderate", "simple"];

  for (const tierName of tierOrder) {
    const tier = TIERS[tierName];
    const startTime = Date.now();
    let attempts = 0;
    const puzzleKeys = new Set();

    console.log(
      "\n[" +
        tierName +
        "] target=" +
        PUZZLES_PER_TIER +
        " obstacles=" +
        tier.minObs +
        "-" +
        tier.maxObs
    );

    while (results[tierName].length < PUZZLES_PER_TIER) {
      const elapsed = Date.now() - startTime;
      if (elapsed > BUDGET) {
        console.log(
          "  Budget exhausted. Got " +
            results[tierName].length +
            "/" +
            PUZZLES_PER_TIER
        );
        break;
      }

      attempts++;
      const puzzle = generatePuzzle(tierName);
      if (puzzle) {
        const key = JSON.stringify(puzzle.obstacles) + "|" + puzzle.start.join(",");
        if (!puzzleKeys.has(key)) {
          puzzleKeys.add(key);
          results[tierName].push(puzzle);
          if (
            results[tierName].length % 10 === 0 ||
            results[tierName].length === PUZZLES_PER_TIER
          ) {
            const el = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(
              "  " +
                results[tierName].length +
                "/" +
                PUZZLES_PER_TIER +
                " (" +
                attempts +
                " attempts, " +
                el +
                "s)"
            );
          }
        }
      }
    }

    const elapsed = Date.now() - startTime;
    const obsCounts = results[tierName].map((p) => p.obstacles.length);
    stats[tierName] = {
      count: results[tierName].length,
      attempts: attempts,
      timeMs: elapsed,
      obsMin: obsCounts.length ? Math.min(...obsCounts) : 0,
      obsMax: obsCounts.length ? Math.max(...obsCounts) : 0,
    };
  }

  // Write output file
  const outputObj = {
    version: 1,
    simple: results.simple,
    moderate: results.moderate,
    difficult: results.difficult,
  };

  const outContent =
    "window.ONEFILL_PUZZLES = " +
    JSON.stringify(outputObj, null, 2) +
    ";\n";

  const outPath = path.resolve(__dirname, "..", "onefill-puzzles.js");
  fs.writeFileSync(outPath, outContent, "utf8");

  // Summary
  console.log("\n========================================");
  console.log("Output: " + outPath);
  console.log("========================================");

  for (const tierName of ["simple", "moderate", "difficult"]) {
    const s = stats[tierName];
    console.log(
      tierName +
        ": " +
        s.count +
        " puzzles, obstacles " +
        s.obsMin +
        "-" +
        s.obsMax +
        ", " +
        s.attempts +
        " attempts, " +
        (s.timeMs / 1000).toFixed(1) +
        "s"
    );
  }

  const total =
    results.simple.length + results.moderate.length + results.difficult.length;
  console.log("\nTotal: " + total + " puzzles");

  if (total < 90) {
    console.log("WARNING: Did not reach 90 puzzles.");
    process.exit(1);
  }
}

main();
