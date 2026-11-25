// Sends the emails of the test set to the test mailbox.
// Run from the repo root:
//
//   npm run test-set:send                     prints the list and sends nothing
//   npm run test-set:send -- --send           sends every email not sent yet
//   npm run test-set:send -- --send ai-w01    sends only the IDs that start with "ai-w01"
//
// A development tool for our own machine only, and not part of the product.
// The product may only read mail, so the test emails are sent by this script:
// it signs in to Gmail's sending service with an "app password" of one of the
// user's own Gmail accounts.
//
// Each email is made from one answer card: the card holds the subject, the
// sender's name and the file to attach. The written CVs and the junk cases are
// in `test-set/`, the real CVs in `test-cvs/` (only on this machine).
//
// It uses plain prints, not the logger: showing subjects and senders is its
// purpose, and those must never go through the logger.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
import { z } from "zod";
import { loadSendSettings } from "./mailbox-settings.js";

// This file sits in services/worker/src/scripts, four folders below the repo root.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const testSet = path.join(repoRoot, "test-set");
const realCvs = path.join(repoRoot, "test-cvs");

// Which emails were sent, so a second run does not send them again. Git
// ignores this file: it describes this machine's mailbox, not the project.
const SENT_RECORD = path.join(testSet, "sent.json");

// The wait between two emails. It keeps the arrival times apart, so "oldest
// first" in the mailbox is the order of sending, and it keeps Gmail calm.
const PAUSE_MS = 4000;

// Pairs that must arrive in this order, whatever the mixing below does:
// the two equal CVs of each job, the duplicate after its original, and the
// second application after the first.
const BEFORE_AFTER: Array<[string, string]> = [
  ["ai-w13", "ai-w14"],
  ["ux-w13", "ux-w14"],
  ["ai-w06", "jk-07"],
  ["jk-08a", "jk-08b"],
];

/** The parts of an answer card this script reads. A card holds much more. */
const cardSchema = z.object({
  id: z.string().min(1),
  job: z.string().min(1),
  file: z.string().min(1).nullable(),
  // "hand" marks an email the user sends from the second Gmail account.
  sendBy: z.literal("hand").optional(),
  email: z.object({
    subject: z.string().min(1),
    senderName: z.string().min(1),
    body: z.string().min(1).optional(),
    headers: z.record(z.string(), z.string()).optional(),
  }),
});

interface TestEmail {
  id: string;
  subject: string;
  senderName: string;
  body: string;
  headers: Record<string, string>;
  /** The full path of the file to attach, or null for an email with no file. */
  attachment: string | null;
  byHand: boolean;
}

type SentRecord = Record<string, { sentAt: string; messageId: string }>;

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** Every answer card of one folder, as an email. `filesFolder` is where its attachments are. */
function emailsOf(cardsFolder: string, filesFolder: string, titles: Map<string, string>): TestEmail[] {
  if (!fs.existsSync(cardsFolder)) return [];
  return fs
    .readdirSync(cardsFolder)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const parsed = cardSchema.safeParse(readJson(path.join(cardsFolder, name)));
      if (!parsed.success) {
        throw new Error(`The card ${name} is not in the expected form: ${parsed.error.issues[0]?.message ?? "unknown"}`);
      }
      const card = parsed.data;
      const title = titles.get(card.job) ?? "open";
      return {
        id: card.id,
        subject: card.email.subject,
        senderName: card.email.senderName,
        // A CV card has no email text of its own, so it gets a plain one.
        body:
          card.email.body ??
          `Dear Hiring Team,\n\nPlease find my CV attached for the ${title} position.\n\nRegards,\n${card.email.senderName}`,
        headers: card.email.headers ?? {},
        attachment: card.file === null ? null : path.join(filesFolder, card.file),
        byHand: card.sendBy === "hand",
      };
    });
}

/**
 * Every email of the test set, in the order of sending.
 *
 * The order is mixed, and the same on every run: the IDs are sorted by a
 * fingerprint of the ID. Sending "ai-w01, ai-w02, ..." would put every strong
 * CV first, and the product reads oldest first in rounds, so one round would
 * hold all the good candidates and the next one none.
 */
function allEmails(): TestEmail[] {
  const titles = new Map<string, string>();
  for (const name of fs.readdirSync(path.join(testSet, "jobs")).filter((n) => n.endsWith(".json"))) {
    const job = z.object({ id: z.string(), title: z.string() }).parse(readJson(path.join(testSet, "jobs", name)));
    titles.set(job.id, job.title);
  }

  const emails = [
    ...emailsOf(path.join(testSet, "cards"), path.join(testSet, "files"), titles),
    ...emailsOf(path.join(realCvs, "cards"), realCvs, titles),
  ];

  const fingerprint = (id: string) => createHash("sha1").update(id).digest("hex");
  emails.sort((a, b) => fingerprint(a.id).localeCompare(fingerprint(b.id)));

  for (const [first, second] of BEFORE_AFTER) {
    const firstAt = emails.findIndex((email) => email.id === first);
    const secondAt = emails.findIndex((email) => email.id === second);
    if (firstAt === -1 || secondAt === -1 || firstAt < secondAt) continue;
    const moved = emails[firstAt]!;
    emails[firstAt] = emails[secondAt]!;
    emails[secondAt] = moved;
  }
  return emails;
}

function readSentRecord(): SentRecord {
  if (!fs.existsSync(SENT_RECORD)) return {};
  return z
    .record(z.string(), z.object({ sentAt: z.string(), messageId: z.string() }))
    .parse(readJson(SENT_RECORD));
}

function fileName(email: TestEmail): string {
  return email.attachment === null ? "(no file)" : path.basename(email.attachment);
}

function printList(emails: TestEmail[], sent: SentRecord, wanted: (id: string) => boolean): void {
  emails.forEach((email, index) => {
    const record = sent[email.id];
    let state = "to send";
    if (email.byHand) state = "by hand";
    else if (record) state = `sent ${record.sentAt.slice(0, 16).replace("T", " ")}`;
    else if (!wanted(email.id)) state = "not picked";
    console.log(
      `${String(index + 1).padStart(2)}  ${email.id.padEnd(7)} ${state.padEnd(21)} ${email.senderName} | ${email.subject} | ${fileName(email)}`,
    );
  });
}

function printByHand(emails: TestEmail[]): void {
  const byHand = emails.filter((email) => email.byHand);
  if (byHand.length === 0) return;
  console.log("\nTo send by hand, from the second Gmail account, to the test mailbox:");
  for (const email of byHand) {
    console.log(`\n  ${email.id}`);
    console.log(`  Subject: ${email.subject}`);
    console.log(`  Attach:  ${email.attachment ?? "(no file)"}`);
    console.log(`  Text:    ${email.body.replace(/\n+/g, " ")}`);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const words = process.argv.slice(2);
  const unknown = words.find((word) => word.startsWith("--") && word !== "--send");
  if (unknown) throw new Error(`"${unknown}" is not known. The only switch is --send.`);
  const reallySend = words.includes("--send");
  const idStarts = words.filter((word) => !word.startsWith("--"));
  const wanted = (id: string) => idStarts.length === 0 || idStarts.some((start) => id.startsWith(start));

  const emails = allEmails();
  const sent = readSentRecord();
  if (idStarts.length > 0 && !emails.some((email) => wanted(email.id))) {
    throw new Error(`Nothing matched: no ID starts with ${idStarts.map((s) => `"${s}"`).join(" or ")}.`);
  }
  const due = emails.filter((email) => !email.byHand && !sent[email.id] && wanted(email.id));

  // Checked before anything is sent: a missing file must not stop the run half way.
  const missing = due.filter((email) => email.attachment !== null && !fs.existsSync(email.attachment));
  if (missing.length > 0) {
    throw new Error(`These files are missing: ${missing.map((email) => `${email.id} (${email.attachment})`).join(", ")}`);
  }

  if (!reallySend) {
    printList(emails, sent, wanted);
    printByHand(emails);
    const alreadySent = emails.filter((email) => sent[email.id]).length;
    console.log(
      `\n${emails.length} emails in the test set: ${alreadySent} sent, ${due.length} to send now, ${emails.filter((e) => e.byHand).length} by hand.`,
    );
    console.log("Nothing was sent. To send: npm run test-set:send -- --send");
    return;
  }

  if (due.length === 0) {
    console.log("Nothing to send: every picked email is already in the sent record (test-set/sent.json).");
    printByHand(emails);
    return;
  }

  const settings = loadSendSettings();
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: settings.TEST_SET_SENDER_EMAIL, pass: settings.TEST_SET_SENDER_APP_PASSWORD },
  });
  try {
    await transporter.verify();
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "EAUTH") {
      throw new Error(
        "Gmail refused the sign-in. TEST_SET_SENDER_EMAIL must be the Gmail address and TEST_SET_SENDER_APP_PASSWORD an app password of that account (myaccount.google.com/apppasswords), not its normal password.",
      );
    }
    throw new Error(`Could not reach Gmail's sending service (${code ?? "unknown error"}). Check the internet connection.`);
  }

  console.log(`Sending ${due.length} emails to ${settings.TEST_SET_MAILBOX_EMAIL}, one every ${PAUSE_MS / 1000} seconds.\n`);
  let count = 0;
  for (const email of due) {
    const info = await transporter.sendMail({
      // Gmail always sends with the signed-in address; only the name differs per email.
      from: { name: email.senderName, address: settings.TEST_SET_SENDER_EMAIL },
      to: settings.TEST_SET_MAILBOX_EMAIL,
      subject: email.subject,
      text: email.body,
      headers: email.headers,
      attachments: email.attachment === null ? [] : [{ filename: path.basename(email.attachment), path: email.attachment }],
    });
    // Saved after every email, so a run that stops half way can go on where it stopped.
    sent[email.id] = { sentAt: new Date().toISOString(), messageId: info.messageId };
    fs.writeFileSync(SENT_RECORD, `${JSON.stringify(sent, null, 2)}\n`);
    count += 1;
    console.log(`${String(count).padStart(2)}/${due.length}  ${email.id.padEnd(7)} ${email.senderName} | ${email.subject} | ${fileName(email)}`);
    if (count < due.length) await sleep(PAUSE_MS);
  }
  transporter.close();

  console.log(`\nSent ${count} emails. The record is in test-set/sent.json.`);
  printByHand(emails);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
