"use client";

import { useEffect, useState } from "react";
import { apiFailureMessage, listDemoRuns, startDemoRun, type WorkRun } from "@/lib/api";
import { BUTTON_CLASSES } from "@/lib/styles";

/** How often the list is asked for again while a run is unfinished. */
const REFRESH_MS = 2000;

/** How many runs the list shows. The API sends the same number. */
const SHOWN_RUNS = 10;

function isUnfinished(run: WorkRun): boolean {
  return run.status === "waiting" || run.status === "running";
}

/** The time of day, as the user's own computer writes it. */
function timeOfDay(value: string | null): string {
  return value ? new Date(value).toLocaleTimeString() : "";
}

/**
 * Temporary, for tasks 9 and 10: starts a demo run and lists the company's
 * last runs, to show the path from the browser through the API and the queue
 * to the worker, and the status in Postgres keeping in step. It is removed
 * when the first real work exists.
 *
 * Everything shown here is read from Postgres through the API. The page never
 * looks at the queue.
 */
export function DemoWorkPanel() {
  // `null` until the first answer has arrived.
  const [runs, setRuns] = useState<WorkRun[] | null>(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const hasUnfinished = runs?.some(isUnfinished) ?? false;

  // The list is asked for once when the panel appears.
  useEffect(() => {
    // If the page is left before the answer arrives, the answer is dropped.
    let left = false;

    listDemoRuns()
      .then((answer) => {
        if (!left) setRuns(answer.runs);
      })
      .catch((error: unknown) => {
        if (!left) setProblem(apiFailureMessage(error));
      });

    return () => {
      left = true;
    };
  }, []);

  // While a run is waiting or running, the list is asked for again every two
  // seconds. When every run is done or failed the asking stops, so an idle
  // page does not keep calling the API.
  useEffect(() => {
    if (!hasUnfinished) return;
    let left = false;

    const timer = setInterval(() => {
      listDemoRuns()
        .then((answer) => {
          if (left) return;
          setRuns(answer.runs);
          setProblem(null);
        })
        .catch((error: unknown) => {
          if (!left) setProblem(apiFailureMessage(error));
        });
    }, REFRESH_MS);

    return () => {
      left = true;
      clearInterval(timer);
    };
  }, [hasUnfinished]);

  async function onStart() {
    setSending(true);
    setProblem(null);
    try {
      const { run } = await startDemoRun();
      // The new run goes on top at once, still `waiting`. That also starts
      // the two-second refresh above.
      setRuns((old) => [run, ...(old ?? [])].slice(0, SHOWN_RUNS));
    } catch (error) {
      setProblem(apiFailureMessage(error));
      // The API may have saved a row and marked it failed, for example when
      // the queue cannot be reached. The list is asked for once more to show it.
      try {
        const answer = await listDemoRuns();
        setRuns(answer.runs);
      } catch {
        // The first message already says what is wrong.
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={onStart}
        disabled={sending}
        className={`px-4 py-2 ${BUTTON_CLASSES}`}
      >
        {sending ? "Please wait..." : "Run demo work item"}
      </button>

      {problem ? <p className="mt-3 text-sm text-red-700">{problem}</p> : null}

      <div className="mt-5">
        {runs === null ? (
          <p className="text-sm text-brand-light-navy">Loading the runs...</p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-brand-light-navy">No runs yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-brand-light-navy">
              <tr>
                <th className="py-1 pr-4 font-medium">Created</th>
                <th className="py-1 pr-4 font-medium">Status</th>
                <th className="py-1 pr-4 font-medium">Try</th>
                <th className="py-1 pr-4 font-medium">Started</th>
                <th className="py-1 pr-4 font-medium">Finished</th>
                <th className="py-1 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-t border-brand-navy/10">
                  <td className="py-1.5 pr-4">{timeOfDay(run.createdAt)}</td>
                  <td
                    className={`py-1.5 pr-4 font-medium ${run.status === "failed" ? "text-red-700" : ""}`}
                  >
                    {run.status}
                  </td>
                  <td className="py-1.5 pr-4">{run.attempt === 0 ? "" : run.attempt}</td>
                  <td className="py-1.5 pr-4">{timeOfDay(run.startedAt)}</td>
                  <td className="py-1.5 pr-4">{timeOfDay(run.finishedAt)}</td>
                  <td className="py-1.5 text-red-700">{run.error ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
