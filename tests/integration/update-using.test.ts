import type { Sql } from "postgres";
import { z } from "zod";
import { PgBuddyClient } from "../../src";
import { startPglite } from "../helpers/pglite";

const UserSchema = z.object({
  id: z.number().int(),
  email: z.string(),
  status: z.string(),
});

describe("updateFrom and deleteUsing", () => {
  let sql: Sql<Record<string, unknown>>;
  let stop: () => Promise<void>;
  let db: PgBuddyClient;

  beforeAll(async () => {
    const started = await startPglite();
    sql = started.sql;
    stop = started.stop;
    db = new PgBuddyClient(sql);

    await sql`DROP TABLE IF EXISTS settings;`;
    await sql`DROP TABLE IF EXISTS users;`;
    await sql`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL, status TEXT NOT NULL);`;
    await sql`CREATE TABLE settings (id INTEGER PRIMARY KEY, status TEXT NOT NULL);`;
  });

  afterAll(async () => {
    await sql`DROP TABLE IF EXISTS settings;`;
    await sql`DROP TABLE IF EXISTS users;`;
    await stop();
  });

  beforeEach(async () => {
    await sql`TRUNCATE users, settings;`;
    await sql`INSERT INTO users (id, email, status) VALUES (1, 'a@example.com', 'active'), (2, 'b@example.com', 'active')`;
    await sql`INSERT INTO settings (id, status) VALUES (1, 'inactive')`;
  });

  test("updates from a raw FROM clause", async () => {
    const users = db.table("users", UserSchema);

    const rows = await users
      .whereRaw(sql`"settings"."id" = "users"."id"`)
      .updateFrom({ status: "disabled" }, sql`settings`);
    expect(rows).toEqual([{ id: 1, email: "a@example.com", status: "disabled" }]);
  });

  test("deletes using a raw USING clause", async () => {
    const users = db.table("users", UserSchema);

    const rows = await users
      .whereRaw(sql`"settings"."id" = "users"."id"`)
      .deleteUsing(sql`settings`);
    expect(rows).toEqual([{ id: 1, email: "a@example.com", status: "active" }]);
    expect(await users.count()).toBe(1);
  });

  test("supports returning false", async () => {
    const users = db.table("users", UserSchema);
    const count = await users
      .whereRaw(sql`"settings"."id" = "users"."id"`)
      .updateFrom({ status: "disabled" }, sql`settings`, { returning: false });
    expect(count).toBe(1);
  });
});
