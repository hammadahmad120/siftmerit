import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Every table that holds company data. A new such table adds its name here,
 * and its repository reaches it only through `forTenant` below.
 *
 * `tenants` and `tenant_members` are not in the list on purpose: they are the
 * company itself and the lookup that finds a user's company, so they have no
 * company filter to add.
 */
export type TenantTable = "ai_calls" | "job_requirements" | "jobs" | "work_runs";

/**
 * Every database function our code may call. Each one takes the company's ID
 * as `p_tenant_id` and uses it in every statement it runs, so it only ever
 * touches rows of that company. A new function adds its name here, and its
 * repository calls it only through `forTenant(...).call` below.
 */
export type TenantFunction =
  | "add_job_requirement"
  | "change_job_requirement"
  | "remove_job_requirement"
  | "replace_job_requirements";

type Values = Record<string, unknown>;

/**
 * The one door to a company's rows.
 *
 * The API and the worker use the secret key, which goes past the database's
 * row rules and can read every company's rows. So our code is what keeps
 * companies apart, and one forgotten `tenant_id` filter would show a user
 * another company's data. With this helper a repository function never writes
 * that filter by hand, so it cannot forget it:
 *
 *   const company = forTenant(db, tenantId);
 *   company.select("jobs", "id, title").eq("id", jobId).maybeSingle();
 *
 * - `select`, `update` and `delete` always add "where tenant_id = this company".
 * - `insert` always sets `tenant_id` to this company, whatever the values say.
 * - `update` refuses to change `tenant_id`: a row never moves to another company.
 * - `call` runs a database function and always hands it this company as
 *   `p_tenant_id`, whatever the arguments say.
 *
 * Each function gives back the Supabase library's own query, so the caller
 * goes on as usual with `.eq(...)`, `.order(...)`, `.single()` and so on.
 * Filters added later only narrow the result further; they cannot widen it
 * past the company.
 *
 * `tenantId` must come from the sign-in check (in the API) or from a checked
 * work item (in the worker), never from a request.
 */
export function forTenant(db: SupabaseClient, tenantId: string) {
  if (tenantId.trim() === "") {
    throw new Error("forTenant was called without a company ID");
  }

  return {
    /**
     * Reads rows of this company only. `Columns` keeps the exact column list
     * the caller wrote, which the Supabase library needs to type the result.
     */
    select: <Columns extends string>(table: TenantTable, columns: Columns) =>
      db.from(table).select(columns).eq("tenant_id", tenantId),

    /** Adds one row to this company. */
    insert: (table: TenantTable, values: Values) =>
      db.from(table).insert({ ...values, tenant_id: tenantId }),

    /** Changes rows of this company only. */
    update: (table: TenantTable, changes: Values) => {
      if ("tenant_id" in changes) {
        throw new Error(`A row of ${table} cannot be moved to another company`);
      }
      return db.from(table).update(changes).eq("tenant_id", tenantId);
    },

    /** Removes rows of this company only. */
    delete: (table: TenantTable) => db.from(table).delete().eq("tenant_id", tenantId),

    /**
     * Runs a database function for this company. A function does several
     * steps as one: all of them happen or none does. It goes past the filter
     * the four doors above add, so the function itself must keep to the
     * company it is given; see `TenantFunction`.
     */
    call: (fn: TenantFunction, args: Values) => db.rpc(fn, { ...args, p_tenant_id: tenantId }),
  };
}
