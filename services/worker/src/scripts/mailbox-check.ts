// Lists five emails from the test mailbox, through mailsift.
// Run from the repo root: npm run mailbox:check
//
// A development tool for our own machine only. It proves the whole chain:
// our Google settings -> a one-hour pass -> mailsift over HTTP -> Gmail.
// It uses plain prints, not the logger: showing subjects and senders is its
// purpose, and those must never go through the logger.
//
// The real mailsift client (task 20) replaces what is in this file.

import { GOOGLE_TOKEN_URL, loadCheckSettings, type CheckSettings } from "./mailbox-settings.js";

const HOW_MANY = 5;
// mailsift refuses a search with no filter and allows at most 365 days.
const SEARCH_DAYS = 360;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Swaps the mailbox secret at Google for a pass that lasts one hour. */
async function makePass(settings: CheckSettings): Promise<string> {
  let response: Response;
  try {
    response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: settings.DEV_MAILBOX_REFRESH_TOKEN,
        client_id: settings.GOOGLE_CLIENT_ID,
        client_secret: settings.GOOGLE_CLIENT_SECRET,
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("Could not reach Google. Check the internet connection and try again.");
  }

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    if (body.error === "invalid_grant") {
      throw new Error(
        "The mailbox secret has ended or was removed. Run `npm run mailbox:connect` again and put the new line in .env.",
      );
    }
    if (body.error === "invalid_client") {
      throw new Error(
        "Google does not accept the client ID or client secret. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.",
      );
    }
    const name = typeof body.error === "string" ? body.error : `HTTP ${response.status}`;
    throw new Error(`Google refused to make a pass: ${name}.`);
  }
  if (typeof body.access_token !== "string" || body.access_token === "") {
    throw new Error("Google's answer held no pass (access token).");
  }
  return body.access_token;
}

/** The parts of mailsift's reply this script reads. */
interface ToolReply {
  error?: { message?: string };
  result?: {
    isError?: boolean;
    content?: Array<{ type?: string; text?: string }>;
  };
}

/**
 * Asks mailsift to run one tool and returns the data it sends back.
 *
 * mailsift keeps no session, so one request stands alone. It carries two keys:
 * the server key ("we may use this mailsift") and the one-hour pass ("this
 * mailbox, read only"). The data comes back as JSON inside a text field.
 */
async function askMailsift(
  settings: CheckSettings,
  pass: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(settings.MAILSIFT_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${settings.MAILSIFT_SERVER_KEY}`,
        "x-mail-token": pass,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: tool, arguments: args },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new Error(
      `mailsift is not running or did not answer at ${settings.MAILSIFT_URL}. Start it in its own terminal, from the mailsift folder: npm run dev:env -- --http`,
    );
  }

  if (response.status === 401) {
    throw new Error(
      "mailsift refused the server key. MAILSIFT_SERVER_KEY in .env must be one of MCP_SERVER_KEYS in mailsift's .env file.",
    );
  }
  if (!response.ok) {
    throw new Error(`mailsift answered with HTTP ${response.status}.`);
  }

  const reply = (await response.json()) as ToolReply;
  if (reply.error) {
    throw new Error(`mailsift could not run ${tool}: ${reply.error.message ?? "no message"}`);
  }
  const first = reply.result?.content?.[0];
  if (first?.type !== "text" || typeof first.text !== "string") {
    throw new Error(`mailsift's answer to ${tool} is not in the expected form.`);
  }

  const data: unknown = JSON.parse(first.text);
  if (reply.result?.isError) {
    // A refusal is { code, message, hint }, for example AUTH_TOKEN_INVALID.
    const refusal = data as { code?: string; message?: string; hint?: string };
    throw new Error(
      `mailsift refused ${tool}: ${refusal.code ?? "unknown"}. ${refusal.message ?? ""} ${refusal.hint ?? ""}`.trim(),
    );
  }
  return data;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "(missing)";
}

async function main(): Promise<void> {
  const settings = loadCheckSettings();
  const pass = await makePass(settings);

  const profile = (await askMailsift(settings, pass, "get_mailbox_profile", {})) as {
    email_address?: unknown;
    read_only?: unknown;
  };
  console.log(`Mailbox: ${text(profile.email_address)} (read only: ${profile.read_only === true ? "yes" : "no"})`);

  const after = new Date(Date.now() - SEARCH_DAYS * MS_PER_DAY).toISOString().slice(0, 10);
  const search = (await askMailsift(settings, pass, "search_mail", {
    after,
    page_size: HOW_MANY,
  })) as { items?: unknown };
  const items = Array.isArray(search.items) ? (search.items as Array<Record<string, unknown>>) : [];

  console.log(`\nNewest emails since ${after}:\n`);
  items.forEach((item, index) => {
    const date = text(item.date).slice(0, 10);
    console.log(`${index + 1}. ${date} | ${text(item.from)} | ${text(item.subject)}`);
  });
  if (items.length < HOW_MANY) {
    console.log(`\nOnly ${items.length} found in the last ${SEARCH_DAYS} days.`);
  }
  console.log("\nThe chain works: Google settings -> one-hour pass -> mailsift -> Gmail.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
