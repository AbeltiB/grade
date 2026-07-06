import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow large file uploads through the proxy / middleware buffer.
  // Submissions accept zips up to 50 MB; add headroom for multipart overhead.
  experimental: {
    proxyClientMaxBodySize: "60mb",
  },
};

export default nextConfig;
