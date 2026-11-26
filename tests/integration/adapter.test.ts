import type { Sql } from "postgres";
import { PgBuddyClient, QueryError, sqlExpr, type ValidationAdapter } from "../../src";
import { startPglite } from "../helpers/pglite";

interface User {
  id: number;
  email: string;
  status: "active" | "inactive";
}

type UserInput = User;

const adapter: ValidationAdapter<User, UserInput> = {
  __pgbuddyAdapter: true,
  fields: ["id", "email", "status"],
  parse(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { success: false, error: "expected an object" };
    }
    const input = value as Partial<User>;
    if (typeof input.id !== "number") return { success: false, error: "id must be a number" };
    if (typeof input.email !== "string" || !input.email.includes("@")) {
      return { success: false, error: "email must be an email" };
    }
    if (input.status !== "active" && input.status !== "inactive") {
      return { success: false, error: "status must be active or inactive" };
    }
    return {
      success: true,
      data: { id: input.id, email: input.email, status: input.status },
    };
  },
  parsePartial(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { success: false, error: "expected an object" };
    }
    const input = value as Partial<User>;
    if (input.email !== undefined && typeof input.email !== "string") {
      return { success: false, error: "email must be a string" };
    }
    if (input.status !== undefined && input.status !== "active" && input.status !== "inactive") {
      return { success: false, error: "status must be active or inactive" };
    }
    return { success: true, data: input };
  },
};

describe("validation adapter table", () => {
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

  const users = () => db.tableWithAdapter("users", adapter, { unique: [["email"]] });

  test("validates and runs CRUD through a custom adapter", async () => {
    const created = await users().create({
      id: 1,
      email: "ada@example.com",
      status: "active",
    });
    expect(created).toEqual({ id: 1, email: "ada@example.com", status: "active" });

    const found = await users().where({ email: "ada@example.com" }).findFirst();
    expect(found?.id).toBe(1);

    const [updated] = (await users().where({ id: 1 }).update({ status: "inactive" })) as User[];
    expect(updated?.status).toBe("inactive");

    const multiple = await users().createMany([
      { id: 2, email: "grace@example.com", status: "active" },
      { id: 3, email: "linus@example.com", status: "active" },
    ]);
    expect(multiple.map((row) => row.id)).toEqual([2, 3]);

    const upserted = await users().upsert({
      where: { email: "ada@example.com" },
      create: { id: 1, email: "ada@example.com", status: "active" },
      update: { status: "active" },
    });
    expect(upserted.status).toBe("active");
  });

  test("rejects invalid writes with the adapter error", async () => {
    await expect(
      users().create({ id: 1, email: "not-an-email", status: "active" })
    ).rejects.toThrow(QueryError);

    await expect(
      users().create({ id: 1, email: "ada@example.com", status: "bogus" as never })
    ).rejects.toThrow(QueryError);
  });

  test("supports aggregates, grouping, computed fields, joins, and omit", async () => {
    await users().createMany([
      { id: 1, email: "ada@example.com", status: "active" },
      { id: 2, email: "grace@example.com", status: "active" },
      { id: 3, email: "linus@example.com", status: "inactive" },
    ]);

    const totals = await users().aggregate({ count: true, countDistinct: ["status"] });
    expect(totals.count).toBe(3);
    expect(totals.countDistinct.status).toBe(2);

    const grouped = await users()
      .groupBy(["status"], { count: sqlExpr<number>(sql`count(*)::int`) })
      .orderBy([{ column: "status", direction: "ASC" }])
      .findMany();
    expect(grouped).toEqual([
      { status: "active", count: 2 },
      { status: "inactive", count: 1 },
    ]);

    const computed = await users()
      .where({ id: 1 })
      .selectExpr({ lowerEmail: sqlExpr<string>(sql`lower(email)`) })
      .findMany();
    expect(computed[0]?.lowerEmail).toBe("ada@example.com");

    const omitted = await users().omit(["email"]).where({ id: 1 }).findMany();
    expect(omitted[0]).not.toHaveProperty("email");

    const joined = await users()
      .innerJoin("manager", {
        table: "users",
        alias: "manager",
        columns: ["id", "email", "status"],
        on: sql`"manager"."id" = "users"."id"`,
      })
      .whereRaw(sql`"users"."id" = 1`)
      .findMany();
    expect(joined[0]?.manager.email).toBe("ada@example.com");
  });
});
