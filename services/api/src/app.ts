import type { Logger } from "@siftmerit/core";
import cors from "cors";
import express from "express";
import type { Env } from "./config/env.js";
import { createMeController } from "./controllers/me.controller.js";
import { createSecretClient } from "./lib/supabase.js";
import { createAuthMiddleware, createRequireTenantMiddleware } from "./middleware/auth.middleware.js";
import { createErrorMiddleware, notFoundMiddleware } from "./middleware/error.middleware.js";
import { createRequestLogMiddleware } from "./middleware/request-log.middleware.js";
import { TenantMemberRepository } from "./repositories/tenant-member.repository.js";
import { TenantRepository } from "./repositories/tenant.repository.js";
import { healthRoutes } from "./routes/v1/health.routes.js";
import { createMeRoutes } from "./routes/v1/me.routes.js";
import { AuthService } from "./services/auth.service.js";
import { TenantService } from "./services/tenant.service.js";

/** Builds the Express app. The order below is the order a request passes through. */
export function createApp(env: Env, logger: Logger) {
  const app = express();

  // The pieces, built once when the API starts. Repositories talk to the
  // database, services hold the rules, and the two sign-in steps go in front
  // of every address that needs a signed-in user.
  const db = createSecretClient(env);
  const tenantRepository = new TenantRepository(db);
  const tenantMemberRepository = new TenantMemberRepository(db);
  const requireUser = createAuthMiddleware(new AuthService(env));
  const requireTenant = createRequireTenantMiddleware(tenantMemberRepository);

  // 1. Every request gets an ID and a logger that carries it.
  app.use(createRequestLogMiddleware(logger));

  // 2. CORS. A browser hides the API's answer from a page on another address
  //    unless the API names that address. Only the web app's address is named,
  //    never "everyone". Cookies are not allowed across: the sign-in token
  //    travels in a header. This protects browsers only; it is not sign-in.
  app.use(cors({ origin: env.CORS_ORIGIN }));

  // 3. Routes. Each later task adds its routes to `v1`. Health needs no
  //    sign-in. Everything else gets the two sign-in steps.
  const v1 = express.Router();
  v1.use(healthRoutes);
  v1.use(
    createMeRoutes({
      requireUser,
      requireTenant,
      meController: createMeController(new TenantService(tenantRepository)),
    }),
  );
  app.use("/v1", v1);

  // 4. No route matched.
  app.use(notFoundMiddleware);

  // 5. Any error from the steps above ends here.
  app.use(createErrorMiddleware({ showDatabaseMessages: env.NODE_ENV === "development" }));

  return app;
}
