import type { Sql } from "postgres";
import { PgBuddyClient } from "../../src";
import { startPglite } from "../helpers/pglite";

interface User {
  id: number;
  email: string;
  status: "active" | "inactive";
  last_login: Date | null;
}

describe("Table - find", () => {
  let sql: Sql<{}>;
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
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
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
    await sql`DELETE FROM users;`;
    await sql`
      INSERT INTO users (email, status, last_login)
      VALUES
        ('a@example.com', 'active', NULL),
        ('b@example.com', 'active', NOW()),
        ('c@example.com', 'inactive', NULL);
    `;
  });

  test("findMany returns all matching records", async () => {
    const users = await db.table<User>("users").where({ status: "active" }).findMany();

    expect(users).toHaveLength(2);
  });

  test("findMany returns ordered and paginated results", async () => {
    const users = await db
      .table<User>("users")
      .orderBy([{ column: "email", direction: "ASC" }])
      .skip(1)
      .take(1)
      .findMany();

    expect(users).toHaveLength(1);
    expect(users[0].email).toBe("b@example.com");
  });

  test("findMany respects select projection", async () => {
    const users = await db
      .table<User>("users")
      .select(["id", "email"])
      .findMany();

    expect("status" in users[0]).toBe(false);
  });

  test("findFirst returns the first matching record", async () => {
    const user = await db.table<User>("users").where({ status: "active" }).findFirst();

    expect(user).not.toBeNull();
    expect(user?.status).toBe("active");
  });

  test("findFirst returns null when no rows match", async () => {
    const user = await db
      .table<User>("users")
      .where({ email: "nobody@example.com" })
      .findFirst();

    expect(user).toBeNull();
  });

  test("findUnique returns the single matching record", async () => {
    const user = await db
      .table<User>("users")
      .where({ email: "a@example.com" })
      .findUnique();

    expect(user?.email).toBe("a@example.com");
  });

  test("findUnique throws when multiple rows match", async () => {
    await expect(
      db.table<User>("users").where({ status: "active" }).findUnique()
    ).rejects.toThrow();
  });

  test("count returns total or filtered count", async () => {
    const total = await db.table<User>("users").count();
    const active = await db.table<User>("users").where({ status: "active" }).count();

    expect(total).toBe(3);
    expect(active).toBe(2);
  });
});
