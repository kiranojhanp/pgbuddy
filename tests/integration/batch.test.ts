import type { Sql } from "postgres";
import { z } from "zod";
import { PgBuddyClient, TableError } from "../../src";
import { startPglite } from "../helpers/pglite";

const UserSchema = z.object({
  id: z.number().int(),
  email: z.string(),
  status: z.enum(["active", "inactive"]),
  last_login: z.date().nullable(),
});

describe("client batch", () => {
  let sql: Sql<Record<string, unknown>>;
  let stop: () => Promise<void>;
  let db: PgBuddyClient;

  beforeAll(async () => {
    const started = await startPglite();
    sql = started.sql;
    stop = started.stop;
    db = new PgBuddyClient(sql);

    await sql`DROP TABLE IF EXISTS users;`;
    await sql`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL,
        last_login TIMESTAMPTZ NULL
      );
    `;
  });

  afterAll(async () => {
    await sql`DROP TABLE IF EXISTS users;`;
    await stop();
  });

  beforeEach(async () => {
    await sql`TRUNCATE users;`;
  });

  const users = () => db.table("users", UserSchema);

  test("runs callback work in one transaction", async () => {
    const [created, found, count] = await db.batch(async (tx) => {
      const created = await tx.table("users", UserSchema).create({
        id: 1,
        email: "ada@example.com",
        status: "active",
        last_login: null,
      });
      const found = await tx
        .table("users", UserSchema)
        .where({ email: "ada@example.com" })
        .findFirst();
      const count = await tx.table("users", UserSchema).count();
      return [created, found, count] as const;
    });

    expect(created.email).toBe("ada@example.com");
    expect(found?.id).toBe(1);
    expect(count).toBe(1);
  });

  test("rolls back the whole callback batch on failure", async () => {
    await expect(
      db.batch(async (tx) => {
        await tx.table("users", UserSchema).create({
          id: 2,
          email: "rollback@example.com",
          status: "active",
          last_login: null,
        });
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(await users().count()).toBe(0);
  });

  test("supports a true pending-query batch and empty batches", async () => {
    const [one, two] = await db.batch([sql`select 1::int as value`, sql`select 2::int as value`]);

    expect(one).toEqual([{ value: 1 }]);
    expect(two).toEqual([{ value: 2 }]);
    await expect(db.batch([])).resolves.toEqual([]);
  });

  test("rejects invalid batch input", async () => {
    await expect(db.batch("nope" as never)).rejects.toThrow(TableError);
  });

  test("batchSQL sends raw statements as a batch", async () => {
    const [one, two] = await db.batchSQL([
      { text: "select 1::int as value" },
      { text: "select $1::int as value", parameters: [2] },
    ]);

    expect(one).toEqual([{ value: 1 }]);
    expect(two).toEqual([{ value: 2 }]);
  });
});
