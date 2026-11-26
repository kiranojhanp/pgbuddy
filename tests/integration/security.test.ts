import type { Sql } from "postgres";
import { Errors, PgBuddyClient, TableError } from "../../src";
import { startPglite } from "../helpers/pglite";

interface User {
  id: number;
  email: string;
  status: "active" | "inactive";
  last_login: Date | null;
}

describe("Security hardening", () => {
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
        ('grace@example.com', 'inactive', NULL);
    `;
  });

  describe("allowedColumns", () => {
    const allowed = ["email", "status", "last_login"] as const;

    test("create rejects columns outside the allowlist", async () => {
      const users = db.table<User>("users", { allowedColumns: allowed });

      await expect(
        users.create({ id: 1, email: "new@example.com", status: "active", last_login: null })
      ).rejects.toThrow(Errors.INSERT.COLUMN_NOT_ALLOWED("id"));
    });

    test("create accepts allowlisted columns", async () => {
      const users = db.table<User>("users", { allowedColumns: allowed });

      const created = await users.create({
        email: "new@example.com",
        status: "active",
        last_login: null,
      } as unknown as User);

      expect(created.email).toBe("new@example.com");
    });

    test("update rejects columns outside the allowlist", async () => {
      const users = db.table<User>("users", { allowedColumns: allowed });

      await expect(
        users.where({ email: "ada@example.com" }).update({ id: 999 } as Partial<User>)
      ).rejects.toThrow(Errors.UPDATE.COLUMN_NOT_ALLOWED("id"));
    });

    test("createMany rejects columns outside the allowlist", async () => {
      const users = db.table<User>("users", { allowedColumns: allowed });

      await expect(
        users.createMany([
          { id: 10, email: "batch@example.com", status: "active", last_login: null },
        ])
      ).rejects.toThrow(Errors.INSERT.COLUMN_NOT_ALLOWED("id"));
    });

    test("client-level allowlist applies to every table", async () => {
      const restricted = new PgBuddyClient(sql, { allowedColumns: allowed });

      await expect(
        restricted
          .table<User>("users")
          .create({ id: 2, email: "client@example.com", status: "active", last_login: null })
      ).rejects.toThrow(Errors.INSERT.COLUMN_NOT_ALLOWED("id"));
    });

    test("invalid allowlist values are rejected", () => {
      expect(() =>
        db.table<User>("users", { allowedColumns: "email" as unknown as string[] })
      ).toThrow(TableError);

      expect(
        () => new PgBuddyClient(sql, { allowedColumns: "email" as unknown as string[] })
      ).toThrow(TableError);
    });
  });

  describe("allowSchema", () => {
    test("dotted table names require allowSchema", () => {
      expect(() => db.table<User>("public.users")).toThrow(TableError);
      expect(() => db.table<User>("public.users", { allowSchema: true })).not.toThrow();
    });

    test("dotted column names require allowSchema", async () => {
      await expect(
        db
          .table<User>("users")
          .where({ "users.status": "active" } as unknown as Partial<User>)
          .findMany()
      ).rejects.toThrow(Errors.WHERE.INVALID_FIELD("users.status"));

      const rows = await db
        .table<User>("users", { allowSchema: true })
        .where({ "users.status": "active" } as unknown as Partial<User>)
        .findMany();

      expect(rows).toHaveLength(1);
    });
  });

  describe("pagination cap", () => {
    test("take is capped by default", () => {
      expect(() => db.table<User>("users").take(10_001)).toThrow(
        Errors.SELECT.TAKE_EXCEEDS_MAX(10_000)
      );
    });

    test("take respects a per-table cap", () => {
      const users = db.table<User>("users", { maxTake: 5 });

      expect(() => users.take(6)).toThrow(Errors.SELECT.TAKE_EXCEEDS_MAX(5));
      expect(() => users.take(5)).not.toThrow();
    });

    test("findUnique still fetches two rows when maxTake is 1", async () => {
      const users = db.table<User>("users", { maxTake: 1 });

      await expect(users.where({ email: "ada@example.com" }).findUnique()).resolves.toMatchObject({
        email: "ada@example.com",
      });

      await expect(users.findUnique()).rejects.toThrow(Errors.QUERY.NOT_UNIQUE);
    });

    test("invalid maxTake values are rejected", () => {
      expect(() => db.table<User>("users", { maxTake: 0 })).toThrow(TableError);
      expect(() => db.table<User>("users", { maxTake: 1.5 })).toThrow(TableError);
      expect(() => new PgBuddyClient(sql, { maxTake: -1 })).toThrow(TableError);
    });
  });

  describe("undefined values", () => {
    test("where rejects undefined values with a QueryError", async () => {
      await expect(
        db
          .table<User>("users")
          .where({ status: undefined } as unknown as Partial<User>)
          .findMany()
      ).rejects.toThrow(Errors.WHERE.UNDEFINED_VALUE("status"));
    });

    test("create omits undefined values", async () => {
      const created = await db.table<User>("users").create({
        email: "undefined@example.com",
        status: "active",
        last_login: undefined,
      } as unknown as User);

      expect(created.last_login).toBeNull();
    });
  });

  describe("query state snapshots", () => {
    test("mutating a where array after building does not change the query", async () => {
      const conditions = [{ field: "status" as const, operator: "=" as const, value: "active" }];
      const query = db.table<User>("users").where(conditions);

      conditions[0] = { field: "status", operator: "=", value: "inactive" };

      const rows = await query.findMany();

      expect(rows).toHaveLength(1);
      expect(rows[0]?.email).toBe("ada@example.com");
    });
  });
});
