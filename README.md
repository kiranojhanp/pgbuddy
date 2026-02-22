# PgBuddy

> A no-nonsense, type-safe, [tiny](https://bundlephobia.com/package/pgbuddy) query builder wrapping `postgres.js`.

![PgBuddy banner](assets/banner.png)

---

## The problem

`postgres.js` has TypeScript support, but it's built around raw SQL strings.

Typos in column names surface at runtime, not compile time:

```typescript
// postgres.js — no error until this query runs
const result = await sql`
  SELECT * FROM users WHERE emal = ${email}
`;
```

```typescript
// PgBuddy — caught at compile time
await users.where({ emal: email }); // TS error: 'emal' does not exist on type
```

Results aren't validated against any schema:

```typescript
// postgres.js — result is typed as any[], you trust the DB matches your type
const result = await sql<User[]>`SELECT * FROM users`;
const user = result[0]; // could be anything
```

```typescript
// PgBuddy — every result is validated against your Zod schema at runtime
const user = await users.findFirst();
// throws if the DB returns a shape that doesn't match UserSchema
```

Without a schema, you write types by hand and keep them in sync with the database yourself:

```typescript
// postgres.js — you define this and update it whenever the DB changes
interface User {
  id: number;
  email: string;
  name: string;
  status: string;
  created_at: Date;
}
const result = await sql<User[]>`SELECT * FROM users`;
```

```typescript
// PgBuddy — result type comes from your Zod schema
const UserSchema = z.object({
  id: z.number().int(),
  email: z.string().email(),
  name: z.string(),
  status: z.string(),
  created_at: z.date(),
});

const users = db.table("users", UserSchema);
const user = await users.findFirst();
// typed as { id: number; email: string; name: string; status: string; created_at: Date } | null
```

### Source of truth

PgBuddy defaults to Zod as the source of truth: you define the shape in code, the database is expected to match. If you'd rather go the other way — generate types from a live PostgreSQL schema instead — [Kanel](https://kristiandupont.github.io/kanel/) introspects your database and generates TypeScript types and Zod schemas from it. Those schemas work directly with `db.table()`.

---

## Table of contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Chainable API](#chainable-api)
- [Advanced usage](#advanced-usage)
- [Documentation](#documentation)
- [License](#license)

---

## Installation

```bash
npm install pgbuddy postgres
```

For schema validation with Zod:

```bash
npm install zod
```

---

## Quick start

**Without Zod** — use a plain TypeScript interface and the `Insertable` helper to mark auto-generated keys as optional on insert:

```typescript
import postgres from "postgres";
import { PgBuddyClient, type Insertable } from "pgbuddy";

interface User {
  id: number;
  name: string;
  email: string;
  status: string;
  created_at: Date;
}

type UserInsert = Insertable<User, "id">;

const sql = postgres("postgres://username:password@localhost:5432/dbname");
const db = new PgBuddyClient(sql);

const users = db.table<User, UserInsert>("users");

// Create — id is optional because it's in the auto-keys list
await users.create({ name: "Alice", email: "alice@example.com", status: "active", created_at: new Date() });

// Update
await users.where({ id: 1 }).update({ status: "inactive" });

// Query
await users.where({ status: "active" }).findFirst();
```

**With Zod** — the schema validates every result at runtime:

```typescript
import postgres from "postgres";
import { z } from "zod";
import { PgBuddyClient } from "pgbuddy";

const sql = postgres("postgres://username:password@localhost:5432/dbname");
const db = new PgBuddyClient(sql);

const UserSchema = z.object({
  id: z.number().int(),
  email: z.string().email(),
  name: z.string(),
  status: z.string(),
  created_at: z.date(),
});

const users = db.table("users", UserSchema);

// Create — validated against the schema on insert and on the returned row
await users.create({
  email: "user@example.com",
  name: "User",
  status: "active",
  created_at: new Date(),
});

// Update — validated against schema.partial()
await users.where({ id: 1 }).update({ status: "inactive" });

// Query — where keys and values are validated
await users.where({ email: "user@example.com" }).findFirst();
```

---

## Chainable API

The examples below use a plain TypeScript interface. The same API works identically with a Zod-backed `ZodTable`.

```typescript
interface User {
  id: number;
  name: string;
  email: string;
  status: string;
  created_at: Date;
}

type UserInsert = Insertable<User, "id">;
const users = db.table<User, UserInsert>("users");

// Find many
const activeUsers = await users
  .where({ status: "active" })
  .orderBy([{ column: "created_at", direction: "DESC" }])
  .take(10)
  .findMany();

// Select specific columns
const emails = await users
  .select(["id", "email"])
  .where({ status: "active" })
  .findMany();

// Pagination — skip + take
const page2 = await users
  .skip(10)
  .take(5)
  .orderBy([{ column: "created_at", direction: "DESC" }])
  .findMany();

// Find first (returns null if none match)
const newestActive = await users
  .where({ status: "active" })
  .orderBy([{ column: "created_at", direction: "DESC" }])
  .findFirst();

// Find unique (returns null if none, throws if multiple match)
const userByEmail = await users
  .where({ email: "user@example.com" })
  .findUnique();

// Count
const activeCount = await users.where({ status: "active" }).count();

// Create one (id is auto-generated, not required)
const newUser = await users.create({
  name: "Alice",
  email: "alice@example.com",
  status: "active",
  created_at: new Date(),
});

// Create many
const newUsers = await users.createMany([
  { name: "Bob", email: "bob@example.com", status: "active", created_at: new Date() },
  { name: "Carol", email: "carol@example.com", status: "inactive", created_at: new Date() },
]);

// Update (returns updated rows)
const updated = await users.where({ id: 1 }).update({ status: "inactive" });

// Delete (returns deleted rows)
const deleted = await users.where({ id: 1 }).delete();

// Advanced where — operators and LIKE patterns
const results = await users
  .where([
    { field: "status", operator: "=", value: "active" },
    { field: "name", operator: "LIKE", value: "Ali", pattern: "startsWith" },
  ])
  .orderBy([{ column: "created_at", direction: "DESC" }])
  .findFirst();
```

---

## Advanced usage

PgBuddy is a thin layer over `postgres.js`. For anything beyond CRUD, use the underlying `sql` instance directly:

- Transactions: `sql.begin(...)` reserves a connection; postgres.js rolls back on errors automatically.
- Ordering: row order is only guaranteed inside `sql.begin()` or with `max: 1`.
- Raw SQL: `sql.unsafe(...)` bypasses injection protection — use carefully.
- Case transforms: `postgres.camel`, `postgres.toCamel`, `postgres.fromCamel`.
- Diagnostics: `error.query`, `error.parameters`, or `debug: true` on the connection.

---

## Documentation

- [Introduction](./docs/introduction.md)
- [Chainable API](./docs/chainable-api.md)
- [CRUD operations](./docs/crud-operations.md)
- [Select operations](./docs/select-operations.md)
- [API reference](./docs/api-reference.md)
- [Examples](./docs/examples.md)
- [Data transformation](./docs/data-transformation.md)

---

## Roadmap

Zod is the only supported validation library right now. The next version will add adapters for Yup, Valibot, and a custom validator interface — so you can bring whatever schema library your project already uses.

---

## License

MIT — contributions welcome.
