# Developer guide

How the built product works, for a developer who is new to it. It is organised by part of the product and describes what exists now. It covers the flow, the reasons and the traps, not every file. It is updated in the wrap-up of every task that changes how something works.

- What the product should do: [product-flow.md](product-flow.md).
- What is planned and in which order: [tech-plan.md](tech-plan.md) section 8.
- Why each choice was made: [decisions.md](decisions.md).
- What is finished and what is next: [status.md](status.md).

## 1. The parts

One repo with four parts, joined by npm workspaces. One `npm install` at the repo root installs the libraries for all of them.

| Part | Folder | Name | What it does today |
|---|---|---|---|
| Web app | `apps/web` | `@siftmerit/web` | Sign-in and sign-out, a top bar with the menu and the company name around every signed-in page, a home page at `/`, and the job screens: the list at `/jobs`, the form at `/jobs/new` and a job's page at `/jobs/<id>` (section 10). |
| API | `services/api` | `@siftmerit/api` | Checks who is calling and which company they belong to. Addresses: `/v1/health`, `/v1/me`, `/v1/jobs` (create, list, get one; section 10) and `/v1/demo-work` (`POST` starts a demo run, `GET` lists the last runs). Also holds the script that creates companies and users. |
| Worker | `services/worker` | `@siftmerit/worker` | Keeps running, takes work items from the queue and runs them (section 9). So far there is one kind, a demo item. It also holds the two mailbox scripts (section 7). |
| Core | `packages/core` | `@siftmerit/core` | Shared code for the API and the worker: the logger, the settings loader, the database connection, the helper that keeps companies apart, the `jobs` and `work_runs` repositories and the work queue. |

How they talk today:

```
Browser  --->  Web app (Next.js, port 3100)     sends the page
Browser  --->  Supabase                         sign-in and sign-out only
Browser  --->  API (Express, port 4100)         the page's own calls, with the token
API, Worker  --->  Core                         imported as a package
API  --->  Supabase                             the database and the sign-in check
API  --->  Redis                                adds a work item to the queue
Worker  --->  Redis                             takes work items out and runs them
Worker  --->  Supabase                          saves the status of each run
```

The API and the worker never talk to each other directly; the queue in Redis sits between them (section 9). The AI model is not connected yet. The mailbox is reached only by two development scripts (section 7); the API and the worker do not use it yet. The browser never reads the database: Supabase gives it a sign-in token, and every piece of data comes from the API.

## 2. Running it

Run from the repo root, each in its own terminal.

| Command | What it starts |
|---|---|
| `npm run dev:api` | The API on port 4100. Health check: `http://localhost:4100/v1/health`. |
| `npm run dev:worker` | The worker. It listens to the queue, runs work items and saves their status. Redis must be running. |
| `npm run dev:web` | The web app on `http://localhost:3100`. |
| `npm run typecheck` | The type check for all four parts. It must pass after every task. |
| `npm run lint` | ESLint for the web app, with the Next.js rules. A warning fails it. It must pass after every task. |
| `npm run company:create` | Creates a company and its first user (section 8). |
| `npm run company:add-user` | Adds a user to a company (section 8). |
| `npm run mailbox:connect` | Development only. Gets the test mailbox's secret with one Allow click (section 7). |
| `npm run mailbox:check` | Development only. Lists five emails from the test mailbox through mailsift (section 7). |

All three `dev` commands restart their part when a file changes.

Redis is not started by any of these. It is a program installed on the machine that starts at boot (section 9). `redis-cli ping` answers `PONG` when it is running.

### Settings

- There is one `.env` file, at the repo root, for every part. `.env.example` lists every setting.
- Most settings have a default. The three Supabase settings have none, and the API does not start without them. The two `NEXT_PUBLIC_SUPABASE_` settings have none either: the web app starts without them, but every page then shows "Sign-in is not set up". The mailbox settings have none and are needed only by the two mailbox scripts. The worker needs `SUPABASE_URL` and `SUPABASE_SECRET_KEY` too, because it saves the status of its work; it does not start without them.
- A setting already present in the shell wins over the file. For example, `LOG_LEVEL=debug npm run dev:api`.
- A setting is added by the task that first uses it.

| Setting | Used by | Default |
|---|---|---|
| `NODE_ENV` | API, worker | `development` |
| `LOG_LEVEL` | API, worker | `info` |
| `REDIS_URL` | API, worker | `redis://127.0.0.1:6379` |
| `API_PORT` | API | `4100` |
| `CORS_ORIGIN` | API | `http://localhost:3100` |
| `NEXT_PUBLIC_API_URL` | Web app | `http://localhost:4100` |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | API, worker, company scripts | none |
| `SUPABASE_PUBLISHABLE_KEY` | API | none |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Web app (sign-in) | none. The same values as `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Mailbox scripts | none |
| `DEV_MAILBOX_REFRESH_TOKEN` | `mailbox:check` | none |
| `MAILSIFT_URL` | `mailbox:check` | `http://127.0.0.1:3000/mcp` |
| `MAILSIFT_SERVER_KEY` | `mailbox:check` | none |

A bad setting stops the part at start with a message that names it, for example `API settings check failed. Fix these in the repo-root .env file or your shell: API_PORT (...)`.

## 3. Core (`packages/core`)

Core is a workspace package: a folder in the repo that the API and the worker import by name, `@siftmerit/core`, as if it were a library. `npm install` makes a link to it in `node_modules`.

**It is read as TypeScript source.** Core's `package.json` points its entry at `src/index.ts`. The API and the worker run through `tsx` in development, which reads TypeScript directly. So there is no compile step and no watch script: change a core file, and the API and the worker restart with the new code.

**What it offers** (everything is listed in `src/index.ts`):

- `createLogger({ service, level, style })`: builds the winston logger. `service` is printed on every line, so the API's lines and the worker's lines can be told apart. `style` is `readable` (one short line for a person) or `json` (one structured line for a log service). Both services pick `json` when `NODE_ENV` is `production`.
- `loadSettings(partName, schema)`: reads the root `.env` and checks the settings against a zod schema.
- `sharedEnvSchema`: the settings both services use (`NODE_ENV`, `LOG_LEVEL`, `REDIS_URL`). A service adds its own with `sharedEnvSchema.extend({ ... })`.
- The database (`src/database.ts`): `createSecretClient`, the client made with the secret key; `DatabaseError`, the error of a failed database call; and `databaseEnvShape`, the two database settings, which the API and the worker each add to their own settings.
- `forTenant(db, tenantId)` (`src/tenant-db.ts`): the one door to a company's rows. It adds the company filter by itself. See section 8.
- `JobRepository` (`src/jobs.repository.ts`): the only code that touches the `jobs` table. See section 10.
- `WorkRunRepository` (`src/work-runs.repository.ts`): the only code that touches the `work_runs` table. See section 9.
- The work queue (`src/queue.ts`): the queue's name, the shape of a work item, `DemoQueue` for the API, `createDemoWorker` for the worker, `isFinalFailure` and `isWorkerLost` for telling how an item failed, and `createQueueTroubleLogger`. See section 9.

**Traps**

- Production needs JavaScript. A service's own `tsc` build does not write core's JavaScript, so the production build must compile core too. This is an open point for task 53.
- The web app does not use core. Core holds server-only code.
- **The two database settings are not in the shared settings.** The mailbox scripts use the shared settings too and need no database, so they would stop without Supabase settings they never use.
- `bullmq` and `ioredis` are listed in core's `package.json` only. The API and the worker reach them through core, so there is one version in one place.
- A type error inside core is reported by the type check of the API and the worker as well, because they read core's source.

## 4. API (`services/api`)

The layout is routes -> controllers -> services -> repositories. A route names the address and the steps in front of it, a controller reads the request and writes the answer, a service holds the rules, and a repository is the only code that talks to a table. `src/app.ts` builds these pieces once at start and wires them together. A controller gives back a group of functions, one per address: `createJobsController` gives back `create`, `list` and `get`, and `createMeController` gives back `getMe`.

### The path of a request

`src/app.ts` lists the steps in order:

1. **Request log.** Makes a request ID, attaches a logger that carries it (`req.log`), sends the ID back as the `x-request-id` header, and prints one "request finished" line when the answer has been sent.
2. **CORS.** Tells browsers which web address may read the API's answers. See below. Right after it, a JSON body of at most 100 kilobytes is read into `req.body`. The largest thing sent is a job description, at most 20,000 characters, which can be 40 kilobytes or more in some scripts.
3. **Routes.** Everything is under `/v1`. `/v1/health` needs no sign-in. Every other address has the two sign-in steps in front of it (see "Sign-in check" below). The three job addresses are in section 10. `POST /v1/demo-work` starts a demo run and answers 202, and `GET /v1/demo-work` lists the last runs; see section 9.
4. **Not found.** An unknown address becomes a normal "not found" error.
5. **Error step.** Turns any error into a clean JSON answer.

### Error answers

Every error answer has the same shape, so the web app handles them all the same way:

```json
{ "error": { "code": "route_not_found", "message": "No route for GET /v1/nothing", "requestId": "..." } }
```

- **One of our own errors** (the classes in `src/lib/errors.ts`): the log gets a "request refused" line with the error name, code and status, never the message. The caller gets the code, the message and the request ID.
- **An unexpected error:** the log gets a "request failed" line with the name, message and trace. The caller gets only "Internal server error" and the request ID.

- **A failed database call** (`DatabaseError`): the log gets a "request failed" line with the table and action in fixed words we write, such as "tenant_members find by user", and the database's error code. The database's own wording can repeat the data that caused the error, so it is added in development only (`NODE_ENV=development`). The caller gets only "Internal server error" and the request ID.

- **A body that cannot be read:** not valid JSON is answered 400 with the code `invalid_json`, and a body over the limit 413 with `body_too_large`. The reader's own message can repeat part of the body, so it is neither logged nor sent back.
- **Something the API depends on cannot be reached** (`ServiceUnavailableError`, status 503): so far only the work queue, with the code `queue_unavailable`, when Redis is down. The request was fine, so the caller can try again.

A reported error is found in the logs by its request ID.

### Sign-in check

Two steps in `src/middleware/auth.middleware.ts` run in front of every address that needs a signed-in user:

1. **Who is calling?** The token is read from the `Authorization: Bearer ...` header and checked by `AuthService`. Supabase signs each token with a private key; the library fetches the matching public key once, keeps it, and checks the signature and expiry inside the API, with no call to Supabase per request. Missing or not valid: 401, code `unauthorized`. Before the library sees it, the token's shape is checked (three parts joined by dots, the first two being JSON objects), because the library throws on text it cannot read at all, such as `abc.def.ghi`, and a thrown error would be answered as 500.
2. **Which company?** The user's row in `tenant_members` is looked up. This is the only place a request gets its company from: never from the address, the body or a header. No row: 403, code `no_company`.

After step 2 the request carries `req.userId`, `req.tenantId` and `req.tenantRole`, and every log line of that request also carries the user ID and the company ID.

`GET /v1/me` answers with `{ "user": { "id", "role" }, "tenant": { "id", "name", "slug" } }`.

**Traps**

- **A token of a removed user still passes step 1 until it runs out.** Step 2 is what refuses it, because removing the account removes the `tenant_members` row. So step 2 must never be skipped or cached carelessly.
- **If the public key cannot be fetched, the answer is 500, not 401.** A 401 would tell the web app "sign in again" when the fault is on our side.
- **Nothing is restricted by the role yet.** `owner` and `member` can do the same things until a task adds a check.

### CORS

A browser hides an answer from a page on another address unless the answering side names that address. The web app is on port 3100 and the API on 4100, so they count as different addresses. The API therefore adds `Access-Control-Allow-Origin` with the value of `CORS_ORIGIN` to its answers.

- Only one address is allowed, never "everyone".
- Cookies are not allowed across. The sign-in token will travel in a header.
- CORS is a browser rule, not sign-in. A script or `curl` ignores it. The sign-in check (task 6) is what protects data.
- The CORS step sits after the request log step, so every browser request still gets a log line.

**Trap:** the address must match exactly: scheme, host and port. `http://127.0.0.1:3100` is a different address from `http://localhost:3100`. When the page says "The API cannot be reached" while the API is running, check this first; the browser's console shows a CORS message.

### Logging rules

- Every line carries a request ID (API) or, later, a work item ID (worker). Start-up lines carry neither.
- Lines hold IDs only: never CV text, email content, names, contact details or secret keys.
- The request line holds the method, the address without anything after `?`, the status and the time taken.
- Logs are printed to the terminal. The app never writes log files.

## 5. Worker (`services/worker`)

The worker loads its settings, builds the logger with `service: "worker"` and starts listening to the queue. That listening is what keeps the program running. It has no web address; nothing calls it. It only takes work items out of Redis.

- `src/index.ts` starts the listener, logs when it connects, logs every failed item, and handles the stop signals.
- `src/handlers/` holds one file per kind of work. A handler is the work itself. So far there is `demo.handler.ts`.

How an item is run, the clean stop and the traps are in section 9.

The folder `src/scripts/` holds the two mailbox scripts. They are tools a developer runs by hand, not part of the running worker, and they have their own settings file so the worker starts without any mailbox setting. See section 7.

## 6. Web app (`apps/web`)

A Next.js 16 app with React 19 and Tailwind 4, using the App Router and a `src` folder. It was created with the `create-next-app` generator (empty template) and then trimmed.

### What exists

- `src/app/layout.tsx`: the outer frame of every page. It loads the font and sets the cream background and navy text.
- `src/app/globals.css`: the colours and the font, written once.
- `src/app/signin/page.tsx`: the sign-in page at `/signin`. It is the one page that needs no signed-in user.
- `src/app/(dashboard)/layout.tsx`: puts the guard, and inside it the shell, around every page in the `(dashboard)` folder. A folder name in brackets is not part of the address.
- `src/app/(dashboard)/page.tsx`: the home page at `/`, where a signed-in user lands. It holds a "Jobs" section.
- `src/app/(dashboard)/jobs/page.tsx`, `jobs/new/page.tsx`, `jobs/[jobId]/page.tsx`: the job list, the "New job" form and a job's own page (section 10).
- `src/components/job-list.tsx`, `job-form.tsx`, `subject-words-field.tsx`, `job-details.tsx`, `back-to-jobs.tsx`: the browser parts of those three pages.
- `src/components/auth-guard.tsx`: the guard.
- `src/components/dashboard-shell.tsx`, `dashboard-nav.tsx`: the top bar with the page area below it, and the menu.
- `src/components/me-context.tsx`: asks `/v1/me` once and shares the answer.
- `src/components/sign-in-form.tsx`, `sign-out-button.tsx`: the form and the button.
- `src/components/demo-work-panel.tsx`: temporary. The buttons and the list of runs of the home page's "Queue demo" section (section 9).
- `src/lib/supabase.ts`: the one Supabase client for the browser.
- `src/lib/api.ts`: the call helper.
- `src/lib/styles.ts`: looks that more than one screen uses: the button, a link that looks like a button, and a form field.

### Server part and browser part

In Next.js a file runs on the server unless it starts with `"use client"`. The page files are server parts. The guard, the shell, the menu, the form and the button start with `"use client"`, so they run in the browser. Sign-in and every call to the API are made from browser parts.

### Sign-in

The session is kept in the browser, not on the Next.js server. The Supabase library saves it in local storage as one entry, `sb-<project>-auth-token`, which holds the access token (about an hour), the refresh token, the expiry time and the user's ID and email. The library refreshes the token by itself. Our code never reads that entry by hand.

**The path of a sign-in**

1. The form sends the email and password to Supabase, not to our API. Supabase answers with a session.
2. The form asks our API `GET /v1/me` with the new token. The API says which company the user belongs to.
3. If the API says `no_company`, or cannot be reached, the form signs the user out again and shows a message. Nobody is ever half signed in.
4. Otherwise the form empties its fields and goes to `/`.

**The guard** (`auth-guard.tsx`) sits in the `(dashboard)` layout, so a page added to that folder is protected without anyone remembering to do it.

- It listens to the library with `onAuthStateChange`. The library calls it once straight away with the session it finds, and again on every change: sign-in, sign-out, and a refresh that Supabase refuses.
- With a session it shows the page. Without one it goes to `/signin`. Until it knows, it shows a start screen with the product's name.
- A sign-out in another tab of the same browser reaches it too, because the library tells its other tabs.
- It is the only code that goes to the sign-in page after a sign-out.
- It draws the page under a key made of the user's ID, so a different user signing in on the same browser starts with an empty page.

**The guard is a convenience, not the lock.** The page frame it hides holds no data. The lock is the API's sign-in check: every piece of data comes from an API call.

**Sign-out** ends the session in this browser only (`scope: "local"`). Other devices stay signed in. The library removes the session before it tells Supabase, so it works without a network too.

### The shell

Every page in the `(dashboard)` folder is drawn inside the shell (`dashboard-shell.tsx`): a top bar, and the page below it. The bar holds the product's name, the menu, and on the right the company name, the user's email and "Sign out". The shell owns the page's `<main>` and its width, so a page file holds only its own content.

**Who is signed in is asked once.** `MeProvider` (`me-context.tsx`) wraps the shell. It asks the API `GET /v1/me` one time and reads the email from the session the browser holds. It shares both through a React context: a value put in at one point of the page that any part below can take out, without passing it down by hand. A part calls `useMe()` and gets `{ email, company }`, where `company` is `loading`, `ok` with the answer, or `failed` with a message. A page that needs the company uses `useMe()` and never asks `/v1/me` itself.

- The bar and the page are drawn at once. The company name and email fill in when they arrive; until then their two lines hold a space, so the bar keeps its height.
- Moving between pages keeps the shell, so `/v1/me` is not asked again.
- If `/v1/me` fails, the bar stays and the page area shows the failure line with the request ID.
- The shell sits inside the guard. The guard draws its content under the user's ID, so when another user signs in on the same browser the shell starts again from "loading".
- The email is only shown. The API never trusts it; the company always comes from the API's own lookup.

**The menu** (`dashboard-nav.tsx`) is one list, `MENU_ITEMS`. A new screen adds one line. "Jobs" stays marked on a page below it, such as `/jobs/123`; "Home" is marked only on `/` itself, because every address starts with `/`.

### The look

Light mode only. The colours come from the NexRhino colour guide and are written once, in `globals.css`, as `brand-navy`, `brand-cream`, `brand-purple` and `brand-light-navy`. Each name gives Tailwind classes such as `text-brand-navy` and `bg-brand-cream`.

| Colour | Used for |
|---|---|
| Navy `#0F1B3D` | Headings, body text, every button |
| Cream `#F3EEE3` | The page background, the label on a button |
| Purple `#B100CD` | Links, and the active menu item with the line under it. Never the border or outline of a button, a field or a card |
| Light navy `#2B3D73` | Small, less important text, and a button under the mouse |
| Red (Tailwind's own) | Error messages only |

- The bar and the cards are white on the cream page.
- Every button uses `BUTTON_CLASSES` from `src/lib/styles.ts` and adds only its own size. A link that takes the user to another page and should look like a button ("New job", "Back to jobs") uses `LINK_BUTTON_CLASSES`: the lighter navy under the mouse is written out there, because `enabled:` in the button's look only matches a real button. Every form field uses `FIELD_CLASSES`.
- A status is a small outlined label in light navy (`StatusLabel` in `job-list.tsx`). Green, amber and red are not used yet; they are kept for the ticks.
- The font is Geist, loaded in `app/layout.tsx` with Next.js's font tool. It is downloaded when the app is built and served from our own site, so a user's browser never calls Google.
- The guide and the live nexrhino.com differ in two places: the guide says purple buttons and the site has navy ones (we follow the site), and the site's navy is `#06173A` (we use the guide's).

### The call helper

Every screen calls the API through `apiFetch(path, init?)`, or a small function built on it such as `getMe()`. A screen never handles a token.

- The helper asks the Supabase library for the current token on every call and does not keep it, because the token is swapped for a new one about once an hour.
- An error answer from the API is thrown as an `ApiError` with the status, the code, the message and the request ID.
- If the API cannot be reached at all (it is stopped, or the browser blocked the call), `fetch` itself throws and that error is passed on. `apiFailureMessage(error)` turns either kind into the line a screen shows.
- A session the API no longer accepts is handled here, in one place: on a 401 the user is signed out, and on the code `no_company` the user is signed out with a message for the sign-in page. The guard then leaves the page. The error is still thrown.
- The sign-in form is the one caller that passes a token in (`getMeAtSignIn`), because it asks before the user is let in and must not be signed out by the helper.

### Settings in the web app

- The web app reads the root `.env`, through a few lines at the top of `next.config.ts`. It has no `.env` of its own.
- Next.js hands a setting to the browser only when its name starts with `NEXT_PUBLIC_`. Such a setting is copied into the code sent to the browser, so anyone can read it. **A secret never gets the `NEXT_PUBLIC_` prefix.**
- A `NEXT_PUBLIC_` value is fixed when the web app is started or built. Restart `npm run dev:web` after changing one.
- The two `NEXT_PUBLIC_SUPABASE_` values must be the same as the API's `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. They are written twice on purpose, so that only names with the prefix ever reach the browser.

### Traps

- **Next.js 16 differs from older versions.** `apps/web/AGENTS.md` (written by Next.js itself, and written back by `next dev` if removed) says to read the docs shipped in `node_modules/next/dist/docs/` before writing web code. Do that instead of working from memory.
- **`cacheComponents` and `partialPrefetching` are on** in `next.config.ts`. They change how the Next.js server prepares and caches pages. Nothing on our server reads the session, so they have little to act on, but two effects matter:
  - **A page that was left stays alive in the background,** with what was typed into it. That is why the sign-in form empties its fields after a sign-in, why the guard draws the page under the user's ID, why the job form empties itself and drops its one-time key after a save, and why a job's page draws its content under the job's ID.
  - **A page with an ID in its address (`jobs/[jobId]`) gets `params` as a promise, and the part that reads it must sit in a `<Suspense>`.** The ID is only known when the page is opened, not when the app is built. A production build shows such a page as "Partial Prerender".
  - **Reading the address in a browser part (`useSearchParams`) needs a `<Suspense>` around it,** or the build fails. The sign-in form does this for its notice.
- **The automatic "instant navigation" check is switched off** (`experimental.instantInsights` in `next.config.ts`). Under `npm run dev` it draws each page on the server, and the guard draws no page there, so every page behind the guard was reported as "dropped from rendering". Writing `export const instant = false` in the `(dashboard)` layout did not remove the message; only the page file or this setting does.
- **Signed in, then thrown straight back to the sign-in page:** the two `NEXT_PUBLIC_SUPABASE_` values probably differ from the API's pair. The API answers 401 to a token from another project, and the call helper signs out on any 401.
- **`localhost:3100` and `127.0.0.1:3100` are different sites to the browser.** Local storage is kept per site, so signing in on one does not sign in on the other. Use `localhost:3100`, which is also what CORS allows.
- **A removed session can still work for up to an hour.** Sign-out removes the session from the browser, but an access token already handed out is accepted by the API until it runs out.
- **The session can be read by scripts on the page.** That is how Supabase's browser library works. So CV and email text must never be shown as HTML. Keeping the token in a cookie that scripts cannot read is an open point in [decisions.md](decisions.md).
- **The web type check is `next typegen && tsc --noEmit`.** Next.js generates some types first, such as `LayoutProps`. Plain `tsc` alone fails on a fresh clone.
- **Its TypeScript settings are Next's own.** `apps/web/tsconfig.json` does not extend the shared `tsconfig.base.json`, which is set up for Node.
- **ESLint reports success when there are only warnings.** Several React rules, such as an effect that misses a value it uses, are warnings. The lint command therefore runs with `--max-warnings 0`. It covers the web app only.
- **The page shows no colours, black text and a plain font:** the running web app is serving an old stylesheet. Seen once in task 8: the styles file had changed, but `npm run dev:web` kept serving styles made from the old one, while a production build of the same code was right. Stop it, delete `apps/web/.next/dev` and start it again. The cause was not proven. A production build had been run in `apps/web` in the same minute the web app started. The Next.js docs say the two do not disturb each other, because development writes into `.next/dev`; in task 11 a production build was run twice while `npm run dev:web` was running and the web app kept working. So the build is not proven to be the cause.
- **The menu reads the current address (`usePathname`), so it sits in a `<Suspense>`.** With `cacheComponents` on, the Next.js docs say the build can fail without it once a page has a part of its address not known at build time, such as `/jobs/123`.
- **A colour that is not in `globals.css` does nothing.** A class such as `bg-brand-blue` gives no error and no style. Add the colour there first.

## 7. Mailbox (Gmail through mailsift)

Nothing in the product reads mail yet. What exists is the setup and two scripts that prove the chain works. The real client is task 20, and storing a company's mailbox secret is task 21.

### The chain

```
our code  --->  Google            swaps the mailbox secret for a one-hour pass
our code  --->  mailsift (HTTP)   one request per question, with two keys
mailsift  --->  Gmail             read only
```

- **mailsift** is a separate small server in its own repo (`/home/hammadahmad/Documents/mail-sift/mailsift`). It reads Gmail and returns clean data. It stores nothing and can only read.
- **The mailbox secret** (Google calls it a refresh token) is the long-lived key to one mailbox. mailsift never sees it.
- **The pass** (Google calls it an access token) is made from the secret, lasts one hour, and is what mailsift gets.
- A request to mailsift carries two keys: `Authorization: Bearer <server key>` ("we may use this mailsift") and `X-Mail-Token: <pass>` ("this mailbox").
- mailsift keeps no session. One `POST /mcp` with a `tools/call` message stands alone, and the data comes back as JSON inside a text field. A refusal comes back the same way, as `{ code, message, hint }` with `isError: true`.

### The Google project

Google lets a program read a mailbox only when the program is registered. The registration is a Google Cloud project, made by hand in the Google Cloud console. One project serves every mailbox.

| Setting in the console | Value now | Why |
|---|---|---|
| Gmail API | switched on | |
| User type | External | The mailboxes are outside any organisation of ours. |
| Publishing status | Testing | "In production" needs a home page and a privacy policy on a domain we own. |
| Test users | the test mailbox | In "Testing" only listed addresses can click Allow. |
| Permission | `gmail.readonly` only | mailsift refuses a pass that allows more than reading. |
| Client | type "Desktop app", AI agent box empty | The connect script runs on our own machine. |

The client ID and client secret identify the app, not a mailbox. Google shows the client secret only once, when the client is created.

### The two scripts

Both are in `services/worker/src/scripts/` and are for the development machine only.

**`npm run mailbox:connect`** gets the mailbox secret.

1. It starts a tiny listener on `127.0.0.1`, on a free port.
2. It prints a Google link. Open it, sign in as the test mailbox and click Allow.
3. Google sends the browser back to the listener with a one-time code.
4. The script swaps the code at Google for the mailbox secret and prints one line, `DEV_MAILBOX_REFRESH_TOKEN=...`, to paste into the root `.env`.

**`npm run mailbox:check`** proves the chain. mailsift must be running first, in its own terminal, from its own folder:

```
npm run dev:env -- --http
```

The script makes a pass, asks mailsift which mailbox it is, and prints the date, sender and subject of the five newest emails.

Both scripts use plain prints, not the logger. A secret or an email subject must never go through the logger.

### Traps

- **The mailbox secret ends after 7 days** while the Google project is in "Testing". The check then says the secret has ended; run `npm run mailbox:connect` again and replace the line in `.env`.
- **A password change on the mailbox also ends the secret.** So does removing the app's access in the Google account.
- **mailsift uses port 3000,** the port a new Next.js project picks by default. If another program holds it, mailsift stops at once with a clear error.
- **mailsift is run from source,** not from its `dist` folder, which can be older than its code.
- **Use `127.0.0.1`, not `localhost`, for mailsift.** It listens on `127.0.0.1` only.
- **mailsift refuses a search with no filter** and allows a date range of at most 365 days.
- **After a failed script, npm prints several lines starting with `npm error`.** The script's own message is the line above them.
- **"In production" is not tried yet.** Google's pages do not agree on whether an unreviewed app may read mail there. See the open points in [decisions.md](decisions.md).

## 8. Database and companies (Supabase)

One hosted Supabase project holds the Postgres database and the sign-in service. Its region is Singapore.

### The two keys

| | Publishable key | Secret key |
|---|---|---|
| Who has it | Any browser. The web app's sign-in uses it | Only the API, the worker and our scripts |
| What it is | The project's public name | The master key |
| What it reaches | Only what the row rules allow, which for our tables is nothing | Everything. It goes past the row rules |

The API makes one client with each (`src/lib/supabase.ts`): the secret one for all data, the publishable one only for checking tokens.

### Who keeps companies apart

- **Our code.** The secret key can read every company's rows, and the database does not know which user a request is for. So every repository function filters by `tenant_id`, and that ID always comes from the sign-in check. One forgotten filter would show a user another company's rows.
- **The row rules keep everyone else out.** Supabase gives the database its own web address, which our API uses too. Every table has row level security switched on, no rights and no policies for the browser-side roles, and written-out rights for the server role. Someone who asks that address directly with only the publishable key and a user's token gets nothing.

**The helper `forTenant`** (`packages/core/src/tenant-db.ts`) is how our code does it. A repository never writes the company filter by hand, so it cannot forget it:

```ts
const company = forTenant(db, tenantId);

company.select("jobs", "id, title").eq("id", jobId).maybeSingle();  // filter added inside
company.insert("jobs", { title, description });                      // company set inside
company.update("jobs", { status: "open" }).eq("id", jobId);          // filter added inside
company.delete("jobs").eq("id", jobId);                              // filter added inside
```

- Each function gives back the Supabase library's own query, so the caller goes on with `.eq(...)`, `.order(...)` or `.single()` as usual. A filter added later only narrows the result; it cannot widen it past the company.
- `insert` sets `tenant_id` itself, whatever the values say. `update` refuses a change that sets `tenant_id`, and an empty company ID is refused at once.
- The tables it may reach are a fixed list in that file, `TenantTable`: `jobs` and `work_runs`. A new table with company data adds its name there, and its repository uses the helper for every query.
- Every repository function takes the company's ID as its first argument. In the API that ID comes from the sign-in check; in the worker from a work item that passed its shape check.
- `tenants` and `tenant_members` are not reached through it. They are the company itself and the lookup that finds a user's company, so there is no company filter to add.

**There is no automatic separation test yet.** It was planned for task 6, then for task 11, and was taken out of task 11; it has no task now (open point in [decisions.md](decisions.md)). Until it exists, each task checks its new code by hand with a made-up company ID, which must find, change and delete nothing. That proves the filter is applied. It does not replace a test with two real companies and real sign-in tokens.

### SQL files

- A database change is one file in `supabase/migrations/`, named with a date and time.
- It is applied by pasting it into Supabase's SQL editor, after the go-ahead for that file.
- It is wrapped in `begin` and `commit`, so it applies completely or not at all.
- It starts by adding its own name to `applied_migrations`. A name is allowed only once, so a second run stops there and changes nothing. That table also shows which files were applied and when.

### Creating companies and users

There is no public sign-up; it is switched off in the Supabase project. `src/scripts/company.ts` is the only way a company or a user comes into being:

```
npm run company:create -- --company "Acme Trading" --email sara@acme.com
npm run company:add-user -- --company acme-trading --email omar@acme.com
```

- `company:create` makes the company row, the sign-in account and the row that joins them, with the role `owner`. `company:add-user` adds a `member`.
- The short name is made from the company name. `--slug` sets it by hand, which is needed for a name with no Latin letters.
- `--test` makes the short name start with `test-`, so test companies are easy to find and remove.
- Without `--password` a strong random password is made and printed once. With it, that password is used and not printed again.
- The three things cannot be saved in one step, because the sign-in account is made by Supabase's sign-in service and not by our database. When a later step fails, the earlier ones are removed again.

### Traps

- **The API does not start without the three Supabase settings.** The message names the missing one.
- **A table made by hand in Supabase's website skips our SQL files** and may get rights we did not choose. Always use a SQL file.
- **There is no command to delete a company yet.** A test company is removed by hand: delete its users under Authentication, then its row in `tenants`.
- **A password typed on the command line stays in the terminal's history.** Leave `--password` out for a real user.
- **A free Supabase project is paused when it sits idle.** It is switched back on from Supabase's website.
- **The region cannot be changed in place.** It means a new project. Pick from the "specific regions" list; a "general region" lets Supabase choose the data centre.

## 9. The work queue (Redis and BullMQ)

Long work never runs inside an API request. The API saves a row that says "this work is waiting", adds a small note, a **work item**, to a queue, and answers at once. The worker takes items from the queue and does the work. The two programs never talk to each other; Redis sits between them.

- **Redis** is a small program that keeps data in memory. It holds the queue.
- **BullMQ** is the library that turns Redis into a queue: it adds items, hands each one to one worker, retries the failed ones and takes back the ones of a dead worker.
- BullMQ's own word for a work item is "job". Ours is not: "job" means a hiring job.

### A run and its work items

| | A run | A work item |
|---|---|---|
| What it is | One piece of work as HR sees it: "reading round 1: running" | One small step in the queue |
| Where it lives | A row in `work_runs`, in Postgres | A note in Redis |
| What it holds | Kind, status, which try, why it failed, the times | A few IDs, never text |

One run can have one work item or many. Reading 200 CVs will be one run with about 200 items, so that a failure redoes one CV and not all of them. Every item carries its run's ID.

**What HR sees is always read from Postgres, never from Redis.**

So far there is one queue, `demo`, with one kind of item that does no real work. It exists to prove the path and the failure cases. Everything with "demo" in its name is removed when the first real work exists (task 22); the table, the repository and the failure handling stay.

### The path of one click

1. The browser sends `POST /v1/demo-work`.
2. The API closes this company's demo runs that have not changed for 10 minutes (see "Stuck runs").
3. The API adds a row to `work_runs` with the status `waiting`. The database makes the row's ID.
4. The API queues an item: `{ workRunId, tenantId, requestId, mode }`.
5. The API answers 202 ("accepted, not done yet") with the run. It does not wait for the work.
6. The worker takes the item, checks its shape, and updates the row: `running`, try 1.
7. Two seconds later it updates the row: `done`.
8. The page asks `GET /v1/demo-work` every 2 seconds while a run is unfinished, and shows each change.

If step 4 fails because Redis is down, the API marks the row `failed` with the error `queue_unavailable` and answers 503. The row is saved before the item is queued so that a run can never be working without a row; this fix-up is the other half of that order.

### The status of a run

```
waiting  --->  running  --->  done
   ^              |
   |  a try failed, another follows
   +--------------+
                  |
                  +--->  failed     (the last try failed, or the queue gave up)
```

- `attempt` says which try the run is on. Between tries the row goes back to `waiting` and keeps its number, so the page reads "waiting, try 1", then "running, try 2".
- `error` is a short fixed word, never a raw error message, which could repeat personal data. The full error goes to the worker's log, with IDs only.

| Error word | Meaning |
|---|---|
| `queue_unavailable` | The item could not be queued, because Redis was away |
| `work_failed` | The work threw an error on its last try |
| `worker_lost` | The worker running it died twice and the queue gave up |
| `timed_out` | The run did not change for too long and was closed |

- **A run that is `done` or `failed` is never changed again.** Every update in `WorkRunRepository` applies only to an unfinished row, and answers whether a row was changed. A late update, for example from an item that ran twice, changes nothing.
- **An older try cannot write over a newer one.** "Mark running" applies only when its try number is not lower than the row's.
- **A handler asks first, then works.** If "mark running" answers that the run is finished or gone, the worker skips the item. That is what makes a handler safe to run twice.

### The five cases

The demo panel has one button for each.

**Retry, then success ("Fail once").** An item whose handler throws is tried again after a wait: three tries in all, with waits of 2 and then 4 seconds. The handler itself moves the row back to `waiting` before it hands the error to the queue, so the row is right before the next try is planned.

**The retry limit ("Always fail").** After the third failed try the handler marks the row `failed` with `work_failed`. The item goes to BullMQ's failed list and is not tried again. A new click starts a fresh run.

**A delayed item ("Run in 20 seconds").** The item is kept aside for 20 seconds before any worker may take it. The row says `waiting` until then.

**A killed worker ("Slow").** A worker holds a 30-second lock on the item it runs and renews it while it lives. A killed worker stops renewing. The item is taken back and run again, by any worker, about a minute later: the lock must run out, and the check for stuck items runs every 30 seconds. This does not count as a try. It is allowed once. If the item's worker dies a second time, the next worker to pick the item up is told it failed, without running the handler, and marks the row `failed` with `worker_lost`.

**Duplicates (any button, clicked twice).** A rule in the database allows a company only one unfinished run of a kind. The second click's row is refused, so no second row, no second ID and no second item exist, and the API answers 409 with the code `already_queued`. It is a database rule and not a check in our code, because two clicks at the same moment would both pass a check; the database lets only one row in.

### Stuck runs

If a worker dies and no worker ever comes back, nothing updates the row, and it says `running` for ever. With the duplicate rule that would also block the company's next run. So before a new run is added, the API closes that company's unfinished runs of the same kind that have not changed for 10 minutes: `failed`, with the error `timed_out`.

This only happens when someone starts a new run. A check that runs by itself is an open point for task 22, and real work will pick its own time limit.

### Who learns that a try failed

The worker's `failed` event fires after **every** failed try, not only the last. `isFinalFailure` tells the last one: either the tries are used up, or the queue gave up on the item, which it reports as an `UnrecoverableError`.

- After an ordinary failed try, the handler has already updated the row.
- When the queue gave up, no handler ran. The `failed` listener in the worker's `index.ts` is the only place that learns of it, so it marks the row `failed`.

### The rules an item follows

- **IDs only.** An item holds its run's ID, the company ID and the API's request ID, never names or text. It is saved in Redis and its fields are written to the logs. This is a rule for all code in `CLAUDE.md`. The demo's `mode` is one fixed word from a list and goes away with the demo.
- **The company ID comes from the signed-in user,** never from the request.
- **The shape is defined once,** as a zod shape in core (`demoWorkItemSchema`). The API builds an item from it and the worker checks every item against it before running it, because an item comes from Redis, not from our own memory.
- **Every log line about an item carries four IDs:** the work item ID, the run ID, the request ID and the company ID. The request ID is the one the API logged for the click.
- **Finished items are cleaned up in Redis.** The last 1,000 done and 5,000 failed are kept.

### The two sides

**The adding side (`DemoQueue`, used by the API)** must never make a web request wait.

- It is created once, when the API starts, with `enableOfflineQueue: false`: when Redis goes away, adding fails at once.
- It keeps its own "ready" mark and refuses to add until its first connection is made. Without the mark, a queue created while Redis is down keeps the add waiting until Redis comes up.
- A refused add throws `QueueUnavailableError`, which the API's service turns into a 503.
- So the API starts even when Redis is stopped, and the queue starts working by itself when Redis comes up.

**The running side (`createDemoWorker`, used by the worker)** waits patiently. When Redis cannot be reached it keeps trying and carries on when Redis is back. It runs one item at a time.

Both sides report connection errors through `createQueueTroubleLogger`, which logs one line and then stays quiet for 30 seconds.

### The clean stop

Ctrl+C sends the worker a signal (SIGINT). A restart after a file change, or a hosting service stopping the program, sends another (SIGTERM). On either the worker takes no new item, lets the running item finish, and then ends. An item still waiting stays in Redis for the next worker. A second signal ends the worker at once.

A clean stop is not a kill. To see the killed-worker case the worker must be ended hard. From the repo root, this ends every process of `npm run dev:worker`:

```
for p in $(pgrep -f "src/index.ts"); do [ "$(readlink /proc/$p/cwd)" = "$PWD/services/worker" ] && kill -9 $p; done
```

Then start `npm run dev:worker` again.

### Redis on the development machine

Installed from Redis's official package source, not Ubuntu's own, which is too old (6.0.16; BullMQ needs 6.2 or newer). It starts at boot as the service `redis-server`, listens on this machine only (port 6379), and has no password.

Looking inside with `redis-cli`, which comes with Redis:

| Command | Shows |
|---|---|
| `redis-cli ping` | `PONG` when Redis is running |
| `redis-cli zcard bull:demo:completed` | How many items are done |
| `redis-cli zcard bull:demo:failed` | How many failed |
| `redis-cli llen bull:demo:wait` | How many are waiting |
| `redis-cli zcard bull:demo:delayed` | How many are kept aside: delayed, or waiting for their next try |
| `redis-cli hgetall bull:demo:1` | Item 1: its data, its settings and its times |

### Traps

- **The page says "The work queue cannot be reached":** Redis is not running. Check with `redis-cli ping`, and start it with `sudo systemctl start redis-server`.
- **A run stays on "waiting":** the worker is not running, or the item is delayed, or it waits for its next try. An item waits in Redis and is run as soon as a worker can take it.
- **A run stays on "running" for about a minute after the worker was killed:** that is the lock running out. It is not stuck.
- **The page says "A demo run is already waiting or running":** one run at a time per company. If a run really is stuck, it is closed 10 minutes after its last change, at the next click.
- **Never log a field of an item before the item passed the shape check.** An item with the wrong shape can hold anything in a field named `tenantId`. The work item's own ID, given by the queue, is always safe.
- **Do not update the row from the `failed` event when the handler can do it.** The event is not waited for, so its update can arrive after the next try has started.
- **`attemptsMade` is the number of tries that already failed.** In the handler the current try is `attemptsMade + 1`; in the `failed` event it already counts the try that just failed.
- **BullMQ's switch `skipWaitingForReady` is not used.** With it, a queue created while Redis was down failed at once but never worked again after Redis came up.
- **Every queue and worker needs an `error` listener.** Without one, a connection error stops the whole program.
- **A read that only counts rows can hide a missing table.** With the Supabase library, `select(..., { head: true })` on a table that does not exist came back with no error and an empty count. Read one row to be sure.
- **Redis saves to disk only from time to time.** A crash of the machine can lose the items added since the last snapshot. Fine for development; for production see the open points in [decisions.md](decisions.md).
- **Items are handed out in the order they arrived.** One company's 200 items stand in front of another company's 5. Taking turns needs more than small items; it is an open point for task 30.
- **This Redis is shared by everything on the machine that points at port 6379.** Another project using it with a queue also named `demo` would mix its items with ours. Nothing else uses it today.

## 10. Jobs

A job is one hiring job of a company: a title, the job description, the subject words and a posting date. HR creates it with a form. Creating a job only saves it, as a draft. Nothing reads mail or CVs because a job was created; the later steps each need HR's own confirm.

### The table

`jobs` (SQL file `20261124140000_jobs.sql`):

| Column | Holds |
|---|---|
| `title` | The job's short name on our screens, 1 to 120 characters. Never used to search mail |
| `description` | The job description as free text, up to 20,000 characters |
| `subject_words` | The phrases looked for in email subjects, as a Postgres list (`text[]`), 1 to 10 phrases |
| `posting_date` | A plain date. Mail from this day onward is looked at |
| `status` | `draft`, `open` or `closed` |
| `create_key` | The one-time key the form sent. Allowed once per company |
| `created_by` | The user who created the job. Empty when that account was deleted |

- **Status.** A new job is a `draft`: its requirements are not confirmed yet. `open` is set when HR confirms them (task 16) and `closed` when HR closes the job (task 48). What is running at the moment, such as "reading 120 of 200", is not a job status; that is read from `work_runs`.
- **Subject words.** One phrase is enough. Inside a phrase all its words must be in the subject, in any order (mailsift sends Gmail `subject:(Senior Accountant)`). A second phrase is for applicants who use other words for the same job. Picking an email that matches any one phrase is built in task 22.
- **Two "allowed once" rules.** `(tenant_id, create_key)` is the one-time key. `(tenant_id, id)` looks pointless, since an ID is unique by itself; it exists so that a later table can point at a job together with its company, and the database then refuses a row that names one company and another company's job.
- Columns that later steps need (strict or lenient, when the requirements were confirmed, when the mailbox was last checked, when the job was closed) are added by the tasks that first use them.

### The addresses

| Address | What it does | Answers |
|---|---|---|
| `POST /v1/jobs` | Saves a new job for the user's company | 201 with the job. 200 with the saved job when the key was used before. 400 when a limit is broken |
| `GET /v1/jobs` | The company's newest 100 jobs, newest first, without the description | 200 |
| `GET /v1/jobs/:jobId` | One job in full | 200, or 404 `job_not_found` |

Every user of the company, owner and member, may create and see jobs. The answers never hold the company ID or the one-time key.

### The path of one "Create job"

1. HR clicks "Create job". Text still in the subject field becomes a chip, and the form checks the fields.
2. The form makes its one-time key, switches the button off and sends `POST /v1/jobs` with the token.
3. The two sign-in steps find the user and the company. Neither is read from the body.
4. `JobService` checks the body again with zod, tidies the phrases and picks the posting date.
5. `JobRepository` inserts the row through `forTenant`, which sets the company.
6. The API logs "job created" with the job's ID only, and answers 201.
7. The form empties itself, drops its key and opens `/jobs/<id>`.

### The one-time key

A slow call can save the job and still lose its answer. HR sees an error, clicks again, and without a guard there are two jobs. A request that is safe to send twice is called idempotent, and the key is what makes this one so.

- The form makes a random UUID on the first click of "Create job" and sends it again on every retry of that form.
- The database allows a key once per company. This is a rule in the database, not a check in our code: two requests at the same moment would both pass a check, but the database lets only one row in.
- The refused insert tells the service that the key was used. The service then reads the job saved under that key and answers with it, so every request ends on the same job. The content of the second request is ignored.
- After a save the form drops the key, so opening "New job" again starts a new job.

### The screens

- **The list** (`job-list.tsx`) shows each job as a card: the title, the status label, up to three subject phrases and then "+2 more", and the two dates. The whole card is one link. It asks the API each time the page appears.
- **The form** (`job-form.tsx`) fills the posting date with "7 days ago" by the user's own computer. An emptied date field is not sent, and the API then uses 7 days back by its own clock.
- **The chip field** (`subject-words-field.tsx`) is written by us; there is no component library. Its whole value (the chips, the text being typed, and the small line that says why a phrase was not added) is kept by the form, so the form can turn leftover text into a chip when the button is clicked. Enter adds a chip and does not send the form. A comma ends a phrase, typed or pasted. Backspace in the empty field removes the last chip. The cross is a real button.
- **A job's page** (`job-details.tsx`) shows the description as plain text, never as HTML.
- The "New job" page and a job's page have a "Back to jobs" button at the top (`back-to-jobs.tsx`).

### Traps

- **The limits are written twice:** in `services/api/src/services/job.service.ts` and in the web app (`job-form.tsx`, `subject-words-field.tsx`). The web app cannot import server code. Change both together; the database has its own copy of the title, description and phrase-count limits in the SQL file.
- **The API is the judge, not the form.** The form's checks are for a quick message. A request can come from something other than the form, later the chat agent, so the API checks everything again: it drops a repeated phrase quietly and turns several spaces inside a phrase into one.
- **A wrong ID, another company's ID and text that is no ID all answer 404.** Nobody can learn from the answer whether an ID exists. Text that is no ID is refused before the database is asked; Postgres would answer it with an error, which would become a 500.
- **The posting date has one day of room on both sides.** It is typed in the user's own time zone, where "today" can be the server's "tomorrow". So the API accepts a date up to one day ahead of its own clock and 366 days behind it.
- **A date written as `2026-11-17` must not be read with `new Date("2026-11-17")`.** That reads it as midnight in UTC, which is the day before in some time zones. `plainDate` in `job-list.tsx` hands the three numbers over one by one.
- **Two such dates compare correctly as plain text,** which is how the API checks the range.
- **A text with a NUL character is refused with 400.** Postgres cannot store that character.
- **A job cannot be edited or deleted yet.** A typo in the title stays. Later tasks bring the edits: subject words (25), the description (44), closing (48).
- **The list is capped at 100 and has no paging.** The page says so when the cap is reached.
- **`crypto.randomUUID()` in the browser needs a secure page:** `https`, or `localhost` in development.
