import type { Sql } from "postgres";
import { z } from "zod";
import { Errors, PgBuddyClient, QueryError } from "../../src";
import { startPglite } from "../helpers/pglite";

describe("ZodTable", () => {
  let sql: Sql<{}>;
  let stop: () => Promise<void>;
  let db: PgBuddyClient;

  const UserSchema = z.object({
    id: z.number().int(),
    email: z.string().email(),
    status: z.enum(["active", "inactive"]),
    last_login: z.date().nullable(),
  });

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

  test("create validates via schema and returns data", async () => {
    const users = db.table("users", UserSchema);
    const created = await users.create({
      id: 1,
      email: "ada@example.com",
      status: "active",
      last_login: null,
    });

    expect(created.id).toBe(1);
    expect(created.email).toBe("ada@example.com");
  });

  test("create rejects invalid data with helpful error", async () => {
    const users = db.table("users", UserSchema);

    await expect(
      users.create({
        id: 2,
        email: "not-an-email",
        status: "active",
        last_login: null,
      })
    ).rejects.toThrow(QueryError);
  });

  test("update validates partial data", async () => {
    const users = db.table("users", UserSchema);
    await users.create({
      id: 3,
      email: "grace@example.com",
      status: "active",
      last_login: null,
    });

    const updated = await users.where({ id: 3 }).update({
      status: "inactive",
    });

    expect(updated[0].status).toBe("inactive");
  });

  test("where validates keys and values", async () => {
    const users = db.table("users", UserSchema);

    expect(() =>
      users.where({ missing: "nope" } as unknown as Record<string, string>)
    ).toThrow(Errors.WHERE.INVALID_FIELD("missing"));

    expect(() =>
      users.where({ id: "nope" } as unknown as { id: string })
    ).toThrow(QueryError);
  });

  test("advanced where validates IN values", async () => {
    const users = db.table("users", UserSchema);
    await users.create({
      id: 4,
      email: "linus@example.com",
      status: "active",
      last_login: null,
    });

    await expect(
      users
        .where([{ field: "status", operator: "IN", value: ["active"] }])
        .findMany()
    ).resolves.toHaveLength(1);

    expect(() =>
      users.where([
        { field: "id", operator: "IN", value: ["oops"] as unknown as number[] },
      ])
    ).toThrow(QueryError);
  });

  test("supports select, sort, pagination, and delete", async () => {
    const users = db.table("users", UserSchema);
    await users.createMany([
      { id: 10, email: "a@example.com", status: "active", last_login: null },
      { id: 11, email: "b@example.com", status: "inactive", last_login: null },
    ]);

    const rows = await users
      .select(["id", "email"])
      .orderBy([{ column: "id", direction: "DESC" }])
      .skip(0)
      .take(1)
      .findMany();

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(11);

    const first = await users.orderBy([{ column: "id", direction: "ASC" }]).findFirst();
    expect(first?.id).toBe(10);

    const unique = await users.where({ id: 10 }).findUnique();
    expect(unique?.email).toBe("a@example.com");

    const total = await users.count();
    expect(total).toBe(2);

    const deleted = await users.where({ id: 11 }).delete();
    expect(deleted).toHaveLength(1);
    expect(deleted[0].id).toBe(11);
  });

  test("validates LIKE and NULL operators", async () => {
    const users = db.table("users", UserSchema);
    await users.create({
      id: 20,
      email: "like@example.com",
      status: "active",
      last_login: null,
    });

    expect(() =>
      users.where([
        { field: "email", operator: "LIKE", value: 123 as unknown as string },
      ])
    ).toThrow(Errors.WHERE.INVALID_LIKE("email"));

    expect(() =>
      users.where([
        { field: "last_login", operator: "IS NULL", value: null as never },
      ])
    ).toThrow(Errors.WHERE.INVALID_FIELD("last_login"));
  });

  test("createMany validates all records", async () => {
    const users = db.table("users", UserSchema);
    await expect(
      users.createMany([
        { id: 30, email: "ok@example.com", status: "active", last_login: null },
        { id: 31, email: "bad-email", status: "active", last_login: null },
      ])
    ).rejects.toThrow(QueryError);
  });
});
