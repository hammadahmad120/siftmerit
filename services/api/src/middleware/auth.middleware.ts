import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";
import type { TenantMemberRepository } from "../repositories/tenant-member.repository.js";
import type { AuthService } from "../services/auth.service.js";

// Copied from InstantBot and cut down. The two steps run in this order in
// front of every address that needs a signed-in user.

/**
 * Step 1: who is calling? Reads the token from the `Authorization: Bearer ...`
 * header and checks it. Missing or not valid: 401.
 */
export function createAuthMiddleware(authService: AuthService) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization;
      const accessToken = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
      if (!accessToken) {
        throw new UnauthorizedError("Missing sign-in token");
      }

      const user = await authService.verifyAccessToken(accessToken);
      if (!user) {
        throw new UnauthorizedError("Invalid or expired sign-in token");
      }

      req.userId = user.id;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Step 2: which company? Looks the user up in `tenant_members`. This is the
 * only place a request gets its company from: never from the address, the
 * body or a header. No company: 403.
 */
export function createRequireTenantMiddleware(members: TenantMemberRepository) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.userId) {
        throw new UnauthorizedError();
      }

      const membership = await members.findByUserId(req.userId);
      if (!membership) {
        throw new ForbiddenError("No company for this user", "no_company");
      }

      req.tenantId = membership.tenant_id;
      req.tenantRole = membership.role;
      // From here on, every log line of this request also carries the two IDs.
      req.log = req.log.child({ userId: req.userId, tenantId: req.tenantId });
      next();
    } catch (error) {
      next(error);
    }
  };
}
