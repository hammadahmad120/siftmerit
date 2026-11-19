import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Copied from InstantBot's web app. The rules are the ones Next.js publishes:
// its own, React's, the React hooks rules and the TypeScript rules.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Files that are generated, not written by us.
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
