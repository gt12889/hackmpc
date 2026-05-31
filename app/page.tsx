import { HeroReveal } from "@/components/hero-reveal";
import { Cursor } from "@/components/ui/inverted-cursor";

export const dynamic = "force-dynamic";

// Home is the cinematic scroll-reveal brand overview (with the Spline bird in its sky).
// The dashboard lives at /dashboard.
export default function HomePage() {
  return (
    <>
      <Cursor />
      <HeroReveal />
    </>
  );
}
