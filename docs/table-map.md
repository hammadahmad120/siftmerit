# Table map

The tables Siftmerit needs and how they link. Agreed on 2026-11-17 (task 1). Updated on 2026-11-18 (task 6): the first three tables exist. Updated on 2026-11-24 (tasks 10 and 11): `work_runs` and `jobs` exist.

This is a map, not the SQL. Each table's SQL is written in the task that first needs it. The columns below are a first sketch; the exact columns are settled in that task. This doc is updated whenever a table is added or its links change.

The examples use one story: the company **Acme**, its HR user **Sara**, the job **Accountant**, and an applicant called **Ali**.

## 1. Who owns what

Read each branch as "one has many". One company has many jobs. One job has many requirements.

```
tenants                      the company (Acme)
 ├── tenant_members          Sara belongs to Acme
 ├── mailbox_connections     Acme's Gmail (only one per company)
 ├── candidates              Ali, a person known to Acme
 └── jobs                    the Accountant job
      ├── job_requirements   "3 years experience" (must-have)
      ├── job_emails         every email we looked at for this job
      ├── work_runs          "reading round 1: running"
      ├── chat_messages      Sara's chat with the agent about this job
      └── ai_calls           the cost of each AI call
```

Every table that holds company data has `tenant_id`, the company it belongs to. The one table without it is the housekeeping table `applied_migrations` (section 8).

## 2. The two joining tables

Two tables do not sit under one owner. Each one joins other rows together.

```
candidates ───┐
(Ali)         │
              ├──>  applications  ───────┐
jobs ─────────┤     "Ali applied to      │
(Accountant)  │      Accountant"         ├──>  ticks
              │                          │     "Ali, Accountant,
job_emails ───┘                          │      3 years experience: met"
(Ali's email)                            │
                                         │
job_requirements ────────────────────────┘
("3 years experience")
```

- An **application** joins one candidate, one job, and the email it came from.
- A **tick** joins one application and one requirement.

## 3. What each table keeps

| Table | Keeps | Example | Built in task |
|---|---|---|---|
| `tenants` | Company name and short name (`slug`: lower case with dashes, allowed only once). A `settings` column is added when something first uses it, probably the limits in task 39 | Acme Trading, `acme-trading` | 6 (exists) |
| `tenant_members` | Which sign-in account is in which company, and its role: `owner` or `member`. One user belongs to one company. Nothing is restricted by the role yet | Sara is in Acme, owner | 6 (exists) |
| `mailbox_connections` | Mailbox address, the secret (encrypted), status, last error | hr@acme.com, connected | 21 |
| `jobs` | Title (the job's short name on our screens, typed by HR), job description, subject words (a list of 1 to 10 phrases), posting date, status (`draft`, `open`, `closed`), the form's one-time key, and who created it. Added by later tasks when first used: when requirements were confirmed, when the mailbox was last checked, closed date | Accountant, draft | 11 (exists) |
| `job_requirements` | Which job, the requirement text, its kind (must-have, preferred or nice to have), what a silent CV means for it (ask the candidate, or count as missing), its place in the list | "3 years experience", must-have, count as missing | 14 |
| `job_emails` | Which job, Gmail's email ID, subject, sender, date, picked by HR or not, status, skip reason. No email body and no attachment | "Application for Accountant", 2 Nov, read | 22 |
| `candidates` | The fact sheet (name, contact, city, total years, education, skills, current role, short summary, links), the CV text, the keep-until date | Ali, Lahore, 4 years | 26 to 29 |
| `applications` | Which candidate, which job, where it came from (an email or a past job), date applied, reading status, HR's notes | Ali for Accountant, 2 Nov | 26 to 29 |
| `ticks` | Which application, which requirement, the result (met, mentioned only, not met, unclear), the proof line, whether the proof was checked | met, "Worked 4 years as accountant at XYZ" | 32 |
| `work_runs` | The kind of work, status (`waiting`, `running`, `done`, `failed`), which try it is on, a short fixed word for why it failed, and the created, started, finished and updated times. Which job it belongs to (can be empty) is added when `jobs` exists | reading round 1, running, try 1 | 10 (exists) |
| `chat_messages` | Which job, who wrote it (HR or the agent), the text, the time | "Why is Ali third?" | 19 |
| `ai_calls` | Which job (can be empty), purpose, model, tokens used, cost, time | read one CV | 13 |

Rules the database keeps:
- The same email ID cannot be added twice to the same job.
- A candidate has at most one application per job.
- An application has at most one tick per requirement.
- A company has at most one job per one-time key. The form makes the key once, so a double click or a repeated request cannot save the same job twice.
- A job's ID together with its company is allowed once. This lets a later table point at "company and job" together, so the database refuses a row that names one company and another company's job.
- A company has at most one unfinished run (`waiting` or `running`) of a kind. This is what refuses the same work being queued twice. When `jobs` exists it becomes one per job and kind.

## 4. Why it is shaped this way

**Requirements are their own table.** Each tick points to one requirement. When Sara removes "Speaks Arabic", only the ticks for that requirement go. When she rewords "3 years" to "5 years", only that tick is done again. A list kept inside the job row could not do this, because the items would have no ID for a tick to point to.

**Emails are not candidates.** Most emails never become a candidate: junk, duplicates, scanned files, and subject groups Sara did not pick. We still remember every one, with the reason, so nothing is read twice. The email list is also kept after weak candidates are deleted, so a reopened job does not read and pay for them again.

**A list of emails, not only a bookmark.** A bookmark says "everything before this point is done". That breaks here: Sara picks groups, so there are gaps; CVs are read side by side, so they finish out of order; and some fail. With one row per email, the worker asks for "waiting emails for this job, oldest first", so people who applied early always go first. A "last checked" time on the job is used only to ask Gmail for new mail.

**A candidate is stored once. An application is that person in one job.** Ali's name, city and CV are the same in every job. His date applied, ticks and Sara's notes are different in each job. When Sara brings saved candidates from a past job into a new one, each gets a new application row and new ticks. The person and the CV are not copied.

```
candidates:    1 | Ali | Lahore | CV text

applications: 10 | Ali | Accountant        | 2 Nov  | from an email
              11 | Ali | Senior Accountant | 15 Jan | from the past job
```

**Ticks are their own table.** Adding or removing one requirement changes one row per candidate and never rewrites the others.

**`work_runs` holds status and errors only.** It says whether a piece of background work is waiting, running, done or failed, which try it is on, and why it failed, as a short fixed word and never a raw error message. The progress number ("120 of 200") is counted from the `job_emails` rows. It is a table and not a column on the job because one job has many pieces of work over time, and the queue task (10) needed a status row before any job existed. One run is what HR sees; the work itself is done by one or many small work items in the queue, each carrying its run's ID. A run that is done or failed is never changed again.

**The mailbox secret has its own table.** A signed-in user can read their own `tenants` row, so the secret must not sit there.

## 5. What happens when something is removed

| Action | What goes | What stays |
|---|---|---|
| A requirement is removed | The requirement and its ticks, for every candidate | Everything else |
| A job is closed | Applications and ticks of weak candidates. A candidate with no application left goes too | Strong candidates, the email list |
| A candidate asks to be deleted | The candidate, their applications and ticks | The email ID, so it is not read again |

## 6. Known trade-off

The email list is kept per job. An email that matches two open jobs is read once for each job and makes two candidate rows. This is accepted for the pilot, where it should be rare.

## 7. Left for later tasks

| Task | Point |
|---|---|
| 24 | Where HR's remembered subject picks are kept |
| 26, 29 | Where the CV text sits before the AI has said "this is a CV", and when the candidate row is made |
| 29 | The exact fact sheet boxes |
| 35, 36 | Whether the score is saved or worked out when shown |
| 45 | How the "last checked" time is used so new mail is picked up once and only once |
| 46 | How HR is told about a new strong candidate |
| 48 | Whether closing a job wipes subject and sender from `job_emails` and keeps only the ID |
| 49 | Whether candidates can be brought from a job that is still open, and whether ticks can be reused for unchanged requirements |

## 8. Housekeeping: `applied_migrations`

A 13th table that is not part of the product's data. It lists every SQL file that was applied: its name and the time. Built in task 6.

- Every SQL file starts by adding its own name. A name is allowed only once, so a file run a second time stops at that line and changes nothing.
- It has no `tenant_id`, because it holds file names only.
- Nobody reaches it through the API, not even the server key. Only Supabase's SQL editor touches it.

## 9. Who may reach the tables

The same three lines go into the SQL file of every table:

1. Row level security is switched on.
2. The browser-side roles (`anon` and `authenticated`) get no rights and no policies.
3. The server role (`service_role`, used by the secret key) gets its rights written out.

So only our API and worker reach the data. They hold the secret key, which goes past the row rules, and that is why every repository reaches a company table only through the helper `forTenant`, which adds the `tenant_id` filter itself. Deleting a company row removes everything the company owns; deleting a sign-in account removes its member row, never the company.
