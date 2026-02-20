# PgBuddy

A no-nonsense, type-safe and [tiny](https://bundlephobia.com/package/pgbuddy) query builder wrapping `postgres.js`.

![PGBuddy banner](assets/banner.png)

## Features

- Type-safe queries with TypeScript
- SQL injection prevention
- Simple CRUD operation builders
- Chainable query API
- Just a thin wrapper over postgres.js

## Installation

```bash
npm install pgbuddy postgres
```

If you want schema-first typing and validation with Zod:

```bash
npm install zod
```

## Quick Start

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

// All ops validate against the schema
await users.create({
  id: 1,
  email: "user@example.com",
  name: "User",
  active: true,
  last_login: null,
});

// Updates validate against schema.partial()
await users.where({ id: 1 }).update({ active: false });

// Where keys and values are validated
await users.where({ email: "user@example.com" }).findFirst();
```

<details>
<summary>Chainable API (no Zod)</summary>

```typescript
import postgres from "postgres";
import { PgBuddyClient, type Insertable, type Model } from "pgbuddy";

// Create postgres.js connection
const sql = postgres("postgres://username:password@localhost:5432/dbname");
const db = new PgBuddyClient(sql);

interface User {
  id: number;
  email: string;
  name: string;
  active: boolean;
}

// Define table
// Option A: simple insert type
type UserInsert = Insertable<User, "id">;
const users = db.table<User, UserInsert>("users");

// Option B: grouped model types
type UserModel = Model<User, "id">;
const users2 = db.table<User, UserModel["Insert"]>("users");

// Option C: helper for auto-generated keys
const users3 = db.tableWithInsert<User, "id">("users");

// Find users with chainable methods
const activeUsers = await users
  .where({ active: true })
  .orderBy([{ column: "id", direction: "DESC" }])
  .take(10)
  .findMany();

// Find one (nullable)
const newestUser = await users
  .where({ active: true })
  .orderBy([{ column: "id", direction: "DESC" }])
  .findFirst();

// Find unique (nullable, throws if multiple match)
const userByEmail = await users
  .where({ email: "user@example.com" })
  .findUnique();

// Count matching records
const activeCount = await users.where({ active: true }).count();

// Create a user
const newUser = await users.create({
  email: "user@example.com",
  name: "User",
  active: true,
});

// Create multiple users
const newUsers = await users.createMany([
  { email: "user1@example.com", name: "User 1", active: true },
  { email: "user2@example.com", name: "User 2", active: true },
]);

// Update users (returns an array)
const updatedUsers = await users.where({ id: 1 }).update({ active: false });
const [updatedUser] = updatedUsers;

// Delete users (returns an array)
const deletedUsers = await users.where({ id: 1 }).delete();
const [deletedUser] = deletedUsers;
```

</details>

## Documentation

PgBuddy documentation:

- [Introduction](./docs/introduction.md)
- [Chainable API](./docs/chainable-api.md)
- [CRUD Operations](./docs/crud-operations.md)
- [Select Operations](./docs/select-operations.md)
- [API Reference](./docs/api-reference.md)
- [Examples](./docs/examples.md)
- [Data Transformation](./docs/data-transformation.md)

## Advanced Features (postgres.js)

PgBuddy is a thin DX layer. For advanced capabilities, use the underlying `sql` instance from postgres.js directly:

- Transactions: use `sql.begin(...)` to reserve a connection; postgres.js automatically rolls back on errors.
- Ordering guarantees: postgres.js notes ordering is only guaranteed when using `sql.begin()` or `max: 1`.
- Unsafe SQL: `sql.unsafe(...)` exists for advanced cases but can introduce SQL injection risk if misused.
- Data transforms: use `transform` helpers like `postgres.camel`, `postgres.toCamel`, `postgres.fromCamel`.
- Error diagnostics: access `error.query` / `error.parameters` or set `debug: true`.

## License

MIT

## Contributing

Contributions welcome!
