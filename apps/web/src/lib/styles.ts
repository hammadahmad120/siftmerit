// Looks that more than one screen uses, written once so they cannot drift
// apart. Each is a list of Tailwind classes to put in a `className`.

/**
 * The look of a form field: white, with a thin navy border. A field in use
 * gets a navy outline.
 */
export const FIELD_CLASSES =
  "mt-1 w-full rounded-lg border border-brand-navy/30 bg-white px-3 py-2 font-normal text-brand-navy focus:outline-2 focus:outline-brand-navy";

/**
 * The look of every button: navy with a cream label.
 *
 * - Under the mouse the navy turns a little lighter. A button that is switched
 *   off does not react.
 * - A button reached with the Tab key gets a navy ring around it, so a person
 *   who uses the keyboard can see where they are. A mouse click does not show it.
 *
 * The size is left out on purpose: each button adds its own padding and width.
 */
export const BUTTON_CLASSES =
  "rounded-lg bg-brand-navy text-sm font-medium text-brand-cream enabled:hover:bg-brand-light-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy disabled:opacity-60";
