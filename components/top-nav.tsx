"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  ShieldCheck,
  CheckSquare,
  FileText,
  Sparkles,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: any; desc?: string };

const NAV_ITEMS: Item[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, desc: "Spend overview & KPIs" },
  { href: "/compliance", label: "Compliance", icon: ShieldCheck, desc: "Policy rules & violations" },
  { href: "/approvals", label: "Approvals", icon: CheckSquare, desc: "AI pre-approval queue" },
  { href: "/reports", label: "Expense Reports", icon: FileText, desc: "Grouped, CFO-ready" },
  { href: "/insights", label: "Insights", icon: Sparkles, desc: "Anomaly · vendors · forecast" },
];

export function TopNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/60 backdrop-blur-xl">
        <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-2 px-5">
          <div className="justify-self-start" />

          <Link
            href="/"
            className="justify-self-center text-2xl tracking-tight text-foreground transition-opacity hover:opacity-80 md:text-3xl"
          >
            Brim It
          </Link>

          <div className="flex items-center justify-self-end">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              aria-expanded={open}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-foreground/[0.06]"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-foreground/15 backdrop-blur-sm animate-in fade-in-0 duration-200"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-72 flex-col border-l border-border/60 bg-background/95 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
        aria-hidden={!open}
      >
        <div className="flex h-16 items-center justify-between border-b border-border/60 px-5">
          <span className="text-sm text-muted-foreground">Menu</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          {NAV_ITEMS.map(({ href, label, icon: Icon, desc }) => {
            const active = pathname.startsWith(href) && href !== "/";
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-start gap-3 rounded-lg px-3 py-3 transition-colors",
                  active ? "bg-primary/15 ring-1 ring-inset ring-primary/25" : "hover:bg-foreground/[0.06]"
                )}
              >
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                <div className="min-w-0">
                  <div className={cn("text-[13px]", active ? "text-primary" : "text-foreground")}>{label}</div>
                  {desc && <div className="text-[11px] text-muted-foreground">{desc}</div>}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border/60 p-4">
          <div className="flex items-center gap-2 rounded-full border border-border/60 bg-foreground/[0.03] px-3 py-2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            <span className="text-[11px] text-muted-foreground">Brim × MPC Hacks</span>
          </div>
        </div>
      </aside>
    </>
  );
}
