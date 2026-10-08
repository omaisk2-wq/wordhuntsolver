// Finds a Word Hunt style letter grid in a screenshot, entirely in the browser.
// Works on plain pixel data so it can run without any outside service.

export type Px = { data: Uint8ClampedArray; width: number; height: number };
export type Tile = { x: number; y: number; w: number; h: number };
export type BoardFind = { rows: number; cols: number; tiles: Tile[][] };

function lum(d: Uint8ClampedArray, i: number) {
  return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
}
function isGreen(d: Uint8ClampedArray, i: number) {
  const r = d[i], g = d[i + 1], b = d[i + 2];
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return g === max && max > 60 && max - min > 35 && g - r > 20 && g - b > 10;
}

// Otsu threshold over luminance values inside a box.
function otsu(img: Px, x0: number, y0: number, x1: number, y1: number) {
  const hist = new Array(256).fill(0);
  let n = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      hist[Math.round(lum(img.data, (y * img.width + x) * 4))]++;
      n++;
    }
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = n - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) ** 2;
    if (v > best) { best = v; thr = t; }
  }
  return thr;
}

// Bounding box of the largest green area (the GamePigeon board background), if any.
function greenBox(img: Px) {
  const { width: W, height: H, data } = img;
  let x0 = W, y0 = H, x1 = 0, y1 = 0, count = 0;
  const rowHits = new Array(H).fill(0);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (isGreen(data, (y * W + x) * 4)) rowHits[y]++;
  for (let y = 0; y < H; y++) {
    if (rowHits[y] > W * 0.25) {
      count++;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (count < H * 0.1) return null;
  for (let y = y0; y <= y1; y++)
    for (let x = 0; x < W; x++)
      if (isGreen(data, (y * W + x) * 4)) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

function findTiles(img: Px, box: { x0: number; y0: number; x1: number; y1: number }): BoardFind | null {
  const { width: W, data } = img;
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  if (bw < 60 || bh < 60) return null;
  const thr = otsu(img, box.x0, box.y0, box.x1, box.y1);
  const mask = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const i = ((y + box.y0) * W + (x + box.x0)) * 4;
      mask[y * bw + x] = lum(data, i) > thr && !isGreen(data, i) ? 1 : 0;
    }
  // Connected components (4 neighbors).
  const label = new Int32Array(bw * bh);
  const comps: { x0: number; y0: number; x1: number; y1: number; n: number }[] = [];
  const stack: number[] = [];
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p] || label[p]) continue;
    const id = comps.length + 1;
    const c = { x0: bw, y0: bh, x1: 0, y1: 0, n: 0 };
    label[p] = id;
    stack.push(p);
    while (stack.length) {
      const q = stack.pop()!;
      const qx = q % bw, qy = (q - qx) / bw;
      c.n++;
      if (qx < c.x0) c.x0 = qx; if (qx > c.x1) c.x1 = qx;
      if (qy < c.y0) c.y0 = qy; if (qy > c.y1) c.y1 = qy;
      const nb = [q - 1, q + 1, q - bw, q + bw];
      if (qx === 0) nb[0] = -1;
      if (qx === bw - 1) nb[1] = -1;
      for (const r of nb) if (r >= 0 && r < mask.length && mask[r] && !label[r]) { label[r] = id; stack.push(r); }
    }
    comps.push(c);
  }
  const minSide = Math.min(bw, bh) / 9;
  let cands = comps.filter((c) => {
    const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
    const ar = w / h;
    return w >= minSide && h >= minSide && ar > 0.75 && ar < 1.33 && c.n / (w * h) > 0.5;
  });
  if (cands.length < 9) return null;
  // Keep tiles of a similar size.
  const sizes = cands.map((c) => c.x1 - c.x0).sort((a, b) => a - b);
  const med = sizes[Math.floor(sizes.length / 2)];
  cands = cands.filter((c) => Math.abs(c.x1 - c.x0 - med) < med * 0.25);
  // Group into rows by center y.
  cands.sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  const rows: typeof cands[] = [];
  for (const c of cands) {
    const cy = (c.y0 + c.y1) / 2;
    const row = rows.find((r) => Math.abs((r[0].y0 + r[0].y1) / 2 - cy) < med * 0.5);
    row ? row.push(c) : rows.push([c]);
  }
  const good = rows.filter((r) => r.length >= 3);
  if (good.length < 3 || good.length > 6) return null;
  const cols = good[0].length;
  if (cols > 6 || good.some((r) => r.length !== cols)) return null;
  // Rows must be evenly spaced, like a real grid.
  const ys = good.map((r) => (r[0].y0 + r[0].y1) / 2);
  const gaps = ys.slice(1).map((y, i) => y - ys[i]);
  const g0 = gaps[0];
  if (gaps.some((g) => Math.abs(g - g0) > med * 0.3)) return null;
  const tiles = good.map((r) =>
    r.sort((a, b) => a.x0 - b.x0).map((c) => ({ x: c.x0 + box.x0, y: c.y0 + box.y0, w: c.x1 - c.x0 + 1, h: c.y1 - c.y0 + 1 }))
  );
  return { rows: good.length, cols, tiles };
}

export function findBoard(img: Px): BoardFind | null {
  const g = greenBox(img);
  if (g) {
    const r = findTiles(img, g);
    if (r) return r;
  }
  // Fallback for other grid games: search the whole image.
  return findTiles(img, { x0: 0, y0: 0, x1: img.width, y1: img.height });
}

// ---------- Letter reading (template matching, no outside service) ----------

export const GLYPH_N = 24;
export type Glyph = { vec: Float32Array; ar: number } | null;

// Turns the inside of one tile into a normalized letter shape.
// Returns null when the tile has no letter.
export function extractGlyph(img: Px, t: Tile): Glyph {
  const m = 0.1;
  const x0 = Math.floor(t.x + t.w * m), y0 = Math.floor(t.y + t.h * m);
  const w = Math.max(1, Math.floor(t.w * (1 - 2 * m))), h = Math.max(1, Math.floor(t.h * (1 - 2 * m)));
  const L = new Float32Array(w * h);
  let mn = 255, mx = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = lum(img.data, ((y0 + y) * img.width + (x0 + x)) * 4);
      L[y * w + x] = v;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
  if (mx - mn < 40) return null;
  const thr = (mn + mx) / 2;
  let dark = 0;
  for (let i = 0; i < L.length; i++) if (L[i] < thr) dark++;
  const inkIsDark = dark < L.length / 2;
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < L.length; i++) ink[i] = (L[i] < thr) === inkIsDark ? 1 : 0;
  // Drop ink touching the crop edge (tile borders, shadows).
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const clearFrom = (p: number) => {
    stack.push(p); seen[p] = 1;
    while (stack.length) {
      const q = stack.pop()!; ink[q] = 0;
      const qx = q % w;
      for (const r of [q - 1, q + 1, q - w, q + w]) {
        if (r < 0 || r >= ink.length || seen[r] || !ink[r]) continue;
        if ((r === q - 1 && qx === 0) || (r === q + 1 && qx === w - 1)) continue;
        seen[r] = 1; stack.push(r);
      }
    }
  };
  for (let x = 0; x < w; x++) { if (ink[x]) clearFrom(x); const b = (h - 1) * w + x; if (ink[b]) clearFrom(b); }
  for (let y = 0; y < h; y++) { const a = y * w; if (ink[a]) clearFrom(a); const b = y * w + w - 1; if (ink[b]) clearFrom(b); }
  let bx0 = w, by0 = h, bx1 = -1, by1 = -1, count = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (ink[y * w + x]) { count++; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
  if (count < w * h * 0.01 || bx1 < 0) return null;
  return normalize((x, y) => ink[y * w + x], bx0, by0, bx1 - bx0 + 1, by1 - by0 + 1);
}

// Scales a letter's bounding box into a GLYPH_N square, keeping its shape.
export function normalize(get: (x: number, y: number) => number, bx: number, by: number, bw: number, bh: number): Glyph {
  const N = GLYPH_N, vec = new Float32Array(N * N);
  const scale = Math.max(bw, bh) / N;
  const ox = (N - bw / scale) / 2, oy = (N - bh / scale) / 2;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const sx = (x - ox + 0.5) * scale, sy = (y - oy + 0.5) * scale;
      if (sx < 0 || sy < 0 || sx >= bw || sy >= bh) continue;
      vec[y * N + x] = get(bx + Math.floor(sx), by + Math.floor(sy));
    }
  return { vec, ar: bw / bh };
}

export type Template = { ch: string; vec: Float32Array; ar: number };

export function classify(g: Glyph, templates: Template[]) {
  if (!g) return { ch: "", score: 1, sure: true };
  const best: Record<string, number> = {};
  for (const t of templates) {
    let inter = 0, uni = 0;
    for (let i = 0; i < g.vec.length; i++) {
      const a = g.vec[i], b = t.vec[i];
      inter += Math.min(a, b); uni += Math.max(a, b);
    }
    const iou = uni ? inter / uni : 0;
    const arPen = Math.min(0.3, Math.abs(Math.log(g.ar / t.ar)) * 0.25);
    const s = iou - arPen;
    if (best[t.ch] === undefined || s > best[t.ch]) best[t.ch] = s;
  }
  const ranked = Object.entries(best).sort((a, b) => b[1] - a[1]);
  const [ch, score] = ranked[0];
  const margin = score - (ranked[1]?.[1] ?? 0);
  return { ch, score, sure: score > 0.55 && margin > 0.04 };
}
