import type { Sql } from "postgres";
import { PgBuddyClient } from "../../src";
import { startPglite } from "../helpers/pglite";

interface User {
  id: number;
  email: string;
  status: "active" | "inactive";
  last_login: Date | null;
}

describe("Table - where operators", () => {
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
        ('ada@example.com', 'active', NULL),
        ('grace@example.com', 'active', NOW()),
        ('linus@corp.com', 'inactive', NULL);
    `;
  });

  test("ILIKE contains matches case-insensitively", async () => {
    const users = await db
      .table<User>("users")
      .where([{ field: "email", operator: "ILIKE", value: "EXAMPLE.COM", pattern: "contains" }])
      .findMany();

    expect(users).toHaveLength(2);
  });

  test("IN filters by list of values", async () => {
    const users = await db
      .table<User>("users")
      .where([{ field: "email", operator: "IN", value: ["ada@example.com", "linus@corp.com"] }])
      .findMany();

    expect(users).toHaveLength(2);
  });

  test("IS NULL matches null fields", async () => {
    const users = await db
      .table<User>("users")
      .where([{ field: "last_login", operator: "IS NULL" }])
      .findMany();

    expect(users).toHaveLength(2);
  });

  test("IS NOT NULL matches non-null fields", async () => {
    const users = await db
      .table<User>("users")
      .where([{ field: "last_login", operator: "IS NOT NULL" }])
      .findMany();

    expect(users).toHaveLength(1);
  });

  test("simple equality filter", async () => {
    const users = await db
      .table<User>("users")
      .where({ status: "inactive" })
      .findMany();

    expect(users).toHaveLength(1);
    expect(users[0].email).toBe("linus@corp.com");
  });
});
