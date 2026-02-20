import type { Sql } from "postgres";
import { PgBuddyClient } from "../../src";
import { startPglite } from "../helpers/pglite";

interface User {
  id: number;
  email: string;
  status: "active" | "inactive";
  last_login: Date | null;
}

describe("Table - create", () => {
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
  });

  test("creates a single record and returns it", async () => {
    const user = await db.table<User>("users").create({
      email: "ada@example.com",
      status: "active",
      last_login: null,
    });

    expect(user.email).toBe("ada@example.com");
    expect(user.status).toBe("active");
    expect(user.id).toBeDefined();
  });

  test("create respects select projection", async () => {
    const user = await db
      .table<User>("users")
      .select(["id", "email"])
      .create({ email: "ada@example.com", status: "active", last_login: null });

    expect(user.email).toBe("ada@example.com");
    expect("status" in user).toBe(false);
  });

  test("createMany inserts multiple records and returns them", async () => {
    const users = await db.table<User>("users").createMany([
      { email: "ada@example.com", status: "active", last_login: null },
      { email: "grace@example.com", status: "inactive", last_login: null },
    ]);

    expect(users).toHaveLength(2);
    expect(users[0].id).toBeDefined();
  });

  test("create rejects empty data", async () => {
    await expect(
      db.table<User>("users").create({} as Partial<User>)
    ).rejects.toThrow();
  });

  test("createMany rejects empty array", async () => {
    await expect(db.table<User>("users").createMany([])).rejects.toThrow();
  });
});
