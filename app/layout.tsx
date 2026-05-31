import type { Metadata } from "next";
import "./globals.css";
import { TopNav } from "@/components/top-nav";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Brim It — AI Expense Intelligence",
  description: "AI-powered expense intelligence for SMB card spending. Brim × MPC Hacks.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background font-sans antialiased">
        <div className="flex min-h-screen flex-col">
          <TopNav />
          <main className="flex-1">{children}</main>
        </div>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
