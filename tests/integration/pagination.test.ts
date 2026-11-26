import type { Sql } from "postgres";
import { z } from "zod";
import { PgBuddyClient, QueryError } from "../../src";
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

  test("returns a next cursor and continues with keyset pagination", async () => {
    const users = db
      .table("users", UserSchema)
      .orderBy([{ column: "id", direction: "ASC" }]);

    const first = await users.take(2).findManyInfinite();
    expect(first.rows.map((row) => row.id)).toEqual([1, 2]);
    expect(first.nextCursor).toEqual({ id: 2 });
    expect(first.hasMore).toBe(true);

    const second = await users
      .cursor(first.nextCursor as { id: number })
      .take(2)
      .findManyInfinite();
    expect(second.rows.map((row) => row.id)).toEqual([3, 4]);
    expect(second.nextCursor).toEqual({ id: 4 });
    expect(second.hasMore).toBe(true);

    const last = await users
      .cursor(second.nextCursor as { id: number })
      .take(2)
      .findManyInfinite();
    expect(last.rows.map((row) => row.id)).toEqual([5]);
    expect(last.nextCursor).toBeNull();
    expect(last.hasMore).toBe(false);
  });

  test("requires orderBy and take for infinite pages", async () => {
    const users = db.table("users", UserSchema);
    await expect(users.take(2).findManyInfinite()).rejects.toBeInstanceOf(QueryError);
    await expect(
      users.orderBy([{ column: "id", direction: "ASC" }]).findManyInfinite()
    ).rejects.toBeInstanceOf(QueryError);
  });
});
