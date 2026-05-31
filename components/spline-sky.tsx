"use client";

import Spline from "@splinetool/react-spline";
import { useRef } from "react";

// Forward only this fraction of the pointer's travel-from-centre to the scene, so the bird
// reacts 80% less to the mouse (0.2 = 20% sensitivity).
const SENSITIVITY = 0.2;

// The bird scene: background made transparent at runtime (so the SplatSky behind shows
// through), scaled to 60% (40% smaller), and with damped mouse tracking. We capture pointer
// movement on a full-size overlay, then re-dispatch a reduced-magnitude pointer event to the
// canvas (whose own pointer-events are disabled so it only sees the damped, synthetic input).
export function SplineSky({ className = "" }: { className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);

  function damp(e: React.MouseEvent) {
    const canvas = rootRef.current?.querySelector("canvas");
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const x = cx + (e.clientX - cx) * SENSITIVITY;
    const y = cy + (e.clientY - cy) * SENSITIVITY;
    const init = { clientX: x, clientY: y, bubbles: true } as const;
    try {
      canvas.dispatchEvent(new PointerEvent("pointermove", { ...init, pointerId: 1, pointerType: "mouse" }));
    } catch {
      /* PointerEvent may be unavailable */
    }
    canvas.dispatchEvent(new MouseEvent("mousemove", init));
  }

  return (
    <div ref={rootRef} onMouseMove={damp} className={`relative ${className}`}>
      <div
        className="absolute inset-0 [&_canvas]:!pointer-events-none [&_canvas]:!h-full [&_canvas]:!w-full"
        // 60% scale (40% smaller), nudged slightly toward the bottom-right.
        style={{ transform: "translate(12%, 12%) scale(0.6)", transformOrigin: "center" }}
      >
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
    </div>
  );
}
