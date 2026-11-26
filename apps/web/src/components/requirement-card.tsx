"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import type { IfSilent, Requirement, RequirementChange, RequirementKind } from "@/lib/api";
import { BUTTON_CLASSES, FIELD_CLASSES } from "@/lib/styles";

/** The longest a requirement's text may be. The API and the database keep the same limit. */
export const REQUIREMENT_TEXT_MAX = 500;

/**
 * The three kinds, in the order the list is sorted by: must-have first.
 * `label` is the word on the switch of a requirement. `means` says what the
 * kind does; it is shown once, above the list, so HR does not have to know
 * the rule by heart.
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
 * What a CV that says nothing about a requirement means, as the two choices
 * that end the sentence "If the CV does not mention it:". The code and the
 * database call the second one `missing`; "not met" is the screen's word,
 * because "missing" alone did not say missing from what.
 */
export const IF_SILENT_CHOICES: { value: IfSilent; label: string }[] = [
  { value: "ask", label: "Ask the candidate" },
  { value: "missing", label: "Count as not met" },
];

/** The words in front of the "silent CV" choice, on a card and in the form that adds one. */
export const IF_SILENT_LEAD = "If the CV does not mention it:";

/**
 * A switch: a row of choices with the chosen one filled in. A click on
 * another choice picks it.
 *
 * Without `onPick` it only shows the choice and does not react, for a list
 * that cannot be changed. `name` says what is being chosen, for a screen
 * reader: "Kind" or the sentence about a silent CV.
 */
export function ChoiceSwitch<Value extends string>(props: {
  name: string;
  choices: { value: Value; label: string }[];
  chosen: Value;
  onPick?: (value: Value) => void;
}) {
  const { name, choices, chosen, onPick } = props;

  if (!onPick) {
    const label = choices.find((choice) => choice.value === chosen)?.label;
    return (
      <>
        <span className="sr-only">
          {name} {label}.
        </span>
        <span
          aria-hidden="true"
          className="inline-flex rounded-lg border border-brand-navy/20 bg-white p-0.5 text-xs"
        >
          {choices.map((choice) => (
            <span
              key={choice.value}
              className={
                choice.value === chosen
                  ? "rounded-md bg-brand-navy px-2.5 py-1 font-medium text-brand-cream"
                  : "px-2.5 py-1 text-brand-light-navy/60"
              }
            >
              {choice.label}
            </span>
          ))}
        </span>
      </>
    );
  }

  return (
    // A group of radio buttons: exactly one is chosen at any time.
    <span
      role="radiogroup"
      aria-label={name}
      className="inline-flex rounded-lg border border-brand-navy/20 bg-white p-0.5 text-xs"
    >
      {choices.map((choice) => {
        const isChosen = choice.value === chosen;
        return (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={isChosen}
            onClick={() => {
              if (!isChosen) onPick(choice.value);
            }}
            className={`rounded-md px-2.5 py-1 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-navy ${
              isChosen
                ? "bg-brand-navy font-medium text-brand-cream"
                : "text-brand-light-navy hover:bg-brand-cream"
            }`}
          >
            {choice.label}
          </button>
        );
      })}
    </span>
  );
}

/** A small icon button at the edge of a card. `label` is what a screen reader says. */
function IconButton(props: { label: string; onClick: () => void; children: React.ReactNode }) {
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

/** A pencil, for "reword". Drawn here because the product uses no icon library. */
function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 3.5l3 3L7 16l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

/** A bin, for "remove". */
function BinIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" />
    </svg>
  );
}

/** What a card is doing besides showing its requirement. */
type Mode = "view" | "rewording" | "removing";

/**
 * One requirement as a card: its text, its kind as a switch, and what a CV
 * that is silent on it means, said as a sentence. The switch is the only
 * place the kind is written, and a must-have has a dark left edge so the eye
 * finds the deal-breakers.
 *
 * With `onChange` and `onRemove` HR can edit it, and every change is saved at
 * once: one click on a kind or a mark, a new text with Enter or "Save", and
 * "Remove" after one question on the card itself. Both functions answer with
 * `null` when the change was saved, or with a sentence that says why not; the
 * card shows that sentence.
 *
 * Without them the card only shows the requirement.
 *
 * `fadeInAfterMs` is how long after the first card this one fades in when
 * the list appears. It is kept from the card's first moment: a card that
 * moves to another place later does not fade in again.
 */
export function RequirementCard(props: {
  requirement: Requirement;
  fadeInAfterMs: number;
  /** The card just moved to a new place in the list. It is lit softly for a moment. */
  landed?: boolean;
  /** The name the browser follows this card by when the list is sorted again. */
  moveName?: string;
  domId?: string;
  onChange?: (change: RequirementChange) => Promise<string | null>;
  onRemove?: () => Promise<string | null>;
  onPointerEnter?: (event: PointerEvent<HTMLLIElement>) => void;
  onPointerLeave?: (event: PointerEvent<HTMLLIElement>) => void;
}) {
  const { requirement, landed, moveName, domId, onChange, onRemove } = props;

  const [mode, setMode] = useState<Mode>("view");
  const [draftText, setDraftText] = useState(requirement.text);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Kept from the first moment; see the comment above.
  const [fadeInAfterMs] = useState(props.fadeInAfterMs);

  /** One click on a kind or a mark. The list shows it at once; a failure comes back as a sentence. */
  async function pick(change: RequirementChange) {
    if (!onChange) return;
    setProblem(null);
    setProblem(await onChange(change));
  }

  function startRewording() {
    setDraftText(requirement.text);
    setProblem(null);
    setMode("rewording");
  }

  async function saveText() {
    if (!onChange || saving) return;
    const text = draftText.replace(/\s+/g, " ").trim();
    if (text === "") {
      setProblem("A requirement cannot be empty.");
      return;
    }
    if (text === requirement.text) {
      setMode("view");
      return;
    }
    setSaving(true);
    setProblem(null);
    const failed = await onChange({ text });
    setSaving(false);
    if (failed) setProblem(failed);
    else setMode("view");
  }

  function onTextKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    // A requirement is one line, so Enter saves it and adds no line break.
    if (event.key === "Enter") {
      event.preventDefault();
      void saveText();
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
      id={domId}
      onPointerEnter={props.onPointerEnter}
      onPointerLeave={props.onPointerLeave}
      // A must-have has a dark left edge. A card that just moved has a soft
      // purple ring around it, which fades away again.
      className={`rise-in rounded-lg border border-brand-navy/15 bg-white p-4 ring-brand-purple/25 transition-shadow duration-700 ${
        requirement.kind === "must" ? "border-l-4 border-l-brand-navy" : ""
      } ${landed ? "ring-4" : "ring-0"}`}
      style={{ animationDelay: `${fadeInAfterMs}ms`, viewTransitionName: moveName }}
    >
      {mode === "rewording" ? (
        <div>
          <label className="block text-xs font-medium text-brand-light-navy">
            Requirement
            <textarea
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
              onKeyDown={onTextKey}
              maxLength={REQUIREMENT_TEXT_MAX}
              rows={2}
              autoFocus
              disabled={saving}
              className={`text-sm ${FIELD_CLASSES}`}
            />
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void saveText()}
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
            <span className="text-xs text-brand-light-navy">Enter saves, Esc cancels.</span>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          {/* Plain text, never HTML: React writes the text out as it is. */}
          <p className="min-w-0 text-sm font-medium break-words">{requirement.text}</p>
          {canEdit && mode === "view" ? (
            <div className="-mt-1 -mr-1 flex shrink-0">
              <IconButton label="Reword this requirement" onClick={startRewording}>
                <PencilIcon />
              </IconButton>
              <IconButton
                label="Remove this requirement"
                onClick={() => {
                  setProblem(null);
                  setMode("removing");
                }}
              >
                <BinIcon />
              </IconButton>
            </div>
          ) : null}
        </div>
      )}

      {mode === "removing" ? (
        // Asked on the card itself: a removed line is gone.
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Remove this requirement?</span>
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
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <ChoiceSwitch
            name="Kind:"
            choices={KIND_CHOICES}
            chosen={requirement.kind}
            onPick={canEdit ? (kind) => void pick({ kind }) : undefined}
          />
          <span className="flex flex-wrap items-center gap-2 text-xs text-brand-light-navy">
            <span aria-hidden="true">{IF_SILENT_LEAD}</span>
            <ChoiceSwitch
              name={IF_SILENT_LEAD}
              choices={IF_SILENT_CHOICES}
              chosen={requirement.ifSilent}
              onPick={canEdit ? (ifSilent) => void pick({ ifSilent }) : undefined}
            />
          </span>
        </div>
      )}

      {/* `role="alert"` makes a screen reader read the sentence when it appears. */}
      {problem ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {problem}
        </p>
      ) : null}
    </li>
  );
}
