import type { Sql } from "postgres";
import { z } from "zod";
import { PgBuddyClient } from "../../src";
import { startPglite } from "../helpers/pglite";

const UserSchema = z.object({
  id: z.number().int(),
  email: z.string(),
});

describe("SELECT streaming and cancellation", () => {
  let sql: Sql<Record<string, unknown>>;
  let stop: () => Promise<void>;
  let db: PgBuddyClient;

  beforeAll(async () => {
    const started = await startPglite();
    sql = started.sql;
    stop = started.stop;
    db = new PgBuddyClient(sql);

    await sql`DROP TABLE IF EXISTS users;`;
    await sql`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL);`;
    await sql`INSERT INTO users (id, email) VALUES (1, 'a@example.com'), (2, 'b@example.com'), (3, 'c@example.com')`;
  });

  afterAll(async () => {
    await sql`DROP TABLE IF EXISTS users;`;
    await stop();
  });

  test("streams SELECT results in batches", async () => {
    const users = db.table("users", UserSchema);
    const batches: Array<Array<{ id: number; email: string }>> = [];

    for await (const batch of users.orderBy([{ column: "id", direction: "ASC" }]).stream(2)) {
      batches.push(batch);
    }

    expect(batches).toEqual([
      [
        { id: 1, email: "a@example.com" },
        { id: 2, email: "b@example.com" },
      ],
      [{ id: 3, email: "c@example.com" }],
    ]);
  });

  test("aborts a SELECT with an AbortSignal", async () => {
    const users = db.table("users", UserSchema);
    const controller = new AbortController();
    controller.abort();

    await expect(users.signal(controller.signal).findMany()).rejects.toThrow();
  });
});
