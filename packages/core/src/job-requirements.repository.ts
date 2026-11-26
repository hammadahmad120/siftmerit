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

/**
 * The most requirements a job may have. Every requirement is one more tick
 * on every CV. A drafted list longer than this is refused, and HR cannot add
 * a line beyond it.
 */
export const REQUIREMENTS_MAX = 30;

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

/** What HR may change on one requirement. A field that is left out stays as it is. */
export type RequirementChange = {
  text?: string;
  kind?: RequirementKind;
  ifSilent?: IfSilent;
};

/**
 * How adding a requirement ended.
 *
 *   added          the new row is saved, and here it is
 *   job_not_found  this company has no such job
 *   job_not_draft  the job's requirements are confirmed already
 *   too_many       the job has `REQUIREMENTS_MAX` requirements already
 *   duplicate      the job already has a requirement with this text
 */
export type AddRequirementResult =
  | { result: "added"; requirement: JobRequirementRow }
  | { result: "job_not_found" | "job_not_draft" | "too_many" | "duplicate" };

/** How changing a requirement ended. `not_found`: the job has no such requirement. */
export type ChangeRequirementResult =
  | { result: "changed"; requirement: JobRequirementRow }
  | { result: "not_found" | "job_not_found" | "job_not_draft" | "duplicate" };

/** How removing a requirement ended. */
export type RemoveRequirementResult = "removed" | "not_found" | "job_not_found" | "job_not_draft";

/**
 * How confirming a job's requirements ended.
 *
 *   confirmed      the job is open now
 *   job_not_found  this company has no such job
 *   job_not_draft  the requirements are confirmed already
 *   no_must_have   the list has no must-have, so it cannot be confirmed
 */
export type ConfirmRequirementsResult =
  | "confirmed"
  | "job_not_found"
  | "job_not_draft"
  | "no_must_have";

const CONFIRM_RESULTS: readonly string[] = [
  "confirmed",
  "job_not_found",
  "job_not_draft",
  "no_must_have",
];

/**
 * How going back to editing ended. `job_not_open`: the job is a draft
 * already, or it is closed.
 */
export type ReopenRequirementsResult = "reopened" | "job_not_found" | "job_not_open";

const REOPEN_RESULTS: readonly string[] = ["reopened", "job_not_found", "job_not_open"];

/** The small JSON object the three edit functions of the database answer with. */
type EditAnswer = { result?: unknown; requirement?: unknown };

/**
 * Reads the answer of an edit function. `words` are the results the function
 * may give; anything else means the function and this code disagree, which is
 * a fault of ours.
 */
function readEditAnswer(fn: string, data: unknown, words: readonly string[]): EditAnswer & { result: string } {
  const answer = (data ?? {}) as EditAnswer;
  if (typeof answer.result !== "string" || !words.includes(answer.result)) {
    throw new Error(`${fn} gave an answer that is not one of its words`);
  }
  return { ...answer, result: answer.result };
}

const COLUMNS = "id, tenant_id, job_id, text, kind, if_silent, position, created_at, updated_at";

/**
 * The requirements of a job.
 *
 * Company separation: every function takes the company's ID first and reaches
 * the table only through `forTenant`. Reading goes through its `select`,
 * which adds the company filter. Every write goes through its `call`, which
 * hands the company to a database function that uses it in every statement.
 *
 * The writes are database functions because each one is "check the job, then
 * act", and both must happen as one: the function locks the job's row, sees
 * that the job is still a draft, and only then changes the list.
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

  /**
   * Adds one requirement at the end of a job's list. The text must be tidied
   * and checked by the caller. Only while the job is a draft.
   */
  async addForJob(
    tenantId: string,
    jobId: string,
    requirement: NewRequirement,
  ): Promise<AddRequirementResult> {
    const { data, error } = await forTenant(this.db, tenantId).call("add_job_requirement", {
      p_job_id: jobId,
      p_text: requirement.text,
      p_kind: requirement.kind,
      p_if_silent: requirement.ifSilent,
      p_max_count: REQUIREMENTS_MAX,
    });

    if (error) throw toDatabaseError("job_requirements add for job", error);
    const answer = readEditAnswer("add_job_requirement", data, [
      "added",
      "job_not_found",
      "job_not_draft",
      "too_many",
      "duplicate",
    ]);
    if (answer.result === "added") {
      return { result: "added", requirement: answer.requirement as JobRequirementRow };
    }
    return { result: answer.result } as AddRequirementResult;
  }

  /**
   * Changes the text, the kind or the mark of one requirement of a job. A
   * field that is left out stays as it is. Only while the job is a draft.
   * `jobId` and `requirementId` must have the form of an ID.
   */
  async changeForJob(
    tenantId: string,
    jobId: string,
    requirementId: string,
    change: RequirementChange,
  ): Promise<ChangeRequirementResult> {
    const { data, error } = await forTenant(this.db, tenantId).call("change_job_requirement", {
      p_job_id: jobId,
      p_requirement_id: requirementId,
      p_text: change.text ?? null,
      p_kind: change.kind ?? null,
      p_if_silent: change.ifSilent ?? null,
    });

    if (error) throw toDatabaseError("job_requirements change for job", error);
    const answer = readEditAnswer("change_job_requirement", data, [
      "changed",
      "not_found",
      "job_not_found",
      "job_not_draft",
      "duplicate",
    ]);
    if (answer.result === "changed") {
      return { result: "changed", requirement: answer.requirement as JobRequirementRow };
    }
    return { result: answer.result } as ChangeRequirementResult;
  }

  /** Removes one requirement of a job. Only while the job is a draft. */
  async removeForJob(
    tenantId: string,
    jobId: string,
    requirementId: string,
  ): Promise<RemoveRequirementResult> {
    const { data, error } = await forTenant(this.db, tenantId).call("remove_job_requirement", {
      p_job_id: jobId,
      p_requirement_id: requirementId,
    });

    if (error) throw toDatabaseError("job_requirements remove for job", error);
    const answer = readEditAnswer("remove_job_requirement", data, [
      "removed",
      "not_found",
      "job_not_found",
      "job_not_draft",
    ]);
    return answer.result as RemoveRequirementResult;
  }

  /**
   * Confirms a job's requirements: the job goes from draft to open. The
   * database function checks in the same step that the list has a must-have,
   * with the job's row locked, so the last must-have cannot be removed
   * between the check and the confirm.
   */
  async confirmForJob(tenantId: string, jobId: string): Promise<ConfirmRequirementsResult> {
    const { data, error } = await forTenant(this.db, tenantId).call("confirm_job_requirements", {
      p_job_id: jobId,
    });

    if (error) throw toDatabaseError("job_requirements confirm for job", error);
    if (typeof data !== "string" || !CONFIRM_RESULTS.includes(data)) {
      throw new Error("confirm_job_requirements gave an answer that is not one of its words");
    }
    return data as ConfirmRequirementsResult;
  }

  /** Takes a job back from open to draft, so its requirements can be edited again. */
  async reopenForJob(tenantId: string, jobId: string): Promise<ReopenRequirementsResult> {
    const { data, error } = await forTenant(this.db, tenantId).call("reopen_job_requirements", {
      p_job_id: jobId,
    });

    if (error) throw toDatabaseError("job_requirements reopen for job", error);
    if (typeof data !== "string" || !REOPEN_RESULTS.includes(data)) {
      throw new Error("reopen_job_requirements gave an answer that is not one of its words");
    }
    return data as ReopenRequirementsResult;
  }
}
