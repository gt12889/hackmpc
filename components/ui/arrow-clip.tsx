import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Drop inside a button that has the `group/btn` class. On hover, the arrow slides out and a second slides in. */
export function ArrowClip({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex h-4 w-4 overflow-hidden", className)} aria-hidden>
      <ArrowRight className="h-4 w-4 transition-transform duration-300 ease-out group-hover/btn:translate-x-5" />
      <ArrowRight className="absolute left-0 h-4 w-4 -translate-x-5 transition-transform duration-300 ease-out group-hover/btn:translate-x-0" />
    </span>
  );
}
