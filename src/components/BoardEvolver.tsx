import { useEffect, useRef, useState } from "react";

function randomBoard(size: number) {
  const LETTER_FREQ =
    "EEEEEEEEEEEEAAAAAAAAARRRRRRRRIIIIIIIIOOOOOOOOTTTTTTTNNNNNNNSSSSSSLLLLLCCCCUUUUDDDDPPPMMMHHHGGBBFFYYWWKVXZJQ";
  return Array.from(
    { length: size * size },
    () => LETTER_FREQ[Math.floor(Math.random() * LETTER_FREQ.length)]
  );
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
  const [bestBoard, setBestBoard] = useState<string[]>(() => Array(16).fill(""));
  const [bestWords, setBestWords] = useState<string[]>([]);
  const [history, setHistory] = useState<number[]>([]);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [evalTimeMs, setEvalTimeMs] = useState<number | null>(null);
  const [hasRunOnce, setHasRunOnce] = useState(false);

  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL("../workers/evolver.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "ready") {
        setStatus("ready");
      } else if (msg.type === "reset") {
        setGeneration(0);
        setBestScore(0);
        setBestWords([]);
        setHistory([]);
        setEvalTimeMs(null);
      } else if (msg.type === "tick") {
        setGeneration(msg.generation);
        setBestScore(msg.bestScore);
        setEvalTimeMs(msg.evalMs);
        setHistory((h) => [...h, ...msg.tickHistory].slice(-50));
        if (msg.bestBoard) {
          setBestBoard(msg.bestBoard);
          setBestWords(msg.bestWords);
        }
      }
    };

    fetch("/dictionary.txt")
      .then((r) => r.text())
      .then((text) => {
        worker.postMessage({ type: "loadDictionary", words: text.split("\n") });
      });

    return () => worker.terminate();
  }, []);

  useEffect(() => {
    // Best Board must always match the current grid size, otherwise the
    // display grid and the array length mismatch and the board renders broken.
    setBestBoard(randomBoard(size));
    setBestScore(0);
    setBestWords([]);
    setHistory([]);
    setEvalTimeMs(null);
    setGeneration(0);
    setHasRunOnce(false);
    setRunning(false);
    workerRef.current?.postMessage({ type: "stop" });
  }, [size]);

  function sendConfig() {
    workerRef.current?.postMessage({
      type: "configure",
      size,
      population,
      mutationRate,
      intervalMs,
      extreme,
    });
  }

  function start() {
    if (running || status !== "ready") return;
    sendConfig();
    setRunning(true);
    setHasRunOnce(true);
    workerRef.current?.postMessage({ type: "start" });
  }
  function stop() {
    setRunning(false);
    workerRef.current?.postMessage({ type: "stop" });
  }
  function reset() {
    stop();
    setHasRunOnce(false);
    setBestBoard(randomBoard(size));
    sendConfig();
    workerRef.current?.postMessage({ type: "resetPopulation" });
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
          Population Size
          <input
            type="number" min={10} value={population}
            onChange={(e) => setPopulation(Math.max(10, Number(e.target.value) || 10))}
            className="mt-1 w-full rounded-lg border border-brand-100 bg-white px-2 py-1.5 text-brand-900 dark:border-brand-700 dark:bg-brand-900 dark:text-white"
          />
        </label>
        <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">
          Mutation Rate <span className="font-normal text-brand-400">(0.08 = 8%)</span>
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
        This runs in a background thread so the page will not freeze, but very large populations still
        take real time and memory to evaluate each generation and can slow down or crash weaker devices.
        Start with a small population and increase it gradually.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
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

      <div className="mt-6 grid grid-cols-2 gap-3 text-center sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: "Generation", value: generation.toLocaleString("en-US"), accent: false },
          { label: "Best Score", value: `${bestScore.toLocaleString("en-US")}${bestWords.some((w) => w.length >= 9) ? "+" : ""}`, accent: true },
          { label: "Words Found", value: bestWords.length.toLocaleString("en-US"), accent: false },
          { label: "Eval Time", value: evalTimeMs === null ? "Not yet" : `${evalTimeMs.toFixed(0)} ms`, accent: false },
          { label: "Status", value: running ? "Running" : "Idle", accent: false },
        ].map((st, idx) => (
          <div
            key={st.label}
            className={`${idx === 4 ? "col-span-2 sm:col-span-1 " : ""}flex min-h-24 min-w-0 flex-col items-center justify-center rounded-2xl border px-3 py-4 ${
              st.accent
                ? "border-headline/30 bg-accent-500/40 dark:border-headline-dark/40 dark:bg-brand-800"
                : "border-brand-100 bg-white dark:border-brand-700 dark:bg-brand-900"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-400 dark:text-brand-300">{st.label}</p>
            <p
              className={`mt-1 whitespace-nowrap text-2xl font-extrabold tabular-nums leading-tight ${
                st.accent ? "text-headline dark:text-headline-dark" : "text-brand-700 dark:text-white"
              }`}
            >
              {st.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-brand-100 bg-white p-5 dark:border-brand-700 dark:bg-brand-900">
          <p className="text-sm font-bold text-gray-900 dark:text-white">Best Board</p>
          <div className="mx-auto mt-3 grid max-w-sm gap-2" style={{ gridTemplateColumns: `repeat(${size}, minmax(0,1fr))` }}>
            {bestBoard.map((l, i) => (
              <div key={i} className="flex aspect-square items-center justify-center rounded-xl border-2 border-brand-100 bg-white text-xl font-bold text-brand-700 shadow-sm dark:border-brand-700 dark:bg-brand-800 dark:text-white">
                {l}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-brand-100 bg-white p-5 dark:border-brand-700 dark:bg-brand-900">
          <p className="mb-2 text-sm font-bold text-gray-900 dark:text-white">Score Over Generations</p>
          <svg viewBox="0 0 300 100" preserveAspectRatio="none" className="h-28 w-full rounded-lg border border-brand-100 bg-brand-50/50 dark:border-brand-700 dark:bg-brand-800">
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

          <p className="mt-4 mb-2 flex items-center justify-between text-sm font-bold text-gray-900 dark:text-white">Words on the Best Board<span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-600 dark:bg-brand-800 dark:text-brand-200">{bestWords.length}</span></p>
          <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {bestWords.length === 0 && <p className="text-sm text-brand-400">No words yet, start the evolution.</p>}
            {bestWords.map((w) => (
              <span key={w} className="rounded-lg border border-secondary-300 px-2.5 py-1 text-xs font-semibold text-secondary-600 dark:border-secondary-600/40 dark:text-secondary-300">
                {w.toUpperCase()} <span className="opacity-70">+{(w.length >= 8 ? 2200 : ({ 3: 100, 4: 400, 5: 800, 6: 1400, 7: 1800 } as Record<number, number>)[w.length] ?? 0).toLocaleString("en-US")}{w.length >= 9 ? "+" : ""}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
