import type { Sql } from "postgres";
import { z } from "zod";
import { and, Errors, eq, not, or, PgBuddyClient, QueryError, sqlExpr } from "../../src";
import { startPglite } from "../helpers/pglite";

describe("ZodTable", () => {
  let sql: Sql<Record<string, unknown>>;
  let stop: () => Promise<void>;
  let db: PgBuddyClient;

  const UserSchema = z.object({
    id: z.number().int(),
    email: z.email(),
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

    expect(() => users.where({ missing: "nope" } as unknown as Record<string, string>)).toThrow(
      Errors.WHERE.INVALID_FIELD("missing")
    );

    expect(() =>
      users.where({ id: "nope" } as unknown as Partial<z.infer<typeof UserSchema>>)
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
      users.where([{ field: "status", operator: "IN", value: ["active"] }]).findMany()
    ).resolves.toHaveLength(1);

    expect(() =>
      users.where([{ field: "id", operator: "IN", value: ["oops"] as unknown as number[] }])
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
      users.where([{ field: "email", operator: "LIKE", value: 123 as unknown as string }])
    ).toThrow(Errors.WHERE.INVALID_LIKE("email"));

    expect(() =>
      users.where([{ field: "last_login", operator: "IS NULL", value: null as never }])
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

  test("where rejects undefined values in object filters", () => {
    const users = db.table("users", UserSchema);
    expect(() => users.where({ email: undefined as unknown as string })).toThrow(
      Errors.WHERE.INVALID_FIELD("email")
    );
  });

  test("advanced where rejects empty IN list", () => {
    const users = db.table("users", UserSchema);
    expect(() => users.where([{ field: "id", operator: "IN", value: [] }])).toThrow(
      Errors.WHERE.INVALID_IN("id")
    );
  });

  test("update rejects unknown fields", async () => {
    const users = db.table("users", UserSchema);
    await users.create({
      id: 40,
      email: "unknown@example.com",
      status: "active",
      last_login: null,
    });

    await expect(
      users
        .where({ id: 40 })
        .update({ unknown: "nope" } as unknown as Partial<z.input<typeof UserSchema>>)
    ).rejects.toThrow(QueryError);
  });

  test("create rejects null for required fields", async () => {
    const users = db.table("users", UserSchema);
    await expect(
      users.create({
        id: 41,
        email: null as unknown as string,
        status: "active",
        last_login: null,
      })
    ).rejects.toThrow(QueryError);
  });

  test("createMany rejects empty arrays", async () => {
    const users = db.table("users", UserSchema);
    await expect(users.createMany([])).rejects.toThrow(QueryError);
  });

  test("where supports IS NULL without value", async () => {
    const users = db.table("users", UserSchema);
    await users.create({
      id: 50,
      email: "nullcheck@example.com",
      status: "active",
      last_login: null,
    });

    const results = await users.where([{ field: "last_login", operator: "IS NULL" }]).findMany();

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(50);
  });

  describe("projection and sorting validation", () => {
    test("select rejects columns outside the schema", () => {
      const users = db.table("users", UserSchema);
      const invalid = ["password_hash"] as unknown as Array<keyof z.infer<typeof UserSchema>>;

      expect(() => users.select(invalid)).toThrow(Errors.SELECT.INVALID_COLUMNS("password_hash"));
    });

    test("select allows '*' and schema columns", async () => {
      const users = db.table("users", UserSchema);
      await users.create({
        id: 50,
        email: "projection@example.com",
        status: "active",
        last_login: null,
      });

      const all = await users.select(["*"]).where({ id: 50 }).findMany();
      expect(all[0]?.email).toBe("projection@example.com");

      const projected = await users.select(["email"]).where({ id: 50 }).findMany();
      expect(projected[0]?.email).toBe("projection@example.com");
      expect("id" in (projected[0] ?? {})).toBe(false);
    });

    test("orderBy rejects columns outside the schema", () => {
      const users = db.table("users", UserSchema);
      const invalid = [{ column: "password_hash", direction: "ASC" }] as unknown as Array<{
        column: keyof z.infer<typeof UserSchema>;
        direction: "ASC" | "DESC";
      }>;

      expect(() => users.orderBy(invalid)).toThrow(Errors.SELECT.INVALID_COLUMNS("password_hash"));
    });

    test("orderBy validates direction eagerly", () => {
      const users = db.table("users", UserSchema);
      const invalid = [{ column: "id", direction: "UP" }] as unknown as Array<{
        column: keyof z.infer<typeof UserSchema>;
        direction: "ASC" | "DESC";
      }>;

      expect(() => users.orderBy(invalid)).toThrow(Errors.WHERE.INVALID_SORT);
    });

    test("select and orderBy reject non-array input", () => {
      const users = db.table("users", UserSchema);

      expect(() =>
        users.select("email" as unknown as Array<keyof z.infer<typeof UserSchema>>)
      ).toThrow(Errors.SELECT.INVALID_COLUMNS("email"));

      expect(() => users.orderBy("email" as unknown as [])).toThrow(
        Errors.SELECT.INVALID_SORT_SPEC
      );
    });
  });

  test("where rejects non-object conditions", () => {
    const users = db.table("users", UserSchema);

    expect(() => users.where(null as unknown as Partial<z.infer<typeof UserSchema>>)).toThrow(
      Errors.WHERE.INVALID_CONDITIONS
    );
    expect(() => users.where(new Date() as unknown as Partial<z.infer<typeof UserSchema>>)).toThrow(
      Errors.WHERE.INVALID_CONDITIONS
    );
  });

  test("where rejects invalid array entries", () => {
    const users = db.table("users", UserSchema);

    expect(() =>
      users.where([null] as unknown as Array<{ field: "id"; operator: "="; value: number }>)
    ).toThrow(Errors.WHERE.INVALID_CONDITIONS);
  });

  test("createMany rejects non-array input", async () => {
    const users = db.table("users", UserSchema);
    await expect(users.createMany(null as unknown as [])).rejects.toThrow(
      Errors.INSERT.INVALID_DATA
    );
  });

  test("mutating validated where conditions does not change the query", async () => {
    const users = db.table("users", UserSchema);
    await users.create({
      id: 60,
      email: "snapshot@example.com",
      status: "active",
      last_login: null,
    });

    const conditions: Array<{ field: "status"; operator: "="; value: string }> = [
      { field: "status", operator: "=", value: "active" },
    ];
    const query = users.where(conditions);
    conditions[0] = { field: "status", operator: "=", value: "inactive" };

    await expect(query.findMany()).resolves.toHaveLength(1);
  });

  test("predicates validate fields and values against the schema", async () => {
    const users = db.table("users", UserSchema);

    expect(() => users.where(eq("missing" as "id", 1))).toThrow(
      Errors.WHERE.INVALID_FIELD("missing")
    );

    expect(() => users.where(eq("id", "nope" as unknown as number))).toThrow(QueryError);
  });

  test("predicates compose with schema validation", async () => {
    const users = db.table("users", UserSchema);
    await users.create({
      id: 70,
      email: "predicate@example.com",
      status: "active",
      last_login: null,
    });

    const rows = await users
      .where(and(eq("status", "active"), not(eq("id", 999))))
      .where(or(eq("id", 70), eq("id", 71)))
      .findMany();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe("predicate@example.com");
  });

  test("whereRaw bypasses schema validation", async () => {
    const users = db.table("users", UserSchema);
    await users.create({
      id: 80,
      email: "raw@example.com",
      status: "inactive",
      last_login: null,
    });

    const rows = await users.whereRaw(sql`status = 'inactive'`).findMany();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe("raw@example.com");
  });

  test("upsert validates create and update data", async () => {
    const users = db.table("users", UserSchema);

    const created = await users.upsert({
      where: { id: 90 },
      create: { id: 90, email: "upsert@example.com", status: "active", last_login: null },
      update: { status: "inactive" },
    });
    expect(created.status).toBe("active");

    const updated = await users.upsert({
      where: { id: 90 },
      create: { id: 90, email: "upsert@example.com", status: "active", last_login: null },
      update: { status: "inactive" },
    });
    expect(updated.status).toBe("inactive");
  });

  test("distinctOn and cursor validate schema columns", () => {
    const users = db.table("users", UserSchema);

    expect(() =>
      users.distinctOn(["missing"] as unknown as Array<keyof z.infer<typeof UserSchema>>)
    ).toThrow(Errors.SELECT.INVALID_COLUMNS("missing"));

    expect(() =>
      users.cursor({ missing: 1 } as unknown as Partial<z.infer<typeof UserSchema>>)
    ).toThrow(Errors.SELECT.INVALID_COLUMNS("missing"));
  });

  test("distinct and cursor compose with schema validation", async () => {
    const users = db.table("users", UserSchema);
    await users.create({
      id: 91,
      email: "set@example.com",
      status: "active",
      last_login: null,
    });

    const distinctRows = await users.select(["status"]).distinct().findMany();
    expect(distinctRows.length).toBeGreaterThan(0);

    const cursorRows = await users
      .orderBy([{ column: "id", direction: "ASC" }])
      .cursor({ id: 0 })
      .findMany();
    expect(cursorRows.length).toBeGreaterThan(0);
  });

  test("ZodTable exposes exists, aggregate, and raw ordering", async () => {
    const users = db.table("users", UserSchema);
    await users.create({
      id: 100,
      email: "b@example.com",
      status: "active",
      last_login: null,
    });
    await users.create({
      id: 101,
      email: "a@example.com",
      status: "inactive",
      last_login: null,
    });

    await expect(users.where({ id: 100 }).exists()).resolves.toBe(true);
    await expect(users.where({ id: 999 }).exists()).resolves.toBe(false);

    const aggregate = await users.aggregate({ count: true, countDistinct: ["status"] });
    expect(aggregate.count).toBeGreaterThanOrEqual(2);
    expect(aggregate.countDistinct.status).toBeGreaterThanOrEqual(2);

    const ordered = await users.orderByRaw(sql`lower(email) ASC`).select(["email"]).findMany();
    const emails = ordered.map((row) => row.email);
    expect(emails).toEqual([...emails].sort());
  });

  test("ZodTable exposes count-returning updates and deletes", async () => {
    const users = db.table("users", UserSchema);
    await users.create({
      id: 102,
      email: "count@example.com",
      status: "active",
      last_login: null,
    });

    const updated = await users
      .where({ id: 102 })
      .update({ status: "inactive" }, { returning: false });
    expect(updated).toBe(1);

    const deleted = await users.where({ id: 102 }).delete({ returning: false });
    expect(deleted).toBe(1);
  });

  test("ZodTable upsert supports an omitted update and conflict fragments", async () => {
    const users = db.table("users", UserSchema);
    await users.create({
      id: 103,
      email: "upsert-options@example.com",
      status: "active",
      last_login: null,
    });

    const existing = await users.upsert({
      where: { id: 103 },
      create: {
        id: 103,
        email: "upsert-options@example.com",
        status: "inactive",
        last_login: null,
      },
    });
    expect(existing.status).toBe("active");

    const updated = await users.upsert({
      where: { id: 103 },
      create: {
        id: 103,
        email: "upsert-options@example.com",
        status: "inactive",
        last_login: null,
      },
      update: { status: "inactive" },
      setWhere: sql`users.status = 'active'`,
    });
    expect(updated.status).toBe("inactive");
  });

  test("ZodTable createMany supports onConflict updates", async () => {
    const users = db.table("users", UserSchema);
    await users.create({
      id: 104,
      email: "conflict@example.com",
      status: "active",
      last_login: null,
    });

    const rows = await users.createMany(
      [
        { id: 104, email: "conflict@example.com", status: "inactive", last_login: null },
        { id: 105, email: "new@example.com", status: "active", last_login: null },
      ],
      { onConflict: { target: ["id"], update: ["status"] } }
    );

    expect(rows).toHaveLength(2);
    expect((await users.where({ id: 104 }).findFirst())?.status).toBe("inactive");
  });

  test("computed fields compose with schema validation", async () => {
    const users = db.table("users", UserSchema);
    await users.create({
      id: 110,
      email: "Computed@Example.com",
      status: "active",
      last_login: null,
    });

    const rows = await users.findMany({
      computed: {
        lowerEmail: sqlExpr<string>(sql`lower(email)`),
      },
    });

    expect(rows.some((row) => row.lowerEmail === "computed@example.com")).toBe(true);

    const first = await users
      .where({ id: 110 })
      .findFirst({ computed: { upperEmail: sqlExpr<string>(sql`upper(email)`) } });
    expect(first?.upperEmail).toBe("COMPUTED@EXAMPLE.COM");
  });

  test("selectExpr is chainable on ZodTable", async () => {
    const users = db.table("users", UserSchema);
    await users.create({
      id: 111,
      email: "Chain@Example.com",
      status: "active",
      last_login: null,
    });

    const rows = await users
      .selectExpr({ lowerEmail: sqlExpr<string>(sql`lower(email)`) })
      .where({ id: 111 })
      .orderBy([{ column: "id", direction: "ASC" }])
      .findMany();

    expect(rows[0]?.lowerEmail).toBe("chain@example.com");
  });

  test("ZodTable writes can return computed fields", async () => {
    const users = db.table("users", UserSchema);
    const created = await users.create(
      {
        id: 120,
        email: "ComputedWrite@Example.com",
        status: "active",
        last_login: null,
      },
      { computed: { lowerEmail: sqlExpr<string>(sql`lower(email)`) } }
    );

    expect(created.lowerEmail).toBe("computedwrite@example.com");

    const [updated] = await users
      .where({ id: 120 })
      .update(
        { status: "inactive" },
        { computed: { upperStatus: sqlExpr<string>(sql`upper(status)`) } }
      );

    expect(updated?.upperStatus).toBe("INACTIVE");
  });

  test("ZodTable groupBy validates columns", async () => {
    const users = db.table("users", UserSchema);
    await users.create({
      id: 130,
      email: "group-a@example.com",
      status: "active",
      last_login: null,
    });
    await users.create({
      id: 131,
      email: "group-b@example.com",
      status: "inactive",
      last_login: null,
    });

    const rows = await users
      .groupBy(["status"], { count: sqlExpr<number>(sql`count(*)::int`) })
      .orderBy([{ column: "status", direction: "ASC" }])
      .findMany();

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => typeof row.status === "string")).toBe(true);
    expect(rows.every((row) => typeof row.count === "number")).toBe(true);
  });
});
