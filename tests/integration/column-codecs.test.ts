import type { Sql } from "postgres";
import { z } from "zod";
import { PgBuddyClient } from "../../src";
import { startPglite } from "../helpers/pglite";

const ProductSchema = z.object({
  id: z.number().int(),
  price: z.number(),
  metadata: z.object({ color: z.string() }),
});

describe("column codecs", () => {
  let sql: Sql<Record<string, unknown>>;
  let stop: () => Promise<void>;
  let db: PgBuddyClient;

  beforeAll(async () => {
    const started = await startPglite();
    sql = started.sql;
    stop = started.stop;
    db = new PgBuddyClient(sql);

    await sql`DROP TABLE IF EXISTS products;`;
    await sql`
      CREATE TABLE products (
        id INTEGER PRIMARY KEY,
        price_cents INTEGER NOT NULL,
        metadata TEXT NOT NULL
      );
    `;
  });

  afterAll(async () => {
    await sql`DROP TABLE IF EXISTS products;`;
    await stop();
  });

  const products = () =>
    db.table("products", ProductSchema, {
      columnMap: { price: "price_cents" },
      columnCodecs: {
        price: {
          encode: (value) => Math.round(Number(value) * 100),
          decode: (value) => Number(value) / 100,
        },
        metadata: {
          encode: (value) => JSON.stringify(value),
          decode: (value) => JSON.parse(String(value)),
        },
      },
    });

  test("encodes writes and filters, decodes results", async () => {
    const created = await products().create({
      id: 1,
      price: 1.5,
      metadata: { color: "red" },
    });

    expect(created.price).toBe(1.5);
    expect(created.metadata).toEqual({ color: "red" });

    const raw = await sql<{ price_cents: number; metadata: string }[]>`
      SELECT price_cents, metadata FROM products WHERE id = 1
    `;
    expect(raw[0]?.price_cents).toBe(150);
    expect(JSON.parse(raw[0]?.metadata ?? "{}")).toEqual({ color: "red" });

    const equality = await products().where({ price: 1.5 }).findMany();
    expect(equality.map((row) => row.id)).toEqual([1]);

    const comparison = await products()
      .where([{ field: "price", operator: ">=", value: 0.5 }])
      .findMany();
    expect(comparison.map((row) => row.id)).toEqual([1]);

    const [updated] = await products()
      .where({ id: 1 })
      .update({ price: 2, metadata: { color: "blue" } });
    expect(updated?.price).toBe(2);
    expect(updated?.metadata).toEqual({ color: "blue" });

    const many = await products().createMany([
      { id: 2, price: 3, metadata: { color: "green" } },
      { id: 3, price: 4, metadata: { color: "black" } },
    ]);
    expect(many.map((row) => row.price)).toEqual([3, 4]);

    const cursor = await products()
      .orderBy([{ column: "price", direction: "ASC" }])
      .cursor({ price: 2 })
      .findMany();
    expect(cursor.map((row) => row.id)).toEqual([2, 3]);

    const upserted = await products().upsert({
      where: { id: 1 },
      create: { id: 1, price: 9, metadata: { color: "white" } },
      update: { price: 5 },
    });
    expect(upserted.price).toBe(5);
  });
});
