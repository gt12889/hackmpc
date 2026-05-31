"use client";
import type { ElementType, ReactNode } from "react";
import { useInView } from "@/lib/use-in-view";
import { cn } from "@/lib/utils";

/** Wraps children; fades + rises them in when scrolled into view (staggered via `delay`). */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: ElementType;
}) {
  const { ref, inView } = useInView();
  return (
    <Tag
      ref={ref as any}
      className={cn(inView ? "animate-fade-up" : "opacity-0 motion-reduce:opacity-100", className)}
      style={inView ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
