/* Brain Arcade — app.js
 *
 * TABLE OF CONTENTS
 * =================
 *  1. Shared utilities & constants      (~line 20)
 *  2. Router (screen show/hide)         (~line 50)
 *  3. Storage helpers (per-game)        (~line 90)
 *  4. Modal helpers                     (~line 200)
 *  5. Title screen module               (~line 230)
 *  6. Slider — board helpers            (~line 260)
 *  7. Slider — block style themes       (~line 300)
 *  8. Slider — rendering & drag input   (~line 600)
 *  9. Slider — UI wiring & tutorial     (~line 800)
 * 10. Slider — module (onEnter/onLeave) (~line 970)
 * 11. Arrow — helpers & rendering       (~line 1050)
 * 12. Arrow — tap handling & win        (~line 1200)
 * 13. Arrow — UI wiring & tutorial      (~line 1300)
 * 14. Arrow — module (onEnter/onLeave)  (~line 1450)
 * 15. Init & localStorage migration     (~line 1530)
 */

(() => {
  "use strict";

  // ================================================================
  // 1. SHARED UTILITIES & CONSTANTS
  // ================================================================
  const DIFFICULTIES = { simple: "Simple", moderate: "Moderate", difficult: "Difficult" };
  const BLOCK_STYLES = { wood: true, cars: true, fruit: true };

  function encodeSvg(svg) {
    return 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '")';
  }

  // ================================================================
  // 2. ROUTER
  // ================================================================
  const screens = {};
  const modules = {};

  const router = {
    current: null,
    show(name) {
      if (this.current && modules[this.current] && modules[this.current].onLeave) {
        modules[this.current].onLeave();
      }
      for (const el of document.querySelectorAll(".screen")) el.hidden = true;
      const el = document.getElementById("screen-" + name);
      if (el) el.hidden = false;
      this.current = name;
      if (modules[name] && modules[name].onEnter) modules[name].onEnter();
    },
  };

  // Back-to-menu buttons
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-back]")) router.show("title");
  });

  // ================================================================
  // 3. STORAGE HELPERS (per-game, safe wrappers)
  // ================================================================
  function makeStore(prefix) {
    const key = (k) => prefix + "." + k;
    return {
      getInt(k, def) {
        try {
          const v = localStorage.getItem(key(k));
          const n = v == null ? def : parseInt(v, 10);
          return Number.isFinite(n) && n >= 0 ? n : def;
        } catch { return def; }
      },
      setInt(k, n) {
        try { localStorage.setItem(key(k), String(n)); } catch { /* ignore */ }
      },
      getString(k, def, valid) {
        try {
          const v = localStorage.getItem(key(k));
          if (v && (!valid || valid[v])) return v;
        } catch { /* ignore */ }
        return def;
      },
      setString(k, v) {
        try { localStorage.setItem(key(k), v); } catch { /* ignore */ }
      },
      getBool(k) {
        try { return localStorage.getItem(key(k)) === "1"; } catch { return false; }
      },
      setBool(k, v) {
        try { localStorage.setItem(key(k), v ? "1" : "0"); } catch { /* ignore */ }
      },
    };
  }

  const sliderStore = makeStore("slider");
  const arrowStore = makeStore("arrow");

  // ================================================================
  // 4. MODAL HELPERS
  // ================================================================
  function showModal(m) { m.hidden = false; }
  function hideModal(m) { m.hidden = true; }
  function wireModal(m) {
    m.addEventListener("click", (e) => {
      if (e.target instanceof HTMLElement && e.target.hasAttribute("data-close")) {
        hideModal(m);
      }
    });
  }

  // ================================================================
  // 5. TITLE SCREEN MODULE
  // ================================================================
  modules.title = {
    onEnter() {
      const tiles = document.querySelectorAll("#screen-title .game-tile[data-game]");
      this._handler = (e) => {
        const tile = e.currentTarget;
        const game = tile.dataset.game;
        if (game) router.show(game);
      };
      tiles.forEach((t) => t.addEventListener("click", this._handler));
    },
    onLeave() {
      const tiles = document.querySelectorAll("#screen-title .game-tile[data-game]");
      if (this._handler) tiles.forEach((t) => t.removeEventListener("click", this._handler));
    },
  };

  // ================================================================
  // 6. SLIDER — BOARD HELPERS
  // ================================================================
  const SLIDER_GRID = 6;

  function sliderBuildGrid(blocks) {
    const g = Array.from({ length: SLIDER_GRID }, () => new Array(SLIDER_GRID).fill(-1));
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.orient === "h") for (let k = 0; k < b.len; k++) g[b.row][b.col + k] = i;
      else for (let k = 0; k < b.len; k++) g[b.row + k][b.col] = i;
    }
    return g;
  }

  function sliderPickPuzzle(difficulty) {
    const pool = (window.PUZZLES && window.PUZZLES[difficulty]) ||
                 (window.PUZZLES && window.PUZZLES.moderate) || null;
    if (!pool || !pool.length) return sliderFallback();
    const src = pool[Math.floor(Math.random() * pool.length)];
    const blocks = src.blocks.map((b, i) => ({
      id: i, row: b.row, col: b.col, len: b.len, orient: b.orient, isTarget: !!b.isTarget,
    }));
    const tIdx = blocks.findIndex((b) => b.isTarget);
    if (tIdx > 0) {
      const t = blocks.splice(tIdx, 1)[0];
      blocks.unshift(t);
      blocks.forEach((b, i) => (b.id = i));
    }
    return { blocks, minMoves: src.minMoves };
  }

  function sliderFallback() {
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

  function cloneBlocks(blocks) {
    return blocks.map((b) => ({ ...b }));
  }

  function sliderBlockTransform(row, col) {
    return "translate(calc(var(--cell) * " + col + " + 2px), calc(var(--cell) * " + row + " + 2px))";
  }

  // ================================================================
  // 7. SLIDER — BLOCK STYLE THEMES (wood / cars / fruit)
  // ================================================================
  const WOOD_COLORS = {
    target: "#c8302b",
    palette: ["#d14b3c","#e07c3e","#d9a42e","#7ea83a","#4ba069","#369990","#4879b8","#6657b0","#a04db8","#c0508c","#b57d3a","#6b86a8"],
  };
  const CAR_COLORS = {
    target: "#d0281c",
    palette: ["#e8801a","#f2c930","#4bae55","#30a3b5","#3a6dbf","#8b4fc5","#c94b9a","#7a4a1e","#dcdcdc","#9a9a9a","#4a4a4a","#b8862a"],
  };
  const FRUIT_ROTATION = ["apple", "orange", "kiwi", "banana"];

  function woodBaseColor(b) { return b.isTarget ? WOOD_COLORS.target : WOOD_COLORS.palette[b.id % WOOD_COLORS.palette.length]; }
  function carBaseColor(b) { return b.isTarget ? CAR_COLORS.target : CAR_COLORS.palette[b.id % CAR_COLORS.palette.length]; }
  function fruitTypeFor(b) { return b.isTarget ? "watermelon" : FRUIT_ROTATION[b.id % FRUIT_ROTATION.length]; }

  function applyWoodGrain(el, baseColor, orient, seedSource) {
    const seed = ((seedSource * 37 + 11) % 97) + 1;
    const bf = orient === "h" ? "0.013 0.32" : "0.32 0.013";
    const fid = "wg" + seed;
    const svg =
      "<svg xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none' viewBox='0 0 240 80'>" +
      "<filter id='" + fid + "' x='0' y='0' width='100%' height='100%'>" +
      "<feTurbulence type='fractalNoise' baseFrequency='" + bf + "' numOctaves='3' seed='" + seed + "'/>" +
      "<feColorMatrix values='0.22 0.22 0.22 0 0.5 0.22 0.22 0.22 0 0.5 0.22 0.22 0.22 0 0.5 0 0 0 0 1'/>" +
      "</filter><rect width='100%' height='100%' fill='white' filter='url(#" + fid + ")'/></svg>";
    el.style.backgroundColor = baseColor;
    el.style.backgroundImage = encodeSvg(svg);
    el.style.backgroundSize = "100% 100%";
    el.style.backgroundRepeat = "no-repeat";
    el.style.backgroundBlendMode = "multiply";
  }

  function sedanH(c){return "<rect x='10' y='14' width='180' height='72' rx='22' ry='22' fill='"+c+"' stroke='rgba(0,0,0,0.35)' stroke-width='2'/><line x1='55' y1='24' x2='55' y2='76' stroke='rgba(0,0,0,0.45)' stroke-width='2'/><line x1='145' y1='24' x2='145' y2='76' stroke='rgba(0,0,0,0.45)' stroke-width='2'/><path d='M58 30 Q61 50 58 70 L142 70 Q139 50 142 30 Z' fill='rgba(10,20,35,0.72)'/><rect x='26' y='4' width='24' height='10' rx='3' fill='#151515'/><rect x='26' y='86' width='24' height='10' rx='3' fill='#151515'/><rect x='150' y='4' width='24' height='10' rx='3' fill='#151515'/><rect x='150' y='86' width='24' height='10' rx='3' fill='#151515'/><rect x='186' y='24' width='5' height='10' rx='2' fill='#fff2b0'/><rect x='186' y='66' width='5' height='10' rx='2' fill='#fff2b0'/><rect x='9' y='26' width='4' height='10' rx='2' fill='#c02020'/><rect x='9' y='64' width='4' height='10' rx='2' fill='#c02020'/>";}
  function sedanV(c){return "<rect x='14' y='10' width='72' height='180' rx='22' ry='22' fill='"+c+"' stroke='rgba(0,0,0,0.35)' stroke-width='2'/><line x1='24' y1='55' x2='76' y2='55' stroke='rgba(0,0,0,0.45)' stroke-width='2'/><line x1='24' y1='145' x2='76' y2='145' stroke='rgba(0,0,0,0.45)' stroke-width='2'/><path d='M30 58 Q50 61 70 58 L70 142 Q50 139 30 142 Z' fill='rgba(10,20,35,0.72)'/><rect x='4' y='26' width='10' height='24' rx='3' fill='#151515'/><rect x='86' y='26' width='10' height='24' rx='3' fill='#151515'/><rect x='4' y='150' width='10' height='24' rx='3' fill='#151515'/><rect x='86' y='150' width='10' height='24' rx='3' fill='#151515'/><rect x='24' y='9' width='10' height='5' rx='2' fill='#fff2b0'/><rect x='66' y='9' width='10' height='5' rx='2' fill='#fff2b0'/><rect x='26' y='187' width='10' height='4' rx='2' fill='#c02020'/><rect x='64' y='187' width='10' height='4' rx='2' fill='#c02020'/>";}
  function truckH(c){return "<rect x='8' y='14' width='100' height='72' rx='8' fill='"+c+"' stroke='rgba(0,0,0,0.4)' stroke-width='2'/><rect x='112' y='18' width='180' height='64' rx='6' fill='"+c+"' stroke='rgba(0,0,0,0.55)' stroke-width='2.5'/><line x1='20' y1='30' x2='100' y2='30' stroke='rgba(0,0,0,0.3)' stroke-width='2'/><line x1='20' y1='50' x2='100' y2='50' stroke='rgba(0,0,0,0.3)' stroke-width='2'/><line x1='20' y1='70' x2='100' y2='70' stroke='rgba(0,0,0,0.3)' stroke-width='2'/><path d='M258 28 Q261 50 258 72 L225 72 Q222 50 225 28 Z' fill='rgba(10,20,35,0.72)'/><rect x='30' y='4' width='24' height='10' rx='3' fill='#151515'/><rect x='30' y='86' width='24' height='10' rx='3' fill='#151515'/><rect x='70' y='4' width='24' height='10' rx='3' fill='#151515'/><rect x='70' y='86' width='24' height='10' rx='3' fill='#151515'/><rect x='228' y='4' width='24' height='10' rx='3' fill='#151515'/><rect x='228' y='86' width='24' height='10' rx='3' fill='#151515'/><rect x='286' y='26' width='5' height='10' rx='2' fill='#fff2b0'/><rect x='286' y='64' width='5' height='10' rx='2' fill='#fff2b0'/><rect x='9' y='26' width='4' height='10' rx='2' fill='#c02020'/><rect x='9' y='64' width='4' height='10' rx='2' fill='#c02020'/>";}
  function truckV(c){return "<rect x='14' y='192' width='72' height='100' rx='8' fill='"+c+"' stroke='rgba(0,0,0,0.4)' stroke-width='2'/><rect x='18' y='8' width='64' height='180' rx='6' fill='"+c+"' stroke='rgba(0,0,0,0.55)' stroke-width='2.5'/><line x1='30' y1='200' x2='30' y2='280' stroke='rgba(0,0,0,0.3)' stroke-width='2'/><line x1='50' y1='200' x2='50' y2='280' stroke='rgba(0,0,0,0.3)' stroke-width='2'/><line x1='70' y1='200' x2='70' y2='280' stroke='rgba(0,0,0,0.3)' stroke-width='2'/><path d='M28 42 Q50 45 72 42 L72 75 Q50 72 28 75 Z' fill='rgba(10,20,35,0.72)'/><rect x='4' y='30' width='10' height='24' rx='3' fill='#151515'/><rect x='86' y='30' width='10' height='24' rx='3' fill='#151515'/><rect x='4' y='70' width='10' height='24' rx='3' fill='#151515'/><rect x='86' y='70' width='10' height='24' rx='3' fill='#151515'/><rect x='4' y='228' width='10' height='24' rx='3' fill='#151515'/><rect x='86' y='228' width='10' height='24' rx='3' fill='#151515'/><rect x='26' y='9' width='10' height='5' rx='2' fill='#fff2b0'/><rect x='64' y='9' width='10' height='5' rx='2' fill='#fff2b0'/><rect x='26' y='286' width='10' height='4' rx='2' fill='#c02020'/><rect x='64' y='286' width='10' height='4' rx='2' fill='#c02020'/>";}

  function applyCarSprite(el, block) {
    const color = carBaseColor(block);
    const isH = block.orient === "h";
    const vbW = isH ? 100 * block.len : 100;
    const vbH = isH ? 100 : 100 * block.len;
    let inner = block.len === 3 ? (isH ? truckH(color) : truckV(color)) : (isH ? sedanH(color) : sedanV(color));
    el.style.backgroundColor = "transparent";
    el.style.backgroundImage = encodeSvg("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 " + vbW + " " + vbH + "'>" + inner + "</svg>");
    el.style.backgroundSize = "100% 100%";
    el.style.backgroundRepeat = "no-repeat";
    el.style.backgroundBlendMode = "normal";
  }

  const FRUIT_DRAWERS = {
    apple: (cx, cy) => "<circle cx='"+cx+"' cy='"+(cy+4)+"' r='32' fill='#d63a28' stroke='#6e1510' stroke-width='2'/><path d='M"+(cx-4)+" "+(cy-28)+" Q"+cx+" "+(cy-34)+" "+(cx+4)+" "+(cy-30)+"' stroke='#4a2a10' stroke-width='3' fill='none' stroke-linecap='round'/><ellipse cx='"+(cx+10)+"' cy='"+(cy-30)+"' rx='8' ry='4' fill='#4b932c' transform='rotate(28 "+(cx+10)+" "+(cy-30)+")'/><ellipse cx='"+(cx-10)+"' cy='"+(cy-5)+"' rx='6' ry='3' fill='rgba(255,255,255,0.35)'/>",
    orange: (cx, cy) => "<circle cx='"+cx+"' cy='"+(cy+3)+"' r='32' fill='#ee812a' stroke='#813410' stroke-width='2'/><circle cx='"+(cx-8)+"' cy='"+(cy-3)+"' r='1.4' fill='rgba(90,30,5,0.55)'/><circle cx='"+(cx+7)+"' cy='"+(cy+1)+"' r='1.4' fill='rgba(90,30,5,0.55)'/><circle cx='"+(cx-3)+"' cy='"+(cy+10)+"' r='1.4' fill='rgba(90,30,5,0.55)'/><circle cx='"+(cx+10)+"' cy='"+(cy+14)+"' r='1.4' fill='rgba(90,30,5,0.55)'/><path d='M"+(cx-3)+" "+(cy-28)+" Q"+cx+" "+(cy-34)+" "+(cx+5)+" "+(cy-30)+"' stroke='#4a3010' stroke-width='2.5' fill='none' stroke-linecap='round'/><ellipse cx='"+(cx+10)+"' cy='"+(cy-28)+"' rx='7' ry='3' fill='#4b932c' transform='rotate(30 "+(cx+10)+" "+(cy-28)+")'/><ellipse cx='"+(cx-10)+"' cy='"+(cy-6)+"' rx='6' ry='3' fill='rgba(255,255,255,0.35)'/>",
    kiwi: (cx, cy) => "<circle cx='"+cx+"' cy='"+cy+"' r='33' fill='#6e4a1e'/><circle cx='"+cx+"' cy='"+cy+"' r='28' fill='#a8c766'/><circle cx='"+cx+"' cy='"+cy+"' r='14' fill='#f6f2dc'/><circle cx='"+(cx-6)+"' cy='"+(cy-6)+"' r='1.4' fill='#161616'/><circle cx='"+(cx+6)+"' cy='"+(cy-6)+"' r='1.4' fill='#161616'/><circle cx='"+(cx-8)+"' cy='"+(cy+3)+"' r='1.4' fill='#161616'/><circle cx='"+(cx+8)+"' cy='"+(cy+3)+"' r='1.4' fill='#161616'/><circle cx='"+(cx-5)+"' cy='"+(cy+10)+"' r='1.4' fill='#161616'/><circle cx='"+(cx+5)+"' cy='"+(cy+10)+"' r='1.4' fill='#161616'/><circle cx='"+cx+"' cy='"+(cy-12)+"' r='1.4' fill='#161616'/>",
    banana: (cx, cy) => "<path d='M"+(cx-28)+" "+(cy+22)+" C"+(cx-34)+" "+(cy-10)+" "+(cx-8)+" "+(cy-28)+" "+(cx+26)+" "+(cy-18)+" C"+(cx+20)+" "+(cy-12)+" "+(cx+8)+" "+(cy-4)+" "+(cx-2)+" "+(cy+8)+" C"+(cx-10)+" "+(cy+18)+" "+(cx-18)+" "+(cy+24)+" "+(cx-28)+" "+(cy+22)+" Z' fill='#f1cc38' stroke='#6e5410' stroke-width='2' stroke-linejoin='round'/><path d='M"+(cx+22)+" "+(cy-17)+" l4 -4' stroke='#4a3610' stroke-width='2.5' stroke-linecap='round'/><path d='M"+(cx-22)+" "+(cy+20)+" l-2 3' stroke='#4a3610' stroke-width='2' stroke-linecap='round'/>",
    watermelon: (cx, cy) => "<path d='M"+(cx-34)+" "+(cy+28)+" Q"+cx+" "+(cy-30)+" "+(cx+34)+" "+(cy+28)+" Z' fill='#2e6e3a' stroke='#153a1c' stroke-width='2'/><path d='M"+(cx-28)+" "+(cy+24)+" Q"+cx+" "+(cy-18)+" "+(cx+28)+" "+(cy+24)+" Z' fill='#f6eedc'/><path d='M"+(cx-23)+" "+(cy+20)+" Q"+cx+" "+(cy-8)+" "+(cx+23)+" "+(cy+20)+" Z' fill='#e63827'/><ellipse cx='"+(cx-8)+"' cy='"+cy+"' rx='1.8' ry='2.8' fill='#181210'/><ellipse cx='"+(cx+8)+"' cy='"+cy+"' rx='1.8' ry='2.8' fill='#181210'/><ellipse cx='"+cx+"' cy='"+(cy+10)+"' rx='1.8' ry='2.8' fill='#181210'/>",
  };

  function applyFruitSprite(el, block) {
    const fruit = fruitTypeFor(block);
    const drawer = FRUIT_DRAWERS[fruit] || FRUIT_DRAWERS.apple;
    const isH = block.orient === "h";
    const n = block.len, cell = 100;
    const vbW = isH ? cell * n : cell, vbH = isH ? cell : cell * n;
    let inner = "";
    for (let i = 0; i < n; i++) {
      inner += drawer(isH ? i * cell + cell / 2 : cell / 2, isH ? cell / 2 : i * cell + cell / 2);
    }
    el.style.backgroundColor = "transparent";
    el.style.backgroundImage = encodeSvg("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 " + vbW + " " + vbH + "'>" + inner + "</svg>");
    el.style.backgroundSize = "100% 100%";
    el.style.backgroundRepeat = "no-repeat";
    el.style.backgroundBlendMode = "normal";
  }

  function applyBlockStyle(el, block, styleName) {
    if (styleName === "cars") return applyCarSprite(el, block);
    if (styleName === "fruit") return applyFruitSprite(el, block);
    applyWoodGrain(el, woodBaseColor(block), block.orient, block.id);
  }

  // ================================================================
  // 8. SLIDER — RENDERING & DRAG INPUT
  // ================================================================
  const slider = {
    boardEl: null,
    boardWrapEl: null,
    state: { blocks: [], originalBlocks: null, moves: 0, completed: 0, difficulty: "moderate", blockStyle: "wood", winLocked: false },
    drag: null,
    els: {},

    sizeBoard() {
      const r = this.boardWrapEl.getBoundingClientRect();
      const avail = Math.min(r.width, r.height) - 16;
      let cp = Math.floor(avail / SLIDER_GRID);
      cp = Math.max(36, Math.min(96, cp));
      this.boardEl.style.setProperty("--cell", cp + "px");
    },

    cellPx() {
      const v = getComputedStyle(this.boardEl).getPropertyValue("--cell").trim();
      return parseFloat(v) || 48;
    },

    renderBoard() {
      this.boardEl.innerHTML = "";
      const tc = "theme-" + this.state.blockStyle;
      for (const b of this.state.blocks) {
        const el = document.createElement("div");
        el.className = "block " + tc + (b.isTarget ? " target" : "");
        el.dataset.id = String(b.id);
        const w = b.orient === "h" ? b.len : 1, h = b.orient === "v" ? b.len : 1;
        el.style.width = "calc(var(--cell) * " + w + " - 4px)";
        el.style.height = "calc(var(--cell) * " + h + " - 4px)";
        el.style.transform = sliderBlockTransform(b.row, b.col);
        applyBlockStyle(el, b, this.state.blockStyle);
        el.addEventListener("pointerdown", (e) => this.onPointerDown(e));
        this.boardEl.appendChild(el);
      }
    },

    updateHeader() {
      this.els.completedCount.textContent = String(this.state.completed);
      this.els.moveCount.textContent = String(this.state.moves);
      this.els.difficultyLabel.textContent = DIFFICULTIES[this.state.difficulty] || "Moderate";
    },

    legalRange(block) {
      const grid = sliderBuildGrid(this.state.blocks);
      let min = 0, max = 0;
      if (block.orient === "h") {
        for (let k = 1; block.col - k >= 0 && grid[block.row][block.col - k] === -1; k++) min = -k;
        for (let k = 1; block.col + block.len - 1 + k < SLIDER_GRID && grid[block.row][block.col + block.len - 1 + k] === -1; k++) max = k;
      } else {
        for (let k = 1; block.row - k >= 0 && grid[block.row - k][block.col] === -1; k++) min = -k;
        for (let k = 1; block.row + block.len - 1 + k < SLIDER_GRID && grid[block.row + block.len - 1 + k][block.col] === -1; k++) max = k;
      }
      return { min, max };
    },

    onPointerDown(e) {
      if (this.state.winLocked) return;
      e.preventDefault();
      const el = e.currentTarget;
      const id = Number(el.dataset.id);
      const block = this.state.blocks.find((b) => b.id === id);
      if (!block) return;
      const { min, max } = this.legalRange(block);
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      this.drag = {
        pointerId: e.pointerId, el, block,
        startX: e.clientX, startY: e.clientY,
        startRow: block.row, startCol: block.col,
        axis: block.orient, minCells: min, maxCells: max,
        cell: this.cellPx(), delta: 0,
      };
      el.classList.add("dragging");
      this._onMove = (ev) => this.onPointerMove(ev);
      this._onUp = (ev) => this.onPointerUp(ev);
      el.addEventListener("pointermove", this._onMove);
      el.addEventListener("pointerup", this._onUp);
      el.addEventListener("pointercancel", this._onUp);
    },

    onPointerMove(e) {
      const d = this.drag;
      if (!d || e.pointerId !== d.pointerId) return;
      const raw = d.axis === "h" ? (e.clientX - d.startX) / d.cell : (e.clientY - d.startY) / d.cell;
      const clamped = Math.max(d.minCells, Math.min(d.maxCells, raw));
      d.delta = clamped;
      const row = d.axis === "v" ? d.startRow + clamped : d.startRow;
      const col = d.axis === "h" ? d.startCol + clamped : d.startCol;
      d.el.style.transform = sliderBlockTransform(row, col);
    },

    onPointerUp(e) {
      const d = this.drag;
      if (!d) return;
      const snapped = Math.round(d.delta);
      const b = d.block;
      const prevRow = b.row, prevCol = b.col;
      if (d.axis === "h") b.col = d.startCol + snapped;
      else b.row = d.startRow + snapped;
      d.el.classList.remove("dragging");
      d.el.style.transform = sliderBlockTransform(b.row, b.col);
      d.el.removeEventListener("pointermove", this._onMove);
      d.el.removeEventListener("pointerup", this._onUp);
      d.el.removeEventListener("pointercancel", this._onUp);
      this.drag = null;
      if (b.row !== prevRow || b.col !== prevCol) {
        this.state.moves += 1;
        this.els.moveCount.textContent = String(this.state.moves);
        this.checkWin();
      }
    },

    checkWin() {
      const target = this.state.blocks[0];
      if (target.col + target.len !== SLIDER_GRID) return;
      this.state.winLocked = true;
      const el = this.boardEl.querySelector(".block.target");
      if (el) {
        el.style.transition = "transform 420ms ease-out";
        el.style.transform = sliderBlockTransform(target.row, SLIDER_GRID + 0.5);
      }
      setTimeout(() => {
        this.state.completed += 1;
        sliderStore.setInt("completedCount", this.state.completed);
        this.els.completedCount.textContent = String(this.state.completed);
        this.els.winMoves.textContent = String(this.state.moves);
        this.els.winTotal.textContent = String(this.state.completed);
        showModal(this.els.winModal);
      }, 460);
    },

    newPuzzle() {
      this.state.winLocked = false;
      this.state.moves = 0;
      const { blocks } = sliderPickPuzzle(this.state.difficulty);
      this.state.blocks = blocks;
      this.state.originalBlocks = cloneBlocks(blocks);
      this.sizeBoard();
      this.renderBoard();
      this.updateHeader();
    },

    restartPuzzle() {
      if (!this.state.originalBlocks) return;
      this.state.winLocked = false;
      this.state.moves = 0;
      this.state.blocks = cloneBlocks(this.state.originalBlocks);
      this.renderBoard();
      this.updateHeader();
    },
  };

  // ================================================================
  // 9. SLIDER — UI WIRING & TUTORIAL
  // ================================================================
  const sliderTutorial = {
    timers: [],
    BLOCKS: [
      { id: 0, row: 2, col: 1, len: 2, orient: "h", isTarget: true, color: WOOD_COLORS.target },
      { id: 1, row: 1, col: 4, len: 2, orient: "v", isTarget: false, color: "#4879b8" },
      { id: 2, row: 0, col: 0, len: 2, orient: "h", isTarget: false, color: "#d9a42e" },
      { id: 3, row: 4, col: 2, len: 2, orient: "h", isTarget: false, color: "#7ea83a" },
      { id: 4, row: 4, col: 5, len: 2, orient: "v", isTarget: false, color: "#8b4db8" },
    ],

    renderBoard() {
      const el = document.getElementById("slider-tutorial-board");
      el.innerHTML = "";
      for (const b of this.BLOCKS) {
        const d = document.createElement("div");
        d.className = "tutorial-block" + (b.isTarget ? " target" : "");
        d.dataset.id = String(b.id);
        const w = b.orient === "h" ? b.len : 1, h = b.orient === "v" ? b.len : 1;
        d.style.width = "calc(var(--cell) * " + w + " - 4px)";
        d.style.height = "calc(var(--cell) * " + h + " - 4px)";
        d.style.transform = sliderBlockTransform(b.row, b.col);
        applyWoodGrain(d, b.color, b.orient, b.id + 100);
        el.appendChild(d);
      }
    },

    moveBlock(id, row, col) {
      const el = document.querySelector('#slider-tutorial-board .tutorial-block[data-id="' + id + '"]');
      if (el) el.style.transform = sliderBlockTransform(row, col);
    },

    highlight(id, on) {
      const el = document.querySelector('#slider-tutorial-board .tutorial-block[data-id="' + id + '"]');
      if (!el) return;
      if (on) el.classList.add("highlight"); else el.classList.remove("highlight");
    },

    setCaption(t) { document.getElementById("slider-tutorial-caption").textContent = t; },

    play() {
      this.clearTimers();
      this.renderBoard();
      this.setCaption("Drag blocks to slide them along their axis.");
      const btn = document.getElementById("slider-tutorial-btn");
      btn.textContent = "Skip tutorial";
      btn.classList.remove("primary-btn"); btn.classList.add("danger-btn");

      const steps = [
        [1600, () => { this.setCaption("Slide the blue block up to clear the exit row…"); this.highlight(1, true); }],
        [700, () => this.moveBlock(1, 0, 4)],
        [1100, () => { this.highlight(1, false); this.setCaption("…then slide the red block out through the right edge!"); this.highlight(0, true); }],
        [700, () => this.moveBlock(0, 2, 4)],
        [850, () => { this.setCaption("Solved! That's it — tap below to start."); this.highlight(0, false); this.moveBlock(0, 2, 7); }],
        [900, () => { btn.textContent = "Start playing!"; btn.classList.remove("danger-btn"); btn.classList.add("primary-btn"); }],
      ];
      let cum = 0;
      for (const [d, fn] of steps) { cum += d; this.timers.push(setTimeout(fn, cum)); }
    },

    clearTimers() { for (const t of this.timers) clearTimeout(t); this.timers = []; },

    finish() {
      this.clearTimers();
      sliderStore.setBool("tutorialSeen", true);
      hideModal(document.getElementById("slider-tutorial-modal"));
    },
  };

  // ================================================================
  // 10. SLIDER — MODULE (onEnter / onLeave)
  // ================================================================
  modules.slider = {
    _wired: false,

    onEnter() {
      slider.boardEl = document.getElementById("slider-board");
      slider.boardWrapEl = document.getElementById("slider-board-wrap");
      slider.els = {
        completedCount: document.getElementById("slider-completed-count"),
        moveCount: document.getElementById("slider-move-count"),
        difficultyLabel: document.getElementById("slider-difficulty-label"),
        winModal: document.getElementById("slider-win-modal"),
        winMoves: document.getElementById("slider-win-moves"),
        winTotal: document.getElementById("slider-win-total"),
        settingsModal: document.getElementById("slider-settings-modal"),
      };

      slider.state.completed = sliderStore.getInt("completedCount", 0);
      slider.state.difficulty = sliderStore.getString("difficulty", "moderate", DIFFICULTIES);
      slider.state.blockStyle = sliderStore.getString("blockStyle", "wood", BLOCK_STYLES);

      if (!this._wired) {
        this._wired = true;
        wireModal(slider.els.settingsModal);
        wireModal(slider.els.winModal);

        document.getElementById("slider-settings-btn").addEventListener("click", () => {
          const m = slider.els.settingsModal;
          m.querySelectorAll('input[name="slider-difficulty"]').forEach((r) => { r.checked = r.value === slider.state.difficulty; });
          m.querySelectorAll('input[name="slider-block-style"]').forEach((r) => { r.checked = r.value === slider.state.blockStyle; });
          showModal(m);
        });

        document.getElementById("slider-new-puzzle-btn").addEventListener("click", () => { hideModal(slider.els.winModal); slider.newPuzzle(); });
        document.getElementById("slider-restart-btn").addEventListener("click", () => { hideModal(slider.els.winModal); slider.restartPuzzle(); });
        document.getElementById("slider-next-puzzle-btn").addEventListener("click", () => { hideModal(slider.els.winModal); slider.newPuzzle(); });
        document.getElementById("slider-reset-count-btn").addEventListener("click", () => {
          if (!window.confirm("Reset the number of completed puzzles back to 0?")) return;
          slider.state.completed = 0; sliderStore.setInt("completedCount", 0);
          slider.els.completedCount.textContent = "0";
        });

        slider.els.settingsModal.querySelectorAll('input[name="slider-difficulty"]').forEach((r) => r.addEventListener("change", (e) => {
          if (!DIFFICULTIES[e.target.value] || e.target.value === slider.state.difficulty) return;
          slider.state.difficulty = e.target.value;
          sliderStore.setString("difficulty", e.target.value);
          slider.updateHeader(); slider.newPuzzle();
        }));
        slider.els.settingsModal.querySelectorAll('input[name="slider-block-style"]').forEach((r) => r.addEventListener("change", (e) => {
          if (!BLOCK_STYLES[e.target.value] || e.target.value === slider.state.blockStyle) return;
          slider.state.blockStyle = e.target.value;
          sliderStore.setString("blockStyle", e.target.value);
          slider.renderBoard();
        }));

        document.getElementById("slider-tutorial-btn").addEventListener("click", () => sliderTutorial.finish());

        window.addEventListener("resize", () => {
          if (router.current !== "slider") return;
          slider.sizeBoard();
          const els = slider.boardEl.querySelectorAll(".block");
          els.forEach((el) => {
            const id = Number(el.dataset.id);
            const b = slider.state.blocks.find((bb) => bb.id === id);
            if (b) el.style.transform = sliderBlockTransform(b.row, b.col);
          });
        });
      }

      slider.newPuzzle();

      if (!sliderStore.getBool("tutorialSeen")) {
        if (slider.state.completed > 0) {
          sliderStore.setBool("tutorialSeen", true);
        } else {
          showModal(document.getElementById("slider-tutorial-modal"));
          sliderTutorial.play();
        }
      }
    },

    onLeave() {
      slider.drag = null;
      hideModal(slider.els.winModal);
      hideModal(slider.els.settingsModal);
      hideModal(document.getElementById("slider-tutorial-modal"));
      sliderTutorial.clearTimers();
    },
  };

  // ================================================================
  // 11. ARROW — HELPERS & RENDERING
  // ================================================================
  const ARROW_COLORS = {
    target: "#c8302b",
    palette: ["#5a7aa8","#8a7a4a","#5a8a5a","#8a5a7a","#6a7a3a","#4a6a8a","#8a6a3a","#5a4a7a","#3a7a6a","#7a4a5a","#6a5a3a","#4a7a4a"],
  };
  const DIR_DELTA = { n: [-1, 0], s: [1, 0], e: [0, 1], w: [0, -1] };

  function arrowPickPuzzle(difficulty) {
    const pool = (window.ARROW_PUZZLES && window.ARROW_PUZZLES[difficulty]) ||
                 (window.ARROW_PUZZLES && window.ARROW_PUZZLES.moderate) || null;
    if (!pool || !pool.length) return arrowFallback();
    const src = pool[Math.floor(Math.random() * pool.length)];
    return {
      gridW: src.gridW, gridH: src.gridH, minTaps: src.minTaps,
      pieces: src.pieces.map((p) => ({
        id: p.id,
        cells: p.cells.map((c) => [c[0], c[1]]),
        dir: p.dir,
        isTarget: !!p.isTarget,
      })),
    };
  }

  function arrowFallback() {
    return {
      gridW: 7, gridH: 7, minTaps: 3,
      pieces: [
        { id: 0, cells: [[3,2],[3,3]], dir: "e", isTarget: true },
        { id: 1, cells: [[3,5],[4,5]], dir: "s", isTarget: false },
        { id: 2, cells: [[1,3],[1,4]], dir: "n", isTarget: false },
        { id: 3, cells: [[3,0],[4,0]], dir: "s", isTarget: false },
      ],
    };
  }

  function arrowPieceColor(p) {
    return p.isTarget ? ARROW_COLORS.target : ARROW_COLORS.palette[p.id % ARROW_COLORS.palette.length];
  }

  function arrowPieceBounds(cells) {
    let r0 = Infinity, c0 = Infinity, r1 = -Infinity, c1 = -Infinity;
    for (const [r, c] of cells) {
      if (r < r0) r0 = r; if (c < c0) c0 = c;
      if (r > r1) r1 = r; if (c > c1) c1 = c;
    }
    return { r0, c0, r1, c1 };
  }

  function arrowGlyph(cx, cy, dir, size) {
    const s = size * 0.6;
    let pts;
    if (dir === "n") pts = (cx)+","+(cy-s)+" "+(cx-s*0.7)+","+(cy+s*0.4)+" "+(cx+s*0.7)+","+(cy+s*0.4);
    else if (dir === "s") pts = (cx)+","+(cy+s)+" "+(cx-s*0.7)+","+(cy-s*0.4)+" "+(cx+s*0.7)+","+(cy-s*0.4);
    else if (dir === "e") pts = (cx+s)+","+cy+" "+(cx-s*0.4)+","+(cy-s*0.7)+" "+(cx-s*0.4)+","+(cy+s*0.7);
    else pts = (cx-s)+","+cy+" "+(cx+s*0.4)+","+(cy-s*0.7)+" "+(cx+s*0.4)+","+(cy+s*0.7);
    return "<polygon points='" + pts + "' fill='rgba(255,255,255,0.85)'/>";
  }

  const arrow = {
    boardEl: null,
    boardWrapEl: null,
    state: { pieces: [], originalPieces: null, gridW: 7, gridH: 7, taps: 0, completed: 0, difficulty: "moderate", winLocked: false },
    els: {},

    sizeBoard() {
      const r = this.boardWrapEl.getBoundingClientRect();
      const s = this.state;
      const availW = r.width - 16, availH = r.height - 16;
      let cp = Math.min(Math.floor(availW / s.gridW), Math.floor(availH / s.gridH));
      cp = Math.max(28, Math.min(64, cp));
      this.boardEl.style.setProperty("--acell", cp + "px");
      this.boardEl.style.width = (cp * s.gridW) + "px";
      this.boardEl.style.height = (cp * s.gridH) + "px";
    },

    cellPx() {
      const v = getComputedStyle(this.boardEl).getPropertyValue("--acell").trim();
      return parseFloat(v) || 42;
    },

    renderBoard() {
      this.boardEl.innerHTML = "";
      const cp = this.cellPx();
      for (const p of this.state.pieces) {
        const { r0, c0, r1, c1 } = arrowPieceBounds(p.cells);
        const w = (c1 - c0 + 1) * cp, h = (r1 - r0 + 1) * cp;
        const color = arrowPieceColor(p);

        const vbW = (c1 - c0 + 1) * 100, vbH = (r1 - r0 + 1) * 100;
        let svgInner = "";
        for (const [cr, cc] of p.cells) {
          svgInner += "<rect x='" + ((cc - c0) * 100 + 3) + "' y='" + ((cr - r0) * 100 + 3) + "' width='94' height='94' rx='8' fill='" + color + "'/>";
        }
        const headCell = arrowHeadCell(p);
        const hcx = (headCell[1] - c0) * 100 + 50, hcy = (headCell[0] - r0) * 100 + 50;
        svgInner += arrowGlyph(hcx, hcy, p.dir, 40);
        const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 " + vbW + " " + vbH + "'>" + svgInner + "</svg>";

        const el = document.createElement("div");
        el.className = "arrow-piece" + (p.isTarget ? " target-piece" : "");
        el.dataset.id = String(p.id);
        el.style.width = w + "px";
        el.style.height = h + "px";
        const posTransform = "translate(" + (c0 * cp) + "px, " + (r0 * cp) + "px)";
        el.style.transform = posTransform;
        el.style.setProperty("--pos", posTransform);
        el.style.backgroundImage = encodeSvg(svg);
        el.style.backgroundSize = "100% 100%";
        el.style.backgroundRepeat = "no-repeat";
        el.addEventListener("click", (e) => this.onTap(e));
        this.boardEl.appendChild(el);
      }
    },

    updateHeader() {
      this.els.completedCount.textContent = String(this.state.completed);
      this.els.tapCount.textContent = String(this.state.taps);
      this.els.difficultyLabel.textContent = DIFFICULTIES[this.state.difficulty] || "Moderate";
    },
  };

  function arrowHeadCell(piece) {
    const d = piece.dir;
    let best = piece.cells[0];
    for (const c of piece.cells) {
      if (d === "n" && c[0] < best[0]) best = c;
      if (d === "s" && c[0] > best[0]) best = c;
      if (d === "e" && c[1] > best[1]) best = c;
      if (d === "w" && c[1] < best[1]) best = c;
    }
    return best;
  }

  // ================================================================
  // 12. ARROW — TAP HANDLING & WIN
  // ================================================================
  function arrowBuildGrid(pieces, gridW, gridH) {
    const g = Array.from({ length: gridH }, () => new Array(gridW).fill(-1));
    for (let i = 0; i < pieces.length; i++) {
      for (const [r, c] of pieces[i].cells) {
        if (r >= 0 && r < gridH && c >= 0 && c < gridW) g[r][c] = i;
      }
    }
    return g;
  }

  function arrowComputeSlide(piece, allPieces, gridW, gridH) {
    const [dr, dc] = DIR_DELTA[piece.dir] || [0, 0];
    if (dr === 0 && dc === 0) return { steps: 0, exits: false };
    const grid = arrowBuildGrid(allPieces, gridW, gridH);
    const myIdx = allPieces.indexOf(piece);

    let maxK = 0;
    const maxPossible = Math.max(gridW, gridH) + 5;
    for (let k = 1; k <= maxPossible; k++) {
      let blocked = false;
      let allOff = true;
      for (const [r, c] of piece.cells) {
        const nr = r + k * dr, nc = c + k * dc;
        if (nr >= 0 && nr < gridH && nc >= 0 && nc < gridW) {
          allOff = false;
          if (grid[nr][nc] !== -1 && grid[nr][nc] !== myIdx) { blocked = true; break; }
        }
      }
      if (blocked) break;
      maxK = k;
      if (allOff) return { steps: k, exits: true };
    }
    const allOffAtMax = piece.cells.every(([r, c]) => {
      const nr = r + maxK * dr, nc = c + maxK * dc;
      return nr < 0 || nr >= gridH || nc < 0 || nc >= gridW;
    });
    return { steps: maxK, exits: allOffAtMax };
  }

  arrow.onTap = function (e) {
    if (this.state.winLocked) return;
    const el = e.currentTarget;
    const id = Number(el.dataset.id);
    const piece = this.state.pieces.find((p) => p.id === id);
    if (!piece) return;

    const { steps, exits } = arrowComputeSlide(piece, this.state.pieces, this.state.gridW, this.state.gridH);
    if (steps === 0) {
      el.classList.remove("shaking");
      void el.offsetWidth;
      el.classList.add("shaking");
      setTimeout(() => el.classList.remove("shaking"), 350);
      return;
    }

    this.state.taps += 1;
    this.els.tapCount.textContent = String(this.state.taps);

    const [dr, dc] = DIR_DELTA[piece.dir];
    const cp = this.cellPx();
    const { r0: oldR0, c0: oldC0 } = arrowPieceBounds(piece.cells);

    for (const c of piece.cells) { c[0] += steps * dr; c[1] += steps * dc; }

    if (exits) {
      const { r0: bndR, c0: bndC, r1: bndR1, c1: bndC1 } = arrowPieceBounds(piece.cells);
      const pieceW = (bndC1 - bndC + 1) * cp;
      const pieceH = (bndR1 - bndR + 1) * cp;
      const boardW = this.state.gridW * cp;
      const boardH = this.state.gridH * cp;
      let exitX, exitY;
      if (piece.dir === "e") { exitX = boardW + pieceW; exitY = bndR * cp; }
      else if (piece.dir === "w") { exitX = -pieceW * 2; exitY = bndR * cp; }
      else if (piece.dir === "s") { exitX = bndC * cp; exitY = boardH + pieceH; }
      else { exitX = bndC * cp; exitY = -pieceH * 2; }
      el.style.transform = "translate(" + exitX + "px, " + exitY + "px)";
      el.classList.add("exiting");
      setTimeout(() => {
        el.remove();
        this.state.pieces = this.state.pieces.filter((p) => p.id !== id);
        if (piece.isTarget) this.onWin();
      }, 450);
    } else {
      const { r0: newR0, c0: newC0 } = arrowPieceBounds(piece.cells);
      const posTransform = "translate(" + (newC0 * cp) + "px, " + (newR0 * cp) + "px)";
      el.style.transform = posTransform;
      el.style.setProperty("--pos", posTransform);
    }
  };

  arrow.onWin = function () {
    this.state.winLocked = true;
    setTimeout(() => {
      this.state.completed += 1;
      arrowStore.setInt("completedCount", this.state.completed);
      this.els.completedCount.textContent = String(this.state.completed);
      this.els.winTaps.textContent = String(this.state.taps);
      this.els.winTotal.textContent = String(this.state.completed);
      showModal(this.els.winModal);
    }, 420);
  };

  arrow.newPuzzle = function () {
    this.state.winLocked = false;
    this.state.taps = 0;
    const puzzle = arrowPickPuzzle(this.state.difficulty);
    this.state.gridW = puzzle.gridW;
    this.state.gridH = puzzle.gridH;
    this.state.pieces = puzzle.pieces;
    this.state.originalPieces = JSON.parse(JSON.stringify(puzzle.pieces));
    this.sizeBoard();
    this.renderBoard();
    this.updateHeader();
  };

  arrow.restartPuzzle = function () {
    if (!this.state.originalPieces) return;
    this.state.winLocked = false;
    this.state.taps = 0;
    this.state.pieces = JSON.parse(JSON.stringify(this.state.originalPieces));
    this.renderBoard();
    this.updateHeader();
  };

  // ================================================================
  // 13. ARROW — UI WIRING & TUTORIAL
  // ================================================================
  const arrowTutorial = {
    timers: [],
    PIECES: [
      { id: 0, cells: [[2,1],[2,2]], dir: "e", isTarget: true },
      { id: 1, cells: [[2,4],[3,4]], dir: "s", isTarget: false },
      { id: 2, cells: [[0,2],[0,3]], dir: "n", isTarget: false },
    ],

    renderBoard() {
      const boardEl = document.getElementById("arrow-tutorial-board");
      boardEl.innerHTML = "";
      boardEl.style.setProperty("--acell", "40px");
      boardEl.style.width = "200px";
      boardEl.style.height = "200px";
      const cp = 40;
      for (const p of this.PIECES) {
        const { r0, c0, r1, c1 } = arrowPieceBounds(p.cells);
        const w = (c1 - c0 + 1) * cp, h = (r1 - r0 + 1) * cp;
        const color = arrowPieceColor(p);
        const vbW = (c1 - c0 + 1) * 100, vbH = (r1 - r0 + 1) * 100;
        let svgInner = "";
        for (const [cr, cc] of p.cells) {
          svgInner += "<rect x='" + ((cc - c0) * 100 + 3) + "' y='" + ((cr - r0) * 100 + 3) + "' width='94' height='94' rx='8' fill='" + color + "'/>";
        }
        const hc = arrowHeadCell(p);
        svgInner += arrowGlyph((hc[1] - c0) * 100 + 50, (hc[0] - r0) * 100 + 50, p.dir, 40);

        const el = document.createElement("div");
        el.className = "arrow-piece" + (p.isTarget ? " target-piece" : "");
        el.dataset.id = String(p.id);
        el.style.width = w + "px"; el.style.height = h + "px";
        el.style.transform = "translate(" + (c0 * cp) + "px, " + (r0 * cp) + "px)";
        el.style.backgroundImage = encodeSvg("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 " + vbW + " " + vbH + "'>" + svgInner + "</svg>");
        el.style.backgroundSize = "100% 100%"; el.style.backgroundRepeat = "no-repeat";
        el.style.transition = "transform 500ms ease-out, opacity 400ms ease-out";
        boardEl.appendChild(el);
      }
    },

    moveOffscreen(id, dir) {
      const boardEl = document.getElementById("arrow-tutorial-board");
      const el = boardEl.querySelector('.arrow-piece[data-id="' + id + '"]');
      if (!el) return;
      const off = dir === "n" ? "translate(40px, -100px)" : dir === "s" ? "translate(40px, 300px)" : dir === "e" ? "translate(300px, 80px)" : "translate(-100px, 80px)";
      el.style.transform = off;
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 550);
    },

    highlight(id, on) {
      const boardEl = document.getElementById("arrow-tutorial-board");
      const el = boardEl.querySelector('.arrow-piece[data-id="' + id + '"]');
      if (!el) return;
      if (on) el.classList.add("highlight"); else el.classList.remove("highlight");
    },

    setCaption(t) { document.getElementById("arrow-tutorial-caption").textContent = t; },

    play() {
      this.clearTimers();
      this.renderBoard();
      this.setCaption("Tap arrows to slide them off the board.");
      const btn = document.getElementById("arrow-tutorial-btn");
      btn.textContent = "Skip tutorial"; btn.classList.remove("primary-btn"); btn.classList.add("danger-btn");

      const steps = [
        [1800, () => { this.setCaption("Tap the blue arrow to slide it off…"); this.highlight(1, true); }],
        [800, () => { this.highlight(1, false); this.moveOffscreen(1, "s"); }],
        [1200, () => { this.setCaption("Now tap the red arrow to escape!"); this.highlight(0, true); }],
        [800, () => { this.highlight(0, false); this.moveOffscreen(0, "e"); }],
        [1000, () => { this.setCaption("Solved! Clear the path for the red arrow."); }],
        [800, () => { btn.textContent = "Start playing!"; btn.classList.remove("danger-btn"); btn.classList.add("primary-btn"); }],
      ];
      let cum = 0;
      for (const [d, fn] of steps) { cum += d; this.timers.push(setTimeout(fn, cum)); }
    },

    clearTimers() { for (const t of this.timers) clearTimeout(t); this.timers = []; },

    finish() {
      this.clearTimers();
      arrowStore.setBool("tutorialSeen", true);
      hideModal(document.getElementById("arrow-tutorial-modal"));
    },
  };

  // ================================================================
  // 14. ARROW — MODULE (onEnter / onLeave)
  // ================================================================
  modules.arrow = {
    _wired: false,

    onEnter() {
      arrow.boardEl = document.getElementById("arrow-board");
      arrow.boardWrapEl = document.getElementById("arrow-board-wrap");
      arrow.els = {
        completedCount: document.getElementById("arrow-completed-count"),
        tapCount: document.getElementById("arrow-tap-count"),
        difficultyLabel: document.getElementById("arrow-difficulty-label"),
        winModal: document.getElementById("arrow-win-modal"),
        winTaps: document.getElementById("arrow-win-taps"),
        winTotal: document.getElementById("arrow-win-total"),
        settingsModal: document.getElementById("arrow-settings-modal"),
      };

      arrow.state.completed = arrowStore.getInt("completedCount", 0);
      arrow.state.difficulty = arrowStore.getString("difficulty", "moderate", DIFFICULTIES);

      if (!this._wired) {
        this._wired = true;
        wireModal(arrow.els.settingsModal);
        wireModal(arrow.els.winModal);

        document.getElementById("arrow-settings-btn").addEventListener("click", () => {
          const m = arrow.els.settingsModal;
          m.querySelectorAll('input[name="arrow-difficulty"]').forEach((r) => { r.checked = r.value === arrow.state.difficulty; });
          showModal(m);
        });

        document.getElementById("arrow-new-puzzle-btn").addEventListener("click", () => { hideModal(arrow.els.winModal); arrow.newPuzzle(); });
        document.getElementById("arrow-restart-btn").addEventListener("click", () => { hideModal(arrow.els.winModal); arrow.restartPuzzle(); });
        document.getElementById("arrow-next-puzzle-btn").addEventListener("click", () => { hideModal(arrow.els.winModal); arrow.newPuzzle(); });
        document.getElementById("arrow-reset-count-btn").addEventListener("click", () => {
          if (!window.confirm("Reset the number of completed puzzles back to 0?")) return;
          arrow.state.completed = 0; arrowStore.setInt("completedCount", 0);
          arrow.els.completedCount.textContent = "0";
        });

        arrow.els.settingsModal.querySelectorAll('input[name="arrow-difficulty"]').forEach((r) => r.addEventListener("change", (e) => {
          if (!DIFFICULTIES[e.target.value] || e.target.value === arrow.state.difficulty) return;
          arrow.state.difficulty = e.target.value;
          arrowStore.setString("difficulty", e.target.value);
          arrow.updateHeader(); arrow.newPuzzle();
        }));

        document.getElementById("arrow-tutorial-btn").addEventListener("click", () => arrowTutorial.finish());

        window.addEventListener("resize", () => {
          if (router.current !== "arrow") return;
          arrow.sizeBoard();
          arrow.renderBoard();
        });
      }

      arrow.newPuzzle();

      if (!arrowStore.getBool("tutorialSeen")) {
        showModal(document.getElementById("arrow-tutorial-modal"));
        arrowTutorial.play();
      }
    },

    onLeave() {
      arrow.state.winLocked = false;
      hideModal(arrow.els.winModal);
      hideModal(arrow.els.settingsModal);
      hideModal(document.getElementById("arrow-tutorial-modal"));
      arrowTutorial.clearTimers();
    },
  };

  // ================================================================
  // 15. HEN CROSSING — Frogger-style real-time game
  // ================================================================
  const henStore = makeStore("hen");

  const HEN_COLS = 9;
  const HEN_ROWS = 11;
  const HEN_MAX_LIVES = 5;
  const HEN_ROW_TYPES = [
    "goal", "river", "river", "river", "river",
    "safe", "road", "road", "road", "road", "start",
  ];
  const HEN_LANE_DIR = [
    0, 1, -1, 1, -1,
    0, -1, -1, 1, 1, 0,
  ];
  const HEN_DIFFICULTY = {
    simple:    { carSpeed: [1.5, 2.5], carInterval: [2000, 2800], riverSpeed: [0.8, 1.4], logInterval: [1600, 2400], padChance: 0.4 },
    moderate:  { carSpeed: [2.5, 4.0], carInterval: [1200, 1800], riverSpeed: [1.5, 2.5], logInterval: [1300, 2000], padChance: 0.25 },
    difficult: { carSpeed: [4.0, 6.0], carInterval: [700, 1200],  riverSpeed: [2.5, 3.5], logInterval: [1000, 1600], padChance: 0.15 },
  };
  const VEHICLE_TYPES = [
    { name: "motorcycle", w: 0.7, color: "#555" },
    { name: "sedan",      w: 1.6, color: "#3a6dbf" },
    { name: "sedan2",     w: 1.6, color: "#d14b3c" },
    { name: "truck",      w: 2.5, color: "#7a4a1e" },
    { name: "bus",        w: 3.2, color: "#e8a020" },
  ];
  const LOG_WIDTHS = [2, 3, 4];

  const hen = {
    canvas: null, ctx: null,
    cellPx: 40,
    state: {
      henCol: 4, henRow: 10, henX: 0, henY: 0,
      lives: HEN_MAX_LIVES, completed: 0, difficulty: "moderate",
      paused: false, dead: false, won: false,
    },
    lanes: [],
    animId: null,
    lastFrame: 0,
    bgCache: null,
    els: {},

    initCanvas() {
      this.canvas = document.getElementById("hen-canvas");
      this.ctx = this.canvas.getContext("2d");
      this.sizeCanvas();
    },

    sizeCanvas() {
      const wrap = this.canvas.parentElement;
      const r = wrap.getBoundingClientRect();
      const maxW = r.width - 8, maxH = r.height - 8;
      let cp = Math.floor(Math.min(maxW / HEN_COLS, maxH / HEN_ROWS));
      cp = Math.max(24, Math.min(72, cp));
      this.cellPx = cp;
      const w = cp * HEN_COLS, h = cp * HEN_ROWS;
      this.canvas.width = w;
      this.canvas.height = h;
      this.canvas.style.width = w + "px";
      this.canvas.style.height = h + "px";
      this.bgCache = null;
    },

    drawBackground() {
      if (this.bgCache) { this.ctx.drawImage(this.bgCache, 0, 0); return; }
      const c = document.createElement("canvas");
      c.width = this.canvas.width; c.height = this.canvas.height;
      const g = c.getContext("2d");
      const cp = this.cellPx;
      for (let row = 0; row < HEN_ROWS; row++) {
        const y = row * cp, type = HEN_ROW_TYPES[row];
        if (type === "goal" || type === "start" || type === "safe") {
          g.fillStyle = "#2d6e3a"; g.fillRect(0, y, cp * HEN_COLS, cp);
          g.fillStyle = "rgba(0,0,0,0.08)";
          for (let i = 0; i < HEN_COLS * 3; i++) {
            const gx = Math.random() * cp * HEN_COLS, gy = y + Math.random() * cp;
            g.fillRect(gx, gy, 2, 2);
          }
        } else if (type === "road") {
          g.fillStyle = "#2a2a2e"; g.fillRect(0, y, cp * HEN_COLS, cp);
          g.strokeStyle = "rgba(255,255,255,0.3)"; g.lineWidth = 1;
          g.setLineDash([cp * 0.4, cp * 0.3]);
          g.beginPath(); g.moveTo(0, y + cp / 2); g.lineTo(cp * HEN_COLS, y + cp / 2); g.stroke();
          g.setLineDash([]);
        } else if (type === "river") {
          g.fillStyle = "#1a5a8a"; g.fillRect(0, y, cp * HEN_COLS, cp);
          g.fillStyle = "rgba(255,255,255,0.06)";
          for (let i = 0; i < HEN_COLS * 2; i++) {
            const wx = Math.random() * cp * HEN_COLS, wy = y + Math.random() * cp;
            g.fillRect(wx, wy, cp * 0.3, 1);
          }
        }
      }
      this.bgCache = c;
      this.ctx.drawImage(c, 0, 0);
    },

    drawHen() {
      const cp = this.cellPx;
      const x = this.state.henX, y = this.state.henY;
      const s = cp / 16;
      const px = (r, c, w, h, fill) => { this.ctx.fillStyle = fill; this.ctx.fillRect(x + c * s, y + r * s, w * s, h * s); };
      px(2, 6, 4, 3, "#d03020");
      px(5, 4, 8, 8, "#f5e6c8");
      px(5, 3, 2, 6, "#d8c8a0");
      px(5, 11, 2, 6, "#d8c8a0");
      px(6, 10, 3, 2, "#e8a020");
      px(5, 6, 2, 2, "#1a1a1a");
      px(13, 5, 2, 3, "#e8a020");
      px(13, 9, 2, 3, "#e8a020");
    },

    drawVehicle(car) {
      const cp = this.cellPx, ctx = this.ctx;
      const x = car.x, y = car.row * cp, w = car.w * cp, h = cp * 0.7;
      const yOff = (cp - h) / 2;
      ctx.fillStyle = car.color;
      ctx.beginPath();
      ctx.roundRect(x, y + yOff, w, h, 4);
      ctx.fill();
      ctx.fillStyle = "rgba(100,180,255,0.4)";
      if (car.name === "bus" || car.name === "truck") {
        const winY = y + yOff + h * 0.2, winH = h * 0.35;
        for (let i = 0; i < Math.floor(car.w); i++) {
          ctx.fillRect(x + cp * 0.15 + i * cp * 0.85, winY, cp * 0.5, winH);
        }
      } else if (car.name !== "motorcycle") {
        ctx.fillRect(x + w * 0.2, y + yOff + h * 0.15, w * 0.3, h * 0.4);
        ctx.fillRect(x + w * 0.6, y + yOff + h * 0.15, w * 0.25, h * 0.4);
      }
      ctx.fillStyle = "#ffee88";
      const headSide = car.dir > 0 ? x + w - 3 : x;
      ctx.fillRect(headSide, y + yOff + 2, 3, 4);
      ctx.fillRect(headSide, y + yOff + h - 6, 3, 4);
      ctx.fillStyle = "#cc2020";
      const tailSide = car.dir > 0 ? x : x + w - 3;
      ctx.fillRect(tailSide, y + yOff + 2, 3, 4);
      ctx.fillRect(tailSide, y + yOff + h - 6, 3, 4);
    },

    drawLog(obj) {
      const cp = this.cellPx, ctx = this.ctx;
      const x = obj.x, y = obj.row * cp, w = obj.w * cp, h = cp * 0.85;
      const yOff = (cp - h) / 2;
      ctx.fillStyle = "#6b4226";
      ctx.beginPath(); ctx.roundRect(x, y + yOff, w, h, 5); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.lineWidth = 1;
      for (let i = 1; i < obj.w; i++) {
        ctx.beginPath(); ctx.moveTo(x + i * cp, y + yOff + 2); ctx.lineTo(x + i * cp, y + yOff + h - 2); ctx.stroke();
      }
      ctx.fillStyle = "rgba(139,90,43,0.4)";
      ctx.fillRect(x + 3, y + yOff + h * 0.3, w - 6, 2);
      ctx.fillRect(x + 3, y + yOff + h * 0.6, w - 6, 2);
    },

    drawPad(obj) {
      const cp = this.cellPx, ctx = this.ctx;
      const cx = obj.x + cp * 0.5, cy = obj.row * cp + cp * 0.5, r = cp * 0.38;
      ctx.fillStyle = "#3a8a3a";
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#e85a90";
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#f8d0e0";
      ctx.beginPath(); ctx.arc(cx - 2, cy - 2, r * 0.12, 0, Math.PI * 2); ctx.fill();
    },

    draw() {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.drawBackground();
      for (const lane of this.lanes) {
        for (const obj of lane.objects) {
          if (obj.type === "car") this.drawVehicle(obj);
          else if (obj.type === "log") this.drawLog(obj);
          else if (obj.type === "pad") this.drawPad(obj);
        }
      }
      if (!this.state.dead) this.drawHen();
    },

    randRange(a, b) { return a + Math.random() * (b - a); },

    initLanes() {
      this.lanes = [];
      const cfg = HEN_DIFFICULTY[this.state.difficulty] || HEN_DIFFICULTY.moderate;
      for (let row = 0; row < HEN_ROWS; row++) {
        const type = HEN_ROW_TYPES[row], dir = HEN_LANE_DIR[row];
        if (type === "road") {
          const speed = this.randRange(cfg.carSpeed[0], cfg.carSpeed[1]);
          const interval = this.randRange(cfg.carInterval[0], cfg.carInterval[1]);
          this.lanes.push({ row, type: "road", dir, speed, interval, nextSpawn: 0, objects: [] });
        } else if (type === "river") {
          const speed = this.randRange(cfg.riverSpeed[0], cfg.riverSpeed[1]);
          const interval = this.randRange(cfg.logInterval[0], cfg.logInterval[1]);
          this.lanes.push({ row, type: "river", dir, speed, interval, nextSpawn: 0, padChance: cfg.padChance, objects: [] });
        } else {
          this.lanes.push({ row, type, dir: 0, speed: 0, interval: 0, nextSpawn: 0, objects: [] });
        }
      }
    },

    spawnCar(lane, time) {
      const cp = this.cellPx;
      const totalW = HEN_COLS * cp;
      // Ensure minimum gap from the last car in this lane so they
      // never clip into each other and the hen always has a gap to
      // cross through.
      const minGap = cp * 1.8;
      if (lane.objects.length > 0) {
        const last = lane.objects[lane.objects.length - 1];
        if (lane.dir > 0) {
          if (last.x + last.w * cp + minGap > 0) return;
        } else {
          if (last.x - minGap < totalW) return;
        }
      }
      const vt = VEHICLE_TYPES[Math.floor(Math.random() * VEHICLE_TYPES.length)];
      const x = lane.dir > 0 ? -vt.w * cp : totalW;
      const colors = ["#3a6dbf","#d14b3c","#4bae55","#8b4fc5","#e8801a","#dcdcdc","#555"];
      lane.objects.push({
        type: "car", row: lane.row, x, w: vt.w, name: vt.name,
        color: vt.name === "bus" ? "#e8a020" : vt.name === "motorcycle" ? "#555" : colors[Math.floor(Math.random() * colors.length)],
        dir: lane.dir, speed: lane.speed,
      });
      lane.nextSpawn = time + lane.interval + this.randRange(-200, 200);
    },

    spawnRiverObj(lane, time) {
      const cp = this.cellPx;
      const totalW = HEN_COLS * cp;
      // Minimum gap between river objects so they never overlap and the
      // hen can always hop between them. The gap must be ≤ 1 cell so
      // the hen can actually reach the next platform, but > 0 so they
      // don't clip.
      const minGap = cp * 0.5;
      const maxGap = cp * 1.0;
      if (lane.objects.length > 0) {
        const last = lane.objects[lane.objects.length - 1];
        const lastEnd = lane.dir > 0 ? last.x + last.w * cp : last.x;
        const spawnEdge = lane.dir > 0 ? 0 : totalW;
        const gap = lane.dir > 0 ? (spawnEdge - lastEnd) : (lastEnd - spawnEdge);
        if (gap < minGap) return;
      }
      const isPad = Math.random() < (lane.padChance || 0.2);
      const w = isPad ? 1 : LOG_WIDTHS[Math.floor(Math.random() * LOG_WIDTHS.length)];
      const x = lane.dir > 0 ? -w * cp : totalW;
      lane.objects.push({
        type: isPad ? "pad" : "log", row: lane.row, x, w,
        dir: lane.dir, speed: lane.speed,
      });
      // Schedule next spawn so objects stay close enough to jump between
      // but never overlap. Tighter intervals than cars.
      const gapCells = this.randRange(0.5, maxGap / cp);
      const timeForGap = (gapCells * cp + w * cp) / (lane.speed * cp);
      lane.nextSpawn = time + Math.max(timeForGap * 1000, 400);
    },

    update(dt, time) {
      if (this.state.paused || this.state.dead || this.state.won) return;
      const cp = this.cellPx;
      const totalW = HEN_COLS * cp;

      for (const lane of this.lanes) {
        if (lane.type === "road") {
          if (time >= lane.nextSpawn) this.spawnCar(lane, time);
          for (const car of lane.objects) car.x += car.dir * car.speed * cp * dt;
          lane.objects = lane.objects.filter((c) =>
            c.dir > 0 ? c.x < totalW + cp : c.x + c.w * cp > -cp
          );
        } else if (lane.type === "river") {
          if (time >= lane.nextSpawn) this.spawnRiverObj(lane, time);
          for (const obj of lane.objects) obj.x += obj.dir * obj.speed * cp * dt;
          lane.objects = lane.objects.filter((o) =>
            o.dir > 0 ? o.x < totalW + cp * 2 : o.x + o.w * cp > -cp * 2
          );
        }
      }

      const henRow = this.state.henRow;
      const rowType = HEN_ROW_TYPES[henRow];
      const inGrace = this.state.graceUntil && performance.now() < this.state.graceUntil;

      if (rowType === "river") {
        const lane = this.lanes.find((l) => l.row === henRow);
        if (lane) {
          const henCx = this.state.henX + cp * 0.5;
          let onPlatform = false;
          for (const obj of lane.objects) {
            if (henCx >= obj.x && henCx <= obj.x + obj.w * cp) {
              onPlatform = true;
              this.state.henX += obj.dir * obj.speed * cp * dt;
              break;
            }
          }
          if (!onPlatform && !inGrace) { this.loseLife(); return; }
          if (this.state.henX < -cp || this.state.henX > totalW) { this.loseLife(); return; }
        }
      }

      if (rowType === "road") {
        const lane = this.lanes.find((l) => l.row === henRow);
        if (lane) {
          const hx = this.state.henX, hw = cp * 0.8;
          if (!inGrace) {
            for (const car of lane.objects) {
              if (hx + hw > car.x + 2 && hx < car.x + car.w * cp - 2) {
                this.loseLife(); return;
              }
            }
          }
        }
      }

      if (henRow === 0 && !this.state.won) {
        this.state.won = true;
        this.onWin();
      }
    },

    moveHen(dir) {
      if (this.state.paused || this.state.dead || this.state.won) return;
      const cp = this.cellPx;
      const totalW = HEN_COLS * cp;

      // Use the hen's ACTUAL pixel position (which may have drifted
      // with a river platform) as the baseline — not the grid column,
      // which is stale once she's riding a log/pad.
      let newX = this.state.henX;
      let newRow = this.state.henRow;

      if (dir === "up" && newRow > 0) newRow--;
      else if (dir === "down" && newRow < HEN_ROWS - 1) newRow++;
      else if (dir === "left") newX -= cp;
      else if (dir === "right") newX += cp;
      else return;

      // Clamp X to board bounds
      newX = Math.max(0, Math.min(totalW - cp, newX));

      this.state.henRow = newRow;
      this.state.henX = newX;
      this.state.henY = newRow * cp;
      // Keep henCol roughly in sync (used only for reset position)
      this.state.henCol = Math.round(newX / cp);

      // When landing on a river row, snap onto the nearest platform
      // so the hen doesn't fall between a log/pad and the grid.
      const destType = HEN_ROW_TYPES[newRow];
      if (destType === "river") {
        const lane = this.lanes.find((l) => l.row === newRow);
        if (lane) {
          const henCx = this.state.henX + cp * 0.5;
          let bestObj = null, bestDist = Infinity;
          for (const obj of lane.objects) {
            const objLeft = obj.x, objRight = obj.x + obj.w * cp;
            // Search within a generous range so diagonal-ish hops land
            if (henCx >= objLeft - cp * 0.8 && henCx <= objRight + cp * 0.8) {
              const dist = Math.abs(henCx - (objLeft + objRight) / 2);
              if (dist < bestDist) { bestDist = dist; bestObj = obj; }
            }
          }
          if (bestObj) {
            this.state.henX = Math.max(bestObj.x,
              Math.min(bestObj.x + bestObj.w * cp - cp, this.state.henX));
          }
        }
      }

      // When landing on a non-river row (grass or road), re-align X
      // to the nearest grid column so movement feels snappy again.
      if (destType !== "river") {
        this.state.henCol = Math.round(this.state.henX / cp);
        this.state.henCol = Math.max(0, Math.min(HEN_COLS - 1, this.state.henCol));
        this.state.henX = this.state.henCol * cp;
      }

      this.state.graceUntil = performance.now() + 125;
    },

    loseLife() {
      this.state.dead = true;
      this.state.lives -= 1;
      henStore.setInt("lives", Math.max(0, this.state.lives));
      this.updateLivesDisplay();
      setTimeout(() => {
        if (this.state.lives <= 0) {
          this.onGameOver();
        } else {
          this.resetHenPosition();
          this.state.dead = false;
        }
      }, 600);
    },

    resetHenPosition() {
      const cp = this.cellPx;
      this.state.henCol = Math.floor(HEN_COLS / 2);
      this.state.henRow = HEN_ROWS - 1;
      this.state.henX = this.state.henCol * cp;
      this.state.henY = this.state.henRow * cp;
    },

    onWin() {
      this.state.completed += 1;
      this.state.lives = Math.min(this.state.lives + 1, HEN_MAX_LIVES);
      henStore.setInt("completedCount", this.state.completed);
      henStore.setInt("lives", this.state.lives);
      this.updateLivesDisplay();
      this.els.completedCount.textContent = String(this.state.completed);
      setTimeout(() => {
        this.state.paused = true;
        this.els.winTotal.textContent = String(this.state.completed);
        showModal(this.els.winModal);
      }, 400);
    },

    onGameOver() {
      this.state.paused = true;
      this.els.gameoverTotal.textContent = String(this.state.completed);
      showModal(this.els.gameoverModal);
    },

    updateLivesDisplay() {
      const el = document.getElementById("hen-lives");
      el.innerHTML = "";
      for (let i = 0; i < HEN_MAX_LIVES; i++) {
        const d = document.createElement("span");
        d.className = "hen-life" + (i >= this.state.lives ? " lost" : "");
        el.appendChild(d);
      }
    },

    updateHeader() {
      this.els.completedCount.textContent = String(this.state.completed);
      this.els.difficultyLabel.textContent = DIFFICULTIES[this.state.difficulty] || "Moderate";
    },

    startNewCrossing() {
      this.state.won = false;
      this.state.dead = false;
      this.state.paused = false;
      this.bgCache = null;
      this.initLanes();
      this.sizeCanvas();
      this.resetHenPosition();
      this.updateLivesDisplay();
      this.updateHeader();
      this.lastFrame = performance.now();
      for (const lane of this.lanes) lane.nextSpawn = this.lastFrame + this.randRange(200, 1000);
    },

    gameLoop(timestamp) {
      if (!this.canvas) return;
      const dt = Math.min((timestamp - this.lastFrame) / 1000, 0.1);
      this.lastFrame = timestamp;
      this.update(dt, timestamp);
      this.draw();
      this.animId = requestAnimationFrame((t) => this.gameLoop(t));
    },

    startLoop() {
      this.lastFrame = performance.now();
      if (this.animId) cancelAnimationFrame(this.animId);
      this.animId = requestAnimationFrame((t) => this.gameLoop(t));
    },

    stopLoop() {
      if (this.animId) { cancelAnimationFrame(this.animId); this.animId = null; }
    },
  };

  // Swipe + keyboard controls.
  // Uses pointer events only (covers touch, mouse, and stylus in one
  // code path). Touch events are NOT registered — on mobile they would
  // fire BEFORE pointer events and cause duplicate moves.
  let henPointerStart = null;
  let henSwipeCooldown = 0;

  function henPointerDown(e) {
    e.preventDefault();
    henPointerStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
  }

  function henPointerUp(e) {
    if (!henPointerStart || e.pointerId !== henPointerStart.id) return;
    const now = performance.now();
    if (now < henSwipeCooldown) { henPointerStart = null; return; }
    const dx = e.clientX - henPointerStart.x;
    const dy = e.clientY - henPointerStart.y;
    henPointerStart = null;
    const absDx = Math.abs(dx), absDy = Math.abs(dy);
    if (Math.max(absDx, absDy) < 10) return;
    if (absDx > absDy) hen.moveHen(dx > 0 ? "right" : "left");
    else hen.moveHen(dy > 0 ? "down" : "up");
    henSwipeCooldown = now + 80;
  }

  function henKeyHandler(e) {
    if (router.current !== "hen") return;
    const map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
                  w: "up", s: "down", a: "left", d: "right" };
    if (map[e.key]) { e.preventDefault(); hen.moveHen(map[e.key]); }
  }

  // Module
  modules.hen = {
    _wired: false,

    onEnter() {
      hen.initCanvas();
      hen.els = {
        completedCount: document.getElementById("hen-completed-count"),
        difficultyLabel: document.getElementById("hen-difficulty-label"),
        winModal: document.getElementById("hen-win-modal"),
        winTotal: document.getElementById("hen-win-total"),
        gameoverModal: document.getElementById("hen-gameover-modal"),
        gameoverTotal: document.getElementById("hen-gameover-total"),
        settingsModal: document.getElementById("hen-settings-modal"),
      };

      hen.state.completed = henStore.getInt("completedCount", 0);
      hen.state.difficulty = henStore.getString("difficulty", "moderate", DIFFICULTIES);
      hen.state.lives = henStore.getInt("lives", HEN_MAX_LIVES);
      if (hen.state.lives <= 0) hen.state.lives = HEN_MAX_LIVES;

      if (!this._wired) {
        this._wired = true;
        wireModal(hen.els.settingsModal);
        wireModal(hen.els.winModal);

        document.getElementById("hen-settings-btn").addEventListener("click", () => {
          hen.state.paused = true;
          const m = hen.els.settingsModal;
          m.querySelectorAll('input[name="hen-difficulty"]').forEach((r) => { r.checked = r.value === hen.state.difficulty; });
          showModal(m);
        });

        hen.els.settingsModal.addEventListener("click", (e) => {
          if (e.target instanceof HTMLElement && e.target.hasAttribute("data-close")) {
            hen.state.paused = false;
          }
        });

        hen.els.settingsModal.querySelectorAll('input[name="hen-difficulty"]').forEach((r) => r.addEventListener("change", (e) => {
          if (!DIFFICULTIES[e.target.value] || e.target.value === hen.state.difficulty) return;
          hen.state.difficulty = e.target.value;
          henStore.setString("difficulty", e.target.value);
          hen.startNewCrossing();
        }));

        document.getElementById("hen-reset-count-btn").addEventListener("click", () => {
          if (!window.confirm("Reset the number of completed crossings back to 0?")) return;
          hen.state.completed = 0; henStore.setInt("completedCount", 0);
          hen.els.completedCount.textContent = "0";
        });

        document.getElementById("hen-next-btn").addEventListener("click", () => {
          hideModal(hen.els.winModal);
          hen.startNewCrossing();
        });

        document.getElementById("hen-retry-btn").addEventListener("click", () => {
          hideModal(hen.els.gameoverModal);
          hen.state.lives = HEN_MAX_LIVES;
          henStore.setInt("lives", HEN_MAX_LIVES);
          hen.startNewCrossing();
        });

        document.getElementById("hen-tutorial-btn").addEventListener("click", () => {
          henStore.setBool("tutorialSeen", true);
          hideModal(document.getElementById("hen-tutorial-modal"));
          hen.state.paused = false;
        });

        hen.canvas.addEventListener("pointerdown", henPointerDown, { passive: false });
        hen.canvas.addEventListener("pointerup", henPointerUp);
        document.addEventListener("keydown", henKeyHandler);

        // D-pad buttons
        document.querySelectorAll("#screen-hen .dpad-btn").forEach((btn) => {
          btn.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            const dir = btn.dataset.dir;
            if (dir) hen.moveHen(dir);
          });
        });

        window.addEventListener("resize", () => {
          if (router.current !== "hen") return;
          hen.sizeCanvas();
          hen.resetHenPosition();
        });
      }

      hen.startNewCrossing();
      hen.startLoop();

      if (!henStore.getBool("tutorialSeen")) {
        hen.state.paused = true;
        showModal(document.getElementById("hen-tutorial-modal"));
      }
    },

    onLeave() {
      hen.stopLoop();
      hen.state.paused = true;
      hideModal(hen.els.winModal);
      hideModal(hen.els.gameoverModal);
      hideModal(hen.els.settingsModal);
      hideModal(document.getElementById("hen-tutorial-modal"));
    },
  };

  // ================================================================
  // 16. ONE FILL LINE — Hamiltonian path puzzle
  // ================================================================
  const onefillStore = makeStore("onefill");
  const OF_SIZE = 5;

  function ofPickPuzzle(difficulty) {
    const pool = (window.ONEFILL_PUZZLES && window.ONEFILL_PUZZLES[difficulty]) ||
                 (window.ONEFILL_PUZZLES && window.ONEFILL_PUZZLES.moderate) || null;
    if (!pool || !pool.length) return { start: [0, 0], obstacles: [], pathLen: 36 };
    const src = pool[Math.floor(Math.random() * pool.length)];
    return {
      start: [src.start[0], src.start[1]],
      obstacles: src.obstacles.map((o) => [o[0], o[1]]),
      pathLen: src.pathLen,
    };
  }

  const onefill = {
    boardEl: null, svgEl: null,
    state: {
      grid: [], currentPath: [], start: [0, 0],
      nonObstacleCount: 0, completed: 0, difficulty: "moderate",
      drawing: false, won: false,
    },
    cellEls: [],
    els: {},
    cellPx: 48,

    sizeBoard() {
      const wrap = this.boardEl.parentElement;
      const r = wrap.getBoundingClientRect();
      const avail = Math.min(r.width, r.height) - 24;
      let cp = Math.floor((avail - OF_SIZE * 3 - 16) / OF_SIZE);
      cp = Math.max(32, Math.min(64, cp));
      this.cellPx = cp;
      this.boardEl.style.setProperty("--fcell", cp + "px");
    },

    buildGrid(puzzle) {
      const g = Array.from({ length: OF_SIZE }, () => new Array(OF_SIZE).fill(0));
      for (const [r, c] of puzzle.obstacles) g[r][c] = 1;
      this.state.grid = g;
      this.state.start = puzzle.start;
      this.state.nonObstacleCount = OF_SIZE * OF_SIZE - puzzle.obstacles.length;
      this.state.currentPath = [puzzle.start.slice()];
      this.state.drawing = false;
      this.state.won = false;
      g[puzzle.start[0]][puzzle.start[1]] = 2;
    },

    renderBoard() {
      this.boardEl.querySelectorAll(".onefill-cell").forEach((c) => c.remove());
      this.svgEl.innerHTML = "";
      this.cellEls = [];
      const g = this.state.grid;
      for (let r = 0; r < OF_SIZE; r++) {
        for (let c = 0; c < OF_SIZE; c++) {
          const el = document.createElement("div");
          el.className = "onefill-cell";
          el.dataset.row = String(r);
          el.dataset.col = String(c);
          if (g[r][c] === 1) el.classList.add("onefill-cell--obstacle");
          if (r === this.state.start[0] && c === this.state.start[1]) {
            el.classList.add("onefill-cell--start", "onefill-cell--filled");
          }
          this.boardEl.insertBefore(el, this.svgEl);
          this.cellEls.push(el);
        }
      }
      this.updateProgress();
    },

    getCellAt(x, y) {
      const rect = this.boardEl.getBoundingClientRect();
      const pad = 8;
      const gap = 3;
      const cp = this.cellPx;
      const step = cp + gap;
      const col = Math.floor((x - rect.left - pad) / step);
      const row = Math.floor((y - rect.top - pad) / step);
      if (row < 0 || row >= OF_SIZE || col < 0 || col >= OF_SIZE) return null;
      return [row, col];
    },

    getCellEl(r, c) {
      return this.cellEls[r * OF_SIZE + c] || null;
    },

    cellCenter(r, c) {
      const pad = 8, gap = 3, cp = this.cellPx;
      const step = cp + gap;
      return { x: pad + c * step + cp / 2, y: pad + r * step + cp / 2 };
    },

    addLineSeg(fromR, fromC, toR, toC) {
      const from = this.cellCenter(fromR, fromC);
      const to = this.cellCenter(toR, toC);
      const ns = "http://www.w3.org/2000/svg";
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", from.x);
      line.setAttribute("y1", from.y);
      line.setAttribute("x2", to.x);
      line.setAttribute("y2", to.y);
      this.svgEl.appendChild(line);
    },

    removeLastLine() {
      const last = this.svgEl.lastElementChild;
      if (last) last.remove();
    },

    isAdjacent(a, b) {
      return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
    },

    tryExtend(r, c) {
      const path = this.state.currentPath;
      const last = path[path.length - 1];

      // Backtrack: moving onto the second-to-last cell
      if (path.length >= 2) {
        const prev = path[path.length - 2];
        if (r === prev[0] && c === prev[1]) {
          const popped = path.pop();
          this.state.grid[popped[0]][popped[1]] = 0;
          const el = this.getCellEl(popped[0], popped[1]);
          if (el) { el.classList.remove("onefill-cell--filled", "onefill-cell--start"); }
          this.removeLastLine();
          this.updateProgress();
          return;
        }
      }

      // Extend: target must be empty and adjacent to last
      if (this.state.grid[r][c] !== 0) return;
      if (!this.isAdjacent(last, [r, c])) return;

      path.push([r, c]);
      this.state.grid[r][c] = 2;
      const el = this.getCellEl(r, c);
      if (el) el.classList.add("onefill-cell--filled");
      this.addLineSeg(last[0], last[1], r, c);
      this.updateProgress();

      if (path.length === this.state.nonObstacleCount) {
        this.onWin();
      }
    },

    updateProgress() {
      const prog = document.getElementById("onefill-progress");
      const tot = document.getElementById("onefill-total");
      if (prog) prog.textContent = String(this.state.currentPath.length);
      if (tot) tot.textContent = String(this.state.nonObstacleCount);
    },

    onPointerDown(e) {
      if (this.state.won) return;
      const pos = this.getCellAt(e.clientX, e.clientY);
      if (!pos) return;
      const path = this.state.currentPath;
      const last = path[path.length - 1];
      // Can only start drawing from the last cell in the path
      if (pos[0] !== last[0] || pos[1] !== last[1]) return;
      this.state.drawing = true;
      try { this.boardEl.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
    },

    onPointerMove(e) {
      if (!this.state.drawing || this.state.won) return;
      const pos = this.getCellAt(e.clientX, e.clientY);
      if (!pos) return;
      const last = this.state.currentPath[this.state.currentPath.length - 1];
      if (pos[0] === last[0] && pos[1] === last[1]) return;
      this.tryExtend(pos[0], pos[1]);
    },

    onPointerUp() {
      this.state.drawing = false;
    },

    onWin() {
      this.state.won = true;
      this.state.drawing = false;
      this.svgEl.classList.add("win-glow");
      setTimeout(() => {
        this.state.completed += 1;
        onefillStore.setInt("completedCount", this.state.completed);
        this.els.completedCount.textContent = String(this.state.completed);
        this.els.winTotal.textContent = String(this.state.completed);
        showModal(this.els.winModal);
      }, 800);
    },

    newPuzzle() {
      this.svgEl.classList.remove("win-glow");
      const puzzle = ofPickPuzzle(this.state.difficulty);
      this.buildGrid(puzzle);
      this.sizeBoard();
      this.renderBoard();
      this.updateHeader();
    },

    resetPuzzle() {
      this.svgEl.classList.remove("win-glow");
      const puzzle = ofPickPuzzle(this.state.difficulty);
      // Reuse current puzzle by re-building from scratch with same data
      // Actually we want to reset the CURRENT puzzle. Store original puzzle data.
      if (this._currentPuzzle) {
        this.buildGrid(this._currentPuzzle);
        this.renderBoard();
        this.updateProgress();
      }
    },

    updateHeader() {
      this.els.completedCount.textContent = String(this.state.completed);
      this.els.difficultyLabel.textContent = DIFFICULTIES[this.state.difficulty] || "Moderate";
    },
  };

  modules.onefill = {
    _wired: false,
    _ptrDown: null, _ptrMove: null, _ptrUp: null,

    onEnter() {
      onefill.boardEl = document.getElementById("onefill-board");
      onefill.svgEl = document.getElementById("onefill-svg");
      onefill.els = {
        completedCount: document.getElementById("onefill-completed-count"),
        difficultyLabel: document.getElementById("onefill-difficulty-label"),
        winModal: document.getElementById("onefill-win-modal"),
        winTotal: document.getElementById("onefill-win-total"),
        settingsModal: document.getElementById("onefill-settings-modal"),
      };

      onefill.state.completed = onefillStore.getInt("completedCount", 0);
      onefill.state.difficulty = onefillStore.getString("difficulty", "moderate", DIFFICULTIES);

      if (!this._wired) {
        this._wired = true;
        wireModal(onefill.els.settingsModal);
        wireModal(onefill.els.winModal);

        document.getElementById("onefill-settings-btn").addEventListener("click", () => {
          const m = onefill.els.settingsModal;
          m.querySelectorAll('input[name="onefill-difficulty"]').forEach((r) => { r.checked = r.value === onefill.state.difficulty; });
          showModal(m);
        });

        onefill.els.settingsModal.querySelectorAll('input[name="onefill-difficulty"]').forEach((r) => r.addEventListener("change", (e) => {
          if (!DIFFICULTIES[e.target.value] || e.target.value === onefill.state.difficulty) return;
          onefill.state.difficulty = e.target.value;
          onefillStore.setString("difficulty", e.target.value);
          onefill.newPuzzle();
        }));

        document.getElementById("onefill-new-btn").addEventListener("click", () => {
          hideModal(onefill.els.winModal);
          onefill.newPuzzle();
        });
        document.getElementById("onefill-reset-btn").addEventListener("click", () => {
          onefill.resetPuzzle();
        });
        document.getElementById("onefill-next-btn").addEventListener("click", () => {
          hideModal(onefill.els.winModal);
          onefill.newPuzzle();
        });
        document.getElementById("onefill-reset-count-btn").addEventListener("click", () => {
          if (!window.confirm("Reset the number of completed puzzles back to 0?")) return;
          onefill.state.completed = 0; onefillStore.setInt("completedCount", 0);
          onefill.els.completedCount.textContent = "0";
        });
        document.getElementById("onefill-tutorial-btn").addEventListener("click", () => {
          onefillStore.setBool("tutorialSeen", true);
          hideModal(document.getElementById("onefill-tutorial-modal"));
        });

        this._ptrDown = (e) => onefill.onPointerDown(e);
        this._ptrMove = (e) => onefill.onPointerMove(e);
        this._ptrUp = () => onefill.onPointerUp();
        onefill.boardEl.addEventListener("pointerdown", this._ptrDown);
        onefill.boardEl.addEventListener("pointermove", this._ptrMove);
        onefill.boardEl.addEventListener("pointerup", this._ptrUp);
        onefill.boardEl.addEventListener("pointercancel", this._ptrUp);

        window.addEventListener("resize", () => {
          if (router.current !== "onefill") return;
          onefill.sizeBoard();
        });
      }

      // Fix: store puzzle reference for reset
      const puzzle = ofPickPuzzle(onefill.state.difficulty);
      onefill._currentPuzzle = puzzle;
      onefill.buildGrid(puzzle);
      onefill.sizeBoard();
      onefill.renderBoard();
      onefill.updateHeader();

      // Override newPuzzle to also store the reference
      const origNew = onefill.newPuzzle.bind(onefill);
      onefill.newPuzzle = function () {
        this.svgEl.classList.remove("win-glow");
        const p = ofPickPuzzle(this.state.difficulty);
        this._currentPuzzle = p;
        this.buildGrid(p);
        this.sizeBoard();
        this.renderBoard();
        this.updateHeader();
      };

      if (!onefillStore.getBool("tutorialSeen")) {
        showModal(document.getElementById("onefill-tutorial-modal"));
      }
    },

    onLeave() {
      onefill.state.drawing = false;
      hideModal(onefill.els.winModal);
      hideModal(onefill.els.settingsModal);
      hideModal(document.getElementById("onefill-tutorial-modal"));
    },
  };

  // ================================================================
  // 17. INIT & LOCALSTORAGE MIGRATION
  // ================================================================
  function migrateStorage() {
    try {
      const ver = parseInt(localStorage.getItem("puzzle.version") || "1", 10);
      if (ver < 2) {
        const map = [
          ["puzzle.completedCount", "slider.completedCount"],
          ["puzzle.difficulty", "slider.difficulty"],
          ["puzzle.blockStyle", "slider.blockStyle"],
          ["puzzle.tutorialSeen", "slider.tutorialSeen"],
        ];
        for (const [oldK, newK] of map) {
          if (localStorage.getItem(newK) === null) {
            const v = localStorage.getItem(oldK);
            if (v !== null) localStorage.setItem(newK, v);
          }
        }
        localStorage.setItem("puzzle.version", "2");
      }
    } catch { /* ignore */ }
  }

  function init() {
    migrateStorage();
    router.show("title");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
