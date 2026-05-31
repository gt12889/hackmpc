"use client";

import { useEffect, useRef, useState } from "react";
import { User, LogIn, LogOut, Shield } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Session = {
  loggedIn: boolean;
  role: "user" | "admin" | null;
  label: string;
};

const GUEST: Session = { loggedIn: false, role: null, label: "Guest" };

export function ProfileMenu() {
  const [session, setSession] = useState<Session>(GUEST);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const res = await fetch("/api/auth/session");
      const data = await res.json();
      setSession(data);
    } catch {
      setSession(GUEST);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  async function login(role: "user" | "admin") {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (res.ok) {
        setSession(data);
        setOpen(false);
        toast.success(role === "admin" ? "Signed in as admin" : "Signed in");
      } else {
        toast.error("Could not sign in");
      }
    } catch {
      toast.error("Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSession(data);
        setOpen(false);
        toast.success("Signed out");
      } else {
        toast.error("Could not sign out");
      }
    } catch {
      toast.error("Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "relative flex h-11 w-11 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10",
          session.role === "admin" && "ring-2 ring-primary/30"
        )}
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <User className="h-6 w-6" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          <div className="border-b border-border px-3 py-2.5">
            <p className="text-sm font-semibold text-foreground">{session.label}</p>
            <p className="text-[13px] text-muted-foreground">
              {session.loggedIn
                ? session.role === "admin"
                  ? "Full admin access"
                  : "Standard access"
                : "Not signed in"}
            </p>
          </div>

          <div className="p-1.5">
            {!session.loggedIn ? (
              <>
                <MenuButton icon={LogIn} label="Sign in" disabled={busy} onClick={() => login("user")} />
                <MenuButton icon={Shield} label="Sign in as admin" disabled={busy} onClick={() => login("admin")} />
              </>
            ) : (
              <>
                {session.role === "user" && (
                  <MenuButton icon={Shield} label="Switch to admin" disabled={busy} onClick={() => login("admin")} />
                )}
                <MenuButton icon={LogOut} label="Sign out" disabled={busy} onClick={logout} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MenuButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof LogIn;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
    >
      <Icon className="h-4 w-4 text-primary" />
      {label}
    </button>
  );
}
