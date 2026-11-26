import type { Sql } from "postgres";
import { z } from "zod";
import { PgBuddyClient, sqlExpr } from "../../src";
import { startPglite } from "../helpers/pglite";

const UserSchema = z.object({
  id: z.number().int(),
  email: z.string(),
  fullName: z.string(),
  status: z.enum(["active", "inactive"]),
  createdAt: z.date(),
});

describe("column mapping", () => {
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
        email TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
    `;
  });

  afterAll(async () => {
    await sql`DROP TABLE IF EXISTS users;`;
    await stop();
  });

  const users = () =>
    db.table("users", UserSchema, {
      columnMap: {
        fullName: "full_name",
        createdAt: "created_at",
      },
    });

  test("maps writes, reads, filters, ordering, aggregates, and grouping", async () => {
    const created = await users().create({
      id: 1,
      email: "ada@example.com",
      fullName: "Ada Lovelace",
      status: "active",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });

    expect(created.fullName).toBe("Ada Lovelace");

    await users().createMany([
      {
        id: 2,
        email: "grace@example.com",
        fullName: "Grace Hopper",
        status: "active",
        createdAt: new Date("2026-01-02T00:00:00Z"),
      },
    ]);

    const found = await users().where({ fullName: "Ada Lovelace" }).findFirst();
    expect(found?.fullName).toBe("Ada Lovelace");

    const ordered = await users()
      .select(["fullName", "createdAt"])
      .orderBy([{ column: "createdAt", direction: "ASC" }])
      .findMany();

    expect(ordered.map((row) => row.fullName)).toEqual(["Ada Lovelace", "Grace Hopper"]);
    expect(ordered[0]?.createdAt).toBeInstanceOf(Date);

    const omitted = await users().omit(["createdAt"]).findMany();
    expect(omitted[0]).not.toHaveProperty("created_at");
    expect(omitted[0]?.fullName).toBe("Ada Lovelace");

    const aggregated = await users().aggregate({
      count: true,
      countDistinct: ["fullName"],
      sum: ["id"],
    });
    expect(aggregated.countDistinct.fullName).toBe(2);
    expect(aggregated.sum.id).toBe(3);

    const grouped = await users()
      .groupBy(["status"], { count: sqlExpr<number>(sql`count(*)::int`) })
      .findMany();
    expect(grouped).toEqual([{ status: "active", count: 2 }]);

    const distinct = await users()
      .select(["status"])
      .distinctOn(["status"])
      .orderBy([{ column: "status", direction: "ASC" }])
      .findMany();
    expect(distinct).toEqual([{ status: "active" }]);

    const cursor = await users()
      .orderBy([{ column: "createdAt", direction: "ASC" }])
      .cursor({ createdAt: new Date("2026-01-01T00:00:00Z") })
      .findMany();
    expect(cursor.map((row) => row.fullName)).toEqual(["Grace Hopper"]);

    const [updated] = await users()
      .where({ email: "grace@example.com" })
      .update({ fullName: "Grace Brewster Hopper" });
    expect(updated?.fullName).toBe("Grace Brewster Hopper");

    const upserted = await users().upsert({
      where: { email: "ada@example.com" },
      create: {
        id: 3,
        email: "ada@example.com",
        fullName: "Should Not Insert",
        status: "inactive",
        createdAt: new Date(),
      },
      update: { fullName: "Ada King" },
    });
    expect(upserted.fullName).toBe("Ada King");
  });
});
