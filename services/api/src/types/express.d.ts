import type { Logger } from "@siftmerit/core";
import type { TenantRole } from "../repositories/tenant-member.repository.js";

// Tells TypeScript what our middleware adds to a request.
declare global {
  namespace Express {
    interface Request {
      /** ID made for this one request. Also sent back as `x-request-id`. */
      requestId: string;
      /** Logger that adds `requestId` to every line it prints. */
      log: Logger;
      /** The signed-in user's ID. Set by the sign-in check. */
      userId?: string;
      /** The user's company. Set from `tenant_members`, never from the request. */
      tenantId?: string;
      /** The user's role in that company. Nothing is restricted by it yet. */
      tenantRole?: TenantRole;
    }
  }
}

export {};
