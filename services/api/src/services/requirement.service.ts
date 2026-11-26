import type {
  IfSilent,
  JobRepository,
  JobRequirementRepository,
  JobRequirementRow,
  RequirementKind,
} from "@siftmerit/core";
import { z } from "zod";
import { NotFoundError } from "../lib/errors.js";

/** What the web app may know about a requirement. The company ID is left out. */
export type RequirementView = {
  id: string;
  text: string;
  /** `must`, `preferred` or `nice`. */
  kind: RequirementKind;
  /** What a CV that says nothing about it means: `ask` or `missing`. */
  ifSilent: IfSilent;
  /** Its place in the list, starting at 1. */
  position: number;
};

function toView(row: JobRequirementRow): RequirementView {
  return {
    id: row.id,
    text: row.text,
    kind: row.kind,
    ifSilent: row.if_silent,
    position: row.position,
  };
}

/**
 * The requirements of a job. For now it only reads the list; starting a
 * draft, editing and confirming come with later steps.
 *
 * `tenantId` must come from the sign-in check, never from the request.
 */
export class RequirementService {
  constructor(
    private readonly jobs: JobRepository,
    private readonly requirements: JobRequirementRepository,
  ) {}

  /**
   * A job's requirements, in the order of the list. A job that has none yet
   * gives an empty list.
   *
   * An ID that does not exist, an ID of another company's job and text that
   * is no ID at all get the same "not found" answer, as for the job itself.
   */
  async list(tenantId: string, jobId: string): Promise<RequirementView[]> {
    if (!z.uuid().safeParse(jobId).success) {
      throw new NotFoundError("This job does not exist.", "job_not_found");
    }

    // Asked side by side: the two do not depend on each other.
    const [job, rows] = await Promise.all([
      this.jobs.findById(tenantId, jobId),
      this.requirements.listForJob(tenantId, jobId),
    ]);
    if (!job) {
      throw new NotFoundError("This job does not exist.", "job_not_found");
    }
    return rows.map(toView);
  }
}
