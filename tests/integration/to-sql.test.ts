import type { Sql } from "postgres";
import { z } from "zod";
import { PgBuddyClient, sqlExpr } from "../../src";
import { startPglite } from "../helpers/pglite";

const UserSchema = z.object({
  id: z.number().int(),
  email: z.string(),
  status: z.enum(["active", "inactive"]),
});

describe("toSQL", () => {
  let sql: Sql<Record<string, unknown>>;
  let stop: () => Promise<void>;
  let db: PgBuddyClient;

  beforeAll(async () => {
    const started = await startPglite();
    sql = started.sql;
    stop = started.stop;
    db = new PgBuddyClient(sql);
  });

  afterAll(async () => {
    await stop();
  });

  test("inspects a SELECT without executing it", () => {
    const query = db
      .table("users", UserSchema)
      .where({ status: "active" })
      .orderBy([{ column: "id", direction: "DESC" }])
      .take(5)
      .toSQL();

    expect(query.text).toContain("SELECT");
    expect(query.text).toContain('FROM "users"');
    expect(query.text).toContain("WHERE");
    expect(query.text).toContain("ORDER BY");
    expect(query.text).toContain("LIMIT $2");
    expect(query.parameters).toEqual(["active", 5]);
  });

  test("includes computed projections", () => {
    const query = db
      .table("users", UserSchema)
      .selectExpr({ lowerEmail: sqlExpr<string>(sql`lower(email)`) })
      .toSQL();

    expect(query.text).toContain("lower(email)");
    expect(query.text).toContain('AS "lowerEmail"');
  });
});
