"use client";

import { useEffect, useRef, useState } from "react";

// 3D Gaussian-splat sky backdrop for the hero (Niantic Spark + Three.js).
// Renders /public/hero/sky.spz as the backmost full-bleed layer: transparent
// canvas so the hero's teal particles, glows, and beige vignette frame it.
//
// On load it measures the splat cloud's bounds, recenters it at the origin, and
// frames the camera to fit - a capture lives at an arbitrary position/scale, so
// without this the camera would point at empty space. Then it gently auto-drifts
// and parallaxes with scroll `progress` (0..1 from the pinned hero).
//
// Tuning knobs - adjust once you see it in-browser:
const SPLAT_URL = "/hero/sky.spz";
const FLIP_UPRIGHT = true;   // most captures import upside-down; flip 180° on X
// "immersive" puts the camera inside the capture (best for a sky/panorama);
// "fit" backs off to view the whole cloud as an object.
const MODE: "immersive" | "fit" = "immersive";
const FIT = 1.15;            // (fit mode) camera distance multiplier - more margin around the cloud
const IMMERSE = 0.12;        // (immersive mode) camera offset from centre, as a fraction of radius
const PITCH_DEG = -8;        // resting tilt; negative looks slightly upward into the sky
const DRIFT_SPEED = 0.018;   // radians/sec of slow yaw - keep tiny for "ambient"
const SCROLL_YAW = 0.45;     // extra yaw across a full scroll of the pinned hero
const SCROLL_PITCH = 0.12;   // extra upward tilt across a full scroll

export function SplatSky({ progress = 0, className }: { progress?: number; className?: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const progRef = useRef(progress);
  const [loaded, setLoaded] = useState(false);

  // Keep latest scroll progress in a ref so the render loop reads it without
  // re-running the (expensive) WebGL setup effect.
  useEffect(() => { progRef.current = progress; }, [progress]);

  useEffect(() => {
    // Respect reduced-motion and skip the heavy splat on small/mobile screens -
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
      renderer.setClearColor(0x000000, 0); // transparent - hero layers blend over it
      renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
      const size = () => renderer.setSize(mount.clientWidth, mount.clientHeight, false);
      size();
      Object.assign(renderer.domElement.style, { width: "100%", height: "100%", display: "block" });
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(62, mount.clientWidth / mount.clientHeight, 0.01, 1e6);

      const spark = new SparkRenderer({ renderer });
      scene.add(spark);

      // Pivot wraps the splat so we can spin the whole cloud around its own centre.
      const pivot = new THREE.Group();
      scene.add(pivot);

      let radius = 1;        // cloud radius
      let camDist = 0;       // resting camera distance from centre
      let framed = false;

      const splat = new SplatMesh({
        url: SPLAT_URL,
        onLoad: () => {
          if (disposed) return;
          if (FLIP_UPRIGHT) splat.rotation.x = Math.PI;
          splat.updateMatrix();

          // Measure the cloud (splat-local centres) and recentre it at the pivot origin.
          const box = new THREE.Box3();
          let n = 0;
          splat.forEachSplat((_i, center) => { box.expandByPoint(center); n++; });
          if (n > 0 && box.isEmpty() === false) {
            const c = box.getCenter(new THREE.Vector3());
            const s = box.getSize(new THREE.Vector3());
            radius = Math.max(s.x, s.y, s.z, 0.001) * 0.5;
            // Account for the upright flip when offsetting back to centre.
            splat.position.copy(c.applyEuler(splat.rotation)).multiplyScalar(-1);
          }
          const fov = THREE.MathUtils.degToRad(camera.fov);
          camDist = MODE === "fit"
            ? (radius / Math.max(0.05, Math.sin(fov / 2))) * FIT // back off to frame the whole cloud
            : radius * IMMERSE;                                  // sit just off-centre, inside the cloud
          framed = true;

          splat.visible = true;
          setLoaded(true);
        },
      });
      splat.visible = false;
      pivot.add(splat);

      const onResize = () => {
        if (!mount.clientWidth) return;
        size();
        camera.aspect = mount.clientWidth / mount.clientHeight;
        camera.updateProjectionMatrix();
      };
      window.addEventListener("resize", onResize);

      let raf = 0;
      const start = performance.now();
      const basePitch = THREE.MathUtils.degToRad(PITCH_DEG);
      const target = new THREE.Vector3();
      const render = () => {
        const t = (performance.now() - start) / 1000;
        const p = progRef.current;
        pivot.rotation.y = t * DRIFT_SPEED + p * SCROLL_YAW;
        if (framed) {
          const pitch = basePitch - p * SCROLL_PITCH; // tilt upward into the sky on scroll
          // Orbit the camera on a small sphere around the centre and look inward.
          camera.position.set(0, Math.sin(pitch) * camDist, Math.cos(pitch) * camDist);
          target.set(0, Math.sin(pitch + Math.PI) * radius * 0.1, -radius);
          camera.lookAt(target);
        }
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
