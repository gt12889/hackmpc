import Spline from "@splinetool/react-spline/next";

export const dynamic = "force-dynamic";

// Landing page: the Spline 3D scene, full viewport. Uses the `/next` export, which is an
// async Server Component — valid here because this page is a Server Component (it must NOT
// carry "use client"). The old cinematic hero lives in components/hero-reveal.tsx if needed.
export default function HomePage() {
  return (
    <main className="h-screen w-full overflow-hidden">
      <Spline scene="https://prod.spline.design/XD76ymrOUpojY1BV/scene.splinecode" />
    </main>
  );
}
