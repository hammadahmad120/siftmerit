import { Router, type RequestHandler } from "express";

/** The two sign-in steps run first, then the controller's function. */
export function createJobsRoutes(deps: {
  requireUser: RequestHandler;
  requireTenant: RequestHandler;
  jobsController: { create: RequestHandler; list: RequestHandler; get: RequestHandler };
}) {
  const router = Router();

  router.post("/jobs", deps.requireUser, deps.requireTenant, deps.jobsController.create);
  router.get("/jobs", deps.requireUser, deps.requireTenant, deps.jobsController.list);
  router.get("/jobs/:jobId", deps.requireUser, deps.requireTenant, deps.jobsController.get);

  return router;
}
