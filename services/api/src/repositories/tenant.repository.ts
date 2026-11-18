import type { SupabaseClient } from "@supabase/supabase-js";
import { toDatabaseError } from "../lib/errors.js";

export type TenantRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
};

const COLUMNS = "id, name, slug, created_at, updated_at";

/**
 * The company table. Copied from InstantBot and cut down.
 *
 * This table is the company itself, so its rows are found by their own ID or
 * short name, not by a tenant_id column.
 */
export class TenantRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findById(tenantId: string): Promise<TenantRow | null> {
    const { data, error } = await this.db
      .from("tenants")
      .select(COLUMNS)
      .eq("id", tenantId)
      .maybeSingle();

    if (error) throw toDatabaseError("tenants find by id", error);
    return data;
  }

  async findBySlug(slug: string): Promise<TenantRow | null> {
    const { data, error } = await this.db
      .from("tenants")
      .select(COLUMNS)
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw toDatabaseError("tenants find by slug", error);
    return data;
  }

  async insert(input: { name: string; slug: string }): Promise<TenantRow> {
    const { data, error } = await this.db
      .from("tenants")
      .insert({ name: input.name, slug: input.slug })
      .select(COLUMNS)
      .single();

    if (error) throw toDatabaseError("tenants insert", error);
    return data;
  }

  /** Removes a company. Its member rows go with it (the database does that). */
  async deleteById(tenantId: string): Promise<void> {
    const { error } = await this.db.from("tenants").delete().eq("id", tenantId);

    if (error) throw toDatabaseError("tenants delete", error);
  }
}
