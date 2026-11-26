import type { SupabaseClient } from "@supabase/supabase-js";
import { toDatabaseError } from "./database.js";
import { forTenant } from "./tenant-db.js";

/**
 * How much a requirement counts.
 *
 *   must       must-have: a candidate who misses it is dropped
 *   preferred  strongly wanted
 *   nice       nice to have: an extra
 */
export const REQUIREMENT_KINDS = ["must", "preferred", "nice"] as const;
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];

/**
 * What a CV that says nothing about a requirement means.
 *
 *   ask      ask the candidate (a city, a language, a soft skill)
 *   missing  count as missing (a skill, the years, a degree)
 */
export const IF_SILENT_MARKS = ["ask", "missing"] as const;
export type IfSilent = (typeof IF_SILENT_MARKS)[number];

/** The longest a requirement's text may be. The database keeps the same limit. */
export const REQUIREMENT_TEXT_MAX = 500;

/** One requirement of a list that is about to be saved. Its place is its place in the list. */
export type NewRequirement = {
  text: string;
  kind: RequirementKind;
  ifSilent: IfSilent;
};

export type JobRequirementRow = {
  id: string;
  tenant_id: string;
  job_id: string;
  text: string;
  kind: RequirementKind;
  if_silent: IfSilent;
  /** Its place in the list, starting at 1. */
  position: number;
  created_at: string;
  updated_at: string;
};

/**
 * How a swap of a job's list ended.
 *
 *   replaced       the new list is saved
 *   job_not_found  this company has no such job; nothing was changed
 *   job_not_draft  the job's requirements are confirmed already; nothing was changed
 */
export type ReplaceRequirementsResult = "replaced" | "job_not_found" | "job_not_draft";

const REPLACE_RESULTS: readonly string[] = ["replaced", "job_not_found", "job_not_draft"];

const COLUMNS = "id, tenant_id, job_id, text, kind, if_silent, position, created_at, updated_at";

/**
 * The requirements of a job.
 *
 * Company separation: every function takes the company's ID first and reaches
 * the table only through `forTenant`. Reading goes through its `select`,
 * which adds the company filter. The swap goes through its `call`, which
 * hands the company to a database function that uses it in every statement.
 */
export class JobRequirementRepository {
  constructor(private readonly db: SupabaseClient) {}

  /** A job's requirements, in the order of the list. `jobId` must have the form of an ID. */
  async listForJob(tenantId: string, jobId: string): Promise<JobRequirementRow[]> {
    const { data, error } = await forTenant(this.db, tenantId)
      .select("job_requirements", COLUMNS)
      .eq("job_id", jobId)
      .order("position", { ascending: true })
      .order("id", { ascending: true });

    if (error) throw toDatabaseError("job_requirements list for job", error);
    return (data ?? []) as JobRequirementRow[];
  }

  /**
   * Swaps a job's whole list for a new one, in one step: the old rows go and
   * the new ones are saved, or nothing changes at all. A job is never left
   * without its list in between.
   *
   * It only swaps while the job is a draft. The database function checks that
   * in the same step and locks the job's row meanwhile, so the answer is true
   * at the moment of the swap. It is safe to run twice: the second run saves
   * the same list again.
   */
  async replaceForJob(
    tenantId: string,
    jobId: string,
    requirements: NewRequirement[],
  ): Promise<ReplaceRequirementsResult> {
    const { data, error } = await forTenant(this.db, tenantId).call("replace_job_requirements", {
      p_job_id: jobId,
      p_requirements: requirements.map((requirement) => ({
        text: requirement.text,
        kind: requirement.kind,
        ifSilent: requirement.ifSilent,
      })),
    });

    if (error) throw toDatabaseError("job_requirements replace for job", error);
    if (typeof data !== "string" || !REPLACE_RESULTS.includes(data)) {
      throw new Error("replace_job_requirements gave an answer that is not one of its words");
    }
    return data as ReplaceRequirementsResult;
  }
}
