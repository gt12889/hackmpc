"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessagesSquare,
  ShieldCheck,
  CheckSquare,
  FileText,
  Sparkles,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Talk to Data", icon: MessagesSquare },
  { href: "/compliance", label: "Compliance", icon: ShieldCheck },
  { href: "/approvals", label: "Approvals", icon: CheckSquare },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/insights", label: "Insights", icon: Sparkles },
];

export function TopNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/60 backdrop-blur-xl">
      <div className="flex h-14 items-center gap-4 px-5">
        {/* Brand */}
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[hsl(189_100%_29%)] to-[hsl(187_95%_45%)] shadow-lg shadow-primary/25">
            <CreditCard className="h-[18px] w-[18px] text-white" />
          </div>
          <span className="text-[15px] tracking-tight">Brim It</span>
        </Link>

        {/* Nav */}
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto no-scrollbar">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition-all duration-200",
                  active
                    ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/25"
                    : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden md:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right badge */}
        <div className="hidden shrink-0 items-center gap-2 rounded-full border border-border/60 bg-foreground/[0.03] px-3 py-1.5 lg:flex">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          <span className="text-[11px] text-muted-foreground">Brim × MPC Hacks</span>
        </div>
      </div>
    </header>
  );
}
