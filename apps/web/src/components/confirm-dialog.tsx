"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { BUTTON_CLASSES } from "@/lib/styles";

/**
 * A popup that asks HR one question before something is done, and says what
 * doing it costs. Written once, so every such question looks and behaves the
 * same.
 *
 * It is the browser's own `<dialog>` element, opened as a "modal": the page
 * behind it is dimmed and cannot be clicked, the Tab key stays inside the
 * popup, and Esc closes it. The browser does all of that; no library is
 * needed.
 *
 * `children` is the body: what will happen, and what it costs. `busy` is
 * true while the answer "yes" is being carried out; the buttons are switched
 * off then, and Esc does nothing. `problem` is a sentence shown when it could
 * not be carried out.
 */
export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  children: ReactNode;
  /** The words on the button that says yes, for example "Edit requirements". */
  confirmLabel: string;
  /** The words on that button while it is being carried out. */
  busyLabel: string;
  busy: boolean;
  problem: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { open, title, children, confirmLabel, busyLabel, busy, problem, onConfirm, onCancel } =
    props;
  const dialog = useRef<HTMLDialogElement>(null);

  // The element is opened and closed by its own two functions, not by a
  // class: only `showModal` dims the page behind it and keeps Tab inside.
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      // Esc. The browser would close the popup by itself; it is told not to,
      // so that "open" stays in the hands of the page that owns it.
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      aria-labelledby="confirm-dialog-title"
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-brand-navy/15 bg-white p-6 text-brand-navy shadow-xl backdrop:bg-brand-navy/40"
    >
      <h2 id="confirm-dialog-title" className="text-lg font-semibold">
        {title}
      </h2>
      <div className="mt-3 space-y-2 text-sm">{children}</div>

      {problem ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {problem}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          // The safe answer has the focus when the popup opens.
          autoFocus
          className="rounded-lg border border-brand-navy/30 px-4 py-2 text-sm font-medium enabled:hover:border-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`px-4 py-2 ${BUTTON_CLASSES}`}
        >
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
