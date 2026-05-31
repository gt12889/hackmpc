/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native module - keep it server-only, never bundled
  serverExternalPackages: ["better-sqlite3"],
  typescript: {
    // Hackathon velocity: don't let a stray type error block the dev server.
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
