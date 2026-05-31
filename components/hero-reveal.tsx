"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown } from "lucide-react";

// "From noise to clarity" — a scroll-pinned cinematic hero. A live canvas of
// teal/cyan particles starts as chaos and organizes into a bar chart as the user
// scrolls; text reveals line-by-line; a vignette frames it. Code-driven visuals,
// with optional parallax image layers (drop files in /public/hero/*).

const LINES = [
  { text: "Thousands of charges.", in: [0.04, 0.16], out: [0.2, 0.3], size: "text-4xl md:text-6xl" },
  { text: "Scattered across cards, merchants, borders.", in: [0.26, 0.38], out: [0.42, 0.52], size: "text-3xl md:text-5xl" },
  { text: "Zero clarity.", in: [0.48, 0.58], out: [0.62, 0.72], size: "text-4xl md:text-6xl" },
];

function clamp(v: number, a = 0, b = 1) { return Math.min(b, Math.max(a, v)); }
function easeInOut(p: number) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
// Opacity that fades in over `inR` and out over `outR` (outR optional).
function band(p: number, inR: number[], outR?: number[]) {
  const up = clamp((p - inR[0]) / (inR[1] - inR[0]));
  const down = outR ? 1 - clamp((p - outR[0]) / (outR[1] - outR[0])) : 1;
  return Math.min(up, down);
}

export function HeroReveal() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progRef = useRef(0);
  const [p, setP] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let w = 0, h = 0, dpr = Math.min(2, window.devicePixelRatio || 1);

    type P = { cx: number; cy: number; tx: number; ty: number; r: number; teal: boolean; ph: number };
    let particles: P[] = [];

    const BAR_H = [0.5, 0.74, 0.58, 0.95, 0.66, 0.86, 0.52];

    function build() {
      const rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.min(280, Math.floor(w / 5));
      const bars = BAR_H.length;
      const chartW = Math.min(w * 0.62, 720);
      const x0 = (w - chartW) / 2;
      const gap = chartW / bars;
      const barW = gap * 0.6;
      const baseline = h * 0.72;
      const maxH = h * 0.42;

      particles = Array.from({ length: count }, (_, i) => {
        const b = i % bars;
        const bx = x0 + b * gap + gap * 0.2;
        const bh = BAR_H[b] * maxH;
        return {
          cx: Math.random() * w,
          cy: Math.random() * h,
          tx: bx + Math.random() * barW,
          ty: baseline - Math.random() * bh,
          r: (1 + Math.random() * 1.6),
          teal: Math.random() > 0.5,
          ph: Math.random() * Math.PI * 2,
        };
      });
    }
    build();
    const onResize = () => { dpr = Math.min(2, window.devicePixelRatio || 1); build(); };
    window.addEventListener("resize", onResize);

    const loop = () => {
      // scroll progress: 0 at section top, 1 when fully scrolled through
      const sec = sectionRef.current;
      if (sec) {
        const rect = sec.getBoundingClientRect();
        const dist = rect.height - window.innerHeight;
        const prog = clamp(-rect.top / Math.max(1, dist));
        progRef.current = prog;
        setP((prev) => (Math.abs(prev - prog) > 0.004 ? prog : prev));
      }
      const prog = progRef.current;
      const e = easeInOut(clamp(prog / 0.82)); // ordered by ~82% scroll
      const t = performance.now() / 1000;

      // Skip heavy draw when section is off-screen.
      const rect = sec?.getBoundingClientRect();
      const visible = rect ? rect.bottom > 0 && rect.top < window.innerHeight : true;
      if (visible) {
        ctx.clearRect(0, 0, w, h);
        ctx.globalCompositeOperation = "lighter";
        for (const pt of particles) {
          const drift = (1 - e) * 14;
          const x = pt.cx + (pt.tx - pt.cx) * e + Math.sin(t * 0.6 + pt.ph) * drift;
          const y = pt.cy + (pt.ty - pt.cy) * e + Math.cos(t * 0.5 + pt.ph) * drift;
          const alpha = 0.25 + 0.55 * e + 0.1 * Math.sin(t + pt.ph);
          ctx.beginPath();
          ctx.fillStyle = pt.teal
            ? `hsla(189,100%,38%,${clamp(alpha)})`
            : `hsla(187,95%,52%,${clamp(alpha)})`;
          ctx.arc(x, y, pt.r * (0.8 + 0.4 * e), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, []);

  const brand = band(p, [0.74, 0.86]);
  const tagline = band(p, [0.8, 0.92]);
  const cue = 1 - clamp(p / 0.08);
  const contentFade = 1 - clamp((p - 0.92) / 0.08); // fade whole hero at the very end

  return (
    <section ref={sectionRef} className="relative h-[280vh]">
      <div className="sticky top-0 h-screen overflow-hidden bg-background" style={{ opacity: contentFade }}>
        {/* Optional parallax image layers — drop /public/hero/streams.png etc. */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-40"
          style={{ backgroundImage: "url(/hero/streams.png)", transform: `translateY(${p * -60}px) scale(1.05)` }}
        />
        {/* Canvas particle field */}
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {/* Ambient teal glows */}
        <div className="pointer-events-none absolute inset-0" style={{
          backgroundImage:
            "radial-gradient(50rem 36rem at 18% 20%, hsl(189 100% 30% / 0.18), transparent 60%), radial-gradient(46rem 34rem at 82% 30%, hsl(187 95% 44% / 0.12), transparent 60%)",
        }} />
        {/* Vignette */}
        <div className="pointer-events-none absolute inset-0" style={{
          background: "radial-gradient(120% 90% at 50% 45%, transparent 42%, hsl(195 42% 6% / 0.7) 78%, hsl(195 42% 5%) 100%)",
        }} />

        {/* Text stack */}
        <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
          {/* Phase 1: problem lines (stacked, cross-fade) */}
          <div className="relative flex h-40 items-center justify-center">
            {LINES.map((l, i) => {
              const o = band(p, l.in, l.out);
              return (
                <h2
                  key={i}
                  className={`absolute max-w-4xl tracking-tight text-foreground ${l.size}`}
                  style={{ opacity: o, transform: `translateY(${(1 - o) * 26}px)` }}
                >
                  {l.text}
                </h2>
              );
            })}

            {/* Phase 2: brand */}
            <div className="absolute flex flex-col items-center" style={{ opacity: brand, transform: `translateY(${(1 - brand) * 30}px) scale(${0.96 + brand * 0.04})` }}>
              <h1 className="bg-gradient-to-b from-white to-cyan-200/80 bg-clip-text text-7xl tracking-tight text-transparent md:text-8xl">
                Brim It
              </h1>
              <p className="mt-3 text-lg text-muted-foreground md:text-2xl" style={{ opacity: tagline }}>
                AI expense intelligence for every dollar.
              </p>
              <Link
                href="#dashboard"
                className="mt-7 rounded-full bg-primary px-6 py-2.5 text-sm text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105"
                style={{ opacity: tagline }}
              >
                Explore the data ↓
              </Link>
            </div>
          </div>

          {/* Scroll cue */}
          <div className="absolute bottom-10 flex flex-col items-center gap-2 text-muted-foreground" style={{ opacity: cue }}>
            <span className="text-xs uppercase tracking-[0.2em]">Scroll</span>
            <ArrowDown className="h-4 w-4 animate-bounce" />
          </div>

          {/* Skip link */}
          <Link href="#dashboard" className="absolute right-6 top-6 text-xs text-muted-foreground transition-colors hover:text-foreground" style={{ opacity: cue }}>
            Skip intro →
          </Link>
        </div>
      </div>
    </section>
  );
}
