# Status

Last updated: 2026-11-17

## Now
- **Current task:** none started. Task 4 (web app) is next.
- **Built so far:** the repo root (npm workspaces, shared TypeScript settings, `.env.example`), the API in `services/api`, the shared package in `packages/core` and the worker in `services/worker`. The API has one address, `/v1/health`, a request ID on every log line, and clean error answers. Core holds the winston logger and the settings loader (reading the root `.env`, plus the shared settings `NODE_ENV` and `LOG_LEVEL`). The worker loads its settings, logs one start line and finishes; it has no queue yet. The table map is in `docs/table-map.md`.
- **How core is used:** it is read as TypeScript source in development, with no compile step and no watch script. Compiling it for production is an open point for task 53.
- **Next step:** task 4, steps 1 and 2 of the workflow (prepare, then discuss). Its open point is the web port; the recommended answer (3100) is in `docs/decisions.md` under "Open points for later tasks" and is not confirmed.
- **Waiting on the user:** nothing blocks task 4. Hand work that can start at any time: the Google setup for the test mailbox (task 5) and collecting about 10 real CVs with permission (task 12).
- **Not created yet:** `docs/developer-guide.md` (end of task 4, when the API, worker and web app all exist) and a permission list in `.claude/settings.json` (after task 4, once the commands exist).
- **Type check:** `npm run typecheck` passes for the API, the worker and core.

## Finished tasks
- 2026-11-17: Task 1, table map. 12 tables agreed and written in `docs/table-map.md`. One product change came out of it: saved candidates are no longer checked automatically for every new job; HR picks which past jobs to bring them from (step 3 of the product flow, task 49).
- 2026-11-17: Task 2, repo root and API. `npm run dev:api` starts the API on port 4100 and `/v1/health` answers. Two changes from the first choices: the logger is winston, not pino, and zod is version 4, not 3, because of a security warning with no fix in version 3.
- 2026-11-17: Task 3, core package and worker. `npm run dev:worker` starts the worker, which logs one line through core's logger. The logger and the shared settings moved from the API into `packages/core`. One change from the first recommendation: core is read as source in development instead of being compiled with a watch script.

## Other work
- 2026-11-13: Set up `CLAUDE.md`, `docs/status.md` and `docs/decisions.md`, and added the product flow and the technical plan to `docs/`.
- 2026-11-16: Planning session. Agreed the task rules, cut the 22 tasks into 53, moved the queue to BullMQ on Redis, added tests and evals for the major items, and agreed how the test CV set is gathered. `docs/tech-plan.md`, `docs/decisions.md` and `CLAUDE.md` were updated to match.
