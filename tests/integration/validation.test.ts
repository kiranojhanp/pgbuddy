import type { Sql } from "postgres";
import { PgBuddyClient, Errors, QueryError, TableError } from "../../src";
import { startPglite } from "../helpers/pglite";

interface User {
  id: number;
  email: string;
  status: "active" | "inactive";
  last_login: Date | null;
}

describe("Table - validation", () => {
  let sql: Sql<{}>;
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
    expect(() => db.table<User>(" ")).toThrow(TableError);
  });

  test("strict table name validation rejects invalid identifiers", () => {
    expect(() => db.table<User>("users", { strictNames: true })).not.toThrow();
    expect(() => db.table<User>("user-profiles", { strictNames: true })).toThrow(
      TableError
    );
    expect(() => db.table<User>("public.users", { strictNames: true })).toThrow(
      TableError
    );
    expect(() =>
      db.table<User>("public.users", { strictNames: true, allowSchema: true })
    ).not.toThrow();
  });

  test("skip rejects negative values", () => {
    expect(() => db.table<User>("users").skip(-1)).toThrow(QueryError);
  });

  test("take rejects zero and negative values", () => {
    expect(() => db.table<User>("users").take(0)).toThrow(QueryError);
    expect(() => db.table<User>("users").take(-5)).toThrow(QueryError);
  });

  test("create rejects empty data object", async () => {
    await expect(
      db.table<User>("users").create({} as unknown as User)
    ).rejects.toThrow(Errors.INSERT.INVALID_DATA);
  });

  test("create rejects non-plain objects", async () => {
    await expect(
      db.table<User>("users").create([] as unknown as User)
    ).rejects.toThrow(Errors.INSERT.INVALID_DATA);

    await expect(
      db.table<User>("users").create(new Date() as unknown as User)
    ).rejects.toThrow(Errors.INSERT.INVALID_DATA);
  });

  test("createMany rejects empty array", async () => {
    await expect(
      db.table<User>("users").createMany([] as User[])
    ).rejects.toThrow(Errors.INSERT.INVALID_DATA);
  });

  test("createMany rejects inconsistent columns", async () => {
    await expect(
      db.table<User>("users").createMany([
        { id: 1001, email: "ada@example.com", status: "active", last_login: null },
        { id: 1002, email: "grace@example.com", last_login: null } as unknown as User,
      ])
    ).rejects.toThrow(Errors.INSERT.INCONSISTENT_COLUMNS);
  });

  test("update rejects missing where clause", async () => {
    await expect(
      db.table<User>("users").update({ status: "active" })
    ).rejects.toThrow(Errors.UPDATE.NO_CONDITIONS);
  });

  test("update rejects empty data object", async () => {
    await expect(
      db.table<User>("users").where({ email: "ada@example.com" }).update({} as Partial<User>)
    ).rejects.toThrow(Errors.UPDATE.INVALID_DATA);
  });

  test("update rejects invalid where clause", async () => {
    await expect(
      db.table<User>("users").where([] as unknown as any).update({ status: "active" })
    ).rejects.toThrow(Errors.UPDATE.NO_CONDITIONS);
  });

  test("delete rejects missing where clause", async () => {
    await expect(
      db.table<User>("users").delete()
    ).rejects.toThrow(Errors.DELETE.NO_CONDITIONS);
  });

  test("delete rejects invalid where clause", async () => {
    await expect(
      db.table<User>("users").where([] as unknown as any).delete()
    ).rejects.toThrow(Errors.DELETE.NO_CONDITIONS);
  });

  test("select rejects invalid column names", async () => {
    await sql`INSERT INTO users (email, status, last_login) VALUES ('ada@example.com', 'active', NULL);`;

    await expect(
      db.table<User>("users").select([""] as Array<keyof User>).findMany()
    ).rejects.toThrow(Errors.SELECT.INVALID_COLUMNS([""]));
  });

  test("tableWithInsert returns a usable table", () => {
    expect(() => db.tableWithInsert<User, "id">("users")).not.toThrow();
  });
});
