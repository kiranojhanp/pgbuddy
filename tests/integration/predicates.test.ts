import type { Sql } from "postgres";
import {
  and,
  between,
  contains,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  not,
  notBetween,
  notInArray,
  or,
  PgBuddyClient,
  startsWith,
} from "../../src";
import { startPglite } from "../helpers/pglite";

interface User {
  id: number;
  email: string;
  status: "active" | "inactive";
  last_login: Date | null;
}

describe("predicates", () => {
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
    await sql`TRUNCATE users RESTART IDENTITY;`;
    await sql`
      INSERT INTO users (email, status, last_login)
      VALUES
        ('ada@example.com', 'active', NULL),
        ('grace@example.com', 'active', NOW()),
        ('linus@corp.com', 'inactive', NULL),
        ('100%@example.com', 'active', NULL);
    `;
  });

  const users = () => db.table<User>("users");

  test("eq / or", async () => {
    const rows = await users()
      .where(or(eq("email", "ada@example.com"), eq("email", "linus@corp.com")))
      .findMany();

    expect(rows).toHaveLength(2);
  });

  test("and / not", async () => {
    const rows = await users()
      .where(and(eq("status", "active"), not(eq("email", "grace@example.com"))))
      .findMany();

    expect(rows.map((row) => row.email).sort()).toEqual(["100%@example.com", "ada@example.com"]);
  });

  test("comparison operators", async () => {
    const rows = await users()
      .where(and(gt("id", 1), lte("id", 3), ne("email", "grace@example.com")))
      .findMany();

    expect(rows.map((row) => row.id)).toEqual([3]);
  });

  test("lt / gte / between / notBetween", async () => {
    expect(await users().where(lt("id", 2)).findMany()).toHaveLength(1);
    expect(await users().where(gte("id", 3)).findMany()).toHaveLength(2);
    expect(
      await users()
        .where(between("id", 2, 3))
        .findMany()
    ).toHaveLength(2);
    expect(
      await users()
        .where(notBetween("id", 2, 3))
        .findMany()
    ).toHaveLength(2);
  });

  test("inArray / notInArray", async () => {
    expect(
      await users()
        .where(inArray("email", ["ada@example.com", "linus@corp.com"]))
        .findMany()
    ).toHaveLength(2);

    expect(
      await users()
        .where(notInArray("email", ["ada@example.com", "linus@corp.com"]))
        .findMany()
    ).toHaveLength(2);
  });

  test("isNull / isNotNull", async () => {
    expect(await users().where(isNull("last_login")).findMany()).toHaveLength(3);
    expect(await users().where(isNotNull("last_login")).findMany()).toHaveLength(1);
  });

  test("like uses SQL wildcard semantics", async () => {
    const rows = await users().where(like("email", "%@corp.com")).findMany();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe("linus@corp.com");
  });

  test("contains / startsWith escape wildcard characters", async () => {
    const containsRows = await users().where(contains("email", "100%")).findMany();
    expect(containsRows).toHaveLength(1);
    expect(containsRows[0]?.email).toBe("100%@example.com");

    const startsWithRows = await users().where(startsWith("email", "ada")).findMany();
    expect(startsWithRows).toHaveLength(1);
    expect(startsWithRows[0]?.email).toBe("ada@example.com");
  });

  test("repeated where calls are combined with AND", async () => {
    const rows = await users()
      .where({ status: "active" })
      .where({ email: "ada@example.com" })
      .findMany();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe("ada@example.com");
  });

  test("predicates compose with object conditions", async () => {
    const rows = await users()
      .where({ status: "active" })
      .where(or(eq("email", "ada@example.com"), eq("email", "linus@corp.com")))
      .findMany();

    expect(rows.map((row) => row.email)).toEqual(["ada@example.com"]);
  });

  test("whereRaw adds a raw fragment", async () => {
    const rows = await users().whereRaw(sql`status = 'inactive'`).findMany();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe("linus@corp.com");
  });

  test("update and delete accept predicates", async () => {
    const updated = await users()
      .where(or(eq("email", "ada@example.com"), eq("email", "grace@example.com")))
      .update({ status: "inactive" });

    expect(updated).toHaveLength(2);

    const deleted = await users().where(eq("email", "linus@corp.com")).delete();
    expect(deleted).toHaveLength(1);
  });

  test("predicate helpers reject invalid values", () => {
    expect(() => eq("email", null as unknown as string)).toThrow();
    expect(() => inArray("email", [])).toThrow();
    expect(() => between("id", null as unknown as number, 3)).toThrow();
  });
});
