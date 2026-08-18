import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required by the production stage of the Dockerfile — emits a self-contained
  // server bundle at .next/standalone so the runtime image needs no node_modules.
  output: "standalone",
};

export default nextConfig;
