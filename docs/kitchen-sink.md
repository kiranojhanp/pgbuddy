# Ecommerce Kitchen Sink

The kitchen sink is a single runnable script that exercises the full pgbuddy
surface against an ecommerce schema. Use it as the reference when you want to
see how the pieces fit together.

**File:** [`examples/ecommerce-kitchen-sink.ts`](../examples/ecommerce-kitchen-sink.ts)

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
- `inventory` (plain `Table`)
- `audit_log` (plain `Table` with an auto-generated id)

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
| Filtering | object conditions, typed `WhereCondition[]`, all predicate helpers, nested `and`/`or`/`not`, `whereRaw` |
| Projection | `select`, `omit`, `distinct`, `distinctOn`, `distinctOnExpr`, `selectExpr`, `computed` |
| Pagination | `skip`, `take`, `orderBy` with `NULLS`, `orderByRaw`, single and composite `cursor` |
| Relations | callback and declarative `include`, `withCount` with refinement, `whereRelated`, `whereMissing`, `whereEvery` |
| Joins | `innerJoin`, `leftJoin`, nested right rows, `JoinQuery` filtering/order/projection/first |
| Grouping | `groupBy`, aggregate aliases, `having`, grouped `orderBy`/`skip`/`take`/`findFirstOrThrow` |
| Aggregates | `count`, `countDistinct`, `sum`, `avg`, `min`, `max` |
| Transactions | isolation level, read-only/deferrable, nested-capable `transaction`, row locking |
| Writes | `create`, `createMany`, `upsert`, `update`, `delete`; conflict handling; computed `RETURNING`; count mode |
| Plain tables | `table`, `tableWithInsert`, `columns`, `omit`, `whereUnique`, `groupBy` |
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
  .having(sql`count(*) > 0`)
  .findMany();
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

- `having` and the join `on` clause are raw SQL fragments.
- Use qualified column names in `whereRaw`/`orderByRaw` for joins.
- `count(*)` is cast to `int` in the example because postgres.js otherwise
  returns a string for `bigint`.
- Relations are one-hop and read-only; see the README's remaining-todos section
  for nested relations and many-to-many.
