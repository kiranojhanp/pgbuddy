import type { Sql } from "postgres";
import { PgBuddyClient } from "../../src";
import { startPglite } from "../helpers/pglite";

interface User {
  id: number;
  email: string;
  status: "active" | "inactive";
  last_login: Date | null;
}

describe("Table - update and delete", () => {
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
        ('grace@example.com', 'active', NULL);
    `;
  });

  test("update modifies matching records and returns them", async () => {
    const updated = await db
      .table<User>("users")
      .where({ email: "ada@example.com" })
      .update({ status: "inactive" });

    expect(updated).toHaveLength(1);
    expect(updated[0].status).toBe("inactive");
  });

  test("update respects select projection", async () => {
    const updated = await db
      .table<User>("users")
      .where({ email: "ada@example.com" })
      .select(["id", "status"])
      .update({ status: "inactive" });

    expect(updated[0].status).toBe("inactive");
    expect("email" in updated[0]).toBe(false);
  });

  test("update without where throws", async () => {
    await expect(
      db.table<User>("users").update({ status: "inactive" })
    ).rejects.toThrow();
  });

  test("update with empty data throws", async () => {
    await expect(
      db.table<User>("users").where({ email: "ada@example.com" }).update({} as Partial<User>)
    ).rejects.toThrow();
  });

  test("delete removes matching records and returns them", async () => {
    const deleted = await db
      .table<User>("users")
      .where({ email: "ada@example.com" })
      .delete();

    expect(deleted).toHaveLength(1);

    const remaining = await db.table<User>("users").count();
    expect(remaining).toBe(1);
  });

  test("delete respects select projection", async () => {
    const deleted = await db
      .table<User>("users")
      .where({ email: "ada@example.com" })
      .select(["id"])
      .delete();

    expect("email" in deleted[0]).toBe(false);
  });

  test("delete without where throws", async () => {
    await expect(db.table<User>("users").delete()).rejects.toThrow();
  });
});
