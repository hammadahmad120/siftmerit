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
import { KIND_CHOICES, RequirementCard } from "@/components/requirement-card";

/** The most requirements a job may have. The API keeps the same limit. */
const REQUIREMENTS_MAX = 30;

/** Each card of a list fades in this much later than the one above it, in milliseconds. */
const FADE_STEP_MS = 60;

/** After the mouse has left a card whose kind changed, the card moves this much later. */
const AFTER_LEAVING_MS = 250;

/** Without a mouse on the card (keyboard, touch screen), a card whose kind changed moves this much later. */
const WITHOUT_MOUSE_MS = 2000;

/** How long a card is lit after it has moved, and how long the line that says where it went stays. */
const LIT_MS = 1600;
const NOTE_MS = 4000;

/** The place of each kind in the sorted list. */
const KIND_RANK: Record<RequirementKind, number> = { must: 0, preferred: 1, nice: 2 };

/** Where a card went, for the line shown when its new place is outside the screen. */
const MOVED_TO: Record<RequirementKind, string> = {
  must: "Moved to the must-haves.",
  preferred: "Moved to the preferred requirements.",
  nice: "Moved to the nice-to-haves.",
};

/** The IDs of a list in its sorted order: must-have first, and inside a kind the order of the job description. */
function sortedIds(requirements: Requirement[]): string[] {
  return [...requirements]
    .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.position - b.position)
    .map((requirement) => requirement.id);
}

/** A card's `id` in the page, to find it after it has moved. */
function cardDomId(requirementId: string): string {
  return `requirement-${requirementId}`;
}

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
 * The list of a job's requirements. First, once, what the three kinds mean.
 * Then every requirement as a card, in one list that is always sorted:
 * must-have first, then preferred, then nice to have. There are no group
 * headings on purpose: a heading would say the kind a second time, next to
 * the switch on every card.
 *
 * With `canEdit`, HR changes the list here, and every change is saved at
 * once. The list on the page changes first and the API is called after; if
 * the API refuses, that one change is taken back and the card says why.
 *
 * A card whose kind changed must move to its new place, and it must not
 * vanish from under the mouse. So the order on the page is held still at
 * that moment, and let go a little later: when the mouse has left the card,
 * or after two seconds when there is no mouse on it. The browser then draws
 * the move itself: the card glides to its place and the others make room
 * (see `drawTheMove`). Either way the card is lit for a moment where it
 * lands.
 *
 * `onChange` hands the list's owner a function that makes the new list from
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

  // The order held still while a card waits to move. `null`: the sorted order.
  const [heldOrder, setHeldOrder] = useState<string[] | null>(null);
  // The card that just moved, and the line that says where it went.
  const [landedId, setLandedId] = useState<string | null>(null);
  const [movedNote, setMovedNote] = useState<string | null>(null);

  // The card the mouse is on, the card that waits to move, and the timers.
  // None of them changes what is drawn, so they are not state.
  const hoveredId = useRef<string | null>(null);
  const waiting = useRef<{ id: string; timer?: number } | null>(null);
  const litTimer = useRef<number | undefined>(undefined);
  const noteTimer = useRef<number | undefined>(undefined);

  // `settle` below is called from a timer that was set some moments earlier.
  // It must work with the list as it is when the timer fires, not as it was
  // when the timer was set. So the newest list and the newest order on the
  // page are kept here after every draw.
  const newest = useRef<{ requirements: Requirement[]; shownIds: string[] }>({
    requirements,
    shownIds: [],
  });

  // When the page is left, no timer may fire any more.
  useEffect(() => {
    return () => {
      window.clearTimeout(waiting.current?.timer);
      window.clearTimeout(litTimer.current);
      window.clearTimeout(noteTimer.current);
    };
  }, []);

  const byId = new Map(requirements.map((requirement) => [requirement.id, requirement]));
  const sorted = sortedIds(requirements);
  // A held order can be out of date: a removed card is left out, and a new
  // one stands at the end until the order is let go.
  const shownIds = heldOrder
    ? [
        ...heldOrder.filter((id) => byId.has(id)),
        ...sorted.filter((id) => !heldOrder.includes(id)),
      ]
    : sorted;

  useEffect(() => {
    newest.current = { requirements, shownIds };
  });

  /**
   * Lets the held order go, so the list is sorted again. `movedId` is the
   * card whose kind changed; it is lit, and if its new place is outside the
   * screen a line says where it went.
   */
  function settle(movedId: string | null) {
    window.clearTimeout(waiting.current?.timer);
    waiting.current = null;

    const now = newest.current;
    const placeBefore = movedId ? now.shownIds.indexOf(movedId) : -1;
    const placeAfter = movedId ? sortedIds(now.requirements).indexOf(movedId) : -1;
    const kind = now.requirements.find((requirement) => requirement.id === movedId)?.kind;

    const apply = () => {
      // `flushSync` makes React draw the new order now, inside this function.
      // The browser compares the page before and after it to draw the move.
      flushSync(() => setHeldOrder(null));

      const card = movedId ? document.getElementById(cardDomId(movedId)) : null;
      if (!card || movedId === null || placeAfter === placeBefore) return;

      const box = card.getBoundingClientRect();
      const outside = box.bottom < 0 || box.top > window.innerHeight;

      flushSync(() => {
        setLandedId(movedId);
        setMovedNote(outside && kind ? MOVED_TO[kind] : null);
      });
      window.clearTimeout(litTimer.current);
      window.clearTimeout(noteTimer.current);
      litTimer.current = window.setTimeout(() => setLandedId(null), LIT_MS);
      noteTimer.current = window.setTimeout(() => setMovedNote(null), NOTE_MS);
    };

    drawTheMove(apply);
  }

  /** One change to one requirement: shown at once, then saved. Answers `null`, or why it was not saved. */
  async function change(requirement: Requirement, edit: RequirementChange): Promise<string | null> {
    if (edit.kind) {
      // Hold the order as it is drawn now, so the card stays under the mouse.
      setHeldOrder((held) => held ?? shownIds);
      window.clearTimeout(waiting.current?.timer);
      waiting.current =
        hoveredId.current === requirement.id
          ? { id: requirement.id }
          : {
              id: requirement.id,
              timer: window.setTimeout(() => settle(requirement.id), WITHOUT_MOUSE_MS),
            };
    }

    onChange((current) =>
      current.map((item) => (item.id === requirement.id ? { ...item, ...edit } : item)),
    );

    try {
      const answer = await changeRequirement(jobId, requirement.id, edit);
      // Only a text comes back different from what was sent (its spaces are
      // tidied). A kind or a mark is already on the page, and a late answer
      // must not write over a newer click.
      if (edit.text !== undefined) {
        onChange((current) =>
          current.map((item) =>
            item.id === requirement.id ? { ...item, text: answer.requirement.text } : item,
          ),
        );
      }
      return null;
    } catch (error) {
      // Taken back: the fields that were changed get their old values again.
      onChange((current) =>
        current.map((item) =>
          item.id === requirement.id
            ? {
                ...item,
                ...(edit.text !== undefined ? { text: requirement.text } : {}),
                ...(edit.kind !== undefined ? { kind: requirement.kind } : {}),
                ...(edit.ifSilent !== undefined ? { ifSilent: requirement.ifSilent } : {}),
              }
            : item,
        ),
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
      // The new card stands at its sorted place at once, also when an order
      // was being held, and the cards below it slide down to make room.
      window.clearTimeout(waiting.current?.timer);
      waiting.current = null;
      drawTheMove(() =>
        flushSync(() => {
          onChange((current) => [...current, answer.requirement]);
          setHeldOrder(null);
        }),
      );
      return null;
    } catch (error) {
      return whyNotSaved(error);
    }
  }

  const hasMust = requirements.some((requirement) => requirement.kind === "must");

  return (
    <>
      <dl className="mt-4 grid gap-x-6 gap-y-2 rounded-lg bg-brand-cream px-4 py-3 text-sm sm:grid-cols-3">
        {KIND_CHOICES.map((kind) => (
          <div key={kind.value}>
            <dt className="font-medium">{kind.label}</dt>
            <dd className="text-brand-light-navy">{kind.means}</dd>
          </div>
        ))}
      </dl>

      {hasMust ? null : (
        <p className="mt-3 text-sm font-medium">
          No must-have yet. A list needs at least one before it can be confirmed.
        </p>
      )}

      {/* `role="status"` makes a screen reader read the line when it appears. */}
      <p role="status" className={movedNote ? "mt-3 text-sm text-brand-light-navy" : "sr-only"}>
        {movedNote}
      </p>

      <ul className="mt-4 space-y-2">
        {shownIds.map((id, index) => {
          const requirement = byId.get(id);
          if (!requirement) return null;
          return (
            <RequirementCard
              key={id}
              requirement={requirement}
              fadeInAfterMs={index * FADE_STEP_MS}
              landed={landedId === id}
              // Every card has its own name, so the browser can follow each
              // one from its old place to its new one.
              moveName={`requirement-${id}`}
              domId={cardDomId(id)}
              onChange={canEdit ? (edit) => change(requirement, edit) : undefined}
              onRemove={canEdit ? () => remove(requirement) : undefined}
              // Only a mouse "is on" a card. A finger leaves at once, so a
              // touch is handled like the keyboard: by the two seconds.
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") hoveredId.current = id;
              }}
              onPointerLeave={(event) => {
                if (event.pointerType !== "mouse") return;
                hoveredId.current = null;
                if (waiting.current?.id === id) {
                  window.clearTimeout(waiting.current.timer);
                  waiting.current = {
                    id,
                    timer: window.setTimeout(() => settle(id), AFTER_LEAVING_MS),
                  };
                }
              }}
            />
          );
        })}
      </ul>

      {canEdit ? (
        <RequirementAdd
          full={requirements.length >= REQUIREMENTS_MAX}
          max={REQUIREMENTS_MAX}
          onAdd={add}
        />
      ) : null}
    </>
  );
}
