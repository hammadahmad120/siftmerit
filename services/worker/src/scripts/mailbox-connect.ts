// Gets the mailbox secret (refresh token) for the test mailbox.
// Run from the repo root: npm run mailbox:connect
//
// A development tool for our own machine only. It prints a Google link, waits
// for the Allow click, and prints one line to paste into the repo-root .env.
// It uses plain prints, not the logger: its output is for the person running
// it, and a secret must never go through the logger.

import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { GOOGLE_TOKEN_URL, loadConnectSettings, type ConnectSettings } from "./mailbox-settings.js";

const GOOGLE_ALLOW_URL = "https://accounts.google.com/o/oauth2/v2/auth";
// The only permission we ask for. mailsift refuses a pass that allows more.
const READ_ONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const WAIT_MS = 5 * 60 * 1000;
const SECONDS_PER_DAY = 24 * 60 * 60;

function randomText(): string {
  return randomBytes(32).toString("base64url");
}

/** Starts a listener on this machine only, on any free port. */
async function startListener(): Promise<{ server: Server; redirectUri: string }> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  return { server, redirectUri: `http://127.0.0.1:${port}` };
}

/**
 * Waits until Google sends the browser back to our listener, and returns the
 * one-time code it carries. `state` is a random value we put in the link; the
 * answer must carry the same value, which shows it belongs to our request.
 */
function waitForCode(server: Server, state: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Nobody clicked Allow within five minutes. Run the command again."));
    }, WAIT_MS);

    server.on("request", (request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");

      // The browser also asks for things like /favicon.ico. Those are not the answer.
      if (url.pathname !== "/" || (!error && !code)) {
        response.writeHead(404, { connection: "close" }).end();
        return;
      }

      // Send the page first, and only then go on, so the browser tab is not cut off.
      const finish = (page: string, next: () => void) => {
        clearTimeout(timer);
        response.writeHead(200, {
          "content-type": "text/plain; charset=utf-8",
          connection: "close",
        });
        response.end(page, next);
      };

      if (error) {
        const reason =
          error === "access_denied" ? "Allow was not clicked." : `Google answered "${error}".`;
        finish("Siftmerit: access was not given. Go back to the terminal.", () =>
          reject(new Error(`${reason} Run the command again.`)),
        );
      } else if (url.searchParams.get("state") !== state) {
        finish("Siftmerit: this answer does not belong to our request.", () =>
          reject(new Error("Google's answer came back without our check value (state).")),
        );
      } else {
        finish("Siftmerit: done. Close this tab and go back to the terminal.", () =>
          resolve(code as string),
        );
      }
    });
  });
}

interface SecretAnswer {
  secret: string;
  /** Days until the secret ends, when Google says so (it does in "Testing"). */
  endsInDays?: number;
}

/** Swaps the one-time code at Google for the mailbox secret. */
async function swapCodeForSecret(
  settings: ConnectSettings,
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<SecretAnswer> {
  let response: Response;
  try {
    response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        client_id: settings.GOOGLE_CLIENT_ID,
        client_secret: settings.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("Could not reach Google. Check the internet connection and try again.");
  }

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const name = typeof body.error === "string" ? body.error : `HTTP ${response.status}`;
    const detail = typeof body.error_description === "string" ? ` (${body.error_description})` : "";
    throw new Error(
      `Google refused the code: ${name}${detail}. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.`,
    );
  }
  if (typeof body.refresh_token !== "string" || body.refresh_token === "") {
    throw new Error("Google's answer held no mailbox secret (refresh token).");
  }

  const answer: SecretAnswer = { secret: body.refresh_token };
  if (typeof body.refresh_token_expires_in === "number") {
    answer.endsInDays = Math.floor(body.refresh_token_expires_in / SECONDS_PER_DAY);
  }
  return answer;
}

async function main(): Promise<void> {
  const settings = loadConnectSettings();

  // Two random values. `verifier` stays here; only its fingerprint goes into
  // the link, and the real value is shown to Google when the code is swapped.
  // So a code caught by someone else is useless to them.
  const verifier = randomText();
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomText();

  const { server, redirectUri } = await startListener();
  try {
    const link = new URL(GOOGLE_ALLOW_URL);
    link.search = new URLSearchParams({
      client_id: settings.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: READ_ONLY_SCOPE,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
      // Always show the Allow screen, so a new secret comes back every time.
      prompt: "consent",
    }).toString();

    console.log("Open this link, sign in as the test mailbox and click Allow:\n");
    console.log(`${link.toString()}\n`);
    console.log("Waiting for the Allow click (up to five minutes)...");

    const code = await waitForCode(server, state);
    const answer = await swapCodeForSecret(settings, code, verifier, redirectUri);

    console.log("\nConnected. Put this line in the repo-root .env file, replacing the old one if there is one:\n");
    console.log(`DEV_MAILBOX_REFRESH_TOKEN=${answer.secret}\n`);
    if (answer.endsInDays !== undefined) {
      console.log(`Google says this secret ends in ${answer.endsInDays} days. Then run this command again.`);
    }
    console.log("Next: npm run mailbox:check");
  } finally {
    server.close();
    server.closeAllConnections();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
