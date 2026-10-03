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


const BTN =
  "shrink-0 cursor-pointer rounded-lg bg-accent px-[18px] py-2.5 font-bold text-ink-light " +
  "transition hover:bg-accent-hover active:scale-95 " +
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#f59563]";
const BTN_GHOST =
  "shrink-0 cursor-pointer rounded-lg bg-transparent px-[18px] py-2.5 font-bold text-ink " +
  "shadow-[inset_0_0_0_2px_var(--color-accent)] transition hover:bg-accent/15 active:scale-95 " +
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#f59563]";

// Colors per tile value (2 .. 2048+). Higher tiles get a golden glow.
const TILE_COLORS = {
  2: "bg-tile-2 text-ink shadow-[0_2px_6px_rgba(0,0,0,.12)]",
  4: "bg-tile-4 text-ink shadow-[0_2px_6px_rgba(0,0,0,.12)]",
  8: "bg-tile-8 text-ink-light shadow-[0_2px_6px_rgba(0,0,0,.12)]",
  16: "bg-tile-16 text-ink-light shadow-[0_2px_6px_rgba(0,0,0,.12)]",
  32: "bg-tile-32 text-ink-light shadow-[0_2px_6px_rgba(0,0,0,.12)]",
  64: "bg-tile-64 text-ink-light shadow-[0_2px_6px_rgba(0,0,0,.12)]",
  128: "bg-tile-128 text-ink-light shadow-[0_0_20px_4px_rgba(243,215,116,.35)]",
  256: "bg-tile-256 text-ink-light shadow-[0_0_22px_6px_rgba(243,215,116,.45)]",
  512: "bg-tile-512 text-ink-light shadow-[0_0_24px_8px_rgba(243,215,116,.55)]",
  1024: "bg-tile-1024 text-ink-light shadow-[0_0_26px_10px_rgba(243,215,116,.65)]",
  2048: "bg-tile-2048 text-ink-light shadow-[0_0_30px_12px_rgba(243,215,116,.8)]",
  super: "bg-tile-super text-ink-light shadow-[0_2px_6px_rgba(0,0,0,.12)]",
};

// Font size shrinks as the number gets longer so it always fits the tile
const fontSizeFor = (value) => {
  const digits = String(value).length;
  if (digits <= 2) return "text-[length:calc(var(--cell)*0.46)]";
  if (digits === 3) return "text-[length:calc(var(--cell)*0.38)]";
  if (digits === 4) return "text-[length:calc(var(--cell)*0.31)]";
  return "text-[length:calc(var(--cell)*0.25)]";
};

/* ---------- pure board helpers ---------- */

const liveTiles = (tiles) => tiles.filter((t) => !t.gone);

function emptyCells(tiles) {
  const taken = new Set(liveTiles(tiles).map((t) => `${t.row},${t.col}`));
  const cells = [];
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (!taken.has(`${r},${c}`)) cells.push([r, c]);
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
  live.forEach((t) => (grid[`${t.row},${t.col}`] = t.value));
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      const v = grid[`${r},${c}`];
      if (v === grid[`${r},${c + 1}`] || v === grid[`${r + 1},${c}`]) return true;
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

  return (
    <main className="mx-auto flex min-h-screen w-(--board) flex-col gap-4 pt-6 pb-10">
      <header className="flex items-center justify-between gap-3">
        <h1 className="m-0 text-[length:clamp(2.6rem,14vw,4.5rem)] leading-none font-extrabold tracking-[-0.04em]">
          2048
        </h1>
        <div className="flex gap-2">
          <div className="flex min-w-[78px] flex-col rounded-lg bg-board px-3.5 py-2 text-center text-white shadow-[0_4px_10px_rgba(119,110,101,.2)]">
            <span className="text-[0.7rem] font-semibold opacity-85">Score</span>
            <span className="text-xl font-extrabold tabular-nums">{game.score}</span>
          </div>
          <div className="flex min-w-[78px] flex-col rounded-lg bg-board px-3.5 py-2 text-center text-white shadow-[0_4px_10px_rgba(119,110,101,.2)]">
            <span className="text-[0.7rem] font-semibold opacity-85">Best</span>
            <span className="text-xl font-extrabold tabular-nums">{best}</span>
          </div>
        </div>
      </header>

      <div className="flex items-center justify-between gap-3 max-[420px]:flex-col max-[420px]:items-stretch">
        <p className="m-0 text-[0.9rem] leading-snug max-[420px]:text-center">
          Join tiles to reach <strong>2048</strong>. Arrow keys, WASD or swipe.
        </p>
        <button className={BTN} onClick={restart}>New Game</button>
      </div>

      <div
        className="relative h-(--board) w-(--board) touch-none rounded-[14px] bg-board p-(--gap) shadow-[0_12px_30px_rgba(119,110,101,.3)] select-none"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* static background cells */}
        <div className="grid grid-cols-[repeat(4,var(--cell))] grid-rows-[repeat(4,var(--cell))] gap-(--gap)">
          {Array.from({ length: SIZE * SIZE }, (_, i) => (
            <div className="rounded-lg bg-cell" key={i} />
          ))}
        </div>

        {/* moving tiles: outer = position (transition), inner = look + keyframes */}
        <div className="pointer-events-none absolute inset-(--gap)">
          {game.tiles.map((t) => (
            <div
              key={t.id}
              className={
                "absolute top-0 left-0 h-(--cell) w-(--cell) transition-transform duration-(--slide) ease-in-out motion-reduce:duration-1 " +
                "[transform:translate(calc(var(--col)*(var(--cell)_+_var(--gap))),calc(var(--row)*(var(--cell)_+_var(--gap))))] " +
                (t.gone ? "z-10" : "z-20") // consumed tile slides underneath the survivor
              }
              style={{ "--row": t.row, "--col": t.col }}
            >
              <div
                key={t.value} /* remount on value change so the merge animation replays */
                className={[
                  "flex h-full w-full items-center justify-center rounded-lg font-extrabold motion-reduce:animate-none",
                  TILE_COLORS[t.value > 2048 ? "super" : t.value],
                  fontSizeFor(t.value),
                  t.isNew ? "animate-pop" : "",
                  t.merged ? "animate-merge" : "",
                ].join(" ")}
              >
                {t.value}
              </div>
            </div>
          ))}
        </div>

        {(game.over || (game.won && !game.keepPlaying)) && (
          <div
            className="absolute inset-0 z-50 flex animate-fade-in flex-col items-center justify-center gap-2 rounded-[14px] bg-overlay text-center backdrop-blur-[2px] motion-reduce:animate-none"
            role="alertdialog"
            aria-live="assertive"
          >
            <h2 className="m-0 text-[length:clamp(1.8rem,8vw,2.6rem)] font-bold">
              {game.over ? "Game over" : "You made 2048!"}
            </h2>
            <p className="m-0 mb-2 text-[1.1rem]">Final score: {game.score}</p>
            <div className="flex gap-2.5">
              {!game.over && (
                <button className={BTN_GHOST} onClick={keepGoing}>Keep going</button>
              )}
              <button className={BTN} onClick={restart}>Try again</button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
