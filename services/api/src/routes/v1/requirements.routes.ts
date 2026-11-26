import { Router, type RequestHandler } from "express";

/** The two sign-in steps run first, then the controller's function. */
export function createRequirementsRoutes(deps: {
  requireUser: RequestHandler;
  requireTenant: RequestHandler;
  requirementsController: { get: RequestHandler; startDraft: RequestHandler };
}) {
  const router = Router();

  router.get(
    "/jobs/:jobId/requirements",
    deps.requireUser,
    deps.requireTenant,
    deps.requirementsController.get,
  );
  router.post(
    "/jobs/:jobId/requirements/draft",
    deps.requireUser,
    deps.requireTenant,
    deps.requirementsController.startDraft,
  );

  return router;
}
