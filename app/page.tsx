import Link from "next/link";
import { BrimRain } from "@/components/brim-rain";

export const dynamic = "force-dynamic";

// Home: the BRIM ASCII-rain brand overview. The live dashboard lives at /dashboard.
export default function HomePage() {
  return (
    <div className="flex min-h-[calc(100vh-7.5rem)] flex-col items-center justify-center bg-background px-6 py-16">
      <Link
        href="/dashboard"
        aria-label="Enter the dashboard"
        className="group flex flex-col items-center transition-transform duration-300 hover:scale-[1.03]"
      >
        <BrimRain className="w-full max-w-[680px] drop-shadow-[0_8px_40px_hsl(199_85%_55%/0.25)]" />
        <p className="mt-6 text-base text-muted-foreground md:text-xl">
          AI expense intelligence for every dollar.
        </p>
      </Link>
    </div>
  );
}
