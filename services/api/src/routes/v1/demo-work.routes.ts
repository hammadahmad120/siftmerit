import { Router, type RequestHandler } from "express";

/** The two sign-in steps run first, then the controller's function. */
export function createDemoWorkRoutes(deps: {
  requireUser: RequestHandler;
  requireTenant: RequestHandler;
  demoWorkController: { startRun: RequestHandler; listRuns: RequestHandler };
}) {
  const router = Router();

  router.post("/demo-work", deps.requireUser, deps.requireTenant, deps.demoWorkController.startRun);
  router.get("/demo-work", deps.requireUser, deps.requireTenant, deps.demoWorkController.listRuns);

  return router;
}
