import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "../lib/errors.js";
import { createJobRequestSchema, type JobService } from "../services/job.service.js";

/** Express can hand a part of the address back as one text or as a list. */
function routeParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/**
 * The job addresses. It gives back a group of functions, one per address.
 *
 * All need a signed-in user: `req.userId` and `req.tenantId` are set by the
 * two sign-in steps that run before. The company is never read from the
 * request.
 */
export function createJobsController(jobService: JobService) {
  return {
    /**
     * `POST /v1/jobs`: saves a new job for the user's company. The body holds
     * the title, the description, the subject phrases, the one-time key and,
     * if wanted, the posting date. A body that breaks a limit is answered 400.
     *
     * The answer is 201 with the job. When the same one-time key was already
     * used, nothing new is saved and the answer is 200 with the job that was
     * saved the first time.
     */
    create: async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.userId || !req.tenantId) {
          throw new UnauthorizedError();
        }

        // `req.body` is undefined when the request has no JSON body.
        const request = createJobRequestSchema.parse(req.body ?? {});

        const { job, created } = await jobService.create(req.tenantId, req.userId, request);
        // The log line holds the job's ID only, never its title or text.
        req.log.info(created ? "job created" : "job create repeated", { jobId: job.id });
        res.status(created ? 201 : 200).json({ job });
      } catch (error) {
        next(error);
      }
    },

    /** `GET /v1/jobs`: the company's newest jobs, with the short fields only. */
    list: async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.tenantId) {
          throw new UnauthorizedError();
        }

        const jobs = await jobService.list(req.tenantId);
        res.json({ jobs });
      } catch (error) {
        next(error);
      }
    },

    /** `GET /v1/jobs/:jobId`: one job of the company. Anything else: 404. */
    get: async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.tenantId) {
          throw new UnauthorizedError();
        }

        const job = await jobService.get(req.tenantId, routeParam(req.params.jobId));
        res.json({ job });
      } catch (error) {
        next(error);
      }
    },
  };
}
