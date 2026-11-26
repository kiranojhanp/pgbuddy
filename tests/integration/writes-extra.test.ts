import type { Sql } from "postgres";
import { Errors, PgBuddyClient, sqlExpr } from "../../src";
import { startPglite } from "../helpers/pglite";

interface User {
  id: number;
  email: string;
  status: "active" | "inactive";
  last_login: Date | null;
}

describe("write options and set queries", () => {
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
  });

  const users = () => db.tableWithInsert<User, "id">("users");

  test("upsert inserts and updates", async () => {
    const created = await users().upsert({
      where: { email: "ada@example.com" },
      create: { email: "ada@example.com", status: "active", last_login: null },
      update: { status: "inactive" },
    });

    expect(created.status).toBe("active");

    const updated = await users().upsert({
      where: { email: "ada@example.com" },
      create: { email: "ada@example.com", status: "active", last_login: null },
      update: { status: "inactive" },
    });

    expect(updated.id).toBe(created.id);
    expect(updated.status).toBe("inactive");
  });

  test("upsert requires a conflict target and data", async () => {
    await expect(
      users().upsert({
        where: {},
        create: { email: "x@example.com", status: "active", last_login: null },
        update: { status: "inactive" },
      })
    ).rejects.toThrow(Errors.INSERT.INVALID_CONFLICT_TARGET);

    await expect(
      users().upsert({
        where: { email: "x@example.com" },
        create: {} as never,
        update: { status: "inactive" },
      })
    ).rejects.toThrow(Errors.INSERT.INVALID_DATA);
  });

  test("createMany skipDuplicates skips conflicting rows", async () => {
    await users().create({
      email: "a@example.com",
      status: "active",
      last_login: null,
    });

    const inserted = await users().createMany(
      [
        { email: "a@example.com", status: "inactive", last_login: null },
        { email: "b@example.com", status: "active", last_login: null },
      ],
      { skipDuplicates: true }
    );

    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.email).toBe("b@example.com");
  });

  test("distinct returns unique projections", async () => {
    await users().createMany([
      { email: "a@example.com", status: "active", last_login: null },
      { email: "b@example.com", status: "active", last_login: null },
      { email: "c@example.com", status: "inactive", last_login: null },
    ]);

    const rows = await users().select(["status"]).distinct().findMany();

    expect(rows.map((row) => row.status).sort()).toEqual(["active", "inactive"]);
  });

  test("distinctOn returns the first row per key", async () => {
    await users().createMany([
      { email: "a@example.com", status: "active", last_login: null },
      { email: "b@example.com", status: "active", last_login: null },
      { email: "c@example.com", status: "inactive", last_login: null },
    ]);

    const rows = await users()
      .distinctOn(["status"])
      .orderBy([
        { column: "status", direction: "ASC" },
        { column: "id", direction: "ASC" },
      ])
      .findMany();

    expect(rows).toHaveLength(2);
    expect(rows[0]?.email).toBe("a@example.com");
    expect(rows[1]?.email).toBe("c@example.com");
  });

  test("cursor paginates ascending and descending", async () => {
    await users().createMany([
      { email: "a@example.com", status: "active", last_login: null },
      { email: "b@example.com", status: "active", last_login: null },
      { email: "c@example.com", status: "active", last_login: null },
    ]);

    const ascending = await users()
      .orderBy([{ column: "id", direction: "ASC" }])
      .cursor({ id: 1 })
      .findMany();
    expect(ascending.map((row) => row.id)).toEqual([2, 3]);

    const descending = await users()
      .orderBy([{ column: "id", direction: "DESC" }])
      .cursor({ id: 3 })
      .findMany();
    expect(descending.map((row) => row.id)).toEqual([2, 1]);
  });

  test("cursor requires columns matching the leading sort columns", async () => {
    expect(() => users().cursor({})).toThrow(Errors.SELECT.INVALID_CURSOR);

    await expect(
      users()
        .orderBy([{ column: "email", direction: "ASC" }])
        .cursor({ id: 1 })
        .findMany()
    ).rejects.toThrow(Errors.SELECT.INVALID_CURSOR);
  });

  test("cursor rejects null values", () => {
    expect(() => users().cursor({ id: null as unknown as number })).toThrow(
      Errors.SELECT.INVALID_CURSOR
    );
  });

  test("createMany onConflict updates conflicting rows", async () => {
    await users().create({
      email: "a@example.com",
      status: "active",
      last_login: null,
    });

    const returned = await users().createMany(
      [
        { email: "a@example.com", status: "inactive", last_login: null },
        { email: "b@example.com", status: "active", last_login: null },
      ],
      { onConflict: { target: ["email"], update: ["status"] } }
    );

    expect(returned).toHaveLength(2);
    expect((await users().where({ email: "a@example.com" }).findFirst())?.status).toBe("inactive");
  });

  test("createMany rejects invalid conflict options", async () => {
    await expect(
      users().createMany([{ email: "a@example.com", status: "active", last_login: null }], {
        skipDuplicates: true,
        onConflict: { target: ["email"], update: ["status"] },
      })
    ).rejects.toThrow(Errors.INSERT.CONFLICT_OPTIONS);

    await expect(
      users().createMany([{ email: "a@example.com", status: "active", last_login: null }], {
        onConflict: { target: ["missing"], update: ["status"] },
      })
    ).rejects.toThrow(Errors.INSERT.INVALID_CONFLICT);
  });

  test("upsert with an empty update returns the existing row", async () => {
    await users().create({
      email: "existing@example.com",
      status: "active",
      last_login: null,
    });

    const row = await users().upsert({
      where: { email: "existing@example.com" },
      create: { email: "existing@example.com", status: "inactive", last_login: null },
    });

    expect(row.email).toBe("existing@example.com");
    expect(row.status).toBe("active");
  });

  test("upsert supports setWhere and targetWhere fragments", async () => {
    await users().create({
      email: "fragment@example.com",
      status: "active",
      last_login: null,
    });

    const row = await users().upsert({
      where: { email: "fragment@example.com" },
      create: { email: "fragment@example.com", status: "inactive", last_login: null },
      update: { status: "inactive" },
      setWhere: sql`users.status = 'active'`,
    });

    expect(row.status).toBe("inactive");
  });

  test("update accepts SQL expression values", async () => {
    await users().create({
      email: "expr@example.com",
      status: "active",
      last_login: null,
    });

    const [row] = await users()
      .where({ email: "expr@example.com" })
      .update({ last_login: sql`now()` });

    expect(row?.last_login).toBeInstanceOf(Date);
  });

  test("bulk onConflict supports arbitrary SET expressions", async () => {
    await users().create({
      email: "set-expression@example.com",
      status: "active",
      last_login: null,
    });

    const rows = await users().createMany(
      [
        {
          email: "set-expression@example.com",
          status: "inactive",
          last_login: null,
        },
      ],
      {
        onConflict: {
          target: ["email"],
          set: { status: sql`'updated'` },
        },
      }
    );

    expect(rows[0]?.status).toBe("updated");
  });

  test("bulk onConflict rejects overlapping update and set columns", async () => {
    await expect(
      users().createMany([{ email: "overlap@example.com", status: "active", last_login: null }], {
        onConflict: {
          target: ["email"],
          update: ["status"],
          set: { status: sql`'updated'` },
        },
      })
    ).rejects.toThrow(Errors.INSERT.INVALID_CONFLICT);
  });

  test("writes can return computed fields", async () => {
    const created = await users().create(
      {
        email: "computed-write@example.com",
        status: "active",
        last_login: null,
      },
      { computed: { lower: sqlExpr<string>(sql`lower(email)`) } }
    );

    expect(created.lower).toBe("computed-write@example.com");

    const [updated] = await users()
      .where({ email: "computed-write@example.com" })
      .update({ status: "inactive" }, { computed: { upper: sqlExpr<string>(sql`upper(status)`) } });

    expect(updated?.upper).toBe("INACTIVE");

    const [deleted] = await users()
      .where({ email: "computed-write@example.com" })
      .delete({ computed: { lower: sqlExpr<string>(sql`lower(email)`) } });

    expect(deleted?.lower).toBe("computed-write@example.com");
  });

  test("create can skip conflicts with DO NOTHING", async () => {
    await users().create({
      email: "skip@example.com",
      status: "active",
      last_login: null,
    });

    const skipped = await users().create(
      { email: "skip@example.com", status: "inactive", last_login: null },
      { onConflict: "nothing" }
    );
    expect(skipped).toBeNull();

    const created = await users().create(
      { email: "not-skipped@example.com", status: "active", last_login: null },
      { onConflict: "nothing" }
    );
    expect(created?.email).toBe("not-skipped@example.com");
  });

  test("createMany returns computed fields", async () => {
    const rows = await users().createMany(
      [
        { email: "bulk-computed-a@example.com", status: "active", last_login: null },
        { email: "bulk-computed-b@example.com", status: "active", last_login: null },
      ],
      { computed: { lower: sqlExpr<string>(sql`lower(email)`) } }
    );

    expect(rows.map((row) => row.lower).sort()).toEqual([
      "bulk-computed-a@example.com",
      "bulk-computed-b@example.com",
    ]);
  });
});
