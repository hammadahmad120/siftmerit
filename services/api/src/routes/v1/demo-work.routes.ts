import { Router, type RequestHandler } from "express";

/** The two sign-in steps run first, then the controller. */
export function createDemoWorkRoutes(deps: {
  requireUser: RequestHandler;
  requireTenant: RequestHandler;
  demoWorkController: RequestHandler;
}) {
  const router = Router();

  router.post("/demo-work", deps.requireUser, deps.requireTenant, deps.demoWorkController);

  return router;
}
