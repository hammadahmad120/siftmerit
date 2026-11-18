import { Router, type RequestHandler } from "express";

/** The two sign-in steps run first, then the controller. */
export function createMeRoutes(deps: {
  requireUser: RequestHandler;
  requireTenant: RequestHandler;
  meController: RequestHandler;
}) {
  const router = Router();

  router.get("/me", deps.requireUser, deps.requireTenant, deps.meController);

  return router;
}
