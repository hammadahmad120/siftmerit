import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "../lib/errors.js";
import type { DemoWorkService } from "../services/demo-work.service.js";

/**
 * `POST /v1/demo-work`: queues one demo work item for the signed-in user's
 * company. Nothing is read from the request's body.
 *
 * The answer is 202, "accepted": the item is in the queue, but the work is not
 * done yet. The API does not wait for the worker.
 */
export function createDemoWorkController(demoWorkService: DemoWorkService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Set by the two sign-in steps that run before this.
      if (!req.tenantId) {
        throw new UnauthorizedError();
      }

      const workItem = await demoWorkService.queueItem(req.tenantId, req.requestId);
      req.log.info("work item queued", { workItemId: workItem.id });
      res.status(202).json({ workItem });
    } catch (error) {
      next(error);
    }
  };
}
