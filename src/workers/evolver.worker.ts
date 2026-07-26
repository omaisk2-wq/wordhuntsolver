// Runs the entire genetic algorithm in a background thread so the UI never
// freezes, no matter how large the population is set to.

const LETTER_FREQ =
  "EEEEEEEEEEEEAAAAAAAAARRRRRRRRIIIIIIIIOOOOOOOOTTTTTTTNNNNNNNSSSSSSLLLLLCCCCUUUUDDDDPPPMMMHHHGGBBFFYYWWKVXZJQ";

const POINTS: Record<number, number> = { 3: 100, 4: 400, 5: 800, 6: 1400, 7: 1800 };
function pointsFor(len: number) {
  if (len >= 8) return 2200 + (len - 8) * 400;
  return POINTS[len] ?? 0;
}

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
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

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

let trie: TrieNode | null = null;
let pop: string[][] = [];
let running = false;
let bestScore = 0;
let generation = 0;

let size = 4;
let population = 60;
let mutationRate = 0.08;
let intervalMs = 120;
let extreme = false;
const GENERATIONS_PER_TICK = 4;
let loopTimer: ReturnType<typeof setTimeout> | null = null;

function resetPopulation() {
  pop = Array.from({ length: population }, () => randomBoard(size));
  bestScore = 0;
  generation = 0;
}

function tick() {
  if (!trie || !running) return;
  const evalStart = performance.now();
  let latestBestBoard: string[] | null = null;
  let latestBestWords: string[] = [];
  const tickHistory: number[] = [];

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

    if (bestOfGen > bestScore) {
      bestScore = bestOfGen;
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
    generation++;
  }

  const evalMs = performance.now() - evalStart;

  postMessage({
    type: "tick",
    generation,
    bestScore,
    evalMs,
    tickHistory,
    bestBoard: latestBestBoard,
    bestWords: latestBestBoard ? latestBestWords : null,
  });

  if (running) {
    loopTimer = setTimeout(tick, intervalMs);
  }
}

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;
  if (msg.type === "loadDictionary") {
    trie = buildTrie(msg.words);
    postMessage({ type: "ready" });
  } else if (msg.type === "configure") {
    size = msg.size;
    population = msg.population;
    mutationRate = msg.mutationRate;
    intervalMs = msg.intervalMs;
    extreme = msg.extreme;
  } else if (msg.type === "resetPopulation") {
    resetPopulation();
    postMessage({ type: "reset" });
  } else if (msg.type === "start") {
    if (pop.length === 0) resetPopulation();
    running = true;
    tick();
  } else if (msg.type === "stop") {
    running = false;
    if (loopTimer) clearTimeout(loopTimer);
    loopTimer = null;
  }
};
