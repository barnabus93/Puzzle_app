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
    version: "puzzle.version",
  };
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

  function woodBaseColor(block) {
    if (block.isTarget) return WOOD_COLORS.target;
    const p = WOOD_COLORS.palette;
    return p[block.id % p.length];
  }

  // Apply a wood-grain background to a block element. The grain is drawn
  // with an SVG feTurbulence filter — one SVG per block, with a unique
  // seed so every block has its own natural-looking grain. The grain
  // runs along the block's length (horizontal streaks for horizontal
  // blocks, vertical for vertical). Multiplied over the solid base
  // colour via `background-blend-mode: multiply` so you get rich
  // coloured wood rather than a flat gradient.
  function applyWoodGrain(el, baseColor, orient, seedSource) {
    const seed = ((seedSource * 37 + 11) % 97) + 1;
    const bf = orient === "h" ? "0.013 0.32" : "0.32 0.013";
    const filterId = "wg" + seed;
    // NOTE: write `#` here (not `%23`). encodeURIComponent turns `#`
    // into `%23` in the data URI, and the browser URL-decodes it back
    // to `#` before handing the SVG to the renderer. If you hard-code
    // `%23` here, it gets double-encoded and the filter lookup breaks
    // — the rect then falls back to `fill="black"` (SVG default) and
    // the multiply blend paints every block solid black.
    //
    // The rect also gets `fill="white"` as a safety net: white × any
    // base colour in multiply blend = the base colour unchanged, so
    // if the filter ever fails to resolve we still see a plain solid
    // block rather than a black one.
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
    const encoded = encodeURIComponent(svg);
    el.style.backgroundColor = baseColor;
    el.style.backgroundImage =
      'url("data:image/svg+xml;charset=utf-8,' + encoded + '")';
    el.style.backgroundSize = "100% 100%";
    el.style.backgroundRepeat = "no-repeat";
    el.style.backgroundBlendMode = "multiply";
  }

  function renderBoard() {
    boardEl.innerHTML = "";
    for (const b of state.blocks) {
      const el = document.createElement("div");
      el.className = "block" + (b.isTarget ? " target" : "");
      el.dataset.id = String(b.id);
      const w = b.orient === "h" ? b.len : 1;
      const h = b.orient === "v" ? b.len : 1;
      el.style.width = `calc(var(--cell) * ${w} - 4px)`;
      el.style.height = `calc(var(--cell) * ${h} - 4px)`;
      el.style.transform = blockTransform(b.row, b.col);
      applyWoodGrain(el, woodBaseColor(b), b.orient, b.id);
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
    // Sync the radio selection with current difficulty.
    const radios = settingsModal.querySelectorAll('input[name="difficulty"]');
    radios.forEach((r) => {
      r.checked = r.value === state.difficulty;
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
