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

  test("runs queries in order and returns a tuple", async () => {
    const [created, found, count] = await db.batch([
      (tx) =>
        tx.table("users", UserSchema).create({
          id: 1,
          email: "ada@example.com",
          status: "active",
          last_login: null,
        }),
      (tx) => tx.table("users", UserSchema).where({ email: "ada@example.com" }).findFirst(),
      (tx) => tx.table("users", UserSchema).count(),
    ]);

    expect(created.email).toBe("ada@example.com");
    expect(found?.id).toBe(1);
    expect(count).toBe(1);
  });

  test("rolls back the whole batch on failure", async () => {
    await expect(
      db.batch([
        (tx) =>
          tx.table("users", UserSchema).create({
            id: 2,
            email: "rollback@example.com",
            status: "active",
            last_login: null,
          }),
        () => Promise.reject(new Error("boom")),
      ])
    ).rejects.toThrow("boom");

    expect(await users().count()).toBe(0);
  });

  test("validates the batch and supports an empty batch", async () => {
    await expect(db.batch([null as unknown as () => Promise<unknown>])).rejects.toThrow(TableError);

    await expect(db.batch([])).resolves.toEqual([]);
  });
});
