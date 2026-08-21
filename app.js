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
  // ================================================================
  // 17. SOCCER CHALLENGE — Turn-based 5v5 soccer
  // ================================================================
  const soccerStore = makeStore("soccer");

  // Host nations first, then all others A-Z by name.
  const TEAMS = [
    {code:"USA",name:"USA",p:"#002868",s:"#bf0a30",host:true},
    {code:"MEX",name:"Mexico",p:"#006847",s:"#ce1126",host:true},
    {code:"CAN",name:"Canada",p:"#ff0000",s:"#ffffff",host:true},
    {code:"ARG",name:"Argentina",p:"#75aadb",s:"#ffffff"},
    {code:"AUS",name:"Australia",p:"#00843d",s:"#ffcd00"},
    {code:"AUT",name:"Austria",p:"#ed2939",s:"#ffffff"},
    {code:"BEL",name:"Belgium",p:"#ed2939",s:"#fae042"},
    {code:"BOL",name:"Bolivia",p:"#007a33",s:"#f4e400"},
    {code:"BRA",name:"Brazil",p:"#f4e500",s:"#009739"},
    {code:"CMR",name:"Cameroon",p:"#007a5e",s:"#ce1126"},
    {code:"CHI",name:"Chile",p:"#d52b1e",s:"#ffffff"},
    {code:"COL",name:"Colombia",p:"#fcd116",s:"#003893"},
    {code:"CRC",name:"Costa Rica",p:"#d21034",s:"#ffffff"},
    {code:"CRO",name:"Croatia",p:"#ff0000",s:"#ffffff"},
    {code:"DEN",name:"Denmark",p:"#c60c30",s:"#ffffff"},
    {code:"ECU",name:"Ecuador",p:"#ffd100",s:"#003da5"},
    {code:"EGY",name:"Egypt",p:"#c8102e",s:"#ffffff"},
    {code:"ENG",name:"England",p:"#ffffff",s:"#cf081f"},
    {code:"FRA",name:"France",p:"#002395",s:"#ffffff"},
    {code:"GER",name:"Germany",p:"#ffffff",s:"#000000"},
    {code:"GHA",name:"Ghana",p:"#ffffff",s:"#006b3f"},
    {code:"HON",name:"Honduras",p:"#0051ab",s:"#ffffff"},
    {code:"IRN",name:"Iran",p:"#ffffff",s:"#da0000"},
    {code:"IRQ",name:"Iraq",p:"#007a3d",s:"#ffffff"},
    {code:"ITA",name:"Italy",p:"#0066cc",s:"#ffffff"},
    {code:"CIV",name:"Ivory Coast",p:"#ff8200",s:"#009e60"},
    {code:"JAM",name:"Jamaica",p:"#009b3a",s:"#fed100"},
    {code:"JPN",name:"Japan",p:"#000080",s:"#ffffff"},
    {code:"MAR",name:"Morocco",p:"#c1272d",s:"#006233"},
    {code:"NED",name:"Netherlands",p:"#ff6600",s:"#ffffff"},
    {code:"NZL",name:"New Zealand",p:"#000000",s:"#ffffff"},
    {code:"NGA",name:"Nigeria",p:"#008751",s:"#ffffff"},
    {code:"PAR",name:"Paraguay",p:"#d52b1e",s:"#0038a8"},
    {code:"POR",name:"Portugal",p:"#006600",s:"#ff0000"},
    {code:"QAT",name:"Qatar",p:"#8b1a2b",s:"#ffffff"},
    {code:"RSA",name:"S. Africa",p:"#007749",s:"#ffb81c"},
    {code:"KOR",name:"S. Korea",p:"#cd2e3a",s:"#0047a0"},
    {code:"KSA",name:"Saudi Arabia",p:"#006c35",s:"#ffffff"},
    {code:"SCO",name:"Scotland",p:"#003399",s:"#ffffff"},
    {code:"SEN",name:"Senegal",p:"#009639",s:"#fdef42"},
    {code:"SRB",name:"Serbia",p:"#c6363c",s:"#0c4076"},
    {code:"ESP",name:"Spain",p:"#aa151b",s:"#f1bf00"},
    {code:"SUI",name:"Switzerland",p:"#ff0000",s:"#ffffff"},
    {code:"TUN",name:"Tunisia",p:"#e70013",s:"#ffffff"},
    {code:"TUR",name:"Turkey",p:"#e30a17",s:"#ffffff"},
    {code:"UKR",name:"Ukraine",p:"#005bbb",s:"#ffd500"},
    {code:"URU",name:"Uruguay",p:"#5cbfeb",s:"#ffffff"},
    {code:"UZB",name:"Uzbekistan",p:"#0099cc",s:"#ffffff"},
  ];

  // Player positions as fractions of pitch width/height.
  // Defined for Team A (bottom half, attacks upward toward top goal).
  // Team B is mirrored vertically.
  // ny=0 is the top edge, ny=1 is the bottom edge.
  const FORMATION = [
    { label: "GK", nx: 0.50, ny: 0.92 },  // right in front of own goal
    { label: "D1", nx: 0.30, ny: 0.78 },  // left defender
    { label: "D2", nx: 0.70, ny: 0.78 },  // right defender
    { label: "A1", nx: 0.20, ny: 0.58 },  // left attacker
    { label: "A2", nx: 0.50, ny: 0.58 },  // center attacker
    { label: "A3", nx: 0.80, ny: 0.58 },  // right attacker
  ];

  // ---------------------------------------------------------------
  // Soccer Pool — physics-based billiards soccer
  // ---------------------------------------------------------------
  const BALL_R = 8, PLAYER_R = 16, GOAL_W_FRAC = 0.40;
  const FRICTION_PLAYER = 0.948, FRICTION_BALL = 0.975;
  const RESTITUTION = 0.82, MAX_POWER = 14, SPEED_STOP = 0.15;
  const SHOTS_PER_TEAM = 5;

  const soccer = {
    canvas: null, ctx: null,
    state: {
      phase: "select", mode: "cpu",
      teamA: null, teamB: null,
      scoreA: 0, scoreB: 0,
      currentTeam: "A",
      shotsA: 0, shotsB: 0,
      bodies: [],   // all physics bodies (players + ball)
      ball: null,   // ref to ball body
      selected: -1, // index of selected player body
      aiming: false, aimX: 0, aimY: 0,
      simulating: false, completed: 0, won: false,
      message: "", messageTimer: null,
    },
    els: {},
    pitchW: 300, pitchH: 450, animId: null,

    // --- Physics helpers ---
    makeBody(x, y, r, mass, fric, team, label, isBall) {
      return { x, y, vx: 0, vy: 0, r, mass, fric, team: team || null, label: label || "", isBall: !!isBall };
    },
    allStopped() {
      for (const b of this.state.bodies) if (Math.abs(b.vx) > SPEED_STOP || Math.abs(b.vy) > SPEED_STOP) return false;
      return true;
    },
    stopAll() { for (const b of this.state.bodies) { b.vx = 0; b.vy = 0; } },

    collideCircles(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minD = a.r + b.r;
      if (dist >= minD || dist === 0) return;
      const nx = dx / dist, ny = dy / dist;
      const overlap = minD - dist;
      const totalM = a.mass + b.mass;
      a.x -= nx * overlap * (b.mass / totalM);
      a.y -= ny * overlap * (b.mass / totalM);
      b.x += nx * overlap * (a.mass / totalM);
      b.y += ny * overlap * (a.mass / totalM);
      const dvx = a.vx - b.vx, dvy = a.vy - b.vy;
      const dvDotN = dvx * nx + dvy * ny;
      if (dvDotN <= 0) return;
      const j = (1 + RESTITUTION) * dvDotN / totalM;
      a.vx -= j * b.mass * nx; a.vy -= j * b.mass * ny;
      b.vx += j * a.mass * nx; b.vy += j * a.mass * ny;
    },

    wallBounce(b) {
      const w = this.pitchW, h = this.pitchH;
      const gw = w * GOAL_W_FRAC, gLeft = (w - gw) / 2, gRight = gLeft + gw;
      if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.8; }
      if (b.x + b.r > w) { b.x = w - b.r; b.vx = -Math.abs(b.vx) * 0.8; }
      if (b.y - b.r < 0) {
        if (b.isBall && b.x > gLeft && b.x < gRight) return "goalTop";
        b.y = b.r; b.vy = Math.abs(b.vy) * 0.8;
      }
      if (b.y + b.r > h) {
        if (b.isBall && b.x > gLeft && b.x < gRight) return "goalBot";
        b.y = h - b.r; b.vy = -Math.abs(b.vy) * 0.8;
      }
      return null;
    },

    stepPhysics() {
      const bodies = this.state.bodies;
      for (const b of bodies) {
        b.vx *= b.fric; b.vy *= b.fric;
        b.x += b.vx; b.y += b.vy;
        if (Math.abs(b.vx) < SPEED_STOP * 0.5 && Math.abs(b.vy) < SPEED_STOP * 0.5) { b.vx = 0; b.vy = 0; }
      }
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          this.collideCircles(bodies[i], bodies[j]);
        }
      }
      let goal = null;
      for (const b of bodies) {
        const g = this.wallBounce(b);
        if (g) goal = g;
      }
      return goal;
    },

    sizeCanvas() {
      const wrap = document.getElementById("soccer-canvas-wrap");
      const r = wrap.getBoundingClientRect();
      const maxW = r.width - 16, maxH = r.height - 16;
      const aspect = 2 / 3;
      let w = Math.min(maxW, maxH * aspect);
      let h = w / aspect;
      if (h > maxH) { h = maxH; w = h * aspect; }
      w = Math.floor(w); h = Math.floor(h);
      this.pitchW = w; this.pitchH = h;
      this.playerR = Math.max(12, Math.min(22, w * 0.055));
      this.canvas.width = w; this.canvas.height = h;
      this.canvas.style.width = w + "px"; this.canvas.style.height = h + "px";
    },

    buildBodies() {
      const w = this.pitchW, h = this.pitchH, bodies = [];
      for (let i = 0; i < 6; i++) {
        const f = FORMATION[i];
        bodies.push(this.makeBody(f.nx * w, f.ny * h, PLAYER_R, 1.0, FRICTION_PLAYER, "A", f.label));
      }
      for (let i = 0; i < 6; i++) {
        const f = FORMATION[i];
        bodies.push(this.makeBody(f.nx * w, (1 - f.ny) * h, PLAYER_R, 1.0, FRICTION_PLAYER, "B", f.label));
      }
      const ball = this.makeBody(w / 2, h / 2, BALL_R, 0.5, FRICTION_BALL, null, "ball", true);
      bodies.push(ball);
      this.state.bodies = bodies;
      this.state.ball = ball;
    },

    drawPitch() {
      const ctx = this.ctx, w = this.pitchW, h = this.pitchH;
      ctx.fillStyle = "#2d6e3a"; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1.5;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      ctx.beginPath(); ctx.moveTo(4, h / 2); ctx.lineTo(w - 4, h / 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(w / 2, h / 2, h * 0.08, 0, Math.PI * 2); ctx.stroke();
      const gw = w * GOAL_W_FRAC, gLeft = (w - gw) / 2, gRight = gLeft + gw;
      const ph = h * 0.10;
      ctx.strokeRect((w - gw - 20) / 2, 4, gw + 20, ph);
      ctx.strokeRect((w - gw - 20) / 2, h - 4 - ph, gw + 20, ph);
      // Goal openings
      ctx.fillStyle = "#fff";
      ctx.fillRect(gLeft, 0, gw, 5);
      ctx.fillRect(gLeft, h - 5, gw, 5);
      // Goal nets
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(gLeft, 0, gw, -15);
      ctx.fillRect(gLeft, h, gw, 15);
      // Side wall emphasis
      ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(1, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w - 1, 0); ctx.lineTo(w - 1, h); ctx.stroke();
    },

    drawBodies() {
      const ctx = this.ctx, s = this.state;
      const tA = s.teamA, tB = s.teamB;
      for (let i = 0; i < s.bodies.length; i++) {
        const b = s.bodies[i];
        if (b.isBall) continue;
        const team = b.team === "A" ? tA : tB;
        const isSelected = i === s.selected;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = team.p; ctx.fill();
        ctx.strokeStyle = team.s; ctx.lineWidth = 2.5; ctx.stroke();
        if (isSelected) {
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 5, 0, Math.PI * 2);
          ctx.strokeStyle = "#ffd700"; ctx.lineWidth = 3; ctx.stroke();
        }
        ctx.fillStyle = this.contrastText(team.p);
        ctx.font = "bold " + Math.round(b.r * 0.65) + "px system-ui";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(b.label, b.x, b.y + 1);
      }
      // Ball
      const ball = s.ball;
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fillStyle = "#fff"; ctx.fill();
      ctx.strokeStyle = "#333"; ctx.lineWidth = 1; ctx.stroke();
    },

    drawAimLine() {
      const s = this.state;
      if (!s.aiming || s.selected < 0) return;
      const p = s.bodies[s.selected];
      const dx = p.x - s.aimX, dy = p.y - s.aimY;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 5) return;
      const power = Math.min(len, MAX_POWER * 12);
      const nx = dx / len, ny = dy / len;
      const endX = p.x + nx * power, endY = p.y + ny * power;
      const ctx = this.ctx;
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "rgba(255,255,200,0.7)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(endX, endY); ctx.stroke();
      ctx.setLineDash([]);
      // Arrow head
      const aLen = 8, aAng = 0.4;
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - aLen * Math.cos(Math.atan2(ny, nx) - aAng), endY - aLen * Math.sin(Math.atan2(ny, nx) - aAng));
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - aLen * Math.cos(Math.atan2(ny, nx) + aAng), endY - aLen * Math.sin(Math.atan2(ny, nx) + aAng));
      ctx.stroke();
    },

    drawMessage() {
      if (!this.state.message) return;
      const ctx = this.ctx, w = this.pitchW, h = this.pitchH;
      const fontSize = Math.round(w * 0.055);
      ctx.font = "bold " + fontSize + "px system-ui";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const maxW = w - 20;
      const words = this.state.message.split(" ");
      const lines = []; let line = "";
      for (const word of words) {
        const test = line ? line + " " + word : word;
        if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
        else line = test;
      }
      if (line) lines.push(line);
      const lineH = fontSize * 1.3, boxH = lines.length * lineH + 16, boxY = h / 2 - boxH / 2;
      ctx.fillStyle = "rgba(0,0,0,0.65)"; ctx.fillRect(0, boxY, w, boxH);
      ctx.fillStyle = "#fff";
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], w / 2, boxY + 8 + lineH * (i + 0.5));
    },

    draw() {
      this.ctx.clearRect(0, 0, this.pitchW, this.pitchH);
      this.drawPitch();
      this.drawBodies();
      this.drawAimLine();
      this.drawMessage();
    },

    contrastText(hex) {
      const c = parseInt(hex.replace("#", ""), 16);
      const r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
      return (r * 0.299 + g * 0.587 + b * 0.114) > 150 ? "#111" : "#fff";
    },

    updateScore() {
      const s = this.state;
      if (!s.teamA || !s.teamB) return;
      document.getElementById("soccer-score").textContent =
        s.teamA.code + " " + s.scoreA + " - " + s.scoreB + " " + s.teamB.code;
      const info = document.getElementById("soccer-info");
      const shotsLeft = SHOTS_PER_TEAM - (s.currentTeam === "A" ? s.shotsA : s.shotsB);
      info.textContent = s.currentTeam === "A"
        ? s.teamA.code + "'s shot (" + shotsLeft + " left)"
        : s.teamB.code + "'s shot (" + shotsLeft + " left)";
    },

    showMessage(msg, ms) {
      this.state.message = msg; this.draw();
      if (this.state.messageTimer) clearTimeout(this.state.messageTimer);
      this.state.messageTimer = setTimeout(() => { this.state.message = ""; this.draw(); }, ms || 1200);
    },

    startMatch() {
      const s = this.state;
      s.scoreA = 0; s.scoreB = 0; s.shotsA = 0; s.shotsB = 0;
      s.currentTeam = "A"; s.won = false; s.simulating = false;
      s.selected = -1; s.aiming = false;
      document.getElementById("soccer-team-select").hidden = true;
      document.getElementById("soccer-canvas-wrap").hidden = false;
      document.getElementById("soccer-info").hidden = false;
      this.sizeCanvas();
      this.buildBodies();
      this.updateScore();
      this.draw();
      this.showMessage("Tap a player, drag to aim, release to shoot!", 2500);
    },

    // --- Simulation loop ---
    simLoop() {
      if (!this.state.simulating) return;
      const goal = this.stepPhysics();
      this.draw();
      if (goal) {
        this.stopAll();
        this.state.simulating = false;
        if (goal === "goalTop") { this.state.scoreA++; this.showMessage("GOAL!", 1200); }
        else { this.state.scoreB++; this.showMessage("GOAL!", 1200); }
        this.updateScore();
        // Reset all players and ball to starting positions
        this.buildBodies();
        setTimeout(() => this.nextTurn(), 1400);
        return;
      }
      if (this.allStopped()) {
        this.state.simulating = false;
        this.nextTurn();
        return;
      }
      this.animId = requestAnimationFrame(() => this.simLoop());
    },

    nextTurn() {
      const s = this.state;
      s.selected = -1;
      // Check match end
      if (s.shotsA >= SHOTS_PER_TEAM && s.shotsB >= SHOTS_PER_TEAM) {
        this.endMatch(); return;
      }
      // Switch teams
      if (s.currentTeam === "A") {
        if (s.shotsB < SHOTS_PER_TEAM) s.currentTeam = "B";
        else if (s.shotsA < SHOTS_PER_TEAM) { /* stay A */ }
        else { this.endMatch(); return; }
      } else {
        if (s.shotsA < SHOTS_PER_TEAM) s.currentTeam = "A";
        else if (s.shotsB < SHOTS_PER_TEAM) { /* stay B */ }
        else { this.endMatch(); return; }
      }
      this.updateScore();
      this.draw();
      if (s.mode === "cpu" && s.currentTeam === "B") {
        setTimeout(() => this.cpuShoot(), 600);
      }
    },

    endMatch() {
      const s = this.state;
      s.won = true; s.completed++;
      soccerStore.setInt("completedCount", s.completed);
      document.getElementById("soccer-completed-count").textContent = String(s.completed);
      const result = s.scoreA > s.scoreB ? s.teamA.code + " wins!" :
                     s.scoreB > s.scoreA ? s.teamB.code + " wins!" : "Draw!";
      document.getElementById("soccer-end-title").textContent = result;
      document.getElementById("soccer-end-score").textContent =
        s.teamA.code + "  " + s.scoreA + " - " + s.scoreB + "  " + s.teamB.code;
      document.getElementById("soccer-end-total").textContent = String(s.completed);
      showModal(document.getElementById("soccer-end-modal"));
    },

    // --- CPU AI ---
    cpuShoot() {
      const s = this.state;
      if (s.simulating || s.won) return;
      const ball = s.ball;
      const goalY = this.pitchH; // CPU (team B) attacks bottom goal
      const goalX = this.pitchW / 2;
      // Pick the player closest to the ball
      let bestIdx = -1, bestDist = Infinity;
      for (let i = 0; i < s.bodies.length; i++) {
        const b = s.bodies[i];
        if (b.team !== "B") continue;
        const d = Math.sqrt((b.x - ball.x) ** 2 + (b.y - ball.y) ** 2);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      if (bestIdx < 0) return;
      const player = s.bodies[bestIdx];
      // Aim: player → ball direction, extended toward goal
      let dx = ball.x - player.x, dy = ball.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) { dx /= dist; dy /= dist; }
      // Add random error
      const err = (Math.random() - 0.5) * 0.35;
      const cos = Math.cos(err), sin = Math.sin(err);
      const ndx = dx * cos - dy * sin, ndy = dx * sin + dy * cos;
      const power = MAX_POWER * (0.7 + Math.random() * 0.3);
      player.vx = ndx * power; player.vy = ndy * power;
      s.shotsB++;
      s.simulating = true;
      this.updateScore();
      this.simLoop();
    },

    // --- Input handlers ---
    onCanvasDown(e) {
      const s = this.state;
      if (s.simulating || s.won) return;
      if (s.mode === "cpu" && s.currentTeam === "B") return;
      const rect = this.canvas.getBoundingClientRect();
      const tx = (e.clientX - rect.left) * (this.pitchW / rect.width);
      const ty = (e.clientY - rect.top) * (this.pitchH / rect.height);
      // Hit test own players
      for (let i = 0; i < s.bodies.length; i++) {
        const b = s.bodies[i];
        if (b.team !== s.currentTeam) continue;
        const dx = tx - b.x, dy = ty - b.y;
        if (dx * dx + dy * dy < (b.r + 8) * (b.r + 8)) {
          s.selected = i; s.aiming = true; s.aimX = tx; s.aimY = ty;
          this.draw();
          try { this.canvas.setPointerCapture(e.pointerId); } catch {}
          e.preventDefault();
          return;
        }
      }
    },

    onCanvasMove(e) {
      const s = this.state;
      if (!s.aiming) return;
      const rect = this.canvas.getBoundingClientRect();
      s.aimX = (e.clientX - rect.left) * (this.pitchW / rect.width);
      s.aimY = (e.clientY - rect.top) * (this.pitchH / rect.height);
      this.draw();
    },

    onCanvasUp(e) {
      const s = this.state;
      if (!s.aiming || s.selected < 0) return;
      const p = s.bodies[s.selected];
      const dx = p.x - s.aimX, dy = p.y - s.aimY;
      const len = Math.sqrt(dx * dx + dy * dy);
      s.aiming = false;
      if (len < 10) { s.selected = -1; this.draw(); return; }
      const power = Math.min(len / 12, MAX_POWER);
      p.vx = (dx / len) * power; p.vy = (dy / len) * power;
      if (s.currentTeam === "A") s.shotsA++; else s.shotsB++;
      s.simulating = true;
      this.updateScore();
      this.simLoop();
    },

    // --- Team selection (kept from old version) ---
    showTeamSelect() {
      const s = this.state;
      s.phase = "select";
      document.getElementById("soccer-team-select").hidden = false;
      document.getElementById("soccer-canvas-wrap").hidden = true;
      document.getElementById("soccer-info").hidden = true;
      document.getElementById("soccer-start-btn").hidden = true;
      document.getElementById("soccer-score").textContent = "";
      document.getElementById("soccer-matchup").hidden = true;
      this.renderBadges();
    },

    renderBadges() {
      const el = document.getElementById("soccer-badges");
      el.innerHTML = "";
      for (const t of TEAMS) {
        const badge = document.createElement("div");
        badge.className = "soccer-badge";
        badge.dataset.code = t.code;
        badge.innerHTML =
          "<div class='soccer-badge-circle' style='background:" + t.p + ";border-color:" + t.s + ";color:" + this.contrastText(t.p) + "'>" + t.code + "</div>" +
          "<span class='soccer-badge-name'>" + t.name + "</span>";
        badge.addEventListener("click", () => this.onBadgeClick(t));
        el.appendChild(badge);
      }
    },

    onBadgeClick(team) {
      const s = this.state;
      if (s.mode === "cpu") {
        if (s.pickingOpponent) {
          // Phase 2: picking opponent
          if (team.code === s.teamA.code) return;
          s.teamB = team;
          s.pickingOpponent = false;
          document.querySelectorAll(".soccer-badge").forEach((b) => {
            b.classList.remove("selected-cpu");
            if (b.dataset.code === team.code) b.classList.add("selected-cpu");
          });
          document.getElementById("soccer-opp-choice").hidden = true;
          this.updateMatchup();
          document.getElementById("soccer-start-btn").hidden = false;
        } else {
          // Phase 1: picking own team
          s.teamA = team; s.teamB = null; s.pickingOpponent = false;
          document.querySelectorAll(".soccer-badge").forEach((b) => {
            b.classList.remove("selected", "selected-cpu");
            if (b.dataset.code === team.code) b.classList.add("selected");
          });
          document.querySelector(".soccer-select-title").textContent =
            team.code + " selected";
          document.getElementById("soccer-opp-choice").hidden = false;
          document.getElementById("soccer-start-btn").hidden = true;
          document.getElementById("soccer-matchup").hidden = true;
        }
      } else {
        // Friend mode: unchanged
        if (!s.teamA || s.teamB) {
          s.teamA = team; s.teamB = null;
          document.querySelectorAll(".soccer-badge").forEach((b) => {
            b.classList.remove("selected", "selected-cpu");
            if (b.dataset.code === team.code) b.classList.add("selected");
          });
          document.querySelector(".soccer-select-title").textContent =
            team.code + " selected — Player 2, pick your team!";
          document.getElementById("soccer-start-btn").hidden = true;
          document.getElementById("soccer-matchup").hidden = true;
        } else if (!s.teamB && team.code !== s.teamA.code) {
          s.teamB = team;
          document.querySelectorAll(".soccer-badge").forEach((b) => {
            if (b.dataset.code === team.code) b.classList.add("selected-cpu");
          });
          this.updateMatchup();
          document.getElementById("soccer-start-btn").hidden = false;
        }
      }
    },

    pickRandomOpponent() {
      const s = this.state;
      if (!s.teamA) return;
      let opp;
      do { opp = TEAMS[Math.floor(Math.random() * TEAMS.length)]; } while (opp.code === s.teamA.code || opp.p === s.teamA.p);
      s.teamB = opp; s.pickingOpponent = false;
      document.querySelectorAll(".soccer-badge").forEach((b) => {
        b.classList.remove("selected-cpu");
        if (b.dataset.code === opp.code) b.classList.add("selected-cpu");
      });
      document.getElementById("soccer-opp-choice").hidden = true;
      this.updateMatchup();
      document.getElementById("soccer-start-btn").hidden = false;
    },

    startPickingOpponent() {
      this.state.pickingOpponent = true;
      this.state.teamB = null;
      document.querySelectorAll(".soccer-badge").forEach((b) => b.classList.remove("selected-cpu"));
      document.querySelector(".soccer-select-title").textContent = "Pick your opponent";
      document.getElementById("soccer-opp-choice").hidden = true;
      document.getElementById("soccer-matchup").hidden = true;
      document.getElementById("soccer-start-btn").hidden = true;
    },

    updateMatchup() {
      const s = this.state;
      if (!s.teamA || !s.teamB) return;
      const mu = document.getElementById("soccer-matchup");
      mu.hidden = false;
      const bA = document.getElementById("matchup-badge-a");
      bA.style.background = s.teamA.p; bA.style.borderColor = s.teamA.s;
      bA.style.color = this.contrastText(s.teamA.p); bA.textContent = s.teamA.code;
      document.getElementById("matchup-name-a").textContent = s.teamA.name;
      const bB = document.getElementById("matchup-badge-b");
      bB.style.background = s.teamB.p; bB.style.borderColor = s.teamB.s;
      bB.style.color = this.contrastText(s.teamB.p); bB.textContent = s.teamB.code;
      document.getElementById("matchup-name-b").textContent = s.teamB.name;
      document.querySelector(".soccer-select-title").textContent = "Tap a team to change";
    },

    resetSelection() {
      this.state.teamA = null; this.state.teamB = null; this.state.pickingOpponent = false;
      document.querySelectorAll(".soccer-badge").forEach((b) => b.classList.remove("selected", "selected-cpu"));
      document.querySelector(".soccer-select-title").textContent = "Choose Your Team";
      document.getElementById("soccer-start-btn").hidden = true;
      document.getElementById("soccer-matchup").hidden = true;
      document.getElementById("soccer-opp-choice").hidden = true;
    },
  };

  modules.soccer = {
    _wired: false,

    onEnter() {
      soccer.canvas = document.getElementById("soccer-canvas");
      soccer.ctx = soccer.canvas.getContext("2d");
      soccer.state.completed = soccerStore.getInt("completedCount", 0);
      document.getElementById("soccer-completed-count").textContent = String(soccer.state.completed);

      if (!this._wired) {
        this._wired = true;

        document.getElementById("soccer-mode-cpu").addEventListener("click", () => {
          soccer.state.mode = "cpu";
          document.getElementById("soccer-mode-cpu").classList.add("active");
          document.getElementById("soccer-mode-friend").classList.remove("active");
          soccer.resetSelection();
        });
        document.getElementById("soccer-mode-friend").addEventListener("click", () => {
          soccer.state.mode = "friend";
          document.getElementById("soccer-mode-friend").classList.add("active");
          document.getElementById("soccer-mode-cpu").classList.remove("active");
          soccer.resetSelection();
        });

        document.getElementById("soccer-start-btn").addEventListener("click", () => {
          soccer.state.phase = "play";
          soccer.startMatch();
        });

        document.getElementById("soccer-random-opp").addEventListener("click", () => {
          soccer.pickRandomOpponent();
        });
        document.getElementById("soccer-pick-opp").addEventListener("click", () => {
          soccer.startPickingOpponent();
        });

        soccer.canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); soccer.onCanvasDown(e); });
        soccer.canvas.addEventListener("pointermove", (e) => { soccer.onCanvasMove(e); });
        soccer.canvas.addEventListener("pointerup", (e) => { soccer.onCanvasUp(e); });

        document.getElementById("soccer-play-again-btn").addEventListener("click", () => {
          hideModal(document.getElementById("soccer-end-modal"));
          soccer.startMatch();
        });
        document.getElementById("soccer-new-teams-btn").addEventListener("click", () => {
          hideModal(document.getElementById("soccer-end-modal"));
          soccer.resetSelection();
          soccer.showTeamSelect();
        });

        // Step-by-step tutorial navigation
        let tutStep = 0;
        const tutSteps = document.querySelectorAll(".soccer-tut-step");
        const tutPrev = document.getElementById("soccer-tut-prev");
        const tutNext = document.getElementById("soccer-tut-next");
        function showTutStep() {
          tutSteps.forEach((s, i) => { s.hidden = i !== tutStep; });
          tutPrev.hidden = tutStep === 0;
          tutNext.textContent = tutStep === tutSteps.length - 1 ? "Let's play!" : "Next →";
        }
        tutNext.addEventListener("click", () => {
          if (tutStep < tutSteps.length - 1) { tutStep++; showTutStep(); }
          else { soccerStore.setBool("tutorialSeen", true); hideModal(document.getElementById("soccer-tutorial-modal")); }
        });
        tutPrev.addEventListener("click", () => {
          if (tutStep > 0) { tutStep--; showTutStep(); }
        });

        window.addEventListener("resize", () => {
          if (router.current !== "soccer" || soccer.state.phase !== "play") return;
          soccer.sizeCanvas();
          soccer.draw();
        });
      }

      soccer.showTeamSelect();

      if (!soccerStore.getBool("tutorialSeen")) {
        showModal(document.getElementById("soccer-tutorial-modal"));
      }
    },

    onLeave() {
      soccer.state.simulating = false;
      soccer.state.won = true;
      if (soccer.animId) { cancelAnimationFrame(soccer.animId); soccer.animId = null; }
      if (soccer.state.messageTimer) clearTimeout(soccer.state.messageTimer);
      hideModal(document.getElementById("soccer-end-modal"));
      hideModal(document.getElementById("soccer-tutorial-modal"));
    },
  };

  // ================================================================
  // 18. BUBBLE BLAST — Puzzle-Bobble style match-3 shooter
  // ================================================================
  const bubbleStore = makeStore("bubble");

  const BUBBLE_COLS = 8;
  const BUBBLE_SPEED = 11;
  // Each frame's movement is broken into this many equal sub-steps, with
  // a collision check after each one, instead of one big per-frame jump.
  // Without this, a shot aimed precisely at a gap between two bubbles can
  // "tunnel" past the correct collision point (or clip a bubble a truly
  // continuous path would have missed) because BUBBLE_SPEED is a sizeable
  // fraction of a bubble's own diameter.
  const FLIGHT_SUBSTEPS = 4;
  const BUBBLE_COLORS = ["#e0455a", "#3ac7d6", "#f2c94c", "#5fd068", "#a95fe0", "#ff9f43"];
  const BUBBLE_TIERS = {
    simple: { colors: 3, rowInterval: 14000, initialRows: 4, shotsPerRow: 10 },
    moderate: { colors: 4, rowInterval: 10000, initialRows: 5, shotsPerRow: 7 },
    difficult: { colors: 5, rowInterval: 7000, initialRows: 6, shotsPerRow: 5 },
  };

  const bub = {
    canvas: null, ctx: null,
    pitchW: 300, pitchH: 460,
    cellR: 20, gridPadX: 20, gridPadY: 24, dangerY: 360,
    shooterX: 150, shooterY: 430,
    animId: null, lastFrame: 0,
    els: {},
    state: {
      difficulty: "moderate",
      grid: new Map(),   // "row,col" -> { color }
      topRow: 0,
      current: null, next: null,
      flying: null,      // { x, y, vx, vy, r, color }
      aiming: false, aimX: 0, aimY: 0,
      popParticles: [], fallParticles: [],
      nextRowTime: 0, shotsSinceRow: 0,
      completed: 0, over: false, paused: false,
      message: "", messageTimer: null,
    },

    // --- Setup ---
    initCanvas() {
      this.canvas = document.getElementById("bubble-canvas");
      this.ctx = this.canvas.getContext("2d");
      this.sizeCanvas();
    },

    sizeCanvas() {
      const wrap = this.canvas.parentElement;
      const rect = wrap.getBoundingClientRect();
      const maxW = rect.width - 8, maxH = rect.height - 8;
      const aspect = 0.62; // width / height (portrait)
      let w = maxW, h = maxH;
      if (w / h > aspect) w = h * aspect; else h = w / aspect;
      w = Math.floor(w); h = Math.floor(h);
      this.pitchW = w; this.pitchH = h;
      this.canvas.width = w; this.canvas.height = h;
      this.canvas.style.width = w + "px"; this.canvas.style.height = h + "px";
      this.cellR = w / (BUBBLE_COLS * 2 + 1);
      this.gridPadX = this.cellR;
      this.gridPadY = this.cellR + 4;
      this.dangerY = h * 0.78;
      this.shooterX = w / 2;
      this.shooterY = h - this.cellR * 1.5;
    },

    randomColor() {
      const tier = BUBBLE_TIERS[this.state.difficulty] || BUBBLE_TIERS.moderate;
      return BUBBLE_COLORS[Math.floor(Math.random() * tier.colors)];
    },

    newBoard() {
      const s = this.state;
      const tier = BUBBLE_TIERS[s.difficulty] || BUBBLE_TIERS.moderate;
      s.grid = new Map();
      s.topRow = 0;
      for (let row = 0; row < tier.initialRows; row++) {
        const isOddRow = ((row % 2) + 2) % 2 === 1;
        const maxCol = BUBBLE_COLS - (isOddRow ? 2 : 1);
        for (let c = 0; c <= maxCol; c++) {
          s.grid.set(row + "," + c, { color: this.randomColor() });
        }
      }
      s.current = { color: this.randomColor() };
      s.next = { color: this.randomColor() };
      s.flying = null;
      s.aiming = false;
      s.popParticles = []; s.fallParticles = [];
      s.over = false;
      s.nextRowTime = performance.now() + tier.rowInterval;
      s.shotsSinceRow = 0;
      this.draw();
    },

    // --- Hex grid math ---
    // Offset ("odd-r") layout: odd rows are shifted right by half a cell.
    // `row` is a stable identity that never changes once assigned; the
    // visual Y position is derived from (row - topRow), so adding a new
    // row at the top only needs to decrement topRow — no reindexing of
    // existing bubbles.
    hexToPixel(row, col) {
      const r = this.cellR;
      const rowH = r * Math.sqrt(3);
      const isOddRow = ((row % 2) + 2) % 2 === 1;
      const x = col * (r * 2) + (isOddRow ? r : 0) + r + this.gridPadX;
      const relRow = row - this.state.topRow;
      const y = relRow * rowH + r + this.gridPadY;
      return { x, y };
    },

    neighbors6(row, col) {
      const isOddRow = ((row % 2) + 2) % 2 === 1;
      if (!isOddRow) {
        return [
          [row, col - 1], [row, col + 1],
          [row - 1, col - 1], [row - 1, col],
          [row + 1, col - 1], [row + 1, col],
        ];
      }
      return [
        [row, col - 1], [row, col + 1],
        [row - 1, col], [row - 1, col + 1],
        [row + 1, col], [row + 1, col + 1],
      ];
    },

    // Returns the nearest empty column in `row` to pixel-x `x`, or -1 if
    // every column in that row is already occupied (caller must handle
    // this — never returns an occupied column).
    pixelToNearestColInRow(row, x) {
      const isOddRow = ((row % 2) + 2) % 2 === 1;
      const r = this.cellR;
      const maxCol = BUBBLE_COLS - (isOddRow ? 2 : 1);
      let col = Math.round((x - (isOddRow ? r : 0) - r - this.gridPadX) / (r * 2));
      col = Math.max(0, Math.min(maxCol, col));
      if (!this.state.grid.has(row + "," + col)) return col;
      for (let d = 1; d <= BUBBLE_COLS; d++) {
        const left = col - d, right = col + d;
        if (left >= 0 && !this.state.grid.has(row + "," + left)) return left;
        if (right <= maxCol && !this.state.grid.has(row + "," + right)) return right;
      }
      return -1;
    },

    // --- Aiming ---
    getCanvasPoint(e) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (this.pitchW / rect.width),
        y: (e.clientY - rect.top) * (this.pitchH / rect.height),
      };
    },

    computeAimDir() {
      const s = this.state;
      let dx = s.aimX - this.shooterX, dy = s.aimY - this.shooterY;
      let len = Math.hypot(dx, dy) || 1;
      let nx = dx / len, ny = dy / len;
      const minUp = 0.15; // clamp so the shot always points at least slightly upward
      if (ny > -minUp) {
        ny = -minUp;
        const sign = nx >= 0 ? 1 : -1;
        nx = sign * Math.sqrt(Math.max(0, 1 - ny * ny));
      }
      return { nx, ny };
    },

    onCanvasDown(e) {
      const s = this.state;
      if (s.over || s.paused || s.flying) return;
      const p = this.getCanvasPoint(e);
      s.aiming = true; s.aimX = p.x; s.aimY = p.y;
      try { this.canvas.setPointerCapture(e.pointerId); } catch {}
    },

    onCanvasMove(e) {
      const s = this.state;
      if (!s.aiming) return;
      const p = this.getCanvasPoint(e);
      s.aimX = p.x; s.aimY = p.y;
    },

    onCanvasUp() {
      const s = this.state;
      if (!s.aiming) return;
      s.aiming = false;
      if (s.over || s.paused || s.flying) return;
      this.fireShot();
    },

    fireShot() {
      const s = this.state;
      const dir = this.computeAimDir();
      s.flying = {
        x: this.shooterX, y: this.shooterY,
        vx: dir.nx * BUBBLE_SPEED, vy: dir.ny * BUBBLE_SPEED,
        r: this.cellR - 1, color: s.current.color,
      };
      s.current = s.next;
      s.next = { color: this.randomColor() };
      s.shotsSinceRow++;
    },

    // --- Flight & collision ---
    // Moves the flying bubble in FLIGHT_SUBSTEPS smaller increments,
    // checking collision after each one. f.vx/f.vy are re-read fresh on
    // every sub-step (not cached before the loop) so a wall bounce that
    // happens mid-frame is respected by the remaining sub-steps.
    stepFlight() {
      const f = this.state.flying;
      if (!f) return;
      for (let i = 0; i < FLIGHT_SUBSTEPS; i++) {
        f.x += f.vx / FLIGHT_SUBSTEPS;
        f.y += f.vy / FLIGHT_SUBSTEPS;
        if (f.x - f.r < 0) { f.x = f.r; f.vx = Math.abs(f.vx); }
        if (f.x + f.r > this.pitchW) { f.x = this.pitchW - f.r; f.vx = -Math.abs(f.vx); }
        const hit = this.checkCollision();
        if (hit) { this.attachFlying(hit); return; }
      }
    },

    // Distance at which a flying bubble is considered to have "reached"
    // an existing bubble and should attach nearby. This is intentionally
    // set to hex-neighbor spacing (2 * cellR), NOT raw visual circle-
    // overlap (~2 * (cellR-1)) — a shot aimed into the notch between two
    // touching bubbles is, BY DEFINITION, exactly one hex-neighbor-
    // distance (2*cellR) from each of them. A tighter, overlap-based
    // threshold never triggers for that shot at all: the ball just
    // sails through the notch into open space beyond instead of
    // stopping there, which is the "shots bounce off/miss real gaps"
    // bug. A small +1 buffer avoids floating-point misses exactly at
    // the boundary.
    attachDist() {
      return this.cellR * 2 + 1;
    },

    checkCollision() {
      const f = this.state.flying;
      if (!f) return null;
      // Check existing bubbles BEFORE the ceiling: with per-frame stepping
      // the flying bubble can cross the ceiling threshold in the same
      // frame it also overlaps a row-0 bubble, and attaching to the
      // bubble it actually touched is both more correct and avoids
      // relying on the (rare) fully-packed-row ceiling fallback.
      const minDist = this.attachDist();
      for (const key of this.state.grid.keys()) {
        const parts = key.split(",");
        const row = Number(parts[0]), col = Number(parts[1]);
        const p = this.hexToPixel(row, col);
        const dx = f.x - p.x, dy = f.y - p.y;
        if (dx * dx + dy * dy < minDist * minDist) return { type: "bubble", row, col };
      }
      if (f.y - f.r <= this.gridPadY) return { type: "ceiling" };
      return null;
    },

    // Find an empty column at the ceiling row for pixel-x `x`. If the
    // ceiling row is entirely full (rare, but possible on a packed
    // board), climb to a brand-new row above it — a fresh row is always
    // fully empty, so this is guaranteed to terminate.
    findCeilingSpot(x) {
      const s = this.state;
      let row = s.topRow;
      let col = this.pixelToNearestColInRow(row, x);
      while (col === -1) {
        row -= 1;
        col = this.pixelToNearestColInRow(row, x);
      }
      if (row < s.topRow) s.topRow = row;
      return { row, col };
    },

    attachFlying(hit) {
      const s = this.state;
      const f = s.flying;
      let targetRow, targetCol;
      if (hit.type === "ceiling") {
        ({ row: targetRow, col: targetCol } = this.findCeilingSpot(f.x));
      } else {
        const candidates = this.neighbors6(hit.row, hit.col).filter(([r, c]) => {
          if (r < s.topRow || c < 0 || s.grid.has(r + "," + c)) return false;
          const p = this.hexToPixel(r, c);
          return p.x >= 0 && p.x <= this.pitchW;
        });
        if (candidates.length === 0) {
          ({ row: targetRow, col: targetCol } = this.findCeilingSpot(f.x));
        } else {
          let best = null, bestDist = Infinity;
          for (const [r, c] of candidates) {
            const p = this.hexToPixel(r, c);
            const d = (f.x - p.x) ** 2 + (f.y - p.y) ** 2;
            if (d < bestDist) { bestDist = d; best = [r, c]; }
          }
          [targetRow, targetCol] = best;
        }
      }
      s.grid.set(targetRow + "," + targetCol, { color: f.color });
      s.flying = null;
      this.popMatches(targetRow, targetCol);
      // findCeilingSpot can shift topRow (forcing a fresh row above a
      // fully-packed ceiling), not just addRow() — re-check here too.
      if (!s.over) this.checkDangerLine();
    },

    // --- Matching ---
    popMatches(row, col) {
      const s = this.state;
      const startKey = row + "," + col;
      const startCell = s.grid.get(startKey);
      if (!startCell) return;
      const color = startCell.color;
      const seen = new Set([startKey]);
      const stack = [[row, col]];
      const group = [[row, col]];
      while (stack.length) {
        const [r, c] = stack.pop();
        for (const [nr, nc] of this.neighbors6(r, c)) {
          const k = nr + "," + nc;
          if (seen.has(k)) continue;
          const cell = s.grid.get(k);
          if (cell && cell.color === color) {
            seen.add(k); stack.push([nr, nc]); group.push([nr, nc]);
          }
        }
      }
      if (group.length >= 3) {
        for (const [r, c] of group) {
          const p = this.hexToPixel(r, c);
          s.popParticles.push({ x: p.x, y: p.y, color, t: 0 });
          s.grid.delete(r + "," + c);
        }
        this.dropFloating();
        this.checkWin();
      }
    },

    dropFloating() {
      const s = this.state;
      const seen = new Set();
      const stack = [];
      for (const key of s.grid.keys()) {
        const parts = key.split(",");
        if (Number(parts[0]) === s.topRow) { seen.add(key); stack.push([Number(parts[0]), Number(parts[1])]); }
      }
      while (stack.length) {
        const [r, c] = stack.pop();
        for (const [nr, nc] of this.neighbors6(r, c)) {
          const k = nr + "," + nc;
          if (seen.has(k)) continue;
          if (s.grid.has(k)) { seen.add(k); stack.push([nr, nc]); }
        }
      }
      for (const [key, cell] of s.grid) {
        if (!seen.has(key)) {
          const parts = key.split(",");
          const p = this.hexToPixel(Number(parts[0]), Number(parts[1]));
          s.fallParticles.push({ x: p.x, y: p.y, vy: 1, color: cell.color, alpha: 1 });
          s.grid.delete(key);
        }
      }
    },

    checkWin() {
      if (this.state.grid.size === 0 && !this.state.flying) this.onWin();
    },

    // --- Rows & danger line ---
    addRow() {
      const s = this.state;
      s.topRow -= 1;
      const newRow = s.topRow;
      const isOddRow = ((newRow % 2) + 2) % 2 === 1;
      const maxCol = BUBBLE_COLS - (isOddRow ? 2 : 1);
      for (let c = 0; c <= maxCol; c++) s.grid.set(newRow + "," + c, { color: this.randomColor() });
      this.checkDangerLine();
    },

    checkDangerLine() {
      for (const key of this.state.grid.keys()) {
        const parts = key.split(",");
        const p = this.hexToPixel(Number(parts[0]), Number(parts[1]));
        if (p.y + this.cellR > this.dangerY) { this.onGameOver(); return; }
      }
    },

    // --- Win / lose ---
    onWin() {
      const s = this.state;
      s.over = true;
      s.completed++;
      bubbleStore.setInt("completedCount", s.completed);
      this.els.completedCount.textContent = String(s.completed);
      document.getElementById("bubble-win-total").textContent = String(s.completed);
      showModal(document.getElementById("bubble-win-modal"));
    },

    onGameOver() {
      const s = this.state;
      if (s.over) return;
      s.over = true;
      document.getElementById("bubble-gameover-total").textContent = String(s.completed);
      showModal(document.getElementById("bubble-gameover-modal"));
    },

    updateHeader() {
      this.els.completedCount.textContent = String(this.state.completed);
      this.els.difficultyLabel.textContent = DIFFICULTIES[this.state.difficulty] || "Moderate";
    },

    showMessage(msg, ms) {
      this.state.message = msg;
      if (this.state.messageTimer) clearTimeout(this.state.messageTimer);
      this.state.messageTimer = setTimeout(() => { this.state.message = ""; }, ms || 1200);
    },

    // --- Rendering ---
    drawBackground() {
      const ctx = this.ctx, w = this.pitchW, h = this.pitchH;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#241a45");
      grad.addColorStop(1, "#120c26");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    },

    drawDangerLine() {
      const ctx = this.ctx;
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = "rgba(255,80,80,0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, this.dangerY);
      ctx.lineTo(this.pitchW, this.dangerY);
      ctx.stroke();
      ctx.setLineDash([]);
    },

    drawBubble(x, y, r, color) {
      const ctx = this.ctx;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1.5; ctx.stroke();
      const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
      grad.addColorStop(0, "rgba(255,255,255,0.55)");
      grad.addColorStop(0.5, "rgba(255,255,255,0.08)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = grad; ctx.fill();
    },

    drawGrid() {
      for (const key of this.state.grid.keys()) {
        const parts = key.split(",");
        const row = Number(parts[0]), col = Number(parts[1]);
        const cell = this.state.grid.get(key);
        const p = this.hexToPixel(row, col);
        if (p.y > this.pitchH + this.cellR * 2) continue;
        this.drawBubble(p.x, p.y, this.cellR - 1, cell.color);
      }
    },

    drawShooter() {
      const ctx = this.ctx, r = this.cellR;
      ctx.fillStyle = "#333";
      ctx.beginPath();
      ctx.moveTo(this.shooterX - r * 0.9, this.shooterY + r * 0.8);
      ctx.lineTo(this.shooterX + r * 0.9, this.shooterY + r * 0.8);
      ctx.lineTo(this.shooterX, this.shooterY - r * 0.5);
      ctx.closePath(); ctx.fill();
      if (this.state.current) this.drawBubble(this.shooterX, this.shooterY, r - 1, this.state.current.color);
      if (this.state.next) this.drawBubble(this.shooterX + r * 2.4, this.shooterY, r * 0.6, this.state.next.color);
    },

    // Finds the smallest positive `t` (distance along the ray from
    // (x,y) in direction (vx,vy), a unit vector) at which the ray comes
    // within `hitDist` of ANY existing grid bubble. Returns Infinity if
    // none. Used so the aim preview stops where a real shot actually
    // would, instead of drawing straight through bubbles as if they
    // weren't there.
    nearestBubbleHitT(x, y, vx, vy, hitDist) {
      let best = Infinity;
      for (const key of this.state.grid.keys()) {
        const parts = key.split(",");
        const p = this.hexToPixel(Number(parts[0]), Number(parts[1]));
        const wx = x - p.x, wy = y - p.y;
        const b = wx * vx + wy * vy;
        const c = wx * wx + wy * wy - hitDist * hitDist;
        const disc = b * b - c;
        if (disc < 0) continue;
        const sq = Math.sqrt(disc);
        const t = -b - sq;
        if (t > 0.01 && t < best) best = t;
      }
      return best;
    },

    drawAimLine() {
      const s = this.state;
      if (!s.aiming) return;
      const dir = this.computeAimDir();
      const ctx = this.ctx;
      let x = this.shooterX, y = this.shooterY, vx = dir.nx, vy = dir.ny;
      const points = [{ x, y }];
      let remaining = this.pitchH * 1.6, bounces = 0;
      const hitDist = this.attachDist(); // matches checkCollision's minDist
      let stoppedOnBubble = false;
      while (remaining > 0 && bounces <= 2) {
        let tX = Infinity;
        if (vx > 0) tX = (this.pitchW - this.cellR - x) / vx;
        else if (vx < 0) tX = (this.cellR - x) / vx;
        const tY = vy < 0 ? (this.gridPadY + this.cellR - y) / vy : Infinity;
        const tBubble = this.nearestBubbleHitT(x, y, vx, vy, hitDist);

        let t = remaining, kind = "budget";
        if (tX < t) { t = tX; kind = "wall"; }
        if (tY < t) { t = tY; kind = "ceiling"; }
        if (tBubble < t) { t = tBubble; kind = "bubble"; }
        if (!isFinite(t) || t <= 0) break;

        x += vx * t; y += vy * t; remaining -= t;
        points.push({ x, y });
        if (kind === "bubble" || kind === "ceiling") { stoppedOnBubble = kind === "bubble"; break; }
        if (kind === "budget") break;
        vx = -vx; bounces++; // wall bounce, keep going
      }
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = stoppedOnBubble ? "rgba(255,215,120,0.8)" : "rgba(255,255,255,0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.stroke();
      ctx.setLineDash([]);
    },

    drawParticles() {
      const ctx = this.ctx;
      for (const p of this.state.popParticles) {
        const scale = Math.max(0, 1 - p.t / 0.25);
        ctx.globalAlpha = scale;
        this.drawBubble(p.x, p.y, (this.cellR - 1) * scale, p.color);
        ctx.globalAlpha = 1;
      }
      for (const p of this.state.fallParticles) {
        ctx.globalAlpha = p.alpha;
        this.drawBubble(p.x, p.y, this.cellR - 1, p.color);
        ctx.globalAlpha = 1;
      }
    },

    drawMessage() {
      if (!this.state.message) return;
      const ctx = this.ctx, w = this.pitchW, h = this.pitchH;
      const fontSize = Math.round(w * 0.06);
      ctx.font = "bold " + fontSize + "px system-ui";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, h * 0.4, w, fontSize + 16);
      ctx.fillStyle = "#fff";
      ctx.fillText(this.state.message, w / 2, h * 0.4 + fontSize / 2 + 8);
    },

    draw() {
      this.ctx.clearRect(0, 0, this.pitchW, this.pitchH);
      this.drawBackground();
      this.drawDangerLine();
      this.drawGrid();
      this.drawParticles();
      if (this.state.flying) this.drawBubble(this.state.flying.x, this.state.flying.y, this.state.flying.r, this.state.flying.color);
      this.drawShooter();
      this.drawAimLine();
      this.drawMessage();
    },

    // --- Loop ---
    update(dt, now) {
      const s = this.state;
      if (s.paused || s.over) return;
      if (s.flying) this.stepFlight();
      if (s.popParticles.length) {
        for (const p of s.popParticles) p.t += dt;
        s.popParticles = s.popParticles.filter((p) => p.t < 0.25);
      }
      if (s.fallParticles.length) {
        for (const p of s.fallParticles) {
          p.vy += 45 * dt;
          p.y += p.vy;
          if (p.y - this.cellR > this.pitchH) p.alpha = 0;
        }
        s.fallParticles = s.fallParticles.filter((p) => p.alpha > 0);
      }
      // Hybrid row descent: a new row drops when EITHER the timer
      // elapses OR the player has fired enough shots, whichever comes
      // first. Both are reset together whenever a row is added.
      const tier = BUBBLE_TIERS[s.difficulty] || BUBBLE_TIERS.moderate;
      if (now >= s.nextRowTime || s.shotsSinceRow >= tier.shotsPerRow) {
        this.addRow();
        s.nextRowTime = now + tier.rowInterval;
        s.shotsSinceRow = 0;
      }
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

  modules.bubble = {
    _wired: false,

    onEnter() {
      bub.initCanvas();
      bub.els = {
        completedCount: document.getElementById("bubble-completed-count"),
        difficultyLabel: document.getElementById("bubble-difficulty-label"),
        winModal: document.getElementById("bubble-win-modal"),
        gameoverModal: document.getElementById("bubble-gameover-modal"),
        settingsModal: document.getElementById("bubble-settings-modal"),
      };

      bub.state.completed = bubbleStore.getInt("completedCount", 0);
      bub.state.difficulty = bubbleStore.getString("difficulty", "moderate", DIFFICULTIES);

      if (!this._wired) {
        this._wired = true;
        wireModal(bub.els.settingsModal);
        wireModal(bub.els.winModal);

        document.getElementById("bubble-settings-btn").addEventListener("click", () => {
          bub.state.paused = true;
          const m = bub.els.settingsModal;
          m.querySelectorAll('input[name="bubble-difficulty"]').forEach((r) => { r.checked = r.value === bub.state.difficulty; });
          showModal(m);
        });

        bub.els.settingsModal.addEventListener("click", (e) => {
          if (e.target instanceof HTMLElement && e.target.hasAttribute("data-close")) {
            bub.state.paused = false;
          }
        });

        bub.els.settingsModal.querySelectorAll('input[name="bubble-difficulty"]').forEach((r) => r.addEventListener("change", (e) => {
          if (!DIFFICULTIES[e.target.value] || e.target.value === bub.state.difficulty) return;
          bub.state.difficulty = e.target.value;
          bubbleStore.setString("difficulty", e.target.value);
          bub.updateHeader();
          bub.newBoard();
        }));

        document.getElementById("bubble-reset-count-btn").addEventListener("click", () => {
          if (!window.confirm("Reset the number of boards cleared back to 0?")) return;
          bub.state.completed = 0; bubbleStore.setInt("completedCount", 0);
          bub.els.completedCount.textContent = "0";
        });

        document.getElementById("bubble-next-btn").addEventListener("click", () => {
          hideModal(bub.els.winModal);
          bub.newBoard();
        });

        document.getElementById("bubble-retry-btn").addEventListener("click", () => {
          hideModal(bub.els.gameoverModal);
          bub.newBoard();
        });

        // Step-by-step tutorial navigation (same pattern as Soccer Pool)
        let tutStep = 0;
        const tutSteps = document.querySelectorAll(".bubble-tut-step");
        const tutPrev = document.getElementById("bubble-tut-prev");
        const tutNext = document.getElementById("bubble-tut-next");
        function showTutStep() {
          tutSteps.forEach((s, i) => { s.hidden = i !== tutStep; });
          tutPrev.hidden = tutStep === 0;
          tutNext.textContent = tutStep === tutSteps.length - 1 ? "Let's play!" : "Next →";
        }
        tutNext.addEventListener("click", () => {
          if (tutStep < tutSteps.length - 1) { tutStep++; showTutStep(); }
          else {
            bubbleStore.setBool("tutorialSeen", true);
            hideModal(document.getElementById("bubble-tutorial-modal"));
            bub.state.paused = false;
          }
        });
        tutPrev.addEventListener("click", () => {
          if (tutStep > 0) { tutStep--; showTutStep(); }
        });

        bub.canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); bub.onCanvasDown(e); });
        bub.canvas.addEventListener("pointermove", (e) => { bub.onCanvasMove(e); });
        bub.canvas.addEventListener("pointerup", () => { bub.onCanvasUp(); });

        window.addEventListener("resize", () => {
          if (router.current !== "bubble") return;
          bub.sizeCanvas();
          bub.draw();
        });
      }

      bub.newBoard();
      bub.updateHeader();
      bub.startLoop();

      if (!bubbleStore.getBool("tutorialSeen")) {
        bub.state.paused = true;
        showModal(document.getElementById("bubble-tutorial-modal"));
      }
    },

    onLeave() {
      bub.stopLoop();
      bub.state.paused = true;
      if (bub.state.messageTimer) clearTimeout(bub.state.messageTimer);
      hideModal(bub.els.winModal);
      hideModal(bub.els.gameoverModal);
      hideModal(bub.els.settingsModal);
      hideModal(document.getElementById("bubble-tutorial-modal"));
    },
  };

  // ================================================================
  // 19. SPACE RANGER — top-down scrolling space shooter
  // ================================================================
  const rangerStore = makeStore("ranger");

  const RANGER_MAX_LIVES = 3;
  const RANGER_FIRE_COOLDOWN = 200;  // ms between auto-fired shots — a stable, constant rate
  const RANGER_BULLET_SPEED = 480;   // px/s
  const RANGER_TOUCH_OFFSET = 3.2;   // ship-radii above the finger, so the ship stays visible while dragging
  const RANGER_BODY_SPEED = 55;      // px/s the background planet/nebula drifts down at, so several drift past each level
  const RANGER_ENEMY_COLORS = { drone: "#ff5f5f", weaver: "#c568f2", hunter: "#ff9f43" };

  // Per-difficulty tuning. `f` (0..1, current progress through the level)
  // linearly interpolates spawn interval and enemy speed between the
  // *Start and *End values, so every level starts slow/sparse and ramps
  // up toward the end. weaverAt/hunterAt gate when those enemy types are
  // allowed to spawn (as fractions of level progress), adding variety on
  // top of the raw speed/density ramp.
  // speedStart/speedEnd are 15% higher than the original tuning pass.
  const RANGER_TIERS = {
    simple:    { levelLength: 45000, spawnStart: 1400, spawnEnd: 700, speedStart: 81,  speedEnd: 150, weaverAt: 0.30, hunterAt: 0.70 },
    moderate:  { levelLength: 55000, spawnStart: 1000, spawnEnd: 420, speedStart: 104, speedEnd: 196, weaverAt: 0.20, hunterAt: 0.55 },
    difficult: { levelLength: 65000, spawnStart: 750,  spawnEnd: 280, speedStart: 127, speedEnd: 242, weaverAt: 0.10, hunterAt: 0.40 },
  };

  // Cycled by levelIndex % length. Each level of a fresh playthrough is a
  // different backdrop; once the whole list has been seen once ("a lap"),
  // the cycle repeats but with a compounding difficulty multiplier (see
  // `lapMult` in ranger.update) so the game never plateaus.
  const PLANET_THEMES = [
    { name: "Mercury", kind: "planet", base: "#8c7d6b", shade: "#3f362c", accent: "#c9bba8" },
    { name: "Venus", kind: "planet", base: "#d9b877", shade: "#6b5326", accent: "#f0dca0" },
    { name: "Earth", kind: "planet", base: "#3a72b0", shade: "#132840", accent: "#4f9e5c" },
    { name: "Mars", kind: "planet", base: "#b8542f", shade: "#4a1f10", accent: "#e08a55" },
    { name: "Asteroid Belt", kind: "belt", base: "#8a8078", shade: "#332f2b" },
    { name: "Jupiter", kind: "planet", base: "#c99a63", shade: "#5c3f1e", accent: "#e8c893", bands: true },
    { name: "Saturn", kind: "planet", base: "#d8c396", shade: "#5f5238", accent: "#f0e2bd", rings: true },
    { name: "Uranus", kind: "planet", base: "#8fd4d6", shade: "#2c5a5b", accent: "#c3ecee" },
    { name: "Neptune", kind: "planet", base: "#3d54c9", shade: "#151f56", accent: "#7c8fe8" },
    { name: "Deep Space Nebula", kind: "nebula", colors: ["#b04fd6", "#4f7fd6", "#d64f9a"] },
  ];

  const ranger = {
    canvas: null, ctx: null,
    fieldW: 300, fieldH: 460,
    shipR: 16, enemyR: 14, bulletR: 4,
    minY: 100, maxY: 400,
    starLayers: [],
    animId: null, lastFrame: 0,
    els: {},
    state: {
      difficulty: "moderate",
      levelIndex: 0, levelsCleared: 0,
      progress: 0, lives: RANGER_MAX_LIVES,
      ship: { x: 150, y: 400 },
      dragging: false,
      bullets: [], enemies: [], particles: [],
      theme: PLANET_THEMES[0], body: null, rocks: null,
      nextFireTime: 0, nextSpawnTime: 0, invulnUntil: 0,
      paused: false, over: false,
    },

    // --- Setup ---
    initCanvas() {
      this.canvas = document.getElementById("ranger-canvas");
      this.ctx = this.canvas.getContext("2d");
      this.sizeCanvas();
    },

    sizeCanvas() {
      const wrap = this.canvas.parentElement;
      const rect = wrap.getBoundingClientRect();
      const maxW = rect.width - 8, maxH = rect.height - 8;
      const aspect = 0.62; // width / height (portrait)
      let w = maxW, h = maxH;
      if (w / h > aspect) w = h * aspect; else h = w / aspect;
      w = Math.floor(w); h = Math.floor(h);
      this.fieldW = w; this.fieldH = h;
      this.canvas.width = w; this.canvas.height = h;
      this.canvas.style.width = w + "px"; this.canvas.style.height = h + "px";
      this.shipR = Math.max(14, w * 0.055);
      this.enemyR = Math.max(12, w * 0.05);
      this.bulletR = Math.max(3, w * 0.012);
      this.minY = h * 0.3;
      this.maxY = h - this.shipR - 6;
      this.starLayers = this.buildStarLayers();
    },

    buildStarLayers() {
      const counts = [40, 26, 14], speeds = [18, 34, 55], sizes = [1, 1.6, 2.4];
      const layers = [];
      for (let i = 0; i < 3; i++) {
        const stars = [];
        for (let n = 0; n < counts[i]; n++) stars.push({ x: Math.random() * this.fieldW, y: Math.random() * this.fieldH });
        layers.push({ stars, speed: speeds[i], size: sizes[i] });
      }
      return layers;
    },

    placeBackground() {
      const s = this.state;
      const theme = PLANET_THEMES[s.levelIndex % PLANET_THEMES.length];
      s.theme = theme;
      if (theme.kind === "belt") {
        s.rocks = [];
        const n = 10 + Math.floor(Math.random() * 6);
        for (let i = 0; i < n; i++) {
          s.rocks.push({
            x: Math.random() * this.fieldW, y: Math.random() * this.fieldH,
            r: 5 + Math.random() * 10, speed: RANGER_BODY_SPEED * 0.6 + Math.random() * RANGER_BODY_SPEED * 0.6,
          });
        }
        s.body = null;
      } else {
        s.body = {
          x: this.fieldW * (0.25 + Math.random() * 0.5),
          y: this.fieldH * (0.1 + Math.random() * 0.25),
          r: this.fieldW * (0.45 + Math.random() * 0.25),
        };
        s.rocks = null;
      }
    },

    respawnBody() {
      const s = this.state;
      s.body.r = this.fieldW * (0.45 + Math.random() * 0.25);
      s.body.x = this.fieldW * (0.25 + Math.random() * 0.5);
      s.body.y = -s.body.r;
    },

    // --- Level lifecycle ---
    resetField() {
      const s = this.state;
      s.progress = 0;
      s.bullets = []; s.enemies = []; s.particles = [];
      s.nextFireTime = 0; s.nextSpawnTime = performance.now() + 600; s.invulnUntil = 0;
      s.over = false; s.paused = false;
      s.dragging = false;
      s.ship.x = this.fieldW / 2; s.ship.y = this.maxY;
      this.placeBackground();
      this.updateLivesDisplay();
      this.updateProgressBar(0);
      this.draw();
    },

    startLevel(idx) {
      this.state.levelIndex = Math.max(0, idx);
      this.resetField();
    },

    retryLevel() {
      this.state.lives = RANGER_MAX_LIVES;
      this.resetField();
    },

    newGame() {
      this.state.levelIndex = 0;
      this.state.lives = RANGER_MAX_LIVES;
      this.resetField();
    },

    // --- Input: drag to move, tap to shoot ---
    getCanvasPoint(e) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (this.fieldW / rect.width),
        y: (e.clientY - rect.top) * (this.fieldH / rect.height),
      };
    },

    // Ship is drawn above the actual touch point (by RANGER_TOUCH_OFFSET
    // ship-radii) so a finger dragging it around doesn't sit directly on
    // top of — and hide — the ship.
    onCanvasDown(e) {
      const s = this.state;
      if (s.over || s.paused) return;
      const p = this.getCanvasPoint(e);
      s.dragging = true;
      s.ship.x = p.x; s.ship.y = p.y - this.shipR * RANGER_TOUCH_OFFSET;
      try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    },

    onCanvasMove(e) {
      const s = this.state;
      if (!s.dragging) return;
      const p = this.getCanvasPoint(e);
      s.ship.x = p.x; s.ship.y = p.y - this.shipR * RANGER_TOUCH_OFFSET;
    },

    onCanvasUp() {
      this.state.dragging = false;
    },

    // Ship fires automatically at a steady rate (RANGER_FIRE_COOLDOWN)
    // whenever the level is running — no player input needed to shoot.
    fireBullet(now) {
      const s = this.state;
      if (s.over || s.paused || now < s.nextFireTime) return;
      s.bullets.push({ x: s.ship.x, y: s.ship.y - this.shipR });
      s.nextFireTime = now + RANGER_FIRE_COOLDOWN;
    },

    // --- Enemies ---
    pickEnemyType(f, tier) {
      const types = ["drone"];
      if (f >= tier.weaverAt) types.push("weaver");
      if (f >= tier.hunterAt) types.push("hunter");
      return types[Math.floor(Math.random() * types.length)];
    },

    spawnEnemy(f, tier, lapMult) {
      const s = this.state;
      const type = this.pickEnemyType(f, tier);
      const speed = (tier.speedStart + (tier.speedEnd - tier.speedStart) * f) * lapMult;
      const x = this.enemyR + Math.random() * (this.fieldW - this.enemyR * 2);
      const enemy = { type, x, y: -this.enemyR, r: this.enemyR };
      if (type === "drone") {
        enemy.vy = speed * (0.9 + Math.random() * 0.2);
      } else if (type === "weaver") {
        enemy.vy = speed * 0.8;
        enemy.phase = Math.random() * Math.PI * 2;
        enemy.amp = 50 + Math.random() * 40;
      } else {
        enemy.vy = speed * 0.7;
        enemy.hSpeed = speed * 0.6;
      }
      s.enemies.push(enemy);
    },

    updateEnemy(e, dt) {
      if (e.type === "weaver") {
        e.phase += dt * 3.2;
        e.x += Math.cos(e.phase) * e.amp * dt;
        e.x = Math.max(this.enemyR, Math.min(this.fieldW - this.enemyR, e.x));
      } else if (e.type === "hunter") {
        const dir = Math.sign(this.state.ship.x - e.x);
        e.x += dir * e.hSpeed * dt;
        e.x = Math.max(this.enemyR, Math.min(this.fieldW - this.enemyR, e.x));
      }
      e.y += e.vy * dt;
    },

    // --- Collisions & particles ---
    spawnBurst(x, y, color, count) {
      const s = this.state;
      for (let i = 0; i < (count || 10); i++) {
        const ang = Math.random() * Math.PI * 2, spd = 40 + Math.random() * 90;
        s.particles.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, color, t: 0 });
      }
    },

    checkBulletEnemyCollisions() {
      const s = this.state;
      for (const b of s.bullets) {
        if (b.dead) continue;
        for (const e of s.enemies) {
          if (e.dead) continue;
          const dx = b.x - e.x, dy = b.y - e.y, rr = this.bulletR + e.r;
          if (dx * dx + dy * dy < rr * rr) {
            b.dead = true; e.dead = true;
            this.spawnBurst(e.x, e.y, RANGER_ENEMY_COLORS[e.type]);
            break;
          }
        }
      }
      s.bullets = s.bullets.filter((b) => !b.dead);
      s.enemies = s.enemies.filter((e) => !e.dead);
    },

    checkShipEnemyCollision(now) {
      const s = this.state;
      if (now < s.invulnUntil) return;
      for (const e of s.enemies) {
        if (e.dead) continue;
        const dx = s.ship.x - e.x, dy = s.ship.y - e.y, rr = this.shipR * 0.8 + e.r;
        if (dx * dx + dy * dy < rr * rr) {
          e.dead = true;
          s.lives -= 1;
          s.invulnUntil = now + 900;
          this.spawnBurst(s.ship.x, s.ship.y, "#ffdd66");
          this.updateLivesDisplay();
          if (s.lives <= 0) this.onGameOver();
          break;
        }
      }
      s.enemies = s.enemies.filter((e) => !e.dead);
    },

    // --- Loop ---
    update(dt, now) {
      const s = this.state;
      if (s.paused || s.over) return;
      const tier = RANGER_TIERS[s.difficulty] || RANGER_TIERS.moderate;
      const laps = Math.floor(s.levelIndex / PLANET_THEMES.length);
      const lapMult = Math.min(1 + laps * 0.08, 1.6);
      const f = Math.max(0, Math.min(1, s.progress / tier.levelLength));

      s.ship.x = Math.max(this.shipR, Math.min(this.fieldW - this.shipR, s.ship.x));
      s.ship.y = Math.max(this.minY, Math.min(this.maxY, s.ship.y));

      for (const layer of this.starLayers) {
        for (const star of layer.stars) {
          star.y += layer.speed * dt;
          if (star.y > this.fieldH) { star.y -= this.fieldH; star.x = Math.random() * this.fieldW; }
        }
      }
      if (s.theme.kind === "belt") {
        for (const rock of s.rocks) {
          rock.y += rock.speed * dt;
          if (rock.y - rock.r > this.fieldH) { rock.y = -rock.r; rock.x = Math.random() * this.fieldW; }
        }
      } else if (s.body) {
        s.body.y += RANGER_BODY_SPEED * dt;
        if (s.body.y - s.body.r > this.fieldH) this.respawnBody();
      }

      if (now >= s.nextSpawnTime) {
        this.spawnEnemy(f, tier, lapMult);
        const interval = (tier.spawnStart + (tier.spawnEnd - tier.spawnStart) * f) / lapMult;
        s.nextSpawnTime = now + Math.max(150, interval);
      }

      this.fireBullet(now);

      for (const b of s.bullets) b.y -= RANGER_BULLET_SPEED * dt;
      s.bullets = s.bullets.filter((b) => b.y + this.bulletR > 0);

      for (const e of s.enemies) this.updateEnemy(e, dt);
      s.enemies = s.enemies.filter((e) => e.y - this.enemyR < this.fieldH);

      this.checkBulletEnemyCollisions();
      this.checkShipEnemyCollision(now);
      if (s.over) return;

      for (const p of s.particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      s.particles = s.particles.filter((p) => p.t < 0.4);

      s.progress += dt * 1000;
      this.updateProgressBar(f);
      if (s.progress >= tier.levelLength) this.onLevelClear();
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

    // --- Win / lose ---
    onLevelClear() {
      const s = this.state;
      if (s.over) return;
      s.over = true;
      s.levelsCleared += 1;
      s.lives = Math.min(s.lives + 1, RANGER_MAX_LIVES);
      rangerStore.setInt("levelsCleared", s.levelsCleared);
      this.updateLivesDisplay();
      this.els.levelCount.textContent = String(s.levelsCleared);
      document.getElementById("ranger-win-planet").textContent = PLANET_THEMES[s.levelIndex % PLANET_THEMES.length].name;
      document.getElementById("ranger-win-total").textContent = String(s.levelsCleared);
      showModal(this.els.winModal);
    },

    onGameOver() {
      const s = this.state;
      if (s.over) return;
      s.over = true;
      document.getElementById("ranger-gameover-total").textContent = String(s.levelsCleared);
      showModal(this.els.gameoverModal);
    },

    updateHeader() {
      this.els.levelCount.textContent = String(this.state.levelsCleared);
      this.els.difficultyLabel.textContent = DIFFICULTIES[this.state.difficulty] || "Moderate";
    },

    updateLivesDisplay() {
      const el = this.els.livesEl;
      el.innerHTML = "";
      for (let i = 0; i < RANGER_MAX_LIVES; i++) {
        const d = document.createElement("span");
        d.className = "ranger-life" + (i >= this.state.lives ? " lost" : "");
        el.appendChild(d);
      }
    },

    updateProgressBar(f) {
      if (this.els.progressFill) this.els.progressFill.style.width = Math.round(f * 100) + "%";
    },

    // --- Rendering ---
    drawSpaceBackdrop() {
      const ctx = this.ctx, w = this.fieldW, h = this.fieldH;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#0b0a1a");
      grad.addColorStop(1, "#030308");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    },

    drawStarfield() {
      const ctx = this.ctx;
      for (const layer of this.starLayers) {
        ctx.fillStyle = "rgba(255,255,255," + (0.35 + layer.size * 0.15) + ")";
        for (const star of layer.stars) ctx.fillRect(star.x, star.y, layer.size, layer.size);
      }
    },

    drawSphere(x, y, r, theme) {
      const ctx = this.ctx;
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
      const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      grad.addColorStop(0, theme.accent || theme.base);
      grad.addColorStop(0.55, theme.base);
      grad.addColorStop(1, theme.shade);
      ctx.fillStyle = grad;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      if (theme.bands) {
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        for (let i = -3; i <= 3; i++) {
          const by = y + i * r * 0.28;
          ctx.fillRect(x - r, by, r * 2, r * 0.1);
        }
      }
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath(); ctx.arc(x + r * 0.4, y + r * 0.4, r * 0.95, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    },

    drawBackgroundBody() {
      const ctx = this.ctx, s = this.state;
      if (s.theme.kind === "belt") {
        for (const rock of s.rocks) {
          ctx.fillStyle = s.theme.base;
          ctx.beginPath(); ctx.arc(rock.x, rock.y, rock.r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = s.theme.shade;
          ctx.beginPath(); ctx.arc(rock.x + rock.r * 0.3, rock.y + rock.r * 0.3, rock.r * 0.45, 0, Math.PI * 2); ctx.fill();
        }
        return;
      }
      if (!s.body) return;
      const b = s.body;
      if (s.theme.kind === "nebula") {
        ctx.save();
        for (let i = 0; i < s.theme.colors.length; i++) {
          const ox = Math.sin(i * 2.1) * b.r * 0.4, oy = Math.cos(i * 1.7) * b.r * 0.3;
          const grad = ctx.createRadialGradient(b.x + ox, b.y + oy, 0, b.x + ox, b.y + oy, b.r * 0.9);
          grad.addColorStop(0, s.theme.colors[i] + "55");
          grad.addColorStop(1, s.theme.colors[i] + "00");
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(b.x + ox, b.y + oy, b.r * 0.9, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
        return;
      }
      if (s.theme.rings) {
        ctx.save();
        ctx.strokeStyle = s.theme.accent;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = Math.max(2, b.r * 0.07);
        ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r * 1.7, b.r * 0.45, -0.25, Math.PI, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      this.drawSphere(b.x, b.y, b.r, s.theme);
      if (s.theme.rings) {
        ctx.save();
        ctx.strokeStyle = s.theme.accent;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = Math.max(2, b.r * 0.07);
        ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r * 1.7, b.r * 0.45, -0.25, 0, Math.PI); ctx.stroke();
        ctx.restore();
      }
    },

    drawParticles() {
      const ctx = this.ctx;
      for (const p of this.state.particles) {
        ctx.globalAlpha = Math.max(0, 1 - p.t / 0.4);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    },

    drawBullet(b) {
      const ctx = this.ctx;
      ctx.fillStyle = "#7fe8ff";
      ctx.beginPath();
      ctx.roundRect(b.x - this.bulletR * 0.6, b.y - this.bulletR * 1.6, this.bulletR * 1.2, this.bulletR * 3.2, this.bulletR);
      ctx.fill();
    },

    drawEnemy(e) {
      const ctx = this.ctx, r = e.r;
      ctx.fillStyle = RANGER_ENEMY_COLORS[e.type];
      ctx.beginPath();
      if (e.type === "drone") {
        ctx.moveTo(e.x, e.y + r); ctx.lineTo(e.x - r * 0.85, e.y - r * 0.7); ctx.lineTo(e.x + r * 0.85, e.y - r * 0.7);
      } else if (e.type === "weaver") {
        ctx.moveTo(e.x, e.y - r); ctx.lineTo(e.x + r, e.y); ctx.lineTo(e.x, e.y + r); ctx.lineTo(e.x - r, e.y);
      } else {
        ctx.moveTo(e.x, e.y + r); ctx.lineTo(e.x - r, e.y - r * 0.6); ctx.lineTo(e.x, e.y - r * 0.1); ctx.lineTo(e.x + r, e.y - r * 0.6);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 1.5; ctx.stroke();
    },

    drawShip() {
      const s = this.state, now = performance.now();
      if (now < s.invulnUntil && Math.floor(now / 100) % 2 === 0) return;
      const ctx = this.ctx, x = s.ship.x, y = s.ship.y, r = this.shipR;
      ctx.save();
      ctx.fillStyle = "#ffb545";
      ctx.beginPath();
      ctx.moveTo(x - r * 0.35, y + r * 0.7); ctx.lineTo(x - r * 0.15, y + r * 1.3); ctx.lineTo(x + r * 0.15, y + r * 1.3); ctx.lineTo(x + r * 0.35, y + r * 0.7);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#4fc3e8";
      ctx.beginPath();
      ctx.moveTo(x, y - r * 1.1); ctx.lineTo(x - r * 0.85, y + r * 0.8); ctx.lineTo(x + r * 0.85, y + r * 0.8);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = "#dff6ff";
      ctx.beginPath(); ctx.arc(x, y - r * 0.15, r * 0.32, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    },

    draw() {
      this.ctx.clearRect(0, 0, this.fieldW, this.fieldH);
      this.drawSpaceBackdrop();
      this.drawBackgroundBody();
      this.drawStarfield();
      this.drawParticles();
      for (const b of this.state.bullets) this.drawBullet(b);
      for (const e of this.state.enemies) this.drawEnemy(e);
      this.drawShip();
    },
  };

  modules.ranger = {
    _wired: false,

    onEnter() {
      ranger.initCanvas();
      ranger.els = {
        levelCount: document.getElementById("ranger-level-count"),
        difficultyLabel: document.getElementById("ranger-difficulty-label"),
        winModal: document.getElementById("ranger-win-modal"),
        gameoverModal: document.getElementById("ranger-gameover-modal"),
        settingsModal: document.getElementById("ranger-settings-modal"),
        progressFill: document.getElementById("ranger-progress-fill"),
        livesEl: document.getElementById("ranger-lives"),
      };

      ranger.state.levelsCleared = rangerStore.getInt("levelsCleared", 0);
      ranger.state.difficulty = rangerStore.getString("difficulty", "moderate", DIFFICULTIES);

      if (!this._wired) {
        this._wired = true;
        wireModal(ranger.els.settingsModal);
        wireModal(ranger.els.winModal);

        document.getElementById("ranger-settings-btn").addEventListener("click", () => {
          ranger.state.paused = true;
          const m = ranger.els.settingsModal;
          m.querySelectorAll('input[name="ranger-difficulty"]').forEach((r) => { r.checked = r.value === ranger.state.difficulty; });
          showModal(m);
        });

        ranger.els.settingsModal.addEventListener("click", (e) => {
          if (e.target instanceof HTMLElement && e.target.hasAttribute("data-close")) {
            ranger.state.paused = false;
          }
        });

        ranger.els.settingsModal.querySelectorAll('input[name="ranger-difficulty"]').forEach((r) => r.addEventListener("change", (e) => {
          if (!DIFFICULTIES[e.target.value] || e.target.value === ranger.state.difficulty) return;
          ranger.state.difficulty = e.target.value;
          rangerStore.setString("difficulty", e.target.value);
          ranger.updateHeader();
          ranger.resetField();
        }));

        document.getElementById("ranger-reset-count-btn").addEventListener("click", () => {
          if (!window.confirm("Reset the number of levels cleared back to 0?")) return;
          ranger.state.levelsCleared = 0; rangerStore.setInt("levelsCleared", 0);
          ranger.els.levelCount.textContent = "0";
        });

        document.getElementById("ranger-next-btn").addEventListener("click", () => {
          hideModal(ranger.els.winModal);
          ranger.startLevel(ranger.state.levelIndex + 1);
        });

        document.getElementById("ranger-retry-btn").addEventListener("click", () => {
          hideModal(ranger.els.gameoverModal);
          ranger.retryLevel();
        });

        // Step-by-step tutorial navigation (same pattern as Bubble Blast)
        let tutStep = 0;
        const tutSteps = document.querySelectorAll(".ranger-tut-step");
        const tutPrev = document.getElementById("ranger-tut-prev");
        const tutNext = document.getElementById("ranger-tut-next");
        function showTutStep() {
          tutSteps.forEach((s, i) => { s.hidden = i !== tutStep; });
          tutPrev.hidden = tutStep === 0;
          tutNext.textContent = tutStep === tutSteps.length - 1 ? "Let's fly!" : "Next →";
        }
        tutNext.addEventListener("click", () => {
          if (tutStep < tutSteps.length - 1) { tutStep++; showTutStep(); }
          else {
            rangerStore.setBool("tutorialSeen", true);
            hideModal(document.getElementById("ranger-tutorial-modal"));
            ranger.state.paused = false;
          }
        });
        tutPrev.addEventListener("click", () => {
          if (tutStep > 0) { tutStep--; showTutStep(); }
        });

        ranger.canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); ranger.onCanvasDown(e); });
        ranger.canvas.addEventListener("pointermove", (e) => { ranger.onCanvasMove(e); });
        ranger.canvas.addEventListener("pointerup", () => { ranger.onCanvasUp(); });

        window.addEventListener("resize", () => {
          if (router.current !== "ranger") return;
          ranger.sizeCanvas();
          ranger.draw();
        });
      }

      ranger.updateHeader();
      ranger.newGame();
      ranger.startLoop();

      if (!rangerStore.getBool("tutorialSeen")) {
        ranger.state.paused = true;
        showModal(document.getElementById("ranger-tutorial-modal"));
      }
    },

    onLeave() {
      ranger.stopLoop();
      ranger.state.paused = true;
      hideModal(ranger.els.winModal);
      hideModal(ranger.els.gameoverModal);
      hideModal(ranger.els.settingsModal);
      hideModal(document.getElementById("ranger-tutorial-modal"));
    },
  };

  // ================================================================
  // 20. ROBOT ARENA — 1v1 fighting game
  // ================================================================
  const arenaStore = makeStore("arena");

  const ARENA_MAX_HEALTH = 100;
  const ARENA_GRAVITY = 1400;        // px/s^2
  const ARENA_JUMP_VY = -520;        // px/s jump impulse
  const ARENA_MOVE_SPEED = 140;      // px/s walking speed (player; CPU scales by tier.moveSpeedMult)
  const ARENA_HITSTUN_MS = 250;
  const ARENA_BLOCK_REDUCTION = 0.8; // fraction of damage blocked
  const ARENA_KNOCKBACK = 18;        // px pushed back on a landed hit
  const ARENA_PUNCH = { dmg: 6, range: 60, cooldown: 350, animMs: 220 };
  const ARENA_KICK = { dmg: 10, range: 78, cooldown: 550, animMs: 320 };

  // Difficulty tunes CPU *behavior*, not raw damage/health multipliers —
  // same convention as HEN_DIFFICULTY (spawn/speed) and RANGER_TIERS
  // (spawn/speed): the fight stays fair, just faster/more aggressive.
  const ARENA_TIERS = {
    simple:    { decisionMs: 550, attackChance: 0.35, blockChance: 0.15, moveSpeedMult: 0.85 },
    moderate:  { decisionMs: 380, attackChance: 0.50, blockChance: 0.25, moveSpeedMult: 1.00 },
    difficult: { decisionMs: 230, attackChance: 0.68, blockChance: 0.35, moveSpeedMult: 1.15 },
  };

  const ARENA_FIGHTERS = {
    red: { name: "Red Bot", color: "#e0455a", dark: "#7a1f2b" },
    blue: { name: "Blue Bot", color: "#3ac7d6", dark: "#1a5a63" },
  };

  function makeArenaFighter(side, x, facing, isCpu) {
    return {
      side, isCpu, x, y: 0, vy: 0, facing, grounded: true,
      health: ARENA_MAX_HEALTH,
      action: "idle", actionUntil: 0, attackCooldownUntil: 0, hitstunUntil: 0,
    };
  }

  function makeArenaInput() {
    return { left: false, right: false, block: false, jumpPressed: false, punchPressed: false, kickPressed: false };
  }

  const arena = {
    canvas: null, ctx: null,
    fieldW: 360, fieldH: 260,
    fighterW: 32, fighterH: 100, floorY: 220, floorMinX: 20, floorMaxX: 340,
    animId: null, lastFrame: 0,
    els: {},
    state: {
      difficulty: "moderate",
      wins: 0,
      playerSide: "red",
      playerFighter: null, cpuFighter: null,
      playerInput: null, cpuInput: null,
      cpuNextDecision: 0,
      particles: [],
      paused: false, over: false,
    },

    // --- Setup ---
    initCanvas() {
      this.canvas = document.getElementById("arena-canvas");
      this.ctx = this.canvas.getContext("2d");
      this.sizeCanvas();
    },

    sizeCanvas() {
      const wrap = this.canvas.parentElement;
      const rect = wrap.getBoundingClientRect();
      const maxW = rect.width - 8, maxH = rect.height - 8;
      const aspect = 1.4; // width / height — landscape arena strip
      let w = maxW, h = maxH;
      if (w / h > aspect) w = h * aspect; else h = w / aspect;
      w = Math.floor(w); h = Math.floor(h);
      this.fieldW = w; this.fieldH = h;
      this.canvas.width = w; this.canvas.height = h;
      this.canvas.style.width = w + "px"; this.canvas.style.height = h + "px";
      this.fighterW = w * 0.09;
      this.fighterH = h * 0.42;
      this.floorY = h * 0.86;
      this.floorMinX = this.fighterW * 0.6;
      this.floorMaxX = w - this.fighterW * 0.6;
    },

    moveSpeedFor(f) {
      if (!f.isCpu) return ARENA_MOVE_SPEED;
      const tier = ARENA_TIERS[this.state.difficulty] || ARENA_TIERS.moderate;
      return ARENA_MOVE_SPEED * tier.moveSpeedMult;
    },

    // --- Match lifecycle ---
    newMatch(playerSide) {
      const s = this.state;
      s.playerSide = playerSide;
      const cpuSide = playerSide === "red" ? "blue" : "red";
      s.playerFighter = makeArenaFighter(playerSide, this.floorMinX + this.fighterW, 1, false);
      s.cpuFighter = makeArenaFighter(cpuSide, this.floorMaxX - this.fighterW, -1, true);
      s.playerInput = makeArenaInput();
      s.cpuInput = makeArenaInput();
      s.cpuNextDecision = 0;
      s.particles = [];
      s.over = false; s.paused = false;
      this.updateHealthBars();
      this.draw();
    },

    // --- CPU ---
    cpuThink(now) {
      const s = this.state;
      if (now < s.cpuNextDecision) return;
      const tier = ARENA_TIERS[s.difficulty] || ARENA_TIERS.moderate;
      s.cpuNextDecision = now + tier.decisionMs;
      const cpu = s.cpuFighter, player = s.playerFighter;
      const input = s.cpuInput;
      input.left = false; input.right = false; input.block = false;
      if (cpu.action === "ko" || player.action === "ko") return;
      const dist = Math.abs(player.x - cpu.x);
      if (dist > ARENA_KICK.range) {
        if (player.x > cpu.x) input.right = true; else input.left = true;
        return;
      }
      const roll = Math.random();
      if (roll < tier.attackChance) {
        if (Math.random() < 0.5) input.punchPressed = true; else input.kickPressed = true;
      } else if (roll < tier.attackChance + tier.blockChance) {
        input.block = true;
      } else if (Math.random() < 0.3) {
        if (player.x > cpu.x) input.left = true; else input.right = true;
      }
    },

    // --- Fighter physics/state machine (shared by player and CPU) ---
    updateFighter(f, input, dt, now, opponent) {
      if (f.action === "ko") return;

      // Clear a finished attack/hit animation before deciding what this
      // tick is allowed to do.
      if ((f.action === "hit" || f.action === "punch" || f.action === "kick") && now >= f.actionUntil) {
        f.action = f.grounded ? "idle" : "jump";
      }

      const inHitstun = now < f.hitstunUntil;
      const canAct = !inHitstun && f.action !== "punch" && f.action !== "kick" && f.action !== "hit";

      if (canAct) f.facing = opponent.x >= f.x ? 1 : -1;

      if (canAct && !input.block) {
        const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        if (dx !== 0) {
          f.x = Math.max(this.floorMinX, Math.min(this.floorMaxX, f.x + dx * this.moveSpeedFor(f) * dt));
          if (f.grounded) f.action = "walk";
        } else if (f.grounded && f.action === "walk") {
          f.action = "idle";
        }
      }

      if (canAct && input.block && f.grounded) {
        f.action = "block";
      } else if (f.action === "block" && (!input.block || !canAct)) {
        f.action = "idle";
      }

      if (canAct && input.jumpPressed && f.grounded) {
        f.vy = ARENA_JUMP_VY; f.grounded = false; f.action = "jump";
      }
      input.jumpPressed = false;

      if (!f.grounded) {
        f.vy += ARENA_GRAVITY * dt;
        f.y += f.vy * dt;
        if (f.y >= 0) { f.y = 0; f.vy = 0; f.grounded = true; if (f.action === "jump") f.action = "idle"; }
      }

      if (canAct && f.grounded && now >= f.attackCooldownUntil && (input.punchPressed || input.kickPressed)) {
        const isKick = !!input.kickPressed;
        const cfg = isKick ? ARENA_KICK : ARENA_PUNCH;
        f.action = isKick ? "kick" : "punch";
        f.actionUntil = now + cfg.animMs;
        f.attackCooldownUntil = now + cfg.cooldown;
        this.resolveAttack(f, opponent, cfg, now);
      }
      input.punchPressed = false;
      input.kickPressed = false;
    },

    // Whiffs (no hit) if the opponent is airborne (jump = simple dodge),
    // out of range, or facing the wrong way. Blocking reduces damage
    // rather than negating it, so blocking indefinitely still loses.
    resolveAttack(attacker, defender, cfg, now) {
      if (defender.action === "ko" || !defender.grounded) return;
      const dist = Math.abs(defender.x - attacker.x);
      const isFacing = (defender.x - attacker.x) * attacker.facing >= 0;
      if (dist > cfg.range || !isFacing) return;
      let dmg = cfg.dmg;
      if (defender.action === "block") dmg *= (1 - ARENA_BLOCK_REDUCTION);
      this.applyDamage(defender, dmg, attacker.facing, now);
    },

    applyDamage(f, dmg, attackerFacing, now) {
      f.health = Math.max(0, f.health - dmg);
      f.x = Math.max(this.floorMinX, Math.min(this.floorMaxX, f.x + attackerFacing * ARENA_KNOCKBACK));
      if (f.health <= 0) {
        f.action = "ko";
      } else {
        f.action = "hit";
        f.hitstunUntil = now + ARENA_HITSTUN_MS;
        f.actionUntil = now + ARENA_HITSTUN_MS;
      }
      this.spawnBurst(f.x, this.floorY - f.y - this.fighterH * 0.55, "#ffe066");
      this.updateHealthBars();
    },

    spawnBurst(x, y, color) {
      const s = this.state;
      for (let i = 0; i < 10; i++) {
        const ang = Math.random() * Math.PI * 2, spd = 40 + Math.random() * 90;
        s.particles.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, color, t: 0 });
      }
    },

    // --- Loop ---
    update(dt, now) {
      const s = this.state;
      if (s.paused || s.over) return;
      this.cpuThink(now);
      this.updateFighter(s.playerFighter, s.playerInput, dt, now, s.cpuFighter);
      this.updateFighter(s.cpuFighter, s.cpuInput, dt, now, s.playerFighter);

      for (const p of s.particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      s.particles = s.particles.filter((p) => p.t < 0.4);

      if (s.playerFighter.action === "ko" || s.cpuFighter.action === "ko") {
        this.onMatchOver(s.cpuFighter.action === "ko");
      }
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

    // --- Win / lose ---
    onMatchOver(playerWon) {
      const s = this.state;
      if (s.over) return;
      s.over = true;
      if (playerWon) {
        s.wins += 1;
        arenaStore.setInt("wins", s.wins);
        this.els.winsCount.textContent = String(s.wins);
      }
      document.getElementById("arena-result-title").textContent = playerWon ? "You Win!" : "You Lose!";
      document.getElementById("arena-result-msg").textContent = playerWon
        ? "Your robot is still standing."
        : "Your robot has been knocked out.";
      document.getElementById("arena-result-total").textContent = String(s.wins);
      showModal(this.els.resultModal);
    },

    updateHeader() {
      this.els.winsCount.textContent = String(this.state.wins);
      this.els.difficultyLabel.textContent = DIFFICULTIES[this.state.difficulty] || "Moderate";
    },

    updateHealthBars() {
      const s = this.state;
      if (!this.els.redFill || !s.playerFighter) return;
      const red = s.playerFighter.side === "red" ? s.playerFighter : s.cpuFighter;
      const blue = s.playerFighter.side === "blue" ? s.playerFighter : s.cpuFighter;
      this.els.redFill.style.width = Math.max(0, red.health) + "%";
      this.els.blueFill.style.width = Math.max(0, blue.health) + "%";
      this.els.redLabel.textContent = s.playerSide === "red" ? "YOU" : "CPU";
      this.els.blueLabel.textContent = s.playerSide === "blue" ? "YOU" : "CPU";
    },

    // --- Rendering ---
    drawBackground() {
      const ctx = this.ctx, w = this.fieldW, h = this.fieldH;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#2a2440");
      grad.addColorStop(0.7, "#4a3a5a");
      grad.addColorStop(1, "#6b5a70");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#1c1626";
      ctx.fillRect(0, this.floorY, w, h - this.floorY);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, this.floorY); ctx.lineTo(w, this.floorY); ctx.stroke();
    },

    drawFighter(f) {
      const ctx = this.ctx, theme = ARENA_FIGHTERS[f.side];
      const fw = this.fighterW, fh = this.fighterH;
      const x = f.x, y = this.floorY - f.y;
      const flash = f.action === "hit" && Math.floor(performance.now() / 60) % 2 === 0;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(f.facing, 1);

      ctx.fillStyle = theme.dark;
      const strideShift = f.action === "walk" ? Math.sin(performance.now() / 80) * fw * 0.15 : 0;
      ctx.fillRect(-fw * 0.28 + strideShift, -fh * 0.05, fw * 0.22, fh * 0.35);
      ctx.fillRect(fw * 0.06 - strideShift, -fh * 0.05, fw * 0.22, fh * 0.35);

      ctx.fillStyle = flash ? "#fff" : theme.color;
      ctx.fillRect(-fw * 0.32, -fh * 0.62, fw * 0.64, fh * 0.55);

      ctx.fillStyle = theme.dark;
      ctx.fillRect(-fw * 0.18, -fh * 0.85, fw * 0.36, fh * 0.24);
      ctx.fillStyle = "#fff";
      ctx.fillRect(fw * 0.02, -fh * 0.78, fw * 0.1, fh * 0.06);

      ctx.fillStyle = flash ? "#fff" : theme.color;
      if (f.action === "punch") {
        ctx.fillRect(fw * 0.28, -fh * 0.5, fw * 0.5, fh * 0.14);
      } else if (f.action === "kick") {
        ctx.fillStyle = theme.dark;
        ctx.fillRect(fw * 0.1, -fh * 0.15, fw * 0.55, fh * 0.16);
      } else if (f.action === "block") {
        ctx.fillRect(fw * 0.18, -fh * 0.55, fw * 0.18, fh * 0.4);
      } else {
        ctx.fillRect(-fw * 0.42, -fh * 0.5, fw * 0.14, fh * 0.32);
        ctx.fillRect(fw * 0.28, -fh * 0.5, fw * 0.14, fh * 0.32);
      }
      ctx.restore();
    },

    drawParticles() {
      const ctx = this.ctx;
      for (const p of this.state.particles) {
        ctx.globalAlpha = Math.max(0, 1 - p.t / 0.4);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    },

    draw() {
      this.ctx.clearRect(0, 0, this.fieldW, this.fieldH);
      this.drawBackground();
      const s = this.state;
      if (!s.playerFighter) return;
      this.drawParticles();
      // draw the fighter further back (smaller x... actually just draw by
      // x order so the nearer one overlaps correctly) left-to-right
      const pair = [s.playerFighter, s.cpuFighter].sort((a, b) => a.x - b.x);
      for (const f of pair) this.drawFighter(f);
    },
  };

  modules.arena = {
    _wired: false,

    onEnter() {
      arena.initCanvas();
      arena.els = {
        winsCount: document.getElementById("arena-wins-count"),
        difficultyLabel: document.getElementById("arena-difficulty-label"),
        settingsModal: document.getElementById("arena-settings-modal"),
        resultModal: document.getElementById("arena-result-modal"),
        redFill: document.getElementById("arena-health-red-fill"),
        blueFill: document.getElementById("arena-health-blue-fill"),
        redLabel: document.getElementById("arena-label-red"),
        blueLabel: document.getElementById("arena-label-blue"),
      };

      arena.state.wins = arenaStore.getInt("wins", 0);
      arena.state.difficulty = arenaStore.getString("difficulty", "moderate", DIFFICULTIES);

      if (!this._wired) {
        this._wired = true;
        wireModal(arena.els.settingsModal);

        document.getElementById("arena-settings-btn").addEventListener("click", () => {
          arena.state.paused = true;
          const m = arena.els.settingsModal;
          m.querySelectorAll('input[name="arena-difficulty"]').forEach((r) => { r.checked = r.value === arena.state.difficulty; });
          showModal(m);
        });
        arena.els.settingsModal.addEventListener("click", (e) => {
          if (e.target instanceof HTMLElement && e.target.hasAttribute("data-close")) {
            arena.state.paused = false;
          }
        });
        arena.els.settingsModal.querySelectorAll('input[name="arena-difficulty"]').forEach((r) => r.addEventListener("change", (e) => {
          if (!DIFFICULTIES[e.target.value] || e.target.value === arena.state.difficulty) return;
          arena.state.difficulty = e.target.value;
          arenaStore.setString("difficulty", e.target.value);
          arena.updateHeader();
        }));
        document.getElementById("arena-reset-count-btn").addEventListener("click", () => {
          if (!window.confirm("Reset the number of wins back to 0?")) return;
          arena.state.wins = 0; arenaStore.setInt("wins", 0);
          arena.els.winsCount.textContent = "0";
        });

        // Fighter-select overlay
        let selectedSide = null;
        const selectEl = document.getElementById("arena-select");
        const matchEl = document.getElementById("arena-match-view");
        const startBtn = document.getElementById("arena-start-btn");
        const matchupEl = document.getElementById("arena-matchup");
        function pickSide(side) {
          selectedSide = side;
          document.querySelectorAll(".arena-fighter-btn").forEach((b) => b.classList.toggle("selected", b.dataset.side === side));
          const theme = ARENA_FIGHTERS[side];
          const cpuTheme = ARENA_FIGHTERS[side === "red" ? "blue" : "red"];
          document.getElementById("arena-matchup-you-badge").style.background = theme.color;
          document.getElementById("arena-matchup-you-name").textContent = theme.name;
          document.getElementById("arena-matchup-cpu-badge").style.background = cpuTheme.color;
          document.getElementById("arena-matchup-cpu-name").textContent = cpuTheme.name;
          matchupEl.hidden = false;
          startBtn.hidden = false;
        }
        document.querySelectorAll(".arena-fighter-btn").forEach((btn) => {
          btn.addEventListener("click", () => pickSide(btn.dataset.side));
        });
        arena.showSelect = () => {
          selectedSide = null;
          document.querySelectorAll(".arena-fighter-btn").forEach((b) => b.classList.remove("selected"));
          matchupEl.hidden = true;
          startBtn.hidden = true;
          selectEl.hidden = false;
          matchEl.hidden = true;
          arena.stopLoop();
        };
        startBtn.addEventListener("click", () => {
          if (!selectedSide) return;
          selectEl.hidden = true;
          matchEl.hidden = false;
          arena.newMatch(selectedSide);
          arena.startLoop();
        });

        document.getElementById("arena-rematch-btn").addEventListener("click", () => {
          hideModal(arena.els.resultModal);
          if (selectedSide) { arena.newMatch(selectedSide); arena.startLoop(); }
        });
        document.getElementById("arena-choose-fighter-btn").addEventListener("click", () => {
          hideModal(arena.els.resultModal);
          arena.showSelect();
        });

        // Step-by-step tutorial navigation (same pattern as Bubble Blast / Space Ranger)
        let tutStep = 0;
        const tutSteps = document.querySelectorAll(".arena-tut-step");
        const tutPrev = document.getElementById("arena-tut-prev");
        const tutNext = document.getElementById("arena-tut-next");
        function showTutStep() {
          tutSteps.forEach((s, i) => { s.hidden = i !== tutStep; });
          tutPrev.hidden = tutStep === 0;
          tutNext.textContent = tutStep === tutSteps.length - 1 ? "Let's fight!" : "Next →";
        }
        tutNext.addEventListener("click", () => {
          if (tutStep < tutSteps.length - 1) { tutStep++; showTutStep(); }
          else {
            arenaStore.setBool("tutorialSeen", true);
            hideModal(document.getElementById("arena-tutorial-modal"));
            arena.state.paused = false;
          }
        });
        tutPrev.addEventListener("click", () => {
          if (tutStep > 0) { tutStep--; showTutStep(); }
        });

        // Directional pad: left/right/down are held; up (jump) is edge-triggered.
        const wireHold = (el, setter) => {
          el.addEventListener("pointerdown", (e) => { e.preventDefault(); setter(true); });
          ["pointerup", "pointercancel", "pointerleave"].forEach((evt) => el.addEventListener(evt, () => setter(false)));
        };
        const dpad = document.getElementById("arena-dpad");
        wireHold(dpad.querySelector(".dpad-left"), (v) => { arena.state.playerInput.left = v; });
        wireHold(dpad.querySelector(".dpad-right"), (v) => { arena.state.playerInput.right = v; });
        wireHold(dpad.querySelector(".dpad-down"), (v) => { arena.state.playerInput.block = v; });
        dpad.querySelector(".dpad-up").addEventListener("pointerdown", (e) => { e.preventDefault(); arena.state.playerInput.jumpPressed = true; });

        document.getElementById("arena-punch-btn").addEventListener("pointerdown", (e) => { e.preventDefault(); arena.state.playerInput.punchPressed = true; });
        document.getElementById("arena-kick-btn").addEventListener("pointerdown", (e) => { e.preventDefault(); arena.state.playerInput.kickPressed = true; });

        document.addEventListener("keydown", arenaKeyDown);
        document.addEventListener("keyup", arenaKeyUp);

        window.addEventListener("resize", () => {
          if (router.current !== "arena") return;
          arena.sizeCanvas();
          arena.draw();
        });
      }

      arena.updateHeader();
      arena.showSelect();

      if (!arenaStore.getBool("tutorialSeen")) {
        arena.state.paused = true;
        showModal(document.getElementById("arena-tutorial-modal"));
      }
    },

    onLeave() {
      arena.stopLoop();
      arena.state.paused = true;
      hideModal(arena.els.resultModal);
      hideModal(arena.els.settingsModal);
      hideModal(document.getElementById("arena-tutorial-modal"));
    },
  };

  function arenaKeyDown(e) {
    if (router.current !== "arena" || !arena.state.playerInput) return;
    const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "a") { e.preventDefault(); arena.state.playerInput.left = true; return; }
    if (k === "arrowright" || k === "d") { e.preventDefault(); arena.state.playerInput.right = true; return; }
    if (k === "arrowdown" || k === "s") { e.preventDefault(); arena.state.playerInput.block = true; return; }
    if ((k === "arrowup" || k === "w") && !e.repeat) { e.preventDefault(); arena.state.playerInput.jumpPressed = true; return; }
    if ((k === "j" || k === "1") && !e.repeat) { arena.state.playerInput.punchPressed = true; return; }
    if ((k === "k" || k === "2") && !e.repeat) { arena.state.playerInput.kickPressed = true; }
  }

  function arenaKeyUp(e) {
    if (router.current !== "arena" || !arena.state.playerInput) return;
    const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "a") arena.state.playerInput.left = false;
    if (k === "arrowright" || k === "d") arena.state.playerInput.right = false;
    if (k === "arrowdown" || k === "s") arena.state.playerInput.block = false;
  }

  // ================================================================
  // 21. INIT & LOCALSTORAGE MIGRATION
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
