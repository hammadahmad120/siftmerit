# Siftmerit: technical plan and task list

Siftmerit is the hiring product described in the product flow document. This plan records the tools, the structure and the order of work agreed on 2026-11-12. Implementation starts on 2026-11-13. Nothing has been built yet.

The product flow (what the product does) is in [product-flow.md](product-flow.md), in the same folder. This plan does not repeat it. Step and section numbers below refer to that document.

## 1. Context

Small and mid-size companies receive CVs by email and sort them by hand. Siftmerit takes a job description, finds the matching CVs in the company mailbox, scores each one against the job's requirements, and shows the best five with a proof line for every tick.

Two goals shape the technical choices:

- **A working pilot product** built from pieces that already exist: the InstantBot base, the Scout matching code, and the mailsift mail server.
- **Learning tool calling, MCP and agent building.** The chat agent is therefore a main part of the product and grows task by task, instead of being added once at the end.

## 2. How we work

- Plain simple words. Honest advice, including when an idea is weak.
- Discuss first. No code changes until the user says to go ahead.
- One task at a time. Each task ends as one working feature or flow that can be run and seen.
- Each task follows the same steps: explain what it is, settle that task's open decisions, build it, run it by hand together, then write a short note in `docs/status.md`.
- Feature-level decisions are made inside their task, not earlier.
- No test cases for now. The type check is the gate on every task. Tests that come with copied code are kept. Tests for the scorer, the proof-line check and the masking step are revisited before the first pilot (task 22).
- Database changes are written as SQL files and applied only after an explicit go-ahead for that change.

## 3. Decisions made

| Area | Decision |
|---|---|
| Name | Siftmerit. `siftmerit.com` was unregistered and a web search found no product with this name on 2026-11-12. Trademarks were not checked. |
| Repo | A new GitHub repo created by the user. Separate from InstantBot. |
| Stack | One TypeScript repo: Next.js frontend, Node API, and a separate Node worker. Python is added only if a specific job needs it. |
| Database | A new hosted Supabase project (Postgres plus sign-in). No embeddings and no vector search. |
| Mail | mailsift stays a separate MCP server. Our backend calls it over HTTP. |
| Workflow | Plain code plus the job queue. No chain library (no LangChain, no LangGraph). |
| AI library | Vercel AI SDK for model calls, the forced output form, tool calling, streaming and the MCP client. |
| Agent | A real agent in the chat panel, built with AI SDK tool calling. Its tools are our own workflow actions. It also connects to mailsift as an MCP client for read-only mail questions. |
| Core flow | Steps 1 to 8 stay a fixed workflow. Mail is found and picked by code, never by AI. |
| Screens | Hand-written Tailwind components, as in InstantBot. No component library. |
| Users | Several HR users per company, all with the same access. Accounts are created by us. No public sign-up. |
| Development mailbox | Our own Gmail account, with test applications sent to it. |
| Privacy | All CV text passes through one masking step before any AI call. Code hides emails, phone numbers, links, ID numbers and dates of birth, and fills the contact boxes itself. |
| Hosting | Local for now. Settings come from one checked env file and nothing depends on local files, so it can move to a cloud service later. |
| Tests | Skipped for now (see section 2). |

## 4. How the parts fit together

```
Browser (Next.js screens + chat panel)
        |  signed-in user's token
        v
API (Express) ---- queues work ----> work queue table (Postgres)
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
- The worker takes queued work: listing mail, fetching mail, reading CVs, re-ticking, daily checks.
- mailsift is the only part that touches Gmail, and it refuses any token that can do more than read.

## 5. Repo layout

```
siftmerit/
  apps/web/              Next.js screens and chat panel
  services/api/          Express API: routes -> controllers -> services -> repositories
  services/worker/       Polls the work queue and runs handlers
  packages/core/         Shared logic: AI wrapper, prompts, masking, proof check,
                         scorer, work queue, mailsift client, secret encryption
  supabase/migrations/   SQL files, forward only
  docs/                  product-flow.md, tech-plan.md, decisions.md, status.md
```

**Naming rule.** "Job" always means a hiring job. Background work is called a "work item" and lives in a `work_queue` table, so the two are never confused. Code keeps `tenant` and `tenant_id` for a company, because the copied InstantBot code uses those names. Screens say "company".

## 6. What comes from InstantBot

Source repo: `/home/hammadahmad/Documents/General-Chatbot/InstantBot`. Scout is copied, not shared. While both copies exist, Scout is not improved inside InstantBot.

**Copy almost as is**

| Piece | Source |
|---|---|
| Sign-in form, sign-out, page protection | `apps/web-app/src/components/auth-form.tsx`, `sign-out-button.tsx`, `apps/web-app/src/proxy.ts`, `apps/web-app/src/lib/supabase/*` |
| API sign-in check and company lookup | `services/platform-api/src/middleware/auth.middleware.ts`, `services/auth.service.ts`, `repositories/tenant*.repository.ts` |
| Company tables and row rules | The tenancy part only of `supabase/migrations/20260611000000_platform_foundation.sql` (`tenants`, `tenant_members`, `current_tenant_ids()`, `set_updated_at()`) |
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
| Work queue | `packages/platform-core/src/channels/channel-message-queue.ts` and `services/ingestion-worker/src/worker-loop.ts` as the model | General work items with a kind, a retry limit and a "do not run before" time |
| Dashboard shell | `apps/web-app/src/components/dashboard-shell.tsx`, `dashboard-nav.tsx` | New menu items |
| Candidate card look | The result card in `apps/web-app/src/components/collection-view.tsx` | Visual pattern only |

**Write new.** The scheduler for daily checks, the chat agent, the mailsift client, the "is this a CV" check, the masking step, the scorer, and protection against instructions hidden in CV or email text. None of these exist in InstantBot.

**Leave behind.** Chunks, embeddings, the reranker, both Python services, Scout's search and match service, collections tables, chat, widget, WhatsApp and analytics.

## 7. Rules that apply to every task

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
- Long work never runs inside an API request or a chat reply. It is queued.
- Every work item has a retry limit. Queuing the same thing twice is refused.
- Daily checks use a "do not run before" time on a work item. No outside scheduler.

**Agent**
- A tool is a thin wrapper around a workflow action that a screen button also calls.
- Free actions run at once. Actions that cost AI money or delete data need HR's confirm click.
- Mail access is read-only and goes through mailsift.

**Logs**
- Structured logs with a request ID or work item ID from the first task.

## 8. Task list

Each task ends with something that runs and can be seen. "Decide then" lists the choices deliberately left for that task.

### Foundation

| # | Task | Working result | Decide then |
|---|---|---|---|
| 1 | Repo skeleton | The web app, API and worker all start. The API has a health check. The type check passes. `docs/` holds the product flow and this plan | Local folder, ports, how `packages/core` is consumed in development, the logger |
| 2 | Sign-in and companies | A new Supabase project. Two HR users of one company sign in and see their company. A user of another company sees nothing of the first | How we create companies and users, how migrations are applied to the new project |
| 3 | Work queue | A demo work item is queued from the API, run by the worker and shown as done. A killed worker's item is picked up again. A failing item stops at its retry limit | Queue column details, polling interval |

### Job and requirements

| # | Task | Working result | Decide then |
|---|---|---|---|
| 4 | Create a job (step 1) | HR enters a job description, subject words and a posting date. Jobs appear in a list and each has its own page | Job statuses |
| 5 | AI drafts requirements (step 2, first half) | The job page shows requirements pulled from the description, each marked must or nice to have. The AI call is in the cost log | Starting model, the "no training on our data" provider rule, inline call or work item |
| 6 | Edit and confirm requirements (step 2, second half) | HR adds, rewords, removes and re-marks requirements, picks strict or lenient, and confirms. Nothing later can start before confirmation | Limits on requirement count and length |
| 7 | Chat panel with the first tools | A chat panel on the job page. The agent can describe the job and change requirements, must or nice to have, and strict or lenient. Chat history is saved per job | Agent model, step limit, how the confirm click looks |

### Mailbox

| # | Task | Working result | Decide then |
|---|---|---|---|
| 8 | Connect the mailbox | mailsift runs over HTTP. The mailbox secret is stored encrypted. A settings screen shows the connected address, fetched through mailsift | Google setup, the 7-day expiry risk on personal Gmail, where mailsift runs |
| 9 | List and group emails (step 4, first half) | For a job, code lists emails in the date range with a PDF or Word attachment and matching subject words. The screen shows subject groups with counts | How subjects are grouped, the multiple-subject-phrase gap, the list cap, whether to fix gaps in mailsift or work around them |
| 10 | HR picks groups (step 4, second half) | HR ticks groups and confirms. A "did not match" list lets HR pull one in or add a subject word. The choice is remembered | How the "did not match" list is fetched and capped |
| 11 | Fetch and free checks (step 5) | Picked emails are fetched oldest first in small batches. Junk is dropped with a reason. Unreadable applicants go on a "could not read" list. Every email ID is recorded | `.doc` files, keeping original files or text only, duplicate detection, batch size, per-mailbox speed limit |

### Reading and scoring

| # | Task | Working result | Decide then |
|---|---|---|---|
| 12 | Read a CV: fact sheet (step 6, first half) | Each CV gets one AI call that says whether it is a CV and fills the fixed fact sheet. Contact details are masked and filled by code. Cards show fact sheets, and a "not a CV" list exists | Exact fact sheet boxes, how far to go on hiding names, calls side by side |
| 13 | Ticks with proof lines (step 6, second half) | The same call also returns one tick per requirement with a proof line. Code checks each proof line appears in the CV and downgrades any that do not | Tick wording rules, what proof "unclear" and "not met" need |
| 14 | Score and shortlist (steps 7 and 8) | Code turns ticks into a score, applies strict or lenient, and shows the best five cards with ticks, proof lines and the reason for the rank. The full CV text is one click away. Agent tool: explain a ranking | Point values, tie rules |
| 15 | Rounds and limits (section 4) | A round stops at 200 CVs and asks "Read 200 of 340. Read the rest?". The job budget is enforced. HR always sees how many are unread | How screens show progress, cap values |

### While the job is open

| # | Task | Working result | Decide then |
|---|---|---|---|
| 16 | Free changes (section 5, no AI cost) | Switching strict or lenient, re-marking must or nice to have, removing a requirement, and sorting or filtering on fact sheet boxes all re-rank from saved ticks. Nothing is fetched or re-read. Agent tools for each | Which fact sheet boxes can be filtered |
| 17 | Re-ticking (section 5, small AI cost) | Adding or rewording a requirement gives one new tick per candidate from saved CV text. Candidates clearly out are skipped. A large rewrite re-runs all ticks. The agent asks for a confirm click first | What counts as "clearly out", what counts as a large rewrite |
| 18 | New mail | A daily check, and a check when HR opens the job, pick up new matching mail once and only once and run it through steps 5 to 7. HR is told only if someone beats the shortlist | Check time, how HR is told |
| 19 | Agent mail questions over MCP | The agent connects to mailsift as an MCP client, discovers its tools, and answers read-only questions such as "did this person send anything last week?". Email text is treated as data | Which mailsift tools the agent may use, cost and step limits |

### Closing and reuse

| # | Task | Working result | Decide then |
|---|---|---|---|
| 20 | Close a job (section 6) | Closing stops reading, keeps candidates above the bar with HR's notes, deletes those below it, and keeps the email ID list. Kept data has a keep-until date | The score bar, the keep-until period, the same-person rule |
| 21 | Saved candidates and reopening (step 3) | A new job scores saved candidates before any mail is read. A reopened job keeps unchanged ticks. A candidate can be deleted on request, and expired data is removed | How saved candidates are shown beside new ones |
| 22 | Pilot readiness | Tests for the scorer, proof-line check and masking. A check that one company cannot read another's rows. The 50-CV model comparison. The real cost per 200 CVs. The full checklist in section 11 of the product flow | Whether a stronger-model check is needed, deployment target |

## 9. mailsift facts that affect the tasks

Checked in the mailsift code on 2026-11-12 (`/home/hammadahmad/Documents/mail-sift/mailsift`).

- Over HTTP it is stateless: `POST /mcp` with `Authorization: Bearer <server key>` and `X-Mail-Token: <Google access token>`. One running server can serve every company's mailbox.
- Our backend must hold the mailbox refresh token and our Google client ID and secret, create the one-hour access token, and cache it for about 55 minutes.
- Results come back as JSON inside a text field. Our client parses and checks it.
- `collect_mail` cannot fetch a chosen list of emails. After HR picks groups, we fetch each email with `get_email` and keep our own queue and bookmark (task 11).
- `search_mail` lists newest first only, 100 per page, and fetches each message in full to build the list. We sort oldest first ourselves (task 9).
- The subject filter means "all these words". Several alternative phrases need `raw_query`, which is not cleaned, so we must escape it (task 9).
- Not supported: `.doc` files and scanned PDFs (`NO_TEXT_LAYER`). Both feed the "could not read" list (task 11).
- It has no speed limit across requests. Our worker limits calls per mailbox (task 11).
- Its Docker image has never been built, and the bookmark feature awaits a manual check. Neither blocks local work.

## 10. How to check the work

**Every task**
- `npm run typecheck` passes.
- The working result in the task table is run by hand and seen on screen or in the database.
- A short note is added to `docs/status.md`: what was built, what was decided, and what is next.

**Company separation (from task 2 on)**
- Sign in as a user of a second company and confirm none of the first company's jobs, candidates or chat appear.

**The whole product (task 22)**
- Run the eight checks in section 11 of the product flow document against the development mailbox: grouped subjects match the mailbox, junk never appears as a candidate, proof lines match real CVs for 20 candidates, HR's own top five is compared with the product's, changes trigger no re-fetching, a new application is picked up once, closing deletes below-bar candidates, and the real AI cost per 200 CVs is recorded.

## 11. First step tomorrow

Task 1. Before any code: the user creates the `siftmerit` GitHub repo, and we settle the local folder, the ports and how `packages/core` is consumed in development.
