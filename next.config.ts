import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Image optimization
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.gyanvarta.in" },
      { protocol: "https", hostname: "pub-*.r2.dev" },
    ],
    formats: ["image/avif", "image/webp"],
  },

  // Hindi content headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: cdn.gyanvarta.in blob:",
              "media-src 'self' cdn.gyanvarta.in",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },

  // Redirects for old URLs
  async redirects() {
    return [
      { source: "/news/:slug", destination: "/article/:slug", permanent: true },
    ];
  },

  // Enable experimental features
  experimental: {
    optimizeCss: true,
  },

  // Output for standalone deployment
  output: "standalone",
};

export default nextConfig;
