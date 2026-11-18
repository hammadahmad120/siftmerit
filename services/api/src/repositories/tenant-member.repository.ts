import type { SupabaseClient } from "@supabase/supabase-js";
import { toDatabaseError } from "../lib/errors.js";

export type TenantRole = "owner" | "member";

export type TenantMemberRow = {
  tenant_id: string;
  user_id: string;
  role: TenantRole;
};

/**
 * Which sign-in account belongs to which company. Copied from InstantBot and
 * cut down.
 *
 * `findByUserId` is the one lookup in the product that does not filter by
 * tenant_id: it is how a user's tenant_id is found in the first place.
 */
export class TenantMemberRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findByUserId(userId: string): Promise<TenantMemberRow | null> {
    const { data, error } = await this.db
      .from("tenant_members")
      .select("tenant_id, user_id, role")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw toDatabaseError("tenant_members find by user", error);
    return data;
  }

  async insert(input: { tenantId: string; userId: string; role: TenantRole }): Promise<void> {
    const { error } = await this.db.from("tenant_members").insert({
      tenant_id: input.tenantId,
      user_id: input.userId,
      role: input.role,
    });

    if (error) throw toDatabaseError("tenant_members insert", error);
  }
}
