import { useCallback, useEffect, useRef, useState } from "react";
import "./styles.css";

const SIZE = 4;
const BEST_KEY = "react-2048-best";
const SLIDE_MS = 120; // must match --slide in styles.css
const SWIPE_MIN = 30; // px needed to count as a swipe

let nextId = 1;
const makeTile = (value, row, col, extra = {}) => ({
  id: nextId++,
  value,
  row,
  col,
  isNew: false,
  merged: false,
  gone: false, // consumed by a merge; removed after the slide finishes
  ...extra,
});

/* ---------- pure board helpers ---------- */

const liveTiles = (tiles) => tiles.filter((t) => !t.gone);

function emptyCells(tiles) {
  const taken = new Set(liveTiles(tiles).map((t) => `${t.row},${t.col}`)); // FIXED: template literal
  const cells = [];
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (!taken.has(`${r},${c}`)) cells.push([r, c]); // FIXED: template literal
  return cells;
}

// 90% -> 2, 10% -> 4, placed in a random empty slot
function spawnTile(tiles) {
  const cells = emptyCells(tiles);
  if (!cells.length) return tiles;
  const [row, col] = cells[Math.floor(Math.random() * cells.length)];
  const value = Math.random() < 0.9 ? 2 : 4;
  return [...tiles, makeTile(value, row, col, { isNew: true })];
}

function canMove(tiles) {
  const live = liveTiles(tiles);
  if (live.length < SIZE * SIZE) return true;
  const grid = {};
  live.forEach((t) => (grid[`${t.row},${t.col}`] = t.value)); // FIXED: template literal
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      const v = grid[`${r},${c}`]; // FIXED: template literal
      if (v === grid[`${r},${c + 1}`] || v === grid[`${r + 1},${c}`]) return true; // FIXED: template literals
    }
  return false;
}

/**
 * Slide + merge every tile toward `dir`.
 * Each tile merges at most once per move (`merged` flag on the survivor).
 * Returns { tiles, moved, gained }.
 */
function slide(tiles, dir) {
  const horizontal = dir === "left" || dir === "right";
  const towardStart = dir === "left" || dir === "up";
  const live = liveTiles(tiles);
  const out = [];
  let moved = false;
  let gained = 0;

  for (let line = 0; line < SIZE; line++) {
    const inLine = live
      .filter((t) => (horizontal ? t.row === line : t.col === line))
      .sort((a, b) => {
        const d = horizontal ? a.col - b.col : a.row - b.row;
        return towardStart ? d : -d;
      });

    let index = 0;
    let prev = null;
    for (const t of inLine) {
      if (prev && !prev.merged && prev.value === t.value) {
        // fuse into prev: this tile slides under it, then disappears
        out.push({ ...t, row: prev.row, col: prev.col, gone: true, isNew: false, merged: false });
        prev.value *= 2;
        prev.merged = true;
        gained += prev.value;
        moved = true;
      } else {
        const pos = towardStart ? index : SIZE - 1 - index;
        const row = horizontal ? line : pos;
        const col = horizontal ? pos : line;
        if (row !== t.row || col !== t.col) moved = true;
        prev = { ...t, row, col, isNew: false, merged: false };
        out.push(prev);
        index++;
      }
    }
  }
  return { tiles: out, moved, gained };
}

function newGame() {
  let tiles = spawnTile([]);
  tiles = spawnTile(tiles);
  return { tiles, score: 0, over: false, won: false, keepPlaying: false };
}

const KEY_MAP = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  w: "up", s: "down", a: "left", d: "right",
  W: "up", S: "down", A: "left", D: "right",
};

const readBest = () => {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
};

/* ---------- component ---------- */

export default function App() {
  const [game, setGame] = useState(newGame);
  const [best, setBest] = useState(readBest);
  const gameRef = useRef(game); // always the latest state, even between renders
  const touchStart = useRef(null);

  const commit = useCallback((next) => {
    gameRef.current = next;
    setGame(next);
  }, []);

  const move = useCallback(
    (dir) => {
      const g = gameRef.current;
      if (g.over || (g.won && !g.keepPlaying)) return;

      const res = slide(g.tiles, dir);
      if (!res.moved) return; // invalid move: no spawn

      const tiles = spawnTile(res.tiles);
      const reached2048 = tiles.some((t) => !t.gone && t.value >= 2048);
      commit({
        ...g,
        tiles,
        score: g.score + res.gained,
        won: g.won || reached2048,
        over: !canMove(tiles),
      });

      // drop consumed tiles once the slide animation is done
      setTimeout(() => {
        const cur = gameRef.current;
        commit({ ...cur, tiles: liveTiles(cur.tiles) });
      }, SLIDE_MS + 20);
    },
    [commit]
  );

  // keyboard: arrows + WASD
  useEffect(() => {
    const onKey = (e) => {
      const dir = KEY_MAP[e.key];
      if (!dir) return;
      e.preventDefault();
      move(dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  // persist best score
  useEffect(() => {
    if (game.score > best) {
      setBest(game.score);
      try {
        localStorage.setItem(BEST_KEY, String(game.score));
      } catch {
        /* storage unavailable: ignore */
      }
    }
  }, [game.score, best]);

  // touch swipe for mobile
  const onTouchStart = (e) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? "right" : "left");
    else move(dy > 0 ? "down" : "up");
  };

  const restart = () => commit(newGame());
  const keepGoing = () => commit({ ...gameRef.current, keepPlaying: true });

  // FIXED: everything from here down was missing (file was cut off at `return (`)
  return (
    <main className="game">
      <header className="game-header">
        <h1 className="title">2048</h1>
        <div className="scores">
          <div className="score-box">
            <span className="score-label">Score</span>
            <span className="score-value">{game.score}</span>
          </div>
          <div className="score-box">
            <span className="score-label">Best</span>
            <span className="score-value">{best}</span>
          </div>
        </div>
      </header>

      <div className="toolbar">
        <p className="hint">Join tiles to reach <strong>2048</strong>. Arrow keys, WASD or swipe.</p>
        <button className="btn" onClick={restart}>New Game</button>
      </div>

      <div className="board" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {/* static background cells */}
        <div className="grid">
          {Array.from({ length: SIZE * SIZE }, (_, i) => (
            <div className="cell" key={i} />
          ))}
        </div>

        {/* moving tiles: outer = position (transition), inner = look + keyframes */}
        <div className="tiles">
          {game.tiles.map((t) => (
            <div
              key={t.id}
              className={`tile${t.gone ? " tile-gone" : ""}`}
              style={{ "--row": t.row, "--col": t.col }}
            >
              <div
                key={t.value} /* remount on value change so the pulse replays */
                className={[
                  "tile-inner",
                  `tile-${t.value > 2048 ? "super" : t.value}`,
                  `digits-${String(t.value).length}`,
                  t.isNew ? "is-new" : "",
                  t.merged ? "is-merged" : "",
                ].join(" ")}
              >
                {t.value}
              </div>
            </div>
          ))}
        </div>

        {(game.over || (game.won && !game.keepPlaying)) && (
          <div className="overlay" role="alertdialog" aria-live="assertive">
            <h2>{game.over ? "Game over" : "You made 2048!"}</h2>
            <p>Final score: {game.score}</p>
            <div className="overlay-actions">
              {!game.over && (
                <button className="btn btn-ghost" onClick={keepGoing}>Keep going</button>
              )}
              <button className="btn" onClick={restart}>Try again</button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
