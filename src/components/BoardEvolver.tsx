import { useEffect, useRef, useState } from "react";

const LETTER_FREQ =
  "EEEEEEEEEEEEAAAAAAAAARRRRRRRRIIIIIIIIOOOOOOOOTTTTTTTNNNNNNNSSSSSSLLLLLCCCCUUUUDDDDPPPMMMHHHGGBBFFYYWWKVXZJQ";

const POINTS: Record<number, number> = { 3: 100, 4: 400, 5: 800, 6: 1400, 7: 1800 };
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

const DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

function scoreBoard(board: string[], size: number, trie: TrieNode) {
  const rows = size, cols = size;
  const grid = (r: number, c: number) => board[r * cols + c];
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
  const found = new Set<string>();

  function dfs(r: number, c: number, node: TrieNode, word: string) {
    visited[r][c] = true;
    if (node.isWord && word.length >= 3) found.add(word);
    for (const [dr, dc] of DIRS) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || visited[nr][nc]) continue;
      const letter = grid(nr, nc).toLowerCase();
      const next = node.children.get(letter);
      if (!next) continue;
      dfs(nr, nc, next, word + letter);
    }
    visited[r][c] = false;
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const letter = grid(r, c).toLowerCase();
      const first = trie.children.get(letter);
      if (!first) continue;
      dfs(r, c, first, letter);
    }
  }

  const score = Array.from(found).reduce((s, w) => s + pointsFor(w.length), 0);
  return { score, words: Array.from(found).sort((a, b) => b.length - a.length) };
}

function randomLetter() {
  return LETTER_FREQ[Math.floor(Math.random() * LETTER_FREQ.length)];
}
function randomBoard(size: number) {
  return Array.from({ length: size * size }, randomLetter);
}
function mutate(board: string[], rate: number) {
  return board.map((l) => (Math.random() < rate ? randomLetter() : l));
}
function crossover(a: string[], b: string[]) {
  const cut = Math.floor(Math.random() * a.length);
  return a.slice(0, cut).concat(b.slice(cut));
}

export default function BoardEvolver() {
  const [size, setSize] = useState(4);
  const [population, setPopulation] = useState(60);
  const [mutationRate, setMutationRate] = useState(0.08);
  const [intervalMs, setIntervalMs] = useState(120);
  const [extreme, setExtreme] = useState(false);

  const [running, setRunning] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [bestBoard, setBestBoard] = useState<string[]>(() => randomBoard(4));
  const [bestWords, setBestWords] = useState<string[]>([]);
  const [history, setHistory] = useState<number[]>([]);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [evalTimeMs, setEvalTimeMs] = useState<number | null>(null);

  const trieRef = useRef<TrieNode | null>(null);
  const popRef = useRef<string[][]>([]);
  const timerRef = useRef<number | null>(null);
  const bestScoreRef = useRef(0);
  const generationRef = useRef(0);
  const GENERATIONS_PER_TICK = 4;

  useEffect(() => {
    fetch("/dictionary.txt")
      .then((r) => r.text())
      .then((text) => {
        trieRef.current = buildTrie(text.split("\n"));
        setStatus("ready");
      });
    return () => stop();
  }, []);

  function resetPopulation() {
    popRef.current = Array.from({ length: population }, () => randomBoard(size));
    bestScoreRef.current = 0;
    generationRef.current = 0;
    setGeneration(0);
    setBestScore(0);
    setBestBoard(randomBoard(size));
    setBestWords([]);
    setHistory([]);
    setEvalTimeMs(null);
  }

  function stepGeneration() {
    const trie = trieRef.current;
    if (!trie) return;
    let pop = popRef.current;
    if (pop.length === 0 || pop[0].length !== size * size) {
      pop = Array.from({ length: population }, () => randomBoard(size));
    }

    let latestBestBoard: string[] | null = null;
    let latestBestWords: string[] = [];
    const tickHistory: number[] = [];
    const evalStart = performance.now();

    for (let g = 0; g < GENERATIONS_PER_TICK; g++) {
      const scored = pop.map((b) => ({ board: b, ...scoreBoard(b, size, trie) }));
      scored.sort((a, b) => b.score - a.score);

      if (scored[0].score > bestScoreRef.current) {
        bestScoreRef.current = scored[0].score;
        latestBestBoard = scored[0].board;
        latestBestWords = scored[0].words;
      }
      tickHistory.push(scored[0].score);

      const eliteCount = Math.max(2, Math.floor(population * 0.15));
      const elites = scored.slice(0, eliteCount).map((s) => s.board);
      const next: string[][] = [...elites];

      while (next.length < population) {
        const a = elites[Math.floor(Math.random() * elites.length)];
        const b = elites[Math.floor(Math.random() * elites.length)];
        let child = crossover(a, b);
        const rate = extreme && Math.random() < 0.1 ? mutationRate * 4 : mutationRate;
        child = mutate(child, rate);
        next.push(child);
      }

      pop = next;
      generationRef.current++;
    }

    const evalMs = performance.now() - evalStart;
    popRef.current = pop;

    setEvalTimeMs(evalMs);
    setGeneration(generationRef.current);
    setHistory((h) => [...h, ...tickHistory].slice(-50));
    if (latestBestBoard) {
      setBestScore(bestScoreRef.current);
      setBestBoard(latestBestBoard);
      setBestWords(latestBestWords);
    }
  }

  function start() {
    if (running || status !== "ready") return;
    if (popRef.current.length === 0) resetPopulation();
    setRunning(true);
    timerRef.current = window.setInterval(stepGeneration, intervalMs);
  }
  function stop() {
    setRunning(false);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }
  function reset() {
    stop();
    resetPopulation();
  }
  function applyAndReset() {
    stop();
    resetPopulation();
  }

  return (
    <div className="card">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">
          Board Size
          <select
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-brand-100 bg-white px-2 py-1.5 text-brand-900 dark:border-brand-700 dark:bg-brand-900 dark:text-white"
          >
            <option value={4}>4 x 4</option>
            <option value={5}>5 x 5</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">
          Population Size (max 500)
          <input
            type="number" min={10} max={500} value={population}
            onChange={(e) => setPopulation(Math.min(500, Math.max(10, Number(e.target.value) || 10)))}
            className="mt-1 w-full rounded-lg border border-brand-100 bg-white px-2 py-1.5 text-brand-900 dark:border-brand-700 dark:bg-brand-900 dark:text-white"
          />
        </label>
        <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">
          Mutation Rate
          <input
            type="number" min={0.01} max={0.5} step={0.01} value={mutationRate}
            onChange={(e) => setMutationRate(Math.min(0.5, Math.max(0.01, Number(e.target.value) || 0.01)))}
            className="mt-1 w-full rounded-lg border border-brand-100 bg-white px-2 py-1.5 text-brand-900 dark:border-brand-700 dark:bg-brand-900 dark:text-white"
          />
        </label>
        <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">
          Interval (ms)
          <input
            type="number" min={30} max={1000} step={10} value={intervalMs}
            onChange={(e) => setIntervalMs(Math.min(1000, Math.max(30, Number(e.target.value) || 30)))}
            className="mt-1 w-full rounded-lg border border-brand-100 bg-white px-2 py-1.5 text-brand-900 dark:border-brand-700 dark:bg-brand-900 dark:text-white"
          />
        </label>
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-200">
        <input type="checkbox" checked={extreme} onChange={(e) => setExtreme(e.target.checked)} />
        Extreme Mode (diversity injection)
      </label>

      {running && (
        <div className="badge-warning mt-4">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-75"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-warning"></span>
          </span>
          Evolving your Word Hunt board...
        </div>
      )}

      <p className="mt-3 rounded-xl border border-warning/30 bg-warning-bg px-4 py-2.5 text-xs text-amber-700">
        Population is capped at 500 to prevent the page from freezing. Running many generations at
        once can still slow underpowered devices, start with a small population and increase gradually.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <button onClick={applyAndReset} className="btn-primary bg-brand-100 text-brand-600 hover:bg-brand-200 dark:bg-brand-700 dark:text-white">
          Apply &amp; Reset
        </button>
        <button onClick={start} disabled={running || status !== "ready"} className="btn-accent disabled:opacity-50">
          Start
        </button>
        <button onClick={stop} disabled={!running} className="btn-primary disabled:opacity-50">
          Stop
        </button>
        <button onClick={reset} className="btn-primary bg-brand-100 text-brand-600 hover:bg-brand-200 dark:bg-brand-700 dark:text-white">
          Reset
        </button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-5">
            <div className="card !p-3">
              <p className="text-xs whitespace-nowrap text-brand-400">Generation</p>
              <p className="text-xl font-extrabold text-brand-700 dark:text-white">{generation}</p>
            </div>
            <div className="card !p-3">
              <p className="text-xs whitespace-nowrap text-brand-400">Best Score</p>
              <p className="text-xl font-extrabold text-headline dark:text-headline-dark">{bestScore}</p>
            </div>
            <div className="card !p-3">
              <p className="text-xs whitespace-nowrap text-brand-400">Words Found</p>
              <p className="text-xl font-extrabold text-brand-700 dark:text-white">{bestWords.length}</p>
            </div>
            <div className="card !p-3">
              <p className="text-xs whitespace-nowrap text-brand-400">Eval Time</p>
              <p className="text-xl font-extrabold text-brand-700 dark:text-white">
                {evalTimeMs === null ? "Not yet" : `${evalTimeMs.toFixed(0)}ms`}
              </p>
            </div>
            <div className="card !p-3">
              <p className="text-xs whitespace-nowrap text-brand-400">Status</p>
              <p className="text-xl font-extrabold text-brand-700 dark:text-white">{running ? "Running" : "Idle"}</p>
            </div>
          </div>

          <p className="mt-4 mb-2 text-sm font-semibold text-gray-900 dark:text-gray-200">Best Board</p>
          <div className="grid max-w-xs gap-1.5" style={{ gridTemplateColumns: `repeat(${size}, minmax(0,1fr))` }}>
            {bestBoard.map((l, i) => (
              <div key={i} className="flex aspect-square items-center justify-center rounded-lg border-2 border-brand-100 bg-white text-lg font-bold text-brand-700 dark:border-brand-700 dark:bg-brand-900 dark:text-white">
                {l}
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-200">Score Over Generations</p>
          <svg viewBox="0 0 300 100" className="h-24 w-full rounded-lg border border-brand-100 bg-white dark:border-brand-700 dark:bg-brand-900">
            {history.length > 1 && (
              <polyline
                fill="none"
                stroke="#0472AB"
                strokeWidth="2"
                points={history
                  .map((s, i) => {
                    const max = Math.max(...history, 1);
                    const x = (i / (history.length - 1)) * 300;
                    const y = 100 - (s / max) * 90 - 5;
                    return `${x},${y}`;
                  })
                  .join(" ")}
              />
            )}
          </svg>

          <p className="mt-4 mb-2 text-sm font-semibold text-gray-900 dark:text-gray-200">Words</p>
          <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {bestWords.length === 0 && <p className="text-sm text-brand-400">No words yet, start the evolution.</p>}
            {bestWords.map((w) => (
              <span key={w} className="rounded-lg border border-secondary-300 px-2.5 py-1 text-xs font-semibold text-secondary-600 dark:border-secondary-600/40 dark:text-secondary-300">
                {w.toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
