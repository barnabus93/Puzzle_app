# Unblock Puzzle

A tiny, mobile-first, static web app for playing Rush Hour / Unblock Me style
puzzles. Every page load picks a fresh puzzle at the selected difficulty
(Simple / Moderate / Difficult), and the number of puzzles completed is kept
on the device in `localStorage`.

No build step, no dependencies — four files (`index.html`, `styles.css`,
`app.js`, `puzzles.js`) plus this README.

## How to play

Drag any block along its axis — horizontal blocks slide left/right, vertical
blocks slide up/down. Slide the red block out through the gap on the right
edge to solve the puzzle.

- Tap the gear icon to change difficulty or reset the completed counter.
- Tap **New Puzzle** at any time for a fresh board.
- Tap **Next puzzle** on the win screen to continue.

## Run locally

```sh
# From the repo root
python3 -m http.server 8000
# Then open http://localhost:8000 in a browser
```

You can also open `index.html` directly from the filesystem — it has no
external resources.

## Host it for free (so you can bookmark it)

This repo is ready for **GitHub Pages**:

1. Push the repo to GitHub.
2. In the repo settings → **Pages**, set the source to the branch containing
   these files, folder `/ (root)`.
3. GitHub will publish it at `https://<your-user>.github.io/<repo>/`.
4. Bookmark that URL on the phone/tablet. Every load is a new puzzle.

## How difficulty works

Difficulty is calibrated by the **true minimum number of slides required to
solve** (verified by a full BFS solver):

| Setting    | Min solution length |
| ---------- | ------------------- |
| Simple     | 5 – 8 moves         |
| Moderate   | 9 – 13 moves        |
| Difficult  | 14 – 24 moves       |

The app ships with a curated pool of 30 puzzles per difficulty (90 total) in
`puzzles.js`, each with a pre-computed, verified minimum solution length. On
every load the app just picks one at random from the pool matching the
current difficulty, so there is no runtime generation cost — the page is
ready to play instantly.

### Regenerating the puzzle pool

The puzzles are produced offline by `tools/generate-puzzles.js`, which builds
random 6×6 boards, fully enumerates each board's reachable state-space, and
runs a multi-source BFS from all solved states in that component to compute
the true minimum-moves-to-solve for every position. States whose true depth
falls in the target range are collected until each tier has 30 entries.

```sh
# Re-generate puzzles.js (takes 1–3 min total)
node tools/generate-puzzles.js --budget 60000
```

## What's stored on the device

- `puzzle.completedCount` — total puzzles solved
- `puzzle.difficulty` — currently selected difficulty
- `puzzle.version` — storage schema version

Everything is local to the browser; nothing is sent anywhere.
