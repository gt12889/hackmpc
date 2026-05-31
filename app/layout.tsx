import type { Metadata } from "next";
import { Arimo, Fraunces } from "next/font/google";
import "./globals.css";
import { TopNav } from "@/components/top-nav";
import { ChatDock } from "@/components/chat/chat-dock";
import { Toaster } from "@/components/ui/sonner";

// Arimo - a free, metric-compatible Helvetica substitute. Renders true Helvetica
// metrics on every platform (incl. Windows, which doesn't ship Helvetica).
const helvetica = Arimo({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-helv", display: "swap" });

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Brim It - AI Expense Intelligence",
  description: "AI-powered expense intelligence for SMB card spending. Brim × MPC Hacks.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={helvetica.variable}>
      <body className={`min-h-screen bg-background font-sans antialiased ${fraunces.variable}`}>
        <div className="flex min-h-screen flex-col">
          <TopNav />
          <main className="flex-1">{children}</main>
        </div>
        <Toaster richColors position="top-right" />
        <ChatDock />
      </body>
    </html>
  );
}
