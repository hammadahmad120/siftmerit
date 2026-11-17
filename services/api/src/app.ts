import express from "express";
import type { Logger } from "./lib/logger.js";
import { errorMiddleware, notFoundMiddleware } from "./middleware/error.middleware.js";
import { createRequestLogMiddleware } from "./middleware/request-log.middleware.js";
import { healthRoutes } from "./routes/v1/health.routes.js";

/** Builds the Express app. The order below is the order a request passes through. */
export function createApp(logger: Logger) {
  const app = express();

  // 1. Every request gets an ID and a logger that carries it.
  app.use(createRequestLogMiddleware(logger));

  // 2. Routes. Each later task adds its routes to `v1`.
  const v1 = express.Router();
  v1.use(healthRoutes);
  app.use("/v1", v1);

  // 3. No route matched.
  app.use(notFoundMiddleware);

  // 4. Any error from the steps above ends here.
  app.use(errorMiddleware);

  return app;
}
