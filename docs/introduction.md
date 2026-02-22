# PgBuddy Documentation

## Introduction

PgBuddy is a type-safe query builder that wraps [postgres.js](https://github.com/porsager/postgres). It gives you a typed interface for common CRUD operations while keeping full access to postgres.js underneath.

### Features

- Full TypeScript support with strongly typed queries and results
- SQL injection prevention through parameterized queries
- Simple interface for Create, Read, Update, and Delete operations
- Lightweight wrapper over postgres.js with no additional overhead
- Support for complex filters, sorting, and pagination
- Direct access to all postgres.js features when needed

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

<details>
<summary>Chainable API (with Zod)</summary>

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
  status: z.enum(['active', 'inactive']),
  created_at: z.date()
});

const users = db.table('users', UserSchema);

// Chain methods as needed
const activeUsers = await users
  .where({ status: 'active' })
  .orderBy([{ column: 'created_at', direction: 'DESC' }])
  .findMany();
```

</details>

### Advanced Features

PgBuddy is a lightweight wrapper focused on type safety and common CRUD operations. For advanced PostgreSQL features, you can:

1. **Access the underlying postgres.js instance**:
```typescript
const db = new PgBuddyClient(sql);
// Use the sql instance directly for advanced features
const result = await sql`
  WITH RECURSIVE cte AS (...)
  SELECT * FROM cte
`;
```

2. **Use postgres.js features**:
- Transactions: use `sql.begin(...)` to reserve a connection and let postgres.js roll back on errors.
- Ordering guarantees: postgres.js notes ordering is only guaranteed when using `sql.begin()` or `max: 1`.
- Unsafe SQL: `sql.unsafe(...)` exists for advanced cases but can introduce SQL injection risk if misused.
- Data transforms: use `transform` helpers like `postgres.camel`, `postgres.toCamel`, `postgres.fromCamel`.
- Error diagnostics: access `error.query` / `error.parameters` or set `debug: true`.

For these advanced features, refer to the [postgres.js documentation](https://github.com/porsager/postgres).

### Why PgBuddy?

Type errors surface at compile time rather than runtime. You get autocomplete for table columns and query options, and TypeScript can infer result types directly.

The API covers common operations without magic — it's a thin TypeScript layer over postgres.js. WHERE clauses are required for destructive operations, and input validation is built in.

### Relationship with postgres.js

PgBuddy is built on top of postgres.js. It adds typed wrappers for common operations and doesn't modify or limit any postgres.js features. There's no performance overhead.

For anything PgBuddy doesn't cover, use postgres.js directly. This includes:
- Complex queries with CTEs
- Window functions
- Advanced PostgreSQL features
- Custom query optimization
- Connection pooling configuration
- Binary data handling
- Custom type parsers

### Next Steps

- Check out the [CRUD Operations](crud-operations.md) guide
- Learn about complex queries in the [Select Operations](select-operations.md) guide
- Learn about data transformation in the [Data Transformation](data-transformation.md) guide
- Browse the [API Reference](api-reference.md)
- See practical use cases in the [Examples](examples.md)
- Visit the [postgres.js documentation](https://github.com/porsager/postgres) for advanced features
