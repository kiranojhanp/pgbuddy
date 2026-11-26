import type { Sql } from "postgres";
import * as v from "valibot";
import * as yup from "yup";
import { PgBuddyClient, QueryError } from "../../src";
import { valibotValidator } from "../../src/adapters/valibot";
import { yupValidator } from "../../src/adapters/yup";
import { startPglite } from "../helpers/pglite";

describe("Valibot and Yup adapters", () => {
  let sql: Sql<Record<string, unknown>>;
  let stop: () => Promise<void>;
  let db: PgBuddyClient;

  beforeAll(async () => {
    const started = await startPglite();
    sql = started.sql;
    stop = started.stop;
    db = new PgBuddyClient(sql);

    await sql`DROP TABLE IF EXISTS valibot_users;`;
    await sql`DROP TABLE IF EXISTS yup_users;`;
    await sql`CREATE TABLE valibot_users (id INTEGER PRIMARY KEY, email TEXT NOT NULL, status TEXT NOT NULL);`;
    await sql`CREATE TABLE yup_users (id INTEGER PRIMARY KEY, email TEXT NOT NULL, status TEXT NOT NULL);`;
  });

  afterAll(async () => {
    await sql`DROP TABLE IF EXISTS valibot_users;`;
    await sql`DROP TABLE IF EXISTS yup_users;`;
    await stop();
  });

  test("validates through Valibot", async () => {
    const schema = v.object({
      id: v.number(),
      email: v.pipe(v.string(), v.email()),
      status: v.picklist(["active", "inactive"]),
    });

    const users = db.tableWithValidator("valibot_users", schema, valibotValidator);

    const created = await users.create({ id: 1, email: "ada@example.com", status: "active" });
    expect(created.email).toBe("ada@example.com");

    const [updated] = (await users.where({ id: 1 }).update({ status: "inactive" })) as Array<{
      status: string;
    }>;
    expect(updated?.status).toBe("inactive");

    await expect(users.create({ id: 2, email: "bad", status: "active" })).rejects.toBeInstanceOf(
      QueryError
    );
  });

  test("validates through Yup", async () => {
    const schema = yup.object({
      id: yup.number().required(),
      email: yup.string().email().required(),
      status: yup.string().oneOf(["active", "inactive"]).required(),
    });

    const users = db.tableWithValidator("yup_users", schema, yupValidator);

    const created = await users.create({ id: 1, email: "grace@example.com", status: "active" });
    expect(created.email).toBe("grace@example.com");

    await expect(users.create({ id: 2, email: "bad", status: "active" })).rejects.toBeInstanceOf(
      QueryError
    );
  });
});
