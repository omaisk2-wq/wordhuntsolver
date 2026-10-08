// Browser side of the screenshot upload: loads the image, finds the board,
// and reads each letter. Nothing leaves the visitor's device.
import { findBoard, extractGlyph, classify, normalize, type Px, type Template } from "./boardScan";

export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const FONTS = ["Arial", "Helvetica", "Verdana", "Roboto", "sans-serif"];
let templates: Template[] | null = null;

function buildTemplates(): Template[] {
  const out: Template[] = [];
  const cv = document.createElement("canvas");
  cv.width = 220; cv.height = 220;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  for (const font of FONTS) {
    for (const ch of LETTERS) {
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 220, 220);
      ctx.fillStyle = "#000"; ctx.font = `700 140px ${font}`; ctx.textBaseline = "middle"; ctx.textAlign = "center";
      ctx.fillText(ch, 110, 115);
      const d = ctx.getImageData(0, 0, 220, 220).data;
      let x0 = 220, y0 = 220, x1 = -1, y1 = -1;
      for (let y = 0; y < 220; y++) for (let x = 0; x < 220; x++) if (d[(y * 220 + x) * 4] < 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) continue;
      const g = normalize((x, y) => (d[(y * 220 + x) * 4] < 128 ? 1 : 0), x0, y0, x1 - x0 + 1, y1 - y0 + 1);
      if (g) out.push({ ch, vec: g.vec, ar: g.ar });
    }
  }
  return out;
}

function toPx(img: CanvasImageSource, w: number, h: number): Px {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h);
  return { data: d.data, width: w, height: h };
}

export type ScanResult =
  | { ok: true; rows: number; cols: number; letters: string[][]; unsure: boolean[][] }
  | { ok: false; reason: "type" | "load" | "noboard" | "size" };

export async function scanScreenshot(file: File): Promise<ScanResult> {
  if (!ACCEPTED_TYPES.includes(file.type)) return { ok: false, reason: "type" };
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const maxSide = 2000;
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const fw = Math.round(img.naturalWidth * k), fh = Math.round(img.naturalHeight * k);
    const full = toPx(img, fw, fh);
    const s = Math.min(1, 600 / fw);
    const small = toPx(img, Math.round(fw * s), Math.round(fh * s));
    const board = findBoard(small);
    if (!board) return { ok: false, reason: "noboard" };
    if (board.rows < 3 || board.rows > 6 || board.cols < 3 || board.cols > 6) return { ok: false, reason: "size" };
    templates ??= buildTemplates();
    const letters: string[][] = [], unsure: boolean[][] = [];
    for (const row of board.tiles) {
      const lr: string[] = [], ur: boolean[] = [];
      for (const t of row) {
        const r = classify(extractGlyph(full, { x: t.x / s, y: t.y / s, w: t.w / s, h: t.h / s }), templates);
        lr.push(r.ch); ur.push(!r.sure);
      }
      letters.push(lr); unsure.push(ur);
    }
    return { ok: true, rows: board.rows, cols: board.cols, letters, unsure };
  } catch {
    return { ok: false, reason: "load" };
  } finally {
    URL.revokeObjectURL(url);
  }
}
