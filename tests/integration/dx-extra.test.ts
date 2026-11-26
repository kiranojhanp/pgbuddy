import type { Sql } from "postgres";
import { Errors, inArray, PgBuddyClient, QueryError, sqlExpr, TableError } from "../../src";
import { startPglite } from "../helpers/pglite";
import { UserSchema } from "../helpers/schemas";

interface User {
  id: number;
  email: string;
  status: "active" | "inactive";
  last_login: Date | null;
}

describe("limits, counts, and transactions", () => {
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
    await sql`TRUNCATE users RESTART IDENTITY;`;
    await sql`
      INSERT INTO users (email, status, last_login)
      VALUES
        ('a@example.com', 'active', NULL),
        ('b@example.com', 'active', NOW()),
        ('c@example.com', 'inactive', NULL),
        ('d@example.com', 'inactive', NOW())
    `;
  });

  test("defaultTake limits findMany but explicit take overrides it", async () => {
    const limited = new PgBuddyClient(sql, { defaultTake: 2 });

    expect(await limited.table("users", UserSchema).findMany()).toHaveLength(2);
    expect(await limited.table("users", UserSchema).take(3).findMany()).toHaveLength(3);
    expect(await limited.table("users", UserSchema).findFirst()).not.toBeNull();
  });

  test("defaultTake is validated", () => {
    expect(() => new PgBuddyClient(sql, { defaultTake: 0 })).toThrow(TableError);
    expect(() => new PgBuddyClient(sql, { defaultTake: 10_001 })).not.toThrow();
    expect(() => db.table("users", UserSchema, { defaultTake: 10_001 })).toThrow(TableError);
  });

  test("exists checks for matching rows", async () => {
    const users = db.table("users", UserSchema);

    await expect(users.where({ status: "active" }).exists()).resolves.toBe(true);
    await expect(users.where({ email: "missing@example.com" }).exists()).resolves.toBe(false);
  });

  test("update and delete can return a count", async () => {
    const users = db.table("users", UserSchema);

    const updated = await users
      .where({ status: "active" })
      .update({ status: "inactive" }, { returning: false });
    expect(updated).toBe(2);

    const deleted = await users.where({ status: "inactive" }).delete({ returning: false });
    expect(deleted).toBe(4);
  });

  test("transaction options set the isolation level", async () => {
    const isolation = await db.transaction(
      async (tx) => {
        const [row] = await tx.sql<[{ isolation: string }]>`
          SELECT current_setting('transaction_isolation') AS isolation
        `;
        return row?.isolation;
      },
      { isolationLevel: "serializable" }
    );

    expect(isolation).toBe("serializable");
  });

  test("orderBy supports NULLS FIRST / NULLS LAST", async () => {
    const users = db.table("users", UserSchema);

    const first = await users
      .orderBy([{ column: "last_login", direction: "ASC", nulls: "first" }])
      .findMany();
    expect(first[0]?.last_login).toBeNull();

    const last = await users
      .orderBy([{ column: "last_login", direction: "ASC", nulls: "last" }])
      .findMany();
    expect(last.at(-1)?.last_login).toBeNull();
  });

  test("aggregate supports count, distinct, sum, avg, min, and max", async () => {
    const result = await db.table("users", UserSchema).aggregate({
      count: true,
      countDistinct: ["status"],
      sum: ["id"],
      avg: ["id"],
      min: ["id"],
      max: ["id"],
    });

    expect(result.count).toBe(4);
    expect(result.countDistinct.status).toBe(2);
    expect(result.sum.id).toBe(10);
    expect(result.avg.id).toBe(2.5);
    expect(result.min.id).toBe(1);
    expect(result.max.id).toBe(4);
  });

  test("QueryError exposes stable codes", async () => {
    const users = db.table("users", UserSchema);

    await expect(
      users.where({ email: "missing@example.com" }).findFirstOrThrow()
    ).rejects.toMatchObject({ code: "NO_ROWS" });

    await expect(users.delete()).rejects.toMatchObject({ code: "NO_CONDITIONS" });
    await expect(users.create({} as never)).rejects.toMatchObject({ code: "INVALID_DATA" });

    try {
      users.take(0);
      throw new Error("expected an error");
    } catch (error) {
      expect(error).toBeInstanceOf(QueryError);
      expect((error as QueryError).code).toBe("INVALID_TAKE");
    }

    try {
      inArray("email", []);
      throw new Error("expected an error");
    } catch (error) {
      expect((error as QueryError).code).toBe("INVALID_WHERE");
    }
  });

  test("composite cursors use lexicographic keyset pagination", async () => {
    const rows = await db
      .table("users", UserSchema)
      .orderBy([
        { column: "status", direction: "ASC" },
        { column: "id", direction: "ASC" },
      ])
      .cursor({ status: "active", id: 2 })
      .findMany();

    expect(rows.map((row) => row.id)).toEqual([3, 4]);
  });

  test("composite cursors require matching orderBy columns", async () => {
    await expect(
      db
        .table("users", UserSchema)
        .orderBy([{ column: "id", direction: "ASC" }])
        .cursor({ status: "active", id: 2 })
        .findMany()
    ).rejects.toThrow(Errors.SELECT.INVALID_CURSOR);
  });

  test("computed fields extend find results", async () => {
    const rows = await db
      .table("users", UserSchema)
      .where({ status: "active" })
      .findMany({
        computed: {
          lowerEmail: sqlExpr<string>(sql`lower(email)`),
        },
      });

    expect(rows.map((row) => row.lowerEmail).sort()).toEqual(["a@example.com", "b@example.com"]);
  });

  test("computed field aliases cannot collide with selected columns", async () => {
    await expect(
      db
        .table("users", UserSchema)
        .select(["id", "email"])
        .findMany({ computed: { email: sqlExpr<string>(sql`lower(email)`) } })
    ).rejects.toThrow(Errors.SELECT.INVALID_COLUMNS("email"));
  });

  test("selectExpr is a chainable computed projection", async () => {
    const rows = await db
      .table("users", UserSchema)
      .where({ status: "active" })
      .selectExpr({ lowerEmail: sqlExpr<string>(sql`lower(email)`) })
      .findMany();

    expect(rows.map((row) => row.lowerEmail).sort()).toEqual(["a@example.com", "b@example.com"]);

    expect(
      await db
        .table("users", UserSchema)
        .selectExpr({ total: sqlExpr<number>(sql`count(*)::int`) })
        .count()
    ).toBe(4);
  });

  test("orderByRaw combines with column ordering", async () => {
    const rows = await db
      .table("users", UserSchema)
      .orderBy([{ column: "status", direction: "ASC" }])
      .orderByRaw(sql`id DESC`)
      .findMany();

    expect(rows.map((row) => row.id)).toEqual([2, 1, 4, 3]);
  });

  test("distinctOnExpr supports expressions", async () => {
    const rows = await db
      .table("users", UserSchema)
      .select(["status"])
      .distinctOnExpr([sql`status`])
      .orderByRaw(sql`status ASC, id ASC`)
      .findMany();

    expect(rows.map((row) => row.status).sort()).toEqual(["active", "inactive"]);
  });

  test("row locking clauses execute and validate", async () => {
    await expect(
      db.transaction(async (tx) => {
        const rows = await tx
          .table("users", UserSchema)
          .for("update", { skipLocked: true })
          .findMany();
        expect(rows).toHaveLength(4);
      })
    ).resolves.toBeUndefined();

    expect(() =>
      db.table("users", UserSchema).for("update", { skipLocked: true, noWait: true })
    ).toThrow(Errors.SELECT.INVALID_LOCK);
  });

  test("undefined values are omitted from writes", async () => {
    const insertable = db.table("users", UserSchema);

    const created = await insertable.create({
      email: "undefined@example.com",
      status: "active",
      last_login: undefined,
    } as unknown as User);

    expect(created.last_login).toBeNull();

    const [updated] = await insertable
      .where({ id: created.id })
      .update({ status: "inactive", last_login: undefined });

    expect(updated?.status).toBe("inactive");
  });

  test("groupBy supports aggregates and having", async () => {
    const rows = await db
      .table("users", UserSchema)
      .groupBy(["status"], { count: sqlExpr<number>(sql`count(*)::int`) })
      .orderBy([{ column: "status", direction: "ASC" }])
      .findMany();

    expect(rows).toEqual([
      { status: "active", count: 2 },
      { status: "inactive", count: 2 },
    ]);

    const filtered = await db
      .table("users", UserSchema)
      .groupBy(["status"], { count: sqlExpr<number>(sql`count(*)::int`) })
      .having(sql`count(*) > 2`)
      .findMany();

    expect(filtered).toEqual([]);
  });

  test("transaction retry reruns serialization failures", async () => {
    let attempts = 0;
    const value = await db.transaction(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw Object.assign(new Error("retry"), { code: "40001" });
        }
        return "ok";
      },
      { retry: { max: 3, delayMs: 0 } }
    );

    expect(value).toBe("ok");
    expect(attempts).toBe(3);
  });

  test("transaction retry does not retry other errors", async () => {
    let attempts = 0;
    await expect(
      db.transaction(
        async () => {
          attempts += 1;
          throw Object.assign(new Error("no retry"), { code: "23505" });
        },
        { retry: { max: 3 } }
      )
    ).rejects.toThrow("no retry");

    expect(attempts).toBe(1);
  });

  test("transaction retry options are validated", async () => {
    await expect(
      db.transaction(async () => undefined, { retry: { max: -1 } })
    ).rejects.toBeInstanceOf(QueryError);
    await expect(
      db.transaction(async () => undefined, { retry: { on: ["bad"] } })
    ).rejects.toBeInstanceOf(QueryError);
  });

  test("transaction clients inherit column mapping and adapters", async () => {
    const mapped = new PgBuddyClient(sql, {
      columnMap: { email: "email", status: "status" },
    });

    await mapped.transaction(async (tx) => {
      const row = await tx.table("users", UserSchema).where({ id: 1 }).findFirst();
      expect(row?.email).toBe("a@example.com");
    });
  });

  test("explain returns a query plan without executing by default", async () => {
    const users = db.table("users", UserSchema);
    const plan = await users.where({ status: "active" }).explain();
    expect(plan.length).toBeGreaterThan(0);

    const analyzed = await users.where({ status: "active" }).explain({ analyze: true });
    expect(analyzed.length).toBeGreaterThan(0);
  });
});
