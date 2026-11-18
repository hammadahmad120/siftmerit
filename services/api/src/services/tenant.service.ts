import { NotFoundError } from "../lib/errors.js";
import type { TenantRepository } from "../repositories/tenant.repository.js";

/** What the web app may know about a company. */
export type TenantSummary = {
  id: string;
  name: string;
  slug: string;
};

export class TenantService {
  constructor(private readonly tenants: TenantRepository) {}

  /** `tenantId` must come from the sign-in check, never from the request. */
  async getSummary(tenantId: string): Promise<TenantSummary> {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) {
      throw new NotFoundError("Company not found", "tenant_not_found");
    }
    return { id: tenant.id, name: tenant.name, slug: tenant.slug };
  }
}
