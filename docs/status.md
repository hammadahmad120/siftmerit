# Status

Last updated: 2026-11-17

## Now
- **Current task:** none started. Task 2 (repo root and API: workspaces, env file, logger, health check) is next. It is the first build task.
- **Built so far:** no product code. The working setup (`CLAUDE.md` and the files in `docs/`) and the table map in `docs/table-map.md`.
- **Next step:** task 2, steps 1 and 2 of the workflow (prepare, then discuss). Its open points are the local folder, the package manager, the API port and the logger. The recommended answers are in `docs/decisions.md` under "Open points for later tasks". None of them is confirmed yet.
- **Waiting on the user:** nothing blocks task 2. Hand work that can start at any time: the Google setup for the test mailbox (task 5) and collecting about 10 real CVs with permission (task 12).
- **Not created yet:** `docs/developer-guide.md` (end of task 4, when the API, worker and web app all exist) and a permission list in `.claude/settings.json` (after task 4, once the commands exist).
- **Type check:** cannot run yet. There is no `package.json` until task 2.

## Finished tasks
- 2026-11-17: Task 1, table map. 12 tables agreed and written in `docs/table-map.md`. One product change came out of it: saved candidates are no longer checked automatically for every new job; HR picks which past jobs to bring them from (step 3 of the product flow, task 49).

## Other work
- 2026-11-13: Set up `CLAUDE.md`, `docs/status.md` and `docs/decisions.md`, and added the product flow and the technical plan to `docs/`.
- 2026-11-16: Planning session. Agreed the task rules, cut the 22 tasks into 53, moved the queue to BullMQ on Redis, added tests and evals for the major items, and agreed how the test CV set is gathered. `docs/tech-plan.md`, `docs/decisions.md` and `CLAUDE.md` were updated to match.
