"use client";
import { useEffect, useRef, useState } from "react";

/** Fire-once IntersectionObserver hook. SSR-safe; falls back to visible if unsupported. */
export function useInView<T extends Element = HTMLDivElement>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === "undefined") { setInView(true); return; }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) { setInView(true); obs.disconnect(); }
      },
      { threshold: 0.15, ...options }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [inView]);
  return { ref, inView };
}
