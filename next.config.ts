import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
    authInterrupts: true,
  },
  allowedDevOrigins: ["detached-earthlike-pliable.ngrok-free.dev"],
  // Stagehand loads its own files at runtime, which bundlers cannot follow.
  serverExternalPackages: ["@browserbasehq/stagehand", "@browserbasehq/sdk"],
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
