# PgBuddy Documentation

## Introduction

`postgres.js` has TypeScript support, but it's built around raw SQL strings. PgBuddy wraps it with a chainable, schema-backed API: queries know the shape of your table, inputs are validated before they hit the database, and result types are inferred from your Zod schema.

PgBuddy stays deliberately small. It models the common single-table operations, one-hop relations, narrow joins, grouped aggregates, and typed SQL expressions. Everything else remains available through the underlying postgres.js instance.

### Source of truth

PgBuddy defaults to Zod: you define the shape in code, the database is expected to match. If you prefer generating types from a live PostgreSQL schema instead, [Kanel](https://kristiandupont.github.io/kanel/) introspects your database and generates TypeScript types and Zod schemas from it. Those schemas work directly with `db.table()`.

### Features

- Structured query API for common CRUD operations
- Runtime schema validation via Zod (inputs)
- Result types inferred from your schema
- Parameterized values and escaped identifiers
- Composable predicates (`eq`, `and`, `or`, `not`, `inArray`, `contains`, ...)
- Projections, `DISTINCT`, `DISTINCT ON` expressions, `NULLS FIRST/LAST`, and keyset cursors
- Computed SQL expressions in selects and writes
- Transactions with isolation/read-only/deferrable options
- Read-only relations with `include`, `withCount`, and relation filters
- Narrow `innerJoin`/`leftJoin` with nested right-side rows
- `groupBy` / `having` with typed aggregate aliases
- Row locking (`FOR UPDATE`, `FOR SHARE`, `SKIP LOCKED`, `NOWAIT`)
- Stable `QueryError.code` values and PostgreSQL error helpers
- Raw SQL through `db.sql` whenever the typed surface stops

### Installation

```bash
npm install pgbuddy postgres zod
```

Zod is the default: schema-backed table builders are created from a Zod schema,
so writes are validated before they reach PostgreSQL. `tableWithValidator` /
`tableWithAdapter` can bridge other validation libraries for core CRUD. Both postgres.js v3 (`>= 3.4.5`) and v4
are supported; the test suite runs against both majors.

### Quick start

```typescript
import postgres from "postgres";
import { z } from "zod";
import { PgBuddyClient } from "pgbuddy";

const sql = postgres("postgres://username:password@localhost:5432/dbname");
const db = new PgBuddyClient(sql);

const UserSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  email: z.string().email(),
  created_at: z.date(),
});

const users = db.table("users", UserSchema);
```

### Why Zod is required

pgbuddy is a validation-first helper. Plain TypeScript types disappear at
runtime, so a table built from an interface alone cannot reject unknown columns,
wrong value types, or malformed input. Every `db.table()` therefore requires a
Zod object schema. The schema defines the write contract; Zod strips unknown
keys by default and `z.strictObject` rejects them.

A future release may support other validation libraries through an adapter.
Plain TypeScript-only tables are intentionally not supported.

### Using the chainable API

```typescript
const activeUsers = await users
  .where({ status: "active" })
  .orderBy([{ column: "created_at", direction: "DESC" }])
  .take(20)
  .findMany();
```

See the [Chainable API](chainable-api.md) guide for the full reference.

### Advanced usage

PgBuddy is a thin TypeScript layer over postgres.js. For anything beyond its
typed surface, use the `sql` instance directly:

- Transactions: `db.transaction(...)` or `sql.begin(...)`.
- Raw SQL: `db.sql` (values are still parameterized) or `sql.unsafe(...)`.
- Case transforms: `postgres.camel`, `postgres.toCamel`, `postgres.fromCamel`.
- Diagnostics: `error.query` / `error.parameters`, or `debug: true` on the connection.

For all postgres.js features, see the [postgres.js documentation](https://github.com/porsager/postgres).

### Security

PgBuddy binds all values as query parameters and relies on postgres.js to
escape identifiers, so user-supplied values cannot break out of SQL. Two
footguns remain at the call site:

- **Write payloads are column maps.** `create`, `createMany` and `update` write
  every non-`undefined` key in the object they are given. Do not pass an
  unvalidated request body — an attacker could set columns such as `role` or
  `is_admin`. Use a Zod schema, a `z.strictObject` schema, or the
  `allowedColumns` option.
- **`select`/`orderBy` column names are not user input.** With a plain `Table`,
  treat them as developer-controlled; `ZodTable` checks them against the schema.

See the [API reference](api-reference.md#options) for `allowedColumns`,
`maxTake`, `strictNames`, and `allowSchema`.

### Next steps

- [CRUD Operations](crud-operations.md)
- [Select Operations](select-operations.md)
- [Chainable API](chainable-api.md)
- [Data Transformation](data-transformation.md)
- [API Reference](api-reference.md)
- [Examples](examples.md)
- [Ecommerce kitchen sink](kitchen-sink.md)
- [postgres.js documentation](https://github.com/porsager/postgres)
