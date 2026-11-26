"use client";

import { useEffect, useState } from "react";
import {
  apiFailureMessage,
  getRequirements,
  type IfSilent,
  type Requirement,
  type RequirementKind,
} from "@/lib/api";

/** The answer of `GET /v1/jobs/<id>/requirements`: still on its way, arrived or failed. */
type RequirementsState =
  | { kind: "loading" }
  | { kind: "ok"; requirements: Requirement[] }
  | { kind: "failed"; message: string };

/** The three groups, in the order they are shown, with the heading of each. */
const GROUPS: { kind: RequirementKind; heading: string }[] = [
  { kind: "must", heading: "Must-have" },
  { kind: "preferred", heading: "Preferred" },
  { kind: "nice", heading: "Nice to have" },
];

/** The words on the small label of a requirement. */
const IF_SILENT_LABELS: Record<IfSilent, string> = {
  ask: "Ask the candidate",
  missing: "Count as missing",
};

/** One group of the list: its heading, how many it holds, and its requirements. */
function RequirementGroup({ heading, requirements }: { heading: string; requirements: Requirement[] }) {
  return (
    <div className="mt-5">
      <h3 className="text-sm font-medium">
        {heading} <span className="font-normal text-brand-light-navy">({requirements.length})</span>
      </h3>
      <ul className="mt-2 divide-y divide-brand-navy/10 border-y border-brand-navy/10">
        {requirements.map((requirement) => (
          <li
            key={requirement.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5"
          >
            {/* Plain text, never HTML: React writes the text out as it is. */}
            <span className="min-w-0 text-sm break-words">{requirement.text}</span>
            <span className="shrink-0 rounded-full border border-brand-navy/30 px-2.5 py-0.5 text-xs text-brand-light-navy">
              {IF_SILENT_LABELS[requirement.ifSilent]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The "Requirements" section of a job's page: the job's requirements in three
 * groups, must-have first. Each line carries a small label that says what a
 * CV that is silent on it means.
 *
 * It only shows the list. The button that drafts it, and editing and
 * confirming, come with later steps.
 *
 * Like the job itself, the list is asked for inside the signed-in user's
 * company only; the API answers "not found" for another company's job.
 */
export function JobRequirements({ jobId }: { jobId: string }) {
  const [state, setState] = useState<RequirementsState>({ kind: "loading" });

  useEffect(() => {
    // If the page is left before the answer arrives, the answer is dropped.
    let left = false;

    getRequirements(jobId)
      .then((answer) => {
        if (!left) setState({ kind: "ok", requirements: answer.requirements });
      })
      .catch((error: unknown) => {
        if (!left) setState({ kind: "failed", message: apiFailureMessage(error) });
      });

    return () => {
      left = true;
    };
  }, [jobId]);

  return (
    <section className="mt-6 max-w-3xl rounded-xl border border-brand-navy/15 bg-white p-5">
      <h2 className="font-medium">Requirements</h2>
      <RequirementsBody state={state} />
    </section>
  );
}

/** What stands under the heading, for each state of the answer. */
function RequirementsBody({ state }: { state: RequirementsState }) {
  if (state.kind === "loading") {
    return <p className="mt-3 text-sm text-brand-light-navy">Loading the requirements...</p>;
  }

  if (state.kind === "failed") return <p className="mt-3 text-sm text-red-700">{state.message}</p>;

  const { requirements } = state;

  if (requirements.length === 0) {
    return <p className="mt-3 text-sm text-brand-light-navy">No requirements yet.</p>;
  }

  const hasMust = requirements.some((requirement) => requirement.kind === "must");

  return (
    <>
      <p className="mt-1 text-sm text-brand-light-navy">
        The label on each line says what happens when a CV says nothing about it.
      </p>

      {hasMust ? null : (
        // `role="status"` makes a screen reader read the line when it appears.
        <p role="status" className="mt-3 text-sm">
          No must-have yet. A list needs at least one before it can be confirmed.
        </p>
      )}

      {GROUPS.map((group) => {
        const inGroup = requirements.filter((requirement) => requirement.kind === group.kind);
        // A group with nothing in it is left out.
        if (inGroup.length === 0) return null;
        return <RequirementGroup key={group.kind} heading={group.heading} requirements={inGroup} />;
      })}
    </>
  );
}
