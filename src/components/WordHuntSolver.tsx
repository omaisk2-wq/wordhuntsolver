import { useEffect, useMemo, useRef, useState } from "react";

const MIN_SIZE = 3;
const MAX_SIZE = 6;
const DEFAULT_SIZE = 4;
const MIN_WORD_LEN = 3;

const POINTS: Record<number, number> = {
  3: 100,
  4: 400,
  5: 800,
  6: 1400,
  7: 1800,
};
function pointsFor(len: number) {
  if (len >= 8) return 2200 + (len - 8) * 400;
  return POINTS[len] ?? 0;
}

type TrieNode = { children: Map<string, TrieNode>; isWord: boolean };
function buildTrie(words: string[]): TrieNode {
  const root: TrieNode = { children: new Map(), isWord: false };
  for (const w of words) {
    let node = root;
    for (const ch of w) {
      let next = node.children.get(ch);
      if (!next) {
        next = { children: new Map(), isWord: false };
        node.children.set(ch, next);
      }
      node = next;
    }
    node.isWord = true;
  }
  return root;
}

function emptyGrid(rows: number, cols: number) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
}

const DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

interface FoundWord {
  word: string;
  path: [number, number][];
}

export default function WordHuntSolver() {
  const [rows, setRows] = useState(DEFAULT_SIZE);
  const [cols, setCols] = useState(DEFAULT_SIZE);
  const [grid, setGrid] = useState<string[][]>(() => emptyGrid(DEFAULT_SIZE, DEFAULT_SIZE));
  const [results, setResults] = useState<FoundWord[] | null>(null);
  const [status, setStatus] = useState<"idle" | "loading-dict" | "ready" | "solving">("idle");
  const [activeWord, setActiveWord] = useState<FoundWord | null>(null);
  const trieRef = useRef<TrieNode | null>(null);
  const inputsRef = useRef<(HTMLInputElement | null)[][]>([]);

  useEffect(() => {
    setStatus("loading-dict");
    fetch("/dictionary.txt")
      .then((r) => r.text())
      .then((text) => {
        const words = text.split("\n").filter((w) => w.length >= MIN_WORD_LEN);
        trieRef.current = buildTrie(words);
        setStatus("ready");
      })
      .catch(() => setStatus("ready"));
  }, []);

  function resizeGrid(newRows: number, newCols: number) {
    setGrid((old) => {
      const next = emptyGrid(newRows, newCols);
      for (let r = 0; r < Math.min(newRows, old.length); r++) {
        for (let c = 0; c < Math.min(newCols, old[0]?.length ?? 0); c++) {
          next[r][c] = old[r][c];
        }
      }
      return next;
    });
    setResults(null);
    setActiveWord(null);
  }

  function changeRows(delta: number) {
    const next = Math.min(MAX_SIZE, Math.max(MIN_SIZE, rows + delta));
    setRows(next);
    resizeGrid(next, cols);
  }
  function changeCols(delta: number) {
    const next = Math.min(MAX_SIZE, Math.max(MIN_SIZE, cols + delta));
    setCols(next);
    resizeGrid(rows, next);
  }

  function setCell(r: number, c: number, val: string) {
    const letter = val.replace(/[^a-zA-Z]/g, "").slice(-1).toUpperCase();
    setGrid((old) => {
      const next = old.map((row) => row.slice());
      next[r][c] = letter;
      return next;
    });
    if (letter) {
      const nr = c + 1 < cols ? r : r + 1;
      const nc = c + 1 < cols ? c + 1 : 0;
      inputsRef.current[nr]?.[nc]?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, r: number, c: number) {
    if (e.key === "Backspace" && !grid[r][c]) {
      const pr = c - 1 >= 0 ? r : r - 1;
      const pc = c - 1 >= 0 ? c - 1 : cols - 1;
      inputsRef.current[pr]?.[pc]?.focus();
    } else if (e.key === "ArrowRight") inputsRef.current[r]?.[Math.min(cols - 1, c + 1)]?.focus();
    else if (e.key === "ArrowLeft") inputsRef.current[r]?.[Math.max(0, c - 1)]?.focus();
    else if (e.key === "ArrowDown") inputsRef.current[Math.min(rows - 1, r + 1)]?.[c]?.focus();
    else if (e.key === "ArrowUp") inputsRef.current[Math.max(0, r - 1)]?.[c]?.focus();
    else if (e.key === "Enter") solve();
  }

  function clearBoard() {
    setGrid(emptyGrid(rows, cols));
    setResults(null);
    setActiveWord(null);
    inputsRef.current[0]?.[0]?.focus();
  }

  function solve() {
    if (!trieRef.current) return;
    setStatus("solving");
    const found = new Map<string, [number, number][]>();
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));

    function dfs(r: number, c: number, node: TrieNode, path: [number, number][], word: string) {
      visited[r][c] = true;
      path.push([r, c]);

      if (node.isWord && word.length >= MIN_WORD_LEN && !found.has(word)) {
        found.set(word, [...path]);
      }

      for (const [dr, dc] of DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || visited[nr][nc]) continue;
        const letter = grid[nr][nc].toLowerCase();
        if (!letter) continue;
        const next = node.children.get(letter);
        if (!next) continue;
        dfs(nr, nc, next, path, word + letter);
      }

      visited[r][c] = false;
      path.pop();
    }

    const root = trieRef.current;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const letter = grid[r][c].toLowerCase();
        if (!letter) continue;
        const first = root.children.get(letter);
        if (!first) continue;
        dfs(r, c, first, [], letter);
      }
    }

    const list: FoundWord[] = Array.from(found.entries())
      .map(([word, path]) => ({ word, path }))
      .sort((a, b) => b.word.length - a.word.length || a.word.localeCompare(b.word));

    setResults(list);
    setActiveWord(list[0] ?? null);
    setStatus("ready");
  }

  const isCellInPath = (r: number, c: number) =>
    activeWord?.path.some(([pr, pc]) => pr === r && pc === c) ?? false;

  const hasAnyLetter = useMemo(() => grid.some((row) => row.some((c) => c)), [grid]);

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-200">
          <span>Rows</span>
          <div className="flex items-center rounded-lg border border-brand-100 dark:border-brand-700">
            <button onClick={() => changeRows(-1)} className="px-2 py-1 hover:bg-brand-50 dark:hover:bg-brand-700" aria-label="Decrease rows">-</button>
            <span className="w-6 text-center">{rows}</span>
            <button onClick={() => changeRows(1)} className="px-2 py-1 hover:bg-brand-50 dark:hover:bg-brand-700" aria-label="Increase rows">+</button>
          </div>
          <span>Columns</span>
          <div className="flex items-center rounded-lg border border-brand-100 dark:border-brand-700">
            <button onClick={() => changeCols(-1)} className="px-2 py-1 hover:bg-brand-50 dark:hover:bg-brand-700" aria-label="Decrease columns">-</button>
            <span className="w-6 text-center">{cols}</span>
            <button onClick={() => changeCols(1)} className="px-2 py-1 hover:bg-brand-50 dark:hover:bg-brand-700" aria-label="Increase columns">+</button>
          </div>
        </div>
        <p className="text-xs text-brand-400 dark:text-brand-300">
          {status === "loading-dict" ? "Loading dictionary..." : "Arrow keys to move, Enter to solve"}
        </p>
      </div>

      <div
        className="mx-auto mt-5 grid max-w-md gap-2"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}
      >
        {grid.map((row, r) =>
          row.map((val, c) => (
            <input
              key={`${r}-${c}`}
              ref={(el) => {
                inputsRef.current[r] ??= [];
                inputsRef.current[r][c] = el;
              }}
              value={val}
              onChange={(e) => setCell(r, c, e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, r, c)}
              maxLength={1}
              inputMode="text"
              autoComplete="off"
              aria-label={`Letter row ${r + 1} column ${c + 1}`}
              className={`aspect-square w-full rounded-xl border-2 text-center text-xl font-bold uppercase outline-none transition ${
                isCellInPath(r, c)
                  ? "border-accent-500 bg-accent-500/20 text-brand-700 dark:text-accent-300"
                  : "border-brand-100 bg-white text-brand-700 focus:border-brand-500 dark:border-brand-700 dark:bg-brand-900 dark:text-white"
              }`}
            />
          ))
        )}
      </div>

      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <button onClick={solve} disabled={!hasAnyLetter || status !== "ready" && status !== "idle"} className="btn-accent disabled:opacity-50">
          Solve
        </button>
        <button onClick={clearBoard} className="btn-primary bg-brand-100 text-brand-600 hover:bg-brand-200 dark:bg-brand-700 dark:text-white">
          Clear
        </button>
      </div>

      {results && (
        <div className="mt-6 border-t border-brand-100 pt-5 dark:border-brand-700">
          <p className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-200">
            {results.length} word{results.length === 1 ? "" : "s"} found
          </p>
          <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
            {results.map((r) => (
              <button
                key={r.word}
                onMouseEnter={() => setActiveWord(r)}
                onClick={() => setActiveWord(r)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                  activeWord?.word === r.word
                    ? "border-accent-500 bg-accent-500/20 text-brand-700 dark:text-accent-300"
                    : "border-secondary-300 text-secondary-600 hover:border-accent-500 dark:border-secondary-600/40 dark:text-secondary-300"
                }`}
              >
                {r.word.toUpperCase()} <span className="text-xs opacity-70">+{pointsFor(r.word.length)}</span>
              </button>
            ))}
            {results.length === 0 && (
              <p className="text-sm text-brand-400">No words found. Double check your letters and try again.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
