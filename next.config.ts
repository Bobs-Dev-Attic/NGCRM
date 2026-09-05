import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep server-only packages out of the client bundle.
  serverExternalPackages: ["@neondatabase/serverless", "@anthropic-ai/sdk"],
};

export default nextConfig;
