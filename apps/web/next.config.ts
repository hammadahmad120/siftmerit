import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// One `.env` file at the repo root serves every part of the project. Next.js
// reads `.env` files from its own folder (apps/web) first, so the repo-root
// file is loaded here. The last `true` forces the reload; without it this call
// does nothing, because Next.js has already loaded once.
//
// Only settings whose names start with NEXT_PUBLIC_ are handed to the browser,
// and anyone who opens the site can read them. A secret never gets that prefix.
const repoRoot = path.resolve(__dirname, "../..");
loadEnvConfig(repoRoot, process.env.NODE_ENV !== "production", console, true);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
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
