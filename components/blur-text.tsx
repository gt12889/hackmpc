"use client";
import { useInView } from "@/lib/use-in-view";
import { cn } from "@/lib/utils";

/** Per-character blur/fade/slide-up reveal when scrolled into view. Reduced-motion → instant. */
export function BlurText({ text, className, stagger = 30 }: { text: string; className?: string; stagger?: number }) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  return (
    <span ref={ref} aria-label={text} className={cn("inline-block", className)}>
      {Array.from(text).map((ch, i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            "inline-block transition-[opacity,filter,transform] duration-500 ease-out",
            "motion-reduce:opacity-100 motion-reduce:blur-0 motion-reduce:translate-y-0 motion-reduce:transition-none",
            inView ? "opacity-100 blur-0 translate-y-0" : "opacity-0 blur-[8px] translate-y-2"
          )}
          style={inView ? { transitionDelay: `${i * stagger}ms` } : undefined}
        >
          {ch === " " ? " " : ch}
        </span>
      ))}
    </span>
  );
}
