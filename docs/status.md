# Status

Last updated: 2026-11-17

## Now
- **Current task:** none started. Task 3 (core package and worker) is next.
- **Built so far:** the repo root (npm workspaces, shared TypeScript settings, `.env.example`) and the API in `services/api`. The API has one address, `/v1/health`, a settings check, a winston logger with a request ID on every line, and clean error answers. The table map is in `docs/table-map.md`.
- **Next step:** task 3, steps 1 and 2 of the workflow (prepare, then discuss). Its open point is how `packages/core` is used in development: compiled with a watch script, or read as source. The recommended answer is in `docs/decisions.md` under "Open points for later tasks" and is not confirmed. Already decided for task 3: the logger file moves from the API into `packages/core`.
- **Waiting on the user:** nothing blocks task 3. Hand work that can start at any time: the Google setup for the test mailbox (task 5) and collecting about 10 real CVs with permission (task 12).
- **Not created yet:** `docs/developer-guide.md` (end of task 4, when the API, worker and web app all exist) and a permission list in `.claude/settings.json` (after task 4, once the commands exist).
- **Type check:** `npm run typecheck` passes.

## Finished tasks
- 2026-11-17: Task 1, table map. 12 tables agreed and written in `docs/table-map.md`. One product change came out of it: saved candidates are no longer checked automatically for every new job; HR picks which past jobs to bring them from (step 3 of the product flow, task 49).
- 2026-11-17: Task 2, repo root and API. `npm run dev:api` starts the API on port 4100 and `/v1/health` answers. Two changes from the first choices: the logger is winston, not pino, and zod is version 4, not 3, because of a security warning with no fix in version 3.

## Other work
- 2026-11-13: Set up `CLAUDE.md`, `docs/status.md` and `docs/decisions.md`, and added the product flow and the technical plan to `docs/`.
- 2026-11-16: Planning session. Agreed the task rules, cut the 22 tasks into 53, moved the queue to BullMQ on Redis, added tests and evals for the major items, and agreed how the test CV set is gathered. `docs/tech-plan.md`, `docs/decisions.md` and `CLAUDE.md` were updated to match.
