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
  active: boolean;
  last_login: Date | null;
}
const result = await sql<User[]>`SELECT * FROM users`;
```

```typescript
// PgBuddy — result type comes from your Zod schema
const UserSchema = z.object({
  id: z.number().int(),
  email: z.string().email(),
  name: z.string(),
  active: z.boolean(),
  last_login: z.date().nullable(),
});

const users = db.table("users", UserSchema);
const user = await users.findFirst();
// typed as { id: number; email: string; name: string; active: boolean; last_login: Date | null } | null
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
  active: z.boolean(),
  last_login: z.date().nullable(),
});

const users = db.table("users", UserSchema);

// Create — validated against the schema
await users.create({
  id: 1,
  email: "user@example.com",
  name: "User",
  active: true,
  last_login: null,
});

// Update — validated against schema.partial()
await users.where({ id: 1 }).update({ active: false });

// Query — where keys and values are validated
await users.where({ email: "user@example.com" }).findFirst();
```

---

## Chainable API

```typescript
const users = db.table("users", UserSchema);

// Find many
const activeUsers = await users
  .where({ active: true })
  .orderBy([{ column: "id", direction: "DESC" }])
  .take(10)
  .findMany();

// Find first (returns null if none match)
const newestUser = await users
  .where({ active: true })
  .orderBy([{ column: "id", direction: "DESC" }])
  .findFirst();

// Find unique (returns null if none, throws if multiple match)
const userByEmail = await users
  .where({ email: "user@example.com" })
  .findUnique();

// Count
const activeCount = await users.where({ active: true }).count();

// Create one
const newUser = await users.create({
  email: "user@example.com",
  name: "User",
  active: true,
});

// Create many
const newUsers = await users.createMany([
  { email: "user1@example.com", name: "User 1", active: true },
  { email: "user2@example.com", name: "User 2", active: true },
]);

// Update (returns array)
const [updatedUser] = await users.where({ id: 1 }).update({ active: false });

// Delete (returns array)
const [deletedUser] = await users.where({ id: 1 }).delete();
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
