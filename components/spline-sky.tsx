"use client";

import Spline from "@splinetool/react-spline/next";

// 3D Spline scene layered into the hero sky. Non-interactive (pointer-events off) so
// page scroll and the cursor-reactive particle field on top keep working. The Spline
// canvas auto-fills this container.
export function SplineSky({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none [&_canvas]:!h-full [&_canvas]:!w-full ${className}`}>
      <Spline scene="https://prod.spline.design/XD76ymrOUpojY1BV/scene.splinecode" />
    </div>
  );
}
