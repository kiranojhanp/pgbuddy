# Ecommerce Kitchen Sink

The kitchen sink is a single runnable script that exercises the full pgbuddy
surface against an ecommerce schema. Use it as the reference when you want to
see how the pieces fit together.

**File:** [`examples/ecommerce-kitchen-sink.ts`](https://github.com/kiranojhanp/pgbuddy/blob/master/examples/ecommerce-kitchen-sink.ts)

## Run it

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/pgbuddy \
  bun run example:kitchen-sink
```

The script drops and recreates its own tables. Point it at a disposable
database only. It uses the source import (`../src`) rather than the published
package, so it stays in sync with the repository. The example is typechecked by
`bun run test:types`.

## Schema

The scenario has the usual ecommerce tables:

- `users`
- `categories`
- `products`
- `orders`
- `order_items`
- `reviews`
- `inventory`
- `assets` (array/JSONB predicate examples)
- `price_overrides` (used by the SQL write helpers)
- `audit_log` (auto-generated id)

It declares one-hop relations in both directions:

- user → orders, reviews
- category → products
- product → category, reviews
- order → user, items
- order item → product

## What it covers

| Area | API exercised |
| --- | --- |
| Reads | `findMany`, `findFirst`, `findUnique`, `findUniqueOrThrow`, `findFirstOrThrow`, `count`, `exists` |
| Streaming | `stream(batchSize)`; `signal(AbortSignal)` is documented in [Advanced execution](https://github.com/kiranojhanp/pgbuddy/blob/master/docs/advanced.md) |
| Prepared params | `db.param()` + `prepareParams()` |
| Plans | `explain()` |
| Batch | `db.batch` with deferred builders and synchronous pending-query callback |
| Pagination | `findManyAndCount` via a validated app-level table query helper |
| Filtering | object conditions, typed `WhereCondition[]`, all predicate helpers, nested `and`/`or`/`not`, `whereRaw` |
| Projection | `select`, `omit`, `distinct`, `distinctOn`, `distinctOnExpr`, `selectExpr`, `computed` |
| Pagination | `skip`, `take`, `orderBy` with `NULLS`, `orderByRaw`, single and composite `cursor` |
| Relations | callback and declarative `include`, `withCount` with refinement, `whereRelated`, `whereMissing`, `whereEvery` |
| Joins | `innerJoin`, `leftJoin`, nested right rows, `JoinQuery` filtering/order/projection/first |
| Grouping | `groupBy`, `groupByExpr`, aggregate aliases, typed/raw `having`, conditional `db.filtered`, grouped `orderBy`/`skip`/`take`/`findFirstOrThrow` |
| Aggregates | `count`, `countDistinct`, `sum`, `avg`, `min`, `max` |
| Transactions | isolation level, read-only/deferrable, nested-capable `transaction`, row locking |
| Writes | `create`, `createMany`, `upsert`, `update`, `delete`; `insertFrom`, `updateFrom`, `deleteUsing`; conflict handling; computed `RETURNING`; count mode |
| Expressions | `whereExpr`, `orderByExpr` |
| JSON/arrays | `arrayContains`, `arrayOverlaps`, `jsonContains`, `jsonHasKey` |
| Zod schemas | `table` for inventory/audit, `omit`, `whereUnique`, `groupBy` |
| Errors | `QueryError.code`, `TableError`, all PostgreSQL error helpers |
| Computed writes | `create`/`update`/`delete`/`upsert` with `computed` |

## Selected excerpts

### Declarative relations

```typescript
const users = db.table("users", UserSchema, {
  relations: {
    orders: {
      table: "orders",
      schema: OrderSchema,
      localKey: "id",
      foreignKey: "user_id",
      relation: "many",
    },
  },
});

const rows = await users
  .include("orders", { where: { status: "paid" }, take: 2 })
  .withCount("orders", (orders) => orders.where({ status: "paid" }))
  .findMany();
```

### Computed fields and writes

```typescript
const computed = await users.findMany({
  computed: {
    lowerEmail: sqlExpr<string>(sql`lower(email)`),
    orderCount: sqlExpr<number>(
      sql`(select count(*)::int from orders where orders.user_id = users.id)`
    ),
  },
});

const [updated] = await users
  .where({ email: "ada@example.com" })
  .update(
    { full_name: "Ada L." },
    { computed: { upperName: sqlExpr<string>(sql`upper(full_name)`) } }
  );
```

### Narrow joins

```typescript
const rows = await products
  .innerJoin("categories", CategorySchema, sql`"categories"."id" = "products"."category_id"`)
  .select(["id", "name"])
  .whereRaw(sql`"products"."stock" > ${0}`)
  .orderByRaw(sql`"products"."name" ASC`)
  .findMany();
```

### Grouped aggregates

```typescript
const grouped = await orders
  .groupBy(["status"], {
    count: sqlExpr<number>(sql`count(*)::int`),
    total: sqlExpr<number>(sql`sum(total_cents)::int`),
  })
  .having({ count: { gt: 0 } })
  .findMany();

const byLowerStatus = await orders
  .groupByExpr(
    { statusLower: sqlExpr<string>(sql`lower(status)`) },
    { count: sqlExpr<number>(sql`count(*)::int`) }
  )
  .findMany();
```

### True batch and SQL writes

```typescript
const [rows, count] = await db.batch((tx) => [
  tx.sql`select id, status from orders order by id`,
  tx.sql`select count(*)::int as count from orders`,
]);

await priceOverrides.insertFrom(
  sql`select id, price_cents + 100 from products where id = 1`,
  { columns: ["product_id", "price_cents"] }
);
```

### Locking inside a transaction

```typescript
await db.transaction(async (tx) => {
  await tx
    .table("orders", OrderSchema)
    .where({ status: "pending" })
    .for("update", { skipLocked: true })
    .findMany();
});
```

## Notes

- `having` accepts typed aggregate conditions or a raw SQL fragment; join `on`
  clauses remain raw SQL fragments.
- Transaction retry is demonstrated on the read-only serializable total.
- Infinite pagination includes both forward and backward pages.
- Use qualified column names in `whereRaw`/`orderByRaw` for joins.
- `count(*)` is cast to `int` in the example because postgres.js otherwise
  returns a string for `bigint`.
- Relations are read-only and support nested/through configs; relation writes
  are intentionally out of scope.
