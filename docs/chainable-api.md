# Chainable API

## Defining tables

```typescript
import { z } from "zod";
import { PgBuddyClient } from "pgbuddy";

const sql = postgres("postgres://...");
const db = new PgBuddyClient(sql);

const UserSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  email: z.string().email(),
  status: z.enum(["active", "inactive"]),
  created_at: z.date(),
});

const users = db.table("users", UserSchema);
```

## Find operations

### findMany

```typescript
// All records
const allUsers = await users.findMany();

// With conditions
const activeUsers = await users.where({ status: "active" }).findMany();

// Select specific fields
const userEmails = await users.select(["id", "email"]).findMany();

// With pagination and sorting
const paginatedUsers = await users
  .skip(10)
  .take(5)
  .orderBy([{ column: "created_at", direction: "DESC" }])
  .findMany();
```

`findMany` without `take` returns every matching row. `take` is capped at
10,000 rows by default; change the cap with the `maxTake` option.

### findFirst

```typescript
const firstUser = await users
  .where({ status: "active" })
  .orderBy([{ column: "created_at", direction: "DESC" }])
  .findFirst();
```

### findUnique

```typescript
// Throws QueryError if more than one record matches
const uniqueUser = await users.where({ id: 1 }).findUnique();
```

## Mutations

### Create

```typescript
const newUser = await users.create({
  name: "John Doe",
  email: "john@example.com",
  status: "active",
  created_at: new Date(),
});

const newUsers = await users.createMany([
  { name: "John Doe", email: "john@example.com", status: "active", created_at: new Date() },
  { name: "Jane Smith", email: "jane@example.com", status: "active", created_at: new Date() },
], {
  onConflict: {
    target: ["email"],
    update: ["name"],
    set: { updated_at: sql`now()` },
  },
  computed: { lowerEmail: sqlExpr<string>(sql`lower(email)`) },
});
```

`undefined` values are omitted. Large batches are chunked automatically. Use
`skipDuplicates: true` for `ON CONFLICT DO NOTHING`, or `onConflict` to update
conflicting rows.

### Update

```typescript
// Returns an array of updated records
const [updatedUser] = await users.where({ id: 1 }).update({ status: "inactive" });
```

### Delete

```typescript
// Returns an array of deleted records
const [deletedUser] = await users.where({ id: 1 }).delete();
```

## Upsert and bulk inserts

```typescript
const user = await users.upsert({
  where: { email: "ada@example.com" },
  create: { email: "ada@example.com", name: "Ada" },
  update: { name: "Ada Lovelace" },
});

// Skip rows that violate a unique index instead of failing the batch
const inserted = await users.createMany(records, {
  skipDuplicates: true,
  computed: { lowerEmail: sqlExpr<string>(sql`lower(email)`) },
});
```

## Grouped aggregates

```typescript
const rows = await users
  .where({ status: "active" })
  .groupBy(["status"], { count: sqlExpr<number>(sql`count(*)::int`) })
  .having({ count: { gt: 1 } })
  .findMany();
```

`having` accepts typed aggregate conditions such as `{ count: { gt: 1 } }` or a
raw SQL fragment. `orderBy`, `skip`, and `take` compose with the grouped query.
Relations are not available on grouped results.

## Computed fields

Add aliased SQL expressions to a find query with `computed`:

```typescript
import { sqlExpr } from "pgbuddy";

const rows = await users.findMany({
  computed: {
    lowerEmail: sqlExpr<string>(sql`lower(email)`),
  },
});
```

`findFirst`, `findUnique`, and `find*OrThrow` accept the same option. The
chainable form is:

```typescript
const rows = await users
  .where({ status: "active" })
  .selectExpr({ lowerEmail: sqlExpr<string>(sql`lower(email)`) })
  .findMany();
```

## Distinct and cursor pagination

```typescript
// Unique projected values
const statuses = await users.select(["status"]).distinct().findMany();

// One row per status (PostgreSQL DISTINCT ON)
const latest = await users
  .distinctOn(["status"])
  .orderBy([{ column: "status", direction: "ASC" }, { column: "id", direction: "DESC" }])
  .findMany();

// Keyset pagination
const page = await users
  .orderBy([{ column: "id", direction: "ASC" }])
  .cursor({ id: lastId })
  .take(20)
  .findMany();

// DISTINCT ON expression
const domains = await users
  .select(["email"])
  .distinctOnExpr([sql`lower(split_part(email, '@', 2))`])
  .orderByRaw(sql`lower(split_part(email, '@', 2)), id`)
  .findMany();

// Composite cursor
const next = await users
  .orderBy([
    { column: "status", direction: "ASC" },
    { column: "id", direction: "ASC" },
  ])
  .cursor({ status: "active", id: lastId })
  .take(20)
  .findMany();
```

## Unique lookups

```typescript
const users = db.table("users", UserSchema, { unique: [["email"]] });

const user = await users.whereUnique({ email: "ada@example.com" }).findUnique();
```

`whereUnique` validates the key against the configured unique sets and lets
`findUnique` fetch a single row instead of checking for duplicates.

## Relations

Relations are declared on the table and loaded with `include` (read-only,
`find*` methods only):

```typescript
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
  .withCount("posts")
  .findMany();
```

`include` accepts a refinement callback or a declarative
`{ where, orderBy, take, select }` object. `withCount` adds `<name>_count`, and
`whereRelated` / `whereMissing` / `whereEvery` filter parents by related rows.
`whereEvery` without a refinement is a no-op.

## Joins

```typescript
const rows = await users
  .innerJoin("posts", PostSchema, sql`"posts"."user_id" = "users"."id"`)
  .whereRaw(sql`"users"."status" = 'active'`)
  .findMany();

// leftJoin: posts is {...} | null
```

Right-side rows are nested under the join name. Use qualified columns in
`whereRaw`/`orderByRaw`. Base tables can pass explicit `columns` instead of a
schema.

## Counts, existence, and aggregates

```typescript
const count = await users.where({ status: "active" }).count();
const exists = await users.where({ email }).exists();

const totals = await users.aggregate({
  count: true,
  countDistinct: ["status"],
  sum: ["views"],
});
```

## Advanced where conditions

```typescript
const results = await users
  .where([
    { field: "name", operator: "LIKE", value: "John", pattern: "startsWith" },
    { field: "created_at", operator: ">", value: new Date("2023-01-01") },
  ])
  .findMany();
```

## Composable predicates

For OR / NOT and other composable filters, import the predicate helpers. They
compile to parameterized SQL and can be mixed with object conditions. Repeated
`.where()` calls are combined with `AND`.

```typescript
import { and, contains, eq, inArray, isNull, not, or } from "pgbuddy";

const results = await users
  .where(or(eq("status", "active"), eq("status", "pending")))
  .where(not(eq("email", "blocked@example.com")))
  .where(contains("name", "Jo"))
  .findMany();
```

- Comparisons: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`
- Sets: `inArray`, `notInArray`
- NULL: `isNull`, `isNotNull`
- Patterns: `like`, `ilike` (SQL wildcard semantics); `contains`, `startsWith`,
  `endsWith` (wildcard characters are escaped)
- Ranges: `between`, `notBetween`
- Boolean: `and`, `or`, `not`
- JSONB: `jsonContains`, `jsonHasKey`, `jsonHasAnyKey`, `jsonHasAllKeys`
- Arrays: `arrayContains`, `arrayContainedBy`, `arrayOverlaps`

For anything the helpers do not cover, `whereRaw` accepts a postgres.js
fragment:

```typescript
await users.whereRaw(sql`lower(email) = ${email}`).findMany();
```

## Available operators

- `=`, `!=`, `>`, `<`, `>=`, `<=`
- `LIKE`, `ILIKE` — with optional patterns: `startsWith`, `endsWith`, `contains`, `exact`
- `IN`
- `IS NULL`, `IS NOT NULL`

## Pagination and execution

Page plus total in one batch:

```typescript
const { rows, total } = await users
  .where({ status: "active" })
  .orderBy([{ column: "created_at", direction: "DESC" }])
  .skip(0)
  .take(25)
  .findManyAndCount();
```

Typed deferred batching:

```typescript
const [activeUsers, totalActive] = await db.batch([
  users.where({ status: "active" }).findMany(),
  users.where({ status: "active" }).count(),
]);
```

Parameterized prepared SELECT:

```typescript
const findUser = users
  .where({ id: db.param<number>("id") })
  .prepareParams<{ id: number }>();

const ada = await findUser({ id: 1 });
```

Streaming and cancellation:

```typescript
const controller = new AbortController();

for await (const batch of users
  .where({ status: "active" })
  .signal(controller.signal)
  .stream(100)) {
  // batch is an array of rows
}
```

Explain a SELECT:

```typescript
const plan = await users.where({ status: "active" }).explain();
```

Typed expressions:

```typescript
await users
  .whereExpr(sqlExpr<boolean>(sql`lower(email) = ${email}`))
  .orderByExpr(sqlExpr<string>(sql`lower(name)`), { direction: "ASC" })
  .findMany();
```

See [Advanced execution](https://github.com/kiranojhanp/pgbuddy/blob/master/docs/advanced.md)
for batchSQL, retries, SQL write helpers, JSONB/array predicates, and prepared
plan details.

## Transactions and locking

```typescript
await db.transaction(
  async (tx) => {
    const users = tx.table("users", UserSchema);
    await users.create({ email: "ada@example.com", name: "Ada" });

    const jobs = await tx
      .table("jobs", JobSchema)
      .where({ status: "pending" })
      .for("update", { skipLocked: true })
      .take(10)
      .findMany();
  },
  { isolationLevel: "serializable", readOnly: false, deferrable: false }
);
```

`for` supports `"update"`, `"share"`, `"no key update"`, and `"key share"`, with
`skipLocked` or `noWait`.

## Error handling

PgBuddy throws two error types:

- `TableError` — invalid table configuration
- `QueryError` — invalid queries, missing `where` on mutations, or multiple results from `findUnique`; `error.code` is stable

```typescript
try {
  const user = await users.where({ id: 999 }).findUnique();
} catch (error) {
  if (error instanceof QueryError) {
    console.error("Query error:", error.message);
  } else {
    console.error("Unexpected error:", error);
  }
}
```
