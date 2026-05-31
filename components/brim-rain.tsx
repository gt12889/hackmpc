"use client";

import { useEffect, useRef } from "react";

// ASCII rain that forms the word "BRIM" — characters fall through the letter
// shapes in a smooth infinite loop. Brim teal→cyan gradient, theme-matched.
export function BrimRain({ word = "BRIM", className = "" }: { word?: string; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const CHARS = "01ABX+=#@29".split("");
    const COLS = 96, ROWS = 52, CELL = 9; // wide for a 4-letter word
    canvas.width = COLS * CELL;
    canvas.height = ROWS * CELL;
    ctx.font = "900 11px ui-monospace, Menlo, monospace";
    ctx.textBaseline = "top";

    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, "#007d93");
    grad.addColorStop(0.55, "#0ba3b8");
    grad.addColorStop(1, "#00c1d5");

    // Build the word mask on an offscreen canvas (no image -> can't fail to load).
    function buildActive() {
      const W = COLS * 4, H = ROWS * 4;
      const s = document.createElement("canvas"); s.width = W; s.height = H;
      const o = s.getContext("2d")!;
      o.fillStyle = "#fff"; o.fillRect(0, 0, W, H);
      o.fillStyle = "#000";
      o.textAlign = "center"; o.textBaseline = "middle";
      let fontPx = 240;
      o.font = `900 ${fontPx}px Arial, sans-serif`;
      fontPx = fontPx * ((W * 0.9) / o.measureText(word).width);
      o.font = `900 ${fontPx}px Arial, sans-serif`;
      o.fillText(word, W / 2, H / 2 + 2);

      const g = document.createElement("canvas"); g.width = COLS; g.height = ROWS;
      const gc = g.getContext("2d")!;
      gc.drawImage(s, 0, 0, COLS, ROWS);
      const d = gc.getImageData(0, 0, COLS, ROWS).data;
      const a: Uint8Array[] = [];
      for (let c = 0; c < COLS; c++) {
        a[c] = new Uint8Array(ROWS);
        for (let r = 0; r < ROWS; r++) {
          const i = (r * COLS + c) * 4;
          const b = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
          a[c][r] = b < 128 ? 1 : 0;
        }
      }
      return a;
    }
    const active = buildActive();

    const offset = new Float32Array(COLS);
    const speed = new Float32Array(COLS);
    const prevY: Float32Array[] = [];
    const colChars: string[][] = [];
    for (let c = 0; c < COLS; c++) {
      offset[c] = Math.random() * ROWS * CELL;
      speed[c] = 0.3 + Math.random() * 0.6;
      prevY[c] = new Float32Array(ROWS);
      colChars[c] = [];
      for (let r = 0; r < ROWS; r++) colChars[c][r] = CHARS[(Math.random() * CHARS.length) | 0];
    }

    let raf = 0;
    const total = ROWS * CELL;
    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = grad;
      for (let c = 0; c < COLS; c++) {
        offset[c] = (offset[c] + speed[c]) % total;
        for (let k = 0; k < ROWS; k++) {
          let y = (k * CELL + offset[c]) % total;
          if (y < prevY[c][k]) colChars[c][k] = CHARS[(Math.random() * CHARS.length) | 0];
          prevY[c][k] = y;
          const gr = (y / CELL) | 0;
          if (!active[c][gr]) continue;
          ctx.fillText(colChars[c][k], c * CELL, y);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [word]);

  return <canvas ref={canvasRef} className={className} />;
}
