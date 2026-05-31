import { SplatSky } from "@/components/splat-sky";
import { SplineSky } from "@/components/spline-sky";

export const dynamic = "force-dynamic";

// Landing page: the blue Gaussian-splat sky as the backdrop, with the Spline bird scene
// composited on top (its background made transparent so the sky shows through).
export default function HomePage() {
  return (
    <main className="relative h-screen w-full overflow-hidden">
      {/* Sky backdrop */}
      <SplatSky className="absolute inset-0 h-full w-full" />
      {/* Soft brand glow + beige vignette to match the sky */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(42rem 30rem at 50% 40%, hsl(199 76% 46% / 0.14), transparent 62%), radial-gradient(38rem 28rem at 64% 56%, hsl(197 65% 68% / 0.12), transparent 60%)",
        }}
      />
      {/* Bird scene on top (transparent background) */}
      <SplineSky className="absolute inset-0 h-full w-full" />
    </main>
  );
}
