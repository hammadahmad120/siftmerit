"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import type { Requirement, RequirementChange, RequirementKind } from "@/lib/api";
import { BUTTON_CLASSES, FIELD_CLASSES } from "@/lib/styles";

/** The longest a requirement's text may be. The API and the database keep the same limit. */
export const REQUIREMENT_TEXT_MAX = 500;

/**
 * The three kinds, in the order of the board's columns: must-have first.
 * `label` is the heading of the column. `means` says what the kind does; it
 * stands under the heading, so HR does not have to know the rule by heart.
 */
export const KIND_CHOICES: { value: RequirementKind; label: string; means: string }[] = [
  {
    value: "must",
    label: "Must-have",
    // Not "is not shown to you": the strongest of them are still offered,
    // in a list of their own.
    means:
      "A candidate who misses one is left out of your main list. Only the strongest of them are offered to you separately.",
  },
  {
    value: "preferred",
    label: "Preferred",
    means:
      "Strongly wanted, but not required. A candidate stays in the list without it, and each one they show moves them clearly higher.",
  },
  {
    value: "nice",
    label: "Nice to have",
    means: "A small extra. It moves a candidate up a little.",
  },
];

/**
 * The words of the "silent CV" mark. When a CV says nothing on a
 * requirement, it is either left for HR to check with the candidate (`ask`),
 * or counted as not met (`missing`, the usual case, which a card does not
 * write out).
 */
// The user's own words for it: not present means it needs confirmation with
  // the candidate. Said as something HR does, because the product never
  // contacts a candidate.
export const ASK_TAG = "Not on the CV? Confirm it with the candidate.";
/** The second line of the mark on a card: what it means until HR has done so. */
export const ASK_TAG_MEANS = "It stays open until you do.";
export const ASK_CHOICE = "If a CV does not mention this, I will confirm it with the candidate myself.";
/** Under the tick: what leaving it empty means. */
export const ASK_CHOICE_WITHOUT = "Without the tick, a CV that does not mention it counts as not met.";

/** A small icon button at the foot of a card. `label` is what a screen reader says, and the tooltip. */
function IconButton(props: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      className="rounded-md p-1.5 text-brand-light-navy hover:bg-brand-cream hover:text-brand-navy focus-visible:outline-2 focus-visible:outline-brand-navy"
    >
      {props.children}
    </button>
  );
}

/** One of the small drawings on a card's buttons. Drawn here because the product uses no icon library. */
function Icon({ path }: { path: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

const PENCIL = "M13.5 3.5l3 3L7 16l-4 1 1-4 9.5-9.5z";
const BIN = "M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10";
const ARROW_LEFT = "M16 10H4M9 5l-5 5 5 5";
const ARROW_RIGHT = "M4 10h12M11 5l5 5-5 5";

/** What a card is doing besides showing its requirement. */
type Mode = "view" | "editing" | "removing";

/** A column a card can move to, with the words for its arrow. */
export type MoveTarget = { kind: RequirementKind; label: string };

/**
 * One requirement as a card on the board. The column it stands in says how
 * much it counts, so the card itself does not: it holds the requirement's
 * text, and one small line only when a silent CV means "ask the candidate".
 *
 * With `onChange` and `onRemove` HR can change it:
 *
 * - the arrows move it to the column on its left or right, which changes its
 *   kind; the board draws the move;
 * - the pencil opens the text and the "ask the candidate" tick, saved with
 *   Enter or "Save";
 * - the bin removes it, after one question on the card itself.
 *
 * Both functions answer with `null` when the change was saved, or with a
 * sentence that says why not; the card shows that sentence. Without them the
 * card only shows the requirement.
 *
 * `fadeInAfterMs` is how long after the first card this one fades in when
 * the board appears. It is kept from the card's first moment: a card that
 * moves to another column later does not fade in again.
 */
export function RequirementCard(props: {
  requirement: Requirement;
  fadeInAfterMs: number;
  /** The card just moved to another column. It is lit softly for a moment. */
  landed?: boolean;
  /** The name the browser follows this card by when it moves. */
  moveName?: string;
  /** The columns on the left and on the right of the card's own, if any. */
  moveLeft?: MoveTarget;
  moveRight?: MoveTarget;
  onChange?: (change: RequirementChange) => Promise<string | null>;
  onRemove?: () => Promise<string | null>;
}) {
  const { requirement, landed, moveName, moveLeft, moveRight, onChange, onRemove } = props;

  const [mode, setMode] = useState<Mode>("view");
  const [draftText, setDraftText] = useState(requirement.text);
  const [draftAsk, setDraftAsk] = useState(requirement.ifSilent === "ask");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Kept from the first moment; see the comment above.
  const [fadeInAfterMs] = useState(props.fadeInAfterMs);

  /** An arrow: the card moves to the next column. A failure comes back as a sentence. */
  async function moveTo(target: MoveTarget) {
    if (!onChange) return;
    setProblem(null);
    setProblem(await onChange({ kind: target.kind }));
  }

  function startEditing() {
    setDraftText(requirement.text);
    setDraftAsk(requirement.ifSilent === "ask");
    setProblem(null);
    setMode("editing");
  }

  /** "Save" in the edit view. Only what really changed is sent. */
  async function saveEdit() {
    if (!onChange || saving) return;
    const text = draftText.replace(/\s+/g, " ").trim();
    if (text === "") {
      setProblem("A requirement cannot be empty.");
      return;
    }

    const change: RequirementChange = {};
    if (text !== requirement.text) change.text = text;
    if (draftAsk !== (requirement.ifSilent === "ask")) change.ifSilent = draftAsk ? "ask" : "missing";
    if (Object.keys(change).length === 0) {
      setMode("view");
      return;
    }

    setSaving(true);
    setProblem(null);
    const failed = await onChange(change);
    setSaving(false);
    if (failed) setProblem(failed);
    else setMode("view");
  }

  function onTextKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    // A requirement is one line, so Enter saves it and adds no line break.
    if (event.key === "Enter") {
      event.preventDefault();
      void saveEdit();
    }
    if (event.key === "Escape") {
      setProblem(null);
      setMode("view");
    }
  }

  async function remove() {
    if (!onRemove || saving) return;
    setSaving(true);
    setProblem(null);
    const failed = await onRemove();
    // When it worked the card is gone, and nothing is left to set.
    if (failed) {
      setSaving(false);
      setProblem(failed);
      setMode("view");
    }
  }

  const canEdit = Boolean(onChange && onRemove);

  return (
    <li
      // A card that just moved has a soft purple ring, which fades away again.
      className={`rise-in rounded-lg border border-brand-navy/15 bg-white p-3 ring-brand-purple/30 transition-shadow duration-700 ${
        landed ? "ring-4" : "ring-0"
      }`}
      style={{ animationDelay: `${fadeInAfterMs}ms`, viewTransitionName: moveName }}
    >
      {mode === "editing" ? (
        <div>
          <label className="block text-xs font-medium text-brand-light-navy">
            Requirement
            <textarea
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
              onKeyDown={onTextKey}
              maxLength={REQUIREMENT_TEXT_MAX}
              rows={3}
              autoFocus
              disabled={saving}
              className={`text-sm ${FIELD_CLASSES}`}
            />
          </label>
          <label className="mt-2 flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={draftAsk}
              onChange={(event) => setDraftAsk(event.target.checked)}
              disabled={saving}
              className="mt-0.5 h-4 w-4 accent-brand-navy"
            />
            <span>
              {ASK_CHOICE}
              <span className="mt-0.5 block text-brand-light-navy">{ASK_CHOICE_WITHOUT}</span>
            </span>
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void saveEdit()}
              disabled={saving}
              className={`px-3 py-1.5 ${BUTTON_CLASSES}`}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setProblem(null);
                setMode("view");
              }}
              disabled={saving}
              className="rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-brand-cream focus-visible:outline-2 focus-visible:outline-brand-navy disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Plain text, never HTML: React writes the text out as it is. */}
          <p className="text-sm break-words">{requirement.text}</p>
          {requirement.ifSilent === "ask" ? (
            // Two short lines: silence is not a miss here, and HR is the one
            // who settles it.
            <p className="mt-2 rounded-md bg-brand-cream px-2 py-1 text-xs">
              <span className="block font-medium">{ASK_TAG}</span>
              <span className="block text-brand-light-navy">{ASK_TAG_MEANS}</span>
            </p>
          ) : null}
        </>
      )}

      {mode === "removing" ? (
        // Asked on the card itself: a removed requirement is gone.
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="w-full font-medium">Remove this requirement?</span>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={saving}
            autoFocus
            className={`px-3 py-1.5 ${BUTTON_CLASSES}`}
          >
            {saving ? "Removing..." : "Remove"}
          </button>
          <button
            type="button"
            onClick={() => setMode("view")}
            disabled={saving}
            className="rounded-lg px-3 py-1.5 font-medium hover:bg-brand-cream focus-visible:outline-2 focus-visible:outline-brand-navy disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {canEdit && mode === "view" ? (
        <div className="mt-2 -mb-1 flex items-center justify-between">
          {/* The arrow to the left stands on the left, the one to the right on the right. */}
          <span className="-ml-1.5">
            {moveLeft ? (
              <IconButton label={`Move to ${moveLeft.label}`} onClick={() => void moveTo(moveLeft)}>
                <Icon path={ARROW_LEFT} />
              </IconButton>
            ) : null}
          </span>
          <span className="-mr-1.5 flex">
            <IconButton label="Edit this requirement" onClick={startEditing}>
              <Icon path={PENCIL} />
            </IconButton>
            <IconButton
              label="Remove this requirement"
              onClick={() => {
                setProblem(null);
                setMode("removing");
              }}
            >
              <Icon path={BIN} />
            </IconButton>
            {moveRight ? (
              <IconButton label={`Move to ${moveRight.label}`} onClick={() => void moveTo(moveRight)}>
                <Icon path={ARROW_RIGHT} />
              </IconButton>
            ) : null}
          </span>
        </div>
      ) : null}

      {/* `role="alert"` makes a screen reader read the sentence when it appears. */}
      {problem ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {problem}
        </p>
      ) : null}
    </li>
  );
}
