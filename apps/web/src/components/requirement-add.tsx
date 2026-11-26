"use client";

import { useState, type FormEvent } from "react";
import type { NewRequirement, RequirementKind } from "@/lib/api";
import {
  ASK_CHOICE,
  ASK_CHOICE_WITHOUT,
  REQUIREMENT_TEXT_MAX,
} from "@/components/requirement-card";
import { BUTTON_CLASSES, FIELD_CLASSES } from "@/lib/styles";

/**
 * "Add a requirement", at the foot of a column of the board. The column
 * says the kind, so the form asks only for the text and for the "ask the
 * candidate" tick. Closed, it is one quiet button; open, a small form.
 *
 * `onAdd` saves the requirement and answers with `null` when that worked, or
 * with a sentence that says why not, for example that the text is already in
 * the list. The form then stays open with the sentence under it.
 *
 * When the list is `full`, the button is switched off. The board says why,
 * once, under its three columns.
 */
export function RequirementAdd(props: {
  kind: RequirementKind;
  /** The column's name, for a screen reader: "Add a must-have". */
  columnLabel: string;
  full: boolean;
  onAdd: (requirement: NewRequirement) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [ask, setAsk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setText("");
    setAsk(false);
    setProblem(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    // Without this the browser would reload the page.
    event.preventDefault();
    if (saving) return;

    const tidy = text.replace(/\s+/g, " ").trim();
    if (tidy === "") {
      setProblem("Write the requirement first.");
      return;
    }

    setSaving(true);
    setProblem(null);
    const failed = await props.onAdd({
      text: tidy,
      kind: props.kind,
      ifSilent: ask ? "ask" : "missing",
    });
    setSaving(false);
    if (failed) setProblem(failed);
    else close();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={props.full}
        aria-label={`Add a requirement to ${props.columnLabel}`}
        className="mt-2 w-full rounded-lg border border-dashed border-brand-navy/30 px-3 py-2 text-left text-sm font-medium text-brand-light-navy enabled:hover:border-brand-navy enabled:hover:text-brand-navy focus-visible:outline-2 focus-visible:outline-brand-navy disabled:opacity-50"
      >
        + Add
      </button>
    );
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="mt-2 rounded-lg border border-brand-navy/30 bg-white p-3"
    >
      <label className="block text-xs font-medium text-brand-light-navy">
        New requirement
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
            // A requirement is one line, so Enter sends the form.
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          maxLength={REQUIREMENT_TEXT_MAX}
          rows={3}
          placeholder="For example: 3 or more years of sales experience"
          autoFocus
          disabled={saving}
          className={`text-sm ${FIELD_CLASSES}`}
        />
      </label>

      <label className="mt-2 flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          checked={ask}
          onChange={(event) => setAsk(event.target.checked)}
          disabled={saving}
          className="mt-0.5 h-4 w-4 accent-brand-navy"
        />
        <span>
          {ASK_CHOICE}
          <span className="mt-0.5 block text-brand-light-navy">{ASK_CHOICE_WITHOUT}</span>
        </span>
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={saving} className={`px-3 py-1.5 ${BUTTON_CLASSES}`}>
          {saving ? "Adding..." : "Add"}
        </button>
        <button
          type="button"
          onClick={close}
          disabled={saving}
          className="rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-brand-cream focus-visible:outline-2 focus-visible:outline-brand-navy disabled:opacity-60"
        >
          Cancel
        </button>
      </div>

      {problem ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {problem}
        </p>
      ) : null}
    </form>
  );
}
