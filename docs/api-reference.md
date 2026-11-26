# API Reference

## PgBuddyClient

### Constructor

```typescript
constructor(sql: Sql<{}>, options?: PgBuddyClientOptions)
```

Creates a new `PgBuddyClient` instance with a postgres.js connection.

#### Options

All options can be set on the client and overridden per table:

| Option | Default | Description |
| --- | --- | --- |
| `strictNames` | `false` | When `true`, table and column names must match `^[A-Za-z_][A-Za-z0-9_]*$`. |
| `allowSchema` | `false` | Allow schema-qualified (dotted) names such as `public.users` or `users.id`. Dotted names are rejected otherwise, even in non-strict mode. |
| `allowedColumns` | `undefined` | Allowlist of columns accepted by `create`, `createMany` and `update`. Any other key throws a `QueryError`. Without it, every key is treated as a column. |
| `maxTake` | `10000` | Upper bound for `take()`. A larger value throws a `QueryError`. |
| `unique` | `undefined` | Unique column sets for `whereUnique`, e.g. `[["email"], ["tenant_id", "slug"]]`. ZodTable validates them against the schema. |
| `defaultTake` | `undefined` | Default row limit for `findMany` when no `take()` is set. Must be <= `maxTake`. |
| `columnMap` | `undefined` | Map schema field names to database column names for this table or the whole client. Values must be unique. |
| `columnCodecs` | `undefined` | Per-field `{ encode?, decode? }` hooks for custom database representations. |
| `relations` | `undefined` | Relation definitions for `ZodTable.include` (see below). |

### sql

The underlying postgres.js instance. Use it as the escape hatch for raw SQL
when pgbuddy does not model what you need:

```typescript
await db.sql`select * from users where id = ${id}`;
```

### transaction(fn, options?)

```typescript
transaction<T>(
  fn: (tx: PgBuddyClient) => Promise<T>,
  options?: TransactionOptions
): Promise<T>
```

Run `fn` inside a transaction. Use `tx` for every query inside the callback.
The transaction commits when the callback resolves and rolls back when it
throws. Nested calls use savepoints.

`TransactionOptions` supports `isolationLevel` (`"read uncommitted"`,
`"read committed"`, `"repeatable read"`, `"serializable"`), `readOnly`, and
`deferrable`.

```typescript
await db.transaction(async (tx) => {
  const users = tx.table("users", UserSchema);
  await users.create({ email, name });
});
```

### prepare(text)

```typescript
prepare<T extends Row = Row>(text: string): PreparedQuery<T>
```

Creates a reusable prepared statement from trusted SQL. Calls are executed with
postgres.js named preparation (`prepare: true`) and accept bound parameters:

```typescript
const findUser = db.prepare<{ id: number; email: string }>(
  "select id, email from users where id = $1"
);
await findUser([1]);
```

The SQL text is trusted; pgbuddy does not parse or validate it. Builder-level
prepared plans are not supported yet.

### transaction(callback, options?)

Transaction options include isolation level, read-only, deferrable, and opt-in
retry:

```typescript
await db.transaction(fn, {
  retry: {
    max: 3,
    delayMs: 25,
    backoff: "exponential",
    on: ["40001", "40P01"],
  },
});
```

The callback is rerun from the beginning on retryable SQLSTATE errors.

### batch(queries | callback)

```typescript
batch<Q extends readonly PendingQuery<any>[]>(queries: [...Q]): Promise<BatchResults<Q>>;
batch<Q extends readonly PendingQuery<any>[]>(
  callback: (tx: PgBuddyClient) => [...Q]
): Promise<BatchResults<Q>>;
```

Runs pending postgres.js queries or deferred pgbuddy terminals through
`sql.batch`: one round trip and one implicit transaction. The callback must be
synchronous and return pending/deferred queries.

```typescript
const [rows, count] = await db.batch([
  users.where({ status: "active" }).findMany(),
  users.where({ status: "active" }).count(),
]);
```

Use `db.transaction` for sequential statements that depend on previous results.

### batchSQL(statements)

```typescript
batchSQL<Q extends readonly BatchSQLStatement[]>(
  statements: Q
): Promise<BatchSQLResults<Q>>
```

Runs raw SQL statements through postgres.js `sql.batch`: one round trip and one
implicit transaction.

```typescript
const [rows, count] = await db.batchSQL([
  { text: "select * from users where id = $1", parameters: [id] },
  { text: "select count(*)::int from users" },
]);
```

### insertFrom(select, options?)

```typescript
insertFrom(select: SqlFragment, options?: {
  columns?: readonly (keyof T & string)[];
  returning?: boolean;
  computed?: ComputedMap;
}): Promise<Array<T> | number>
```

Inserts from a raw `SELECT`; column names use the table mapping. The SELECT is
not validated by pgbuddy.

### updateFrom(data, from, options?)

```typescript
updateFrom(data, from: SqlFragment, options?: {
  returning?: boolean;
  computed?: ComputedMap;
}): Promise<Array<T> | number>
```

Runs `UPDATE ... FROM` using the builder's existing where conditions. The FROM
fragment is raw SQL.

### deleteUsing(using, options?)

```typescript
deleteUsing(using: SqlFragment, options?: {
  returning?: boolean;
}): Promise<Array<T> | number>
```

Runs `DELETE ... USING` using the builder's existing where conditions. The USING
fragment is raw SQL.

### Security: write payloads

`create`, `createMany` and `update` insert or update **every key** in the
payload, so passing an unvalidated object (for example `req.body`) lets a
caller choose which columns are written — including columns you never meant to
expose, such as `role` or `is_admin`.

Mitigate this with one of:

- a Zod schema passed to `table(name, schema)` — `z.object` strips unknown keys
  by default; use `z.strictObject` to reject them instead. Avoid
  `.passthrough()` on schemas used for writes, since it re-enables arbitrary
  columns;
- the `allowedColumns` option, which rejects any key outside the allowlist;
- explicit mapping of user input to a fixed object before calling the method.

### table(tableName, schema, options?)

```typescript
table<S extends ZodObject<any>>(
  tableName: string,
  schema: S,
  options?: PgBuddyClientOptions
)
```

Creates a chainable table query builder using the client's configured
validation adapter. Zod is the default; configure `new PgBuddyClient(sql, {
adapter })` for another library.

- `tableName` — table name
- `schema` — schema for the configured adapter
- `options` — optional `PgBuddyClientOptions`; `relations` is Zod-only,
  `adapterRelations` is for adapter tables
- Returns `ZodTable<S>` for Zod or `ValidatedTable` for another adapter

### Validation adapters

Configure one adapter on the client. Zod is the default.

```typescript
const db = new PgBuddyClient(sql, { adapter: valibotValidator });
const users = db.table("users", ValibotUserSchema);
```

Built-ins: `zodValidator`, `pgbuddy/adapters/valibot`, and
`pgbuddy/adapters/yup`. A custom `ValidatorAdapter` supplies
`fields(schema)`, `parse(schema, value)`, and `parsePartial(schema, value)`.
Output/input types are inferred from the schema.

Adapter tables support core CRUD, joins, aggregates, grouped queries, computed
projections, `omit`, and `prepare`. `options.adapterRelations` declares
field-list relations; child-row keys are inferred from `fields` (use `as const`)
with `unknown` values. Relations and schema-derived projections remain
Zod-only.

---

## Predicates

Composable predicate helpers include comparison, null, `in`, LIKE, string
pattern, between, and JSONB/array operators:

- `arrayContains`, `arrayContainedBy`, `arrayOverlaps`
- `jsonContains`, `jsonHasKey`, `jsonHasAnyKey`, `jsonHasAllKeys`

JSON/array predicates participate in normal `where` composition and column
mapping.

## ZodTable\<S\>

`ZodTable` is the default schema-backed table builder, with runtime validation built in:

- `where` validates field names and values against the schema
- `select` validates projected columns against the schema; `"*"` means every
  schema column (never `SELECT *`), and results are returned in schema order
- `omit` removes columns from that schema projection
- `orderBy` validates sort columns and directions against the schema
- `create` / `createMany` validate input data
- `update` validates partial updates

### Relations

Declare relations in the table options and load them with `include`. Includes
are read-only, populated by `find*` methods, and fetched in batched queries.

```typescript
const users = db.table("users", UserSchema, {
  relations: {
    posts: {
      table: "posts",
      schema: PostSchema,
      localKey: "id",
      foreignKey: "user_id",
      relation: "many", // or "one"
    },
  },
});

const rows = await users
  .include("posts", (posts) =>
    posts
      .where({ published: true })
      .orderBy([{ column: "created_at", direction: "DESC" }])
      .take(5)
      .select(["id", "title"])
  )
  .findMany();

// Equivalent declarative form
const rows = await users
  .include("posts", {
    where: { published: true },
    orderBy: [{ column: "created_at", direction: "DESC" }],
    take: 5,
    select: ["id", "title"],
  })
  .findMany();
```

- `relation: "many"` returns an array; `"one"` returns a record or `null`.
- `include` accepts a refinement callback or a declarative options object:
  `{ where, orderBy, take, select }`. `take` applies per parent row.
- `withCount("posts")` adds `posts_count: number` to each row. It accepts a
  refinement: `withCount("posts", (posts) => posts.where({ published: true }))`
  counts matching rows only (order/take/select are ignored for counts).
- `withAggregate("posts", { count, sum, avg, min, max })` adds per-relation
  aggregate fields such as `posts_count` and `posts_sum_id`. It accepts the same
  `where` refinement and is a terminal query (`withAggregate(...).findMany()`).
- `orderByRelated("posts", { aggregate, column?, direction, nulls? })` orders
  parent rows by a correlated aggregate over a direct or through relation.
- `whereRelated("posts", (posts) => posts.where(...))` filters parents with
  `EXISTS`; `whereMissing("posts")` uses `NOT EXISTS`; `whereEvery(...)` uses
  `NOT EXISTS (... WHERE NOT (refinement))`. `whereEvery("posts")` without a
  refinement is a no-op (vacuously true).
- `localKey`/`foreignKey` accept arrays for composite keys.
- Many-to-many relations use `through: { table, parentKey, relatedKey, targetKey? }`
  instead of `foreignKey`. Through relations support includes, counts, and
  `whereRelated`/`whereMissing`/`whereEvery`.
- Relation configs accept `columnMap` and `columnCodecs` for the related
  table; includes, counts, and relation filters honor them.
- Child `relations` on a relation config are loaded recursively. The parent
  relation's `select` controls its own columns; child relations are always
  included once declared.
- The parent key is selected automatically and stripped if it was not
  requested.
- Relation table names are validated with the table's `strictNames` /
  `allowSchema` options; identifiers are still escaped.
- Count refinements ignore `orderBy`/`take`/`select`.
- Computed fields compose with relations: `.selectExpr({...}).findMany()`
  and relation methods can follow `selectExpr`.
- Narrow joins: `users.innerJoin("posts", PostSchema, on)` and `leftJoin`;
  see the Joins section.
- Nested relations are declared with a child `relations` map on the relation
  config and load automatically when the parent relation is included. Cyclic
  relation configs are rejected at table construction.
- Mutations do not populate includes or relation writes; use `db.sql` for those.
- Relation aggregates use `withAggregate(name, { count, sum, avg, min, max }, refine?)`
  and support direct and through relations.

---

## Table methods

Every table builder is a `ZodTable`; the methods below are the shared chainable
surface. Build up query state with `select`, `where`, `skip`, `take`, and
`orderBy`, then execute with `findMany`, `findFirst`, `findUnique`, or `count`.
Mutations are `create`, `createMany`, `update`, and `delete`.

### Chainable query methods

#### select(fields)

```typescript
select<K extends (keyof T)[]>(fields: K)
```

Specify which columns to return. Applies to `find*`, `create`, `createMany`, `update`, and `delete`.

#### omit(columns)

```typescript
omit(columns: readonly (keyof T & string)[])
```

Remove columns from the schema projection. `omit` re-selects from the full
schema, so prefer `select` for inclusive subsets.

```typescript
const safeUsers = await users.omit(["password_hash"]).findMany();
```

#### where(conditions)

```typescript
where(conditions: WhereInput<T>)
```

Filter results with field-value equality, an array of `WhereCondition`
operators, or a composable `Predicate` from `eq`/`or`/`and`/... Repeated
`.where()` calls are combined with `AND`.

#### whereUnique(where)

```typescript
whereUnique(where: Partial<T>)
```

Filter by a unique column set declared in the `unique` table option. Throws
`QueryError` when the keys do not match a configured unique key (or when no
unique option is configured). `findUnique()` then fetches a single row.

```typescript
const users = db.table("users", UserSchema, { unique: [["email"]] });
const user = await users.whereUnique({ email }).findUnique();
```

#### whereRaw(fragment)

```typescript
whereRaw(fragment: SqlFragment)
```

Escape hatch: add a raw postgres.js fragment to the `WHERE` clause. No
identifier or schema validation is performed, so only pass trusted SQL.

#### skip(count)

```typescript
skip(count: number)
```

Skip a number of records (offset). Throws `QueryError` if the value is invalid.

#### take(count)

```typescript
take(count: number)
```

Limit the number of records returned. Throws `QueryError` if the value is invalid.

#### orderBy(spec)

```typescript
orderBy(spec: SortSpec<T>[])
```

Sort results by one or more columns. Supports `nulls: "first" | "last"`.

#### orderByRaw(fragment)

Raw `ORDER BY` expression, for functions or relevance ordering. Combines with
`orderBy`: column sorts come first, then the raw expression.

#### selectExpr(expressions)

```typescript
selectExpr({ lowerEmail: sqlExpr<string>(sql`lower(email)`) })
  .findMany()
```

Chainable computed projection. The returned query exposes `findMany`,
`findFirst`, `findUnique`, `find*OrThrow`, `count`, and `exists` with the
computed fields added to the result type.

#### distinct()

Adds `DISTINCT` to the SELECT clause.

#### distinctOnExpr(expressions)

```typescript
distinctOnExpr(expressions: readonly SqlFragment[])
```

Adds `DISTINCT ON (expressions)`. PostgreSQL requires the leading `ORDER BY`
expressions to match.

#### for(mode, options)

```typescript
for(mode: "update" | "share" | "no key update" | "key share", options?: {
  skipLocked?: boolean;
  noWait?: boolean;
})
```

Adds a row-locking clause to `find*` queries. `skipLocked` and `noWait` are
mutually exclusive.

#### distinctOn(columns)

```typescript
distinctOn(columns: readonly (keyof T & string)[])
```

Adds `DISTINCT ON (columns)` to the SELECT clause. PostgreSQL requires the
leading `ORDER BY` expressions to match.

#### cursor(value)

```typescript
cursor(value: Partial<T>)
```

Keyset pagination: filters rows after (ASC) or before (DESC) the given cursor.
A cursor may contain multiple columns; they must match the leading `orderBy`
columns in order and produce lexicographic keyset conditions. Without
`orderBy`, a single cursor column assumes ascending order.

### Query execution

#### findMany(options?)

```typescript
findMany<X extends Record<string, SqlExpression<unknown>>>(
  options?: { computed?: X }
)
```

Returns all matching records. `computed` adds aliased SQL expressions to the
projection; wrap postgres.js fragments with `sqlExpr<T>()`:

```typescript
import { sqlExpr } from "pgbuddy";

const rows = await users.findMany({
  computed: {
    lowerEmail: sqlExpr<string>(sql`lower(email)`),
  },
});
```

`findFirst`, `findUnique`, and the `*OrThrow` variants accept the same
`{ computed }` option. `.selectExpr({...})` is the chainable form.

#### findFirst()

Returns the first matching record, or `null`.

#### findUnique()

Returns the only matching record, or `null`. Throws `QueryError` if more than one record matches.

#### findFirstOrThrow()

Returns the first matching record, or throws `QueryError` (`No record found`).

#### findUniqueOrThrow()

Returns the only matching record, or throws `QueryError` (`No record found` or `NOT_UNIQUE`).

#### findManyInfinite()

```typescript
findManyInfinite(options?: ComputedOptions): Promise<{
  rows: Array<T>;
  nextCursor: Partial<T> | null;
  hasMore: boolean;
}>
```

Fetches a keyset page and returns the cursor for the next page. Requires an
explicit `orderBy` of schema columns and a `take()` limit. `nextCursor` is
derived from the order columns of the last returned row. Pass
`{ direction: "backward" }` to page toward older rows; results stay in the
original order. The helper fetches one
extra row to determine `hasMore`; it does not return a total.

#### findManyAndCount()

```typescript
findManyAndCount(options?: ComputedOptions): Promise<{
  rows: Array<T>;
  total: number;
}>
```

Fetches the current page and the filtered total in one postgres.js batch.
`total` ignores `skip`/`take` and counts all rows matching the current filters.
Use `db.transaction` when the page and count must share a transaction with
other work.

#### filtered(expression, condition)

Wraps an aggregate expression with `FILTER (WHERE condition)`. Available on
`PgBuddyClient` and exported as `filteredExpr(sql, expression, condition)`.

#### whereExpr(expression)

Filters by a typed SQL boolean expression. Equivalent to `whereRaw` for the
expression's fragment, with expression typing at the call site.

#### orderByExpr(expression, options?)

Orders by a typed SQL expression with optional `direction` and `nulls`.

#### toSQL()

```typescript
toSQL(): { text: string; parameters: readonly unknown[] }
```

Inspects the current SELECT without executing it. Identifiers are quoted and
values are returned separately in `parameters`. Covers computed projections on
`selectExpr(...)`.

#### explain(options?)

```typescript
explain(options?: {
  analyze?: boolean;
  verbose?: boolean;
  format?: "text" | "json";
}): Promise<unknown[]>
```

Runs `EXPLAIN` on the current SELECT and returns raw plan rows. `analyze: true`
executes the query.

#### signal(signal)

Attaches an `AbortSignal` to SELECT execution.

#### stream(batchSize = 1)

Streams the base SELECT as batches of rows. Relation includes are not applied to
streamed rows.

#### prepare()

```typescript
prepare(): () => Promise<Array<T>>
```

Builds a reusable prepared executor for the current SELECT. Parameters are
fixed to the builder state; create another prepared builder to reuse the same
plan with different values. Relation includes are not applied by prepared
execution.

#### count()

Returns the number of matching records.

#### exists()

Returns `true` when at least one record matches.

#### groupBy(columns, aggregates)

```typescript
const rows = await users
  .groupBy(["status"], {
    count: sqlExpr<number>(sql`count(*)::int`),
    total: sqlExpr<number>(sql`sum(amount)`),
  })
  .having(sql`count(*) > 1`)
  .orderBy([{ column: "status", direction: "ASC" }])
  .findMany();
```

Groups matching rows and returns the group columns plus typed aggregate
aliases. `having()` takes a raw SQL fragment because aggregate aliases are not
addressable through the predicate builders. `where`, `orderBy`, `orderByRaw`,
`skip`, and `take` compose on the grouped query; relations are not available.
Cast aggregates such as `count(*)::int` when you want a JavaScript number.

#### aggregate(options)

```typescript
aggregate({
  count?: boolean;
  countDistinct?: string[];
  sum?: string[];
  avg?: string[];
  min?: string[];
  max?: string[];
})
```

Returns `{ count?, countDistinct: {...}, sum: {...}, avg: {...}, min: {...}, max: {...} }`.
For grouped aggregates use `groupBy()`/`having()`; use `db.sql` for advanced
grouping such as `FILTER`, `ROLLUP`, or `CUBE`.

### Joins

```typescript
const rows = await users
  .innerJoin("posts", PostSchema, sql`"posts"."user_id" = "users"."id"`)
  .leftJoin("comments", CommentSchema, sql`"comments"."post_id" = "posts"."id"`)
  .findMany();
// Array<User & { posts: Post; comments: Comment | null }>
```

Each right row is nested under its join name. `innerJoin` rows are required;
`leftJoin` rows are `{...} | null`. Joins can be chained. Use `alias` to join
the same table more than once:

```typescript
await users.innerJoin("manager", UserSchema, sql`"manager"."id" = "users"."id"`, {
  table: "users",
  alias: "manager",
});
```

The alias defaults to the join name, and the table defaults to the join name.
A right-side alias must differ from the left table name and from other join
aliases. Join options accept `columnMap` and `columnCodecs` for the right
table; they apply to selected right-side columns. Right-side columns come from the Zod schema. Because tables can share
column names, use `whereRaw`/`orderByRaw` with qualified columns for filters or
ordering. `on` is a trusted SQL fragment. Narrow joins are supported; a general
join tree is not.

### Mutations

#### create(data, options)

```typescript
create(data: I, options?: { computed?: X; onConflict?: "nothing" })
```

Insert a single record and return it (respects `select`). `computed` adds
typed `RETURNING` expressions; `onConflict: "nothing"` adds
`ON CONFLICT DO NOTHING` and returns `null` when the row was skipped.
`I` is the insertable row type (defaults to `T`).

#### createMany(records, options)

```typescript
createMany(
  records: I[],
  options?: {
    skipDuplicates?: boolean;
    onConflict?: {
      target: string[];
      update?: string[];
      set?: Record<string, SqlFragment>;
    };
    computed?: X;
  }
)
```

Insert multiple records and return them (respects `select`). Make
auto-generated keys optional in the Zod schema (for example
`id: z.number().int().optional()`).
`skipDuplicates` adds `ON CONFLICT DO NOTHING`; `onConflict` updates the named
columns from `EXCLUDED` and/or applies arbitrary `set` expressions. Large
batches are chunked automatically.

#### upsert(options)

```typescript
upsert(options: {
  where: Partial<T>;
  create: I;
  update?: Partial<T>;
  targetWhere?: SqlFragment;
  setWhere?: SqlFragment;
  computed?: X;
})
```

Insert a record, or update the existing row when it conflicts with the unique
columns named in `where`. `update` values are applied via `DO UPDATE SET`; an
omitted `update` returns the existing row (`find or create`). `targetWhere`
and `setWhere` support partial indexes.

```typescript
const user = await users.upsert({
  where: { email: "ada@example.com" },
  create: { email: "ada@example.com", name: "Ada" },
  update: { name: "Ada Lovelace" },
});
```

#### update(data, options)

```typescript
update(
  data: UpdateData<T>,
  options?: { returning?: true; computed?: X } | { returning: false }
)
```

Update records matching `where` and return the updated rows (respects
`select`). `UpdateData` allows SQL fragments for expressions such as
`sql\`now()\`` or `sql\`views + 1\``; `undefined` values are omitted.
`computed` adds typed `RETURNING` expressions. With `{ returning: false }` it
returns the affected-row count instead. Requires `where`.

#### delete(options)

```typescript
delete(
  options?: { returning?: true; computed?: X } | { returning: false }
)
```

Delete records matching `where` and return the deleted rows (respects
`select`). `computed` adds typed `RETURNING` expressions. With
`{ returning: false }` it returns the affected-row count. Requires `where`.

---

## Types

### WhereCondition\<T\>

```typescript
type WhereCondition<T> = {
  field: keyof T;
} & (
  | { operator: "=" | "!=" | ">" | "<" | ">=" | "<="; value: string | number | boolean | Date }
  | { operator: "LIKE" | "ILIKE"; value: string; pattern?: LikePattern }
  | { operator: "IN"; value: Array<string | number | boolean | Date> }
  | { operator: "IS NULL" | "IS NOT NULL"; value?: never }
);
```

### SqlOperator

```typescript
type SqlOperator =
  | "="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "LIKE"
  | "ILIKE"
  | "IN"
  | "IS NULL"
  | "IS NOT NULL";
```

### LikePattern

```typescript
type LikePattern = "startsWith" | "endsWith" | "contains" | "exact";
```

### SortSpec\<T\>

```typescript
interface SortSpec<T> {
  column: keyof T & string;
  direction: "ASC" | "DESC";
  nulls?: "first" | "last";
}
```

---

## Column mapping

```typescript
const users = db.table("users", UserSchema, {
  columnMap: {
    fullName: "full_name",
    createdAt: "created_at",
  },
});
```

Results keep schema field names. The map applies to reads, writes, filters,
ordering, distinct, cursors, aggregates, and grouping. Set `columnMap` on the
client to apply a default map to every table.

`columnCodecs` adds per-field serialization:

```typescript
const products = db.table("products", ProductSchema, {
  columnMap: { price: "price_cents" },
  columnCodecs: {
    price: {
      encode: (value) => Math.round(Number(value) * 100),
      decode: (value) => Number(value) / 100,
    },
  },
});
```

Codecs apply to writes, filter values, cursors, and decoded rows; SQL-fragment
values bypass encoding. Relation configs, right-side join columns, and
relation-loaded child rows do not use table codecs yet. `postgres.camel`
remains an alternative for connection-wide camelCase mapping.

## Error types

### QueryError

Thrown for invalid query parameters, bad pagination values, or unsafe operations (such as `update` or `delete` without a `where` clause). It exposes a
stable `code` such as `NO_ROWS`, `NO_CONDITIONS`, `INVALID_DATA`,
`INVALID_CURSOR`, `INVALID_WHERE`, `INVALID_COLUMNS`, `INVALID_AGGREGATE`,
`INVALID_LOCK`, `INVALID_GROUP`, `INVALID_JOIN`, `COLUMN_NOT_ALLOWED`,
`INSUFFICIENT_COLUMNS`, or `CONFLICT`.

### TableError

Thrown when table configuration is invalid (such as an invalid table name).

### PostgreSQL errors

Database errors are the original postgres.js errors, so the SQLSTATE is on
`error.code` and details such as `constraint_name` are preserved. Use the
exported helpers instead of comparing codes by hand:

```typescript
import { constraintName, isUniqueViolation } from "pgbuddy";

try {
  await users.create({ email });
} catch (error) {
  if (isUniqueViolation(error)) {
    console.log("Duplicate:", constraintName(error));
  }
}
```

Available helpers: `isPostgresError`, `isUniqueViolation`,
`isForeignKeyViolation`, `isNotNullViolation`, `isCheckViolation`,
`isSerializationFailure`, `isDeadlock`, `constraintName`, plus the
`PostgresErrorCodes` map.
