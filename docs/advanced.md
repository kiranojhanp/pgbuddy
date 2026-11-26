# Advanced Execution

This page covers execution and SQL features that go beyond everyday CRUD. For
basic queries, start with [CRUD operations](crud-operations.md) and
[Select operations](select-operations.md).

## True batching

`db.batch` is always one postgres.js batch: one round trip and one implicit
transaction.

```ts
const [rows, count] = await db.batch([
  users.where({ status: "active" }).findMany(),
  users.where({ status: "active" }).count(),
]);
```

`findMany()` and `count()` are lazy promises. They execute normally when
awaited, but `db.batch` can collect them into one round trip.

For raw pending queries:

```ts
await db.batch((tx) => [
  tx.sql`update users set status = ${status} where id = ${id}`,
  tx.sql`select count(*)::int as count from users`,
]);
```

`batchSQL` accepts typed raw statements:

```ts
const [updated, count] = await db.batchSQL([
  { text: "update users set status = $1 where id = $2", parameters: ["active", id] },
  { text: "select count(*)::int as count from users" },
]);
```

Use `db.transaction` for sequential statements that depend on earlier results.

## Prepared statements

Fixed-parameter prepared SELECT:

```ts
const findActive = users.where({ status: "active" }).prepare();
const first = await findActive();
const second = await findActive();
```

Parameterized prepared SELECT:

```ts
const findUser = users
  .where({ id: db.param<number>("id") })
  .prepareParams<{ id: number }>();

const ada = await findUser({ id: 1 });
const grace = await findUser({ id: 2 });
```

`prepareParams()` builds the plan once and rebinds named placeholders per
execution. It is SELECT-only and does not apply relation includes.

Raw prepared SQL is also available:

```ts
const findUser = db.prepare<{ id: number; email: string }>(
  "select id, email from users where id = $1"
);
const rows = await findUser([1]);
```

Inspect a SELECT without executing it with `toSQL()`:

```ts
const { text, parameters } = users.where({ status: "active" }).take(10).toSQL();
```

## Transactions and retries

```ts
await db.transaction(async (tx) => {
  const users = tx.table("users", UserSchema);
  await users.create({ name: "Alice", email: "alice@example.com" });
}, {
  isolationLevel: "serializable",
  readOnly: false,
  deferrable: false,
});
```

Opt into retries for serialization failures and deadlocks:

```ts
await db.transaction(fn, {
  retry: {
    max: 3,
    delayMs: 25,
    backoff: "exponential",
    on: ["40001", "40P01"],
  },
});
```

The callback is rerun from the beginning, so it must be safe to repeat.
Transaction clients inherit the connection adapter, column mapping, and codecs.

## Streaming and cancellation

```ts
const controller = new AbortController();

for await (const batch of users
  .where({ status: "active" })
  .signal(controller.signal)
  .stream(100)) {
  // batch is an array of rows
}
```

`stream(batchSize)` returns batches from the base SELECT. Relation includes are
not hydrated on streamed rows; use `findMany()` for relations. Batch size is
capped by `maxTake`.

## Query plans

```ts
const plan = await users.where({ status: "active" }).explain();

const analyzed = await users.where({ status: "active" }).explain({
  analyze: true,
  verbose: true,
  format: "text",
});
```

`analyze: true` executes the query.

## Expressions, grouping, and HAVING

```ts
const rows = await users
  .whereExpr(sqlExpr<boolean>(sql`lower(email) = ${email}`))
  .orderByExpr(sqlExpr<string>(sql`lower(full_name)`), { direction: "ASC" })
  .findMany();
```

Group by expressions and type HAVING:

```ts
const byDomain = await users
  .groupByExpr(
    { domain: sqlExpr<string>(sql`split_part(email, '@', 2)`) },
    { count: sqlExpr<number>(sql`count(*)::int`) }
  )
  .having({ count: { gt: 1 } })
  .findMany();
```

Conditional aggregates:

```ts
const paid = db.filtered(
  sqlExpr<number>(sql`count(*)`),
  sql`status = ${"paid"}`
);
```

## SQL write helpers

```ts
await users.insertFrom(
  sql`SELECT id, email, full_name, status, deleted_at, created_at FROM staging_users`,
  { columns: ["id", "email", "full_name", "status", "deleted_at", "created_at"] }
);

await products
  .whereRaw(sql`"price_overrides"."product_id" = "products"."id"`)
  .updateFrom({ price_cents: sql`"price_overrides"."price_cents"` }, sql`price_overrides`);

await priceOverrides
  .whereRaw(sql`"price_overrides"."product_id" = "products"."id"`)
  .deleteUsing(sql`products`);
```

`updateFrom` and `deleteUsing` require existing where conditions. The SELECT,
FROM, and USING fragments are raw SQL.

## JSONB and array predicates

```ts
await assets.where(arrayContains("tags", ["typescript"])).findMany();
await assets.where(arrayOverlaps("tags", ["db"])).findMany();
await assets.where(jsonContains("metadata", { tier: "premium" })).findMany();
await assets.where(jsonHasKey("metadata", "region")).findMany();
```

Also available: `arrayContainedBy`, `jsonHasAnyKey`, and `jsonHasAllKeys`.

## Row locking

```ts
await db.transaction(async (tx) => {
  const rows = await tx
    .table("users", UserSchema)
    .where({ status: "pending" })
    .for("update", { skipLocked: true })
    .take(10)
    .findMany();
});
```

`for` supports `"update"`, `"share"`, `"no key update"`, and `"key share"`, with
`skipLocked` or `noWait`.

## Security and performance

- `db.batch`, `findManyAndCount`, and typed deferred queries reduce round trips.
- `maxTake` caps page/stream sizes; `maxSkip` optionally caps offset pagination.
- `findManyInfinite` uses keyset pagination; `findManyAndCount` returns totals.
- Raw helpers (`whereRaw`, `orderByRaw`, join `on`, `insertFrom` SELECT,
  `updateFrom` FROM, `deleteUsing` USING, `prepare`, `batchSQL`) are trusted SQL.
- Transaction modes and values are bound/escaped by postgres.js.
- Zod `>=4.6.6` is the minimum supported version.

See [Soft deletes](recipes/soft-deletes.md) and
[Tenant scoping and RLS](recipes/tenant-scoping.md) for application-level
security patterns.
