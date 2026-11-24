// Creates a company with its first user, or adds a user to a company.
// Run from the repo root:
//
//   npm run company:create -- --company "Acme Trading" --email sara@acme.com
//   npm run company:add-user -- --company acme-trading --email omar@acme.com
//
// Add --password <password> to either one to set the password by hand.
//
// There is no public sign-up, so this is how companies and users are made.
// It uses plain prints, not the logger: its output is for the person running
// it, and a password must never go through the logger.

import { parseArgs } from "node:util";
import { createSecretClient, DatabaseError } from "@siftmerit/core";
import { loadEnv } from "../config/env.js";
import { TenantMemberRepository } from "../repositories/tenant-member.repository.js";
import { TenantRepository } from "../repositories/tenant.repository.js";
import { CompanyAdminService, type CreatedAccount } from "../services/company-admin.service.js";

const USAGE = `Usage:
  npm run company:create -- --company "<company name>" --email <first user's email> [--password <password>] [--slug <short name>] [--test]
  npm run company:add-user -- --company <short name> --email <user's email> [--password <password>]

  --password  sets the user's password by hand (8 to 72 characters). Without it, a
              strong random one is made and shown once. A password typed here
              stays in your terminal's history.
  --slug      sets the short name by hand. Without it, it is made from the company name.
  --test      marks a test company: its short name starts with "test-".`;

function printResult(title: string, created: CreatedAccount): void {
  console.log(`${title}\n`);
  console.log(`  Company:     ${created.tenant.name}`);
  console.log(`  Short name:  ${created.tenant.slug}`);
  console.log(`  User:        ${created.email} (${created.role})`);
  if (created.passwordGenerated) {
    console.log(`  Password:    ${created.password}\n`);
    console.log("The password is shown only this once. Pass it to the user in a safe way.");
  } else {
    // A password given by hand is not printed a second time.
    console.log("  Password:    the one you gave");
  }
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      company: { type: "string" },
      email: { type: "string" },
      password: { type: "string" },
      slug: { type: "string" },
      test: { type: "boolean", default: false },
    },
  });
  const command = positionals[0];
  if (!values.company || !values.email || (command !== "create" && command !== "add-user")) {
    console.error(USAGE);
    process.exit(1);
  }

  const env = loadEnv();
  const db = createSecretClient(env);
  const service = new CompanyAdminService(db, new TenantRepository(db), new TenantMemberRepository(db));

  try {
    if (command === "create") {
      const created = await service.createCompanyWithOwner({
        name: values.company,
        email: values.email,
        slug: values.slug,
        test: values.test,
        password: values.password,
      });
      printResult("Company created.", created);
    } else {
      const created = await service.addMember({
        slug: values.company,
        email: values.email,
        password: values.password,
      });
      printResult("User added.", created);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    // The database's own wording can repeat data, so it is shown in development only.
    if (error instanceof DatabaseError && env.NODE_ENV === "development") {
      console.error(`Database said: ${error.rawMessage}`);
    }
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  // Reached for a bad command line or a bad setting.
  console.error(error instanceof Error ? error.message : error);
  console.error(`\n${USAGE}`);
  process.exit(1);
});
