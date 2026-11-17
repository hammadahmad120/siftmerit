# Developer guide

How the built product works, for a developer who is new to it. It is organised by part of the product and describes what exists now. It covers the flow, the reasons and the traps, not every file. It is updated in the wrap-up of every task that changes how something works.

- What the product should do: [product-flow.md](product-flow.md).
- What is planned and in which order: [tech-plan.md](tech-plan.md) section 8.
- Why each choice was made: [decisions.md](decisions.md).
- What is finished and what is next: [status.md](status.md).

## 1. The parts

One repo with four parts, joined by npm workspaces. One `npm install` at the repo root installs the libraries for all of them.

| Part | Folder | Name | What it does today |
|---|---|---|---|
| Web app | `apps/web` | `@siftmerit/web` | One page that shows whether the API can be reached. |
| API | `services/api` | `@siftmerit/api` | One address, `/v1/health`. |
| Worker | `services/worker` | `@siftmerit/worker` | Starts, logs one line and finishes. There is no queue yet. |
| Core | `packages/core` | `@siftmerit/core` | Shared code for the API and the worker: the logger and the settings loader. |

How they talk today:

```
Browser  --->  Web app (Next.js, port 3100)     sends the page
Browser  --->  API (Express, port 4100)         the page's own calls
API, Worker  --->  Core                         imported as a package
```

The database, the queue, the mailbox and the AI model are not connected yet.

## 2. Running it

Run from the repo root, each in its own terminal.

| Command | What it starts |
|---|---|
| `npm run dev:api` | The API on port 4100. Health check: `http://localhost:4100/v1/health`. |
| `npm run dev:worker` | The worker. It logs one start line and then waits for file changes. |
| `npm run dev:web` | The web app on `http://localhost:3100`. |
| `npm run typecheck` | The type check for all four parts. It must pass after every task. |

All three `dev` commands restart their part when a file changes.

### Settings

- There is one `.env` file, at the repo root, for every part. `.env.example` lists every setting.
- Every setting has a default, so everything starts without a `.env` file.
- A setting already present in the shell wins over the file. For example, `LOG_LEVEL=debug npm run dev:api`.
- A setting is added by the task that first uses it.

| Setting | Used by | Default |
|---|---|---|
| `NODE_ENV` | API, worker | `development` |
| `LOG_LEVEL` | API, worker | `info` |
| `API_PORT` | API | `4100` |
| `CORS_ORIGIN` | API | `http://localhost:3100` |
| `NEXT_PUBLIC_API_URL` | Web app | `http://localhost:4100` |

A bad setting stops the part at start with a message that names it, for example `API settings check failed. Fix these in the repo-root .env file or your shell: API_PORT (...)`.

## 3. Core (`packages/core`)

Core is a workspace package: a folder in the repo that the API and the worker import by name, `@siftmerit/core`, as if it were a library. `npm install` makes a link to it in `node_modules`.

**It is read as TypeScript source.** Core's `package.json` points its entry at `src/index.ts`. The API and the worker run through `tsx` in development, which reads TypeScript directly. So there is no compile step and no watch script: change a core file, and the API and the worker restart with the new code.

**What it offers** (everything is listed in `src/index.ts`):

- `createLogger({ service, level, style })`: builds the winston logger. `service` is printed on every line, so the API's lines and the worker's lines can be told apart. `style` is `readable` (one short line for a person) or `json` (one structured line for a log service). Both services pick `json` when `NODE_ENV` is `production`.
- `loadSettings(partName, schema)`: reads the root `.env` and checks the settings against a zod schema.
- `sharedEnvSchema`: the settings both services use (`NODE_ENV`, `LOG_LEVEL`). A service adds its own with `sharedEnvSchema.extend({ ... })`.

**Traps**

- Production needs JavaScript. A service's own `tsc` build does not write core's JavaScript, so the production build must compile core too. This is an open point for task 53.
- The web app does not use core. Core holds server-only code.
- A type error inside core is reported by the type check of the API and the worker as well, because they read core's source.

## 4. API (`services/api`)

The layout is routes -> controllers -> services -> repositories. Only routes and controllers exist so far.

### The path of a request

`src/app.ts` lists the steps in order:

1. **Request log.** Makes a request ID, attaches a logger that carries it (`req.log`), sends the ID back as the `x-request-id` header, and prints one "request finished" line when the answer has been sent.
2. **CORS.** Tells browsers which web address may read the API's answers. See below.
3. **Routes.** Everything is under `/v1`.
4. **Not found.** An unknown address becomes a normal "not found" error.
5. **Error step.** Turns any error into a clean JSON answer.

### Error answers

Every error answer has the same shape, so the web app handles them all the same way:

```json
{ "error": { "code": "route_not_found", "message": "No route for GET /v1/nothing", "requestId": "..." } }
```

- **One of our own errors** (the classes in `src/lib/errors.ts`): the log gets a "request refused" line with the error name, code and status, never the message. The caller gets the code, the message and the request ID.
- **An unexpected error:** the log gets a "request failed" line with the name, message and trace. The caller gets only "Internal server error" and the request ID.

A reported error is found in the logs by its request ID.

### CORS

A browser hides an answer from a page on another address unless the answering side names that address. The web app is on port 3100 and the API on 4100, so they count as different addresses. The API therefore adds `Access-Control-Allow-Origin` with the value of `CORS_ORIGIN` to its answers.

- Only one address is allowed, never "everyone".
- Cookies are not allowed across. The sign-in token will travel in a header.
- CORS is a browser rule, not sign-in. A script or `curl` ignores it. The sign-in check (task 6) is what protects data.
- The CORS step sits after the request log step, so every browser request still gets a log line.

**Trap:** the address must match exactly: scheme, host and port. `http://127.0.0.1:3100` is a different address from `http://localhost:3100`. When the page says "The API cannot be reached" while the API is running, check this first; the browser's console shows a CORS message.

### Logging rules

- Every line carries a request ID (API) or, later, a work item ID (worker). Start-up lines carry neither.
- Lines hold IDs only: never CV text, email content, names, contact details or secret keys.
- The request line holds the method, the address without anything after `?`, the status and the time taken.
- Logs are printed to the terminal. The app never writes log files.

## 5. Worker (`services/worker`)

Today the worker loads its settings, builds the logger with `service: "worker"`, logs one start line and finishes. Under `npm run dev:worker` it then waits for file changes, which is normal.

Task 9 adds the BullMQ queue listener. That keeps the process running and brings the logger that carries a work item ID.

## 6. Web app (`apps/web`)

A Next.js 16 app with React 19 and Tailwind 4, using the App Router and a `src` folder. It was created with the `create-next-app` generator (empty template) and then trimmed.

### What exists

- `src/app/layout.tsx`: the outer frame of every page.
- `src/app/page.tsx`: the page at `/`. It shows the heading and the health check. Task 7 replaces it with the redirect to sign-in or the dashboard.
- `src/components/api-health.tsx`: asks `/v1/health` once when the page opens and shows one of three states: "Checking the API...", "API: ok", or a failure line.
- `src/lib/api.ts`: the call helper.

### Server part and browser part

In Next.js a file runs on the server unless it starts with `"use client"`. `page.tsx` is a server part. `api-health.tsx` starts with `"use client"`, so it runs in the browser. Calls to the API are made from browser parts, because the rule of the product is that the browser talks to the API.

### The call helper

Every screen calls the API through `apiFetch(path, accessToken?, init?)`. It puts the API's address in front of the path, attaches the sign-in token when one is given, and returns the JSON answer.

- An error answer from the API is thrown as an `ApiError` with the status, the code, the message and the request ID.
- If the API cannot be reached at all (it is stopped, or the browser blocked the call), `fetch` itself throws and that error is passed on. A screen tells the two apart with `error instanceof ApiError`.

### Settings in the web app

- The web app reads the root `.env`, through a few lines at the top of `next.config.ts`. It has no `.env` of its own.
- Next.js hands a setting to the browser only when its name starts with `NEXT_PUBLIC_`. Such a setting is copied into the code sent to the browser, so anyone can read it. **A secret never gets the `NEXT_PUBLIC_` prefix.**
- A `NEXT_PUBLIC_` value is fixed when the web app is started or built. Restart `npm run dev:web` after changing one.

### Traps

- **Next.js 16 differs from older versions.** `apps/web/AGENTS.md` (written by Next.js itself, and written back by `next dev` if removed) says to read the docs shipped in `node_modules/next/dist/docs/` before writing web code. Do that instead of working from memory.
- **`cacheComponents` and `partialPrefetching` are on** in `next.config.ts`. They change how the Next.js server prepares and caches pages. InstantBot runs with both off, so server-side code copied from it (first in task 7) must be checked against them.
- **The web type check is `next typegen && tsc --noEmit`.** Next.js generates some types first, such as `LayoutProps`. Plain `tsc` alone fails on a fresh clone.
- **Its TypeScript settings are Next's own.** `apps/web/tsconfig.json` does not extend the shared `tsconfig.base.json`, which is set up for Node.
- **No lint tool yet.** ESLint with the Next.js rules is added in task 7.
- **No look yet.** Fonts, brand colours and dark mode are decided with the dashboard shell in task 8.
