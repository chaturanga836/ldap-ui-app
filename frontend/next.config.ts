import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',      // This creates the 'out' folder during npm run build
  images: {
    unoptimized: true,   // Required for static export to work with images
  },
  trailingSlash: true,   // Recommended for Nginx to handle routes correctly
};

export default nextConfig;