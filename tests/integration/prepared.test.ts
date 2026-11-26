import type { Sql } from "postgres";
import { z } from "zod";
import { PgBuddyClient, TableError } from "../../src";
import { startPglite } from "../helpers/pglite";

describe("prepared statements", () => {
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
    await sql`
      INSERT INTO users (id, email)
      VALUES (1, 'ada@example.com'), (2, 'grace@example.com')
    `;
  });

  afterAll(async () => {
    await sql`DROP TABLE IF EXISTS users;`;
    await stop();
  });

  test("reuses a prepared statement with bound parameters", async () => {
    const findUser = db.prepare<{ id: number; email: string }>(
      "select id, email from users where id = $1"
    );

    const first = await findUser([1]);
    const second = await findUser([2]);

    expect(first).toEqual([{ id: 1, email: "ada@example.com" }]);
    expect(second).toEqual([{ id: 2, email: "grace@example.com" }]);
  });

  test("rejects empty SQL", () => {
    expect(() => db.prepare(" ")).toThrow(TableError);
    expect(() => db.prepare("")).toThrow(TableError);
  });

  test("prepares a SELECT builder with fixed parameters", async () => {
    const UserSchema = z.object({
      id: z.number().int(),
      email: z.string(),
    });

    const users = db.table("users", UserSchema);
    const execute = users.where({ id: 1 }).prepare();

    const first = await execute();
    const second = await execute();

    expect(first).toEqual([{ id: 1, email: "ada@example.com" }]);
    expect(second).toEqual(first);
  });
});
