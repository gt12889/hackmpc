"use client";

import { useEffect, useRef, useState } from "react";

// 3D Gaussian-splat sky backdrop for the hero (Niantic Spark + Three.js).
// Renders /public/hero/sky.spz as the backmost full-bleed layer: transparent
// canvas so the hero's teal particles, glows, and beige vignette frame it.
// Gently auto-drifts and parallaxes with scroll `progress` (0..1 from the hero).
//
// Tuning knobs — adjust these to reframe the capture once you see it in-browser:
const SPLAT_URL = "/hero/sky.spz";
const FLIP_UPRIGHT = true;   // most captures import upside-down; flip 180° on X
const BASE_TILT_DEG = -4;    // resting camera pitch (negative looks slightly up)
const DRIFT_SPEED = 0.015;   // radians/sec of slow yaw — keep tiny for "ambient"
const SCROLL_YAW = 0.45;     // extra yaw across a full scroll of the pinned hero
const SCROLL_PITCH = 0.16;   // extra pitch across a full scroll
const SCROLL_DOLLY = 1.1;    // camera push-in across a full scroll

export function SplatSky({ progress = 0, className }: { progress?: number; className?: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const progRef = useRef(progress);
  const [loaded, setLoaded] = useState(false);

  // Keep the latest scroll progress in a ref so the render loop reads it
  // without re-running the (expensive) WebGL setup effect.
  useEffect(() => { progRef.current = progress; }, [progress]);

  useEffect(() => {
    // Respect reduced-motion and skip the heavy splat on small/mobile screens —
    // the hero's particle canvas stands on its own there.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || window.innerWidth < 768) return;

    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      const { SparkRenderer, SplatMesh } = await import("@sparkjsdev/spark");
      const mount = mountRef.current;
      if (disposed || !mount) return;

      const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance" });
      renderer.setClearColor(0x000000, 0); // transparent — hero layers blend over it
      renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
      const size = () => renderer.setSize(mount.clientWidth, mount.clientHeight, false);
      size();
      Object.assign(renderer.domElement.style, { width: "100%", height: "100%", display: "block" });
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(62, mount.clientWidth / mount.clientHeight, 0.1, 1000);

      const spark = new SparkRenderer({ renderer });
      scene.add(spark);

      const splat = new SplatMesh({ url: SPLAT_URL, onLoad: () => { if (!disposed) { splat.visible = true; setLoaded(true); } } });
      splat.visible = false;
      if (FLIP_UPRIGHT) splat.rotation.x = Math.PI;
      scene.add(splat);

      const onResize = () => {
        if (!mount.clientWidth) return;
        size();
        camera.aspect = mount.clientWidth / mount.clientHeight;
        camera.updateProjectionMatrix();
      };
      window.addEventListener("resize", onResize);

      let raf = 0;
      const start = performance.now();
      const baseTilt = THREE.MathUtils.degToRad(BASE_TILT_DEG);
      const render = () => {
        const t = (performance.now() - start) / 1000;
        const p = progRef.current;
        splat.rotation.y = t * DRIFT_SPEED + p * SCROLL_YAW;
        camera.rotation.x = baseTilt + p * SCROLL_PITCH;
        camera.position.z = -p * SCROLL_DOLLY;
        renderer.render(scene, camera);
        raf = requestAnimationFrame(render);
      };
      raf = requestAnimationFrame(render);

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", onResize);
        try { (splat as unknown as { dispose?: () => void }).dispose?.(); } catch {}
        renderer.dispose();
        renderer.domElement.parentNode?.removeChild(renderer.domElement);
      };
    })().catch((err) => console.error("SplatSky failed to initialize:", err));

    return () => { disposed = true; cleanup(); };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden
      className={className}
      style={{ opacity: loaded ? 1 : 0, transition: "opacity 1.2s ease-out" }}
    />
  );
}
