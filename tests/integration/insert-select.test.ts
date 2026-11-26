import type { Sql } from "postgres";
import { z } from "zod";
import { PgBuddyClient } from "../../src";
import { startPglite } from "../helpers/pglite";

const UserSchema = z.object({
  id: z.number().int(),
  email: z.string(),
  status: z.enum(["active", "inactive"]),
});

describe("insertFrom", () => {
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
        email TEXT NOT NULL,
        status TEXT NOT NULL
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

  test("inserts from a SELECT with mapped columns and returning", async () => {
    const users = db.table("users", UserSchema);

    const [created] = (await users.insertFrom(sql`SELECT 1, 'ada@example.com', 'active'`, {
      columns: ["id", "email", "status"],
    })) as Array<{ id: number; email: string }>;

    expect(created).toEqual({ id: 1, email: "ada@example.com", status: "active" });

    const count = await users.insertFrom(sql`SELECT 2, 'grace@example.com', 'inactive'`, {
      columns: ["id", "email", "status"],
      returning: false,
    });
    expect(count).toBe(1);
    expect(await users.count()).toBe(2);
  });

  test("supports a column map", async () => {
    const MappedUserSchema = z.object({
      id: z.number(),
      email: z.string(),
      state: z.string(),
    });
    const users = db.table("users", MappedUserSchema, {
      columnMap: { state: "status" },
    });

    await users.insertFrom(sql`SELECT 3, 'linus@example.com', 'active'`, {
      columns: ["id", "email", "state"],
    });

    const found = await users.where({ state: "active" }).findFirst();
    expect(found?.id).toBe(3);
  });
});
