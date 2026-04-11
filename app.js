/* Unblock Puzzle — single-file app logic.
 *
 * Layout:
 *   1. Constants
 *   2. localStorage wrapper
 *   3. Board helpers (buildGrid)
 *   4. Puzzle selection (pick random from window.PUZZLES)
 *   5. Rendering
 *   6. Pointer input (drag-to-slide)
 *   7. UI wiring and init
 *
 * Puzzles are pre-generated offline by tools/generate-puzzles.js and loaded
 * from puzzles.js. Runtime only picks one at random per difficulty.
 */

(() => {
  "use strict";

  // ------------------------------------------------------------------
  // 1. Constants
  // ------------------------------------------------------------------
  const GRID = 6;

  const DIFFICULTY = {
    simple: { label: "Simple" },
    moderate: { label: "Moderate" },
    difficult: { label: "Difficult" },
  };

  const STORAGE_KEYS = {
    count: "puzzle.completedCount",
    difficulty: "puzzle.difficulty",
    tutorial: "puzzle.tutorialSeen",
    blockStyle: "puzzle.blockStyle",
    version: "puzzle.version",
  };

  const BLOCK_STYLES = { wood: true, cars: true, fruit: true };
  const STORAGE_VERSION = 1;

  // ------------------------------------------------------------------
  // 2. localStorage wrapper (safe — never throws)
  // ------------------------------------------------------------------
  const store = {
    getCount() {
      try {
        const v = localStorage.getItem(STORAGE_KEYS.count);
        const n = v == null ? 0 : parseInt(v, 10);
        return Number.isFinite(n) && n >= 0 ? n : 0;
      } catch {
        return 0;
      }
    },
    setCount(n) {
      try {
        localStorage.setItem(STORAGE_KEYS.count, String(n));
      } catch {
        /* ignore */
      }
    },
    getDifficulty() {
      try {
        const v = localStorage.getItem(STORAGE_KEYS.difficulty);
        if (v && DIFFICULTY[v]) return v;
      } catch {
        /* ignore */
      }
      return "moderate";
    },
    setDifficulty(d) {
      try {
        localStorage.setItem(STORAGE_KEYS.difficulty, d);
      } catch {
        /* ignore */
      }
    },
    getTutorialSeen() {
      try {
        return localStorage.getItem(STORAGE_KEYS.tutorial) === "1";
      } catch {
        return false;
      }
    },
    setTutorialSeen(v) {
      try {
        localStorage.setItem(STORAGE_KEYS.tutorial, v ? "1" : "0");
      } catch {
        /* ignore */
      }
    },
    getBlockStyle() {
      try {
        const v = localStorage.getItem(STORAGE_KEYS.blockStyle);
        if (v && BLOCK_STYLES[v]) return v;
      } catch {
        /* ignore */
      }
      return "wood";
    },
    setBlockStyle(s) {
      try {
        localStorage.setItem(STORAGE_KEYS.blockStyle, s);
      } catch {
        /* ignore */
      }
    },
    initVersion() {
      try {
        localStorage.setItem(STORAGE_KEYS.version, String(STORAGE_VERSION));
      } catch {
        /* ignore */
      }
    },
  };

  // ------------------------------------------------------------------
  // 3. Board helpers
  // ------------------------------------------------------------------
  // A "block" is { id, row, col, len, orient: "h" | "v", isTarget }.
  // A "state" is an array of blocks in stable index order.

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

  // ------------------------------------------------------------------
  // 4. Puzzle selection
  // ------------------------------------------------------------------
  // Puzzles are pre-generated offline by tools/generate-puzzles.js and
  // loaded via puzzles.js as window.PUZZLES. Every puzzle has verified
  // true minimum-moves-to-solve, so runtime selection is just a random
  // pick from the right tier.
  function pickPuzzle(difficulty) {
    const pool =
      (window.PUZZLES && window.PUZZLES[difficulty]) ||
      (window.PUZZLES && window.PUZZLES.moderate) ||
      null;
    if (!pool || !pool.length) return fallbackPuzzle();
    const src = pool[Math.floor(Math.random() * pool.length)];
    // Deep-clone the blocks and assign ids by array index.
    const blocks = src.blocks.map((b, i) => ({
      id: i,
      row: b.row,
      col: b.col,
      len: b.len,
      orient: b.orient,
      isTarget: !!b.isTarget,
    }));
    // Ensure the target is always at index 0, because the rest of the app
    // (win check, render colors) assumes so.
    const tIdx = blocks.findIndex((b) => b.isTarget);
    if (tIdx > 0) {
      const t = blocks.splice(tIdx, 1)[0];
      blocks.unshift(t);
      blocks.forEach((b, i) => (b.id = i));
    }
    return { blocks, minMoves: src.minMoves };
  }

  // Last-resort fallback if puzzles.js somehow failed to load.
  function fallbackPuzzle() {
    return {
      blocks: [
        { id: 0, row: 2, col: 1, len: 2, orient: "h", isTarget: true },
        { id: 1, row: 0, col: 0, len: 2, orient: "v", isTarget: false },
        { id: 2, row: 0, col: 3, len: 3, orient: "h", isTarget: false },
        { id: 3, row: 1, col: 2, len: 2, orient: "v", isTarget: false },
        { id: 4, row: 3, col: 0, len: 3, orient: "h", isTarget: false },
        { id: 5, row: 4, col: 3, len: 2, orient: "v", isTarget: false },
        { id: 6, row: 4, col: 5, len: 2, orient: "v", isTarget: false },
      ],
      minMoves: 6,
    };
  }

  // ------------------------------------------------------------------
  // 5. Rendering
  // ------------------------------------------------------------------
  const boardEl = document.getElementById("board");
  const boardWrapEl = document.getElementById("board-wrap");
  const completedCountEl = document.getElementById("completed-count");
  const moveCountEl = document.getElementById("move-count");
  const difficultyLabelEl = document.getElementById("difficulty-label");
  const newPuzzleBtn = document.getElementById("new-puzzle-btn");
  const restartBtn = document.getElementById("restart-btn");
  const settingsBtn = document.getElementById("settings-btn");
  const settingsModal = document.getElementById("settings-modal");
  const winModal = document.getElementById("win-modal");
  const winMovesEl = document.getElementById("win-moves");
  const winTotalEl = document.getElementById("win-total");
  const nextPuzzleBtn = document.getElementById("next-puzzle-btn");
  const resetCountBtn = document.getElementById("reset-count-btn");
  const tutorialModal = document.getElementById("tutorial-modal");
  const tutorialBoardEl = document.getElementById("tutorial-board");
  const tutorialCaptionEl = document.getElementById("tutorial-caption");
  const tutorialBtn = document.getElementById("tutorial-btn");

  let state = {
    blocks: [],
    // Deep-cloned snapshot of the blocks as they first loaded for the
    // current puzzle. Used by the Restart button to reset without
    // rolling a brand-new puzzle.
    originalBlocks: null,
    moves: 0,
    completed: 0,
    difficulty: "moderate",
    blockStyle: "wood",
    winLocked: false,
  };

  function cloneBlocks(blocks) {
    return blocks.map((b) => ({
      id: b.id,
      row: b.row,
      col: b.col,
      len: b.len,
      orient: b.orient,
      isTarget: b.isTarget,
    }));
  }

  function cellPx() {
    const v = getComputedStyle(boardEl).getPropertyValue("--cell").trim();
    return parseFloat(v) || 48;
  }

  function sizeBoard() {
    const wrapRect = boardWrapEl.getBoundingClientRect();
    // Leave a little breathing room for the exit marker on the right.
    const avail = Math.min(wrapRect.width, wrapRect.height) - 16;
    let cp = Math.floor(avail / GRID);
    cp = Math.max(36, Math.min(96, cp));
    boardEl.style.setProperty("--cell", cp + "px");
  }

  function blockTransform(row, col) {
    // 2px inset so blocks don't touch cell borders.
    return `translate(calc(var(--cell) * ${col} + 2px), calc(var(--cell) * ${row} + 2px))`;
  }

  // ------------------------------------------------------------------
  // Block style themes (wood / cars / fruit)
  // ------------------------------------------------------------------
  // Each theme provides a function that sets a block element's
  // background. The dispatch is in applyBlockStyle() below.

  // Rich, saturated base colors applied under the wood-grain overlay.
  const WOOD_COLORS = {
    target: "#c8302b",
    palette: [
      "#d14b3c",
      "#e07c3e",
      "#d9a42e",
      "#7ea83a",
      "#4ba069",
      "#369990",
      "#4879b8",
      "#6657b0",
      "#a04db8",
      "#c0508c",
      "#b57d3a",
      "#6b86a8",
    ],
  };

  // Vivid car body colours. Target is always the classic Rush Hour red.
  const CAR_COLORS = {
    target: "#d0281c",
    palette: [
      "#e8801a",
      "#f2c930",
      "#4bae55",
      "#30a3b5",
      "#3a6dbf",
      "#8b4fc5",
      "#c94b9a",
      "#7a4a1e",
      "#dcdcdc",
      "#9a9a9a",
      "#4a4a4a",
      "#b8862a",
    ],
  };

  // Assigned by block id; target gets a watermelon wedge.
  const FRUIT_ROTATION = ["apple", "orange", "kiwi", "banana"];

  function woodBaseColor(block) {
    if (block.isTarget) return WOOD_COLORS.target;
    return WOOD_COLORS.palette[block.id % WOOD_COLORS.palette.length];
  }
  function carBaseColor(block) {
    if (block.isTarget) return CAR_COLORS.target;
    return CAR_COLORS.palette[block.id % CAR_COLORS.palette.length];
  }
  function fruitTypeFor(block) {
    if (block.isTarget) return "watermelon";
    return FRUIT_ROTATION[block.id % FRUIT_ROTATION.length];
  }

  function encodeSvg(svg) {
    return (
      'url("data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent(svg) +
      '")'
    );
  }

  // Apply a wood-grain background. SVG feTurbulence filter with a
  // per-block seed, multiplied over the solid base colour via
  // background-blend-mode so every block has unique, natural grain.
  //
  // NOTE: write `#` literally in the filter reference. encodeURIComponent
  // turns it into `%23` in the URL; browsers URL-decode back to `#`
  // before parsing the SVG. Hard-coding `%23` here would double-encode.
  // The rect also has `fill='white'` — a no-op under multiply blend, so
  // if the filter ever fails to resolve the block still shows its solid
  // base colour rather than black (SVG rect default is `fill='black'`).
  function applyWoodGrain(el, baseColor, orient, seedSource) {
    const seed = ((seedSource * 37 + 11) % 97) + 1;
    const bf = orient === "h" ? "0.013 0.32" : "0.32 0.013";
    const filterId = "wg" + seed;
    const svg =
      "<svg xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none' viewBox='0 0 240 80'>" +
      "<filter id='" + filterId + "' x='0' y='0' width='100%' height='100%'>" +
      "<feTurbulence type='fractalNoise' baseFrequency='" + bf +
      "' numOctaves='3' seed='" + seed + "'/>" +
      "<feColorMatrix values='" +
      "0.22 0.22 0.22 0 0.5 " +
      "0.22 0.22 0.22 0 0.5 " +
      "0.22 0.22 0.22 0 0.5 " +
      "0 0 0 0 1'/>" +
      "</filter>" +
      "<rect width='100%' height='100%' fill='white' filter='url(#" + filterId + ")'/>" +
      "</svg>";
    el.style.backgroundColor = baseColor;
    el.style.backgroundImage = encodeSvg(svg);
    el.style.backgroundSize = "100% 100%";
    el.style.backgroundRepeat = "no-repeat";
    el.style.backgroundBlendMode = "multiply";
  }

  // -----------------------------------------------------------------
  // Car theme — top-down vehicles
  // -----------------------------------------------------------------
  // Each block gets an SVG whose viewBox matches the block's aspect
  // ratio (so `background-size: 100% 100%` stretches 1:1, no distortion).
  // Length-2 blocks → sedan. Length-3 blocks → truck/bus. Vertical
  // blocks use the same sprite drawn rotated inside the SVG.

  // Horizontal sedan, 200x100 viewBox (width:height = 2:1).
  function sedanH(color) {
    return (
      "<rect x='10' y='14' width='180' height='72' rx='22' ry='22' fill='" + color + "' stroke='rgba(0,0,0,0.35)' stroke-width='2'/>" +
      "<line x1='55' y1='24' x2='55' y2='76' stroke='rgba(0,0,0,0.45)' stroke-width='2'/>" +
      "<line x1='145' y1='24' x2='145' y2='76' stroke='rgba(0,0,0,0.45)' stroke-width='2'/>" +
      "<path d='M58 30 Q61 50 58 70 L142 70 Q139 50 142 30 Z' fill='rgba(10,20,35,0.72)'/>" +
      "<rect x='26' y='4' width='24' height='10' rx='3' fill='#151515'/>" +
      "<rect x='26' y='86' width='24' height='10' rx='3' fill='#151515'/>" +
      "<rect x='150' y='4' width='24' height='10' rx='3' fill='#151515'/>" +
      "<rect x='150' y='86' width='24' height='10' rx='3' fill='#151515'/>" +
      "<rect x='186' y='24' width='5' height='10' rx='2' fill='#fff2b0'/>" +
      "<rect x='186' y='66' width='5' height='10' rx='2' fill='#fff2b0'/>" +
      "<rect x='9' y='26' width='4' height='10' rx='2' fill='#c02020'/>" +
      "<rect x='9' y='64' width='4' height='10' rx='2' fill='#c02020'/>"
    );
  }

  // Vertical sedan, 100x200 viewBox. Front faces up.
  function sedanV(color) {
    return (
      "<rect x='14' y='10' width='72' height='180' rx='22' ry='22' fill='" + color + "' stroke='rgba(0,0,0,0.35)' stroke-width='2'/>" +
      "<line x1='24' y1='55' x2='76' y2='55' stroke='rgba(0,0,0,0.45)' stroke-width='2'/>" +
      "<line x1='24' y1='145' x2='76' y2='145' stroke='rgba(0,0,0,0.45)' stroke-width='2'/>" +
      "<path d='M30 58 Q50 61 70 58 L70 142 Q50 139 30 142 Z' fill='rgba(10,20,35,0.72)'/>" +
      "<rect x='4' y='26' width='10' height='24' rx='3' fill='#151515'/>" +
      "<rect x='86' y='26' width='10' height='24' rx='3' fill='#151515'/>" +
      "<rect x='4' y='150' width='10' height='24' rx='3' fill='#151515'/>" +
      "<rect x='86' y='150' width='10' height='24' rx='3' fill='#151515'/>" +
      "<rect x='24' y='9' width='10' height='5' rx='2' fill='#fff2b0'/>" +
      "<rect x='66' y='9' width='10' height='5' rx='2' fill='#fff2b0'/>" +
      "<rect x='26' y='187' width='10' height='4' rx='2' fill='#c02020'/>" +
      "<rect x='64' y='187' width='10' height='4' rx='2' fill='#c02020'/>"
    );
  }

  // Horizontal truck, 300x100 viewBox.
  function truckH(color) {
    return (
      "<rect x='8' y='14' width='100' height='72' rx='8' fill='" + color + "' stroke='rgba(0,0,0,0.4)' stroke-width='2'/>" +
      "<rect x='112' y='18' width='180' height='64' rx='6' fill='" + color + "' stroke='rgba(0,0,0,0.55)' stroke-width='2.5'/>" +
      "<line x1='20' y1='30' x2='100' y2='30' stroke='rgba(0,0,0,0.3)' stroke-width='2'/>" +
      "<line x1='20' y1='50' x2='100' y2='50' stroke='rgba(0,0,0,0.3)' stroke-width='2'/>" +
      "<line x1='20' y1='70' x2='100' y2='70' stroke='rgba(0,0,0,0.3)' stroke-width='2'/>" +
      "<path d='M258 28 Q261 50 258 72 L225 72 Q222 50 225 28 Z' fill='rgba(10,20,35,0.72)'/>" +
      "<rect x='30' y='4' width='24' height='10' rx='3' fill='#151515'/>" +
      "<rect x='30' y='86' width='24' height='10' rx='3' fill='#151515'/>" +
      "<rect x='70' y='4' width='24' height='10' rx='3' fill='#151515'/>" +
      "<rect x='70' y='86' width='24' height='10' rx='3' fill='#151515'/>" +
      "<rect x='228' y='4' width='24' height='10' rx='3' fill='#151515'/>" +
      "<rect x='228' y='86' width='24' height='10' rx='3' fill='#151515'/>" +
      "<rect x='286' y='26' width='5' height='10' rx='2' fill='#fff2b0'/>" +
      "<rect x='286' y='64' width='5' height='10' rx='2' fill='#fff2b0'/>" +
      "<rect x='9' y='26' width='4' height='10' rx='2' fill='#c02020'/>" +
      "<rect x='9' y='64' width='4' height='10' rx='2' fill='#c02020'/>"
    );
  }

  // Vertical truck, 100x300 viewBox. Front faces up.
  function truckV(color) {
    return (
      "<rect x='14' y='192' width='72' height='100' rx='8' fill='" + color + "' stroke='rgba(0,0,0,0.4)' stroke-width='2'/>" +
      "<rect x='18' y='8' width='64' height='180' rx='6' fill='" + color + "' stroke='rgba(0,0,0,0.55)' stroke-width='2.5'/>" +
      "<line x1='30' y1='200' x2='30' y2='280' stroke='rgba(0,0,0,0.3)' stroke-width='2'/>" +
      "<line x1='50' y1='200' x2='50' y2='280' stroke='rgba(0,0,0,0.3)' stroke-width='2'/>" +
      "<line x1='70' y1='200' x2='70' y2='280' stroke='rgba(0,0,0,0.3)' stroke-width='2'/>" +
      "<path d='M28 42 Q50 45 72 42 L72 75 Q50 72 28 75 Z' fill='rgba(10,20,35,0.72)'/>" +
      "<rect x='4' y='30' width='10' height='24' rx='3' fill='#151515'/>" +
      "<rect x='86' y='30' width='10' height='24' rx='3' fill='#151515'/>" +
      "<rect x='4' y='70' width='10' height='24' rx='3' fill='#151515'/>" +
      "<rect x='86' y='70' width='10' height='24' rx='3' fill='#151515'/>" +
      "<rect x='4' y='228' width='10' height='24' rx='3' fill='#151515'/>" +
      "<rect x='86' y='228' width='10' height='24' rx='3' fill='#151515'/>" +
      "<rect x='26' y='9' width='10' height='5' rx='2' fill='#fff2b0'/>" +
      "<rect x='64' y='9' width='10' height='5' rx='2' fill='#fff2b0'/>" +
      "<rect x='26' y='286' width='10' height='4' rx='2' fill='#c02020'/>" +
      "<rect x='64' y='286' width='10' height='4' rx='2' fill='#c02020'/>"
    );
  }

  function applyCarSprite(el, block) {
    const color = carBaseColor(block);
    const isH = block.orient === "h";
    const vbW = isH ? 100 * block.len : 100;
    const vbH = isH ? 100 : 100 * block.len;
    let inner;
    if (block.len === 3) inner = isH ? truckH(color) : truckV(color);
    else inner = isH ? sedanH(color) : sedanV(color);
    const svg =
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 " +
      vbW + " " + vbH + "'>" + inner + "</svg>";
    el.style.backgroundColor = "transparent";
    el.style.backgroundImage = encodeSvg(svg);
    el.style.backgroundSize = "100% 100%";
    el.style.backgroundRepeat = "no-repeat";
    el.style.backgroundBlendMode = "normal";
  }

  // -----------------------------------------------------------------
  // Fruit theme — row-of-N round fruits
  // -----------------------------------------------------------------
  // A block of length N shows N copies of its assigned fruit side by
  // side (or stacked, for vertical blocks). Each fruit is drawn inside
  // a 100×100 cell slot; the SVG viewBox scales with block length so
  // `background-size: 100% 100%` stretches 1:1 without distortion.

  const FRUIT_DRAWERS = {
    apple: (cx, cy) =>
      "<circle cx='" + cx + "' cy='" + (cy + 4) + "' r='32' fill='#d63a28' stroke='#6e1510' stroke-width='2'/>" +
      "<path d='M" + (cx - 4) + " " + (cy - 28) + " Q" + cx + " " + (cy - 34) + " " + (cx + 4) + " " + (cy - 30) + "' stroke='#4a2a10' stroke-width='3' fill='none' stroke-linecap='round'/>" +
      "<ellipse cx='" + (cx + 10) + "' cy='" + (cy - 30) + "' rx='8' ry='4' fill='#4b932c' transform='rotate(28 " + (cx + 10) + " " + (cy - 30) + ")'/>" +
      "<ellipse cx='" + (cx - 10) + "' cy='" + (cy - 5) + "' rx='6' ry='3' fill='rgba(255,255,255,0.35)'/>",
    orange: (cx, cy) =>
      "<circle cx='" + cx + "' cy='" + (cy + 3) + "' r='32' fill='#ee812a' stroke='#813410' stroke-width='2'/>" +
      "<circle cx='" + (cx - 8) + "' cy='" + (cy - 3) + "' r='1.4' fill='rgba(90,30,5,0.55)'/>" +
      "<circle cx='" + (cx + 7) + "' cy='" + (cy + 1) + "' r='1.4' fill='rgba(90,30,5,0.55)'/>" +
      "<circle cx='" + (cx - 3) + "' cy='" + (cy + 10) + "' r='1.4' fill='rgba(90,30,5,0.55)'/>" +
      "<circle cx='" + (cx + 10) + "' cy='" + (cy + 14) + "' r='1.4' fill='rgba(90,30,5,0.55)'/>" +
      "<circle cx='" + (cx - 12) + "' cy='" + (cy + 12) + "' r='1.4' fill='rgba(90,30,5,0.55)'/>" +
      "<path d='M" + (cx - 3) + " " + (cy - 28) + " Q" + cx + " " + (cy - 34) + " " + (cx + 5) + " " + (cy - 30) + "' stroke='#4a3010' stroke-width='2.5' fill='none' stroke-linecap='round'/>" +
      "<ellipse cx='" + (cx + 10) + "' cy='" + (cy - 28) + "' rx='7' ry='3' fill='#4b932c' transform='rotate(30 " + (cx + 10) + " " + (cy - 28) + ")'/>" +
      "<ellipse cx='" + (cx - 10) + "' cy='" + (cy - 6) + "' rx='6' ry='3' fill='rgba(255,255,255,0.35)'/>",
    kiwi: (cx, cy) =>
      "<circle cx='" + cx + "' cy='" + cy + "' r='33' fill='#6e4a1e'/>" +
      "<circle cx='" + cx + "' cy='" + cy + "' r='28' fill='#a8c766'/>" +
      "<circle cx='" + cx + "' cy='" + cy + "' r='14' fill='#f6f2dc'/>" +
      "<circle cx='" + (cx - 6) + "' cy='" + (cy - 6) + "' r='1.4' fill='#161616'/>" +
      "<circle cx='" + (cx + 6) + "' cy='" + (cy - 6) + "' r='1.4' fill='#161616'/>" +
      "<circle cx='" + (cx - 8) + "' cy='" + (cy + 3) + "' r='1.4' fill='#161616'/>" +
      "<circle cx='" + (cx + 8) + "' cy='" + (cy + 3) + "' r='1.4' fill='#161616'/>" +
      "<circle cx='" + (cx - 5) + "' cy='" + (cy + 10) + "' r='1.4' fill='#161616'/>" +
      "<circle cx='" + (cx + 5) + "' cy='" + (cy + 10) + "' r='1.4' fill='#161616'/>" +
      "<circle cx='" + cx + "' cy='" + (cy - 12) + "' r='1.4' fill='#161616'/>",
    banana: (cx, cy) =>
      "<path d='M" + (cx - 28) + " " + (cy + 22) +
      " C" + (cx - 34) + " " + (cy - 10) +
      " " + (cx - 8) + " " + (cy - 28) +
      " " + (cx + 26) + " " + (cy - 18) +
      " C" + (cx + 20) + " " + (cy - 12) +
      " " + (cx + 8) + " " + (cy - 4) +
      " " + (cx - 2) + " " + (cy + 8) +
      " C" + (cx - 10) + " " + (cy + 18) +
      " " + (cx - 18) + " " + (cy + 24) +
      " " + (cx - 28) + " " + (cy + 22) +
      " Z' fill='#f1cc38' stroke='#6e5410' stroke-width='2' stroke-linejoin='round'/>" +
      "<path d='M" + (cx + 22) + " " + (cy - 17) +
      " l4 -4' stroke='#4a3610' stroke-width='2.5' stroke-linecap='round'/>" +
      "<path d='M" + (cx - 22) + " " + (cy + 20) +
      " l-2 3' stroke='#4a3610' stroke-width='2' stroke-linecap='round'/>",
    watermelon: (cx, cy) =>
      "<path d='M" + (cx - 34) + " " + (cy + 28) +
      " Q" + cx + " " + (cy - 30) + " " + (cx + 34) + " " + (cy + 28) + " Z' fill='#2e6e3a' stroke='#153a1c' stroke-width='2'/>" +
      "<path d='M" + (cx - 28) + " " + (cy + 24) +
      " Q" + cx + " " + (cy - 18) + " " + (cx + 28) + " " + (cy + 24) + " Z' fill='#f6eedc'/>" +
      "<path d='M" + (cx - 23) + " " + (cy + 20) +
      " Q" + cx + " " + (cy - 8) + " " + (cx + 23) + " " + (cy + 20) + " Z' fill='#e63827'/>" +
      "<ellipse cx='" + (cx - 8) + "' cy='" + cy + "' rx='1.8' ry='2.8' fill='#181210'/>" +
      "<ellipse cx='" + (cx + 8) + "' cy='" + cy + "' rx='1.8' ry='2.8' fill='#181210'/>" +
      "<ellipse cx='" + cx + "' cy='" + (cy + 10) + "' rx='1.8' ry='2.8' fill='#181210'/>" +
      "<ellipse cx='" + (cx - 4) + "' cy='" + (cy - 5) + "' rx='1.8' ry='2.8' fill='#181210'/>" +
      "<ellipse cx='" + (cx + 4) + "' cy='" + (cy - 5) + "' rx='1.8' ry='2.8' fill='#181210'/>",
  };

  function applyFruitSprite(el, block) {
    const fruit = fruitTypeFor(block);
    const drawer = FRUIT_DRAWERS[fruit] || FRUIT_DRAWERS.apple;
    const isH = block.orient === "h";
    const n = block.len;
    const cell = 100;
    const vbW = isH ? cell * n : cell;
    const vbH = isH ? cell : cell * n;
    let inner = "";
    for (let i = 0; i < n; i++) {
      const cx = isH ? i * cell + cell / 2 : cell / 2;
      const cy = isH ? cell / 2 : i * cell + cell / 2;
      inner += drawer(cx, cy);
    }
    const svg =
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 " +
      vbW + " " + vbH + "'>" + inner + "</svg>";
    el.style.backgroundColor = "transparent";
    el.style.backgroundImage = encodeSvg(svg);
    el.style.backgroundSize = "100% 100%";
    el.style.backgroundRepeat = "no-repeat";
    el.style.backgroundBlendMode = "normal";
  }

  // Dispatch.
  function applyBlockStyle(el, block, styleName) {
    if (styleName === "cars") return applyCarSprite(el, block);
    if (styleName === "fruit") return applyFruitSprite(el, block);
    applyWoodGrain(el, woodBaseColor(block), block.orient, block.id);
  }

  function renderBoard() {
    boardEl.innerHTML = "";
    const themeClass = "theme-" + state.blockStyle;
    for (const b of state.blocks) {
      const el = document.createElement("div");
      el.className = "block " + themeClass + (b.isTarget ? " target" : "");
      el.dataset.id = String(b.id);
      const w = b.orient === "h" ? b.len : 1;
      const h = b.orient === "v" ? b.len : 1;
      el.style.width = `calc(var(--cell) * ${w} - 4px)`;
      el.style.height = `calc(var(--cell) * ${h} - 4px)`;
      el.style.transform = blockTransform(b.row, b.col);
      applyBlockStyle(el, b, state.blockStyle);
      el.addEventListener("pointerdown", onBlockPointerDown);
      boardEl.appendChild(el);
    }
  }

  function updateHeader() {
    completedCountEl.textContent = String(state.completed);
    moveCountEl.textContent = String(state.moves);
    difficultyLabelEl.textContent = DIFFICULTY[state.difficulty].label;
  }

  // ------------------------------------------------------------------
  // 6. Pointer input — drag to slide
  // ------------------------------------------------------------------
  let drag = null;

  // How many cells can `block` slide in its allowed direction right now?
  // Returns { min, max } — both relative to the block's current position.
  function legalRange(blocks, block) {
    const grid = buildGrid(blocks);
    let min = 0;
    let max = 0;
    if (block.orient === "h") {
      for (
        let k = 1;
        block.col - k >= 0 && grid[block.row][block.col - k] === -1;
        k++
      ) {
        min = -k;
      }
      for (
        let k = 1;
        block.col + block.len - 1 + k < GRID &&
        grid[block.row][block.col + block.len - 1 + k] === -1;
        k++
      ) {
        max = k;
      }
    } else {
      for (
        let k = 1;
        block.row - k >= 0 && grid[block.row - k][block.col] === -1;
        k++
      ) {
        min = -k;
      }
      for (
        let k = 1;
        block.row + block.len - 1 + k < GRID &&
        grid[block.row + block.len - 1 + k][block.col] === -1;
        k++
      ) {
        max = k;
      }
    }
    return { min, max };
  }

  function onBlockPointerDown(e) {
    if (state.winLocked) return;
    e.preventDefault();
    const el = e.currentTarget;
    const id = Number(el.dataset.id);
    const block = state.blocks.find((b) => b.id === id);
    if (!block) return;

    const { min, max } = legalRange(state.blocks, block);

    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    drag = {
      pointerId: e.pointerId,
      el,
      block,
      startX: e.clientX,
      startY: e.clientY,
      startRow: block.row,
      startCol: block.col,
      axis: block.orient,
      minCells: min,
      maxCells: max,
      cell: cellPx(),
      delta: 0,
    };
    el.classList.add("dragging");
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const raw = drag.axis === "h" ? dx / drag.cell : dy / drag.cell;
    const clamped = Math.max(drag.minCells, Math.min(drag.maxCells, raw));
    drag.delta = clamped;
    const row =
      drag.axis === "v" ? drag.startRow + clamped : drag.startRow;
    const col =
      drag.axis === "h" ? drag.startCol + clamped : drag.startCol;
    drag.el.style.transform = blockTransform(row, col);
  }

  function onPointerUp(e) {
    if (!drag) return;
    const snapped = Math.round(drag.delta);
    const b = drag.block;
    const prevRow = b.row;
    const prevCol = b.col;
    if (drag.axis === "h") b.col = drag.startCol + snapped;
    else b.row = drag.startRow + snapped;

    drag.el.classList.remove("dragging");
    drag.el.style.transform = blockTransform(b.row, b.col);

    const el = drag.el;
    el.removeEventListener("pointermove", onPointerMove);
    el.removeEventListener("pointerup", onPointerUp);
    el.removeEventListener("pointercancel", onPointerUp);
    drag = null;

    if (b.row !== prevRow || b.col !== prevCol) {
      state.moves += 1;
      moveCountEl.textContent = String(state.moves);
      checkWin();
    }
  }

  // ------------------------------------------------------------------
  // 7. UI wiring, win flow, init
  // ------------------------------------------------------------------
  function checkWin() {
    const target = state.blocks[0];
    if (target.col + target.len !== GRID) return;
    state.winLocked = true;

    // Animate the target sliding off the right edge, then show the modal.
    const el = boardEl.querySelector(".block.target");
    if (el) {
      el.style.transition = "transform 420ms ease-out";
      el.style.transform = blockTransform(target.row, GRID + 0.5);
    }

    setTimeout(() => {
      state.completed += 1;
      store.setCount(state.completed);
      completedCountEl.textContent = String(state.completed);
      winMovesEl.textContent = String(state.moves);
      winTotalEl.textContent = String(state.completed);
      showModal(winModal);
    }, 460);
  }

  function newPuzzle() {
    state.winLocked = false;
    state.moves = 0;
    const { blocks } = pickPuzzle(state.difficulty);
    state.blocks = blocks;
    // Snapshot for the Restart button.
    state.originalBlocks = cloneBlocks(blocks);
    sizeBoard();
    renderBoard();
    updateHeader();
  }

  // Reset the current puzzle's blocks to the positions they had when the
  // puzzle was first loaded. Does NOT pick a new puzzle — use "New Puzzle"
  // for that.
  function restartPuzzle() {
    if (!state.originalBlocks || !state.originalBlocks.length) return;
    state.winLocked = false;
    state.moves = 0;
    state.blocks = cloneBlocks(state.originalBlocks);
    renderBoard();
    updateHeader();
  }

  // Modals --------------------------------------------------------------
  function showModal(modal) {
    modal.hidden = false;
  }
  function hideModal(modal) {
    modal.hidden = true;
  }

  function wireModal(modal) {
    modal.addEventListener("click", (e) => {
      if (e.target instanceof HTMLElement && e.target.hasAttribute("data-close")) {
        hideModal(modal);
      }
    });
  }

  function openSettings() {
    // Sync the radio selection with current difficulty and block style.
    settingsModal
      .querySelectorAll('input[name="difficulty"]')
      .forEach((r) => {
        r.checked = r.value === state.difficulty;
      });
    settingsModal
      .querySelectorAll('input[name="block-style"]')
      .forEach((r) => {
        r.checked = r.value === state.blockStyle;
      });
    showModal(settingsModal);
  }

  function onDifficultyChange(e) {
    const value = e.target.value;
    if (!DIFFICULTY[value]) return;
    if (value === state.difficulty) return;
    state.difficulty = value;
    store.setDifficulty(value);
    updateHeader();
    // Start a fresh puzzle at the new difficulty immediately.
    newPuzzle();
  }

  function onBlockStyleChange(e) {
    const value = e.target.value;
    if (!BLOCK_STYLES[value]) return;
    if (value === state.blockStyle) return;
    state.blockStyle = value;
    store.setBlockStyle(value);
    // Re-render the *current* puzzle in the new style — positions,
    // move count, and originalBlocks snapshot are all preserved.
    renderBoard();
  }

  function onResetCount() {
    const ok = window.confirm(
      "Reset the number of completed puzzles back to 0?"
    );
    if (!ok) return;
    state.completed = 0;
    store.setCount(0);
    completedCountEl.textContent = "0";
  }

  // Tutorial ------------------------------------------------------------
  // A tiny scripted demo shown on first load. Uses its own small board
  // inside the tutorial modal — completely independent of the main game
  // state. One button ("Skip tutorial" → "Start playing!") closes the
  // modal and marks the tutorial as seen.
  const TUTORIAL_BLOCKS = [
    // Target (red) — will slide right to the exit at the end.
    { id: 0, row: 2, col: 1, len: 2, orient: "h", isTarget: true, color: WOOD_COLORS.target },
    // Blocker (blue) — sits in the target's way until we slide it up.
    { id: 1, row: 1, col: 4, len: 2, orient: "v", isTarget: false, color: "#4879b8" },
    // Decorative blocks for context — distinct colours so none can be
    // confused with the "blue" blocker the caption refers to.
    { id: 2, row: 0, col: 0, len: 2, orient: "h", isTarget: false, color: "#d9a42e" },
    { id: 3, row: 4, col: 2, len: 2, orient: "h", isTarget: false, color: "#7ea83a" },
    { id: 4, row: 4, col: 5, len: 2, orient: "v", isTarget: false, color: "#8b4db8" },
  ];

  const tutorial = {
    timers: [],

    renderBoard() {
      tutorialBoardEl.innerHTML = "";
      for (const b of TUTORIAL_BLOCKS) {
        const el = document.createElement("div");
        el.className = "tutorial-block" + (b.isTarget ? " target" : "");
        el.dataset.id = String(b.id);
        const w = b.orient === "h" ? b.len : 1;
        const h = b.orient === "v" ? b.len : 1;
        el.style.width = `calc(var(--cell) * ${w} - 4px)`;
        el.style.height = `calc(var(--cell) * ${h} - 4px)`;
        el.style.transform = blockTransform(b.row, b.col);
        applyWoodGrain(el, b.color, b.orient, b.id + 100);
        tutorialBoardEl.appendChild(el);
      }
    },

    moveBlock(id, row, col) {
      const el = tutorialBoardEl.querySelector(
        '.tutorial-block[data-id="' + id + '"]'
      );
      if (el) el.style.transform = blockTransform(row, col);
    },

    highlight(id, on) {
      const el = tutorialBoardEl.querySelector(
        '.tutorial-block[data-id="' + id + '"]'
      );
      if (!el) return;
      if (on) el.classList.add("highlight");
      else el.classList.remove("highlight");
    },

    setCaption(text) {
      tutorialCaptionEl.textContent = text;
    },

    schedule(delay, fn) {
      this.timers.push(setTimeout(fn, delay));
    },

    clearTimers() {
      for (const t of this.timers) clearTimeout(t);
      this.timers = [];
    },

    play() {
      this.clearTimers();
      this.renderBoard();
      this.setCaption("Drag blocks to slide them along their axis.");
      tutorialBtn.textContent = "Skip tutorial";
      tutorialBtn.classList.remove("primary-btn");
      tutorialBtn.classList.add("danger-btn");

      // Scripted sequence. Each entry = delay AFTER the previous step.
      const steps = [
        [1600, () => {
          this.setCaption(
            "Slide the blue block up to clear the exit row…"
          );
          this.highlight(1, true);
        }],
        [700, () => this.moveBlock(1, 0, 4)],
        [1100, () => {
          this.highlight(1, false);
          this.setCaption(
            "…then slide the red block out through the right edge!"
          );
          this.highlight(0, true);
        }],
        [700, () => this.moveBlock(0, 2, 4)],
        [850, () => {
          this.setCaption("Solved! That's it — tap below to start.");
          this.highlight(0, false);
          this.moveBlock(0, 2, 7); // slide off-screen through exit
        }],
        [900, () => {
          tutorialBtn.textContent = "Start playing!";
          tutorialBtn.classList.remove("danger-btn");
          tutorialBtn.classList.add("primary-btn");
        }],
      ];

      let cum = 0;
      for (const [d, fn] of steps) {
        cum += d;
        this.schedule(cum, fn);
      }
    },

    finish() {
      this.clearTimers();
      store.setTutorialSeen(true);
      hideModal(tutorialModal);
    },
  };

  // Init ----------------------------------------------------------------
  function init() {
    store.initVersion();
    state.completed = store.getCount();
    state.difficulty = store.getDifficulty();
    state.blockStyle = store.getBlockStyle();

    // Migration: anyone who already solved puzzles before this update
    // doesn't need a tutorial.
    if (state.completed > 0 && !store.getTutorialSeen()) {
      store.setTutorialSeen(true);
    }

    wireModal(settingsModal);
    wireModal(winModal);

    settingsBtn.addEventListener("click", openSettings);
    newPuzzleBtn.addEventListener("click", () => {
      hideModal(winModal);
      newPuzzle();
    });
    restartBtn.addEventListener("click", () => {
      hideModal(winModal);
      restartPuzzle();
    });
    nextPuzzleBtn.addEventListener("click", () => {
      hideModal(winModal);
      newPuzzle();
    });
    resetCountBtn.addEventListener("click", onResetCount);
    settingsModal
      .querySelectorAll('input[name="difficulty"]')
      .forEach((r) => r.addEventListener("change", onDifficultyChange));
    settingsModal
      .querySelectorAll('input[name="block-style"]')
      .forEach((r) => r.addEventListener("change", onBlockStyleChange));

    tutorialBtn.addEventListener("click", () => tutorial.finish());

    window.addEventListener("resize", () => {
      sizeBoard();
      // Re-apply transforms in case cell size changed.
      const target = state.blocks[0];
      if (!target) return;
      const els = boardEl.querySelectorAll(".block");
      els.forEach((el) => {
        const id = Number(el.dataset.id);
        const b = state.blocks.find((bb) => bb.id === id);
        if (b) el.style.transform = blockTransform(b.row, b.col);
      });
    });

    newPuzzle();

    // First-time players see a brief animated demo.
    if (!store.getTutorialSeen()) {
      showModal(tutorialModal);
      tutorial.play();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
