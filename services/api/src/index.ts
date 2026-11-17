import { createLogger } from "@siftmerit/core";
import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";

function start() {
  const env = loadEnv();
  const logger = createLogger({
    service: "api",
    level: env.LOG_LEVEL,
    style: env.NODE_ENV === "production" ? "json" : "readable",
  });
  const app = createApp(env, logger);

  app.listen(env.API_PORT, () => {
    logger.info(`API listening on http://localhost:${env.API_PORT}`);
  });
}

try {
  start();
} catch (error) {
  // The logger may not exist yet (a bad setting stops us before it is built),
  // so this one message is printed directly.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
