# PgBuddy

<p align="center">
  <img src="assets/banner.png" alt="PgBuddy banner" width="100%" />
</p>

A no-nonsense, type-safe, tiny query builder wrapping [postgres.js](https://github.com/porsager/postgres).

[![npm version](https://img.shields.io/npm/v/pgbuddy.svg)](https://www.npmjs.com/package/pgbuddy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Installation

```bash
npm install pgbuddy postgres zod
```

Zod is required. Every table is created from a Zod schema so inputs are validated before they reach PostgreSQL.

---

## Quick start

```ts
import postgres from "postgres";
import { PgBuddyClient } from "pgbuddy";
import { z } from "zod";

const sql = postgres(process.env.DATABASE_URL);
const db = new PgBuddyClient(sql);

const UserSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  email: z.email(),
  status: z.enum(["active", "inactive"]).optional(),
  created_at: z.date().optional(),
  deleted_at: z.date().nullable().optional(),
  password_hash: z.string().optional(),
});

const users = db.table("users", UserSchema);

// Create
const user = await users.create({ name: "Alice", email: "alice@example.com" });

// Read
const all = await users.findMany();
const one = await users.where({ email: "alice@example.com" }).findFirst();

// Update
await users.where({ email: "alice@example.com" }).update({ name: "Alice Smith" });

// Delete
await users.where({ email: "alice@example.com" }).delete();
```

Every table is created from a Zod object schema. The schema drives projections,
validates writes, and types results. Use `.optional()` for database defaults or
auto-generated ids and `.nullable()` for nullable columns. There is no
unvalidated table builder; use `db.sql` when you need raw SQL.

Tip: Use [Kanel](https://kristiandupont.github.io/kanel/) or another
introspection tool to generate TypeScript types, then define matching Zod
schemas for validation.

## Schema-first

Zod is required, not an optional add-on:

- `create`, `createMany`, `update`, and `upsert` validate their payloads before
  executing SQL.
- `select(["*"])` expands to the schema's columns, never `SELECT *`.
- `ZodTable` validates `where`, `orderBy`, `omit`, and relation refinements
  against the schema.
- `z.object` strips unknown keys; use `z.strictObject` to reject them.

For raw queries or features the typed API does not model, use `db.sql`.

## Filtering

Simple equality conditions:

```ts
const active = await users.where({ status: "active" }).findMany();
```

Composable predicates for everything else:

```ts
import { contains, eq, isNull, not, or } from "pgbuddy";

const results = await users
  .where(or(eq("email", email), eq("name", "Alice")))
  .where(not(eq("status", "inactive")))
  .where(contains("name", "ali"))
  .where(isNull("deleted_at"))
  .findMany();
```

Available predicates:

- Comparisons: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`
- Sets: `inArray`, `notInArray`
- NULL: `isNull`, `isNotNull`
- Patterns: `like`, `ilike` (SQL wildcards); `contains`, `startsWith`, `endsWith` (wildcards escaped)
- Ranges: `between`, `notBetween`
- Boolean: `and`, `or`, `not`

Repeated `.where()` calls are combined with `AND`.

For raw conditions, use `whereRaw` with a postgres.js fragment:

```ts
const rows = await users.whereRaw(sql`lower(email) = ${email}`).findMany();
```

## Selecting fields

```ts
const emails = await users.select(["id", "email"]).findMany();

const safe = await users.omit(["password_hash"]).findMany();
```

With a schema, `select(["*"])` selects every schema column — never `SELECT *`.

Add computed expressions to a find query:

```ts
import { sqlExpr } from "pgbuddy";

const rows = await users.findMany({
  computed: { lowerEmail: sqlExpr<string>(sql`lower(email)`) },
});
```

## Sorting and pagination

```ts
const page = await users
  .orderBy([{ column: "created_at", direction: "DESC" }])
  .skip(20)
  .take(10)
  .findMany();
```

Distinct results:

```ts
const statuses = await users.select(["status"]).distinct().findMany();

const latestPerStatus = await users
  .distinctOn(["status"])
  .orderBy([
    { column: "status", direction: "ASC" },
    { column: "created_at", direction: "DESC" },
  ])
  .findMany();
```

Keyset pagination:

```ts
const next = await users
  .orderBy([{ column: "id", direction: "ASC" }])
  .cursor({ id: lastId })
  .take(20)
  .findMany();

// Composite cursors follow the leading orderBy columns.
const nextByStatus = await users
  .orderBy([
    { column: "status", direction: "ASC" },
    { column: "id", direction: "ASC" },
  ])
  .cursor({ status: "active", id: lastId })
  .take(20)
  .findMany();
```

## Writing data

Bulk insert, skipping rows that conflict with a unique index:

```ts
const inserted = await users.createMany(records, { skipDuplicates: true });
```

Update conflicting rows instead, with arbitrary `SET` expressions:

```ts
await users.createMany(records, {
  onConflict: {
    target: ["email"],
    update: ["name"],                    // SET name = EXCLUDED.name
    set: { updated_at: sql`now()` },     // arbitrary expression
  },
});
```

Upsert:

```ts
const user = await users.upsert({
  where: { email: "alice@example.com" },
  create: { email: "alice@example.com", name: "Alice" },
  update: { name: "Alice Smith" },
});
```

Single inserts can skip conflicts and return `null`:

```ts
const inserted = await users.create(data, { onConflict: "nothing" });
if (!inserted) {
  // a conflicting row already existed
}
```

Writes return computed `RETURNING` expressions:

```ts
const [updated] = await users
  .where({ email })
  .update({ status: "inactive" }, {
    computed: { upper: sqlExpr<string>(sql`upper(status)`) },
  });
```

`undefined` values are omitted, so database defaults apply. Large `createMany`
batches are chunked automatically.

## Unique lookups

Declare unique column sets once, then use `whereUnique`:

```ts
const users = db.table("users", UserSchema, {
  unique: [["email"]],
});

const user = await users.whereUnique({ email }).findUnique();
```

`whereUnique` validates the key against the configured sets, and `findUnique` fetches a single row.

## Transactions and raw SQL

```ts
await db.transaction(async (tx) => {
  const users = tx.table("users", UserSchema);
  await users.create({ name: "Alice", email: "alice@example.com" });
  await users.where({ email: "alice@example.com" }).update({ name: "Alice Smith" });
}, {
  isolationLevel: "serializable",
  readOnly: false,
  deferrable: false,
});

// The postgres.js instance is always available for raw SQL.
const rows = await db.sql`select * from users where id = ${id}`;
```

## Relations

```ts
const PostSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  title: z.string(),
  published: z.boolean(),
  created_at: z.date(),
});

const users = db.table("users", UserSchema, {
  relations: {
    posts: {
      table: "posts",
      schema: PostSchema,
      localKey: "id",
      foreignKey: "user_id",
      relation: "many",
    },
  },
});

const rows = await users
  .include("posts", (posts) =>
    posts.where({ published: true }).orderBy([{ column: "created_at", direction: "DESC" }]).take(5)
  )
  .withCount("posts", (posts) => posts.where({ published: true }))
  .findMany();
```

Includes are read-only and supported on `find*` methods. Refinements can be
declarative (`{ where, orderBy, take, select }`) or a callback.
`withCount` accepts the same refinement, and `whereRelated` / `whereMissing` /
`whereEvery` filter parents by related rows.

Many-to-many relations use a junction table:

```ts
const posts = db.table("posts", PostSchema, {
  relations: {
    tags: {
      table: "tags",
      schema: TagSchema,
      localKey: "id",
      relation: "many",
      through: {
        table: "post_tags",
        parentKey: "post_id",
        relatedKey: "tag_id",
        targetKey: "id",
      },
    },
  },
});

const tagged = await posts.include("tags").withCount("tags").findMany();
```

Through relations support the same `include` refinement, `withCount`, and
`whereRelated` / `whereMissing` / `whereEvery` filters as direct relations.

Nested relations are declared on the relation config and load automatically
when the parent relation is included:

```ts
const users = db.table("users", UserSchema, {
  relations: {
    posts: {
      table: "posts",
      schema: PostSchema,
      localKey: "id",
      foreignKey: "user_id",
      relation: "many",
      relations: {
        comments: {
          table: "comments",
          schema: CommentSchema,
          localKey: "id",
          foreignKey: "post_id",
          relation: "many",
        },
      },
    },
  },
});

const rows = await users.include("posts").findMany();
// rows[0].posts[0].comments
```

Child relations can use either direct foreign keys or `through` junctions. Use
`db.sql` for relation writes.

## Counts and aggregates

```ts
const exists = await users.where({ email: "alice@example.com" }).exists();

const totals = await users.aggregate({
  count: true,
  countDistinct: ["status"],
  sum: ["views"],
});

// Return the affected-row count instead of rows
const updated = await users
  .where({ status: "inactive" })
  .update({ status: "active" }, { returning: false });
```

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

`for` supports `"update"`, `"share"`, `"no key update"`, and `"key share"`,
with `skipLocked` or `noWait`.

## Grouped aggregates

```ts
const rows = await users
  .where({ status: "active" })
  .groupBy(["status"], { count: sqlExpr<number>(sql`count(*)::int`) })
  .having(sql`count(*) > 1`)
  .orderBy([{ column: "status", direction: "ASC" }])
  .findMany();
```

`having` is raw SQL; cast aggregates such as `count(*)::int` for JS numbers.

## Errors

`findFirstOrThrow` and `findUniqueOrThrow` throw `QueryError` when nothing matches.
`QueryError.code` is stable for programmatic handling (`NO_ROWS`,
`NO_CONDITIONS`, `INVALID_DATA`, `INVALID_CURSOR`, `INVALID_WHERE`,
`COLUMN_NOT_ALLOWED`, `CONFLICT`, and others).

Database errors are the original postgres.js errors. Use the helpers for common cases:

```ts
import { constraintName, isUniqueViolation } from "pgbuddy";

try {
  await users.create({ name: "Alice", email: "alice@example.com" });
} catch (error) {
  if (isUniqueViolation(error)) {
    console.log("Duplicate:", constraintName(error));
  }
}
```

Available helpers: `isUniqueViolation`, `isForeignKeyViolation`, `isNotNullViolation`, `isCheckViolation`, `isSerializationFailure`, `isDeadlock`, `isPostgresError`, `constraintName`, and `PostgresErrorCodes`.

## Security notes

- Values are always sent as bound parameters and identifiers are escaped by postgres.js, so user-supplied values cannot break out of SQL.
- `create`, `createMany` and `update` treat **every non-`undefined` key** of the payload as a column. Never pass an unvalidated request body: an attacker could set columns such as `role` or `is_admin`. Use a Zod schema (which strips unknown keys by default), a `z.strictObject` schema, or the `allowedColumns` option to enforce a write allowlist.
- `select`/`orderBy` column names are validated against the schema at runtime; still treat dynamic column names as developer-controlled input.
- `take()` is capped at 10,000 rows by default; raise or lower it with the `maxTake` option.
- Schema-qualified (dotted) table and column names are rejected unless `allowSchema: true` is set.

## Joins

Narrow joins nest each right row:

```ts
const rows = await users
  .innerJoin("posts", PostSchema, sql`"posts"."user_id" = "users"."id"`)
  .leftJoin("comments", CommentSchema, sql`"comments"."post_id" = "posts"."id"`)
  .findMany();

// rows[0].posts.title
// rows[0].comments?.body
```

`leftJoin` returns `comments: {...} | null`. Joins can be chained, and each
right-side table can have an alias:

```ts
const managers = await users
  .innerJoin("manager", UserSchema, sql`"manager"."id" = "users"."id"`, {
    table: "users",
    alias: "manager",
  })
  .findMany();

// managers[0].manager.name
```

The alias defaults to the join name, and the table defaults to the join name.
Use a distinct alias when joining the left table to itself. Use
`whereRaw`/`orderByRaw` with qualified columns when names are ambiguous.
Narrow joins are supported; a general join tree is not.

## Column mapping

pgbuddy passes identifiers through postgres.js, so use its `transform` for
camelCase fields over snake_case columns:

```ts
const sql = postgres(process.env.DATABASE_URL, { transform: postgres.camel });

const UserSchema = z.object({
  id: z.number(),
  fullName: z.string(),
  createdAt: z.date(),
});
```

`fullName` maps to `full_name` across inserts, filters, ordering, projections,
aggregates, and results.

## Kitchen sink

A runnable ecommerce example exercises the full API end to end:
[`examples/ecommerce-kitchen-sink.ts`](examples/ecommerce-kitchen-sink.ts).
See [docs/kitchen-sink.md](docs/kitchen-sink.md) for the walkthrough.

## Remaining TODOs

This is a priority order, not a release commitment. The guiding rule is to
remove the most common reasons to drop to raw SQL without turning pgbuddy into
a schema toolkit or a full SQL AST.

### P0 — do next

- [x] **Join v2: multiple joins, aliases, and self-joins.** Implemented with
  chained narrow joins and schema-aware `ZodJoinQuery`.
- [x] **Many-to-many/through relations.** Junction tables are declared with
  `through` and support includes, counts, and relation filters.
- [x] **Nested includes** (`posts.comments`). Declared child relations load
  recursively with deep result types.
- [x] **Split the relation runtime out of `src/zod-table.ts`.** The batched
  loader now lives in `src/relations.ts`.
- [ ] **Run the real-PostgreSQL CI job against a live PostgreSQL 16 service.**
  The full suite has been run locally against PostgreSQL 18 on both
  postgres.js majors; the CI service job itself is still pending.

### P1 — high value, moderate effort

- [ ] **Per-column mapping and custom serialization.** `postgres.camel` covers
  the common camelCase/snake_case case, but mixed naming and custom DB types
  need per-column `mapWith`/`$type`-style hooks.
- [ ] **Validator adapter for non-Zod libraries.** Zod is required today; a
  small adapter interface should be designed before a second validator is
  added, without weakening validation.
- [ ] **Relation ordering and per-relation aggregates.** Order by a related
  field and support `count`/`sum`/`avg` per relation beyond `withCount`.
- [ ] **Prepared statements, true batch, and `toSQL()`.** These all need a
  deferred query object; postgres.js already prepares automatically, so this
  is performance/tooling work rather than a correctness gap.

### P2 — useful, but raw SQL is acceptable

- [ ] Expression columns in `groupBy`; typed `HAVING`.
- [ ] `UPDATE … FROM`, `DELETE … USING`, and `INSERT … SELECT`.
- [ ] Query cancellation and streaming access.

### P3 — out of scope / use raw SQL

- CTEs, set operations (`UNION`/`INTERSECT`/`EXCEPT`), and typed window
  functions.
- Views, enums, domains, RLS, generated columns, and constraints as schema
  metadata.
- Migrations, introspection, and code generation.
- Relation writes (`connect`/`create`/`update` graphs).
- Multi-dialect support (Postgres-only by design).

### Recommended next three

1. **Per-column mapping** — unblocks production schemas with mixed naming or
   custom types.
2. **Validator adapter** — prepare for validation libraries beyond Zod.
3. **Relation ordering and per-relation aggregates** — rounds out the relation
   API before lifecycle work.

## Compatibility

- **Zod v4 or newer is required.**
- **postgres.js v3 (>= 3.4.5) and v4** are supported. CI runs the full test suite against both `3.4.5` and `4.1.1`.
- pgbuddy imports postgres.js **types only**, so your postgres.js major version does not affect pgbuddy's runtime or module format.
- postgres.js v4 lets the server decide parameter types, which changes some `Date` / `bigint` / array behaviour compared with v3. See [Upgrading from v3](https://github.com/porsager/postgres#upgrading-from-v3).

## Documentation

- [Introduction](docs/introduction.md)
- [CRUD operations](docs/crud-operations.md)
- [Select operations](docs/select-operations.md)
- [Chainable API](docs/chainable-api.md)
- [Data transformation](docs/data-transformation.md)
- [API reference](docs/api-reference.md)
- [Ecommerce kitchen sink](docs/kitchen-sink.md)
- [Examples](docs/examples.md)

---

## License

[MIT](LICENSE)
