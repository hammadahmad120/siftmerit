import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "../lib/errors.js";
import type { TenantService } from "../services/tenant.service.js";

/** `GET /v1/me`: who the signed-in user is and which company they belong to. */
export function createMeController(tenantService: TenantService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // All three are set by the two sign-in steps that run before this.
      if (!req.userId || !req.tenantId || !req.tenantRole) {
        throw new UnauthorizedError();
      }

      const tenant = await tenantService.getSummary(req.tenantId);
      res.json({ user: { id: req.userId, role: req.tenantRole }, tenant });
    } catch (error) {
      next(error);
    }
  };
}
