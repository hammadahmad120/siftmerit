// Drafts the requirements of one job, saves them and prints them. Run from
// the repo root:
//
//   npm run requirements:try -- --company test-acme --job <the job's ID>
//
// A development tool. It runs the same function the worker will run for HR's
// "Draft requirements" click, without the queue: our settings -> the job's
// row -> the wrapper in core -> OpenAI -> the check by code -> the job's list
// swapped in one step. Each run costs about a twentieth of a cent, booked on
// the company named.
//
// The job's ID is the last part of the job page's address: /jobs/<ID>.
//
// It uses plain prints for its result, as the other scripts do. The wrapper's
// own log line goes through the logger and holds IDs and numbers only.

import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import {
  AiCallError,
  AiCallRepository,
  aiEnvShape,
  createAiCaller,
  createLogger,
  createSecretClient,
  databaseEnvShape,
  DatabaseError,
  draftRequirements,
  JobRepository,
  JobRequirementRepository,
  loadSettings,
  sharedEnvSchema,
  type DraftRefusal,
  type IfSilent,
  type RequirementKind,
} from "@siftmerit/core";
import { z } from "zod";
import { TenantRepository } from "../repositories/tenant.repository.js";

const USAGE = `Usage:
  npm run requirements:try -- --company <short name> --job <job ID>

  --company  the short name of the company the job belongs to. Use the test company.
  --job      the job's ID: the last part of the job page's address.`;

// This script's own settings: the database and the AI. It does not need the
// API's port, CORS or sign-in settings.
const settingsSchema = sharedEnvSchema.extend({ ...databaseEnvShape, ...aiEnvShape });

const KIND_WORDS: Record<RequirementKind, string> = {
  must: "must-have",
  preferred: "preferred",
  nice: "nice to have",
};

const IF_SILENT_WORDS: Record<IfSilent, string> = {
  ask: "ask the candidate",
  missing: "count as missing",
};

const REFUSAL_WORDS: Record<DraftRefusal, string> = {
  empty: "the list was empty",
  too_many: "the list had too many requirements",
  too_long: "a requirement was too long",
};

function printRow(label: string, value: string | number | null): void {
  console.log(`  ${label.padEnd(22)} ${value ?? "(empty)"}`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      company: { type: "string" },
      job: { type: "string" },
    },
  });
  if (!values.company || !values.job) {
    console.error(USAGE);
    process.exit(1);
  }
  // Text that is no ID is refused here: Postgres would answer it with an error.
  if (!z.uuid().safeParse(values.job).success) {
    console.error(`"${values.job}" is not a job ID.`);
    process.exit(1);
  }

  const env = loadSettings("requirements:try", settingsSchema);
  const db = createSecretClient(env);
  const logger = createLogger({ service: "requirements-try", level: env.LOG_LEVEL, style: "readable" });

  const tenant = await new TenantRepository(db).findBySlug(values.company);
  if (!tenant) {
    console.error(`No company has the short name "${values.company}".`);
    process.exit(1);
  }

  const traceId = `requirements-try-${randomUUID().slice(0, 8)}`;
  console.log(
    `Calling ${env.AI_MODEL_REQUIREMENTS} (thinking: ${env.AI_THINKING_REQUIREMENTS}) for ${tenant.name}...\n`,
  );

  try {
    const result = await draftRequirements(
      {
        ai: createAiCaller({ db, env, logger }),
        jobs: new JobRepository(db),
        requirements: new JobRequirementRepository(db),
      },
      { tenantId: tenant.id, jobId: values.job, traceId },
    );

    if (result.outcome === "job_not_found") {
      console.error(`${tenant.name} has no job with this ID. No AI call was made.`);
      process.exit(1);
    }
    if (result.outcome === "job_not_draft") {
      console.error("This job is not a draft any more, so its list was not changed.");
      process.exit(1);
    }

    if (result.outcome === "refused") {
      console.log(`\nThe list was refused by the check: ${REFUSAL_WORDS[result.why]}. Nothing was saved.`);
    } else {
      const musts = result.requirements.filter((requirement) => requirement.kind === "must").length;
      console.log(`\nSaved ${result.requirements.length} requirements, ${musts} of them must-have:\n`);
      result.requirements.forEach((requirement, index) => {
        const place = String(index + 1).padStart(2);
        console.log(`  ${place}. ${requirement.text}`);
        console.log(`      ${KIND_WORDS[requirement.kind]} · silent CV: ${IF_SILENT_WORDS[requirement.ifSilent]}`);
      });
    }
  } catch (error) {
    if (!(error instanceof AiCallError)) throw error;
    console.log(`\nNo list was saved. Result: ${error.result}. Reason: ${error.code}.`);
    // The library's own message can repeat what we sent, so it is shown in development only.
    if (env.NODE_ENV === "development" && error.cause instanceof Error) {
      console.log(`The library said: ${error.cause.message}`);
    }
  }

  const [row] = await new AiCallRepository(db).listNewest(tenant.id, 1);
  if (!row || row.trace_id !== traceId) {
    console.log("\nThe cost log has no row for this call. Look at the error line above.");
    process.exit(1);
  }

  console.log("\nIts row in the cost log (ai_calls):");
  printRow("Purpose", row.purpose);
  printRow("Model", `${row.provider} ${row.model}`);
  printRow("Thinking", row.thinking);
  printRow("Tokens in", row.input_tokens);
  printRow("Tokens out", row.output_tokens);
  printRow("  of these thinking", row.thinking_tokens);
  printRow("Cost in dollars", Number(row.cost_usd).toFixed(6));
  printRow("Result", row.result);
  printRow("Why it failed", row.error);
  printRow("Took (ms)", row.duration_ms);
  printRow("Trace ID", row.trace_id);
}

main().catch((error: unknown) => {
  // Reached for a bad command line, a bad setting or a database error.
  console.error(error instanceof Error ? error.message : error);
  if (error instanceof DatabaseError && process.env.NODE_ENV !== "production") {
    console.error(`Database said: ${error.rawMessage}`);
  }
  process.exit(1);
});
