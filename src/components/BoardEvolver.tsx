import { useEffect, useRef, useState } from "react";

const LETTER_FREQ =
  "EEEEEEEEEEEEAAAAAAAAARRRRRRRRIIIIIIIIOOOOOOOOTTTTTTTNNNNNNNSSSSSSLLLLLCCCCUUUUDDDDPPPMMMHHHGGBBFFYYWWKVXZJQ";

const POINTS: Record<number, number> = { 3: 100, 4: 400, 5: 800, 6: 1400, 7: 1800 };
function pointsFor(len: number) {
  if (len >= 8) return 2200 + (len - 8) * 400;
  return POINTS[len] ?? 0;
}

// Plain-object trie (faster child lookups in V8 than Map for small key sets).
type TrieNode = { c: Record<string, TrieNode>; w: boolean };
function buildTrie(words: string[]): TrieNode {
  const root: TrieNode = { c: {}, w: false };
  for (const word of words) {
    let node = root;
    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      let next = node.c[ch];
      if (!next) {
        next = { c: {}, w: false };
        node.c[ch] = next;
      }
      node = next;
    }
    node.w = true;
  }
  return root;
}

const DIRS: [number, number][] = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

// Reusable scratch buffers to avoid re-allocating on every board scored,
// this is the main speed win versus allocating a fresh visited array per call.
let scratchVisited: Int32Array | null = null;
let scratchStamp = 0;

function scoreBoard(board: string[], size: number, trie: TrieNode) {
  const rows = size, cols = size;
  const cellCount = rows * cols;
  if (!scratchVisited || scratchVisited.length !== cellCount) {
    scratchVisited = new Int32Array(cellCount);
    scratchStamp = 0;
  }
  scratchStamp++;
  const visited = scratchVisited;
  const stamp = scratchStamp;
  const found = new Set<string>();
  const letters = board.map((l) => l.toLowerCase());

  function dfs(idx: number, node: TrieNode, word: string) {
    visited[idx] = stamp;
    if (node.w && word.length >= 3) found.add(word);
    const r = (idx / cols) | 0;
    const c = idx % cols;
    for (let d = 0; d < 8; d++) {
      const nr = r + DIRS[d][0];
      const nc = c + DIRS[d][1];
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const nIdx = nr * cols + nc;
      if (visited[nIdx] === stamp) continue;
      const next = node.c[letters[nIdx]];
      if (!next) continue;
      dfs(nIdx, next, word + letters[nIdx]);
    }
    visited[idx] = 0;
  }

  for (let idx = 0; idx < cellCount; idx++) {
    const first = trie.c[letters[idx]];
    if (!first) continue;
    dfs(idx, first, letters[idx]);
  }

  let score = 0;
  found.forEach((w) => (score += pointsFor(w.length)));
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

const MAX_POPULATION = 2000;

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
  const [hasRunOnce, setHasRunOnce] = useState(false);

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
      let bestOfGen = -1;
      let bestBoardOfGen: string[] | null = null;
      let bestWordsOfGen: string[] = [];
      const scored: { board: string[]; score: number }[] = new Array(pop.length);

      for (let i = 0; i < pop.length; i++) {
        const r = scoreBoard(pop[i], size, trie);
        scored[i] = { board: pop[i], score: r.score };
        if (r.score > bestOfGen) {
          bestOfGen = r.score;
          bestBoardOfGen = pop[i];
          bestWordsOfGen = r.words;
        }
      }
      scored.sort((a, b) => b.score - a.score);

      if (bestOfGen > bestScoreRef.current) {
        bestScoreRef.current = bestOfGen;
        latestBestBoard = bestBoardOfGen;
        latestBestWords = bestWordsOfGen;
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
    setHasRunOnce(true);
    timerRef.current = window.setInterval(stepGeneration, intervalMs);
  }
  function stop() {
    setRunning(false);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }
  function reset() {
    stop();
    setHasRunOnce(false);
    resetPopulation();
  }
  function applyAndReset() {
    stop();
    setHasRunOnce(false);
    resetPopulation();
  }

  const maxHistory = history.length ? Math.max(...history, 1) : 1;

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
          Population Size (max {MAX_POPULATION})
          <input
            type="number" min={10} max={MAX_POPULATION} value={population}
            onChange={(e) => setPopulation(Math.min(MAX_POPULATION, Math.max(10, Number(e.target.value) || 10)))}
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

      {running ? (
        <div className="badge-warning mt-4">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-75"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-warning"></span>
          </span>
          Evolving your Word Hunt board...
        </div>
      ) : (
        <div className="badge-success mt-4">
          <span className="h-2.5 w-2.5 rounded-full bg-success"></span>
          {hasRunOnce ? "Paused. Press Start to keep evolving this board." : "Ready. Press Start to begin evolving a board."}
        </div>
      )}

      <p className="mt-3 rounded-xl border border-warning/30 bg-warning-bg px-4 py-2.5 text-xs text-amber-700">
        Large populations take more time to evaluate each generation, so higher settings run slower
        on less powerful devices. Start small and increase gradually to find a comfortable speed.
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
          <svg viewBox="0 0 300 100" preserveAspectRatio="none" className="h-24 w-full rounded-lg border border-brand-100 bg-white dark:border-brand-700 dark:bg-brand-900">
            {history.length > 1 && (
              <polyline
                fill="none"
                stroke="#0472AB"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                points={history
                  .map((s, i) => {
                    const x = (i / (history.length - 1)) * 300;
                    const y = 100 - (s / maxHistory) * 90 - 5;
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
