import postgres from "postgres";
import { z } from "zod";
import { PgBuddyClient } from "../../src";
import { startPglite } from "../helpers/pglite";

const UserSchema = z.object({
  id: z.number().optional(),
  fullName: z.string(),
  createdAt: z.date(),
});

describe("postgres.js camelCase transform", () => {
  let stop: () => Promise<void>;

  beforeAll(() => {
    // The helper is started per test below; this suite needs its own transform.
  });

  afterAll(async () => {
    await stop?.();
  });

  test("maps camelCase fields to snake_case columns", async () => {
    const started = await startPglite({ transform: postgres.camel });
    stop = started.stop;
    const sql = started.sql;

    await sql`create table users (id serial primary key, full_name text not null, created_at timestamptz not null)`;

    const db = new PgBuddyClient(sql);
    const users = db.table("users", UserSchema);

    const created = await users.create({
      fullName: "Ada Lovelace",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });

    expect(created.fullName).toBe("Ada Lovelace");

    const found = await users.where({ fullName: "Ada Lovelace" }).findFirst();
    expect(found?.fullName).toBe("Ada Lovelace");
    expect(found?.createdAt).toBeInstanceOf(Date);

    await users.where({ fullName: "Ada Lovelace" }).update({ fullName: "Ada L." });

    const updated = await users.where({ id: created.id as number }).findFirst();
    expect(updated?.fullName).toBe("Ada L.");

    const ordered = await users
      .orderBy([{ column: "createdAt", direction: "ASC", nulls: "last" }])
      .findMany();
    expect(ordered).toHaveLength(1);

    const counts = await users.aggregate({ count: true, countDistinct: ["fullName"] });
    expect(counts.count).toBe(1);
    expect(counts.countDistinct.fullName).toBe(1);

    await sql`drop table users`;
  });
});
