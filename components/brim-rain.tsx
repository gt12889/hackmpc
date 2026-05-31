"use client";

import { useEffect, useRef } from "react";

// ASCII "BRIM" that flows across the screen like water: the wordmark drifts
// horizontally (out one side, in the other) in a seamless loop, undulating with
// a vertical sine wave, while characters rain inside the letter shapes. Brim
// teal→cyan gradient, theme-matched.
export function BrimRain({ word = "BRIM", className = "" }: { word?: string; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const CHARS = "01ABX+=#@29".split("");
    const DISP = 96, ROWS = 52, CELL = 9;     // visible grid
    const STRIP = DISP * 3;                    // virtual strip: word + empty padding -> flows fully in/out
    canvas.width = DISP * CELL;
    canvas.height = ROWS * CELL;
    ctx.font = "900 11px ui-monospace, Menlo, monospace";
    ctx.textBaseline = "top";

    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, "#007d93");
    grad.addColorStop(0.55, "#0ba3b8");
    grad.addColorStop(1, "#00c1d5");

    // Build the word mask on a wide strip (word centered, empty space around it).
    function buildActive() {
      const W = STRIP * 4, H = ROWS * 4;
      const s = document.createElement("canvas"); s.width = W; s.height = H;
      const o = s.getContext("2d")!;
      o.fillStyle = "#fff"; o.fillRect(0, 0, W, H);
      o.fillStyle = "#000"; o.textAlign = "center"; o.textBaseline = "middle";
      let fp = 240;
      o.font = `900 ${fp}px Arial, sans-serif`;
      fp = fp * ((DISP * 4 * 0.9) / o.measureText(word).width); // word ~ display width
      o.font = `900 ${fp}px Arial, sans-serif`;
      o.fillText(word, W / 2, H / 2);

      const g = document.createElement("canvas"); g.width = STRIP; g.height = ROWS;
      const gc = g.getContext("2d")!;
      gc.drawImage(s, 0, 0, STRIP, ROWS);
      const d = gc.getImageData(0, 0, STRIP, ROWS).data;
      const a: Uint8Array[] = [];
      for (let c = 0; c < STRIP; c++) {
        a[c] = new Uint8Array(ROWS);
        for (let r = 0; r < ROWS; r++) {
          const i = (r * STRIP + c) * 4;
          const b = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
          a[c][r] = b < 128 ? 1 : 0;
        }
      }
      return a;
    }
    const active = buildActive();

    const offset = new Float32Array(STRIP), speed = new Float32Array(STRIP);
    const prevY: Float32Array[] = [], colChars: string[][] = [];
    for (let c = 0; c < STRIP; c++) {
      offset[c] = Math.random() * ROWS * CELL;
      speed[c] = 0.3 + Math.random() * 0.6;
      prevY[c] = new Float32Array(ROWS);
      colChars[c] = [];
      for (let r = 0; r < ROWS; r++) colChars[c][r] = CHARS[(Math.random() * CHARS.length) | 0];
    }

    let raf = 0;
    const total = ROWS * CELL;
    const stripPx = STRIP * CELL;
    let flowX = stripPx / 3;              // start with the word roughly centered
    const FLOW = 0.9;                     // horizontal flow speed (px/frame)
    const WAVE = 5;                       // vertical undulation amplitude (px)

    const loop = () => {
      const t = performance.now() / 1000;
      flowX = (flowX + FLOW) % stripPx;            // wrap -> seamless loop
      const baseCol = Math.floor(flowX / CELL);
      const fracX = flowX - baseCol * CELL;        // sub-pixel for smooth flow

      // advance the rain in every virtual column
      for (let c = 0; c < STRIP; c++) {
        offset[c] = (offset[c] + speed[c]) % total;
        for (let k = 0; k < ROWS; k++) {
          const y = (k * CELL + offset[c]) % total;
          if (y < prevY[c][k]) colChars[c][k] = CHARS[(Math.random() * CHARS.length) | 0];
          prevY[c][k] = y;
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = grad;
      for (let dc = 0; dc < DISP; dc++) {
        const vc = (dc + baseCol) % STRIP;
        const x = dc * CELL - fracX;                 // smooth leftward flow
        const wave = Math.sin(dc * 0.16 + t * 1.6) * WAVE;
        for (let k = 0; k < ROWS; k++) {
          const y = (k * CELL + offset[vc]) % total;
          const gr = (y / CELL) | 0;
          if (!active[vc][gr]) continue;             // only render inside the letters
          ctx.fillText(colChars[vc][k], x, y + wave);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [word]);

  return <canvas ref={canvasRef} className={className} />;
}
