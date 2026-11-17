import type { Logger } from "@siftmerit/core";
import cors from "cors";
import express from "express";
import type { Env } from "./config/env.js";
import { errorMiddleware, notFoundMiddleware } from "./middleware/error.middleware.js";
import { createRequestLogMiddleware } from "./middleware/request-log.middleware.js";
import { healthRoutes } from "./routes/v1/health.routes.js";

/** Builds the Express app. The order below is the order a request passes through. */
export function createApp(env: Env, logger: Logger) {
  const app = express();

  // 1. Every request gets an ID and a logger that carries it.
  app.use(createRequestLogMiddleware(logger));

  // 2. CORS. A browser hides the API's answer from a page on another address
  //    unless the API names that address. Only the web app's address is named,
  //    never "everyone". Cookies are not allowed across: the sign-in token
  //    travels in a header. This protects browsers only; it is not sign-in.
  app.use(cors({ origin: env.CORS_ORIGIN }));

  // 3. Routes. Each later task adds its routes to `v1`.
  const v1 = express.Router();
  v1.use(healthRoutes);
  app.use("/v1", v1);

  // 4. No route matched.
  app.use(notFoundMiddleware);

  // 5. Any error from the steps above ends here.
  app.use(errorMiddleware);

  return app;
}
