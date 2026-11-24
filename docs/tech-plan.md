# Siftmerit: technical plan and task list

Siftmerit is the hiring product described in the product flow document. This plan records the tools, the structure and the order of work agreed on 2026-11-12. Nothing has been built yet.

Revised on 2026-11-16: the work queue moved to BullMQ on Redis, tests and evals were added for the major items, and the task list was cut from 22 tasks into 53 smaller ones. The reasons are in [decisions.md](decisions.md).

The product flow (what the product does) is in [product-flow.md](product-flow.md), in the same folder. This plan does not repeat it. Step and section numbers below refer to that document.

## 1. Context

Small and mid-size companies receive CVs by email and sort them by hand. Siftmerit takes a job description, finds the matching CVs in the company mailbox, scores each one against the job's requirements, and shows the best five with a proof line for every tick.

Two goals shape the technical choices:

- **A working pilot product** built from pieces that already exist: the InstantBot base, the Scout matching code, and the mailsift mail server.
- **Learning tool calling, MCP and agent building.** The chat agent is therefore a main part of the product and grows task by task, instead of being added once at the end. Learning Redis and BullMQ was added as a goal on 2026-11-16.

## 2. How we work

- Plain simple words. Honest advice, including when an idea is weak.
- Discuss first. No code changes until the user says to go ahead.
- One task at a time. Each task ends with one result that can be checked. The rules for a task are at the top of section 8.
- Each task follows the workflow in `CLAUDE.md`: prepare, discuss, plan, review, build, explain, validate, wrap up.
- Feature-level decisions are made inside their task, not earlier.
- Tests and evals cover the major items only. Tests: the scorer, masking, the proof-line check and company separation. Evals: the requirements draft, the CV check and fact sheet, the ticks, hidden instructions in a CV, and the top five. Everything else is checked by hand. The type check is the gate on every build task. Tests that come with copied code are kept.
- Database changes are written as SQL files and applied only after an explicit go-ahead for that change.

## 3. Decisions made

| Area | Decision |
|---|---|
| Name | Siftmerit. `siftmerit.com` was unregistered and a web search found no product with this name on 2026-11-12. Trademarks were not checked. |
| Repo | A new GitHub repo created by the user. Separate from InstantBot. |
| Stack | One TypeScript repo: Next.js frontend, Node API, and a separate Node worker. Python is added only if a specific job needs it. |
| Database | A new hosted Supabase project (Postgres plus sign-in). No embeddings and no vector search. |
| Mail | mailsift stays a separate MCP server. Our backend calls it over HTTP. |
| Workflow | Plain code plus the work queue. No chain library (no LangChain, no LangGraph). |
| Queue | BullMQ on Redis. The worker takes work items from it. Postgres keeps everything HR sees. No RabbitMQ. Decided on 2026-11-16; the first plan used a Postgres table polled by the worker. |
| AI library | Vercel AI SDK for model calls, the forced output form, tool calling, streaming and the MCP client. |
| Agent | A real agent in the chat panel, built with AI SDK tool calling. Its tools are our own workflow actions. It also connects to mailsift as an MCP client for read-only mail questions. |
| Core flow | Steps 1 to 8 stay a fixed workflow. Mail is found and picked by code, never by AI. |
| Screens | Hand-written Tailwind components, as in InstantBot. No component library. |
| Users | Several HR users per company, all with the same access. Accounts are created by us. No public sign-up. |
| Development mailbox | Our own Gmail account, with test applications sent to it. |
| Privacy | All CV text passes through one masking step before any AI call. Code hides emails, phone numbers, links, ID numbers and dates of birth, and fills the contact boxes itself. |
| Hosting | Local for now. Settings come from one checked env file and nothing depends on local files, so it can move to a cloud service later. |
| Tests | Tests and evals for the major items only (see section 2). |

## 4. How the parts fit together

```
Browser (Next.js screens + chat panel)
        |  signed-in user's token
        v
API (Express) ---- queues work ----> BullMQ queue (Redis)
   |      |                                   |
   |      +-- chat agent (AI SDK tools)       v
   |              |                    Worker (Node)
   |              | read-only          |        |
   v              v                    v        v
Supabase     mailsift (MCP over HTTP) <-+    AI model
(Postgres,        |
 sign-in)         v
               Gmail (read-only)
```

- The browser talks only to the API. It never reads the database directly.
- The API handles short requests and the chat agent. Anything long is queued.
- The worker takes queued work: listing mail, fetching mail, reading CVs, re-ticking, daily checks. It saves its results in Supabase.
- Redis holds the queue. Everything HR sees (status, progress, skip reasons) is in Postgres.
- mailsift is the only part that touches Gmail, and it refuses any token that can do more than read.

## 5. Repo layout

```
siftmerit/
  apps/web/              Next.js screens and chat panel
  services/api/          Express API: routes -> controllers -> services -> repositories
  services/worker/       Takes work items from the queue and runs handlers
  packages/core/         Shared logic: AI wrapper, prompts, masking, proof check,
                         scorer, work queue, mailsift client, secret encryption
  supabase/migrations/   SQL files, forward only
  docs/                  product-flow.md, tech-plan.md, table-map.md, decisions.md,
                         status.md
```

**Naming rule.** "Job" always means a hiring job. Background work is called a "work item" and lives in a BullMQ queue, so the two are never confused. BullMQ's own word for a work item is "job"; our code and screens do not use it that way. Code keeps `tenant` and `tenant_id` for a company, because the copied InstantBot code uses those names. Screens say "company".

## 6. What comes from InstantBot

Source repo: `/home/hammadahmad/Documents/General-Chatbot/InstantBot`. Scout is copied, not shared. While both copies exist, Scout is not improved inside InstantBot.

Copied code counts toward a task's size and is explained as if the user has never seen InstantBot.

**Copy almost as is**

| Piece | Source |
|---|---|
| Sign-in form, sign-out | `apps/web-app/src/components/auth-form.tsx`, `sign-out-button.tsx`. InstantBot's page protection (`apps/web-app/src/proxy.ts`, `apps/web-app/src/lib/supabase/*`) is not copied: the session is kept in the browser and a guard written new protects the pages (decided in task 7) |
| API sign-in check and company lookup | `services/platform-api/src/middleware/auth.middleware.ts`, `services/auth.service.ts`, `repositories/tenant*.repository.ts` |
| Company tables | The tenancy part only of `supabase/migrations/20260611000000_platform_foundation.sql` (`tenants`, `tenant_members`, `set_updated_at()`). Its row policies and `current_tenant_ids()` are not copied: our row rules let nobody but the server in (decided in task 6) |
| Secret encryption | `packages/platform-core/src/channels/credentials-crypto.ts` |
| API skeleton | `services/platform-api/src/app.ts`, `index.ts`, `config/env.ts`, `lib/errors.ts`, `lib/supabase.ts`, `middleware/error.middleware.ts`, `lib/rate-limiter.ts` |
| Retry helper | `packages/platform-core/src/lib/retry.ts` |
| Proof-line check | `packages/platform-core/src/matching/text-normalize.ts` (with its tests) |
| API call helper for the web app | `platformFetch` and `PlatformApiError` only, from `apps/web-app/src/lib/platform-api.ts` |

**Copy and adapt**

| Piece | Source | What changes |
|---|---|---|
| AI call wiring | `services/platform-api/src/lib/llm-provider.ts`, `match-llm.ts`, `services/ingestion-worker/src/lib/extraction-llm.ts` | One shared wrapper. Adds result checking, retry on "slow down", a limit on calls side by side, and a cost log |
| Requirements from a job description | `packages/platform-core/src/matching/brief-split.ts` | Real must and nice to have. Scout's "essential" means something else. Field mapping is dropped |
| Fact sheet | `packages/platform-core/src/matching/field-extraction.ts` (prompt, `verifyFieldValues`, list and typed-value checks) | Fixed boxes instead of admin-defined fields. The 12,000 character trimming is not copied, because every CV is read in full |
| Ticks | `packages/platform-core/src/matching/requirement-check.ts` (prompt reading rules, `verifyRequirementChecks`) | One CV per call, four statuses (met, mentioned only, not met, unclear), must and nice to have |
| Dashboard shell | `apps/web-app/src/components/dashboard-shell.tsx`, `dashboard-nav.tsx` | A top bar, not a sidebar, with our own menu items. Only the "which link is active" check and the two file names are taken; the sidebar frame, the icons and the folding group are not (decided in task 8) |
| Candidate card look | The result card in `apps/web-app/src/components/collection-view.tsx` | Visual pattern only |

**Write new.** The page guard in the web app, the BullMQ queue setup, the daily check, the chat agent, the mailsift client, the "is this a CV" check, the masking step, the scorer, the eval runner, and protection against instructions hidden in CV or email text. None of these exist in InstantBot in a form we can copy.

**Leave behind.** InstantBot's Postgres queue and worker loop (`channel-message-queue.ts`, `worker-loop.ts`), chunks, embeddings, the reranker, both Python services, Scout's search and match service, collections tables, chat, widget, WhatsApp and analytics.

## 7. Rules that apply to every task

If this section differs from `CLAUDE.md`, `CLAUDE.md` wins.

**Company separation**
- Every table carries `tenant_id`. The API takes it from the signed-in user, never from the request.
- Every repository function filters by `tenant_id`. The database row rules are a second lock.

**AI calls**
- All calls go through one wrapper, with the model chosen by config.
- The output form is forced twice: the model is given the form, and code checks the result before saving.
- Every call logs its tokens, cost and purpose.
- Calls side by side are limited, with a retry when the provider says "slow down".
- CV and email text is always wrapped as data, with a standing instruction to ignore commands inside it.
- CV text is masked before any call.

**Background work**
- Long work never runs inside an API request or a chat reply. It is queued in BullMQ.
- Every work item has a retry limit. Queuing the same thing twice is refused. Every handler is safe to run twice.
- What HR sees (status, progress, skip reasons) is saved in Postgres, never read from Redis. A work item is queued after its Postgres row is saved, and the row is marked failed if queuing throws.
- Daily checks are repeating work items in BullMQ. No outside scheduler.

**Agent**
- A tool is a thin wrapper around a workflow action that a screen button also calls.
- Free actions run at once. Actions that cost AI money or delete data need HR's confirm click.
- Mail access is read-only and goes through mailsift.

**Logs**
- Structured logs with a request ID or work item ID from the first task.

## 8. Task list

53 tasks: 49 build, 2 design and 2 decision. The list runs top to bottom.

### Rules for a task

1. **One result that can be checked.** The "how to check" line fits in one sentence.
2. **One main new idea.** Two new ideas means two tasks.
3. **Ceiling: one sitting.** The task can be discussed in one session and its whole diff read in one go. Starting number: about 400 lines to read and about 10 files, copied code included, lock files not counted. The number is adjusted after the first tasks.
4. **Floor: no setup-only tasks.** Setup joins the first thing that uses it.
5. **Thin slices, not layers.** A task cuts through the database, API and screen for one small feature. The exception is a pure-code piece that shows a result alone, such as the scorer.
6. **The product runs after every task.** A task depends only on finished tasks, and the type check passes.
7. **Too big means split in the plan step,** not during the build.

### Kinds of task

- **Build:** code. The result runs.
- **Design:** a doc. The result is a doc the user approves.
- **Decision:** a choice that affects several tasks or needs a test to answer. The result is lines in `decisions.md`. Other choices are settled in the discuss step of the build task that needs them.

"Needs" lists the tasks that must be finished first. "Decide then" lists the choices deliberately left for that task.

### Foundation

| # | Task | Kind | Needs | How to check | Decide then |
|---|---|---|---|---|---|
| 1 | Table map | Design | none | The user approves a one-page doc of tables and how they link | The shape for candidates: one fact sheet per candidate, ticks per candidate per job. Where the status rows for queued work live |
| 2 | Repo root and API: workspaces, env file, logger, health check | Build | none | The type check passes and the health URL answers | Local folder, package manager, API port, the logger |
| 3 | Core package and worker | Build | 2 | The worker starts and logs a line using a core function | How `packages/core` is consumed in development: compiled to `dist` with a watch script, or read as source |
| 4 | Web app, and CORS in the API | Build | 2 | A page shows the API's health | Web port |
| 5 | Mailbox check: Google setup, mailsift over HTTP | Decision | none | A script lists five emails from the test mailbox | Google setup, the 7-day expiry risk on personal Gmail, where mailsift runs, its port |
| 6 | Supabase project, company tables, the script that creates companies and users, API sign-in check | Build | 1, 2 | One command creates a company with its owner, and a signed-in call returns the user's company | How we create companies and users, how migrations are applied to the new project |
| 7 | Web sign-in, sign-out, page protection. Also adds ESLint with the Next.js rules to the web app, and replaces the health page at `/` | Build | 4, 6 | A user signs in, and a signed-out visitor is sent to the sign-in page | Where a signed-in user lands. Whether the copied sign-in code needs changes for `cacheComponents` and `partialPrefetching` |
| 8 | Dashboard shell: menu and company name | Build | 7 | Two HR users of one company see their company, and a user of another company sees nothing of the first | Menu items |
| 9 | Redis and BullMQ basics: Redis installed, a demo work item queued by the API and run by the worker | Build | 3 | The demo item is shown as done | Redis version (check the BullMQ docs), queue names, how the demo result is shown, whether to add a BullMQ dashboard |
| 10 | Queue safety: retry limit, killed worker, duplicates, a delayed item, Postgres status kept in step | Build | 6, 9 | Each of the five cases is seen | Retry count and the wait between tries, when a stuck item is taken back, the shape of the status row |

### Job and requirements

| # | Task | Kind | Needs | How to check | Decide then |
|---|---|---|---|---|---|
| 11 | Create a job (step 1): form, list, job page, and the helper that always adds the company filter | Build | 8 | A new job with a title, a description, subject words and a posting date appears in the list and opens | Job statuses. A helper that always adds the company filter |
| 12 | Test set: job descriptions, fact cards, CVs, junk files | Design | none | A folder of files with an answer sheet, and the emails sent to the test mailbox | Which jobs, where the files live (real CVs stay out of git), the form of the answer sheet |
| 13 | AI wrapper: forced form, code check, cost log | Build | 3, 6 | A test call shows in the cost log | Starting model, the "no training on our data" provider rule, cost log columns. Check the current AI SDK docs first |
| 14 | AI drafts requirements (step 2, first half) | Build | 11, 13 | The job page shows requirements, each marked must or nice to have | Inline call or work item |
| 15 | Eval runner and the requirements eval | Build | 12, 14 | One command prints a score | How a score is counted, where results are kept, the pass mark |
| 16 | Edit and confirm requirements (step 2, second half) | Build | 14 | HR adds, rewords, removes and re-marks requirements, picks strict or lenient, and confirms. Nothing later can start before confirmation | Limits on requirement count and length |
| 17 | Chat panel with one read-only tool | Build | 13, 16 | The agent describes the job in a streamed reply | Agent model, step limit. Check the current AI SDK docs for tool calling first |
| 18 | Tools that change requirements, and the confirm click | Build | 17 | A chat message changes a requirement, must or nice to have, or strict or lenient on screen | How the confirm click looks, which changes need it |
| 19 | Chat history saved per job | Build | 17 | History is still there after a page reload | What is saved (messages, tool calls), how much history is sent back to the model |

### Mailbox

| # | Task | Kind | Needs | How to check | Decide then |
|---|---|---|---|---|---|
| 20 | mailsift client: token made and cached, results checked | Build | 3, 5 | An API call lists emails through our client | Whether the token cache lives in Redis |
| 21 | Mailbox secret stored encrypted, settings screen | Build | 8, 20 | The settings screen shows the connected address, fetched through mailsift | How the secret is entered, how the encryption key is kept |
| 22 | List emails for a job through the queue (step 4, first half) | Build | 10, 12, 16, 21 | The saved rows match the mailbox: emails in the date range with a PDF or Word attachment and matching subject words | The list cap, the multiple-subject-phrase gap, whether to fix gaps in mailsift or work around them |
| 23 | Group by subject with counts (step 4, first half) | Build | 22 | The screen shows subject groups with counts | How subjects are grouped |
| 24 | HR picks groups and confirms (step 4, second half) | Build | 23 | HR ticks groups and confirms, and the choice is remembered | How the choice is applied to later mail |
| 25 | "Did not match" list (step 4, second half) | Build | 24 | HR pulls one email in or adds a subject word | How the list is fetched and capped |
| 26 | Fetch picked emails (step 5): small batches, per-mailbox speed limit, every email ID recorded | Build | 24 | CV text is saved, oldest first, and every email ID is recorded | Batch size, the speed limit and whether it lives in Redis, keeping original files or text only |
| 27 | Free checks (step 5): junk, duplicates, "could not read" list | Build | 26 | Junk is dropped with a reason, and unreadable applicants are on the "could not read" list | `.doc` files, duplicate detection |

### Reading and scoring

| # | Task | Kind | Needs | How to check | Decide then |
|---|---|---|---|---|---|
| 28 | Masking step and its tests | Build | 3 | Original and masked text are shown side by side, and the tests pass | How far to go on hiding names. The proof-line check later compares against this masked text |
| 29 | Read one CV (step 6, first half): is it a CV, plus the fact sheet | Build | 13, 27, 28 | One CV becomes a card, with contact details masked and filled by code | Exact fact sheet boxes |
| 30 | Read all CVs through the queue: side-by-side limit and retry on "slow down" | Build | 10, 29 | All cards appear, and a "not a CV" list exists | Calls side by side, the wait on "slow down" |
| 31 | Eval: CV check, fact sheet, hidden instructions | Build | 15, 30 | The command prints a score | Pass marks |
| 32 | Ticks with proof lines (step 6, second half) | Build | 16, 30 | The same call returns one tick per requirement with a proof line, shown on each card | Tick wording rules, what proof "unclear" and "not met" need |
| 33 | Proof-line check and its tests | Build | 32 | A made-up proof line is downgraded, and the tests pass | How close a match must be (spaces, case, line breaks) |
| 34 | Eval: ticks against the answer sheet | Build | 15, 33 | The command prints a score | How agreement is counted |
| 35 | Scorer and its tests (step 7) | Build | 3 | Scores and rank are correct in strict and lenient, and the tests pass | Point values including "mentioned only", tie rules, whether an "unclear" must counts as the one missed must in lenient |
| 36 | Shortlist (steps 7 and 8): best five cards, full CV one click away, HR's notes | Build | 33, 35 | The best five show with ticks, proof lines and the reason for each rank | Card layout, where HR's notes are saved |
| 37 | Agent tool: explain a ranking | Build | 18, 36 | The agent explains why a candidate is third | None so far |
| 38 | Eval: top five against a person's pick | Build | 15, 36 | The command prints the overlap | Who makes the person's pick |
| 39 | Rounds and limits (section 4) | Build | 36 | A round stops at 200 CVs and asks "Read 200 of 340. Read the rest?". The job budget is enforced, and HR sees how many are unread | How screens show progress, cap values |

### While the job is open

| # | Task | Kind | Needs | How to check | Decide then |
|---|---|---|---|---|---|
| 40 | Free changes (section 5, no AI cost): strict or lenient, must or nice to have, requirement removed | Build | 36 | The rank changes from saved ticks and the cost log stays empty | None so far |
| 41 | Sort and filter on fact sheet boxes (section 5, no AI cost) | Build | 36 | "Prefer Lahore" re-sorts the list | Which fact sheet boxes can be filtered |
| 42 | Agent tools for the free changes | Build | 18, 40, 41 | A chat message does the same as the buttons | None so far |
| 43 | Re-tick for an added or reworded requirement (section 5, small AI cost) | Build | 36 | One new tick per candidate from saved CV text after a confirm click. Candidates clearly out are skipped | What counts as "clearly out" |
| 44 | Large rewrite, and the agent tool with confirm (section 5) | Build | 18, 43 | A large rewrite re-runs all ticks, and the agent asks for the click before spending | What counts as a large rewrite |
| 45 | New mail when HR opens the job (section 5) | Build | 39 | A new application is picked up once and only once and runs through steps 5 to 7 | How "once and only once" is guaranteed |
| 46 | Daily check as a repeating work item, and telling HR (section 5) | Build | 10, 45 | The item runs on time, and HR is told only if someone beats the shortlist | Check time, how HR is told |
| 47 | Agent mail questions over MCP | Build | 18, 21 | The agent connects to mailsift as an MCP client and answers "did this person send anything last week?" | Which mailsift tools the agent may use, cost and step limits. Check the current AI SDK docs for the MCP client first |

### Closing and reuse

| # | Task | Kind | Needs | How to check | Decide then |
|---|---|---|---|---|---|
| 48 | Close a job (section 6) | Build | 36 | Closing stops reading, keeps candidates above the bar with HR's notes, deletes those below it, keeps the email ID list, and sets a keep-until date | The score bar, the keep-until period, the same-person rule |
| 49 | Saved candidates scored in a new job (step 3) | Build | 48 | HR picks a past job and confirms, and its saved candidates are scored before any mail is read | How saved candidates are shown beside new ones, whether a job that is still open can be picked, whether ticks can be reused for unchanged requirements |
| 50 | Reopen a job (section 5, more openings later) | Build | 48 | Unchanged ticks are kept, and only new requirements and new mail are processed | None so far |
| 51 | Delete on request, and expiry (section 6) | Build | 48 | A candidate is deleted on request, and expired data is removed | When expired data is removed |
| 52 | Model comparison and real cost per 200 CVs (section 7) | Decision | 34, 38 | The numbers are recorded and the stronger-model question is answered | Whether a stronger-model check is needed |
| 53 | Pilot checklist and deployment target (section 11) | Decision | all | The eight checks in section 11 of the product flow pass | Deployment target, where Redis is hosted |

### Notes on the list

- **The company separation test has no task.** It was planned for task 6, moved to task 11 on 2026-11-18 and taken out of task 11 on 2026-11-24. When it is built, and how it stays safe beside real data, are open points in `decisions.md`. Recommended: its own small task before task 26, the first task that stores CV text.
- **Near the size ceiling:** tasks 2, 6, 26, 29 and 32. Any that prove too big are split in their plan step.
- **Near the floor:** tasks 25 and 42. They can be merged into 24 and 40 when reached.
- **The user's hand work:** task 5 (Google setup), task 9 (the Redis install commands) and task 12 (the real CVs). Tasks 5 and 12 need no code and can start at any time.
- **Pure-code tasks** 28 and 35 need only task 3 and could be done earlier if useful.

## 9. mailsift facts that affect the tasks

Checked in the mailsift code on 2026-11-12 (`/home/hammadahmad/Documents/mail-sift/mailsift`).

- Over HTTP it is stateless: `POST /mcp` with `Authorization: Bearer <server key>` and `X-Mail-Token: <Google access token>`. One running server can serve every company's mailbox.
- Our backend must hold the mailbox refresh token and our Google client ID and secret, create the one-hour access token, and cache it for about 55 minutes (task 20).
- Results come back as JSON inside a text field. Our client parses and checks it (task 20).
- `collect_mail` cannot fetch a chosen list of emails. After HR picks groups, we fetch each email with `get_email` and keep our own queue and bookmark (task 26).
- `search_mail` lists newest first only, 100 per page, and fetches each message in full to build the list. We sort oldest first ourselves (task 22).
- The subject filter means "all these words". Several alternative phrases need `raw_query`, which is not cleaned, so we must escape it (task 22).
- Not supported: `.doc` files and scanned PDFs (`NO_TEXT_LAYER`). Both feed the "could not read" list (task 27).
- It has no speed limit across requests. Our worker limits calls per mailbox (task 26).
- Its Docker image has never been built, and the bookmark feature awaits a manual check. Neither blocks local work.

## 10. How to check the work

**Every task**
- The "how to check" line in the task table is done by hand and seen on screen, in the database or in a doc.
- For build tasks, `npm run typecheck` passes.
- `docs/status.md` is updated in the wrap-up.

**Tests and evals**
- Tests are written inside the task that builds the piece (tasks 28, 33, 35). The company separation test is written in task 11, with the first table that holds company data.
- The eval runner is built in task 15. Later evals are tasks 31, 34 and 38.

**Company separation (from task 8 on)**
- Sign in as a user of a second company and confirm none of the first company's jobs, candidates or chat appear.

**The whole product (task 53)**
- Run the eight checks in section 11 of the product flow document against the development mailbox: grouped subjects match the mailbox, junk never appears as a candidate, proof lines match real CVs for 20 candidates, HR's own top five is compared with the product's, changes trigger no re-fetching, a new application is picked up once, closing deletes below-bar candidates, and the real AI cost per 200 CVs is recorded.

## 11. First step

Task 1, the table map. It is a doc only. Then task 2, where we settle the local folder, the package manager, the API port and the logger before any code.

The user can start the hand work for task 5 (Google setup for the test mailbox) and task 12 (collecting about 10 real CVs with permission) at any time.
