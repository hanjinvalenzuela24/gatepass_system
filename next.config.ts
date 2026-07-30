import type { NextConfig } from "next";

const allowedDevOrigins = [
  "localhost",
  "127.0.0.1",
  "192.168.114.52",
  process.env.DEV_LAN_IP,
].filter((value): value is string => Boolean(value?.trim()));

const nextConfig: NextConfig = {
  allowedDevOrigins,
  output: "export",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

