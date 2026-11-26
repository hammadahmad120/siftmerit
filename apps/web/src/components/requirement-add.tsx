"use client";

import { useState, type FormEvent } from "react";
import type { IfSilent, NewRequirement, RequirementKind } from "@/lib/api";
import {
  ChoiceSwitch,
  IF_SILENT_CHOICES,
  IF_SILENT_LEAD,
  KIND_CHOICES,
  REQUIREMENT_TEXT_MAX,
} from "@/components/requirement-card";
import { BUTTON_CLASSES, FIELD_CLASSES } from "@/lib/styles";

/** A new requirement starts with these two; HR changes them with one click. */
const START_KIND: RequirementKind = "preferred";
const START_IF_SILENT: IfSilent = "missing";

/**
 * "Add a requirement", at the end of the list. Closed, it is one quiet
 * button. Open, it is a small form: the text, the kind, and what a silent CV
 * means.
 *
 * `onAdd` saves the requirement and answers with `null` when that worked, or
 * with a sentence that says why not, for example that the text is already in
 * the list. The form then stays open with the sentence under it.
 *
 * When the list is `full`, the button is switched off and says why.
 */
export function RequirementAdd(props: {
  full: boolean;
  /** How many requirements a list may hold, for the sentence shown when it is full. */
  max: number;
  onAdd: (requirement: NewRequirement) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<RequirementKind>(START_KIND);
  const [ifSilent, setIfSilent] = useState<IfSilent>(START_IF_SILENT);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setText("");
    setKind(START_KIND);
    setIfSilent(START_IF_SILENT);
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
    const failed = await props.onAdd({ text: tidy, kind, ifSilent });
    setSaving(false);
    if (failed) setProblem(failed);
    else close();
  }

  if (!open) {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={props.full}
          className="w-full rounded-lg border border-dashed border-brand-navy/30 px-4 py-3 text-left text-sm font-medium enabled:hover:border-brand-navy enabled:hover:bg-brand-cream/50 focus-visible:outline-2 focus-visible:outline-brand-navy disabled:opacity-60"
        >
          + Add a requirement
        </button>
        {props.full ? (
          <p className="mt-2 text-sm text-brand-light-navy">
            A list can have at most {props.max} requirements. Remove one to add another.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-3 rounded-lg border border-brand-navy/30 bg-white p-4">
      <label className="block text-xs font-medium text-brand-light-navy">
        New requirement
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
          maxLength={REQUIREMENT_TEXT_MAX}
          placeholder="For example: 3 or more years of sales experience"
          autoFocus
          disabled={saving}
          className={`text-sm ${FIELD_CLASSES}`}
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <ChoiceSwitch name="Kind:" choices={KIND_CHOICES} chosen={kind} onPick={setKind} />
        <span className="flex flex-wrap items-center gap-2 text-xs text-brand-light-navy">
          <span aria-hidden="true">{IF_SILENT_LEAD}</span>
          <ChoiceSwitch
            name={IF_SILENT_LEAD}
            choices={IF_SILENT_CHOICES}
            chosen={ifSilent}
            onPick={setIfSilent}
          />
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
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
