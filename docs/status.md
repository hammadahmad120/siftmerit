# Status

Last updated: 2026-11-17

## Now
- **Current task:** none started. Task 5 (mailbox check) is next in the list. Task 6 (Supabase project, company tables, API sign-in check) can also start, because it needs only tasks 1 and 2.
- **Built so far:** the repo root (npm workspaces, shared TypeScript settings, `.env.example`) and four parts. The API in `services/api` has one address, `/v1/health`, a request ID on every log line, clean error answers and a CORS setup that allows the web app's address. Core in `packages/core` holds the winston logger and the settings loader, and is read as TypeScript source in development. The worker in `services/worker` logs one start line and finishes; it has no queue yet. The web app in `apps/web` (Next.js 16) has one page at `/` that asks the API's health from the browser through the call helper `apiFetch`. How it all works is in `docs/developer-guide.md`, and the table map is in `docs/table-map.md`.
- **Next step:** task 5, steps 1 and 2 of the workflow (prepare, then discuss). It is a decision task and needs the user's Google setup for the test mailbox. Its open points are the Google setup, the 7-day expiry risk on personal Gmail, where mailsift runs, and its port (4200 recommended, not confirmed).
- **Waiting on the user:** the Google setup for the test mailbox (task 5), and collecting about 10 real CVs with permission (task 12).
- **Carried into task 7:** ESLint with the Next.js rules is added to the web app; the sign-in code copied from InstantBot is checked against `cacheComponents` and `partialPrefetching`; the health page at `/` is replaced. Before writing web code, read the Next.js docs shipped in `node_modules/next/dist/docs/`, as `apps/web/AGENTS.md` says.
- **Not created yet:** a permission list in `.claude/settings.json`. It was to be considered after task 4, and is not decided.
- **Type check:** `npm run typecheck` passes for the web app, the API, the worker and core.

## Finished tasks
- 2026-11-17: Task 1, table map. 12 tables agreed and written in `docs/table-map.md`. One product change came out of it: saved candidates are no longer checked automatically for every new job; HR picks which past jobs to bring them from (step 3 of the product flow, task 49).
- 2026-11-17: Task 2, repo root and API. `npm run dev:api` starts the API on port 4100 and `/v1/health` answers. Two changes from the first choices: the logger is winston, not pino, and zod is version 4, not 3, because of a security warning with no fix in version 3.
- 2026-11-17: Task 3, core package and worker. `npm run dev:worker` starts the worker, which logs one line through core's logger. The logger and the shared settings moved from the API into `packages/core`. One change from the first recommendation: core is read as source in development instead of being compiled with a watch script.
- 2026-11-17: Task 4, web app. `npm run dev:web` starts the Next.js app on port 3100, and its page at `/` shows "API: ok". The API got a CORS setup for the web app's address. One change from the first recommendation: the app was created with the `create-next-app` generator and trimmed, not written by hand from InstantBot's files. `docs/developer-guide.md` was created.

## Other work
- 2026-11-13: Set up `CLAUDE.md`, `docs/status.md` and `docs/decisions.md`, and added the product flow and the technical plan to `docs/`.
- 2026-11-16: Planning session. Agreed the task rules, cut the 22 tasks into 53, moved the queue to BullMQ on Redis, added tests and evals for the major items, and agreed how the test CV set is gathered. `docs/tech-plan.md`, `docs/decisions.md` and `CLAUDE.md` were updated to match.
