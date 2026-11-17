# Siftmerit

AI hiring tool for small and mid-size companies. HR gives a job description. The product finds the matching CVs in the company mailbox, scores each one against the job's requirements, and shows the best five with a proof line for every tick.

Two goals: a working pilot product, and learning tool calling, MCP and agent building. The chat agent is a main part of the product and grows task by task.

## Start of every session
- The current state is at the bottom of this file (pulled in from docs/status.md). Compare it with `git log` and `git status`. If they do not match, say so and correct the status first.
- Say where we are and what is next before doing anything else.

## How we talk
- Plain simple words. Explain with a small example.
- Hold questions until the discussion is finished, then ask them one at a time.
- Honest advice, including when an idea is weak or is more than a pilot needs.

## Workflow for every task
The rules for what makes a task (size, kinds, when to split) are at the top of docs/tech-plan.md section 8. The two go-aheads (steps 3 and 5) always stay, even for a small fix. For a design or decision task, the result is a doc or lines in docs/decisions.md, not code.

1. **Prepare.** Read the task's row in docs/tech-plan.md section 8, the product-flow steps it names, docs/decisions.md, the related part of docs/developer-guide.md, and the code that will be touched or copied.
2. **Discuss.** As two senior developers: options, trade-offs, scale, speed, cost, privacy, edge cases, likely bugs. Give a recommendation and disagree when needed. Write each decision into docs/decisions.md at the moment it is settled.
3. **Plan.** Only when the user asks for the plan. It lists the files to add or change, tables and SQL, the flow, what is copied from InstantBot, what is left out, how to check it, and a "Decisions in this plan" list.
4. **Review.** Update the plan as the user asks. Do not touch the codebase.
5. **Build.** Only when the user says to start. `npm run typecheck` must pass. Anything outside the plan: stop and ask.
6. **Explain.** In simple words: what was built, the files added or changed and the job of each, the path of one real request step by step, why it was done this way, the small choices made without asking, any new idea (tool calling, MCP, agents) explained plainly, and the exact steps for the user to validate it.
7. **Validate.** The user runs the steps. Fix and repeat until the user confirms it works.
8. **Wrap up.** Only after the user confirms. See the checklist below.

## Decisions
- Never decide on an assumption. Check the code or the docs. If it cannot be checked, say so and ask.
- Confirm with the user before any choice about product behaviour, data (tables, columns, what is stored or deleted), libraries or services, folders or code patterns, privacy, security, company separation, AI cost, anything the docs leave open, any step away from the approved plan, or removing something that works.
- When asking: give the options, a recommendation and the reason.
- Only details that follow directly from the approved plan or from a pattern already in the code need no question. List them in the Explain step.
- If unsure whether to ask, ask.

## Wrap up
Run this at the end of a task, or whenever the user says "wrap up" (mid-task: record what is finished and what is left).

- docs/status.md: rewrite the "Now" part, and add one line under "Finished tasks" when a task is done.
- docs/decisions.md: check that no decision from the session is missing.
- docs/developer-guide.md: update it when the task changed how something works. It is organised by part of the product, describes what exists now, and covers the flow, the reasons and the traps, not every file.
- docs/table-map.md: update it when a table is added or its links change.
- CLAUDE.md: change it only if a rule for all code, a command or the structure changed.
- docs/tech-plan.md and docs/product-flow.md: change them only if the plan or the product behaviour itself changed, and add a line to docs/decisions.md saying why.
- Run `npm run typecheck` and say plainly if it fails.
- Report what changed in each file and what is uncommitted. Commit only when asked.

## Rules for all code
- "Job" means a hiring job. Background work is a "work item" in a BullMQ queue on Redis (BullMQ's own word for it is "job"; ours is not). Code says `tenant` and `tenant_id`; screens say "company".
- Every table has `tenant_id`, taken from the signed-in user, never from the request. Every repository function filters by it. Database row rules are a second lock.
- The browser talks only to the API, never to the database.
- A secret never gets the `NEXT_PUBLIC_` prefix. Settings with that prefix are handed to the browser, where anyone can read them.
- Every AI call goes through the one wrapper in packages/core: the result is checked by code before saving, tokens and cost are logged, CV text is masked first, and CV and email text is wrapped as data with an instruction to ignore commands inside it.
- Mail is found and picked by code, never by AI. Mail access is read-only and goes through mailsift.
- Long work is queued, never run inside an API request or a chat reply. Every work item has a retry limit, and every handler is safe to run twice.
- What HR sees (status, progress, skip reasons) is saved in Postgres, never read from Redis. A work item is queued after its Postgres row is saved.
- Agent tools are thin wrappers around workflow actions that a screen button also calls. Actions that cost AI money or delete data need HR's confirm click.
- No LangChain or LangGraph, no component library, no embeddings or vector search.
- Structured logs carry a request ID or a work item ID. Log lines hold IDs only, never CV text, email content, names, contact details or secret keys. The app prints its logs and never writes log files.
- Tests and evals cover the major items only. Tests: the scorer, masking, the proof-line check and company separation. Evals: the requirements draft, the CV check and fact sheet, the ticks, hidden instructions in a CV, and the top five. Everything else is checked by hand. Tests that come with copied code are kept.
- Database changes are SQL files in supabase/migrations/, forward only, applied only after an explicit go-ahead for that change.
- Code is copied from InstantBot as listed in docs/tech-plan.md section 6. The InstantBot and mailsift repos are read-only unless the user says otherwise.

## Structure
Built up task by task. Nothing is added outside this layout without asking.

```
apps/web/              Next.js screens and chat panel
services/api/          Express API: routes -> controllers -> services -> repositories
services/worker/       Takes work items from the queue and runs handlers
packages/core/         Shared logic for the API and the worker: AI wrapper, prompts,
                       masking, proof check, scorer, work queue, mailsift client,
                       secret encryption
supabase/migrations/   SQL files
docs/                  See "Docs" below
```

Main flow: browser -> API (short requests and the chat agent) -> BullMQ queue on Redis -> worker -> mailsift (MCP over HTTP) -> Gmail. The API and the worker both use Supabase (Postgres and sign-in), Redis and the AI model.

## Commands
Run from the repo root.

- `npm install`: installs the libraries for every part.
- `npm run dev:api`: starts the API on port 4100 and restarts it when a file changes. Health check: `http://localhost:4100/v1/health`.
- `npm run dev:worker`: starts the worker and reruns it when a file changes. Until the queue exists (task 9) it logs one start line and waits.
- `npm run dev:web`: starts the web app on `http://localhost:3100` and reloads it when a file changes.
- `npm run typecheck`: checks every part that has a `typecheck` script.

Settings are listed in `.env.example`. A setting is added by the task that first uses it.

## Docs
- docs/product-flow.md: what the product does. Read the steps a task names.
- docs/tech-plan.md: tools, structure, what is copied from InstantBot, the task list (section 8), mailsift facts (section 9).
- docs/table-map.md: the database tables, what each keeps and how they link. Read it before any task that adds or changes a table.
- docs/decisions.md: decisions made while working, and open points for later tasks.
- docs/developer-guide.md: how the built product works, for a new developer: the parts, how to run them, the flow, the reasons and the traps.

If docs/tech-plan.md sections 2 or 7 differ from this file, this file wins.

@docs/status.md
