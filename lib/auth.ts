import { cookies } from "next/headers";

export const AUTH_COOKIE = "brim_auth";
export type AuthRole = "user" | "admin";

export type Session = {
  loggedIn: boolean;
  role: AuthRole | null;
  label: string;
};

const LABELS: Record<AuthRole, string> = {
  user: "Finance User",
  admin: "Admin",
};

export async function getSession(): Promise<Session> {
  const jar = await cookies();
  const value = jar.get(AUTH_COOKIE)?.value;
  if (value === "admin" || value === "user") {
    return { loggedIn: true, role: value, label: LABELS[value] };
  }
  return { loggedIn: false, role: null, label: "Guest" };
}

export function cookieOptions(maxAge = 60 * 60 * 24 * 7) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
