// The one helper every screen uses to call the API. Copied from InstantBot's
// `platformFetch` and `PlatformApiError`, with two changes: the sign-in token
// is optional, and the error keeps the request ID.

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
 * Calls the API and returns the JSON answer.
 *
 * - An error answer from the API is thrown as an `ApiError`.
 * - If the API cannot be reached at all (it is stopped, or the browser blocked
 *   the call), `fetch` itself throws, and that error is passed on unchanged.
 *
 * `accessToken` is the signed-in user's token. Addresses that need no sign-in,
 * such as `/v1/health`, are called without it.
 */
export async function apiFetch<T>(
  path: string,
  accessToken?: string,
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

/**
 * Who the signed-in user is and which company they belong to. A user with no
 * company gets an `ApiError` with status 403 and the code `no_company`.
 */
export function getMe(accessToken: string): Promise<Me> {
  return apiFetch<Me>("/v1/me", accessToken);
}
