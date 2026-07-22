import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the Next.js "Issues" badge away from the mobile bottom CTA/nav stack.
  devIndicators: {
    position: "top-right",
  },
};

export default nextConfig;
