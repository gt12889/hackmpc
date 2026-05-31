"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  MessagesSquare,
  ShieldCheck,
  CheckSquare,
  FileText,
  Sparkles,
  CreditCard,
  ChevronDown,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: any; desc?: string };

const PRIMARY: Item[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Ask AI", icon: MessagesSquare },
];

const GROUPS: { label: string; icon: any; items: Item[] }[] = [
  {
    label: "Menu",
    icon: LayoutGrid,
    items: [
      { href: "/compliance", label: "Compliance", icon: ShieldCheck, desc: "Policy rules & violations" },
      { href: "/approvals", label: "Approvals", icon: CheckSquare, desc: "AI pre-approval queue" },
      { href: "/reports", label: "Expense Reports", icon: FileText, desc: "Grouped, CFO-ready" },
      { href: "/insights", label: "Insights", icon: Sparkles, desc: "Anomaly · vendors · forecast" },
    ],
  },
];

export function TopNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/60 backdrop-blur-xl">
      <div className="flex h-14 items-center gap-1 px-5">
        {/* Brand */}
        <Link href="/" className="mr-3 flex shrink-0 items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[hsl(189_100%_29%)] to-[hsl(187_95%_45%)] shadow-lg shadow-primary/25">
            <CreditCard className="h-[18px] w-[18px] text-white" />
          </div>
          <span className="text-[15px] tracking-tight">Brim It</span>
        </Link>

        {/* Primary links */}
        <nav className="flex flex-1 items-center gap-1">
          {PRIMARY.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={navItemCls(active)}>
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
          {GROUPS.map((g) => (
            <NavDropdown key={g.label} group={g} pathname={pathname} />
          ))}
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

function navItemCls(active: boolean) {
  return cn(
    "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition-all duration-200",
    active
      ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/25"
      : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
  );
}

function NavDropdown({ group, pathname }: { group: { label: string; icon: any; items: Item[] }; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const Icon = group.icon;
  const active = group.items.some((i) => pathname.startsWith(i.href));

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Close on route change.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className={navItemCls(active)}>
        <Icon className="h-4 w-4" />
        <span className="hidden sm:inline">{group.label}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] w-64 origin-top-left animate-fade-up rounded-xl border border-border/70 bg-popover/85 p-1.5 shadow-2xl shadow-black/40 ring-1 ring-inset ring-white/[0.03] backdrop-blur-xl">
          {group.items.map(({ href, label, icon: ItemIcon, desc }) => {
            const itemActive = pathname.startsWith(href) && href !== "/";
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors",
                  itemActive ? "bg-primary/15" : "hover:bg-foreground/[0.06]"
                )}
              >
                <ItemIcon className={cn("mt-0.5 h-4 w-4 shrink-0", itemActive ? "text-primary" : "text-muted-foreground")} />
                <div className="min-w-0">
                  <div className={cn("text-[13px]", itemActive ? "text-primary" : "text-foreground")}>{label}</div>
                  {desc && <div className="text-[11px] text-muted-foreground">{desc}</div>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
