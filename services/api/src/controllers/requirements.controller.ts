import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "../lib/errors.js";
import type { RequirementService } from "../services/requirement.service.js";
import { routeParam } from "./jobs.controller.js";

/**
 * The addresses for a job's requirements. It gives back a group of functions,
 * one per address.
 *
 * All need a signed-in user: `req.tenantId` is set by the two sign-in steps
 * that run before. The company is never read from the request.
 */
export function createRequirementsController(requirementService: RequirementService) {
  return {
    /**
     * `GET /v1/jobs/:jobId/requirements`: the job's requirements in the order
     * of the list, and its newest draft run (or null). A job with no list yet
     * answers with an empty one. A job that is not the company's: 404.
     */
    get: async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.tenantId) {
          throw new UnauthorizedError();
        }

        const answer = await requirementService.get(req.tenantId, routeParam(req.params.jobId));
        res.json(answer);
      } catch (error) {
        next(error);
      }
    },

    /**
     * `POST /v1/jobs/:jobId/requirements/draft`: starts a draft of the job's
     * requirements. It needs no body.
     *
     * The answer is 202, "accepted": the run is saved and its work item is in
     * the queue, but the list is not drafted yet. The API does not wait for
     * the worker. 409 when the job is not a draft any more or a draft is
     * already running, 503 when the queue cannot be reached.
     */
    startDraft: async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.tenantId) {
          throw new UnauthorizedError();
        }

        const jobId = routeParam(req.params.jobId);
        const draft = await requirementService.startDraft(req.tenantId, req.requestId, jobId);
        // IDs only. `jobId` is the job's own ID here: the service found the job with it.
        req.log.info("requirements draft queued", { jobId, workRunId: draft.id });
        res.status(202).json({ draft });
      } catch (error) {
        next(error);
      }
    },
  };
}
