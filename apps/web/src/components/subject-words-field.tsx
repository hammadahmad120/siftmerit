"use client";

import type { ClipboardEvent, KeyboardEvent } from "react";

// The field for a job's subject words. HR types a phrase and presses Enter;
// the phrase becomes a "chip" with a cross that removes it again. It is
// written by us: the project uses no component library.

// The limits of the subject phrases. The API checks the same numbers again
// (`services/api/src/services/job.service.ts`). Change both together.
export const PHRASES_MAX = 10;
const PHRASE_MIN = 2;
const PHRASE_MAX = 100;

/**
 * Everything the field holds: the chips, the text still being typed, and the
 * small line that says why a phrase was not added. The form keeps this value
 * and hands it back in, so the form can also turn leftover text into a chip
 * when "Create job" is clicked.
 */
export type SubjectWords = {
  phrases: string[];
  /** Text in the field that is not a chip yet. */
  draft: string;
  /** Why the last phrase was not added, or null. */
  note: string | null;
};

export const NO_SUBJECT_WORDS: SubjectWords = { phrases: [], draft: "", note: null };

/**
 * Turns typed text into chips. A comma or a line break ends a phrase, so
 * "Accountant, Accounts Officer" gives two chips.
 *
 * - Spaces around a phrase go, and several spaces inside it become one.
 * - A phrase that is already a chip is not added. Capital letters do not make
 *   a phrase different.
 * - A phrase that is too short or too long, or an eleventh phrase, is not
 *   added and stays in the field, so it can be corrected.
 */
export function addTypedPhrases(value: SubjectWords, typed: string): SubjectWords {
  const phrases = [...value.phrases];
  const notAdded: string[] = [];
  let note: string | null = null;

  for (const part of typed.split(/[,\n]/)) {
    const phrase = part.replace(/\s+/g, " ").trim();
    if (phrase === "") continue;

    if (phrases.some((existing) => existing.toLowerCase() === phrase.toLowerCase())) {
      note ??= "Already added.";
    } else if (phrase.length < PHRASE_MIN) {
      note ??= `A phrase needs at least ${PHRASE_MIN} characters.`;
      notAdded.push(phrase);
    } else if (phrase.length > PHRASE_MAX) {
      note ??= `A phrase can be at most ${PHRASE_MAX} characters long.`;
      notAdded.push(phrase);
    } else if (phrases.length >= PHRASES_MAX) {
      note ??= `A job can have at most ${PHRASES_MAX} phrases.`;
      notAdded.push(phrase);
    } else {
      phrases.push(phrase);
    }
  }

  return { phrases, draft: notAdded.join(", "), note };
}

/** Turns the text still in the field into chips. Used by Enter and by the form's button. */
export function addDraft(value: SubjectWords): SubjectWords {
  return addTypedPhrases(value, value.draft);
}

/**
 * One phrase, drawn as a chip. With `onRemove` it gets a cross; without it
 * the chip is for reading only, as on the job page.
 */
export function PhraseChip({ phrase, onRemove }: { phrase: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-brand-cream py-1 pr-2 pl-3 text-sm font-normal text-brand-navy">
      <span className="truncate">{phrase}</span>
      {onRemove ? (
        // A real button, so the Tab key reaches it and Enter or Space presses it.
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${phrase}`}
          className="rounded-full px-1 leading-none text-brand-light-navy hover:text-brand-navy focus-visible:outline-2 focus-visible:outline-brand-navy"
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
    </span>
  );
}

/**
 * The chip field. `id` ties it to its label.
 *
 * Keys inside the field:
 * - Enter adds the typed phrase as a chip. It does not send the form; only
 *   the form's own button does that.
 * - A comma also ends a phrase, and so does pasted text with commas in it.
 * - Backspace in the empty field removes the last chip.
 */
export function SubjectWordsField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: SubjectWords;
  onChange: (next: SubjectWords) => void;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      // Without this, Enter would send the whole form.
      event.preventDefault();
      onChange(addDraft(value));
    } else if (event.key === "Backspace" && value.draft === "" && value.phrases.length > 0) {
      onChange({ phrases: value.phrases.slice(0, -1), draft: "", note: null });
    }
  }

  function onType(typed: string) {
    // A comma typed at the end closes the phrase before it.
    if (typed.endsWith(",")) {
      onChange(addTypedPhrases(value, typed));
    } else {
      onChange({ ...value, draft: typed, note: null });
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text");
    // Plain text without a comma is pasted into the field as usual.
    if (!/[,\n]/.test(pasted)) return;
    event.preventDefault();
    onChange(addTypedPhrases(value, `${value.draft}${pasted}`));
  }

  function remove(phrase: string) {
    onChange({ ...value, phrases: value.phrases.filter((p) => p !== phrase), note: null });
  }

  return (
    <>
      <div className="mt-1 flex w-full flex-wrap items-center gap-2 rounded-lg border border-brand-navy/30 bg-white px-3 py-2 focus-within:outline-2 focus-within:outline-brand-navy">
        {value.phrases.map((phrase) => (
          <PhraseChip key={phrase} phrase={phrase} onRemove={() => remove(phrase)} />
        ))}
        <input
          id={id}
          type="text"
          value={value.draft}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={value.phrases.length === 0 ? "Type a phrase and press Enter" : ""}
          autoComplete="off"
          className="min-w-48 flex-1 bg-transparent py-0.5 font-normal text-brand-navy outline-none"
        />
      </div>
      {/* `role="status"` makes a screen reader read the line when it appears. */}
      <p role="status" className="mt-1 min-h-5 text-sm text-red-700">
        {value.note ?? ""}
      </p>
    </>
  );
}
