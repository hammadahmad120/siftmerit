import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "../lib/errors.js";
import { demoRunRequestSchema, type DemoWorkService } from "../services/demo-work.service.js";

/**
 * The demo work addresses. It gives back a group of functions, one per
 * address, which is the shape every controller with more than one address
 * uses.
 *
 * Both need a signed-in user: `req.tenantId` is set by the two sign-in steps
 * that run before. The company is never read from the request.
 */
export function createDemoWorkController(demoWorkService: DemoWorkService) {
  return {
    /**
     * `POST /v1/demo-work`: starts one demo run for the user's company. The
     * body may hold `{ "mode": ... }`, one word from a fixed list that says
     * how the run should behave; without it the run simply works. A body with
     * anything else in `mode` is answered 400.
     *
     * The answer is 202, "accepted": the run is saved and its work item is in
     * the queue, but the work is not done yet. The API does not wait for the
     * worker.
     */
    startRun: async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.tenantId) {
          throw new UnauthorizedError();
        }

        // `req.body` is undefined when the request has no JSON body.
        const request = demoRunRequestSchema.parse(req.body ?? {});

        const run = await demoWorkService.startRun(req.tenantId, req.requestId, request);
        req.log.info("work run queued", { workRunId: run.id, mode: request.mode });
        res.status(202).json({ run });
      } catch (error) {
        next(error);
      }
    },

    /** `GET /v1/demo-work`: the company's newest demo runs, read from Postgres. */
    listRuns: async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.tenantId) {
          throw new UnauthorizedError();
        }

        const runs = await demoWorkService.listRuns(req.tenantId);
        res.json({ runs });
      } catch (error) {
        next(error);
      }
    },
  };
}
