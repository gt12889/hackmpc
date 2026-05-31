"use client";

import Spline from "@splinetool/react-spline";

// Spline 3D scene layered into the hero sky. The root (non-`/next`) export is a regular
// client component, so it belongs in a "use client" module (the `/next` export is an async
// Server Component and cannot live in the client tree). Non-interactive (pointer-events off)
// so page scroll and the cursor-reactive particle field on top keep working; the canvas
// auto-fills this container.
export function SplineSky({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none [&_canvas]:!h-full [&_canvas]:!w-full ${className}`}>
      <Spline scene="https://prod.spline.design/XD76ymrOUpojY1BV/scene.splinecode" />
    </div>
  );
}
