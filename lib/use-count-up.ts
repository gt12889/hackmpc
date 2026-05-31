"use client";
import { useEffect, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Counts 0 → target with easeOutCubic when `enabled`. Jumps to target on reduced-motion or when disabled. */
export function useCountUp(target: number, opts?: { durationMs?: number; enabled?: boolean }): number {
  const { durationMs = 900, enabled = true } = opts ?? {};
  const [value, setValue] = useState<number>(enabled && !prefersReducedMotion() ? 0 : target);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled || prefersReducedMotion()) { setValue(target); return; }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, durationMs, enabled]);
  return value;
}
