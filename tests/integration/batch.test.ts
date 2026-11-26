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

  test("runs pending queries in one batch", async () => {
    const [one, two] = await db.batch([sql`select 1::int as value`, sql`select 2::int as value`]);

    expect(one).toEqual([{ value: 1 }]);
    expect(two).toEqual([{ value: 2 }]);
  });

  test("accepts pending queries from a transaction-like callback", async () => {
    const [one, two] = await db.batch((tx) => [
      tx.sql`select 1::int as value`,
      tx.sql`select 2::int as value`,
    ]);

    expect(one).toEqual([{ value: 1 }]);
    expect(two).toEqual([{ value: 2 }]);
  });

  test("rolls back the whole batch on failure", async () => {
    await expect(
      db.batch([
        sql`INSERT INTO users (id, email, status) VALUES (2, 'rollback@example.com', 'active')`,
        sql`select * from definitely_missing_table`,
      ])
    ).rejects.toThrow();

    expect(await users().count()).toBe(0);
  });

  test("supports empty batches and rejects invalid input", async () => {
    await expect(db.batch([])).resolves.toEqual([]);
    await expect(db.batch("nope" as never)).rejects.toThrow(TableError);
    await expect(db.batch((() => Promise.resolve([])) as never)).rejects.toThrow(TableError);
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
