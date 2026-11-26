# Select Operations

These examples assume a table is already set up. See the
[Introduction](https://github.com/kiranojhanp/pgbuddy/blob/master/docs/introduction.md) or [Chainable API](https://github.com/kiranojhanp/pgbuddy/blob/master/docs/chainable-api.md) for setup.
The schema used here has fields: `id`, `name`, `email`, `status`, `age`,
`last_login`, `deleted_at`, `created_at`.

## Basic queries

```typescript
const users = await userTable.where({ status: "active" }).findMany();

const selected = await userTable
  .select(["id", "name", "email"])
  .where({ status: "active" })
  .findMany();
```

With a Zod schema, `select(["*"])` expands to every schema column — never
`SELECT *`.

## Filtering

### Object conditions

```typescript
const users = await userTable
  .where({ status: "active", deleted_at: null })
  .findMany();
```

### Operator conditions

```typescript
const users = await userTable
  .where([
    { field: "age", operator: ">=", value: 18 },
    { field: "status", operator: "=", value: "active" },
    { field: "last_login", operator: ">", value: lastMonth },
  ])
  .findMany();
```

### Composable predicates

Predicates compose and compile to parameterized SQL:

```typescript
import { and, contains, eq, isNull, not, or } from "pgbuddy";

const users = await userTable
  .where(or(eq("status", "active"), eq("status", "pending")))
  .where(not(eq("email", "blocked@example.com")))
  .where(contains("name", "ali"))
  .where(isNull("deleted_at"))
  .findMany();
```

- Comparisons: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`
- Sets: `inArray`, `notInArray`
- NULL: `isNull`, `isNotNull`
- Patterns: `like`, `ilike`; `contains`, `startsWith`, `endsWith` escape wildcards
- Ranges: `between`, `notBetween`
- Boolean: `and`, `or`, `not`

Repeated `.where()` calls are combined with `AND`.

### Raw conditions

```typescript
const users = await userTable
  .whereRaw(sql`lower(email) = ${email}`)
  .findMany();
```

`whereRaw` is a trusted escape hatch with no identifier validation.

## Sorting

```typescript
const users = await userTable
  .orderBy([
    { column: "status", direction: "ASC" },
    { column: "created_at", direction: "DESC", nulls: "last" },
  ])
  .findMany();
```

`orderByRaw` adds an expression and combines with `orderBy`:

```typescript
await userTable
  .orderBy([{ column: "status", direction: "ASC" }])
  .orderByRaw(sql`lower(name) ASC`)
  .findMany();
```

## Pagination

### Limit and offset

```typescript
const users = await userTable.skip(20).take(10).findMany();
```

`take` is capped at 10,000 rows by default (`maxTake`). Set `defaultTake` on the
client/table to bound every `findMany`.

### Keyset pagination

```typescript
const page = await userTable
  .orderBy([{ column: "id", direction: "ASC" }])
  .cursor({ id: lastId })
  .take(20)
  .findMany();
```

Composite cursors follow the leading `orderBy` columns:

```typescript
const next = await userTable
  .orderBy([
    { column: "status", direction: "ASC" },
    { column: "id", direction: "ASC" },
  ])
  .cursor({ status: "active", id: lastId })
  .take(20)
  .findMany();
```

## DISTINCT

```typescript
const statuses = await userTable.select(["status"]).distinct().findMany();

const latestPerStatus = await userTable
  .distinctOn(["status"])
  .orderBy([
    { column: "status", direction: "ASC" },
    { column: "created_at", direction: "DESC" },
  ])
  .findMany();
```

`DISTINCT ON` also accepts expressions:

```typescript
const uniqueDomains = await userTable
  .select(["email"])
  .distinctOnExpr([sql`lower(split_part(email, '@', 2))`])
  .orderByRaw(sql`lower(split_part(email, '@', 2)), id`)
  .findMany();
```

## Computed fields

```typescript
import { sqlExpr } from "pgbuddy";

const users = await userTable
  .where({ status: "active" })
  .selectExpr({ lowerEmail: sqlExpr<string>(sql`lower(email)`) })
  .findMany();
```

`findMany({ computed: { ... } })` is the non-terminal form. Computed fields also
work with `findFirst`/`findUnique`/`find*OrThrow`, and on writes via
`RETURNING`.

## Grouped aggregates

```typescript
const rows = await userTable
  .where({ status: "active" })
  .groupBy(["status"], { count: sqlExpr<number>(sql`count(*)::int`) })
  .having(sql`count(*) > 1`)
  .orderBy([{ column: "status", direction: "ASC" }])
  .findMany();
```

`having` is raw SQL. Cast aggregates like `count(*)::int` for JavaScript
numbers. Relations are not available on grouped results.

## Joins

```typescript
const rows = await db
  .table<User>("users")
  .innerJoin("posts", {
    columns: ["id", "user_id", "title"],
    on: sql`"posts"."user_id" = "users"."id"`,
  })
  .whereRaw(sql`"users"."status" = 'active'`)
  .findMany();
```

The right row is nested under the join name. `leftJoin` returns `{...} | null`.
With a Zod table, pass the right schema instead of `columns`. Multiple joins and
aliases are not modeled yet.

## Row locking

```typescript
await db.transaction(async (tx) => {
  const rows = await tx
    .table("jobs", JobSchema)
    .where({ status: "pending" })
    .for("update", { skipLocked: true })
    .take(10)
    .findMany();
});
```

## Performance tips

- Use `select` to return only the columns you need.
- Index the fields you filter and sort on.
- Bound result sets with `take`/`defaultTake`.
- Prefer keyset cursors over large offsets.
- Put the most selective conditions first.
