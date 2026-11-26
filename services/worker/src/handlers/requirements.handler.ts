import {
  AiCallError,
  draftRequirements,
  NoMoreTriesError,
  REQUIREMENTS_QUEUE_NAME,
  requirementsWorkItemSchema,
  type DraftRequirementsDeps,
  type Logger,
  type QueuedRequirementsWorkItem,
  type WorkRunError,
  type WorkRunRepository,
} from "@siftmerit/core";

/**
 * What to do with a try that threw: whether another try can help, and the
 * word the run gets when no try is left.
 *
 * Tried again: the AI service was slow, said "slow down" or had an error of
 * its own, and anything else that went wrong on the way, such as the
 * database. A later try can find them well again.
 *
 * Not tried again: our key was refused, which a second try cannot cure, and
 * an answer that was broken, cut off or held back by the model. Those answers
 * were paid for, so HR decides with a click whether to pay again.
 */
function planFor(error: unknown): { tryAgain: boolean; word: WorkRunError } {
  if (!(error instanceof AiCallError)) return { tryAgain: true, word: "work_failed" };
  if (error.code === "bad_key") return { tryAgain: false, word: "ai_setup" };
  if (error.result === "wrong_answer") return { tryAgain: false, word: "bad_draft" };
  return { tryAgain: true, word: "ai_unavailable" };
}

/**
 * Runs one try of a requirements draft and keeps its run's row in Postgres in
 * step:
 *
 * - `running` when the try starts;
 * - `done` when the new list is saved;
 * - back to `waiting` when it threw and a later try will follow;
 * - `failed`, with a short fixed word for why, when no list will come.
 *
 * The item holds IDs only. The job's title and description are read from
 * Postgres by the job's ID, inside `draftRequirements`.
 *
 * It is safe to run twice. A run that is already done or failed is left
 * alone: the item is skipped and no AI call is made. One gap is accepted: a
 * worker that dies after the list is saved and before the run is marked done
 * makes the next try draft again. The job still ends with one whole list; it
 * costs one more call.
 *
 * When this function throws, the queue counts the try as failed and plans
 * the next one, unless the error is a `NoMoreTriesError`. It returns normally
 * when the work reached its end, also when that end is "no list": an empty or
 * unusable list, or a job that is not a draft any more. The queue has nothing
 * more to do with such an item.
 */
export async function runRequirementsWorkItem(
  queued: QueuedRequirementsWorkItem,
  deps: { logger: Logger; workRuns: WorkRunRepository; draft: DraftRequirementsDeps },
): Promise<void> {
  // An item comes from Redis, not from our own memory, so its shape is
  // checked before it is used. A wrong shape never becomes right, so it is
  // not tried again. The message names no field values.
  const parsed = requirementsWorkItemSchema.safeParse(queued.data);
  if (!parsed.success) {
    throw new NoMoreTriesError("The requirements work item does not have the expected shape");
  }
  const { workRunId, tenantId, jobId, requestId } = parsed.data;

  // Every line about this item carries the item's own ID, its run's ID, the
  // ID of the API request that queued it, the company and the job.
  const log = deps.logger.child({ workItemId: queued.id, workRunId, requestId, tenantId, jobId });

  // `attemptsMade` counts the tries that already failed, so this try is one more.
  const attempt = queued.attemptsMade + 1;
  const allowed = queued.opts.attempts ?? 1;

  const started = await deps.workRuns.markRunning(tenantId, workRunId, attempt);
  if (!started) {
    // The run is already done or failed, or it is gone with its job. Doing
    // the work again would pay for a second call.
    log.warn("work item skipped: its run is already finished or gone", {
      queue: REQUIREMENTS_QUEUE_NAME,
    });
    return;
  }

  const startedAt = Date.now();
  log.info("work item started", { queue: REQUIREMENTS_QUEUE_NAME, attempt, allowed });

  let result;
  try {
    // The run's ID is the trace ID, so the call's row in the cost log is
    // found by the same ID as the log lines here.
    result = await draftRequirements(deps.draft, { tenantId, jobId, traceId: workRunId });
  } catch (error) {
    // The row is updated here, before the error is handed to the queue, so
    // the row is right before the queue plans the next try.
    const plan = planFor(error);
    if (!plan.tryAgain) {
      await deps.workRuns.markFailed(tenantId, workRunId, plan.word);
      throw new NoMoreTriesError(error instanceof Error ? error.message : "The draft failed");
    }
    if (attempt >= allowed) {
      await deps.workRuns.markFailed(tenantId, workRunId, plan.word);
    } else {
      await deps.workRuns.markWaitingForRetry(tenantId, workRunId);
    }
    throw error;
  }

  if (result.outcome === "drafted") {
    await deps.workRuns.markDone(tenantId, workRunId);
    // A count, never the requirements themselves.
    log.info("work item done", {
      queue: REQUIREMENTS_QUEUE_NAME,
      attempt,
      durationMs: Date.now() - startedAt,
      requirements: result.requirements.length,
    });
    return;
  }

  // The work reached its end without a list. Each case gets its own word, so
  // the job's page can tell HR what happened.
  let word: WorkRunError = "bad_draft";
  if (result.outcome === "job_not_draft") word = "job_not_draft";
  // The job is gone, and its runs go with it. If the row is still there, it gets this word.
  if (result.outcome === "job_not_found") word = "work_failed";
  if (result.outcome === "refused" && result.why === "empty") word = "no_requirements";

  await deps.workRuns.markFailed(tenantId, workRunId, word);
  log.warn("work item ended without a list", {
    queue: REQUIREMENTS_QUEUE_NAME,
    attempt,
    durationMs: Date.now() - startedAt,
    outcome: result.outcome,
    why: result.outcome === "refused" ? result.why : undefined,
    runError: word,
  });
}
