import type { Sql } from "postgres";
import {
  constraintName,
  Errors,
  isDeadlock,
  isForeignKeyViolation,
  isUniqueViolation,
  PgBuddyClient,
  QueryError,
} from "../../src";
import { startPglite } from "../helpers/pglite";

interface User {
  id: number;
  email: string;
  status: "active" | "inactive";
  last_login: Date | null;
}

describe("client DX", () => {
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
    await sql`TRUNCATE users;`;
  });

  test("exposes the underlying postgres.js instance", () => {
    expect(db.sql).toBe(sql);
  });

  test("transaction commits on success", async () => {
    await db.transaction(async (tx) => {
      await tx
        .table<User>("users")
        .create({ id: 1, email: "commit@example.com", status: "active", last_login: null });
    });

    const rows = await db.table<User>("users").where({ id: 1 }).findMany();
    expect(rows).toHaveLength(1);
  });

  test("transaction rolls back on error", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx
          .table<User>("users")
          .create({ id: 2, email: "rollback@example.com", status: "active", last_login: null });
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    const rows = await db.table<User>("users").where({ id: 2 }).findMany();
    expect(rows).toHaveLength(0);
  });

  test("nested transactions use savepoints", async () => {
    await db.transaction(async (tx) => {
      await tx
        .table<User>("users")
        .create({ id: 3, email: "outer@example.com", status: "active", last_login: null });

      await expect(
        tx.transaction(async (inner) => {
          await inner
            .table<User>("users")
            .create({ id: 4, email: "inner@example.com", status: "active", last_login: null });
          throw new Error("inner boom");
        })
      ).rejects.toThrow("inner boom");
    });

    const rows = await db
      .table<User>("users")
      .orderBy([{ column: "id", direction: "ASC" }])
      .findMany();
    expect(rows.map((row) => row.id)).toEqual([3]);
  });

  test("transaction inherits client options", async () => {
    const restricted = new PgBuddyClient(sql, { allowedColumns: ["email"] });

    await expect(
      restricted.transaction(async (tx) => {
        await tx
          .table<User>("users")
          .create({ id: 5, email: "restricted@example.com", status: "active", last_login: null });
      })
    ).rejects.toThrow(Errors.INSERT.COLUMN_NOT_ALLOWED("id"));
  });

  test("findFirstOrThrow / findUniqueOrThrow", async () => {
    await db
      .table<User>("users")
      .create({ id: 6, email: "throw@example.com", status: "active", last_login: null });

    await expect(
      db.table<User>("users").where({ id: 6 }).findFirstOrThrow()
    ).resolves.toMatchObject({
      email: "throw@example.com",
    });
    await expect(
      db.table<User>("users").where({ id: 6 }).findUniqueOrThrow()
    ).resolves.toMatchObject({
      email: "throw@example.com",
    });

    await expect(db.table<User>("users").where({ id: 999 }).findFirstOrThrow()).rejects.toThrow(
      Errors.QUERY.NO_ROWS
    );
    await expect(db.table<User>("users").where({ id: 999 }).findUniqueOrThrow()).rejects.toThrow(
      Errors.QUERY.NO_ROWS
    );
  });

  test("findOrThrow methods expose QueryError instances", async () => {
    await expect(db.table<User>("users").findFirstOrThrow()).rejects.toBeInstanceOf(QueryError);
    await expect(db.table<User>("users").findUniqueOrThrow()).rejects.toBeInstanceOf(QueryError);
  });

  test("database error helpers recognize unique violations", async () => {
    await db
      .table<User>("users")
      .create({ id: 7, email: "dupe@example.com", status: "active", last_login: null });

    try {
      await db
        .table<User>("users")
        .create({ id: 8, email: "dupe@example.com", status: "active", last_login: null });
      throw new Error("expected a unique violation");
    } catch (error) {
      expect(isUniqueViolation(error)).toBe(true);
      expect(isForeignKeyViolation(error)).toBe(false);
      expect(isDeadlock(error)).toBe(false);
      expect(constraintName(error)).toBeTruthy();
    }
  });
});
