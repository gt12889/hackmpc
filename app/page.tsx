import { HeroReveal } from "@/components/hero-reveal";
import MagicBento from "@/components/magic-bento/MagicBento";

export const dynamic = "force-dynamic";

// Home: the cinematic scroll-reveal hero (Spline bird in its sky), then a cursor-interactive
// MagicBento grid of Brim It's capabilities.
export default function HomePage() {
  return (
    <>
      <HeroReveal />
      <section className="flex min-h-screen w-full flex-col items-center justify-center gap-10 bg-[#0a0d10] px-4 py-24">
        <div className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">One platform, every dollar</h2>
          <p className="mt-3 text-sm text-white/55 md:text-base">Move your cursor across the cards.</p>
        </div>
        <MagicBento
          textAutoHide
          enableStars
          enableSpotlight
          enableBorderGlow
          enableTilt
          enableMagnetism
          clickEffect
          spotlightRadius={300}
          particleCount={12}
          glowColor="0, 193, 213"
        />
      </section>
    </>
  );
}
