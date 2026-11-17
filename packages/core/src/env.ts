import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

// This file sits in packages/core/src, three folders below the repo root.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

/**
 * The settings every part uses. A part adds its own with
 * `sharedEnvSchema.extend({ ... })`. A setting is added by the task that
 * first uses it.
 */
export const sharedEnvSchema = z.object({
  // development prints easy-to-read log lines, production prints JSON lines.
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
});

export type SharedEnv = z.infer<typeof sharedEnvSchema>;

/**
 * Reads the repo-root `.env` file and checks the settings against the given
 * schema. Throws an error that names each bad setting.
 *
 * One `.env` file at the repo root serves every part of the project. A setting
 * already present in the shell wins over the file.
 */
export function loadSettings<T>(partName: string, schema: z.ZodType<T>): T {
  loadDotenv({ path: path.join(repoRoot, ".env") });

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join(".")} (${issue.message})`)
      .join(", ");
    throw new Error(
      `${partName} settings check failed. Fix these in the repo-root .env file or your shell: ${problems}`,
    );
  }
  return parsed.data;
}
