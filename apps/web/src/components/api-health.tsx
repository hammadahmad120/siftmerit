"use client";

import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";

type HealthAnswer = { status: string };

type HealthState =
  | { kind: "checking" }
  | { kind: "ok"; status: string }
  | { kind: "failed"; message: string };

/**
 * Runs in the browser. Asks the API's health address once, when the page
 * opens, and shows one of three states: checking, ok or failed.
 */
export function ApiHealth() {
  const [state, setState] = useState<HealthState>({ kind: "checking" });

  useEffect(() => {
    // If the page is left before the answer arrives, the answer is dropped.
    let left = false;

    apiFetch<HealthAnswer>("/v1/health")
      .then((answer) => {
        if (!left) setState({ kind: "ok", status: answer.status });
      })
      .catch((error: unknown) => {
        if (left) return;
        if (error instanceof ApiError) {
          // The API answered, but with an error.
          const id = error.requestId ? ` (request ID ${error.requestId})` : "";
          setState({ kind: "failed", message: `${error.message}${id}` });
        } else {
          // No answer at all: the API is stopped, or the browser blocked the call.
          setState({ kind: "failed", message: "The API cannot be reached" });
        }
      });

    return () => {
      left = true;
    };
  }, []);

  if (state.kind === "checking") {
    return <p className="text-gray-600">Checking the API...</p>;
  }
  if (state.kind === "ok") {
    return <p className="text-green-700">API: {state.status}</p>;
  }
  return <p className="text-red-700">{state.message}</p>;
}
