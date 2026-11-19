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
| Web app | `apps/web` | `@siftmerit/web` | Sign-in and sign-out, a top bar with the menu and the company name around every signed-in page, a home page at `/`, and a placeholder page at `/jobs`. |
| API | `services/api` | `@siftmerit/api` | Checks who is calling and which company they belong to. Two addresses: `/v1/health` and `/v1/me`. Also holds the script that creates companies and users. |
| Worker | `services/worker` | `@siftmerit/worker` | Starts, logs one line and finishes. There is no queue yet. It also holds the two mailbox scripts (section 7). |
| Core | `packages/core` | `@siftmerit/core` | Shared code for the API and the worker: the logger and the settings loader. |

How they talk today:

```
Browser  --->  Web app (Next.js, port 3100)     sends the page
Browser  --->  Supabase                         sign-in and sign-out only
Browser  --->  API (Express, port 4100)         the page's own calls, with the token
API, Worker  --->  Core                         imported as a package
API  --->  Supabase                             the database and the sign-in check
```

The queue and the AI model are not connected yet. The mailbox is reached only by two development scripts (section 7); the API and the worker do not use it yet. The browser never reads the database: Supabase gives it a sign-in token, and every piece of data comes from the API.

## 2. Running it

Run from the repo root, each in its own terminal.

| Command | What it starts |
|---|---|
| `npm run dev:api` | The API on port 4100. Health check: `http://localhost:4100/v1/health`. |
| `npm run dev:worker` | The worker. It logs one start line and then waits for file changes. |
| `npm run dev:web` | The web app on `http://localhost:3100`. |
| `npm run typecheck` | The type check for all four parts. It must pass after every task. |
| `npm run lint` | ESLint for the web app, with the Next.js rules. A warning fails it. It must pass after every task. |
| `npm run company:create` | Creates a company and its first user (section 8). |
| `npm run company:add-user` | Adds a user to a company (section 8). |
| `npm run mailbox:connect` | Development only. Gets the test mailbox's secret with one Allow click (section 7). |
| `npm run mailbox:check` | Development only. Lists five emails from the test mailbox through mailsift (section 7). |

All three `dev` commands restart their part when a file changes.

### Settings

- There is one `.env` file, at the repo root, for every part. `.env.example` lists every setting.
- Most settings have a default. The three Supabase settings have none, and the API does not start without them. The two `NEXT_PUBLIC_SUPABASE_` settings have none either: the web app starts without them, but every page then shows "Sign-in is not set up". The mailbox settings have none and are needed only by the two mailbox scripts. The worker still starts without a `.env` file.
- A setting already present in the shell wins over the file. For example, `LOG_LEVEL=debug npm run dev:api`.
- A setting is added by the task that first uses it.

| Setting | Used by | Default |
|---|---|---|
| `NODE_ENV` | API, worker | `development` |
| `LOG_LEVEL` | API, worker | `info` |
| `API_PORT` | API | `4100` |
| `CORS_ORIGIN` | API | `http://localhost:3100` |
| `NEXT_PUBLIC_API_URL` | Web app | `http://localhost:4100` |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | API, company scripts | none |
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
- `sharedEnvSchema`: the settings both services use (`NODE_ENV`, `LOG_LEVEL`). A service adds its own with `sharedEnvSchema.extend({ ... })`.

**Traps**

- Production needs JavaScript. A service's own `tsc` build does not write core's JavaScript, so the production build must compile core too. This is an open point for task 53.
- The web app does not use core. Core holds server-only code.
- A type error inside core is reported by the type check of the API and the worker as well, because they read core's source.

## 4. API (`services/api`)

The layout is routes -> controllers -> services -> repositories. A route names the address and the steps in front of it, a controller reads the request and writes the answer, a service holds the rules, and a repository is the only code that talks to a table. `src/app.ts` builds these pieces once at start and wires them together.

### The path of a request

`src/app.ts` lists the steps in order:

1. **Request log.** Makes a request ID, attaches a logger that carries it (`req.log`), sends the ID back as the `x-request-id` header, and prints one "request finished" line when the answer has been sent.
2. **CORS.** Tells browsers which web address may read the API's answers. See below.
3. **Routes.** Everything is under `/v1`. `/v1/health` needs no sign-in. Every other address has the two sign-in steps in front of it (see "Sign-in check" below).
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

Today the worker loads its settings, builds the logger with `service: "worker"`, logs one start line and finishes. Under `npm run dev:worker` it then waits for file changes, which is normal.

Task 9 adds the BullMQ queue listener. That keeps the process running and brings the logger that carries a work item ID.

The folder `src/scripts/` holds the two mailbox scripts. They are tools a developer runs by hand, not part of the running worker, and they have their own settings file so the worker starts without any mailbox setting. See section 7.

## 6. Web app (`apps/web`)

A Next.js 16 app with React 19 and Tailwind 4, using the App Router and a `src` folder. It was created with the `create-next-app` generator (empty template) and then trimmed.

### What exists

- `src/app/layout.tsx`: the outer frame of every page. It loads the font and sets the cream background and navy text.
- `src/app/globals.css`: the colours and the font, written once.
- `src/app/signin/page.tsx`: the sign-in page at `/signin`. It is the one page that needs no signed-in user.
- `src/app/(dashboard)/layout.tsx`: puts the guard, and inside it the shell, around every page in the `(dashboard)` folder. A folder name in brackets is not part of the address.
- `src/app/(dashboard)/page.tsx`: the home page at `/`, where a signed-in user lands. It holds a "Jobs" section.
- `src/app/(dashboard)/jobs/page.tsx`: the page at `/jobs`, a placeholder until task 11.
- `src/components/auth-guard.tsx`: the guard.
- `src/components/dashboard-shell.tsx`, `dashboard-nav.tsx`: the top bar with the page area below it, and the menu.
- `src/components/me-context.tsx`: asks `/v1/me` once and shares the answer.
- `src/components/sign-in-form.tsx`, `sign-out-button.tsx`: the form and the button.
- `src/lib/supabase.ts`: the one Supabase client for the browser.
- `src/lib/api.ts`: the call helper.
- `src/lib/styles.ts`: looks that more than one screen uses, such as the button.

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
- Every button uses `BUTTON_CLASSES` from `src/lib/styles.ts` and adds only its own size.
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
  - **A page that was left stays alive in the background,** with what was typed into it. That is why the sign-in form empties its fields after a sign-in, and why the guard draws the page under the user's ID.
  - **Reading the address in a browser part (`useSearchParams`) needs a `<Suspense>` around it,** or the build fails. The sign-in form does this for its notice.
- **The automatic "instant navigation" check is switched off** (`experimental.instantInsights` in `next.config.ts`). Under `npm run dev` it draws each page on the server, and the guard draws no page there, so every page behind the guard was reported as "dropped from rendering". Writing `export const instant = false` in the `(dashboard)` layout did not remove the message; only the page file or this setting does.
- **Signed in, then thrown straight back to the sign-in page:** the two `NEXT_PUBLIC_SUPABASE_` values probably differ from the API's pair. The API answers 401 to a token from another project, and the call helper signs out on any 401.
- **`localhost:3100` and `127.0.0.1:3100` are different sites to the browser.** Local storage is kept per site, so signing in on one does not sign in on the other. Use `localhost:3100`, which is also what CORS allows.
- **A removed session can still work for up to an hour.** Sign-out removes the session from the browser, but an access token already handed out is accepted by the API until it runs out.
- **The session can be read by scripts on the page.** That is how Supabase's browser library works. So CV and email text must never be shown as HTML. Keeping the token in a cookie that scripts cannot read is an open point in [decisions.md](decisions.md).
- **The web type check is `next typegen && tsc --noEmit`.** Next.js generates some types first, such as `LayoutProps`. Plain `tsc` alone fails on a fresh clone.
- **Its TypeScript settings are Next's own.** `apps/web/tsconfig.json` does not extend the shared `tsconfig.base.json`, which is set up for Node.
- **ESLint reports success when there are only warnings.** Several React rules, such as an effect that misses a value it uses, are warnings. The lint command therefore runs with `--max-warnings 0`. It covers the web app only.
- **The page shows no colours, black text and a plain font:** the running web app is serving an old stylesheet. Seen once in task 8: the styles file had changed, but `npm run dev:web` kept serving styles made from the old one, while a production build of the same code was right. Stop it, delete `apps/web/.next/dev` and start it again. The cause was not proven. A production build had been run in `apps/web` in the same minute the web app started, and both write into `.next`, so do not run `next build` there while `npm run dev:web` is running.
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

A helper that always adds the company filter, and the automatic separation test, are planned for task 11, when the first table with company data arrives.

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
