import type { Sql } from "postgres";
import { PgBuddyClient, QueryError, sqlExpr, type ValidatorAdapter } from "../../src";
import { startPglite } from "../helpers/pglite";

interface User {
  id: number;
  email: string;
  status: "active" | "inactive";
}

const UserSchema = {
  _output: {} as User,
  _input: {} as User,
};

function parseFull(value: unknown): User {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected an object");
  }
  const input = value as Partial<User>;
  if (typeof input.id !== "number") throw new Error("id must be a number");
  if (typeof input.email !== "string" || !input.email.includes("@")) {
    throw new Error("email must be an email");
  }
  if (input.status !== "active" && input.status !== "inactive") {
    throw new Error("status must be active or inactive");
  }
  return { id: input.id, email: input.email, status: input.status };
}

function parsePartial(value: unknown): Partial<User> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected an object");
  }
  const input = value as Partial<User>;
  if (input.email !== undefined && typeof input.email !== "string") {
    throw new Error("email must be a string");
  }
  if (input.status !== undefined && input.status !== "active" && input.status !== "inactive") {
    throw new Error("status must be active or inactive");
  }
  return input;
}

const adapter: ValidatorAdapter = {
  fields: () => ["id", "email", "status"],
  parse: (_schema, value) => parseFull(value),
  parsePartial: (_schema, value) => parsePartial(value),
};

describe("validation adapter table", () => {
  let sql: Sql<Record<string, unknown>>;
  let stop: () => Promise<void>;
  let db: PgBuddyClient;

  beforeAll(async () => {
    const started = await startPglite();
    sql = started.sql;
    stop = started.stop;
    db = new PgBuddyClient(sql, { adapter });

    await sql`DROP TABLE IF EXISTS comments;`;
    await sql`DROP TABLE IF EXISTS posts;`;
    await sql`DROP TABLE IF EXISTS users;`;
    await sql`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL
      );
    `;
    await sql`
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL
      );
    `;
    await sql`
      CREATE TABLE comments (
        id INTEGER PRIMARY KEY,
        post_id INTEGER NOT NULL,
        body TEXT NOT NULL
      );
    `;
  });

  afterAll(async () => {
    await sql`DROP TABLE IF EXISTS comments;`;
    await sql`DROP TABLE IF EXISTS posts;`;
    await sql`DROP TABLE IF EXISTS users;`;
    await stop();
  });

  beforeEach(async () => {
    await sql`TRUNCATE users;`;
  });

  const users = () => db.table("users", UserSchema, { unique: [["email"]] });

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

    const having = await users()
      .groupBy(["status"], { count: sqlExpr<number>(sql`count(*)::int`) })
      .having({ count: { gt: 1 } })
      .findMany();
    expect(having).toEqual([{ status: "active", count: 2 }]);

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

  test("supports adapter relations and counts", async () => {
    const usersWithRelations = () =>
      db.table("users", UserSchema, {
        unique: [["email"]],
        adapterRelations: {
          posts: {
            table: "posts",
            fields: ["id", "user_id", "title"],
            localKey: "id",
            foreignKey: "user_id",
            relation: "many",
            relations: {
              comments: {
                table: "comments",
                fields: ["id", "post_id", "body"],
                localKey: "id",
                foreignKey: "post_id",
                relation: "many",
              },
            },
          },
        },
      });

    await usersWithRelations().create({
      id: 1,
      email: "ada@example.com",
      status: "active",
    });
    await sql`INSERT INTO posts (id, user_id, title) VALUES (10, 1, 'First')`;
    await sql`INSERT INTO comments (id, post_id, body) VALUES (100, 10, 'Nested')`;

    const rows = await usersWithRelations().include("posts").withCount("posts").findMany();

    expect(rows[0]?.posts[0]?.title).toBe("First");
    expect(rows[0]?.posts_count).toBe(1);

    const comments = rows[0]?.posts[0]?.comments as Array<Record<string, unknown>> | undefined;
    expect(comments?.[0]?.body).toBe("Nested");
  });
});
