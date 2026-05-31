"use client";

import { useEffect, useRef } from "react";

// ASCII "BRIM" that flows DOWN the full screen like water: the wordmark enters from
// the top border, descends, fully exits the bottom and seamlessly re-enters at the
// top, while glowing characters cascade down inside the letters. Responsive — the
// canvas fills its (full-width) container.
export function BrimRain({ word = "BRIM", className = "" }: { word?: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const CHARS = "01ABX+=#@29".split("");
    let raf = 0;

    let COLS = 0, ROWS = 0, CELL = 10, STRIPROWS = 0, stripPx = 0, cw = 0, ch = 0;
    let active: Uint8Array[] = [];          // [col][stripRow] — 1 inside a letter
    let colChars: string[][] = [];          // [col][stripRow]
    let head = new Float32Array(0), hspeed = new Float32Array(0); // glowing cascade per column
    let grad: CanvasGradient;
    let flowY = 0;
    const FLOW = 4.0;   // px/frame downward drift of the whole wordmark
    const WAVE = 6;     // horizontal sway amplitude (px) — ripple as it falls
    const HEAD = "#eafdff", HEAD_GLOW = "#7fe9f4";

    function setup() {
      cw = Math.max(1, Math.round(canvas.clientWidth || window.innerWidth));
      ch = Math.max(1, Math.round(canvas.clientHeight || 360));
      canvas.width = cw;
      canvas.height = ch;
      ctx.textBaseline = "top";

      grad = ctx.createLinearGradient(0, 0, 0, ch);
      grad.addColorStop(0, "#007d93");
      grad.addColorStop(0.55, "#0ba3b8");
      grad.addColorStop(1, "#00c1d5");

      CELL = Math.max(7, Math.round(ch / 34));
      ctx.font = `700 ${Math.round(CELL * 1.15)}px ui-monospace, Menlo, monospace`;
      COLS = Math.ceil(cw / CELL);
      ROWS = Math.ceil(ch / CELL);

      // Render BRIM scaled to ~82% of the width, then sample to a sub-grid.
      const measure = document.createElement("canvas").getContext("2d")!;
      let fp = ch;
      measure.font = `900 ${fp}px Arial, sans-serif`;
      const w0 = measure.measureText(word).width || 1;
      fp = (fp * (cw * 0.82)) / w0;          // scale font so the word spans ~82% width
      const offW = Math.ceil(cw * 0.82) + 16;
      const offH = Math.ceil(fp * 1.05);
      const oc = document.createElement("canvas");
      oc.width = offW; oc.height = offH;
      const octx = oc.getContext("2d")!;
      octx.fillStyle = "#fff"; octx.fillRect(0, 0, offW, offH);
      octx.fillStyle = "#000"; octx.font = `900 ${Math.round(fp)}px Arial, sans-serif`;
      octx.textBaseline = "middle"; octx.textAlign = "center";
      octx.fillText(word, offW / 2, offH / 2);

      const wordCols = Math.min(COLS, Math.max(1, Math.round(offW / CELL)));
      const wordRows = Math.max(1, Math.round(offH / CELL));
      const wg = document.createElement("canvas"); wg.width = wordCols; wg.height = wordRows;
      const wgc = wg.getContext("2d")!; wgc.drawImage(oc, 0, 0, wordCols, wordRows);
      const wd = wgc.getImageData(0, 0, wordCols, wordRows).data;

      // Carousel strip: word(wordRows) + a small gap. The period is shorter than the
      // screen, so the word's top re-enters at the top as its bottom exits the bottom.
      const gapRows = Math.round(ROWS * 0.55);
      STRIPROWS = wordRows + gapRows;
      stripPx = STRIPROWS * CELL;
      const rowStart = Math.round(gapRows / 2);
      const colStart = Math.max(0, Math.round((COLS - wordCols) / 2));

      active = []; colChars = [];
      for (let c = 0; c < COLS; c++) {
        active[c] = new Uint8Array(STRIPROWS);
        colChars[c] = new Array(STRIPROWS);
        for (let r = 0; r < STRIPROWS; r++) colChars[c][r] = CHARS[(Math.random() * CHARS.length) | 0];
      }
      for (let wcI = 0; wcI < wordCols; wcI++) {
        for (let wrI = 0; wrI < wordRows; wrI++) {
          const i = (wrI * wordCols + wcI) * 4;
          const b = wd[i] * 0.299 + wd[i + 1] * 0.587 + wd[i + 2] * 0.114;
          if (b < 128) active[colStart + wcI][rowStart + wrI] = 1;
        }
      }

      head = new Float32Array(COLS); hspeed = new Float32Array(COLS);
      for (let c = 0; c < COLS; c++) {
        head[c] = Math.random() * (ch + CELL * 6);
        hspeed[c] = 5.0 + Math.random() * 6.0;    // px/frame — fast cascading heads
      }
      flowY = (((ch / 2 - (rowStart + wordRows / 2) * CELL) % stripPx) + stripPx) % stripPx; // start centered
    }

    function loop() {
      const t = performance.now() / 1000;
      flowY += FLOW; if (flowY >= stripPx) flowY -= stripPx;
      const trail = CELL * 6;
      const HR = ch + trail;                       // head sweep range

      ctx.clearRect(0, 0, cw, ch);
      for (let dc = 0; dc < COLS; dc++) {
        head[dc] += hspeed[dc]; if (head[dc] >= HR) head[dc] -= HR;
        const hd = head[dc];
        const x0 = dc * CELL;
        const col = active[dc];
        for (let sr = 0; sr < STRIPROWS; sr++) {
          if (!col[sr]) continue;
          let base = (sr * CELL + flowY) % stripPx; if (base < 0) base += stripPx;
          const x = x0 + Math.sin(sr * 0.25 + t * 1.6 + dc * 0.05) * WAVE;
          // Draw every wrapped copy that lands on screen -> seamless carousel.
          for (let sy = base - stripPx; sy < ch + CELL; sy += stripPx) {
            if (sy < -CELL * 1.5) continue;
            const dd = hd - sy;                     // >0: above head (trail); ~0: head
            if (dd >= -CELL * 0.4 && dd <= CELL) {
              if (Math.random() < 0.28) colChars[dc][sr] = CHARS[(Math.random() * CHARS.length) | 0];
              ctx.globalAlpha = 1;
              ctx.shadowBlur = 12; ctx.shadowColor = HEAD_GLOW;
              ctx.fillStyle = HEAD;
              ctx.fillText(colChars[dc][sr], x, sy);
              ctx.shadowBlur = 0;
            } else {
              const tr = dd > 0 && dd < trail ? 1 - dd / trail : 0;
              const shimmer = 0.05 * Math.sin(t * 5 + dc * 0.4 + sr * 0.7);
              ctx.globalAlpha = Math.max(0.14, 0.18 + 0.6 * tr + shimmer);
              ctx.fillStyle = grad;
              ctx.fillText(colChars[dc][sr], x, sy);
            }
          }
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(loop);
    }

    setup();
    raf = requestAnimationFrame(loop);

    let rt: ReturnType<typeof setTimeout>;
    const onResize = () => { clearTimeout(rt); rt = setTimeout(setup, 150); };
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); clearTimeout(rt); };
  }, [word]);

  return <canvas ref={ref} className={className} style={{ display: "block" }} />;
}
