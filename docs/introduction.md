# PgBuddy Documentation

## Introduction

`postgres.js` has TypeScript support, but it's built around raw SQL strings. That gives you no structured query API, no runtime validation of results against a schema, and no automatic result typing — you have to write generics by hand and keep them in sync with your actual table.

PgBuddy wraps postgres.js with a chainable, schema-backed API that fixes all three. Your queries know the shape of your table, inputs are validated before they hit the database, and result types are inferred from your Zod schema automatically.

### Source of truth

PgBuddy defaults to Zod as the source of truth: you define the shape in code, the database is expected to match. If you'd rather go the other way — generate types from a live PostgreSQL schema instead — [Kanel](https://kristiandupont.github.io/kanel/) introspects your database and generates TypeScript types and Zod schemas from it. Those schemas work directly with `db.table()`.

### Features

- Structured query API — no raw SQL strings for common operations
- Runtime schema validation via Zod (inputs and outputs)
- Result types inferred automatically from your schema
- SQL injection prevention via parameterized queries
- Filtering, sorting, and pagination built in
- Full access to postgres.js when you need it

### Installation

```bash
npm install pgbuddy postgres
# or
yarn add pgbuddy postgres
```

### Quick Start

```typescript
import postgres from 'postgres';
import { z } from 'zod';
import { PgBuddyClient } from 'pgbuddy';

// Initialize postgres connection
const sql = postgres('postgres://username:password@localhost:5432/dbname');

// Create PgBuddy client
const db = new PgBuddyClient(sql);

const UserSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  email: z.string().email(),
  created_at: z.date(),
});

const users = db.table('users', UserSchema);
```

### Using the chainable API

```typescript
const activeUsers = await users
  .where({ status: 'active' })
  .orderBy([{ column: 'created_at', direction: 'DESC' }])
  .findMany();
```

See the [Chainable API](chainable-api.md) guide for the full reference.

### Advanced usage

PgBuddy is a thin TypeScript layer over postgres.js. For anything beyond CRUD, use the `sql` instance directly:

- Transactions: `sql.begin(...)` reserves a connection; postgres.js rolls back on errors automatically.
- Ordering: row order is only guaranteed inside `sql.begin()` or with `max: 1`.
- Raw SQL: `sql.unsafe(...)` for cases that need it, but it skips injection protection if misused.
- Case transforms: `postgres.camel`, `postgres.toCamel`, `postgres.fromCamel`.
- Diagnostics: `error.query` / `error.parameters`, or `debug: true` on the connection.

For all postgres.js features, refer to the [postgres.js documentation](https://github.com/porsager/postgres).

### Next Steps

- [CRUD Operations](crud-operations.md)
- [Select Operations](select-operations.md)
- [Data Transformation](data-transformation.md)
- [API Reference](api-reference.md)
- [Examples](examples.md)
- [postgres.js documentation](https://github.com/porsager/postgres)
