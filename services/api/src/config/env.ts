import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");

// One `.env` file at the repo root serves every part of the project.
// A setting already present in the shell wins over the file.
loadDotenv({ path: path.join(repoRoot, ".env") });

// A setting is added here by the task that first uses it.
const envSchema = z.object({
  // development prints easy-to-read log lines, production prints JSON lines.
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4100),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

/** Reads and checks the settings. Throws an error that names each bad setting. */
export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join(".")} (${issue.message})`)
      .join(", ");
    throw new Error(
      `API settings check failed. Fix these in the repo-root .env file or your shell: ${problems}`,
    );
  }
  return parsed.data;
}
