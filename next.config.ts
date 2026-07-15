import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allows verification builds to avoid colliding with a running dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["pg", "unpdf"],
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=(self)",
      },
    ];
    const privatePaths = [
      "/api/:path*", "/admin/:path*", "/analytics/:path*", "/class/:path*",
      "/classes/:path*", "/course/:path*", "/create", "/lesson/:path*",
      "/cert/:path*",
      "/login", "/register", "/forgot-password", "/reset-password",
      "/verify-email", "/lti/:path*", "/passport", "/profile",
      "/review/:path*", "/spaces/:path*", "/stats", "/studio/:path*",
    ];
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      ...privatePaths.map((source) => ({
        source,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      })),
    ];
  },
};

export default nextConfig;
