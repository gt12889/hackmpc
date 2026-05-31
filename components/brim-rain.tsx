"use client";

import { useEffect, useRef } from "react";

// ASCII "BRIM" that flows across the FULL screen width like water: the wordmark
// drifts horizontally, fully exits one screen border and re-enters the other in a
// seamless loop, undulating with a vertical wave, while characters rain inside the
// letters. Responsive — the canvas fills its (full-width) container.
export function BrimRain({ word = "BRIM", className = "" }: { word?: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const CHARS = "01ABX+=#@29".split("");
    let raf = 0;

    let COLS = 0, ROWS = 0, CELL = 10, STRIP = 0, lead = 0, wordCols = 0, total = 0, stripPx = 0;
    let active: Uint8Array[] = [];
    let offset = new Float32Array(0), speed = new Float32Array(0);
    let prevY: Float32Array[] = [], colChars: string[][] = [];
    let grad: CanvasGradient;
    let flowX = 0;
    const FLOW = 1.0;   // px/frame horizontal drift
    const WAVE = 6;     // vertical undulation amplitude (px)

    function setup() {
      const cssW = Math.max(1, canvas.clientWidth || window.innerWidth);
      const cssH = Math.max(1, canvas.clientHeight || 360);
      canvas.width = Math.round(cssW);
      canvas.height = Math.round(cssH);
      ctx.textBaseline = "top";

      grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, "#007d93");
      grad.addColorStop(0.55, "#0ba3b8");
      grad.addColorStop(1, "#00c1d5");

      CELL = Math.max(7, Math.round(canvas.height / 32));     // ~32 rows tall
      ctx.font = `900 ${Math.round(CELL * 1.25)}px ui-monospace, Menlo, monospace`;
      COLS = Math.ceil(canvas.width / CELL);
      ROWS = Math.ceil(canvas.height / CELL);

      // Render the word once (sized to ~62% of height), measure it, sample to a sub-grid.
      const wc = document.createElement("canvas");
      const fp = Math.max(8, canvas.height * 0.6);
      wc.height = Math.ceil(canvas.height);
      const oc = wc.getContext("2d")!;
      oc.font = `900 ${fp}px Arial, sans-serif`;
      const wpx = oc.measureText(word).width;
      wc.width = Math.ceil(wpx) + 16;                          // resize clears -> reset state below
      const oc2 = wc.getContext("2d")!;
      oc2.fillStyle = "#fff"; oc2.fillRect(0, 0, wc.width, wc.height);
      oc2.fillStyle = "#000"; oc2.font = `900 ${fp}px Arial, sans-serif`;
      oc2.textBaseline = "middle"; oc2.textAlign = "left";
      oc2.fillText(word, 8, wc.height / 2);

      wordCols = Math.max(1, Math.round(wc.width / CELL));
      const wg = document.createElement("canvas"); wg.width = wordCols; wg.height = ROWS;
      const wgc = wg.getContext("2d")!; wgc.drawImage(wc, 0, 0, wordCols, ROWS);
      const wd = wgc.getImageData(0, 0, wordCols, ROWS).data;

      // Strip = empty(COLS) + word + empty(COLS) -> the word fully exits and re-enters.
      lead = COLS;
      STRIP = COLS * 2 + wordCols;
      active = [];
      for (let c = 0; c < STRIP; c++) active[c] = new Uint8Array(ROWS);
      for (let wcI = 0; wcI < wordCols; wcI++) {
        for (let r = 0; r < ROWS; r++) {
          const i = (r * wordCols + wcI) * 4;
          const b = wd[i] * 0.299 + wd[i + 1] * 0.587 + wd[i + 2] * 0.114;
          if (b < 128) active[lead + wcI][r] = 1;
        }
      }

      offset = new Float32Array(STRIP); speed = new Float32Array(STRIP);
      prevY = []; colChars = [];
      for (let c = 0; c < STRIP; c++) {
        offset[c] = Math.random() * ROWS * CELL;
        speed[c] = 0.3 + Math.random() * 0.6;
        prevY[c] = new Float32Array(ROWS);
        colChars[c] = [];
        for (let r = 0; r < ROWS; r++) colChars[c][r] = CHARS[(Math.random() * CHARS.length) | 0];
      }
      total = ROWS * CELL;
      stripPx = STRIP * CELL;
      flowX = lead * CELL;     // start with the word entering / centered-ish
    }

    function loop() {
      const t = performance.now() / 1000;
      flowX = (flowX + FLOW) % stripPx;
      const baseCol = Math.floor(flowX / CELL);
      const fracX = flowX - baseCol * CELL;

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
      for (let dc = 0; dc < COLS; dc++) {
        const vc = (dc + baseCol) % STRIP;
        const x = dc * CELL - fracX;
        const wave = Math.sin(dc * 0.14 + t * 1.5) * WAVE;
        for (let k = 0; k < ROWS; k++) {
          const y = (k * CELL + offset[vc]) % total;
          const gr = (y / CELL) | 0;
          if (!active[vc][gr]) continue;
          ctx.fillText(colChars[vc][k], x, y + wave);
        }
      }
      raf = requestAnimationFrame(loop);
    }

    setup();
    raf = requestAnimationFrame(loop);

    let rt: any;
    const onResize = () => { clearTimeout(rt); rt = setTimeout(setup, 150); };
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); clearTimeout(rt); };
  }, [word]);

  return <canvas ref={ref} className={className} style={{ display: "block" }} />;
}
