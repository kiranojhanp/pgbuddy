# PgBuddy Documentation

## Introduction

PgBuddy is a type-safe query builder that wraps [postgres.js](https://github.com/porsager/postgres). It gives you a typed interface for common CRUD operations while keeping full access to postgres.js underneath.

### Features

- TypeScript support with typed queries and results
- SQL injection prevention via parameterized queries
- Chainable interface for CRUD operations
- Lightweight — no overhead beyond postgres.js
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

- **Transactions** — `sql.begin(...)` reserves a connection; postgres.js rolls back on errors automatically.
- **Ordering guarantees** — row order is only guaranteed inside `sql.begin()` or with `max: 1`.
- **Raw SQL** — `sql.unsafe(...)` for cases that need it, but it skips injection protection if misused.
- **Data transforms** — `postgres.camel`, `postgres.toCamel`, `postgres.fromCamel`.
- **Error diagnostics** — `error.query` / `error.parameters`, or `debug: true` on the connection.

For all postgres.js features, refer to the [postgres.js documentation](https://github.com/porsager/postgres).

### Next Steps

- [CRUD Operations](crud-operations.md)
- [Select Operations](select-operations.md)
- [Data Transformation](data-transformation.md)
- [API Reference](api-reference.md)
- [Examples](examples.md)
- [postgres.js documentation](https://github.com/porsager/postgres)
