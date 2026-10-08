import { useEffect, useMemo, useRef, useState } from "react";
import { scanScreenshot } from "../lib/scanUpload";

const MIN_SIZE = 3;
const MAX_SIZE = 6;
const DEFAULT_SIZE = 4;
const MIN_WORD_LEN = 3;
const SAVE_KEY = "wh_last_board";

const POINTS: Record<number, number> = {
  3: 100,
  4: 400,
  5: 800,
  6: 1400,
  7: 1800,
};
function pointsFor(len: number) {
  // Scoring above 8 letters is not confirmed, so 9+ letter words count as 2,200 (a minimum).
  if (len >= 8) return 2200;
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
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [unsure, setUnsure] = useState<boolean[][] | null>(null);
  const [scanMsg, setScanMsg] = useState<{ kind: "info" | "warn" | "error"; text: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lenFilter, setLenFilter] = useState<number>(0); // 0 = all, 8 = 8 or more
  const [startsWith, setStartsWith] = useState("");
  const [endsWith, setEndsWith] = useState("");
  const [copied, setCopied] = useState(false);
  const restoredRef = useRef(false);

  // Remember the last board on this device only (browser storage, never sent anywhere).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      if (
        saved &&
        Number.isInteger(saved.rows) && Number.isInteger(saved.cols) &&
        saved.rows >= MIN_SIZE && saved.rows <= MAX_SIZE &&
        saved.cols >= MIN_SIZE && saved.cols <= MAX_SIZE &&
        Array.isArray(saved.grid) && saved.grid.length === saved.rows &&
        saved.grid.every((row: unknown) => Array.isArray(row) && row.length === saved.cols &&
          row.every((ch) => typeof ch === "string" && /^[A-Z]?$/.test(ch)))
      ) {
        setRows(saved.rows);
        setCols(saved.cols);
        setGrid(saved.grid);
      }
    } catch {}
    restoredRef.current = true;
  }, []);

  useEffect(() => {
    if (!restoredRef.current) return;
    try {
      if (grid.some((row) => row.some((ch) => ch))) {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ rows, cols, grid }));
      } else {
        localStorage.removeItem(SAVE_KEY);
      }
    } catch {}
  }, [rows, cols, grid]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setScanning(true);
    setScanMsg(null);
    const r = await scanScreenshot(file);
    setScanning(false);
    if (!r.ok) {
      const text = {
        type: "Please upload a PNG, JPG, or WebP image.",
        load: "We couldn't open that image. Try another screenshot.",
        noboard: "We couldn't find a Word Hunt board in this image. Upload a screenshot that shows the full board.",
        size: "We found a grid, but its size isn't between 3x3 and 6x6. Set the rows and columns and type the letters instead.",
      }[r.reason];
      setScanMsg({ kind: "error", text });
      return;
    }
    setRows(r.rows);
    setCols(r.cols);
    setGrid(r.letters);
    setUnsure(r.unsure);
    setResults(null);
    setActiveWord(null);
    const flagged = r.unsure.flat().filter(Boolean).length;
    setScanMsg(
      flagged
        ? { kind: "warn", text: `Board found. Please check the ${flagged} highlighted tile${flagged === 1 ? "" : "s"}, fix any wrong letter, then tap Solve.` }
        : { kind: "info", text: "Board found. Check the letters, then tap Solve." }
    );
  }

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
    setUnsure(null);
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
    setUnsure((u) => {
      if (!u?.[r]?.[c]) return u;
      const next = u.map((row) => row.slice());
      next[r][c] = false;
      return next;
    });
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
    setUnsure(null);
    setScanMsg(null);
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
    setLenFilter(0);
    setStartsWith("");
    setEndsWith("");
    setStatus("ready");
  }

  const pathIndex = (r: number, c: number) =>
    activeWord ? activeWord.path.findIndex(([pr, pc]) => pr === r && pc === c) : -1;

  const summary = useMemo(() => {
    if (!results) return null;
    const counts = new Map<number, number>();
    let total = 0;
    let hasLong = false;
    for (const w of results) {
      const len = w.word.length;
      counts.set(len, (counts.get(len) ?? 0) + 1);
      total += pointsFor(len);
      if (len >= 9) hasLong = true;
    }
    const lengths = Array.from(counts.keys()).sort((a, b) => b - a);
    return { counts, total, hasLong, lengths };
  }, [results]);

  const filtered = useMemo(() => {
    if (!results) return [];
    const sw = startsWith.toLowerCase();
    const ew = endsWith.toLowerCase();
    return results.filter((w) => {
      const len = w.word.length;
      if (lenFilter === 8 ? len < 8 : lenFilter && len !== lenFilter) return false;
      if (sw && !w.word.startsWith(sw)) return false;
      if (ew && !w.word.endsWith(ew)) return false;
      return true;
    });
  }, [results, lenFilter, startsWith, endsWith]);

  const groups = useMemo(() => {
    const map = new Map<number, FoundWord[]>();
    for (const w of filtered) {
      const len = w.word.length;
      if (!map.has(len)) map.set(len, []);
      map.get(len)!.push(w);
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [filtered]);

  const filterOptions = useMemo(() => {
    if (!summary) return [];
    const opts = new Set<number>();
    for (const len of summary.lengths) opts.add(Math.min(len, 8));
    return Array.from(opts).sort((a, b) => a - b);
  }, [summary]);

  async function copyWords() {
    const text = groups
      .map(([len, words]) => `${len} letters: ${words.map((w) => w.word.toUpperCase()).join(", ")}`)
      .join("\n");
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {}
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const letterFilter = (v: string) => v.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 6);

  const hasAnyLetter = useMemo(() => grid.some((row) => row.some((c) => c)), [grid]);

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-200">
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
          row.map((val, c) => {
            const idx = pathIndex(r, c);
            return (
            <div key={`${r}-${c}`} className="relative">
            <input
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
                unsure?.[r]?.[c]
                  ? "border-warning bg-warning-bg text-brand-700"
                  : idx === 0
                  ? "border-headline bg-accent-500/30 text-brand-700 dark:border-accent-300 dark:text-accent-300"
                  : idx > 0
                  ? "border-accent-500 bg-accent-500/20 text-brand-700 dark:text-accent-300"
                  : "border-brand-100 bg-white text-brand-700 focus:border-brand-500 dark:border-brand-700 dark:bg-brand-900 dark:text-white"
              }`}
            />
            {idx >= 0 && !unsure?.[r]?.[c] && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-1 top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-headline px-1 text-[11px] font-bold leading-none text-white dark:bg-headline-dark"
              >
                {idx + 1}
              </span>
            )}
            </div>
            );
          })
        )}
      </div>

      {activeWord && (
        <p className="mt-3 text-center text-sm text-gray-600 dark:text-gray-300" aria-live="polite">
          Swipe <strong className="text-gray-900 dark:text-white">{activeWord.word.toUpperCase()}</strong> by following the numbers, starting at tile 1.
        </p>
      )}

      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <button onClick={solve} disabled={!hasAnyLetter || status !== "ready" && status !== "idle"} className="btn-accent disabled:opacity-50">
          Solve
        </button>
        <button onClick={clearBoard} className="btn-primary bg-brand-100 text-brand-600 hover:bg-brand-200 dark:bg-brand-700 dark:text-white">
          Clear
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={scanning} className="btn-primary disabled:opacity-50">
          {scanning ? "Reading board..." : "Upload Screenshot"}
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onUpload} className="hidden" aria-label="Upload a screenshot of your Word Hunt board" />
      </div>

      {scanMsg && (
        <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-center text-sm ${scanMsg.kind === "error" ? "bg-error-bg text-brand-700" : scanMsg.kind === "warn" ? "bg-warning-bg text-brand-700" : "bg-success-bg text-brand-700"}`}>
          {scanMsg.text}
        </p>
      )}

      <p className="mt-3 text-center text-sm text-gray-600 dark:text-gray-300">
        Upload a clear screenshot of your full Word Hunt board (PNG, JPG, or WebP), and the letters fill in for you to check.
      </p>

      {results && summary && (
        <div className="mt-6 border-t border-brand-100 pt-5 dark:border-brand-700">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-brand-100 p-3 text-center dark:border-brand-700">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Words Found</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{results.length.toLocaleString("en-US")}</p>
            </div>
            <div className="rounded-xl border border-brand-100 p-3 text-center dark:border-brand-700">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Total Points</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{summary.total.toLocaleString("en-US")}{summary.hasLong ? "+" : ""}</p>
            </div>
          </div>

          {results.length > 0 && (
            <>
              <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
                {summary.lengths.map((len) => (
                  <span key={len} className="rounded-full bg-brand-50 px-2.5 py-1 font-semibold text-brand-700 dark:bg-white/10 dark:text-gray-200">
                    {len} letters: {summary.counts.get(len)}
                  </span>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by word length">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-200">Length</span>
                {[0, ...filterOptions].map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setLenFilter(opt)}
                    aria-pressed={lenFilter === opt}
                    className={`rounded-lg border px-2.5 py-1 text-sm font-semibold transition ${
                      lenFilter === opt
                        ? "border-accent-500 bg-accent-500/20 text-brand-700 dark:text-accent-300"
                        : "border-brand-100 text-gray-700 hover:border-accent-500 dark:border-brand-700 dark:text-gray-200"
                    }`}
                  >
                    {opt === 0 ? "All" : opt === 8 ? "8+" : opt}
                  </button>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">
                  Starts with
                  <input
                    value={startsWith}
                    onChange={(e) => setStartsWith(letterFilter(e.target.value))}
                    autoComplete="off"
                    placeholder="e.g. RE"
                    className="mt-1 w-full rounded-lg border border-brand-100 bg-white px-2 py-1.5 text-sm font-normal uppercase text-brand-700 outline-none placeholder:normal-case focus:border-brand-500 dark:border-brand-700 dark:bg-brand-900 dark:text-white"
                  />
                </label>
                <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">
                  Ends with
                  <input
                    value={endsWith}
                    onChange={(e) => setEndsWith(letterFilter(e.target.value))}
                    autoComplete="off"
                    placeholder="e.g. ING"
                    className="mt-1 w-full rounded-lg border border-brand-100 bg-white px-2 py-1.5 text-sm font-normal uppercase text-brand-700 outline-none placeholder:normal-case focus:border-brand-500 dark:border-brand-700 dark:bg-brand-900 dark:text-white"
                  />
                </label>
                <button
                  onClick={copyWords}
                  disabled={filtered.length === 0}
                  className="btn-primary col-span-2 self-end disabled:opacity-50 sm:col-span-1"
                >
                  {copied ? "Copied!" : filtered.length === results.length ? "Copy All Words" : `Copy ${filtered.length} Words`}
                </button>
              </div>

              <p className="mt-3 text-sm text-gray-600 dark:text-gray-300" role="status">
                Showing {filtered.length.toLocaleString("en-US")} of {results.length.toLocaleString("en-US")} words
              </p>
            </>
          )}

          <div className="mt-2 max-h-96 overflow-y-auto pr-1">
            {groups.map(([len, words]) => (
              <div key={len} className="mt-3 first:mt-0">
                <p className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-200">
                  {len} Letters <span className="font-normal text-gray-600 dark:text-gray-300">({words.length}, {pointsFor(len).toLocaleString("en-US")}{len >= 9 ? "+" : ""} points each)</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {words.map((r) => (
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
                      {r.word.toUpperCase()} <span className="text-xs opacity-70">+{pointsFor(r.word.length).toLocaleString("en-US")}{r.word.length >= 9 ? "+" : ""}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {results.length === 0 && (
              <p className="text-sm text-brand-400">No words found. Double check your letters and try again.</p>
            )}
            {results.length > 0 && filtered.length === 0 && (
              <p className="text-sm text-gray-600 dark:text-gray-300">No words match these filters.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
