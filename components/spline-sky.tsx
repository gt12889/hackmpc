"use client";

import Spline from "@splinetool/react-spline";

// The bird scene, with its background made transparent at runtime so whatever sits behind
// it (our SplatSky) shows through. Uses the client (non-`/next`) export because `onLoad` is
// a client callback. The canvas auto-fills this container.
export function SplineSky({ className = "" }: { className?: string }) {
  return (
    <div className={`[&_canvas]:!h-full [&_canvas]:!w-full ${className}`}>
      <Spline
        scene="https://prod.spline.design/XD76ymrOUpojY1BV/scene.splinecode"
        onLoad={(app) => {
          try {
            (app as any).setBackgroundColor?.("transparent");
          } catch {
            /* best-effort */
          }
        }}
      />
    </div>
  );
}
