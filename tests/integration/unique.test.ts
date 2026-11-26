import type { Sql } from "postgres";
import { z } from "zod";
import { Errors, PgBuddyClient, TableError } from "../../src";
import { startPglite } from "../helpers/pglite";

interface Member {
  id: number;
  tenant_id: string;
  slug: string;
  email: string;
  status: "active" | "inactive";
}

const MemberSchema = z.object({
  id: z.number(),
  tenant_id: z.string(),
  slug: z.string(),
  email: z.email(),
  status: z.enum(["active", "inactive"]),
});

describe("unique metadata", () => {
  let sql: Sql<Record<string, unknown>>;
  let stop: () => Promise<void>;
  let db: PgBuddyClient;

  beforeAll(async () => {
    const started = await startPglite();
    sql = started.sql;
    stop = started.stop;
    db = new PgBuddyClient(sql);

    await sql`DROP TABLE IF EXISTS members;`;
    await sql`
      CREATE TABLE members (
        id INTEGER PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        email TEXT NOT NULL,
        status TEXT NOT NULL,
        UNIQUE (tenant_id, slug),
        UNIQUE (email)
      );
    `;
  });

  afterAll(async () => {
    await sql`DROP TABLE IF EXISTS members;`;
    await stop();
  });

  beforeEach(async () => {
    await sql`TRUNCATE members;`;
  });

  const members = () => db.table<Member>("members", { unique: [["email"], ["tenant_id", "slug"]] });

  test("whereUnique matches a configured unique key", async () => {
    await members().create({
      id: 1,
      tenant_id: "acme",
      slug: "ada",
      email: "ada@example.com",
      status: "active",
    });

    const byEmail = await members().whereUnique({ email: "ada@example.com" }).findUnique();
    expect(byEmail?.id).toBe(1);

    const byPair = await members().whereUnique({ slug: "ada", tenant_id: "acme" }).findUnique();
    expect(byPair?.id).toBe(1);
  });

  test("whereUnique rejects non-unique column sets", () => {
    expect(() => members().whereUnique({ status: "active" })).toThrow(
      Errors.WHERE.INVALID_UNIQUE("status")
    );

    expect(() => members().whereUnique({ email: "a@example.com", status: "active" })).toThrow(
      Errors.WHERE.INVALID_UNIQUE("email, status")
    );
  });

  test("whereUnique requires unique metadata", () => {
    expect(() => db.table<Member>("members").whereUnique({ email: "a@example.com" })).toThrow(
      Errors.WHERE.INVALID_UNIQUE("email")
    );
  });

  test("invalid unique option is rejected", () => {
    expect(() => db.table<Member>("members", { unique: [[]] })).toThrow(TableError);
  });

  test("ZodTable validates unique columns against the schema", () => {
    expect(() => db.table("members", MemberSchema, { unique: [["missing"]] })).toThrow(TableError);
  });

  test("ZodTable whereUnique validates fields", async () => {
    const zmembers = db.table("members", MemberSchema, { unique: [["email"]] });
    await zmembers.create({
      id: 2,
      tenant_id: "acme",
      slug: "grace",
      email: "grace@example.com",
      status: "active",
    });

    const row = await zmembers.whereUnique({ email: "grace@example.com" }).findUnique();
    expect(row?.id).toBe(2);
  });
});
