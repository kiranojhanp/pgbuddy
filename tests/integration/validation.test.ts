import type { Sql } from "postgres";
import { Errors, PgBuddyClient, QueryError, TableError } from "../../src";
import { startPglite } from "../helpers/pglite";
import { UserSchema } from "../helpers/schemas";

interface User {
  id: number;
  email: string;
  status: "active" | "inactive";
  last_login: Date | null;
}

describe("Table - validation", () => {
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
  });

  test("table name validation rejects blank strings", () => {
    expect(() => db.table(" ", UserSchema)).toThrow(TableError);
  });

  test("strict table name validation rejects invalid identifiers", () => {
    expect(() => db.table("users", UserSchema, { strictNames: true })).not.toThrow();
    expect(() => db.table("user-profiles", UserSchema, { strictNames: true })).toThrow(TableError);
    expect(() => db.table("public.users", UserSchema, { strictNames: true })).toThrow(TableError);
    expect(() =>
      db.table("public.users", UserSchema, { strictNames: true, allowSchema: true })
    ).not.toThrow();
  });

  test("skip rejects negative values", () => {
    expect(() => db.table("users", UserSchema).skip(-1)).toThrow(QueryError);
  });

  test("take rejects zero and negative values", () => {
    expect(() => db.table("users", UserSchema).take(0)).toThrow(QueryError);
    expect(() => db.table("users", UserSchema).take(-5)).toThrow(QueryError);
  });

  test("create rejects empty data object", async () => {
    await expect(db.table("users", UserSchema).create({} as unknown as User)).rejects.toMatchObject(
      { code: "INVALID_DATA" }
    );
  });

  test("create rejects non-plain objects", async () => {
    await expect(db.table("users", UserSchema).create([] as unknown as User)).rejects.toMatchObject(
      { code: "INVALID_DATA" }
    );

    await expect(
      db.table("users", UserSchema).create(new Date() as unknown as User)
    ).rejects.toMatchObject({ code: "INVALID_DATA" });
  });

  test("createMany rejects empty array", async () => {
    await expect(db.table("users", UserSchema).createMany([] as User[])).rejects.toThrow(
      Errors.INSERT.INVALID_DATA
    );
  });

  test("createMany validates every record", async () => {
    await expect(
      db
        .table("users", UserSchema)
        .createMany([
          { id: 1001, email: "ada@example.com", status: "active", last_login: null },
          { id: 1002, email: "grace@example.com", last_login: null } as unknown as User,
        ])
    ).rejects.toMatchObject({ code: "INVALID_DATA" });
  });

  test("update rejects missing where clause", async () => {
    await expect(db.table("users", UserSchema).update({ status: "active" })).rejects.toThrow(
      Errors.UPDATE.NO_CONDITIONS
    );
  });

  test("update rejects empty data object", async () => {
    await expect(
      db
        .table("users", UserSchema)
        .where({ email: "ada@example.com" })
        .update({} as Partial<User>)
    ).rejects.toThrow(Errors.UPDATE.INVALID_DATA);
  });

  test("update rejects invalid where clause", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: intentional invalid input for negative test
    const invalidWhere = [] as unknown as any;
    await expect(
      db.table("users", UserSchema).where(invalidWhere).update({ status: "active" })
    ).rejects.toThrow(Errors.UPDATE.NO_CONDITIONS);
  });

  test("delete rejects missing where clause", async () => {
    await expect(db.table("users", UserSchema).delete()).rejects.toThrow(
      Errors.DELETE.NO_CONDITIONS
    );
  });

  test("delete rejects invalid where clause", async () => {
    await expect(
      db
        .table("users", UserSchema)
        // biome-ignore lint/suspicious/noExplicitAny: intentional invalid input for negative test
        .where([] as unknown as any)
        .delete()
    ).rejects.toThrow(Errors.DELETE.NO_CONDITIONS);
  });

  test("select rejects invalid column names", async () => {
    await sql`INSERT INTO users (email, status, last_login) VALUES ('ada@example.com', 'active', NULL);`;

    expect(() =>
      db.table("users", UserSchema).select([""] as unknown as Array<keyof User>)
    ).toThrow(QueryError);
  });

  test("table requires a schema and returns a usable table", () => {
    expect(() => db.table("users", UserSchema)).not.toThrow();
    expect(() => (db.table as unknown as (name: string) => unknown)("users")).toThrow(TableError);
  });
});
