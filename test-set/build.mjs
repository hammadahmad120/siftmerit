// Makes the written CVs of the test set and their answer cards.
//
//   node test-set/build.mjs            every card and every CV file
//   node test-set/build.mjs ai-w12     every card, and only the CV files whose
//                                      ID starts with "ai-w12" ("ux-" would be
//                                      all the designer files)
//
// It reads every file in `source/` (one file per job, a list of made-up
// people), and for each person writes:
//
//   files/<id>.pdf or .docx   the CV, ready to attach to an email
//   cards/<id>.json           the answer card: the right result for that CV
//
// A remade PDF or Word file holds a new date inside, so git sees it as changed
// even when its text is the same. That is what the ID words are for: remake
// only the CV files whose fact card really changed. The cards are plain text
// and are always remade.
//
// The person's entry in `source/` is the fact card. The CV and the answer
// card are both made from it, so the card is right by design: a proof line on
// a card is always a line that the CV really holds.
//
// This is a development tool and not part of the product. It needs Google
// Chrome (for PDF) and pandoc (for Word) on the machine. The made files are
// committed, so nobody needs those programs just to use the test set.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const AS_OF = "2026-11";

const escapeHtml = (text) =>
  String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The words of a text with single spaces between them, for comparing texts. */
const squeeze = (text) => text.split(/\s+/).filter(Boolean).join(" ");

// ---------------------------------------------------------------------------
// From a fact card to the pieces of a CV
// ---------------------------------------------------------------------------

/** The heading of one job: "Senior AI Engineer, Northwind Labs". */
const roleHeading = (role) => `${role.title}, ${role.company}`;

/**
 * Turns a short pointer on a tick into the line of the CV it points at.
 *
 *   r0      the heading of the first job        r0b2   its third bullet
 *   sum     the summary                         loc    the location
 *   sk:AI   the skills line named "AI"          edu0   the first education line
 */
function proofText(person, pointer) {
  if (pointer === null || pointer === undefined) return null;
  let found;
  const bullet = /^r(\d+)b(\d+)$/.exec(pointer);
  const role = /^r(\d+)$/.exec(pointer);
  const education = /^edu(\d+)$/.exec(pointer);
  if (bullet) found = person.roles[bullet[1]]?.bullets[bullet[2]];
  else if (role) found = person.roles[role[1]] && roleHeading(person.roles[role[1]]);
  else if (education) found = person.education[education[1]];
  else if (pointer === "sum") found = person.summary;
  else if (pointer === "loc") found = person.location;
  else if (pointer.startsWith("sk:")) {
    const key = pointer.slice(3);
    if (person.skills[key]) found = `${key}: ${person.skills[key]}`;
  }
  if (!found) throw new Error(`${person.id}: the pointer "${pointer}" points at nothing`);
  return found;
}

/** Every line of the CV as plain text, to check that the proof lines are in it. */
function plainText(person) {
  return [
    person.name,
    person.headline,
    person.location,
    person.summary,
    ...person.roles.flatMap((role) => [roleHeading(role), role.place, role.dates, ...role.bullets]),
    ...Object.entries(person.skills).map(([key, value]) => `${key}: ${value}`),
    ...person.education,
    ...(person.extra ?? []).flatMap((section) => [section.title, ...section.lines]),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// The CV as a web page. Chrome prints it to PDF; pandoc turns it into Word.
// Three looks, so the written CVs do not all have one layout.
// ---------------------------------------------------------------------------

const LOOKS = {
  // One column, roomy, with lined section headings.
  classic: `
    body { font: 11.5pt/1.55 Georgia, serif; color: #1a1a1a; margin: 0; }
    h1 { font-size: 22pt; margin: 0; }
    .headline { font-size: 12.5pt; color: #444; margin: 2pt 0 0; }
    .contact { color: #444; margin: 6pt 0 0; }
    h2 { font: bold 11pt Arial, sans-serif; letter-spacing: 1pt; text-transform: uppercase;
         border-bottom: 1pt solid #888; margin: 18pt 0 8pt; padding-bottom: 3pt; }
    .role { margin-bottom: 12pt; }
    .role-top { display: flex; justify-content: space-between; gap: 12pt; }
    .role-name { font-weight: bold; }
    .role-when { color: #444; white-space: nowrap; }
    ul { margin: 4pt 0 0; padding-left: 16pt; } li { margin-bottom: 3pt; }
    p { margin: 0 0 5pt; }`,
  // Two columns: contact, skills and education on the left, the jobs on the right.
  sidebar: `
    body { font: 10pt/1.45 Arial, sans-serif; color: #222; margin: 0; }
    .page { display: flex; gap: 18pt; }
    .side { width: 31%; background: #eef1f5; padding: 14pt; box-sizing: border-box; }
    .main { flex: 1; padding-top: 14pt; }
    h1 { font-size: 19pt; margin: 0; color: #1f3a5f; }
    .headline { font-size: 11pt; margin: 3pt 0 10pt; color: #1f3a5f; }
    h2 { font-size: 10.5pt; color: #1f3a5f; margin: 14pt 0 6pt; text-transform: uppercase; }
    .role { margin-bottom: 10pt; } .role-name { font-weight: bold; } .role-when { color: #555; }
    ul { margin: 3pt 0 0; padding-left: 13pt; } li { margin-bottom: 2pt; }
    p { margin: 0 0 4pt; }`,
  // Small and dense, everything on as little paper as possible.
  compact: `
    body { font: 9.5pt/1.35 Verdana, sans-serif; color: #000; margin: 0; }
    h1 { font-size: 15pt; margin: 0; } .headline { margin: 0; }
    .contact { margin: 2pt 0 0; }
    h2 { font-size: 9.5pt; margin: 10pt 0 3pt; background: #ddd; padding: 2pt 4pt; }
    .role { margin-bottom: 6pt; } .role-name { font-weight: bold; }
    ul { margin: 2pt 0 0; padding-left: 12pt; } p { margin: 0 0 3pt; }`,
};

// Larger type and more air, for a person marked `"roomy": true`. Long real CVs
// are often set like this, which is how they reach four pages.
const ROOMY = "body { font-size: 12.5pt; line-height: 1.75; } h2 { margin-top: 24pt; }";

const section = (title, body) => (body ? `<h2>${escapeHtml(title)}</h2>${body}` : "");

function partsOf(person) {
  const contact = [person.location, person.phone, person.email, ...person.links].filter(Boolean);
  const roles = person.roles
    .map(
      (role) => `<div class="role">
        <div class="role-top"><span class="role-name">${escapeHtml(roleHeading(role))}</span>
        <span class="role-when">${escapeHtml(`${role.place} | ${role.dates}`)}</span></div>
        <ul>${role.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul></div>`,
    )
    .join("");
  const skills = Object.entries(person.skills)
    .map(([key, value]) => `<p>${escapeHtml(`${key}: ${value}`)}</p>`)
    .join("");
  const education = person.education.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  const extra = (person.extra ?? [])
    .map((s) => section(s.title, `<ul>${s.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`))
    .join("");
  const summary = person.summary ? `<p>${escapeHtml(person.summary)}</p>` : "";
  return { contact, roles, skills, education, extra, summary };
}

function cvPage(person) {
  const p = partsOf(person);
  const name = `<h1>${escapeHtml(person.name)}</h1>`;
  const headline = person.headline ? `<p class="headline">${escapeHtml(person.headline)}</p>` : "";

  const body =
    person.layout === "sidebar"
      ? `<div class="page"><div class="side">${name}${headline}
           ${p.contact.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
           ${section("Skills", p.skills)}${section("Education", p.education)}</div>
         <div class="main">${section("Profile", p.summary)}${section("Experience", p.roles)}${p.extra}</div></div>`
      : `${name}${headline}<p class="contact">${escapeHtml(p.contact.join("  |  "))}</p>
         ${section("Summary", p.summary)}${section("Experience", p.roles)}
         ${section("Skills", p.skills)}${section("Education", p.education)}${p.extra}`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(person.name)}</title>
    <style>@page { size: A4; margin: 18mm; } ${LOOKS[person.layout]} ${person.roomy ? ROOMY : ""}</style></head><body>${body}</body></html>`;
}

// ---------------------------------------------------------------------------
// Writing the files
// ---------------------------------------------------------------------------

function makeFile(person, workFolder) {
  const page = path.join(workFolder, `${person.id}.html`);
  const target = path.join(root, "files", `${person.id}.${person.format}`);
  fs.writeFileSync(page, cvPage(person));

  if (person.format === "pdf") {
    execFileSync(
      "google-chrome",
      ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${target}`, `file://${page}`],
      { stdio: "ignore" },
    );
  } else {
    execFileSync("pandoc", ["-f", "html", "-t", "docx", "-o", target, page], { stdio: "ignore" });
  }
  return target;
}

function makeCard(person, job) {
  const text = squeeze(plainText(person));
  const ticks = {};

  for (const requirement of job.requirements) {
    const tick = person.ticks[requirement.id];
    if (!tick) throw new Error(`${person.id}: no tick for ${requirement.id}`);
    const [result, pointer, alsoAccept, note] = tick;
    const proof = proofText(person, pointer);
    if (proof && !text.includes(squeeze(proof))) {
      throw new Error(`${person.id}: the proof of ${requirement.id} is not in the CV`);
    }
    ticks[requirement.id] = {
      result,
      proof,
      ...(alsoAccept ? { alsoAccept } : {}),
      ...(note ? { note } : {}),
    };
  }

  return {
    id: person.id,
    job: job.id,
    file: `${person.id}.${person.format}`,
    source: "written",
    group: person.group,
    email: { subject: person.subject, senderName: person.name },
    asOf: AS_OF,
    expected: {
      isCv: true,
      skipReason: null,
      facts: {
        name: person.name,
        city: person.city,
        country: person.country,
        totalYears: person.facts.totalYears,
        currentRole: person.facts.currentRole,
        education: person.education[0] ?? null,
        links: person.links,
      },
      ticks,
    },
    why: person.why,
  };
}

// The ID words given on the command line. With none, every CV file is remade.
const idStarts = process.argv.slice(2);
const fileWanted = (id) => idStarts.length === 0 || idStarts.some((start) => id.startsWith(start));
let filesMade = 0;

const workFolder = fs.mkdtempSync(path.join(os.tmpdir(), "siftmerit-test-set-"));
fs.mkdirSync(path.join(root, "files"), { recursive: true });
fs.mkdirSync(path.join(root, "cards"), { recursive: true });

for (const sourceFile of fs.readdirSync(path.join(root, "source")).filter((f) => f.endsWith(".json"))) {
  const jobId = path.basename(sourceFile, ".json");
  const job = JSON.parse(fs.readFileSync(path.join(root, "jobs", `${jobId}.json`), "utf8"));
  const people = JSON.parse(fs.readFileSync(path.join(root, "source", sourceFile), "utf8"));

  for (const person of people) {
    // The card is made first: it stops the build when a proof line is wrong.
    const card = makeCard(person, job);
    fs.writeFileSync(path.join(root, "cards", `${person.id}.json`), `${JSON.stringify(card, null, 2)}\n`);
    const made = fileWanted(person.id);
    if (made) {
      makeFile(person, workFolder);
      filesMade += 1;
    }
    console.log(
      `${person.id}  ${person.format.padEnd(4)}  ${person.layout.padEnd(8)}  ${person.group.padEnd(16)}  ${made ? "card and file" : "card only"}`,
    );
  }
}

fs.rmSync(workFolder, { recursive: true, force: true });

// A mistyped ID word would otherwise look like a run that worked.
if (idStarts.length > 0 && filesMade === 0) {
  console.error(`No CV file was made: no ID starts with ${idStarts.map((s) => `"${s}"`).join(" or ")}.`);
  process.exitCode = 1;
}
