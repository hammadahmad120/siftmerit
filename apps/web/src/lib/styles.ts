// Looks that more than one screen uses, written once so they cannot drift
// apart. Each is a list of Tailwind classes to put in a `className`.

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
