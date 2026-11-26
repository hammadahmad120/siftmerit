"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  addRequirement,
  ApiError,
  apiFailureMessage,
  changeRequirement,
  removeRequirement,
  type NewRequirement,
  type Requirement,
  type RequirementChange,
  type RequirementKind,
} from "@/lib/api";
import { RequirementAdd } from "@/components/requirement-add";
import { ASK_TAG, KIND_CHOICES, RequirementCard } from "@/components/requirement-card";

/** The most requirements a job may have. The API keeps the same limit. */
const REQUIREMENTS_MAX = 30;

/** Each card of a column fades in this much later than the one above it, in milliseconds. */
const FADE_STEP_MS = 60;

/** How long a card is lit after it has moved to another column. */
const LIT_MS = 1600;

/** The top edge of each column: the must-haves weigh most, the nice-to-haves least. */
const COLUMN_EDGE: Record<RequirementKind, string> = {
  must: "border-t-brand-navy",
  preferred: "border-t-brand-navy/45",
  nice: "border-t-brand-navy/20",
};

/**
 * Changes the page with `apply` and lets the browser draw what moved: every
 * card glides from its old place to its new one (a "view transition").
 * `apply` must have drawn the new page by the time it returns, which is what
 * `flushSync` is for. Where the browser cannot do this, or the person asked
 * the computer for less motion, the page simply changes.
 */
function drawTheMove(apply: () => void): void {
  const lessMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!lessMotion && typeof document.startViewTransition === "function") {
    document.startViewTransition(apply);
  } else {
    apply();
  }
}

/**
 * The sentence HR reads when a change was not saved. A refusal the API
 * expects (the text is already in the list, the list is full) is its own
 * plain sentence. Anything else gets the usual line with the request ID.
 */
function whyNotSaved(error: unknown): string {
  if (error instanceof ApiError && (error.status === 409 || error.status === 400)) {
    return error.message;
  }
  return apiFailureMessage(error);
}

/**
 * A job's requirements as a board of three columns: must-have, preferred,
 * nice to have. The column a card stands in is how much the requirement
 * counts, so no card has to say it, and the heading of a column says once
 * what its kind does. Inside a column the cards keep the order of the job
 * description.
 *
 * With `canEdit`, HR changes the list here, and every change is saved at
 * once. The board changes first and the API is called after; if the API
 * refuses, that one change is taken back and the card says why.
 *
 * A card whose kind changes moves to another column. It does not vanish and
 * reappear: the browser draws the move, so the card glides across and is lit
 * for a moment where it lands (see `drawTheMove`).
 *
 * `onChange` hands the board's owner a function that makes the new list from
 * the current one. A function, not a list, because an answer from the API
 * can arrive after another change was made.
 */
export function RequirementList(props: {
  jobId: string;
  requirements: Requirement[];
  canEdit: boolean;
  onChange: (update: (current: Requirement[]) => Requirement[]) => void;
}) {
  const { jobId, requirements, canEdit, onChange } = props;

  // The card that just moved to another column.
  const [landedId, setLandedId] = useState<string | null>(null);
  const litTimer = useRef<number | undefined>(undefined);

  // When the page is left, the timer may not fire any more.
  useEffect(() => {
    return () => window.clearTimeout(litTimer.current);
  }, []);

  /** Puts one requirement's new values on the board. With `glide` the browser draws the move. */
  function put(requirementId: string, values: Partial<Requirement>, glide: boolean) {
    const apply = () =>
      onChange((current) =>
        current.map((item) => (item.id === requirementId ? { ...item, ...values } : item)),
      );
    if (!glide) {
      apply();
      return;
    }
    drawTheMove(() => flushSync(apply));
  }

  /** One change to one requirement: shown at once, then saved. Answers `null`, or why it was not saved. */
  async function change(requirement: Requirement, edit: RequirementChange): Promise<string | null> {
    const moves = edit.kind !== undefined;
    put(requirement.id, edit, moves);
    if (moves) {
      setLandedId(requirement.id);
      window.clearTimeout(litTimer.current);
      litTimer.current = window.setTimeout(() => setLandedId(null), LIT_MS);
    }

    try {
      const answer = await changeRequirement(jobId, requirement.id, edit);
      // Only a text comes back different from what was sent (its spaces are
      // tidied). A kind or a mark is already on the board, and a late answer
      // must not write over a newer click.
      if (edit.text !== undefined) put(requirement.id, { text: answer.requirement.text }, false);
      return null;
    } catch (error) {
      // Taken back: the fields that were changed get their old values again.
      put(
        requirement.id,
        {
          ...(edit.text !== undefined ? { text: requirement.text } : {}),
          ...(edit.kind !== undefined ? { kind: requirement.kind } : {}),
          ...(edit.ifSilent !== undefined ? { ifSilent: requirement.ifSilent } : {}),
        },
        moves,
      );
      return whyNotSaved(error);
    }
  }

  /** Removes one requirement. The card asked HR before it called this. */
  async function remove(requirement: Requirement): Promise<string | null> {
    try {
      await removeRequirement(jobId, requirement.id);
    } catch (error) {
      return whyNotSaved(error);
    }
    // The cards below slide up into the gap.
    drawTheMove(() =>
      flushSync(() => onChange((current) => current.filter((item) => item.id !== requirement.id))),
    );
    return null;
  }

  /** Adds one requirement. It is saved first, because its ID comes from the API. */
  async function add(requirement: NewRequirement): Promise<string | null> {
    try {
      const answer = await addRequirement(jobId, requirement);
      onChange((current) => [...current, answer.requirement]);
      return null;
    } catch (error) {
      return whyNotSaved(error);
    }
  }

  const full = requirements.length >= REQUIREMENTS_MAX;

  return (
    <>
      {/* Said once for the whole board, so no card has to say the usual case. */}
      <p className="mt-4 text-sm text-brand-light-navy">
        When a CV says nothing about a requirement, it counts as not met. The exception is a card
        marked “{ASK_TAG}” There it stays open until you have confirmed it with the candidate
        yourself. The product never contacts a candidate.
      </p>

      {/* Three columns side by side on a wide screen, under each other on a narrow one. */}
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-3">
        {KIND_CHOICES.map((column, columnIndex) => {
          const cards = requirements
            .filter((requirement) => requirement.kind === column.value)
            .sort((a, b) => a.position - b.position);
          const left = columnIndex > 0 ? KIND_CHOICES[columnIndex - 1] : null;
          const right = columnIndex < KIND_CHOICES.length - 1 ? KIND_CHOICES[columnIndex + 1] : null;

          return (
            <section
              key={column.value}
              aria-label={column.label}
              className={`rounded-xl border border-t-4 border-brand-navy/15 bg-brand-cream/50 p-3 ${COLUMN_EDGE[column.value]}`}
            >
              <h3 className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{column.label}</span>
                <span className="text-sm text-brand-light-navy">{cards.length}</span>
              </h3>
              <p className="mt-1 text-xs text-brand-light-navy">{column.means}</p>

              {cards.length === 0 ? (
                <p className="mt-3 rounded-lg border border-dashed border-brand-navy/25 px-3 py-4 text-center text-sm text-brand-light-navy">
                  {column.value === "must"
                    ? "No must-have yet. A list needs at least one before it can be confirmed."
                    : "Nothing here."}
                </p>
              ) : null}

              <ul className="mt-3 space-y-2">
                {cards.map((requirement, index) => (
                  <RequirementCard
                    key={requirement.id}
                    requirement={requirement}
                    fadeInAfterMs={(columnIndex * 2 + index) * FADE_STEP_MS}
                    landed={landedId === requirement.id}
                    // Every card has its own name, so the browser can follow
                    // each one from its old place to its new one.
                    moveName={`requirement-${requirement.id}`}
                    moveLeft={left ? { kind: left.value, label: left.label } : undefined}
                    moveRight={right ? { kind: right.value, label: right.label } : undefined}
                    onChange={canEdit ? (edit) => change(requirement, edit) : undefined}
                    onRemove={canEdit ? () => remove(requirement) : undefined}
                  />
                ))}
              </ul>

              {canEdit ? (
                <RequirementAdd
                  kind={column.value}
                  columnLabel={column.label}
                  full={full}
                  onAdd={add}
                />
              ) : null}
            </section>
          );
        })}
      </div>

      {canEdit && full ? (
        <p className="mt-3 text-sm text-brand-light-navy">
          A list can have at most {REQUIREMENTS_MAX} requirements. Remove one to add another.
        </p>
      ) : null}
    </>
  );
}
