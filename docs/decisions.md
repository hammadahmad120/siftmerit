# Decisions

One line per decision, written at the moment it is settled. Newest at the bottom of each table. Decisions made before 2026-11-13 are in [tech-plan.md](tech-plan.md) section 3.

## How we work

| Date | Decision | Why |
|---|---|---|
| 2026-11-13 | `CLAUDE.md` holds the product summary, the workflow, the rules and the structure. It is loaded in every session and stays short. | It is read every session, and a long file means the rules get less attention. |
| 2026-11-13 | `docs/status.md` is pulled into `CLAUDE.md` automatically. The product flow and the technical plan are read only when a task needs them. | Loading both long documents every session costs tokens and hides the short rules. |
| 2026-11-13 | Every task follows the eight-step workflow in `CLAUDE.md`, with two go-aheads: one for the plan and one to start building. | The user wants discussion and a reviewed plan before any code is touched. |
| 2026-11-13 | No decision is made on an assumption. The list of what must be confirmed first is in `CLAUDE.md` under "Decisions". Small details that follow from the plan or an existing pattern need no question but are listed in the Explain step. | The user wants to confirm every real decision, without being stopped for variable names. |
| 2026-11-13 | After every task, small or big, the work is explained in simple words, with the steps to validate it. | The user wants to understand how each task was built and how it works. |
| 2026-11-13 | A developer guide, `docs/developer-guide.md`, is kept up to date in every wrap-up. It is organised by part of the product and describes what exists now. It is created at the end of Task 1. | A new developer needs one place to learn the product. Before Task 1 there is nothing real to write in it. |
| 2026-11-13 | Docs are synced only after the user confirms the task works. Decisions are the exception: they are written when settled. | Docs should never describe something broken, and a decision recorded late can be missed. |
| 2026-11-13 | At the start of every session the status is compared with the git state. | It catches a wrap-up that was missed. |
| 2026-11-13 | No separate change log. Code changes are recorded in git commit messages. | A second copy would fall out of date. |
| 2026-11-13 | No rules files, skills, subagents or hooks for now. A hook for the type check is added if it is ever skipped. A permission list in `.claude/settings.json` is considered after Task 1. | The docs cover the need, and each extra is one more thing to maintain. |
| 2026-11-13 | Commits are made only when the user asks. The InstantBot and mailsift repos are treated as read-only unless the user says otherwise. | Both keep changes under the user's control. |
| 2026-11-13 | If `tech-plan.md` sections 2 or 7 differ from `CLAUDE.md`, `CLAUDE.md` wins. `tech-plan.md` is kept as the plan agreed on 2026-11-12. | Each rule should have one place where it is current. |

## Product and code

None yet.

## Open points for later tasks

Raised in discussion and **not decided**. Each is settled inside its task.

| Task | Point | Recommended so far |
|---|---|---|
| 1 | Package manager | npm workspaces, the same as InstantBot, so copied code fits without changes. |
| 1 | Ports | Web 3100, API 4100, mailsift 4200 later. InstantBot uses 3001 and 4000, and mailsift defaults to 3000. |
| 1 | How `packages/core` is consumed in development | Compiled to `dist` with a watch script, the same as InstantBot's `platform-core`. |
| 1 | Logger | pino. InstantBot has no logger library to copy. |
| 2 | How migrations are applied | The Supabase CLI and Docker are not installed on the development machine. The simplest option is to paste the SQL files into the Supabase SQL editor after a go-ahead. |
| 12 | Table shape for candidates | "One fact sheet per candidate, ticks per candidate per job" should be in the tables from task 12 on, or task 21 (saved candidates) becomes a rewrite. |
| 12, 13 | Masking and the proof-line check | The AI sees masked CV text, so the proof-line check must compare against the masked text, not the original. |
| 12 | Hiding names | Code can find emails and phone numbers by pattern, but not names. |
| 14 | Scoring gaps | "Mentioned only" has no point value yet. It is not stated whether an "unclear" must counts as the one missed must in lenient mode. |
| 5, 7, 19 | AI SDK details | InstantBot uses AI SDK v6. Check the current docs for tool calling and the MCP client before building, not memory. |
