import type { Sql } from "postgres";
import { z } from "zod";
import { PgBuddyClient } from "../../src";
import { startPglite } from "../helpers/pglite";

const UserSchema = z.object({
  id: z.number().int(),
  email: z.string(),
  status: z.enum(["active", "inactive"]),
});

describe("findManyAndCount", () => {
  let sql: Sql<Record<string, unknown>>;
  let stop: () => Promise<void>;
  let db: PgBuddyClient;

  beforeAll(async () => {
    const started = await startPglite();
    sql = started.sql;
    stop = started.stop;
    db = new PgBuddyClient(sql);

    await sql`DROP TABLE IF EXISTS users;`;
    await sql`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL, status TEXT NOT NULL);`;
    await sql`
      INSERT INTO users (id, email, status) VALUES
        (1, 'a@example.com', 'active'),
        (2, 'b@example.com', 'active'),
        (3, 'c@example.com', 'inactive'),
        (4, 'd@example.com', 'active'),
        (5, 'e@example.com', 'inactive')
    `;
  });

  afterAll(async () => {
    await sql`DROP TABLE IF EXISTS users;`;
    await stop();
  });

  test("returns a page and the filtered total", async () => {
    const users = db.table("users", UserSchema);
    const { rows, total } = await users
      .where({ status: "active" })
      .orderBy([{ column: "id", direction: "ASC" }])
      .skip(1)
      .take(2)
      .findManyAndCount();

    expect(rows).toEqual([
      { id: 2, email: "b@example.com", status: "active" },
      { id: 4, email: "d@example.com", status: "active" },
    ]);
    expect(total).toBe(3);
  });

  test("returns total on an empty page", async () => {
    const users = db.table("users", UserSchema);
    const { rows, total } = await users
      .orderBy([{ column: "id", direction: "ASC" }])
      .skip(100)
      .take(10)
      .findManyAndCount();

    expect(rows).toEqual([]);
    expect(total).toBe(5);
  });
});
