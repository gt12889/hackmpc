"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShieldCheck,
  CheckSquare,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ProfileMenu } from "@/components/profile-menu";
import { BrimCardIcon } from "@/components/brim-card-icon";

type Item = { href: string; label: string; icon: LucideIcon };

const NAV_ITEMS: Item[] = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/insights", label: "Insights", icon: Sparkles },
  { href: "/governance", label: "Governance", icon: ShieldCheck },
  { href: "/workflow", label: "Workflow", icon: CheckSquare },
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
        <Link href="/" className="flex items-center gap-3 overflow-visible transition-opacity hover:opacity-80 md:gap-4">
          <img src="/brim-it-logo.png" alt="Brim It" width={435} height={87} className="h-[26px] w-auto max-w-none md:h-[30px]" />
          <BrimCardIcon className="mt-6 h-9 w-auto shrink-0 overflow-visible text-primary md:mt-4 md:h-10" />
        </Link>
        <div className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-3 md:gap-4">
          <NotificationBell />
          <ProfileMenu />
        </div>
      </div>

      {/* Nav ribbon */}
      <nav className="bg-primary shadow-sm">
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
                <span className="whitespace-nowrap text-[12px] uppercase tracking-wide sm:text-[13px]">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
