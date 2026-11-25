import type { NextConfig } from "next";

// (Nov 11 security) headers every answer carries: never shown inside another site, never sniffed, HTTPS remembered a year, no camera /
// microphone / location for embedded pages. Nothing visible changes for users.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // (Nov 25) the developer badge (a round "N" in the bottom-left corner) is hidden: on this Mac it sat on top of the editor's
  // FPS label, and nobody testing the app should see developer chrome. It never exists on the real site; this changes nothing else.
  devIndicators: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
