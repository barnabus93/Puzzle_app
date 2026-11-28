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
  const titleStore = makeStore("title");
  modules.title = {
    onEnter() {
      const tiles = document.querySelectorAll("#screen-title .game-tile[data-game]");
      this._handler = (e) => {
        const tile = e.currentTarget;
        const game = tile.dataset.game;
        if (game) router.show(game);
      };
      tiles.forEach((t) => t.addEventListener("click", this._handler));

      const screen = document.getElementById("screen-title");
      this._screen = screen;
      this._updateMore = () => {
        const more = screen.scrollTop + screen.clientHeight < screen.scrollHeight - 8;
        screen.classList.toggle("has-more", more);
      };
      screen.addEventListener("scroll", this._updateMore);
      window.addEventListener("resize", this._updateMore);

      // Category tabs: show only tiles whose data-category matches (or "all").
      const tabs = document.querySelectorAll("#screen-title .game-tab");
      const allTiles = document.querySelectorAll("#screen-title .game-tile");
      const valid = { puzzle: 1, action: 1, versus: 1 };
      const ORDER = ["puzzle", "action", "versus"];
      const grid = document.querySelector("#screen-title .game-tiles");
      let current = null;
      const showTab = (cat) => {
        if (!valid[cat]) cat = "puzzle";
        if (current && cat !== current) { // slide the tiles in from the side we're moving toward
          const fwd = ORDER.indexOf(cat) > ORDER.indexOf(current);
          grid.classList.remove("slide-from-right", "slide-from-left");
          void grid.offsetWidth; // restart the animation
          grid.classList.add(fwd ? "slide-from-right" : "slide-from-left");
        }
        current = cat;
        tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === cat));
        allTiles.forEach((t) => {
          const c = t.dataset.category;
          t.hidden = !(c === cat || c === "all");
        });
        screen.scrollTop = 0;
        this._updateMore();
      };
      this._tabHandler = (e) => { const cat = e.currentTarget.dataset.tab; titleStore.setString("tab", cat); showTab(cat); };
      tabs.forEach((t) => t.addEventListener("click", this._tabHandler));
      showTab(titleStore.getString("tab", "puzzle", valid));

      // Swipe left/right anywhere on the menu to move between tabs.
      let sx = 0, sy = 0, st = 0, tracking = false, swipedAt = 0;
      this._touchStart = (e) => {
        if (e.touches.length !== 1) { tracking = false; return; }
        sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now(); tracking = true;
      };
      this._touchEnd = (e) => {
        if (!tracking) return;
        tracking = false;
        const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
        if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - st > 800) return;
        const i = ORDER.indexOf(current) + (dx < 0 ? 1 : -1);
        if (i < 0 || i >= ORDER.length) return;
        swipedAt = Date.now();
        titleStore.setString("tab", ORDER[i]);
        showTab(ORDER[i]);
      };
      // a swipe that ends on a tile must not also open that game
      this._swallowClick = (e) => { if (Date.now() - swipedAt < 400) { e.preventDefault(); e.stopPropagation(); } };
      screen.addEventListener("touchstart", this._touchStart, { passive: true });
      screen.addEventListener("touchend", this._touchEnd, { passive: true });
      screen.addEventListener("click", this._swallowClick, true);
    },
    onLeave() {
      const tiles = document.querySelectorAll("#screen-title .game-tile[data-game]");
      if (this._handler) tiles.forEach((t) => t.removeEventListener("click", this._handler));
      if (this._tabHandler) document.querySelectorAll("#screen-title .game-tab").forEach((t) => t.removeEventListener("click", this._tabHandler));
      if (this._screen && this._updateMore) {
        this._screen.removeEventListener("scroll", this._updateMore);
        window.removeEventListener("resize", this._updateMore);
      }
      if (this._screen && this._touchStart) {
        this._screen.removeEventListener("touchstart", this._touchStart);
        this._screen.removeEventListener("touchend", this._touchEnd);
        this._screen.removeEventListener("click", this._swallowClick, true);
      }
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
  const RANGER_FIRE_COOLDOWN = 250;  // ms between auto-fired shots — 25% slower than the original 200ms
  const RANGER_BULLET_SPEED = 480;   // px/s
  const RANGER_TOUCH_OFFSET = 3.2;   // ship-radii above the finger, so the ship stays visible while dragging
  const RANGER_BODY_SPEED = 55;      // px/s the background planet/nebula drifts down at, so several drift past each level
  const RANGER_ENEMY_COLORS = { drone: "#ff5f5f", weaver: "#c568f2", hunter: "#ff9f43" };
  const RANGER_ENEMY_BULLET_SPEED = 220; // px/s -- slower than the player's own bullets, so an aimed shot is dodgeable
  const RANGER_ENEMY_FIRE_CHANCE = 0.35; // avg fires/sec per on-screen enemy (random, not a fixed interval)

  // Per-difficulty tuning. `f` (0..1, current progress through the level)
  // linearly interpolates spawn interval and enemy speed between the
  // *Start and *End values, so every level starts slow/sparse and ramps
  // up toward the end. weaverAt/hunterAt gate when those enemy types are
  // allowed to spawn (as fractions of level progress), adding variety on
  // top of the raw speed/density ramp.
  // levelLength (survived-time ms to clear a level) is 50% faster than
  // the original 28s/34s/40s pass -- i.e. levels clear in 2/3 the time.
  // speedStart/speedEnd (enemy descent speed) are a further 50% faster
  // on top of the earlier +15% pass.
  const RANGER_TIERS = {
    simple:    { levelLength: 18000, spawnStart: 1400, spawnEnd: 700, speedStart: 122, speedEnd: 225, weaverAt: 0.30, hunterAt: 0.70 },
    moderate:  { levelLength: 22000, spawnStart: 1000, spawnEnd: 420, speedStart: 156, speedEnd: 294, weaverAt: 0.20, hunterAt: 0.55 },
    difficult: { levelLength: 26000, spawnStart: 750,  spawnEnd: 280, speedStart: 191, speedEnd: 363, weaverAt: 0.10, hunterAt: 0.40 },
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
      bullets: [], enemyBullets: [], enemies: [], particles: [],
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
      s.bullets = []; s.enemyBullets = []; s.enemies = []; s.particles = [];
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
          this.hitShip(now);
          break;
        }
      }
      s.enemies = s.enemies.filter((e) => !e.dead);
    },

    // Shared "ship took a hit" consequence, used for both direct enemy
    // collisions and enemy bullets.
    hitShip(now) {
      const s = this.state;
      s.lives -= 1;
      s.invulnUntil = now + 900;
      this.spawnBurst(s.ship.x, s.ship.y, "#ffdd66");
      this.updateLivesDisplay();
      if (s.lives <= 0) this.onGameOver();
    },

    // Aimed at the ship's position at the moment of firing (no homing),
    // so dodging after the shot is fired is meaningful. Which enemy
    // fires, and when, is left to random chance in update() rather than
    // a fixed per-enemy interval.
    fireEnemyBullet(e) {
      const s = this.state;
      const dx = s.ship.x - e.x, dy = s.ship.y - e.y;
      const len = Math.hypot(dx, dy) || 1;
      s.enemyBullets.push({ x: e.x, y: e.y, vx: (dx / len) * RANGER_ENEMY_BULLET_SPEED, vy: (dy / len) * RANGER_ENEMY_BULLET_SPEED });
    },

    checkEnemyBulletShipCollision(now) {
      const s = this.state;
      if (now < s.invulnUntil) return;
      for (const b of s.enemyBullets) {
        if (b.dead) continue;
        const dx = s.ship.x - b.x, dy = s.ship.y - b.y, rr = this.shipR * 0.8 + this.bulletR;
        if (dx * dx + dy * dy < rr * rr) {
          b.dead = true;
          this.hitShip(now);
          break;
        }
      }
      s.enemyBullets = s.enemyBullets.filter((b) => !b.dead);
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

      // Any enemy that's fully on screen has a random per-second chance to
      // fire at the ship's current position -- not a fixed interval, so
      // it's unpredictable which enemy shoots and when.
      for (const e of s.enemies) {
        if (e.y > 0 && Math.random() < RANGER_ENEMY_FIRE_CHANCE * dt) this.fireEnemyBullet(e);
      }
      for (const b of s.enemyBullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
      s.enemyBullets = s.enemyBullets.filter((b) => b.x > -20 && b.x < this.fieldW + 20 && b.y > -20 && b.y < this.fieldH + 20);

      this.checkBulletEnemyCollisions();
      this.checkShipEnemyCollision(now);
      this.checkEnemyBulletShipCollision(now);
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

    // Oriented along its own travel direction (aimed shots aren't always
    // vertical), and colored distinctly from the player's cyan bullets.
    drawEnemyBullet(b) {
      const ctx = this.ctx;
      const angle = Math.atan2(b.vy, b.vx) - Math.PI / 2;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(angle);
      ctx.fillStyle = "#ff6b6b";
      ctx.beginPath();
      ctx.roundRect(-this.bulletR * 0.6, -this.bulletR * 1.6, this.bulletR * 1.2, this.bulletR * 3.2, this.bulletR);
      ctx.fill();
      ctx.restore();
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
      for (const b of this.state.enemyBullets) this.drawEnemyBullet(b);
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
  const ARENA_ROCKET = { dmg: 12, speed: 260, cooldown: 420, radius: 5 };
  const ARENA_SHIP_MOVE_SPEED = 170; // px/s vertical (player; CPU scales by tier.moveSpeedMult)

  const ARENA_KINDS = { robot: "Robot", ship: "Spaceship" };

  // Difficulty tunes CPU *behavior*, not raw damage/health multipliers —
  // same convention as HEN_DIFFICULTY (spawn/speed) and RANGER_TIERS
  // (spawn/speed): the fight stays fair, just faster/more aggressive.
  // Reused for both combat modes -- blockChance is simply unread by ships.
  const ARENA_TIERS = {
    simple:    { decisionMs: 550, attackChance: 0.35, blockChance: 0.15, moveSpeedMult: 0.85 },
    moderate:  { decisionMs: 380, attackChance: 0.50, blockChance: 0.25, moveSpeedMult: 1.00 },
    difficult: { decisionMs: 230, attackChance: 0.68, blockChance: 0.35, moveSpeedMult: 1.15 },
  };

  // `label` is just the color name -- the displayed name ("Red Bot" vs
  // "Red Ship") depends on the active combat mode, via arenaFighterName().
  const ARENA_FIGHTERS = {
    red: { label: "Red", color: "#e0455a", dark: "#7a1f2b" },
    blue: { label: "Blue", color: "#3ac7d6", dark: "#1a5a63" },
    purple: { label: "Purple", color: "#a95fe0", dark: "#4e2b6e" },
    green: { label: "Green", color: "#5fd068", dark: "#256b2c" },
    brown: { label: "Brown", color: "#a9713f", dark: "#523119" },
    yellow: { label: "Yellow", color: "#f2c94c", dark: "#8a6a12" },
  };

  function arenaFighterName(side, kind) {
    return ARENA_FIGHTERS[side].label + " " + (kind === "ship" ? "Ship" : "Bot");
  }

  function makeArenaFighter(side, x, facing, isCpu) {
    return {
      side, kind: "robot", isCpu, x, y: 0, vy: 0, facing, grounded: true,
      health: ARENA_MAX_HEALTH,
      action: "idle", actionUntil: 0, attackCooldownUntil: 0, hitstunUntil: 0,
    };
  }

  // Ships only ever move vertically and never turn (player is always on
  // the left facing right, CPU always on the right facing left), so this
  // is a much smaller shape than makeArenaFighter -- no facing/grounded/vy,
  // and no hitstun (getting hit doesn't lock out control, just flashes).
  function makeArenaShip(side, x, y, isCpu) {
    return {
      side, kind: "ship", isCpu, x, y,
      health: ARENA_MAX_HEALTH,
      action: "idle", actionUntil: 0, nextFireTime: 0,
    };
  }

  function makeArenaInput() {
    return {
      left: false, right: false, up: false, down: false, block: false,
      jumpPressed: false, punchPressed: false, kickPressed: false, firePressed: false,
    };
  }

  const arena = {
    canvas: null, ctx: null,
    fieldW: 360, fieldH: 260,
    fighterW: 32, fighterH: 100, floorY: 220, floorMinX: 20, floorMaxX: 340,
    shipW: 40, shipH: 26, shipMinY: 30, shipMaxY: 230, shipPlayerX: 50, shipCpuX: 310,
    starLayers: [],
    animId: null, lastFrame: 0,
    els: {},
    state: {
      playerKind: "robot", cpuKind: "robot",
      difficulty: "moderate",
      wins: 0,
      playerSide: "red",
      playerFighter: null, cpuFighter: null,
      playerInput: null, cpuInput: null,
      cpuNextDecision: 0,
      particles: [], rockets: [],
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
      this.shipW = w * 0.1;
      this.shipH = h * 0.13;
      this.shipMinY = h * 0.12;
      this.shipMaxY = h * 0.88;
      this.shipPlayerX = w * 0.14;
      this.shipCpuX = w * 0.86;
      this.starLayers = this.buildStarLayers();
    },

    buildStarLayers() {
      const counts = [24, 14], speeds = [10, 20], sizes = [1, 1.6];
      const layers = [];
      for (let i = 0; i < counts.length; i++) {
        const stars = [];
        for (let n = 0; n < counts[i]; n++) stars.push({ x: Math.random() * this.fieldW, y: Math.random() * this.fieldH });
        layers.push({ stars, speed: speeds[i], size: sizes[i] });
      }
      return layers;
    },

    moveSpeedFor(f) {
      if (!f.isCpu) return ARENA_MOVE_SPEED;
      const tier = ARENA_TIERS[this.state.difficulty] || ARENA_TIERS.moderate;
      return ARENA_MOVE_SPEED * tier.moveSpeedMult;
    },

    // Canvas-space body box {cx,cy,hw,hh} used for all collisions, by kind.
    // A robot's y is its height above the floor; a ship's y is a canvas y.
    arenaBodyRect(f) {
      if (f.kind === "ship") {
        return { cx: f.x, cy: f.y, hw: this.shipW * 0.5, hh: this.shipH * 0.5 };
      }
      const feetY = this.floorY - f.y;
      return { cx: f.x, cy: feetY - this.fighterH * 0.45, hw: this.fighterW * 0.4, hh: this.fighterH * 0.5 };
    },

    // Route a landed hit to the right damage model for the defender's kind.
    arenaHit(defender, dmg, now, attackerFacing) {
      if (defender.kind === "ship") this.applyShipDamage(defender, dmg, now);
      else this.applyDamage(defender, dmg, attackerFacing || 1, now);
    },

    // --- Match lifecycle ---
    // cpuSide is chosen by the caller (the fighter-select UI rolls it once,
    // at pick time, so the matchup preview shown before "Start Match"
    // always matches the opponent the match actually starts with).
    newMatch(playerSide, cpuSide) {
      const s = this.state;
      s.playerSide = playerSide;
      s.playerFighter = s.playerKind === "ship"
        ? makeArenaShip(playerSide, this.shipPlayerX, this.fieldH / 2, false)
        : makeArenaFighter(playerSide, this.floorMinX + this.fighterW, 1, false);
      s.cpuFighter = s.cpuKind === "ship"
        ? makeArenaShip(cpuSide, this.shipCpuX, this.fieldH / 2, true)
        : makeArenaFighter(cpuSide, this.floorMaxX - this.fighterW, -1, true);
      s.rockets = [];
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
      // always close horizontal distance toward the opponent
      if (dist > ARENA_KICK.range) { if (player.x > cpu.x) input.right = true; else input.left = true; }

      if (player.kind === "ship") {
        // a flying target: jump to reach it when it's close and low enough
        const canReach = player.y >= this.floorY - this.fighterH * 1.25;
        if (dist <= ARENA_KICK.range * 1.1) {
          if (cpu.grounded && canReach && Math.random() < 0.75) input.jumpPressed = true;
          if (Math.random() < tier.attackChance) { if (Math.random() < 0.5) input.punchPressed = true; else input.kickPressed = true; }
        }
        return;
      }

      if (dist > ARENA_KICK.range) return; // still approaching a ground foe
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
      if (defender.action === "ko") return;
      const dist = Math.abs(defender.x - attacker.x);
      const isFacing = (defender.x - attacker.x) * attacker.facing >= 0;
      if (dist > cfg.range || !isFacing) return;
      if (defender.kind === "ship") {
        // the robot's fists reach up as it jumps; a ship only gets clipped
        // when it's within that vertical reach (low, or at the jump apex).
        const strikeY = this.floorY - attacker.y - this.fighterH * 0.55;
        if (Math.abs(defender.y - strikeY) > this.fighterH * 0.6) return;
      } else if (!defender.grounded) {
        return; // an airborne robot dodges (unchanged)
      }
      let dmg = cfg.dmg;
      if (defender.kind !== "ship" && defender.action === "block") dmg *= (1 - ARENA_BLOCK_REDUCTION);
      this.arenaHit(defender, dmg, now, attacker.facing);
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

    // --- Spaceship mode: CPU, movement, firing, rocket collision ---
    // Ships share the same decision-interval AI shape as cpuThink, but
    // track the player's vertical position instead of closing horizontal
    // distance, and fire instead of punch/kick. blockChance is unused.
    cpuThinkShip(now) {
      const s = this.state;
      if (now < s.cpuNextDecision) return;
      const tier = ARENA_TIERS[s.difficulty] || ARENA_TIERS.moderate;
      s.cpuNextDecision = now + tier.decisionMs;
      const cpu = s.cpuFighter, player = s.playerFighter;
      const input = s.cpuInput;
      input.up = false; input.down = false;
      if (cpu.action === "ko" || player.action === "ko") return;
      // line up the ship's flight height with the opponent's body center,
      // which for a robot is its canvas y, not its "height above floor".
      const targetY = this.arenaBodyRect(player).cy;
      const diff = targetY - cpu.y;
      if (Math.abs(diff) > 12) { if (diff > 0) input.down = true; else input.up = true; }
      if (Math.random() < tier.attackChance) input.firePressed = true;
    },

    shipMoveSpeedFor(f) {
      if (!f.isCpu) return ARENA_SHIP_MOVE_SPEED;
      const tier = ARENA_TIERS[this.state.difficulty] || ARENA_TIERS.moderate;
      return ARENA_SHIP_MOVE_SPEED * tier.moveSpeedMult;
    },

    updateShip(f, input, dt, now) {
      if (f.action === "ko") return;
      if (f.action === "hit" && now >= f.actionUntil) f.action = "idle";

      const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      if (dy !== 0) {
        f.y = Math.max(this.shipMinY, Math.min(this.shipMaxY, f.y + dy * this.shipMoveSpeedFor(f) * dt));
      }

      if (input.firePressed && now >= f.nextFireTime) {
        this.fireRocket(f);
        f.nextFireTime = now + ARENA_ROCKET.cooldown;
      }
      input.firePressed = false;
    },

    fireRocket(f) {
      const dir = f.isCpu ? -1 : 1; // player (left) fires right, CPU (right) fires left
      this.state.rockets.push({ x: f.x, y: f.y, vx: dir * ARENA_ROCKET.speed, isCpu: f.isCpu });
    },

    // A rocket only ever threatens the ship it was NOT fired by -- checked
    // via r.isCpu (a CPU rocket can only hit the player, and vice versa),
    // so there's no risk of a ship damaging itself with its own shot.
    updateRockets(dt, now) {
      const s = this.state;
      for (const r of s.rockets) r.x += r.vx * dt;
      for (const r of s.rockets) {
        if (r.dead) continue;
        const target = r.isCpu ? s.playerFighter : s.cpuFighter;
        if (target.action === "ko") continue;
        const box = this.arenaBodyRect(target);
        if (Math.abs(r.x - box.cx) < ARENA_ROCKET.radius + box.hw && Math.abs(r.y - box.cy) < box.hh) {
          r.dead = true;
          this.arenaHit(target, ARENA_ROCKET.dmg, now, r.vx >= 0 ? 1 : -1);
        }
      }
      s.rockets = s.rockets.filter((r) => !r.dead && r.x > -20 && r.x < this.fieldW + 20);
    },

    // No knockback (ships don't move horizontally) and no hitstun/control
    // lockout -- just a brief flash. Ship combat is meant to feel like
    // reflexive dodging, not a melee trade-off.
    applyShipDamage(f, dmg, now) {
      f.health = Math.max(0, f.health - dmg);
      if (f.health <= 0) {
        f.action = "ko";
      } else {
        f.action = "hit";
        f.actionUntil = now + 200;
      }
      this.spawnBurst(f.x, f.y, "#ffe066");
      this.updateHealthBars();
    },

    // --- Loop ---
    update(dt, now) {
      const s = this.state;
      if (s.paused || s.over) return;
      const p = s.playerFighter, c = s.cpuFighter;
      const anyShip = p.kind === "ship" || c.kind === "ship";
      if (anyShip) {
        for (const layer of this.starLayers) {
          for (const star of layer.stars) {
            star.x -= layer.speed * dt;
            if (star.x < 0) { star.x = this.fieldW; star.y = Math.random() * this.fieldH; }
          }
        }
      }
      // CPU brain and per-fighter update, each by its own kind
      if (c.kind === "ship") this.cpuThinkShip(now); else this.cpuThink(now);
      if (p.kind === "ship") this.updateShip(p, s.playerInput, dt, now); else this.updateFighter(p, s.playerInput, dt, now, c);
      if (c.kind === "ship") this.updateShip(c, s.cpuInput, dt, now); else this.updateFighter(c, s.cpuInput, dt, now, p);
      if (anyShip) this.updateRockets(dt, now);

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
      const outcome = playerWon ? "win" : "lose";
      const card = document.getElementById("arena-result-card");
      const title = document.getElementById("arena-result-title");
      card.classList.remove("win", "lose"); card.classList.add(outcome);
      title.classList.remove("win", "lose"); title.classList.add(outcome);
      document.getElementById("arena-result-icon").textContent = playerWon ? "🏆" : "💥";
      title.textContent = playerWon ? "You Win!" : "You Lose!";
      document.getElementById("arena-result-msg").textContent = playerWon
        ? "Victory! Your robot is still standing."
        : "Defeat! Your robot has been destroyed.";
      document.getElementById("arena-result-total").textContent = String(s.wins);
      showModal(this.els.resultModal);
    },

    updateHeader() {
      this.els.winsCount.textContent = String(this.state.wins);
      this.els.difficultyLabel.textContent = DIFFICULTIES[this.state.difficulty] || "Moderate";
    },

    // Player's bar is always shown on the left, CPU's on the right,
    // regardless of which of the 6 colors either fighter is playing --
    // the bar's own gradient is set from that fighter's theme color.
    updateHealthBars() {
      const s = this.state;
      if (!this.els.youFill || !s.playerFighter) return;
      const youTheme = ARENA_FIGHTERS[s.playerFighter.side];
      const cpuTheme = ARENA_FIGHTERS[s.cpuFighter.side];
      this.els.youFill.style.width = Math.max(0, s.playerFighter.health) + "%";
      this.els.cpuFill.style.width = Math.max(0, s.cpuFighter.health) + "%";
      this.els.youFill.style.background = "linear-gradient(90deg, " + youTheme.dark + ", " + youTheme.color + ")";
      this.els.cpuFill.style.background = "linear-gradient(90deg, " + cpuTheme.color + ", " + cpuTheme.dark + ")";
      this.els.youLabel.textContent = "YOU";
      this.els.cpuLabel.textContent = "CPU";
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

    // Much simpler than Space Ranger's planet system on purpose -- this
    // is just enough to read as "space" and stay visually distinct from
    // the robot arena's gradient+floor.
    drawSpaceBackdrop() {
      const ctx = this.ctx, w = this.fieldW, h = this.fieldH;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#0b0a1a");
      grad.addColorStop(1, "#1a1230");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    },

    drawStarfield() {
      const ctx = this.ctx;
      for (const layer of this.starLayers) {
        ctx.fillStyle = "rgba(255,255,255," + (0.4 + layer.size * 0.2) + ")";
        for (const star of layer.stars) ctx.fillRect(star.x, star.y, layer.size, layer.size);
      }
    },

    drawShip(f) {
      const ctx = this.ctx, theme = ARENA_FIGHTERS[f.side];
      const w = this.shipW, h = this.shipH;
      const facing = f.isCpu ? -1 : 1;
      const flash = f.action === "hit" && Math.floor(performance.now() / 60) % 2 === 0;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.scale(facing, 1);

      ctx.fillStyle = "rgba(255,150,60,0.8)";
      const flicker = 0.7 + Math.random() * 0.3;
      ctx.beginPath();
      ctx.moveTo(-w * 0.5, -h * 0.15); ctx.lineTo(-w * 0.5, h * 0.15); ctx.lineTo(-w * 0.85 * flicker, 0);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = flash ? "#fff" : theme.color;
      ctx.beginPath();
      ctx.moveTo(w * 0.55, 0); ctx.lineTo(-w * 0.1, -h * 0.5); ctx.lineTo(-w * 0.45, -h * 0.2);
      ctx.lineTo(-w * 0.45, h * 0.2); ctx.lineTo(-w * 0.1, h * 0.5);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1.5; ctx.stroke();

      ctx.fillStyle = theme.dark;
      ctx.beginPath(); ctx.ellipse(w * 0.05, 0, w * 0.16, h * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#dff6ff";
      ctx.beginPath(); ctx.ellipse(w * 0.1, 0, w * 0.08, h * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    },

    drawRocket(r) {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.scale(r.vx >= 0 ? 1 : -1, 1);
      ctx.fillStyle = r.isCpu ? "#ff9f6b" : "#7fe8ff";
      ctx.beginPath();
      ctx.roundRect(-ARENA_ROCKET.radius * 2, -ARENA_ROCKET.radius * 0.7, ARENA_ROCKET.radius * 4, ARENA_ROCKET.radius * 1.4, ARENA_ROCKET.radius);
      ctx.fill();
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
      const s = this.state, p = s.playerFighter, c = s.cpuFighter;
      // Space backdrop only for a ship-vs-ship fight; any fight with a robot
      // uses the floor arena (the ship just flies over it).
      const bothShips = p && c && p.kind === "ship" && c.kind === "ship";
      if (bothShips) { this.drawSpaceBackdrop(); this.drawStarfield(); }
      else { this.drawBackground(); }
      if (!p) return;
      this.drawParticles();
      for (const r of s.rockets) this.drawRocket(r);
      // robots drawn first (on the ground, x-sorted for overlap), ships on top
      [p, c].filter((f) => f.kind !== "ship").sort((a, b) => a.x - b.x).forEach((f) => this.drawFighter(f));
      [p, c].filter((f) => f.kind === "ship").forEach((f) => this.drawShip(f));
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
        youFill: document.getElementById("arena-health-you-fill"),
        cpuFill: document.getElementById("arena-health-cpu-fill"),
        youLabel: document.getElementById("arena-label-you"),
        cpuLabel: document.getElementById("arena-label-cpu"),
      };

      arena.state.wins = arenaStore.getInt("wins", 0);
      arena.state.difficulty = arenaStore.getString("difficulty", "moderate", DIFFICULTIES);
      arena.state.playerKind = arenaStore.getString("playerKind", "robot", ARENA_KINDS);
      arena.state.cpuKind = arenaStore.getString("cpuKind", "robot", ARENA_KINDS);

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

        // Fighter-select overlay. The CPU's color is rolled once, right
        // when the player picks theirs, and stored alongside it -- so the
        // matchup preview shown here always matches who the match actually
        // starts against (no separate re-roll inside newMatch()).
        let selectedSide = null;
        let selectedCpuSide = null;
        const selectEl = document.getElementById("arena-select");
        const matchEl = document.getElementById("arena-match-view");
        const startBtn = document.getElementById("arena-start-btn");
        const matchupEl = document.getElementById("arena-matchup");
        const dpadEl = document.getElementById("arena-dpad");
        const youRobotBtn = document.getElementById("arena-you-robot");
        const youShipBtn = document.getElementById("arena-you-ship");
        const oppRobotBtn = document.getElementById("arena-opp-robot");
        const oppShipBtn = document.getElementById("arena-opp-ship");

        function refreshMatchupPreview() {
          if (!selectedSide) return;
          const theme = ARENA_FIGHTERS[selectedSide];
          const cpuTheme = ARENA_FIGHTERS[selectedCpuSide];
          document.getElementById("arena-matchup-you-badge").style.background = theme.color;
          document.getElementById("arena-matchup-you-name").textContent = arenaFighterName(selectedSide, arena.state.playerKind);
          document.getElementById("arena-matchup-cpu-badge").style.background = cpuTheme.color;
          document.getElementById("arena-matchup-cpu-name").textContent = arenaFighterName(selectedCpuSide, arena.state.cpuKind);
        }

        // Reflects the two kind toggles into: the toggle button states, the
        // color-choice button labels (named for the player's kind), the
        // control layout (hide left/right + punch/kick for a ship player,
        // show the fire button), and the matchup preview. Never resets color.
        function applyKinds() {
          const pk = arena.state.playerKind, ck = arena.state.cpuKind;
          youRobotBtn.classList.toggle("active", pk === "robot");
          youShipBtn.classList.toggle("active", pk === "ship");
          oppRobotBtn.classList.toggle("active", ck === "robot");
          oppShipBtn.classList.toggle("active", ck === "ship");
          document.querySelectorAll(".arena-fighter-btn").forEach((b) => {
            b.querySelector(".arena-fighter-btn-name").textContent = arenaFighterName(b.dataset.side, pk);
          });
          dpadEl.classList.toggle("ship-mode", pk === "ship");
          document.getElementById("arena-punch-btn").hidden = pk === "ship";
          document.getElementById("arena-kick-btn").hidden = pk === "ship";
          document.getElementById("arena-fire-btn").hidden = pk !== "ship";
          refreshMatchupPreview();
        }
        function pickPlayerKind(k) { if (k === arena.state.playerKind) return; arena.state.playerKind = k; arenaStore.setString("playerKind", k); applyKinds(); }
        function pickCpuKind(k) { if (k === arena.state.cpuKind) return; arena.state.cpuKind = k; arenaStore.setString("cpuKind", k); applyKinds(); }
        youRobotBtn.addEventListener("click", () => pickPlayerKind("robot"));
        youShipBtn.addEventListener("click", () => pickPlayerKind("ship"));
        oppRobotBtn.addEventListener("click", () => pickCpuKind("robot"));
        oppShipBtn.addEventListener("click", () => pickCpuKind("ship"));

        function pickSide(side) {
          selectedSide = side;
          const remaining = Object.keys(ARENA_FIGHTERS).filter((k) => k !== side);
          selectedCpuSide = remaining[Math.floor(Math.random() * remaining.length)];
          document.querySelectorAll(".arena-fighter-btn").forEach((b) => b.classList.toggle("selected", b.dataset.side === side));
          refreshMatchupPreview();
          matchupEl.hidden = false;
          startBtn.hidden = false;
        }
        document.querySelectorAll(".arena-fighter-btn").forEach((btn) => {
          btn.addEventListener("click", () => pickSide(btn.dataset.side));
        });
        arena.showSelect = () => {
          selectedSide = null;
          selectedCpuSide = null;
          document.querySelectorAll(".arena-fighter-btn").forEach((b) => b.classList.remove("selected"));
          matchupEl.hidden = true;
          startBtn.hidden = true;
          selectEl.hidden = false;
          matchEl.hidden = true;
          arena.stopLoop();
        };
        arena._applyKinds = applyKinds;
        applyKinds();
        startBtn.addEventListener("click", () => {
          if (!selectedSide) return;
          selectEl.hidden = true;
          matchEl.hidden = false;
          // sizeCanvas() reads the wrap's layout box via getBoundingClientRect(),
          // which is zero while matchEl is hidden -- must re-measure now that
          // it's visible, not rely on the one-time size from initCanvas().
          arena.sizeCanvas();
          arena.newMatch(selectedSide, selectedCpuSide);
          arena.startLoop();
        });

        document.getElementById("arena-rematch-btn").addEventListener("click", () => {
          hideModal(arena.els.resultModal);
          if (selectedSide) { arena.sizeCanvas(); arena.newMatch(selectedSide, selectedCpuSide); arena.startLoop(); }
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

        // Directional pad: left/right are robot-only (held, walk). Down
        // sets BOTH block (robot, held) and down (ship, held) -- harmless
        // dual-wiring, since updateFighter never reads `down` and
        // updateShip never reads `block`. Up sets BOTH jumpPressed
        // (robot, edge) and up (ship, held) the same way.
        const wireHold = (el, setter) => {
          el.addEventListener("pointerdown", (e) => { e.preventDefault(); setter(true); });
          ["pointerup", "pointercancel", "pointerleave"].forEach((evt) => el.addEventListener(evt, () => setter(false)));
        };
        wireHold(dpadEl.querySelector(".dpad-left"), (v) => { arena.state.playerInput.left = v; });
        wireHold(dpadEl.querySelector(".dpad-right"), (v) => { arena.state.playerInput.right = v; });
        wireHold(dpadEl.querySelector(".dpad-down"), (v) => { arena.state.playerInput.block = v; arena.state.playerInput.down = v; });
        wireHold(dpadEl.querySelector(".dpad-up"), (v) => { arena.state.playerInput.up = v; });
        dpadEl.querySelector(".dpad-up").addEventListener("pointerdown", (e) => { e.preventDefault(); arena.state.playerInput.jumpPressed = true; });

        document.getElementById("arena-punch-btn").addEventListener("pointerdown", (e) => { e.preventDefault(); arena.state.playerInput.punchPressed = true; });
        document.getElementById("arena-kick-btn").addEventListener("pointerdown", (e) => { e.preventDefault(); arena.state.playerInput.kickPressed = true; });
        document.getElementById("arena-fire-btn").addEventListener("pointerdown", (e) => { e.preventDefault(); arena.state.playerInput.firePressed = true; });

        document.addEventListener("keydown", arenaKeyDown);
        document.addEventListener("keyup", arenaKeyUp);

        window.addEventListener("resize", () => {
          if (router.current !== "arena") return;
          arena.sizeCanvas();
          arena.draw();
        });
      }

      arena.updateHeader();
      if (arena._applyKinds) arena._applyKinds(); // reflect stored kinds in the config UI
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
    const input = arena.state.playerInput;
    if (k === "arrowleft" || k === "a") { e.preventDefault(); input.left = true; return; }
    if (k === "arrowright" || k === "d") { e.preventDefault(); input.right = true; return; }
    if (k === "arrowdown" || k === "s") { e.preventDefault(); input.block = true; input.down = true; return; }
    if (k === "arrowup" || k === "w") {
      e.preventDefault();
      input.up = true;
      if (!e.repeat) input.jumpPressed = true;
      return;
    }
    if ((k === "j" || k === "1" || k === " ") && !e.repeat) { input.punchPressed = true; input.firePressed = true; return; }
    if ((k === "k" || k === "2") && !e.repeat) { input.kickPressed = true; }
  }

  function arenaKeyUp(e) {
    if (router.current !== "arena" || !arena.state.playerInput) return;
    const k = e.key.toLowerCase();
    const input = arena.state.playerInput;
    if (k === "arrowleft" || k === "a") input.left = false;
    if (k === "arrowright" || k === "d") input.right = false;
    if (k === "arrowdown" || k === "s") { input.block = false; input.down = false; }
    if (k === "arrowup" || k === "w") input.up = false;
  }
  // Debug handle (read-only introspection for manual testing; harmless).
  try { if (typeof window !== "undefined") window.__arena = arena; } catch (e) { /* ignore */ }

  // ================================================================
  // 21. PIPE FLOW — rotate the pipes to connect the source to the drain
  // ================================================================
  // Game logic first (plain functions, no DOM), then the canvas + screen
  // wiring below it. Each tile is 4 sides, each open or closed; tapping
  // rotates which sides are open; flow is a flood-fill from the source.
  const PIPE_N = 1, PIPE_E = 2, PIPE_S = 4, PIPE_W = 8;

  // Each side of a tile is one bit. `opp` is the side a neighbor sees us
  // from; dr/dc is the step to that neighbor (row, column).
  const PIPE_DIRS = [
    { bit: PIPE_N, opp: PIPE_S, dr: -1, dc: 0 },
    { bit: PIPE_E, opp: PIPE_W, dr: 0, dc: 1 },
    { bit: PIPE_S, opp: PIPE_N, dr: 1, dc: 0 },
    { bit: PIPE_W, opp: PIPE_E, dr: 0, dc: -1 },
  ];

  // Pipe shapes: name -> which sides are open at rotation 0.
  // To add a new shape, add a line here (and let a tier use it below).
  const PIPE_TYPES = {
    straight: PIPE_N | PIPE_S,
    elbow: PIPE_N | PIPE_E,
    tee: PIPE_N | PIPE_E | PIPE_W,
    cross: PIPE_N | PIPE_E | PIPE_S | PIPE_W,
    cap: PIPE_N,
  };

  // Difficulty: board size, how often a path tile sprouts a dead-end branch
  // (that's what creates tees and crosses), and which shapes may appear as
  // filler. maxBranches 1 => tees only; 2 => crosses are possible too.
  const PIPE_TIERS = {
    simple:    { size: 5, branchChance: 0,    maxBranches: 0, decoyTypes: ["straight", "elbow"] },
    moderate:  { size: 6, branchChance: 0.45, maxBranches: 1, decoyTypes: ["straight", "elbow", "tee"] },
    difficult: { size: 7, branchChance: 0.55, maxBranches: 2, decoyTypes: ["straight", "elbow", "tee", "cross"] },
  };

  // Turn a mask 90 degrees clockwise: N->E->S->W->N.
  function pipeRotateMask(m) { return ((m << 1) | (m >> 3)) & 15; }

  function pipeMask(tile) {
    let m = PIPE_TYPES[tile.type];
    for (let i = 0; i < tile.rot; i++) m = pipeRotateMask(m);
    return m;
  }

  // Reverse lookup: which {type, rot} produces this mask? Built once from
  // PIPE_TYPES so the generator never needs to hard-code shapes.
  const PIPE_SHAPE_FOR_MASK = (() => {
    const table = {};
    for (const type of Object.keys(PIPE_TYPES)) {
      let m = PIPE_TYPES[type];
      for (let rot = 0; rot < 4; rot++) {
        if (!(m in table)) table[m] = { type, rot };
        m = pipeRotateMask(m);
      }
    }
    return table;
  })();

  // Flood-fill from the source through sides that are open on BOTH tiles.
  // Returns the set of "wet" tile indexes.
  function pipeComputeFlow(board) {
    const size = board.size, wet = new Set([board.source]), stack = [board.source];
    while (stack.length) {
      const idx = stack.pop();
      const r = Math.floor(idx / size), c = idx % size;
      const mask = pipeMask(board.tiles[idx]);
      for (const d of PIPE_DIRS) {
        if (!(mask & d.bit)) continue;
        const nr = r + d.dr, nc = c + d.dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        const nIdx = nr * size + nc;
        if (wet.has(nIdx)) continue;
        if (pipeMask(board.tiles[nIdx]) & d.opp) { wet.add(nIdx); stack.push(nIdx); }
      }
    }
    return wet;
  }

  function pipeIsSolved(board) { return pipeComputeFlow(board).has(board.drain); }

  function pipePick(list, rand) { return list[Math.floor(rand() * list.length)]; }

  // Random self-avoiding walk from source to drain. If the random walk
  // takes too long (rare), fall back to a guaranteed simple route.
  function pipeRandomPath(size, srcRow, dstRow, rand) {
    const target = dstRow * size + (size - 1);
    const start = srcRow * size;
    const minLen = size + 2;
    for (let attempt = 0; attempt < 40; attempt++) {
      const visited = new Set([start]);
      const path = [start];
      let budget = 4000;
      const walk = (idx) => {
        if (idx === target) return path.length >= minLen || attempt === 39;
        if (--budget < 0) return false;
        const r = Math.floor(idx / size), c = idx % size;
        const order = PIPE_DIRS.slice().sort(() => rand() - 0.5);
        for (const d of order) {
          const nr = r + d.dr, nc = c + d.dc;
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
          const nIdx = nr * size + nc;
          if (visited.has(nIdx)) continue;
          visited.add(nIdx); path.push(nIdx);
          if (walk(nIdx)) return true;
          visited.delete(nIdx); path.pop();
        }
        return false;
      };
      if (walk(start)) return path;
    }
    // Fallback: along the source row, then up/down the last column.
    const path = [];
    for (let c = 0; c < size; c++) path.push(srcRow * size + c);
    const step = dstRow >= srcRow ? 1 : -1;
    for (let r = srcRow + step; r !== dstRow + step; r += step) path.push(r * size + (size - 1));
    return path;
  }

  // Builds a SOLVED board (so it's always solvable), before scrambling.
  function pipeGenerateSolved(tierName, rand) {
    const tier = PIPE_TIERS[tierName] || PIPE_TIERS.moderate;
    const size = tier.size;
    const srcRow = Math.floor(rand() * size), dstRow = Math.floor(rand() * size);
    const path = pipeRandomPath(size, srcRow, dstRow, rand);
    const source = path[0], drain = path[path.length - 1];

    // Which sides each cell must have open, from the path itself.
    const edges = new Array(size * size).fill(0);
    edges[source] |= PIPE_W; // water arrives from the left edge
    edges[drain] |= PIPE_E;  // and leaves through the right edge
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i], b = path[i + 1];
      const dr = Math.floor(b / size) - Math.floor(a / size), dc = (b % size) - (a % size);
      const d = PIPE_DIRS.find((x) => x.dr === dr && x.dc === dc);
      edges[a] |= d.bit; edges[b] |= d.opp;
    }

    // Dead-end branches off middle path tiles: this is where tees/crosses come from.
    for (let i = 1; i + 1 < path.length && tier.maxBranches > 0; i++) {
      const idx = path[i], r = Math.floor(idx / size), c = idx % size;
      let added = 0;
      for (const d of PIPE_DIRS.slice().sort(() => rand() - 0.5)) {
        if (added >= tier.maxBranches || rand() >= tier.branchChance) continue;
        const nr = r + d.dr, nc = c + d.dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        const nIdx = nr * size + nc;
        if ((edges[idx] & d.bit) || edges[nIdx] !== 0) continue; // side taken / cell used
        edges[idx] |= d.bit; edges[nIdx] |= d.opp; added++;
      }
    }

    const tiles = edges.map((mask, idx) => {
      const fixed = idx === source || idx === drain;
      if (mask === 0) {
        return { type: pipePick(tier.decoyTypes, rand), rot: Math.floor(rand() * 4), fixed: false };
      }
      const shape = PIPE_SHAPE_FOR_MASK[mask];
      return { type: shape.type, rot: shape.rot, fixed };
    });
    return { size, tiles, source, drain };
  }

  // Randomly rotate every non-fixed tile, re-rolling if it lands solved.
  function pipeScramble(board, rand) {
    for (let attempt = 0; attempt < 50; attempt++) {
      for (const t of board.tiles) if (!t.fixed) t.rot = Math.floor(rand() * 4);
      if (!pipeIsSolved(board)) return board;
    }
    // Pathological case: nudge one rotatable, asymmetric tile off its answer.
    for (const t of board.tiles) {
      if (t.fixed) continue;
      const before = pipeMask(t);
      t.rot = (t.rot + 1) % 4;
      if (pipeMask(t) !== before && !pipeIsSolved(board)) return board;
    }
    return board;
  }

  function pipeNewBoard(tierName, rand) {
    return pipeScramble(pipeGenerateSolved(tierName, rand), rand);
  }

  const pipesStore = makeStore("pipes");

  // Liquid colors. `tint` is the faint glow on a wet tile's background;
  // `blur` is how much the liquid glows (0 = none).
  const PIPE_LIQUIDS = {
    water: { name: "Water", wet: "#3aa8ff", tint: "#17262f", blur: 0, glow: "rgba(58,168,255,0.6)" },
    radioactive: { name: "Radioactive", wet: "#9dff3a", tint: "#1b2813", blur: 14, glow: "rgba(157,255,58,0.9)" },
  };
  const PIPE_ROTATE_MS = 130;
  const PIPE_GUTTER_CELLS = 0.85; // width of the start/goal margins, in tiles
  const PIPE_START_COLOR = "#4cd964", PIPE_GOAL_COLOR = "#ffc83a";

  const pipes = {
    canvas: null, ctx: null,
    cellPx: 56,
    gutter: 44, // empty margin left/right of the grid, where the tap and barrel sit
    animId: null,
    els: {},
    state: {
      difficulty: "moderate", liquid: "water",
      board: null, wet: new Set(),
      moves: 0, solved: 0,
      won: false, paused: false,
    },

    // --- Setup ---
    initCanvas() {
      this.canvas = document.getElementById("pipes-canvas");
      this.ctx = this.canvas.getContext("2d");
      this.sizeCanvas();
    },

    sizeCanvas() {
      const s = this.state;
      const size = s.board ? s.board.size : (PIPE_TIERS[s.difficulty] || PIPE_TIERS.moderate).size;
      const wrap = this.canvas.parentElement;
      const rect = wrap.getBoundingClientRect();
      // The grid plus a margin on each side (GUTTER_CELLS of a tile wide) for the start tap and goal barrel.
      const availW = Math.max(160, rect.width - 8), availH = Math.max(120, rect.height - 8);
      this.cellPx = Math.max(24, Math.min(80, Math.floor(Math.min(availW / (size + 2 * PIPE_GUTTER_CELLS), availH / size))));
      this.gutter = Math.round(this.cellPx * PIPE_GUTTER_CELLS);
      const w = this.cellPx * size + 2 * this.gutter, h = this.cellPx * size;
      this.canvas.width = w; this.canvas.height = h;
      this.canvas.style.width = w + "px"; this.canvas.style.height = h + "px";
    },

    newPuzzle() {
      const s = this.state;
      s.board = pipeNewBoard(s.difficulty, Math.random);
      s.wet = pipeComputeFlow(s.board);
      s.moves = 0; s.won = false;
      this.sizeCanvas();
      this.updateStatus();
      this.draw(performance.now());
    },

    // --- Input: tap a tile to rotate it a quarter turn clockwise ---
    getCanvasPoint(e) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
        y: (e.clientY - rect.top) * (this.canvas.height / rect.height),
      };
    },

    onCanvasDown(e) {
      const s = this.state;
      if (s.won || s.paused || !s.board) return;
      const p = this.getCanvasPoint(e);
      const c = Math.floor((p.x - this.gutter) / this.cellPx), r = Math.floor(p.y / this.cellPx);
      const size = s.board.size;
      if (r < 0 || r >= size || c < 0 || c >= size) return;
      const tile = s.board.tiles[r * size + c];
      if (tile.fixed) return; // source and drain don't turn
      tile.rot = (tile.rot + 1) % 4;
      tile.animStart = performance.now();
      s.moves++;
      s.wet = pipeComputeFlow(s.board);
      this.updateStatus();
      this.draw(tile.animStart);
      this.kickAnim();
      if (s.wet.has(s.board.drain)) this.onWin();
    },

    onWin() {
      const s = this.state;
      s.won = true;
      s.solved++;
      pipesStore.setInt("solvedCount", s.solved);
      this.els.solvedCount.textContent = String(s.solved);
      document.getElementById("pipes-win-moves").textContent = String(s.moves);
      document.getElementById("pipes-win-total").textContent = String(s.solved);
      // Let the last rotation finish and the liquid reach the drain first.
      setTimeout(() => {
        if (router.current === "pipes" && s.won) showModal(this.els.winModal);
      }, 550);
    },

    updateStatus() {
      this.els.moveCount.textContent = String(this.state.moves);
      this.els.difficultyLabel.textContent = DIFFICULTIES[this.state.difficulty] || "Moderate";
    },

    // --- Drawing ---
    // Only runs frames while a tile is mid-turn; otherwise the board is static.
    kickAnim() {
      if (this.animId) return;
      const step = () => {
        this.animId = null;
        const now = performance.now();
        this.draw(now);
        if (this.isAnimating(now)) this.animId = requestAnimationFrame(step);
      };
      this.animId = requestAnimationFrame(step);
    },

    isAnimating(now) {
      const b = this.state.board;
      return !!b && b.tiles.some((t) => t.animStart && now - t.animStart < PIPE_ROTATE_MS);
    },

    stopAnim() {
      if (this.animId) { cancelAnimationFrame(this.animId); this.animId = null; }
    },

    // Strokes one pipe tile's shape: a line from the tile center to every
    // open side, or a quarter-circle arc for elbows (the curved look).
    strokePipe(x0, y0, mask, width, color) {
      const ctx = this.ctx, cp = this.cellPx, h = cp / 2;
      const cx = x0 + h, cy = y0 + h;
      ctx.strokeStyle = color; ctx.fillStyle = color;
      ctx.lineWidth = width; ctx.lineCap = "butt";
      ctx.beginPath();
      const arc = { 3: [1, 0, Math.PI / 2, Math.PI], 6: [1, 1, Math.PI, Math.PI * 1.5],
                    12: [0, 1, Math.PI * 1.5, Math.PI * 2], 9: [0, 0, 0, Math.PI / 2] }[mask];
      if (arc) {
        ctx.arc(x0 + arc[0] * cp, y0 + arc[1] * cp, h, arc[2], arc[3]);
        ctx.stroke();
        return;
      }
      for (const d of PIPE_DIRS) {
        if (!(mask & d.bit)) continue;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + d.dc * h, cy + d.dr * h);
      }
      ctx.stroke();
      // Round hub where lines meet (tees, crosses, dead-end caps).
      ctx.beginPath(); ctx.arc(cx, cy, width / 2, 0, Math.PI * 2); ctx.fill();
    },

    drawTile(idx, now) {
      const s = this.state, ctx = this.ctx, cp = this.cellPx;
      const liquid = PIPE_LIQUIDS[s.liquid] || PIPE_LIQUIDS.water;
      const size = s.board.size, r = Math.floor(idx / size), c = idx % size;
      const tile = s.board.tiles[idx];
      const x0 = this.gutter + c * cp, y0 = r * cp, cx = x0 + cp / 2, cy = y0 + cp / 2;
      const isSource = idx === s.board.source, isDrain = idx === s.board.drain;
      const isWet = s.wet.has(idx);

      ctx.save();
      ctx.beginPath(); ctx.rect(x0, y0, cp, cp); ctx.clip();
      // Start and goal tiles get their own color so they stand out from the pipes.
      ctx.fillStyle = isSource ? "#1d3a26" : isDrain ? (isWet ? "#4a3d12" : "#3a2f10") : isWet ? liquid.tint : "#1c1a22";
      ctx.fillRect(x0, y0, cp, cp);
      if (isSource || isDrain) {
        ctx.strokeStyle = isSource ? PIPE_START_COLOR : PIPE_GOAL_COLOR;
        ctx.lineWidth = 3;
        ctx.strokeRect(x0 + 1.5, y0 + 1.5, cp - 3, cp - 3);
      } else {
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, cp - 1, cp - 1);
      }

      // Mid-turn: draw the pipe rotated back toward where it started.
      let angle = 0;
      if (tile.animStart) {
        const p = Math.min(1, (now - tile.animStart) / PIPE_ROTATE_MS);
        angle = -(1 - (1 - Math.pow(1 - p, 3))) * (Math.PI / 2);
      }
      ctx.translate(cx, cy); ctx.rotate(angle); ctx.translate(-cx, -cy);
      const mask = pipeMask(tile);
      this.strokePipe(x0, y0, mask, cp * 0.34, "#6d6a78");
      if (isWet && liquid.blur) { ctx.shadowColor = liquid.glow; ctx.shadowBlur = liquid.blur; }
      this.strokePipe(x0, y0, mask, cp * 0.2, isWet ? liquid.wet : "#2b2933");
      ctx.restore();

      if (isSource) this.drawStart(cy, liquid);
      if (isDrain) this.drawGoal(cy, isWet, liquid);
    },

    // A short pipe stub from the margin into the grid, so the tap/barrel
    // visibly plug into the board.
    drawStub(x1, x2, cy, wetColor, liquid) {
      const ctx = this.ctx, cp = this.cellPx;
      ctx.fillStyle = "#6d6a78";
      ctx.fillRect(Math.min(x1, x2), cy - cp * 0.17, Math.abs(x2 - x1), cp * 0.34);
      if (wetColor && liquid.blur) { ctx.save(); ctx.shadowColor = liquid.glow; ctx.shadowBlur = liquid.blur; }
      ctx.fillStyle = wetColor || "#2b2933";
      ctx.fillRect(Math.min(x1, x2), cy - cp * 0.1, Math.abs(x2 - x1), cp * 0.2);
      if (wetColor && liquid.blur) ctx.restore();
    },

    // Label sits just below an icon, or just above it when the icon is in
    // the lower half of the board (so it never runs off the canvas).
    label(text, x, cy, halfH, color) {
      const ctx = this.ctx;
      const above = cy > this.canvas.height / 2;
      ctx.font = "bold " + Math.max(9, Math.round(this.cellPx * 0.2)) + "px system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = above ? "bottom" : "top";
      ctx.fillStyle = color;
      ctx.fillText(text, x, above ? cy - halfH - 3 : cy + halfH + 3);
    },

    // START: a big red tap in the left margin, always flowing.
    drawStart(cy, liquid) {
      const ctx = this.ctx, cp = this.cellPx, g = this.gutter;
      this.drawStub(g * 0.45, g, cy, liquid.wet, liquid);
      const tx = g * 0.45, r = cp * 0.26;
      ctx.fillStyle = "#8a8795";
      ctx.fillRect(tx - r * 0.35, cy - cp * 0.2, r * 0.7, cp * 0.4);
      ctx.fillStyle = "#e0453f";
      ctx.beginPath(); ctx.arc(tx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(tx - r * 0.6, cy); ctx.lineTo(tx + r * 0.6, cy);
      ctx.moveTo(tx, cy - r * 0.6); ctx.lineTo(tx, cy + r * 0.6);
      ctx.stroke();
      this.label("START", tx, cy, cp * 0.26, PIPE_START_COLOR);
    },

    // GOAL: a glowing gold barrel in the right margin; fills when liquid arrives.
    drawGoal(cy, isWet, liquid) {
      const ctx = this.ctx, cp = this.cellPx, g = this.gutter;
      const xr = g + this.state.board.size * cp;
      this.drawStub(xr, xr + g * 0.2, cy, isWet ? liquid.wet : null, liquid);
      const bw = g * 0.52, bh = cp * 0.95, bx = xr + g * 0.2, by = cy - bh / 2;
      ctx.save();
      ctx.shadowColor = PIPE_GOAL_COLOR; ctx.shadowBlur = isWet ? 18 : 12;
      ctx.fillStyle = "#4a4655";
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = PIPE_GOAL_COLOR; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.stroke();
      ctx.save();
      if (isWet && liquid.blur) { ctx.shadowColor = liquid.glow; ctx.shadowBlur = liquid.blur; }
      ctx.fillStyle = isWet ? liquid.wet : "#25232c";
      ctx.beginPath(); ctx.roundRect(bx + 4, by + 4, bw - 8, bh - 8, 4); ctx.fill();
      ctx.restore();
      this.label("GOAL", bx + bw / 2, cy, bh / 2, PIPE_GOAL_COLOR);
    },

    draw(now) {
      const s = this.state;
      if (!this.ctx || !s.board) return;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      for (let i = 0; i < s.board.tiles.length; i++) this.drawTile(i, now == null ? performance.now() : now);
    },
  };

  modules.pipes = {
    _wired: false,

    onEnter() {
      pipes.initCanvas();
      pipes.els = {
        solvedCount: document.getElementById("pipes-solved-count"),
        moveCount: document.getElementById("pipes-move-count"),
        difficultyLabel: document.getElementById("pipes-difficulty-label"),
        settingsModal: document.getElementById("pipes-settings-modal"),
        winModal: document.getElementById("pipes-win-modal"),
      };

      pipes.state.solved = pipesStore.getInt("solvedCount", 0);
      pipes.state.difficulty = pipesStore.getString("difficulty", "moderate", DIFFICULTIES);
      pipes.state.liquid = pipesStore.getString("liquid", "water", PIPE_LIQUIDS);
      pipes.els.solvedCount.textContent = String(pipes.state.solved);

      if (!this._wired) {
        this._wired = true;
        wireModal(pipes.els.settingsModal);
        wireModal(pipes.els.winModal);

        document.getElementById("pipes-settings-btn").addEventListener("click", () => {
          pipes.state.paused = true;
          const m = pipes.els.settingsModal;
          m.querySelectorAll('input[name="pipes-difficulty"]').forEach((r) => { r.checked = r.value === pipes.state.difficulty; });
          m.querySelectorAll('input[name="pipes-liquid"]').forEach((r) => { r.checked = r.value === pipes.state.liquid; });
          showModal(m);
        });
        pipes.els.settingsModal.addEventListener("click", (e) => {
          if (e.target instanceof HTMLElement && e.target.hasAttribute("data-close")) pipes.state.paused = false;
        });
        pipes.els.settingsModal.querySelectorAll('input[name="pipes-difficulty"]').forEach((r) => r.addEventListener("change", (e) => {
          if (!DIFFICULTIES[e.target.value] || e.target.value === pipes.state.difficulty) return;
          pipes.state.difficulty = e.target.value;
          pipesStore.setString("difficulty", e.target.value);
          pipes.newPuzzle();
        }));
        pipes.els.settingsModal.querySelectorAll('input[name="pipes-liquid"]').forEach((r) => r.addEventListener("change", (e) => {
          if (!PIPE_LIQUIDS[e.target.value]) return;
          pipes.state.liquid = e.target.value;
          pipesStore.setString("liquid", e.target.value);
          pipes.draw();
        }));
        document.getElementById("pipes-reset-count-btn").addEventListener("click", () => {
          if (!window.confirm("Reset the number of puzzles solved back to 0?")) return;
          pipes.state.solved = 0; pipesStore.setInt("solvedCount", 0);
          pipes.els.solvedCount.textContent = "0";
        });

        document.getElementById("pipes-next-btn").addEventListener("click", () => {
          hideModal(pipes.els.winModal);
          pipes.newPuzzle();
        });

        // Step-by-step tutorial navigation (same pattern as Bubble Blast / Space Ranger)
        let tutStep = 0;
        const tutSteps = document.querySelectorAll(".pipes-tut-step");
        const tutPrev = document.getElementById("pipes-tut-prev");
        const tutNext = document.getElementById("pipes-tut-next");
        function showTutStep() {
          tutSteps.forEach((st, i) => { st.hidden = i !== tutStep; });
          tutPrev.hidden = tutStep === 0;
          tutNext.textContent = tutStep === tutSteps.length - 1 ? "Let's flow!" : "Next →";
        }
        tutNext.addEventListener("click", () => {
          if (tutStep < tutSteps.length - 1) { tutStep++; showTutStep(); }
          else {
            pipesStore.setBool("tutorialSeen", true);
            hideModal(document.getElementById("pipes-tutorial-modal"));
            pipes.state.paused = false;
          }
        });
        tutPrev.addEventListener("click", () => {
          if (tutStep > 0) { tutStep--; showTutStep(); }
        });

        pipes.canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); pipes.onCanvasDown(e); });

        window.addEventListener("resize", () => {
          if (router.current !== "pipes") return;
          pipes.sizeCanvas();
          pipes.draw();
        });
      }

      pipes.state.paused = false;
      pipes.newPuzzle();

      if (!pipesStore.getBool("tutorialSeen")) {
        pipes.state.paused = true;
        showModal(document.getElementById("pipes-tutorial-modal"));
      }
    },

    onLeave() {
      pipes.stopAnim();
      pipes.state.paused = true;
      hideModal(pipes.els.winModal);
      hideModal(pipes.els.settingsModal);
      hideModal(document.getElementById("pipes-tutorial-modal"));
    },
  };

  // ================================================================
  // 22. TANK DUEL — landscape turn-based artillery duel
  // ================================================================
  // Pure physics/terrain/AI first (no DOM, unit-tested), then the canvas
  // module. The match renders a landscape world; on a portrait phone the
  // whole world (battlefield + HUD + buttons) is rotated 90° so turning
  // the phone makes it upright even with the rotation lock on.
  // --- Data tables -------------------------------------------------------
  // Tank colors the players can pick. body = hull/turret, dark = treads/shade.
  const TANK_COLORS = {
    red:    { name: "Red",    body: "#e0455a", dark: "#7a1f2b" },
    blue:   { name: "Blue",   body: "#3ac7d6", dark: "#1a5a63" },
    green:  { name: "Green",  body: "#5fd068", dark: "#256b2c" },
    yellow: { name: "Yellow", body: "#f2c94c", dark: "#8a6a12" },
    purple: { name: "Purple", body: "#a95fe0", dark: "#4e2b6e" },
    orange: { name: "Orange", body: "#ff9f43", dark: "#8a4a12" },
  };

  // Weapons. radius/crater are fractions of worldW; maxDmg is the damage of a
  // near-direct hit (within half the blast radius); gravMult heavies the arc.
  // shots>1 fires a small fan (spread). Every weapon is unlimited.
  // ammo = shots allowed per tank per match (0 = unlimited). Only the
  // Standard shell is unlimited; Heavy and Spread are rationed.
  const TANK_WEAPONS = {
    standard: { name: "Standard", radius: 0.045, crater: 0.045, maxDmg: 1, gravMult: 1.0, shots: 1, spreadDeg: 0, color: "#ffd24a", ammo: 0 },
    heavy:    { name: "Heavy",    radius: 0.075, crater: 0.08,  maxDmg: 2, gravMult: 1.35, shots: 1, spreadDeg: 0, color: "#ff6b3a", ammo: 3 },
    spread:   { name: "Spread",   radius: 0.03,  crater: 0.028, maxDmg: 1, gravMult: 1.0, shots: 3, spreadDeg: 7, color: "#7fe8ff", ammo: 3 },
  };
  const TANK_WEAPON_ORDER = ["standard", "heavy", "spread"];

  // CPU difficulty: how fine its aim search is, how much random error it adds
  // (degrees / power points), and how often it bothers to reposition. Same
  // "tune behavior, not raw stats" idea as ARENA_TIERS.
  const TANK_TIERS = {
    simple:    { angleStep: 7,   powerStep: 10, angleErr: 8,   powerErr: 14,  moveChance: 0.0 },
    moderate:  { angleStep: 4,   powerStep: 6,  angleErr: 2.5, powerErr: 5,   moveChance: 0.25 },
    difficult: { angleStep: 2,   powerStep: 3,  angleErr: 0.8, powerErr: 1.8, moveChance: 0.5 },
  };

  const TANK_MAX_HP = 5;

  // --- Physics config, scaled to the field size so play feels the same on a
  // phone or a wide desktop window. -----------------------------------------
  function tankCfg(worldW, worldH) {
    return {
      worldW, worldH,
      gravity: worldW * 1.2,      // px/s^2
      vmax: worldW * 1.18,        // px/s at power 100, 45deg -> ~1.15*worldW range
      windAccel: worldW * 0.14,   // px/s^2 at |wind|=1
      groundMin: worldH * 0.34,   // highest the terrain may rise (smallest y)
      groundMax: worldH * 0.9,    // lowest it may sink
      tankR: Math.max(10, worldW * 0.016),
      fuelPx: worldW * 0.2,       // full fuel buys 20% of field width of travel
    };
  }

  // --- Terrain -----------------------------------------------------------
  // ground[x] = surface y for each pixel column. Random each match; flattened
  // pads under the two spawn columns so a tank never starts on a spike.
  function tankGenTerrain(cfg, rand, p1x, p2x) {
    const W = cfg.worldW, H = cfg.worldH;
    const ground = new Float64Array(W);
    const base = (cfg.groundMin + cfg.groundMax) / 2;
    const amp = (cfg.groundMax - cfg.groundMin) * 0.5;
    // A few random sine layers.
    const layers = [];
    const nLayers = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < nLayers; i++) {
      layers.push({
        k: (0.4 + rand() * 2.6) * (Math.PI * 2) / W, // wavelength
        phase: rand() * Math.PI * 2,
        a: amp * (0.15 + rand() * 0.55) / nLayers * (1 + i * 0.3),
      });
    }
    for (let x = 0; x < W; x++) {
      let y = base;
      for (const l of layers) y += Math.sin(x * l.k + l.phase) * l.a;
      ground[x] = y;
    }
    // One midpoint-displacement pass for roughness.
    const disp = amp * 0.35;
    (function md(lo, hi, d) {
      if (hi - lo < 8) return;
      const mid = (lo + hi) >> 1;
      ground[mid] = (ground[lo] + ground[hi]) / 2 + (rand() * 2 - 1) * d;
      md(lo, mid, d * 0.55); md(mid, hi, d * 0.55);
    })(0, W - 1, disp);
    // Smooth, then clamp.
    for (let pass = 0; pass < 2; pass++) {
      const copy = ground.slice();
      for (let x = 1; x < W - 1; x++) ground[x] = (copy[x - 1] + copy[x] * 2 + copy[x + 1]) / 4;
    }
    for (let x = 0; x < W; x++) ground[x] = Math.max(cfg.groundMin, Math.min(cfg.groundMax, ground[x]));
    // Flatten a pad under each spawn.
    tankFlattenPad(ground, p1x, Math.round(cfg.tankR * 2.2));
    tankFlattenPad(ground, p2x, Math.round(cfg.tankR * 2.2));
    return ground;
  }

  function tankFlattenPad(ground, cx, half) {
    const W = ground.length;
    const lo = Math.max(0, cx - half), hi = Math.min(W - 1, cx + half);
    let sum = 0, n = 0;
    for (let x = lo; x <= hi; x++) { sum += ground[x]; n++; }
    const level = sum / n;
    for (let x = lo; x <= hi; x++) ground[x] = level;
  }

  // Dig a crater: raise ground[x] (increase y) by the circular chord. Only ever
  // lowers the surface, only within the radius.
  function tankCarve(ground, cfg, ex, ey, r) {
    const W = ground.length;
    const lo = Math.max(0, Math.floor(ex - r)), hi = Math.min(W - 1, Math.ceil(ex + r));
    for (let x = lo; x <= hi; x++) {
      const dx = x - ex, inside = r * r - dx * dx;
      if (inside <= 0) continue;
      const chord = Math.sqrt(inside);
      const craterBottom = ey + chord;          // deepest point of the dig at this column
      if (craterBottom > ground[x]) ground[x] = Math.min(cfg.groundMax, craterBottom);
    }
  }

  // --- Projectile trace --------------------------------------------------
  // One function powers the aim preview, the live animation, and the CPU
  // search, so they can never disagree. Returns the path points and where it
  // stopped. tanks (optional) = [{x,y,r,idx}] to stop on a tank hit.
  function tankTrace(cfg, ground, x0, y0, vx0, vy0, wind, gravMult, tanks) {
    const g = cfg.gravity * (gravMult || 1), wa = cfg.windAccel * wind;
    const dt = 1 / 120, maxT = 12;
    let x = x0, y = y0, vx = vx0, vy = vy0, t = 0, step = 0;
    const points = [{ x, y }];
    while (t < maxT) {
      vx += wa * dt; vy += g * dt;
      x += vx * dt; y += vy * dt; t += dt;
      step++;
      if (step % 3 === 0) points.push({ x, y }); // record the arc ~40x/sec so it can be animated
      if (x < 0) return { points, stop: { type: "edgeL", x, y } };
      if (x >= cfg.worldW) return { points, stop: { type: "edgeR", x, y } };
      if (tanks) {
        for (const tk of tanks) {
          const ddx = x - tk.x, ddy = y - tk.y;
          if (ddx * ddx + ddy * ddy <= tk.r * tk.r) {
            points.push({ x, y });
            return { points, stop: { type: "tank", x, y, idx: tk.idx } };
          }
        }
      }
      if (y >= 0) {
        const gx = Math.max(0, Math.min(cfg.worldW - 1, Math.round(x)));
        if (y >= ground[gx]) { points.push({ x, y }); return { points, stop: { type: "ground", x, y } }; }
      }
    }
    return { points, stop: { type: "timeout", x, y } };
  }

  // angle(deg) 0=right,90=up,180=left ; power 0..100 -> initial velocity.
  function tankAimVelocity(cfg, angle, power) {
    const v0 = (power / 100) * cfg.vmax, rad = angle * Math.PI / 180;
    return { vx: Math.cos(rad) * v0, vy: -Math.sin(rad) * v0 };
  }

  // --- Blast damage ------------------------------------------------------
  // Within half the radius -> full weapon damage; within the radius -> a 1-dmg
  // graze; outside -> nothing.
  function tankBlastDamage(weapon, dist, radiusPx) {
    if (dist > radiusPx) return 0;
    if (dist <= radiusPx * 0.5) return weapon.maxDmg;
    return 1;
  }

  // --- CPU shot search ---------------------------------------------------
  // Headlessly simulate a grid of (angle,power) shots, keep the one landing
  // nearest the foe, then add difficulty-scaled aim error. me/foe = {x,y}.
  function tankCpuChooseShot(cfg, ground, tier, me, foe, wind, gravMult, rand) {
    const aimRight = foe.x > me.x;
    const loA = aimRight ? 20 : 95, hiA = aimRight ? 85 : 160;
    let best = null, bestErr = Infinity;
    for (let a = loA; a <= hiA; a += tier.angleStep) {
      for (let p = 30; p <= 100; p += tier.powerStep) {
        const v = tankAimVelocity(cfg, a, p);
        const res = tankTrace(cfg, ground, me.x, me.y, v.vx, v.vy, wind, gravMult, null);
        const err = Math.abs(res.stop.x - foe.x) + Math.abs(res.stop.y - foe.y) * 0.3;
        if (err < bestErr) { bestErr = err; best = { angle: a, power: p }; }
      }
    }
    if (!best) best = { angle: aimRight ? 50 : 130, power: 70 };
    const r = rand || Math.random;
    return {
      angle: Math.max(5, Math.min(175, best.angle + (r() * 2 - 1) * tier.angleErr)),
      power: Math.max(10, Math.min(100, best.power + (r() * 2 - 1) * tier.powerErr)),
      searchErr: bestErr,
    };
  }

  const tankStore = makeStore("tank");

  // On-screen control geometry is computed per-frame from the world size and
  // stashed here so pointer hit-testing uses exactly what was drawn.
  const tank = {
    canvas: null, ctx: null,
    animId: null, lastT: 0,
    els: {},
    rotated: false, worldW: 800, worldH: 380,
    state: {
      mode: "cpu", difficulty: "moderate",
      p1Color: "red", p2Color: "blue",
      cfg: null, ground: null,
      tanks: [], active: 0,
      phase: "aiming",            // aiming | firing | over
      wind: 0, weaponIdx: 0,
      aiming: false, aimX: 0, aimY: 0,
      projectiles: [], particles: [], explosions: [],
      buttons: [], heldMove: 0,
      cpuTimer: 0, turnMsg: "", msgTimer: 0,
      winner: -1,
    },

    // --- Setup / world transform ----------------------------------------
    initCanvas() {
      this.canvas = document.getElementById("tank-canvas");
      this.ctx = this.canvas.getContext("2d");
      this.sizeCanvas();
    },

    sizeCanvas() {
      const wrap = this.canvas.parentElement;
      const rect = wrap.getBoundingClientRect();
      const cw = Math.max(240, Math.floor(rect.width)), ch = Math.max(200, Math.floor(rect.height));
      this.canvas.width = cw; this.canvas.height = ch;
      this.canvas.style.width = cw + "px"; this.canvas.style.height = ch + "px";
      this.rotated = cw < ch; // portrait container -> rotate the landscape world
      this.worldW = this.rotated ? ch : cw;
      this.worldH = this.rotated ? cw : ch;
    },

    applyWorldTransform() {
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (this.rotated) { ctx.translate(0, this.canvas.height); ctx.rotate(-Math.PI / 2); }
    },

    // client (screen) coords -> world coords, the exact inverse of the draw transform.
    screenToWorld(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      const px = (clientX - rect.left) * (this.canvas.width / rect.width);
      const py = (clientY - rect.top) * (this.canvas.height / rect.height);
      if (this.rotated) return { x: this.canvas.height - py, y: px };
      return { x: px, y: py };
    },

    // --- Match lifecycle ------------------------------------------------
    newMatch() {
      const s = this.state;
      s.cfg = tankCfg(this.worldW, this.worldH);
      const p1x = Math.round(this.worldW * 0.12), p2x = Math.round(this.worldW * 0.88);
      s.ground = tankGenTerrain(s.cfg, Math.random, p1x, p2x);
      const mk = (x, colorKey, isCpu) => ({
        x, colorKey, isCpu,
        hp: TANK_MAX_HP, fuel: 100,
        angle: x < this.worldW / 2 ? 55 : 125, power: 65,
        ammo: { heavy: TANK_WEAPONS.heavy.ammo, spread: TANK_WEAPONS.spread.ammo },
      });
      const cpu = s.mode === "cpu";
      s.tanks = [mk(p1x, s.p1Color, false), mk(p2x, cpu ? s.p2Color : s.p2Color, cpu)];
      s.active = 0; s.weaponIdx = 0; s.winner = -1; s.phase = "aiming";
      s.projectiles = []; s.particles = []; s.explosions = [];
      this.beginTurn();
    },

    turretY(t) { return this.state.ground[Math.max(0, Math.min(this.worldW - 1, Math.round(t.x)))] - this.state.cfg.tankR * 0.9; },

    beginTurn() {
      const s = this.state, t = s.tanks[s.active];
      t.fuel = 100;
      s.wind = (Math.random() * 2 - 1);
      s.phase = "aiming"; s.aiming = false; s.heldMove = 0;
      this.showMsg((s.mode === "cpu" && t.isCpu ? "Computer" : "Player " + (s.active + 1)) + "'s turn");
      if (s.mode === "cpu" && t.isCpu) s.cpuTimer = 0.7; else s.cpuTimer = 0;
    },

    showMsg(m) { this.state.turnMsg = m; this.state.msgTimer = 1.6; },

    // --- Input ----------------------------------------------------------
    onDown(e) {
      const s = this.state;
      const p = this.screenToWorld(e.clientX, e.clientY);
      // buttons first (they're live from the last draw)
      for (const b of s.buttons) {
        if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { this.pressButton(b.id); return; }
      }
      if (s.phase === "over") return;
      const t = s.tanks[s.active];
      if (s.mode === "cpu" && t.isCpu) return;
      if (s.phase !== "aiming") return;
      // drag anywhere in the open field (above the control bar) to aim —
      // the barrel follows the finger freely in any direction.
      if (p.y < this.worldH * 0.84) {
        s.aiming = true; this.updateAim(p);
      }
    },
    onMove(e) {
      const s = this.state;
      if (!s.aiming) return;
      this.updateAim(this.screenToWorld(e.clientX, e.clientY));
    },
    onUp() { this.state.aiming = false; },

    // The barrel points from the turret toward wherever the finger is (free
    // 2D direction), and how far the finger is from the tank sets the power.
    updateAim(p) {
      const s = this.state, t = s.tanks[s.active];
      const tx = t.x, ty = this.turretY(t);
      const dx = p.x - tx, dy = p.y - ty;
      s.aimX = p.x; s.aimY = p.y;
      let ang = Math.atan2(-dy, dx) * 180 / Math.PI;
      if (ang < 0) ang = 0; if (ang > 180) ang = 180;
      t.angle = Math.max(5, Math.min(175, ang));
      const len = Math.hypot(dx, dy);
      // full power reachable with a comfortable ~thumb-length drag
      t.power = Math.max(5, Math.min(100, (len / (this.worldW * 0.26)) * 100));
    },

    pressButton(id) {
      const s = this.state, t = s.tanks[s.active];
      if (id === "menu") { router.show("title"); return; }
      if (s.phase === "over") {
        if (id === "rematch") { this.newMatch(); }
        else if (id === "setup") { this.showConfig(); }
        return;
      }
      const human = !(s.mode === "cpu" && t.isCpu) && s.phase === "aiming";
      if (!human && id !== "menu") return;
      if (id === "fire") this.fire();
      else if (id === "angleDown") t.angle = Math.max(5, t.angle - 2);
      else if (id === "angleUp") t.angle = Math.min(175, t.angle + 2);
      else if (id === "powerDown") t.power = Math.max(10, t.power - 2);
      else if (id === "powerUp") t.power = Math.min(100, t.power + 2);
      else if (id === "weaponPrev") s.weaponIdx = (s.weaponIdx + TANK_WEAPON_ORDER.length - 1) % TANK_WEAPON_ORDER.length;
      else if (id === "weaponNext") s.weaponIdx = (s.weaponIdx + 1) % TANK_WEAPON_ORDER.length;
      else if (id === "moveLeft") s.heldMove = -1;
      else if (id === "moveRight") s.heldMove = 1;
    },
    releaseHold() { this.state.heldMove = 0; },

    // Shots of `key` the tank has left; Infinity when the weapon's ammo is 0
    // (unlimited, i.e. the Standard shell).
    ammoLeft(t, key) {
      const max = TANK_WEAPONS[key].ammo;
      if (!max) return Infinity;
      return (t.ammo && typeof t.ammo[key] === "number") ? t.ammo[key] : 0;
    },

    // --- Firing / resolution --------------------------------------------
    fire() {
      const s = this.state, t = s.tanks[s.active];
      if (s.phase !== "aiming") return;
      const key = TANK_WEAPON_ORDER[s.weaponIdx];
      const weapon = TANK_WEAPONS[key];
      if (this.ammoLeft(t, key) <= 0) { this.showMsg("Out of " + weapon.name + " shells"); return; }
      if (weapon.ammo) t.ammo[key] -= 1;
      const tx = t.x, ty = this.turretY(t);
      const foe = s.tanks[1 - s.active];
      const tanks = [{ x: foe.x, y: this.turretY(foe), r: s.cfg.tankR, idx: 1 - s.active }];
      s.projectiles = [];
      for (let i = 0; i < weapon.shots; i++) {
        const spread = weapon.shots > 1 ? (i - (weapon.shots - 1) / 2) * weapon.spreadDeg : 0;
        const v = tankAimVelocity(s.cfg, t.angle + spread, t.power);
        const trace = tankTrace(s.cfg, s.ground, tx, ty, v.vx, v.vy, s.wind, weapon.gravMult, tanks);
        s.projectiles.push({ path: trace.points, stop: trace.stop, i: 0, trail: [], weapon });
      }
      s.phase = "firing"; s.aiming = false;
    },

    stepProjectiles(dt) {
      const s = this.state;
      let anyLive = false;
      const PPS = 42; // path points consumed per second — controls how long the arc takes to watch
      for (const pr of s.projectiles) {
        if (pr.done) continue;
        pr.elapsed = (pr.elapsed || 0) + dt;
        let idx = pr.elapsed * PPS;
        if (idx >= pr.path.length - 1) { idx = pr.path.length - 1; pr.done = true; }
        else anyLive = true;
        const i0 = Math.floor(idx), i1 = Math.min(i0 + 1, pr.path.length - 1), a = idx - i0;
        const p0 = pr.path[i0], p1 = pr.path[i1];
        pr.cur = { x: p0.x + (p1.x - p0.x) * a, y: p0.y + (p1.y - p0.y) * a };
        // smoke puff every so often along the flight (independent of frame rate)
        pr.smokeAcc = (pr.smokeAcc || 0) + dt;
        if (pr.smokeAcc >= 0.02) {
          pr.smokeAcc = 0;
          pr.trail.push({ x: pr.cur.x, y: pr.cur.y, t: 0 });
        }
        for (const q of pr.trail) q.t += dt;
        while (pr.trail.length && pr.trail[0].t > 0.9) pr.trail.shift();
      }
      if (!anyLive) this.resolveShots();
    },

    resolveShots() {
      const s = this.state;
      for (const pr of s.projectiles) {
        const st = pr.stop, w = pr.weapon;
        const r = w.radius * this.worldW, crater = w.crater * this.worldW;
        if (st.type !== "edgeL" && st.type !== "edgeR") {
          tankCarve(s.ground, s.cfg, st.x, st.y, crater);
          this.explode(st.x, st.y, r * 1.6, w.color);
          this.burst(st.x, st.y, w.color, st.type === "tank" ? 34 : 22);
          for (let k = 0; k < s.tanks.length; k++) {
            const tk = s.tanks[k];
            const d = Math.hypot(tk.x - st.x, this.turretY(tk) - st.y);
            const dmg = tankBlastDamage(w, d, r);
            if (dmg > 0) { tk.hp = Math.max(0, tk.hp - dmg); this.burst(tk.x, this.turretY(tk), TANK_COLORS[tk.colorKey].body, 10); }
          }
        }
      }
      s.projectiles = [];
      // tanks settle onto the new terrain
      for (const tk of s.tanks) tk.x = Math.max(s.cfg.tankR, Math.min(this.worldW - s.cfg.tankR, tk.x));
      const dead = s.tanks.findIndex((t) => t.hp <= 0);
      if (dead >= 0) {
        s.phase = "over"; s.winner = 1 - dead;
        this.burst(s.tanks[dead].x, this.turretY(s.tanks[dead]), "#ffcc33", 40);
        return;
      }
      s.active = 1 - s.active;
      this.beginTurn();
    },

    burst(x, y, color, n) {
      const s = this.state;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = (0.2 + Math.random() * 0.8) * this.worldW * 0.5;
        const c = Math.random() < 0.4 ? "#ffd27a" : (Math.random() < 0.5 ? "#8a8a90" : color); // sparks + smoke + weapon tint
        s.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - this.worldW * 0.1, life: 0.4 + Math.random() * 0.5, t: 0, color: c });
      }
    },

    // A short-lived flash + shockwave ring where a shell lands.
    explode(x, y, r, color) {
      this.state.explosions.push({ x, y, r, t: 0, life: 0.42, color });
    },

    moveActive(dt) {
      const s = this.state, t = s.tanks[s.active];
      if (!s.heldMove || t.fuel <= 0 || s.phase !== "aiming") return;
      const speed = this.worldW * 0.12;
      let dxpx = s.heldMove * speed * dt;
      const cost = (Math.abs(dxpx) / s.cfg.fuelPx) * 100;
      if (cost > t.fuel) dxpx *= t.fuel / cost;
      const foe = s.tanks[1 - s.active];
      let nx = t.x + dxpx;
      nx = Math.max(s.cfg.tankR, Math.min(this.worldW - s.cfg.tankR, nx));
      if (Math.abs(nx - foe.x) < s.cfg.tankR * 2.5) nx = t.x; // don't climb into the foe
      t.fuel = Math.max(0, t.fuel - (Math.abs(nx - t.x) / s.cfg.fuelPx) * 100);
      t.x = nx;
    },

    // --- CPU ------------------------------------------------------------
    cpuTakeTurn() {
      const s = this.state, me = s.tanks[s.active], foe = s.tanks[1 - s.active];
      const tier = TANK_TIERS[s.difficulty] || TANK_TIERS.moderate;
      // sometimes spend a Heavy shell when close, otherwise standard
      s.weaponIdx = (this.ammoLeft(me, "heavy") > 0 && Math.abs(me.x - foe.x) < this.worldW * 0.3 && Math.random() < 0.5) ? 1 : 0;
      const weapon = TANK_WEAPONS[TANK_WEAPON_ORDER[s.weaponIdx]];
      const shot = tankCpuChooseShot(s.cfg, s.ground,
        { angleStep: tier.angleStep, powerStep: tier.powerStep, angleErr: tier.angleErr, powerErr: tier.powerErr },
        { x: me.x, y: this.turretY(me) }, { x: foe.x, y: this.turretY(foe) }, s.wind, weapon.gravMult, Math.random);
      me.angle = shot.angle; me.power = shot.power;
      this.fire();
    },

    // --- Loop -----------------------------------------------------------
    update(dt) {
      const s = this.state;
      if (s.msgTimer > 0) s.msgTimer -= dt;
      for (const p of s.particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += this.worldW * 0.6 * dt; }
      s.particles = s.particles.filter((p) => p.t < p.life);
      for (const e of s.explosions) e.t += dt;
      s.explosions = s.explosions.filter((e) => e.t < e.life);
      if (s.phase === "aiming") {
        this.moveActive(dt);
        const t = s.tanks[s.active];
        if (s.mode === "cpu" && t.isCpu && s.cpuTimer > 0) {
          s.cpuTimer -= dt;
          if (s.cpuTimer <= 0) this.cpuTakeTurn();
        }
      } else if (s.phase === "firing") {
        this.stepProjectiles(dt);
      }
    },

    gameLoop(now) {
      if (!this.canvas) return;
      const dt = Math.min((now - this.lastT) / 1000, 0.05);
      this.lastT = now;
      this.update(dt);
      this.draw();
      this.animId = requestAnimationFrame((t) => this.gameLoop(t));
    },
    startLoop() { this.lastT = performance.now(); if (this.animId) cancelAnimationFrame(this.animId); this.animId = requestAnimationFrame((t) => this.gameLoop(t)); },
    stopLoop() { if (this.animId) { cancelAnimationFrame(this.animId); this.animId = null; } },

    // --- Drawing --------------------------------------------------------
    draw() {
      const ctx = this.ctx, W = this.worldW, H = this.worldH, s = this.state;
      if (!s.cfg) return;
      this.applyWorldTransform();
      this.drawSky(ctx, W, H);
      this.drawTerrain(ctx, W, H);
      for (let i = 0; i < s.tanks.length; i++) this.drawTank(ctx, s.tanks[i], i);
      if (s.phase === "aiming") this.drawAimArc(ctx);
      for (const pr of s.projectiles) this.drawProjectile(ctx, pr);
      this.drawExplosions(ctx);
      this.drawParticles(ctx);
      this.drawHud(ctx, W, H);
      this.drawControls(ctx, W, H);
      if (s.msgTimer > 0 && s.phase !== "over") this.drawBanner(ctx, W, H, s.turnMsg);
      if (s.phase === "over") this.drawGameOver(ctx, W, H);
      if (this.rotated) this.drawRotateHint(ctx, W, H);
    },

    drawSky(ctx, W, H) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#2d6ab0"); g.addColorStop(0.7, "#8fc4e8"); g.addColorStop(1, "#cfe7f3");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.save();
      const sx = W * 0.16, sy = H * 0.2, sr = H * 0.07;
      const gg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 3);
      gg.addColorStop(0, "rgba(255,255,255,0.95)"); gg.addColorStop(0.3, "rgba(255,255,240,0.5)"); gg.addColorStop(1, "rgba(255,255,240,0)");
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(sx, sy, sr * 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fffbe0"; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    },

    drawTerrain(ctx, W, H) {
      const g = this.state.ground;
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x < W; x++) ctx.lineTo(x, g[x]);
      ctx.lineTo(W, H); ctx.closePath();
      const grad = ctx.createLinearGradient(0, H * 0.3, 0, H);
      grad.addColorStop(0, "#5fa83b"); grad.addColorStop(0.12, "#3f7d2a"); grad.addColorStop(0.3, "#6b4a2a"); grad.addColorStop(1, "#3b2817");
      ctx.fillStyle = grad; ctx.fill();
      ctx.strokeStyle = "#7fce52"; ctx.lineWidth = Math.max(2, H * 0.01);
      ctx.beginPath(); ctx.moveTo(0, g[0]); for (let x = 1; x < W; x++) ctx.lineTo(x, g[x]); ctx.stroke();
    },

    drawTank(ctx, t, idx) {
      const s = this.state, r = s.cfg.tankR, x = t.x, y = this.turretY(t);
      const col = TANK_COLORS[t.colorKey];
      const faded = t.hp <= 0;
      ctx.save();
      if (faded) ctx.globalAlpha = 0.35;
      // treads
      ctx.fillStyle = col.dark;
      ctx.beginPath(); ctx.roundRect(x - r, y + r * 0.35, r * 2, r * 0.8, r * 0.3); ctx.fill();
      // hull
      ctx.fillStyle = col.body;
      ctx.beginPath(); ctx.roundRect(x - r * 0.85, y - r * 0.1, r * 1.7, r * 0.7, r * 0.2); ctx.fill();
      // turret
      ctx.beginPath(); ctx.arc(x, y, r * 0.55, Math.PI, 0); ctx.fill();
      // barrel
      const live = (idx === s.active && s.phase === "aiming");
      const ang = t.angle * Math.PI / 180;
      const bl = r * 1.7;
      ctx.strokeStyle = col.dark; ctx.lineWidth = r * 0.35; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x, y - r * 0.2);
      ctx.lineTo(x + Math.cos(ang) * bl, y - r * 0.2 - Math.sin(ang) * bl); ctx.stroke();
      ctx.restore();
      if (live) { // highlight whose turn
        ctx.save(); ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.arc(x, y, r * 1.9, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    },

    drawAimArc(ctx) {
      const s = this.state, t = s.tanks[s.active], R = s.cfg.tankR;
      if (s.mode === "cpu" && t.isCpu) return;
      const weapon = TANK_WEAPONS[TANK_WEAPON_ORDER[s.weaponIdx]];
      const tx = t.x, ty = this.turretY(t);
      const v = tankAimVelocity(s.cfg, t.angle, t.power);
      const trace = tankTrace(s.cfg, s.ground, tx, ty, v.vx, v.vy, s.wind, weapon.gravMult, null);
      const pts = trace.points, stop = trace.stop;
      ctx.save();
      // the whole predicted path, so moving the finger reshapes the entire arc
      ctx.setLineDash([5, 7]); ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke(); ctx.setLineDash([]);
      // marker where it's predicted to land
      if (stop.type === "ground" || stop.type === "tank") {
        ctx.strokeStyle = "rgba(255,215,90,0.95)"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(stop.x, stop.y, R * 0.7, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(stop.x - R * 0.5, stop.y); ctx.lineTo(stop.x + R * 0.5, stop.y);
        ctx.moveTo(stop.x, stop.y - R * 0.5); ctx.lineTo(stop.x, stop.y + R * 0.5); ctx.stroke();
      }
      // aim handle: a line from the barrel to the finger shows the launch
      // vector (direction = angle, length = power) you're setting.
      if (s.aiming) {
        ctx.strokeStyle = "rgba(120,220,255,0.95)"; ctx.lineWidth = 3; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(s.aimX, s.aimY); ctx.stroke();
        ctx.fillStyle = "rgba(120,220,255,0.95)";
        ctx.beginPath(); ctx.arc(s.aimX, s.aimY, R * 0.38, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    },

    drawProjectile(ctx, pr) {
      if (!pr.cur) return;
      const R = this.state.cfg.tankR;
      ctx.save();
      // smoke plume: each puff grows and fades as it ages
      for (const p of pr.trail) {
        const age = Math.min(1, p.t / 0.9);
        const alpha = (1 - age) * 0.5;
        const rad = R * (0.35 + age * 0.9);
        ctx.fillStyle = "rgba(110,110,115," + alpha + ")";
        ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.fill();
      }
      // the shell: a glowing bright core
      ctx.shadowColor = pr.weapon.color; ctx.shadowBlur = R * 1.2;
      ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(pr.cur.x, pr.cur.y, R * 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = pr.weapon.color; ctx.beginPath(); ctx.arc(pr.cur.x, pr.cur.y, R * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(pr.cur.x - R * 0.08, pr.cur.y - R * 0.08, R * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    },

    drawExplosions(ctx) {
      for (const e of this.state.explosions) {
        const p = e.t / e.life;            // 0 -> 1
        const rr = e.r * (0.35 + p * 1.0);
        ctx.save();
        ctx.globalAlpha = 1 - p;
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, rr);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.35, e.color);
        g.addColorStop(0.7, "rgba(255,130,40,0.5)");
        g.addColorStop(1, "rgba(255,120,40,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, rr, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = (1 - p) * 0.85; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, rr * 1.05, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },

    drawParticles(ctx) {
      for (const p of this.state.particles) {
        const a = Math.max(0, 1 - p.t / p.life);
        ctx.globalAlpha = a; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, this.state.cfg.tankR * 0.3 * a + 1, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    },

    drawHud(ctx, W, H) {
      const s = this.state, pad = W * 0.02, barW = W * 0.26, barH = H * 0.05;
      ctx.save();
      ctx.font = "bold " + Math.round(H * 0.045) + "px system-ui, sans-serif";
      ctx.textBaseline = "top";
      // life bars
      for (let i = 0; i < 2; i++) {
        const t = s.tanks[i], col = TANK_COLORS[t.colorKey];
        const x = i === 0 ? pad : W - pad - barW, y = pad;
        ctx.textAlign = i === 0 ? "left" : "right";
        ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.roundRect(x, y, barW, barH, 4); ctx.fill();
        for (let h = 0; h < TANK_MAX_HP; h++) {
          const seg = barW / TANK_MAX_HP, sx = x + h * seg + 1.5;
          ctx.fillStyle = h < t.hp ? col.body : "rgba(255,255,255,0.12)";
          ctx.beginPath(); ctx.roundRect(sx, y + 1.5, seg - 3, barH - 3, 3); ctx.fill();
        }
        ctx.fillStyle = "#fff";
        const label = (s.mode === "cpu" && t.isCpu ? "CPU" : "P" + (i + 1));
        ctx.fillText(label, i === 0 ? x : x + barW, y + barH + 2);
      }
      // center readout: angle / power / wind
      const t = s.tanks[s.active];
      ctx.textAlign = "center"; ctx.fillStyle = "#fff";
      ctx.fillText("∠" + Math.round(t.angle) + "°   PWR " + Math.round(t.power) + "   WIND " + this.windStr(), W / 2, pad);
      // fuel bar under the readout
      const fw = W * 0.2, fx = W / 2 - fw / 2, fy = pad + H * 0.055;
      ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.roundRect(fx, fy, fw, H * 0.03, 3); ctx.fill();
      ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.roundRect(fx, fy, fw * (t.fuel / 100), H * 0.03, 3); ctx.fill();
      ctx.font = Math.round(H * 0.03) + "px system-ui"; ctx.fillStyle = "#333"; ctx.textBaseline = "middle";
      ctx.fillText("FUEL", W / 2, fy + H * 0.015);
      ctx.restore();
    },
    windStr() { const w = Math.round(this.state.wind * 20); return (w > 0 ? "▶" : w < 0 ? "◀" : "") + Math.abs(w); },

    // Builds the control bar, drawing each button and recording its hitbox.
    drawControls(ctx, W, H) {
      const s = this.state;
      s.buttons = [];
      const barH = H * 0.15, y = H - barH, bh = barH * 0.72, by = y + (barH - bh) / 2;
      ctx.save();
      ctx.fillStyle = "rgba(10,10,16,0.55)"; ctx.fillRect(0, y, W, barH);
      // menu (always available)
      this.btn(ctx, "menu", W * 0.012, by, bh * 1.2, bh, "☰", "#cfd3dc");
      if (s.phase === "over") { ctx.restore(); return; }
      const t = s.tanks[s.active];
      const human = !(s.mode === "cpu" && t.isCpu);
      const dim = human ? 1 : 0.4;
      ctx.globalAlpha = dim;
      let x = W * 0.08;
      const gap = W * 0.012, bw = bh;
      // move
      this.btn(ctx, "moveLeft", x, by, bw, bh, "◄", "#9ad0ff"); x += bw + 2;
      this.btn(ctx, "moveRight", x, by, bw, bh, "►", "#9ad0ff"); x += bw + gap * 2;
      // angle
      this.btn(ctx, "angleDown", x, by, bw, bh, "∠-", "#fff"); x += bw + 2;
      this.btn(ctx, "angleUp", x, by, bw, bh, "∠+", "#fff"); x += bw + gap * 2;
      // power
      this.btn(ctx, "powerDown", x, by, bw, bh, "P-", "#fff"); x += bw + 2;
      this.btn(ctx, "powerUp", x, by, bw, bh, "P+", "#fff"); x += bw + gap * 2;
      // weapon selector (shows remaining ammo; Standard is unlimited)
      const wKey = TANK_WEAPON_ORDER[s.weaponIdx], wName = TANK_WEAPONS[wKey];
      const left = this.ammoLeft(t, wKey);
      const empty = left <= 0;
      this.btn(ctx, "weaponPrev", x, by, bw * 0.7, bh, "‹", "#fff"); x += bw * 0.7 + 2;
      const ww = W * 0.15;
      ctx.fillStyle = "rgba(255,255,255,0.1)"; ctx.beginPath(); ctx.roundRect(x, by, ww, bh, 6); ctx.fill();
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = empty ? "rgba(255,255,255,0.35)" : wName.color;
      ctx.font = "bold " + Math.round(bh * 0.3) + "px system-ui";
      ctx.fillText(wName.name, x + ww / 2, by + (wName.ammo ? bh * 0.36 : bh * 0.5));
      if (wName.ammo) {
        ctx.font = Math.round(bh * 0.24) + "px system-ui";
        ctx.fillStyle = empty ? "#ff6b6b" : "rgba(255,255,255,0.75)";
        ctx.fillText(empty ? "EMPTY" : "x" + left + " left", x + ww / 2, by + bh * 0.72);
      }
      x += ww + 2;
      this.btn(ctx, "weaponNext", x, by, bw * 0.7, bh, "›", "#fff"); x += bw * 0.7 + gap * 2;
      // FIRE (big, right)
      const firew = W - x - W * 0.02;
      ctx.globalAlpha = dim;
      this.btn(ctx, "fire", x, by, Math.max(firew, bw * 2), bh, "FIRE!", "#fff", "#d9453f");
      ctx.restore();
    },

    btn(ctx, id, x, y, w, h, label, fg, bg) {
      this.state.buttons.push({ id, x, y, w, h });
      ctx.save();
      ctx.fillStyle = bg || "rgba(255,255,255,0.14)";
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 7); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = fg; ctx.font = "bold " + Math.round(h * 0.4) + "px system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(label, x + w / 2, y + h / 2 + 1);
      ctx.restore();
    },

    drawBanner(ctx, W, H, text) {
      ctx.save();
      ctx.font = "bold " + Math.round(H * 0.07) + "px system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const w = ctx.measureText(text).width + W * 0.06, bx = W / 2 - w / 2, by = H * 0.24;
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.beginPath(); ctx.roundRect(bx, by, w, H * 0.11, 8); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillText(text, W / 2, by + H * 0.055);
      ctx.restore();
    },

    drawGameOver(ctx, W, H) {
      const s = this.state;
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, 0, W, H);
      const win = s.tanks[s.winner], col = TANK_COLORS[win.colorKey];
      const who = (s.mode === "cpu" && win.isCpu) ? "Computer wins!" : "Player " + (s.winner + 1) + " wins!";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = col.body; ctx.font = "bold " + Math.round(H * 0.11) + "px system-ui, sans-serif";
      ctx.fillText(who, W / 2, H * 0.34);
      s.buttons = s.buttons.filter((b) => b.id === "menu"); // keep menu; add over buttons
      const bw = W * 0.26, bh = H * 0.13, gap = W * 0.04, by = H * 0.52;
      this.btn(ctx, "rematch", W / 2 - bw - gap / 2, by, bw, bh, "Rematch", "#fff", "#4a9e4a");
      this.btn(ctx, "setup", W / 2 + gap / 2, by, bw, bh, "Change Setup", "#fff", "#555");
      ctx.restore();
    },

    drawRotateHint(ctx, W, H) {
      if (!tankStore.getBool("rotatedOnce")) {
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.font = Math.round(H * 0.035) + "px system-ui";
        ctx.textAlign = "right"; ctx.textBaseline = "bottom";
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.fillText("↻ turn phone", W - 6, H * 0.78);
        ctx.restore();
      }
    },

    syncConfigUI() {
      const s = this.state;
      document.getElementById("tank-mode-cpu").classList.toggle("active", s.mode === "cpu");
      document.getElementById("tank-mode-2p").classList.toggle("active", s.mode === "2p");
      document.getElementById("tank-difficulty-wrap").hidden = s.mode !== "cpu";
      document.getElementById("tank-p2-wrap").hidden = s.mode !== "2p";
      document.querySelectorAll('#tank-config input[name="tank-difficulty"]').forEach((r) => { r.checked = r.value === s.difficulty; });
      document.querySelectorAll("#tank-p1-colors .tank-color-btn").forEach((x) => x.classList.toggle("selected", x.dataset.color === s.p1Color));
      document.querySelectorAll("#tank-p2-colors .tank-color-btn").forEach((x) => x.classList.toggle("selected", x.dataset.color === s.p2Color));
    },

    showConfig() {
      this.stopLoop();
      document.getElementById("tank-config").hidden = false;
      document.getElementById("tank-canvas-wrap").hidden = true;
    },
    showMatch() {
      document.getElementById("tank-config").hidden = true;
      document.getElementById("tank-canvas-wrap").hidden = false;
      this.sizeCanvas();
      this.newMatch();
      this.startLoop();
    },
  };

  modules.tank = {
    _wired: false,
    onEnter() {
      tank.initCanvas();
      tank.state.p1Color = tankStore.getString("p1Color", "red", TANK_COLORS);
      tank.state.p2Color = tankStore.getString("p2Color", "blue", TANK_COLORS);
      tank.state.mode = tankStore.getString("mode", "cpu", { cpu: 1, "2p": 1 });
      tank.state.difficulty = tankStore.getString("difficulty", "moderate", DIFFICULTIES);

      if (!this._wired) {
        this._wired = true;
        const cfgEl = document.getElementById("tank-config");

        document.getElementById("tank-mode-cpu").addEventListener("click", () => { tank.state.mode = "cpu"; tankStore.setString("mode", "cpu"); tank.syncConfigUI(); });
        document.getElementById("tank-mode-2p").addEventListener("click", () => { tank.state.mode = "2p"; tankStore.setString("mode", "2p"); tank.syncConfigUI(); });

        cfgEl.querySelectorAll('input[name="tank-difficulty"]').forEach((r) => r.addEventListener("change", (e) => {
          if (!DIFFICULTIES[e.target.value]) return;
          tank.state.difficulty = e.target.value; tankStore.setString("difficulty", e.target.value);
        }));

        const wireColors = (sel, key) => {
          document.querySelectorAll(sel).forEach((b) => b.addEventListener("click", () => {
            const c = b.dataset.color; if (!TANK_COLORS[c]) return;
            tank.state[key] = c; tankStore.setString(key, c);
            document.querySelectorAll(sel).forEach((x) => x.classList.toggle("selected", x === b));
          }));
        };
        wireColors("#tank-p1-colors .tank-color-btn", "p1Color");
        wireColors("#tank-p2-colors .tank-color-btn", "p2Color");

        document.getElementById("tank-start-btn").addEventListener("click", () => {
          if (tank.state.mode === "2p" && tank.state.p1Color === tank.state.p2Color) {
            // nudge p2 to a different color so the tanks are distinguishable
            const alt = Object.keys(TANK_COLORS).find((c) => c !== tank.state.p1Color);
            tank.state.p2Color = alt; tankStore.setString("p2Color", alt);
            document.querySelectorAll("#tank-p2-colors .tank-color-btn").forEach((x) => x.classList.toggle("selected", x.dataset.color === alt));
          }
          try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {}); } catch (e) { /* unsupported */ }
          if (!tankStore.getBool("tutorialSeen")) {
            showModal(document.getElementById("tank-tutorial-modal"));
          } else {
            tank.showMatch();
          }
        });

        // tutorial steps
        let tutStep = 0;
        const tutSteps = document.querySelectorAll(".tank-tut-step");
        const tutPrev = document.getElementById("tank-tut-prev"), tutNext = document.getElementById("tank-tut-next");
        const showTut = () => { tutSteps.forEach((st, i) => { st.hidden = i !== tutStep; }); tutPrev.hidden = tutStep === 0; tutNext.textContent = tutStep === tutSteps.length - 1 ? "Battle!" : "Next →"; };
        tutNext.addEventListener("click", () => {
          if (tutStep < tutSteps.length - 1) { tutStep++; showTut(); }
          else { tankStore.setBool("tutorialSeen", true); hideModal(document.getElementById("tank-tutorial-modal")); tank.showMatch(); }
        });
        tutPrev.addEventListener("click", () => { if (tutStep > 0) { tutStep--; showTut(); } });
        tank._showTut = showTut;

        // canvas input
        tank.canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); tank.onDown(e); });
        tank.canvas.addEventListener("pointermove", (e) => { tank.onMove(e); });
        ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => tank.canvas.addEventListener(ev, () => { tank.onUp(); tank.releaseHold(); }));

        window.addEventListener("resize", () => {
          if (router.current !== "tank" || document.getElementById("tank-canvas-wrap").hidden) return;
          const frac = tank.state.tanks.map((t) => t.x / tank.worldW);
          tank.sizeCanvas();
          if (tank.state.cfg) {
            tank.state.cfg = tankCfg(tank.worldW, tank.worldH);
            const p1x = Math.round(tank.worldW * 0.12), p2x = Math.round(tank.worldW * 0.88);
            tank.state.ground = tankGenTerrain(tank.state.cfg, Math.random, p1x, p2x);
            tank.state.tanks.forEach((t, i) => { t.x = Math.round((frac[i] || (i ? 0.88 : 0.12)) * tank.worldW); });
          }
          tank.draw();
        });
      }

      tank.syncConfigUI();
      if (tank.rotated) tankStore.setBool("rotatedOnce", true);
      tank.showConfig();
    },

    onLeave() {
      tank.stopLoop();
      hideModal(document.getElementById("tank-tutorial-modal"));
    },
  };
  // Debug handle (read-only introspection for manual testing; harmless).
  try { if (typeof window !== "undefined") window.__tank = tank; } catch (e) { /* ignore */ }

  // ================================================================
  // 23. INIT & LOCALSTORAGE MIGRATION
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
