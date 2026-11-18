import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ConflictError, NotFoundError, ValidationError, toDatabaseError } from "../lib/errors.js";
import { SLUG_PATTERN, slugFromName } from "../lib/slug.js";
import type { TenantMemberRepository, TenantRole } from "../repositories/tenant-member.repository.js";
import type { TenantRepository, TenantRow } from "../repositories/tenant.repository.js";

const TEST_PREFIX = "test-";
const MAX_NAME_LENGTH = 100;
// For a password given by hand. Supabase's sign-in service cannot store one
// longer than 72 characters.
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;

/** What the caller gets back. The password exists only here; it is not stored by us. */
export type CreatedAccount = {
  tenant: TenantRow;
  userId: string;
  email: string;
  password: string;
  /** True when we made the password, false when the caller gave it. */
  passwordGenerated: boolean;
  role: TenantRole;
};

/**
 * Creates companies and their users. There is no public sign-up, so this is
 * the only way a company or a user comes into being. It is called by the
 * `company` script today.
 *
 * A company needs three things: a row in `tenants`, a sign-in account in
 * Supabase, and a row in `tenant_members` that joins the two. They cannot be
 * saved in one step, because the sign-in account is made by Supabase's
 * sign-in service, not by our database. So when a later step fails, the
 * earlier ones are removed again.
 */
export class CompanyAdminService {
  constructor(
    private readonly db: SupabaseClient,
    private readonly tenants: TenantRepository,
    private readonly members: TenantMemberRepository,
  ) {}

  /** Creates a company and its first user, who becomes the owner. */
  async createCompanyWithOwner(input: {
    name: string;
    email: string;
    /** A short name chosen by hand. Made from the name when left out. */
    slug?: string;
    /** Marks a test company: its short name starts with "test-". */
    test?: boolean;
    /** The first user's password. A strong random one is made when left out. */
    password?: string;
  }): Promise<CreatedAccount> {
    const name = input.name.trim();
    if (name === "" || name.length > MAX_NAME_LENGTH) {
      throw new ValidationError(`The company name must be 1 to ${MAX_NAME_LENGTH} characters long.`);
    }
    const email = parseEmail(input.email);
    const slug = chooseSlug(name, input.slug, input.test === true);
    checkPassword(input.password);

    if (await this.tenants.findBySlug(slug)) {
      throw new ConflictError(`A company with the short name "${slug}" already exists.`, "slug_taken");
    }

    const tenant = await this.tenants.insert({ name, slug });
    try {
      const account = await this.createAccount(tenant.id, email, "owner", input.password);
      return { tenant, ...account };
    } catch (error) {
      await undo(error, `the company "${slug}"`, () => this.tenants.deleteById(tenant.id));
      throw error;
    }
  }

  /** Adds one more user to an existing company, as a member. */
  async addMember(input: {
    slug: string;
    email: string;
    /** The user's password. A strong random one is made when left out. */
    password?: string;
  }): Promise<CreatedAccount> {
    const email = parseEmail(input.email);
    const slug = input.slug.trim();
    checkPassword(input.password);

    const tenant = await this.tenants.findBySlug(slug);
    if (!tenant) {
      throw new NotFoundError(`There is no company with the short name "${slug}".`, "tenant_not_found");
    }

    const account = await this.createAccount(tenant.id, email, "member", input.password);
    return { tenant, ...account };
  }

  /** Makes the sign-in account, then the row that joins it to the company. */
  private async createAccount(
    tenantId: string,
    email: string,
    role: TenantRole,
    givenPassword: string | undefined,
  ) {
    // The caller's password, or a strong random one. Either way it is handed
    // back once and never saved by us.
    const passwordGenerated = givenPassword === undefined;
    const password = givenPassword ?? randomBytes(18).toString("base64url");

    const { data, error } = await this.db.auth.admin.createUser({
      email,
      password,
      // We create accounts ourselves, so no "confirm your email" message is sent.
      email_confirm: true,
    });
    if (error) {
      if (error.code === "email_exists") {
        throw new ConflictError("A user with this email already exists.", "email_exists");
      }
      if (error.code === "weak_password") {
        throw new ValidationError("Supabase refused the password as too weak. Give a stronger one.");
      }
      throw toDatabaseError("sign-in account create", error);
    }

    const userId = data.user.id;
    try {
      await this.members.insert({ tenantId, userId, role });
    } catch (insertError) {
      await undo(insertError, "the new sign-in account", async () => {
        const { error: deleteError } = await this.db.auth.admin.deleteUser(userId);
        if (deleteError) throw toDatabaseError("sign-in account delete", deleteError);
      });
      throw insertError;
    }

    return { userId, email, password, passwordGenerated, role };
  }
}

function parseEmail(value: string): string {
  const parsed = z.email().safeParse(value.trim().toLowerCase());
  if (!parsed.success) throw new ValidationError("That is not a valid email address.");
  return parsed.data;
}

function checkPassword(password: string | undefined): void {
  if (password === undefined) return;
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new ValidationError(
      `The password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters long.`,
    );
  }
}

function chooseSlug(name: string, given: string | undefined, test: boolean): string {
  const prefix = test ? TEST_PREFIX : "";
  const byHand = given?.trim();
  const slug = byHand
    ? byHand.startsWith(prefix)
      ? byHand
      : `${prefix}${byHand}`
    : slugFromName(name, prefix);

  if (slug === "") {
    throw new ValidationError("No short name could be made from the company name. Give one yourself (--slug).");
  }
  if (!SLUG_PATTERN.test(slug)) {
    throw new ValidationError(
      `The short name "${slug}" is not allowed. Use lower-case letters, digits and dashes, 1 to 63 long.`,
    );
  }
  return slug;
}

/**
 * Removes what an earlier step made, after a later step failed. If the
 * removal fails too, the caller is told what to remove by hand.
 */
async function undo(original: unknown, what: string, step: () => Promise<void>): Promise<void> {
  try {
    await step();
  } catch {
    const reason = original instanceof Error ? original.message : "The action failed.";
    throw new Error(`${reason} The clean-up failed too: remove ${what} by hand in Supabase.`, {
      cause: original,
    });
  }
}
