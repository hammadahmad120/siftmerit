import {
  createQueueTroubleLogger,
  createSecretClient,
  DemoQueue,
  JobRepository,
  JobRequirementRepository,
  RequirementsQueue,
  WorkRunRepository,
  type Logger,
} from "@siftmerit/core";
import cors from "cors";
import express from "express";
import type { Env } from "./config/env.js";
import { createDemoWorkController } from "./controllers/demo-work.controller.js";
import { createJobsController } from "./controllers/jobs.controller.js";
import { createMeController } from "./controllers/me.controller.js";
import { createRequirementsController } from "./controllers/requirements.controller.js";
import { createAuthMiddleware, createRequireTenantMiddleware } from "./middleware/auth.middleware.js";
import { createErrorMiddleware, notFoundMiddleware } from "./middleware/error.middleware.js";
import { createRequestLogMiddleware } from "./middleware/request-log.middleware.js";
import { TenantMemberRepository } from "./repositories/tenant-member.repository.js";
import { TenantRepository } from "./repositories/tenant.repository.js";
import { createDemoWorkRoutes } from "./routes/v1/demo-work.routes.js";
import { healthRoutes } from "./routes/v1/health.routes.js";
import { createJobsRoutes } from "./routes/v1/jobs.routes.js";
import { createMeRoutes } from "./routes/v1/me.routes.js";
import { createRequirementsRoutes } from "./routes/v1/requirements.routes.js";
import { AuthService } from "./services/auth.service.js";
import { DemoWorkService } from "./services/demo-work.service.js";
import { JobService } from "./services/job.service.js";
import { RequirementService } from "./services/requirement.service.js";
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
  const workRunRepository = new WorkRunRepository(db);
  const jobRepository = new JobRepository(db);
  const jobRequirementRepository = new JobRequirementRepository(db);
  const requireUser = createAuthMiddleware(new AuthService(env));
  const requireTenant = createRequireTenantMiddleware(tenantMemberRepository);

  // The work queues. The API only adds work items to them; the worker runs
  // them. The API starts even when Redis cannot be reached: a queue connects
  // in the background, and until it has, queuing answers 503.
  const onQueueTrouble = createQueueTroubleLogger(logger);
  const demoQueue = new DemoQueue(env.REDIS_URL, onQueueTrouble);
  const requirementsQueue = new RequirementsQueue(env.REDIS_URL, onQueueTrouble);

  // 1. Every request gets an ID and a logger that carries it.
  app.use(createRequestLogMiddleware(logger));

  // 2. CORS. A browser hides the API's answer from a page on another address
  //    unless the API names that address. Only the web app's address is named,
  //    never "everyone". Cookies are not allowed across: the sign-in token
  //    travels in a header. This protects browsers only; it is not sign-in.
  app.use(cors({ origin: env.CORS_ORIGIN }));

  // 2b. Reads a JSON body into `req.body`. The limit is small on purpose: the
  //     API takes short instructions and text typed by a person, never files.
  //     The largest thing sent is a job description, at most 20,000
  //     characters, which can be 40 KB or more in some scripts. A larger body
  //     is refused before any of our code runs.
  app.use(express.json({ limit: "100kb" }));

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
  v1.use(
    createJobsRoutes({
      requireUser,
      requireTenant,
      jobsController: createJobsController(new JobService(jobRepository)),
    }),
  );
  v1.use(
    createRequirementsRoutes({
      requireUser,
      requireTenant,
      requirementsController: createRequirementsController(
        new RequirementService(
          jobRepository,
          jobRequirementRepository,
          workRunRepository,
          requirementsQueue,
        ),
      ),
    }),
  );
  v1.use(
    createDemoWorkRoutes({
      requireUser,
      requireTenant,
      demoWorkController: createDemoWorkController(
        new DemoWorkService(workRunRepository, demoQueue),
      ),
    }),
  );
  app.use("/v1", v1);

  // 4. No route matched.
  app.use(notFoundMiddleware);

  // 5. Any error from the steps above ends here.
  app.use(createErrorMiddleware({ showDatabaseMessages: env.NODE_ENV === "development" }));

  return app;
}
