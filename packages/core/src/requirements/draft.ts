// The requirements draft: the AI reads a job's advert and lists what the
// employer requires of a candidate, each with its kind and its "silent CV"
// mark. The list replaces the job's old one. HR edits and confirms it later;
// nothing here reads a CV.
//
// Three pieces, in the order they are used:
//
//   INSTRUCTIONS       our words to the model
//   checkDraft         the check by code, run on the model's answer
//   draftRequirements  reads the job, makes the call, saves the list
//
// The examples inside the instructions are made up on purpose. None of them
// is a line of the two adverts in `test-set/jobs/`: the eval measures the
// draft on those adverts, and an advert the model was shown the answer for
// measures nothing.

import { z } from "zod";
import { AiCallError, type AiCaller } from "../ai/call.js";
import {
  IF_SILENT_MARKS,
  REQUIREMENT_KINDS,
  REQUIREMENT_TEXT_MAX,
  REQUIREMENTS_MAX,
  type JobRequirementRepository,
  type NewRequirement,
} from "../job-requirements.repository.js";
import type { JobRepository } from "../jobs.repository.js";

/** How many the model is asked for at most. Lower than the limit above, to leave room. */
const REQUIREMENTS_ASKED_MAX = 25;

/** The cap on the answer's length. 30 requirements of a sentence each are about 2,000 tokens. */
const MAX_OUTPUT_TOKENS = 3_000;

const INSTRUCTIONS = `You read a job advert and list what the employer requires of a candidate. You are given the job's title and the advert.

WHAT COUNTS AS A REQUIREMENT
- A requirement is something the advert asks of the candidate: experience, a skill, a tool, a qualification, a language, a location, a document such as a portfolio.
- The duties of the job, the text about the company and the benefits are not requirements.
- Only when the advert has no list of what it asks of the candidate: derive a few concrete requirements from the duties.
- Never add a requirement the advert does not ask for. Write each requirement once.
- If the text is not a job advert, give an empty list.

STEP 1: SPLIT A LINE THAT HOLDS TWO SKILLS
Go through the advert's lines one by one. Most lines become one requirement. A line becomes two requirements when it joins two different skills with "and", wants both, and a person can well have one without the other. This is most often two programming languages, two spoken languages, or a skill joined to a separate qualification.
- "Strong Java and experience with React or Angular" becomes "Strong Java" and "Experience with React or Angular".
- "Fluent German and a clean driving licence" becomes "Fluent German" and "A clean driving licence".
- In a line of the shape "A and B or C", A is one requirement and "B or C" is the other.
Do not split in these cases:
- Alternatives, where any one of them is enough: "SAP, Oracle or QuickBooks" stays one requirement.
- One skill area named with its examples or its parts: "Experience with month-end closing, reconciliations and financial reporting" stays one requirement. So does a line about connecting, using or managing a list of systems.
- A list of tools that follows "such as" or "like".
- A line with a condition inside it: "A teaching licence and at least two of the subjects mathematics, physics or chemistry" stays one requirement.

STEP 2: WRITE EACH REQUIREMENT
- One short phrase, at most about 200 characters, in the language of the advert, worded the way adverts word them: "5 or more years of sales experience". Do not start with "Have", "Be" or "Must".
- Keep the advert's own specifics: numbers, names of tools, places.
- A range of years is a minimum: "5-8 years" is written as "5 or more years".
- Keep the order of the advert. Give at most ${REQUIREMENTS_ASKED_MAX} requirements.

STEP 3: kind, HOW MUCH THE REQUIREMENT COUNTS
- "must": must-have. A candidate who misses it is rejected and never seen by the employer.
- "preferred": strongly wanted.
- "nice": nice to have, an extra.
How to choose:
- Clear words about one single line decide. "must have", "mandatory", "essential": must. "preferred", "ideally", "desirable": preferred. "a plus", "nice to have", "bonus": nice.
- A heading over the whole list, such as "Requirements" or "Required skills", does not make every line a must.
- Words of strength, such as "strong", "solid", "hands-on", "excellent" or "proven", do not make a line a must.
- Without clear words, "must" is only for these: the years of experience asked for, the one or two core skills the job's title names, a degree, a portfolio or a licence the advert requires, and the location or the right to work.
- Every other skill, tool, product or method the advert asks for is "preferred", also when it is important. Skills at the edge of the job are "nice".
- A soft skill (communication, presenting, mindset, teamwork, ownership) is "nice", unless the advert says in clear words that it is a must.
- When you are unsure between "must" and "preferred", choose "preferred". Most adverts have three to five musts.

STEP 4: ifSilent, WHAT A CV THAT SAYS NOTHING ABOUT THE REQUIREMENT MEANS
- "ask": people often leave it off a CV and one question settles it: a city or country, a language, a soft skill, a portfolio or its link, availability.
- "missing": a CV must show it: a skill, a tool, the years of experience, a domain, a degree.`;

/**
 * The form of the model's answer. OpenAI is made to fill exactly this (its
 * "strict" form), and the wrapper checks the answer against it again. The
 * strict form has no rule for a text's length or a list's size, so those are
 * checked by `checkDraft`.
 */
const draftAnswerSchema = z.object({
  requirements: z.array(
    z.object({
      text: z.string(),
      kind: z.enum(REQUIREMENT_KINDS),
      ifSilent: z.enum(IF_SILENT_MARKS),
    }),
  ),
});

type DraftAnswer = z.infer<typeof draftAnswerSchema>;

/**
 * Why a drafted list was refused.
 *
 *   empty     no requirement was found: the text was most likely not a job advert
 *   too_many  more than `REQUIREMENTS_MAX` requirements
 *   too_long  a requirement of more than `REQUIREMENT_TEXT_MAX` characters:
 *             a pasted piece of the advert, not a requirement
 */
export type DraftRefusal = "empty" | "too_many" | "too_long";

/** Postgres cannot store this character in a text column. */
const NUL = /\u0000/g;

/**
 * The check by code on a drafted list. It tidies the list and then accepts
 * or refuses the whole of it.
 *
 * Tidied: spaces around a text go and several spaces inside become one; an
 * empty text is dropped; a text that is already in the list is dropped, and
 * capital letters do not make a text different.
 *
 * Refused: see `DraftRefusal`. A list with no must-have is accepted: the
 * draft is a first guess, and confirming such a list is refused later.
 */
export function checkDraft(
  answer: DraftAnswer,
): { ok: true; requirements: NewRequirement[] } | { ok: false; why: DraftRefusal } {
  const seen = new Set<string>();
  const requirements: NewRequirement[] = [];

  for (const item of answer.requirements) {
    const text = item.text.replace(NUL, "").replace(/\s+/g, " ").trim();
    const key = text.toLowerCase();
    if (text === "" || seen.has(key)) continue;
    seen.add(key);
    requirements.push({ text, kind: item.kind, ifSilent: item.ifSilent });
  }

  if (requirements.length === 0) return { ok: false, why: "empty" };
  if (requirements.length > REQUIREMENTS_MAX) return { ok: false, why: "too_many" };
  if (requirements.some((requirement) => requirement.text.length > REQUIREMENT_TEXT_MAX)) {
    return { ok: false, why: "too_long" };
  }
  return { ok: true, requirements };
}

/**
 * How a draft ended.
 *
 *   drafted        the new list is saved, and here it is
 *   job_not_found  this company has no such job. No AI call was made
 *   job_not_draft  the job's requirements are confirmed already. Nothing was
 *                  saved. Usually no AI call was made; only when the job was
 *                  confirmed during the call was one paid for
 *   refused        the model's list did not pass the check by code. The call
 *                  was paid for and nothing was saved
 */
export type DraftRequirementsResult =
  | { outcome: "drafted"; requirements: NewRequirement[] }
  | { outcome: "job_not_found" }
  | { outcome: "job_not_draft" }
  | { outcome: "refused"; why: DraftRefusal };

export type DraftRequirementsDeps = {
  ai: AiCaller;
  jobs: JobRepository;
  requirements: JobRequirementRepository;
};

/**
 * Drafts the requirements of one job and saves them in place of its old list.
 *
 * `tenantId` must come from the sign-in check or from a checked work item,
 * never from a request. `jobId` must have the form of an ID. `traceId` is the
 * ID the call is found by in the logs and in the cost log.
 *
 * It throws an `AiCallError` when the call itself did not give a usable
 * answer (the provider was away or slow, the key is wrong, the answer was cut
 * off). The caller decides whether to try again. A list that the check by
 * code refused is not thrown: it comes back as `refused`, with the reason.
 *
 * It is safe to run twice: the second run pays for a second call and saves
 * its list in place of the first.
 */
export async function draftRequirements(
  deps: DraftRequirementsDeps,
  input: { tenantId: string; jobId: string; traceId: string },
): Promise<DraftRequirementsResult> {
  const job = await deps.jobs.findById(input.tenantId, input.jobId);
  if (!job) return { outcome: "job_not_found" };
  // Checked before the call, so no money is spent on a list that cannot be saved.
  if (job.status !== "draft") return { outcome: "job_not_draft" };

  // The wrapper's check answers only yes or no. The reason for a no is kept
  // here, so it can be told to HR.
  const refused: { why: DraftRefusal | null } = { why: null };
  let answer: DraftAnswer;

  try {
    answer = await deps.ai.call({
      purpose: "requirements",
      tenantId: input.tenantId,
      jobId: input.jobId,
      traceId: input.traceId,
      instructions: INSTRUCTIONS,
      // Typed by HR, so still text from outside: it goes in as data, between
      // the markers, and never into the instructions.
      data: [
        { label: "job_title", text: job.title },
        { label: "job_description", text: job.description },
      ],
      answer: { name: "requirements_draft", schema: draftAnswerSchema },
      check: (given) => {
        const checked = checkDraft(given);
        if (!checked.ok) {
          refused.why = checked.why;
          return null;
        }
        return { requirements: checked.requirements };
      },
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });
  } catch (error) {
    if (error instanceof AiCallError && error.code === "check_failed" && refused.why) {
      return { outcome: "refused", why: refused.why };
    }
    throw error;
  }

  const saved = await deps.requirements.replaceForJob(input.tenantId, input.jobId, answer.requirements);
  if (saved !== "replaced") return { outcome: saved };
  return { outcome: "drafted", requirements: answer.requirements };
}
