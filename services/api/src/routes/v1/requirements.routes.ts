import { Router, type RequestHandler } from "express";

/** The two sign-in steps run first, then the controller's function. */
export function createRequirementsRoutes(deps: {
  requireUser: RequestHandler;
  requireTenant: RequestHandler;
  requirementsController: {
    get: RequestHandler;
    startDraft: RequestHandler;
    add: RequestHandler;
    change: RequestHandler;
    remove: RequestHandler;
  };
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
  router.post(
    "/jobs/:jobId/requirements",
    deps.requireUser,
    deps.requireTenant,
    deps.requirementsController.add,
  );
  router.patch(
    "/jobs/:jobId/requirements/:requirementId",
    deps.requireUser,
    deps.requireTenant,
    deps.requirementsController.change,
  );
  router.delete(
    "/jobs/:jobId/requirements/:requirementId",
    deps.requireUser,
    deps.requireTenant,
    deps.requirementsController.remove,
  );

  return router;
}
