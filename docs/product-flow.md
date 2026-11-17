# Hiring product: agreed flow (product decisions only)

This is a record of product decisions from a discussion on 2026-11-12. It covers **what the product does**, not how it is built. The next session picks the tools, technologies and architecture. Nothing has been built yet.

How this was discussed, and how to continue: plain simple words, honest neutral advice (say when an idea is weak), discuss first and only write a plan when asked.

## 1. Context

**The problem.** Small and mid-size companies get CVs by email. HR opens them one by one, compares each to the job description in their head, and tracks good ones in a spreadsheet. Good candidates get buried, and it is slow.

**The product.** An AI-powered hiring tool. HR gives a job description, and the product finds the matching CVs in the company mailbox, scores them against the job's requirements, and shows the best ones with proof.

**Scope of the first version.** Finding, sorting and tracking CVs. Forwarding to hiring managers, interview scheduling, feedback and offers come later.

**What exists today.**

| Thing | Where | State |
|---|---|---|
| InstantBot | `/home/hammadahmad/Documents/General-Chatbot/InstantBot` | Multi-company document chatbot platform. Has **Document Scout**: upload documents to a collection, give a brief, get ranked documents with a per-requirement check. |
| mailsift | `/home/hammadahmad/Documents/mail-sift/mailsift` | Read-only Gmail MCP server. Searches mail and returns clean text, including PDF and Word attachments as text. Phases 0 to 5 done. |

## 2. Setup decisions

- **Separate product.** Not built inside InstantBot, because InstantBot must stay free of hiring-specific logic and wording.
- **mailsift stays its own server**, used by the new product.
- **Scout is copied, not shared.** The useful Scout pieces are copied into the new product now. Anything that does not fit is left behind. Scout is removed from InstantBot later. While both copies exist, avoid improving Scout inside InstantBot.
- **Mostly a fixed workflow, with a small agent on top.** The workflow does the repeated work. The agent talks with HR in a chat panel and re-runs workflow steps. The agent is not a long-running process: a job is saved data, and the agent wakes when HR sends a message.
- **Backend code fetches the mail.** No AI is used to find or pick emails.
- **Pilot companies only.** No public sign-up. Accounts and the mailbox connection are set up by us. One mailbox per company. Each company's data is still kept fully separate from day one.
- **Interface:** normal screens plus a chat panel.

## 3. The flow

### Step 1: HR starts a job
HR enters:
- the job description, as free text (required)
- subject words (required)
- the posting date (optional, defaults to one week back)

### Step 2: Requirements are agreed
The AI pulls the requirements out of the job description and marks each as **must** or **nice to have**. HR edits and confirms the list, and picks **strict** or **lenient**. No CV is read before HR confirms.

### Step 3: Saved candidates from past jobs (HR's choice)
When creating a job, HR can pick past jobs to bring saved candidates from. HR confirms before any AI is used. Those candidates are then scored against the new requirements from their saved CV text, before any mail is read. Nothing is checked automatically.

Changed on 2026-11-17. Before that, every saved candidate was checked against every new job. The reason is in [decisions.md](decisions.md).

### Step 4: Emails are picked (no AI)
1. Code lists emails in the date range that have a PDF or Word attachment and whose subject **contains** the subject words. It is not an exact match. Only light details are fetched: subject, sender, date. No bodies, no attachments.
2. Code groups them by subject with counts, for example "Application for Accountant (64)".
3. HR ticks the groups to include and confirms.
4. A "did not match" list (subjects and senders only) stays available, so HR can pull one in or add another subject word.
5. HR's choice is remembered. Later mail with a matching subject is included automatically.

### Step 5: Free code checks (no AI)
- Dropped: no attachment, wrong file type, exact duplicate file from the same sender, auto-replies, newsletters, empty or broken files.
- Possible real applicants that cannot be read (scanned CV, CV sent as a link) go on a **"could not read"** list for HR. They are never silently dropped.
- Every email ID looked at is remembered, with the reason if skipped, so nothing is read twice.

### Step 6: One small-model call per CV
One CV per call, several running side by side. Each call returns:

- **Is this a CV?** If not, the call stops there and the email is marked "not a CV".
- **A slim fact sheet.** The same fixed form for every candidate and every company, filled from the CV only. The job description plays no part in it. Boxes are named after kinds of information, not professions: name, contact, city, total years of experience, education, skills, current role, a short summary, links.
- **Ticks.** One per requirement: **met**, **mentioned only**, **not met** or **unclear**, each with the proof line from the CV.

The cleaned CV text is saved too. CV text is always treated as data, never as instructions.

Rules for ticks:
- "Met" needs proof the skill was used in a role or project. A skill that only appears in a list is "mentioned only" and worth fewer points.
- Obvious conclusions are allowed (a senior React developer has JavaScript).
- If the CV is silent on something, the tick is "unclear", not "not met".
- Content outside the job's requirements earns nothing.

### Step 7: Code scores and sorts (no AI)
- A fixed formula turns ticks into a score. Starting values: must met 10, nice to have met 3, unclear half.
- **Strict:** a missed must means out. **Lenient:** one must may be missing.
- "Unclear" stays in, ranked lower.
- Ties go to the earlier applicant.
- Code checks that each proof line really appears in the CV text.

### Step 8: The best 5 go to HR
Each candidate has a card: fact sheet details, every tick with its proof line, and why they ranked there. The full CV is one click away. The AI only recommends. It never rejects anyone.

There is **no second "careful check" with a stronger model** in the first version. See section 7 for the test that decides whether to add it.

## 4. Limits

- **Date range:** only mail from the posting date onward.
- **Round cap:** 200 CVs per round, oldest first, fetched in small batches. Then HR is asked: "Read 200 of 340. Here are the best 5 so far. Read the rest?"
- **Job budget:** a hard total per job as a safety net (starting guess 1,000 CVs).
- **List cap:** the confirmation list in step 4 has its own limit, with a "narrow your subject or date" message past it.
- HR always sees how many are still unread.

## 5. While the job is open

**New mail.** Checked daily or when HR opens the job. Each new CV goes through steps 5 to 7. HR is told only if it beats someone on the shortlist.

**HR changes something.** All work is done from saved records. Nothing is fetched from the mailbox again.

| Change | What happens | AI cost |
|---|---|---|
| Strict or lenient, must or nice to have | Code re-adds scores from saved ticks | None |
| Requirement removed | Its tick is dropped, scores re-added | None |
| Sort or filter on a fact sheet box ("prefer Lahore") | Code re-sorts | None |
| Requirement added or reworded in any way (including 5 years to 7) | The small model gives one new tick per candidate from the saved CV text. Other ticks stay. Candidates already clearly out are skipped. | Small |
| Most of the job description rewritten | Close to a full re-run of the ticks, but no re-fetching | About the same as the first run |

The rule behind this table: **the AI gives every tick, the code only adds up and sorts.** A split between number-type and meaning-type requirements was considered and dropped as too complicated for the first version.

**More openings later.** Treated as the same job reopened. Unchanged ticks are kept, only new requirements and new mail are processed.

## 6. What is stored

**While the job is open:** a record for every CV that passed the free checks, holding the fact sheet, ticks, score, cleaned CV text, link to the email and date applied. Plus the light list of all email IDs looked at.

**When HR closes the job:**
- Reading stops.
- **Kept:** candidates above the bar (all musts met, or one missed), with fact sheet, ticks, CV text and HR's notes. These are the saved candidates HR can bring into a future job in step 3.
- **Deleted:** everyone below the bar.
- **Also kept:** the email ID list, in case the job is reopened.
- Kept data has a keep-until date (starting guess 12 months) and can be deleted on a candidate's request.

One fact sheet belongs to one candidate, not to one job. Ticks belong to one candidate for one job.

## 7. Not decided yet

**Set aside by the user**
- Whether short, concise CVs should be favoured over long ones. Ideas raised: recent experience counts more, and conciseness as an optional tie-breaker.

**To tune on real data**
- The 200 round cap, the job budget, the point values, the score bar for keeping candidates, the keep-until period.
- AI cost. "Cents per job for 200 CVs" was a rough unmeasured estimate.

**To test before deciding**
- **Is a stronger-model check needed?** Run about 50 real CVs through a small and a stronger model and compare the top lists. If they mostly agree, it is never needed.

**To check with the first pilot mailbox**
- Whether a manually set up Gmail connection stays valid long term. It may differ between Google Workspace and personal Gmail accounts.

**Later upgrades, not in the first version**
- AI sorting of emails by subject, file name and message preview, if too many real applicants land in the "did not match" list.
- Company-defined extra fact sheet boxes (Scout already has admin-defined fields).
- A "Connect Gmail" button and public sign-up. This needs Google's security review for reading mail.
- Rules on AI in hiring differ by country and need checking before a wider launch.

## 8. Facts about mailsift, checked in its code

These were verified on 2026-11-12 and matter for the technical session.

- **Search returns light details without fetching bodies:** subject, sender, date, a short message preview, and each attachment's file name, type and size. This supports step 4. (`src/providers/types.ts`, `SearchResultItem`)
- **Subject filter means "all these words appear in the subject".** There is no built-in "any of these phrases" for subjects. Several alternative subject phrases need separate searches or the raw query option. (`src/providers/gmail/query-builder.ts`)
- **Supported attachment types:** pdf, docx, txt, md, csv, html. **Old-style `.doc` Word files are not supported.** Scanned PDFs come back with the skip reason `NO_TEXT_LAYER`, which feeds the "could not read" list.
- **`collect_mail`** fetches matching emails as clean documents, supports oldest-first order, and returns a bookmark (`next_after_message_id`) to continue from.
- **Default limits** (`src/config.ts`): 200 messages per collect call, 100 per search page, 2,000 IDs walked for oldest-first, 365 day date range, 10 MB per attachment, 100,000 characters per attachment.
- **Over HTTP** each request carries a server key and a short-lived mailbox token. mailsift stores nothing, so the new product must hold the long-lived mailbox secret (encrypted) and create the short-lived token itself.
- mailsift refuses any token that allows more than reading.
- Its own open items: the bookmark feature awaits a manual check, the Docker image has never been built, and it is not published to npm.

## 9. Scout pieces in InstantBot worth looking at

Taken from `docs/project.md` section 6. The code itself was not read in this session, so fit is unconfirmed.

- Brief split into requirements: `packages/platform-core/src/matching/brief-split.ts`
- Per-requirement check: `packages/platform-core/src/matching/requirement-check.ts`
- Field extraction per document (close to the fact sheet): `packages/platform-core/src/matching/field-extraction.ts` and `services/ingestion-worker/src/pipeline/extract-fields-step.ts`
- Match flow: `services/platform-api/src/services/match.service.ts`
- Encrypted credential storage, used for WhatsApp: `packages/platform-core/src/channels/`
- Company separation, sign-in and the background worker come from the InstantBot base.

Scout's search and ranking engine (chunks, embeddings, reranking) is likely **not needed** for this flow, because every CV is read in full and scored by ticks. The technical session should confirm that before copying it.

## 10. For the next session

Decide the tools, technologies and architecture for the flow above. Questions to settle:

1. Which InstantBot and Scout pieces to copy, and which to leave.
2. How the backend talks to mailsift, and where mailsift runs.
3. Which small model to use for step 6, and how to force the fixed output form.
4. How the agent in the chat panel is built and which workflow steps it may trigger.
5. The database tables for jobs, requirements, candidates, fact sheets, ticks and email IDs.
6. How rounds, daily checks and re-ticking run in the background.
7. How to handle `.doc` files and the multiple-subject-phrase gap in mailsift.

## 11. How to check the flow works

Once a first version exists, test with one real pilot mailbox:

1. Create a job with subject words. Confirm the grouped subject list and counts match what is in the mailbox.
2. Confirm junk with attachments (an invoice PDF) is never shown as a candidate.
3. Run a round. Check each tick's proof line against the real CV for 20 candidates.
4. Have HR pick their own top 5 from the same CVs and compare with the product's top 5.
5. Change a requirement, switch strict to lenient, and remove a requirement. Confirm no email is fetched again and only the added requirement triggers AI calls.
6. Send a new test application. Confirm the daily check picks it up once and only once.
7. Close the job. Confirm below-bar candidates are deleted and above-bar ones appear as saved candidates for a new job.
8. Record the real AI cost per 200 CVs.
