"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShieldCheck,
  CheckSquare,
  FileText,
  Sparkles,
  ReceiptText,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notifications/notification-bell";

type Item = { href: string; label: string; icon: LucideIcon };

const NAV_ITEMS: Item[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/compliance", label: "Compliance", icon: ShieldCheck },
  { href: "/approvals", label: "Approvals", icon: CheckSquare },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/receipts", label: "Receipts", icon: ReceiptText },
  { href: "/budgets", label: "Budgets", icon: Wallet },
  { href: "/insights", label: "Insights", icon: Sparkles },
];

function isActive(pathname: string, href: string) {
  return pathname.startsWith(href);
}

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40">
      {/* Logo bar */}
      <div className="relative flex h-14 items-center justify-center border-b border-border/40 bg-white px-5 shadow-sm">
        <Link href="/" className="flex items-center transition-opacity hover:opacity-80">
          <img src="/brim-it-logo.png" alt="Brim It" width={435} height={87} className="h-6 w-auto max-w-none md:h-7" />
        </Link>
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          <NotificationBell />
        </div>
      </div>

      {/* Nav ribbon */}
      <nav className="bg-[#0093AF] shadow-sm">
        <div className="no-scrollbar flex w-full items-stretch justify-evenly overflow-x-auto px-2 sm:px-6 lg:px-10">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex min-w-[4.25rem] flex-1 flex-col items-center justify-center gap-1.5 border-b-2 px-2 py-3 transition-colors sm:min-w-0 sm:px-4 md:px-6",
                  active
                    ? "border-white text-white"
                    : "border-transparent text-white/70 hover:text-white"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.25 : 1.75} />
                <span className="whitespace-nowrap text-[11px] uppercase tracking-wide sm:text-[12px]">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
