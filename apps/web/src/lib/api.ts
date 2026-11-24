// The one helper every screen uses to call the API. It started as a copy of
// InstantBot's `platformFetch` and `PlatformApiError`. Three things changed:
// the error keeps the request ID, the helper gets the sign-in token by
// itself, and it deals in one place with a session the API no longer accepts.

import { getAccessToken, signOutHere } from "@/lib/supabase";

/** An error answer from the API. `requestId` finds the matching line in the API logs. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** The API's address, without a slash at the end. */
export function apiBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";
  return url.replace(/\/$/, "");
}

// Every error answer from the API has the shape
//   { error: { code, message, requestId } }
async function parseError(res: Response): Promise<ApiError> {
  let message = res.statusText;
  let code: string | undefined;
  let requestId: string | undefined;
  try {
    const body = (await res.json()) as {
      error?: { message?: string; code?: string; requestId?: string };
    };
    message = body.error?.message ?? message;
    code = body.error?.code;
    requestId = body.error?.requestId;
  } catch {
    // The answer was not JSON. Keep the status text.
  }
  return new ApiError(res.status, message, code, requestId);
}

/**
 * One call to the API with the token the caller hands in. This is the inner
 * step. Screens use `apiFetch` below; only the sign-in form calls this one
 * directly, because it asks the API before the user is let in.
 *
 * - An error answer from the API is thrown as an `ApiError`.
 * - If the API cannot be reached at all (it is stopped, or the browser blocked
 *   the call), `fetch` itself throws, and that error is passed on unchanged.
 */
async function apiFetchWithToken<T>(
  path: string,
  accessToken: string | null,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    throw await parseError(res);
  }

  return (await res.json()) as T;
}

/**
 * Calls the API as the signed-in user and returns the JSON answer. Every
 * screen uses this, and no screen ever handles a token.
 *
 * The token is asked from the Supabase library on every call and never kept
 * here: it lives about an hour, and the library swaps it for a new one. Asking
 * is cheap. The library answers from memory and goes to the network only when
 * the token has run out.
 *
 * When the API says the session is no longer good, the user is signed out
 * here, in one place: a 401 (the token is not accepted) or the code
 * `no_company` (the user's company is gone). The guard around the page then
 * goes to the sign-in page. The error is still thrown, so the screen stops
 * what it was doing.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = await getAccessToken();

  try {
    return await apiFetchWithToken<T>(path, accessToken, init);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await signOutHere();
    } else if (error instanceof ApiError && error.code === "no_company") {
      await signOutHere("no_company");
    }
    throw error;
  }
}

/**
 * The line a screen shows when a call to the API failed. An error answer
 * gives the API's own message with its request ID. Anything else means no
 * answer came at all: the API is stopped, or the browser blocked the call.
 */
export function apiFailureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const id = error.requestId ? ` (request ID ${error.requestId})` : "";
    return `${error.message}${id}`;
  }
  return "The API cannot be reached";
}

/** The answer of `GET /v1/me`. Code says "tenant"; screens say "company". */
export type Me = {
  user: { id: string; role: "owner" | "member" };
  tenant: { id: string; name: string; slug: string };
};

/** Who the signed-in user is and which company they belong to. */
export function getMe(): Promise<Me> {
  return apiFetch<Me>("/v1/me");
}

/** Where a job stands. A new job is a draft. */
export type JobStatus = "draft" | "open" | "closed";

/** A job in the list: the short fields only, without the description. */
export type JobSummary = {
  id: string;
  /** The job's short name on our screens. */
  title: string;
  /** The phrases looked for in email subjects. */
  subjectWords: string[];
  status: JobStatus;
  /** A plain date, `YYYY-MM-DD`. Mail from this day onward is looked at. */
  postingDate: string;
  createdAt: string;
};

/** One job in full. */
export type Job = JobSummary & {
  description: string;
};

/** What the form sends to create a job. */
export type NewJob = {
  title: string;
  description: string;
  subjectWords: string[];
  /** Left out: the API uses 7 days back. */
  postingDate?: string;
  /**
   * A random key the form makes once. The API never saves a second job under
   * the same key: it answers with the first one. So sending the same form
   * twice is safe.
   */
  createKey: string;
};

/** Saves a new job for the user's company and gives it back. */
export function createJob(job: NewJob): Promise<{ job: Job }> {
  return apiFetch<{ job: Job }>("/v1/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(job),
  });
}

/** The company's newest jobs, newest first. */
export function listJobs(): Promise<{ jobs: JobSummary[] }> {
  return apiFetch<{ jobs: JobSummary[] }>("/v1/jobs");
}

/**
 * One job of the user's company. An ID that does not exist, or that belongs
 * to another company, gets an `ApiError` with status 404 and the code
 * `job_not_found`.
 */
export function getJob(jobId: string): Promise<{ job: Job }> {
  return apiFetch<{ job: Job }>(`/v1/jobs/${encodeURIComponent(jobId)}`);
}

/** One piece of background work, as the API reports it from Postgres. */
export type WorkRun = {
  id: string;
  kind: string;
  status: "waiting" | "running" | "done" | "failed";
  /** Which try the run is on. 0 until a worker has started it. */
  attempt: number;
  /** A short fixed word for why it failed, or null. */
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

/**
 * How a demo run should behave. Test only: each word shows one case.
 * `delayed` waits 20 seconds before it runs, `fail_once` fails on its first
 * try, `fail_always` on every try, and `slow` takes 20 seconds.
 */
export type DemoMode = "ok" | "delayed" | "fail_once" | "fail_always" | "slow";

/**
 * Asks the API to start one demo run. The answer comes back at once, with the
 * run still `waiting`: the worker does the work a moment later. When the
 * company already has an unfinished demo run, the API answers 409 with the
 * code `already_queued`.
 * Temporary, like the panel that calls it.
 */
export function startDemoRun(mode: DemoMode): Promise<{ run: WorkRun }> {
  return apiFetch<{ run: WorkRun }>("/v1/demo-work", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
}

/** The company's newest demo runs, newest first. Temporary. */
export function listDemoRuns(): Promise<{ runs: WorkRun[] }> {
  return apiFetch<{ runs: WorkRun[] }>("/v1/demo-work");
}

/**
 * The same question, asked by the sign-in form straight after Supabase
 * accepted the password, with the token from that answer. Nothing is signed
 * out here: the form decides what to do and which message to show. A user
 * with no company gets an `ApiError` with status 403 and the code `no_company`.
 */
export function getMeAtSignIn(accessToken: string): Promise<Me> {
  return apiFetchWithToken<Me>("/v1/me", accessToken);
}
