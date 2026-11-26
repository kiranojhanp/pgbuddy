import type { Sql } from "postgres";
import { z } from "zod";
import { Errors, PgBuddyClient } from "../../src";
import { startPglite } from "../helpers/pglite";

interface Account {
  id: number;
  email: string;
  password_hash: string;
  internal_note: string | null;
}

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

  test("plain Table still uses SELECT *", async () => {
    await accounts().create({
      id: 4,
      email: "plain@example.com",
      password_hash: "hash",
    });

    const rows = await db.table<Account>("accounts").findMany();

    expect(rows[0]).toHaveProperty("internal_note");
  });

  test("columns option gives a plain Table an explicit projection", async () => {
    await accounts().create({
      id: 5,
      email: "columns@example.com",
      password_hash: "hash",
    });

    const rows = await db
      .table<Account>("accounts", { columns: ["id", "email", "password_hash"] })
      .findMany();

    expect(rows[0]).not.toHaveProperty("internal_note");
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["email", "id", "password_hash"]);
  });

  test("plain Table omit removes columns from an explicit projection", async () => {
    await accounts().create({
      id: 6,
      email: "omit-plain@example.com",
      password_hash: "hash",
    });

    const rows = await db
      .table<Account>("accounts", { columns: ["id", "email", "password_hash"] })
      .omit(["password_hash"])
      .findMany();

    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["email", "id"]);
  });

  test("plain Table omit requires explicit columns", () => {
    expect(() => db.table<Account>("accounts").omit(["password_hash"])).toThrow(
      Errors.SELECT.CANNOT_OMIT_STAR
    );
  });

  test("orderByRaw orders by an expression", async () => {
    await accounts().createMany([
      { id: 7, email: "b@example.com", password_hash: "hash" },
      { id: 8, email: "a@example.com", password_hash: "hash" },
    ]);

    const rows = await db
      .table<Account>("accounts", { columns: ["id", "email"] })
      .orderByRaw(sql`lower(email) ASC`)
      .findMany();

    expect(rows.map((row) => row.email)).toEqual(["a@example.com", "b@example.com"]);
  });
});
