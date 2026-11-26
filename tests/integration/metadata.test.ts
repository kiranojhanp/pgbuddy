import type { Sql } from "postgres";
import { z } from "zod";
import { PgBuddyClient } from "../../src";
import { startPglite } from "../helpers/pglite";

const AccountSchema = z.object({
  id: z.number(),
  email: z.email(),
  password_hash: z.string(),
});

describe("schema-derived projection", () => {
  let sql: Sql<Record<string, unknown>>;
  let stop: () => Promise<void>;
  let db: PgBuddyClient;

  beforeAll(async () => {
    const started = await startPglite();
    sql = started.sql;
    stop = started.stop;
    db = new PgBuddyClient(sql);

    await sql`DROP TABLE IF EXISTS accounts;`;
    await sql`
      CREATE TABLE accounts (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        internal_note TEXT NULL
      );
    `;
  });

  afterAll(async () => {
    await sql`DROP TABLE IF EXISTS accounts;`;
    await stop();
  });

  beforeEach(async () => {
    await sql`TRUNCATE accounts;`;
  });

  const accounts = () => db.table("accounts", AccountSchema);

  test("ZodTable selects schema columns explicitly, not SELECT *", async () => {
    await accounts().create({
      id: 1,
      email: "ada@example.com",
      password_hash: "hash",
    });

    const rows = await accounts().findMany();

    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["email", "id", "password_hash"]);
    expect(rows[0]).not.toHaveProperty("internal_note");
  });

  test("select('*') expands to schema columns", async () => {
    await accounts().create({
      id: 2,
      email: "star@example.com",
      password_hash: "hash",
    });

    const rows = await accounts().select(["*"]).findMany();

    expect(rows[0]).not.toHaveProperty("internal_note");
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["email", "id", "password_hash"]);
  });

  test("omit removes columns from the schema projection", async () => {
    await accounts().create({
      id: 3,
      email: "omit@example.com",
      password_hash: "hash",
    });

    const rows = await accounts().omit(["password_hash"]).findMany();

    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["email", "id"]);
    expect(rows[0]).not.toHaveProperty("password_hash");
  });

  test("omit validates the omitted column", () => {
    expect(() => accounts().omit(["missing" as unknown as "password_hash"])).toThrow();
  });

  test("columns outside the schema are never selected", async () => {
    await accounts().create({
      id: 4,
      email: "unmapped@example.com",
      password_hash: "hash",
    });

    const rows = await accounts().select(["*"]).findMany();

    expect(rows[0]).not.toHaveProperty("internal_note");
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["email", "id", "password_hash"]);
  });

  test("orderByRaw orders by an expression", async () => {
    await accounts().createMany([
      { id: 7, email: "b@example.com", password_hash: "hash" },
      { id: 8, email: "a@example.com", password_hash: "hash" },
    ]);

    const rows = await accounts()
      .select(["id", "email"])
      .orderByRaw(sql`lower(email) ASC`)
      .findMany();

    expect(rows.map((row) => row.email)).toEqual(["a@example.com", "b@example.com"]);
  });
});
