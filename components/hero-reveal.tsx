"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown } from "lucide-react";
import { BrimRain } from "@/components/brim-rain";

// "From noise to clarity" — a scroll-pinned cinematic brand overview (home page).
// A tight, focal canvas of teal/cyan particles starts as chaos and organizes +
// zooms into a bar chart as the user scrolls; text reveals line-by-line into the
// brand. The live dashboard lives separately at /dashboard.

const LINES = [
  { text: "Thousands of charges.", in: [0.04, 0.15], out: [0.2, 0.3], size: "text-5xl md:text-7xl" },
  { text: "Scattered across cards, merchants, borders.", in: [0.26, 0.37], out: [0.42, 0.52], size: "text-4xl md:text-6xl" },
  { text: "Zero clarity.", in: [0.5, 0.6], out: [0.63, 0.7], size: "text-5xl md:text-7xl" },
];

function clamp(v: number, a = 0, b = 1) { return Math.min(b, Math.max(a, v)); }
function easeInOut(p: number) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
function band(p: number, inR: number[], outR?: number[]) {
  const up = clamp((p - inR[0]) / (inR[1] - inR[0]));
  const down = outR ? 1 - clamp((p - outR[0]) / (outR[1] - outR[0])) : 1;
  return Math.min(up, down);
}

export function HeroReveal() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progRef = useRef(0);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const [p, setP] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let w = 0, h = 0, dpr = Math.min(2, window.devicePixelRatio || 1);

    type P = { cx: number; cy: number; tx: number; ty: number; r: number; teal: boolean; ph: number };
    let particles: P[] = [];
    const BAR_H = [0.5, 0.78, 0.6, 1.0, 0.68, 0.9, 0.54];

    function build() {
      const rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.min(520, Math.floor(w / 3.5));
      const bars = BAR_H.length;
      // Wide chart footprint so the organized state fills the frame.
      const chartW = Math.min(w * 0.7, 860);
      const x0 = (w - chartW) / 2;
      const gap = chartW / bars;
      const barW = gap * 0.7;
      const baseline = h * 0.72;
      const maxH = h * 0.46;

      particles = Array.from({ length: count }, (_, i) => {
        const b = i % bars;
        const bx = x0 + b * gap + gap * 0.19;
        const bh = BAR_H[b] * maxH;
        return {
          cx: Math.random() * w,
          cy: Math.random() * h,
          tx: bx + Math.random() * barW,
          ty: baseline - Math.random() * bh,
          r: 1.6 + Math.random() * 1.9,
          teal: Math.random() > 0.5,
          ph: Math.random() * Math.PI * 2,
        };
      });
    }
    build();
    const onResize = () => { dpr = Math.min(2, window.devicePixelRatio || 1); build(); };
    window.addEventListener("resize", onResize);

    // Cursor interactivity: particles part around the pointer (strongest before scroll).
    const onMove = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerRef.current = { x: ((ev.clientX - rect.left) / rect.width) * w, y: ((ev.clientY - rect.top) / rect.height) * h };
    };
    const onLeave = () => { pointerRef.current = null; };
    window.addEventListener("mousemove", onMove);
    document.addEventListener("mouseleave", onLeave);

    const loop = () => {
      const sec = sectionRef.current;
      if (sec) {
        const rect = sec.getBoundingClientRect();
        const dist = rect.height - window.innerHeight;
        const prog = clamp(-rect.top / Math.max(1, dist));
        progRef.current = prog;
        setP((prev) => (Math.abs(prev - prog) > 0.004 ? prog : prev));
      }
      const prog = progRef.current;
      const e = easeInOut(clamp(prog / 0.68)); // organized by ~68% scroll
      const t = performance.now() / 1000;

      const rect = sec?.getBoundingClientRect();
      const visible = rect ? rect.bottom > 0 && rect.top < window.innerHeight : true;
      if (visible) {
        ctx.clearRect(0, 0, w, h);
        ctx.globalCompositeOperation = "lighter";
        // Gentle zoom toward centre as it organizes (kept low so it stays spread out).
        const zoom = 1 + e * 0.18;
        const ccx = w / 2, ccy = h * 0.55;
        for (const pt of particles) {
          const drift = (1 - e) * 12;
          let x = pt.cx + (pt.tx - pt.cx) * e + Math.sin(t * 0.6 + pt.ph) * drift;
          let y = pt.cy + (pt.ty - pt.cy) * e + Math.cos(t * 0.5 + pt.ph) * drift;
          x = ccx + (x - ccx) * zoom;
          y = ccy + (y - ccy) * zoom;
          // Cursor repulsion — fades out as the chart organizes.
          const ptr = pointerRef.current;
          if (ptr) {
            const dx = x - ptr.x, dy = y - ptr.y, d2 = dx * dx + dy * dy, R = 130;
            if (d2 < R * R) {
              const d = Math.sqrt(d2) || 1;
              const force = (1 - d / R) * 48 * (1 - e * 0.7);
              x += (dx / d) * force; y += (dy / d) * force;
            }
          }
          const alpha = 0.28 + 0.55 * e + 0.1 * Math.sin(t + pt.ph);
          ctx.beginPath();
          ctx.fillStyle = pt.teal ? `hsla(199,76%,46%,${clamp(alpha)})` : `hsla(197,65%,68%,${clamp(alpha)})`;
          ctx.arc(x, y, pt.r * (0.9 + 0.6 * e) * zoom, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  const brand = band(p, [0.66, 0.8]);
  const tagline = band(p, [0.72, 0.86]);
  const cue = 1 - clamp(p / 0.08);
  const introArt = 1 - clamp(p / 0.12); // ASCII title — visible at the very start, fades on scroll
  // Whole composition eases in (zoom) as you scroll for added focus.
  const camScale = 1 + clamp(p) * 0.07;

  return (
    <section ref={sectionRef} className="relative h-[240vh] bg-background">
      <div className="sticky top-0 h-screen overflow-hidden">
        <div className="absolute inset-0" style={{ transform: `scale(${camScale})`, transformOrigin: "50% 52%" }}>
          {/* Optional parallax art — drop /public/hero/streams.png */}
          <div className="absolute inset-0 bg-cover bg-center opacity-35" style={{ backgroundImage: "url(/hero/streams.png)", transform: `translateY(${p * -50}px)` }} />
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          {/* Ambient sky-blue glows */}
          <div className="pointer-events-none absolute inset-0" style={{
            backgroundImage:
              "radial-gradient(42rem 30rem at 50% 40%, hsl(199 76% 46% / 0.14), transparent 62%), radial-gradient(38rem 28rem at 64% 56%, hsl(197 65% 68% / 0.12), transparent 60%)",
          }} />
          {/* Soft beige vignette */}
          <div className="pointer-events-none absolute inset-0" style={{
            background: "radial-gradient(95% 78% at 50% 50%, transparent 26%, hsl(40 33% 94% / 0.65) 66%, hsl(40 28% 88%) 100%)",
          }} />
        </div>

        {/* Text stack */}
        <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
          {/* Animated BRIM ASCII rain — full-width, flows in/out at the screen borders, fades on scroll */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-1/2 h-[46vh] -translate-y-1/2"
            style={{ opacity: introArt }}
          >
            <BrimRain className="h-full w-full" />
          </div>

          <div className="relative flex h-44 items-center justify-center">
            {LINES.map((l, i) => {
              const o = band(p, l.in, l.out);
              return (
                <h2 key={i} className={`absolute max-w-4xl tracking-tight text-foreground ${l.size}`} style={{ opacity: o, transform: `translateY(${(1 - o) * 28}px)` }}>
                  {l.text}
                </h2>
              );
            })}

            <div className="absolute flex flex-col items-center" style={{ opacity: brand, transform: `translateY(${(1 - brand) * 32}px) scale(${0.92 + brand * 0.08})` }}>
              <Link href="/dashboard" aria-label="Enter the dashboard" className="group relative inline-flex cursor-pointer transition-transform duration-300 hover:scale-105" style={{ pointerEvents: brand > 0.5 ? "auto" : "none" }}>
                {/* idle breathing glow */}
                <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 animate-pulse rounded-full bg-primary/25 blur-2xl" />
                <img
                  src="/brim-it-logo.png"
                  alt="Brim It"
                  width={435}
                  height={87}
                  className="h-[85px] w-auto max-w-none drop-shadow-[0_0_40px_hsl(199_85%_55%/0.45)] transition-[filter] duration-300 group-hover:drop-shadow-[0_0_60px_hsl(199_85%_55%/0.7)] md:h-[119px]"
                />
              </Link>
              <p className="mt-5 text-lg text-muted-foreground md:text-2xl" style={{ opacity: tagline }}>
                AI expense intelligence for every dollar.
              </p>
            </div>
          </div>

          <div className="absolute bottom-12 flex flex-col items-center gap-3" style={{ opacity: cue }}>
            {/* animated scroll-mouse */}
            <div className="flex h-10 w-6 items-start justify-center rounded-full border-2 border-primary/50 pt-2">
              <span className="h-2 w-1.5 animate-bounce rounded-full bg-primary" />
            </div>
            <ArrowDown className="h-4 w-4 animate-bounce text-primary/70" />
          </div>
        </div>
      </div>
    </section>
  );
}
