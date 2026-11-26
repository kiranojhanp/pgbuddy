import type { Sql } from "postgres";
import { z } from "zod";
import { PgBuddyClient, QueryError, zodValidator } from "../../src";
import { startPglite } from "../helpers/pglite";

const UserSchema = z.object({
  id: z.number().int(),
  email: z.email(),
  status: z.enum(["active", "inactive"]),
});

describe("schema + validator adapter", () => {
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
        email TEXT UNIQUE NOT NULL,
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

  const users = () =>
    db.tableWithValidator("users", UserSchema, zodValidator, {
      unique: [["email"]],
    });

  test("infers schema types and validates through the adapter", async () => {
    const created = await users().create({
      id: 1,
      email: "ada@example.com",
      status: "active",
    });
    expect(created.email).toBe("ada@example.com");

    const found = await users().where({ email: "ada@example.com" }).findFirst();
    expect(found?.id).toBe(1);

    const [updated] = (await users().where({ id: 1 }).update({ status: "inactive" })) as Array<{
      status: string;
    }>;
    expect(updated?.status).toBe("inactive");

    await expect(users().create({ id: 2, email: "bad", status: "active" })).rejects.toBeInstanceOf(
      QueryError
    );
  });
});
