import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a CAD amount for finance-manager display. */
export function formatCAD(n: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact && Math.abs(n) >= 1000) {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  }
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Convert an Excel serial date (1900 date system) to an ISO yyyy-mm-dd string. */
export function excelSerialToISO(serial: number): string {
  // Excel's epoch is 1899-12-30 (accounts for the 1900 leap-year bug).
  const ms = Math.round(serial) * 86400000 + Date.UTC(1899, 11, 30);
  return new Date(ms).toISOString().slice(0, 10);
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
