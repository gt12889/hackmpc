/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native module - keep it server-only, never bundled
  serverExternalPackages: ["better-sqlite3", "three", "@sparkjsdev/spark"],
  // Spline ships an ESM-only `exports` map (import condition only); transpile it through
  // Next's pipeline so webpack resolves the root export instead of "path . is not exported".
  transpilePackages: ["@splinetool/react-spline", "@splinetool/runtime"],
  typescript: {
    // Hackathon velocity: don't let a stray type error block the dev server.
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Bundle the demo SQLite DB + schema into serverless traces (built in vercel.json).
  outputFileTracingIncludes: {
    "/*": ["./data/hackmpc.db", "./lib/schema.sql"],
    "/api/**": ["./data/hackmpc.db", "./lib/schema.sql"],
  },
};

export default nextConfig;
