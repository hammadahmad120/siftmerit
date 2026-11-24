"use client";

import { useState } from "react";
import { apiFailureMessage, queueDemoWork } from "@/lib/api";
import { BUTTON_CLASSES } from "@/lib/styles";

type DemoState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "queued"; workItemId: string }
  | { kind: "failed"; message: string };

/**
 * Temporary, for task 9: queues one demo work item, to show the path from the
 * browser through the API and the queue to the worker. It is removed when the
 * first real work exists.
 *
 * The page only learns that the item was queued. That it was done is seen in
 * the worker's terminal. Showing "done" here needs a status row in Postgres,
 * which is task 10.
 */
export function DemoWorkButton() {
  const [state, setState] = useState<DemoState>({ kind: "idle" });

  async function onClick() {
    setState({ kind: "sending" });
    try {
      const { workItem } = await queueDemoWork();
      setState({ kind: "queued", workItemId: workItem.id });
    } catch (error) {
      setState({ kind: "failed", message: apiFailureMessage(error) });
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={state.kind === "sending"}
        className={`px-4 py-2 ${BUTTON_CLASSES}`}
      >
        {state.kind === "sending" ? "Please wait..." : "Run demo work item"}
      </button>

      {state.kind === "queued" ? (
        <p className="mt-3 text-sm text-brand-light-navy">
          Queued as work item {state.workItemId}. The worker&apos;s terminal shows when it is done.
        </p>
      ) : null}
      {state.kind === "failed" ? <p className="mt-3 text-sm text-red-700">{state.message}</p> : null}
    </div>
  );
}
