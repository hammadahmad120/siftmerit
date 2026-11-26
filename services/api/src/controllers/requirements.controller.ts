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
     * `GET /v1/jobs/:jobId/requirements`: the job's requirements, in the
     * order of the list. A job with none yet answers with an empty list. A
     * job that is not the company's: 404.
     */
    list: async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.tenantId) {
          throw new UnauthorizedError();
        }

        const requirements = await requirementService.list(
          req.tenantId,
          routeParam(req.params.jobId),
        );
        res.json({ requirements });
      } catch (error) {
        next(error);
      }
    },
  };
}
