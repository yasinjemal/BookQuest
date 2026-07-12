import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allows verification builds to avoid colliding with a running dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["better-sqlite3", "unpdf"],
};

export default nextConfig;
