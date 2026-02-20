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

## Quick Start

### New Chainable API

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

// Find users with chainable methods
const activeUsers = await users
  .where({ active: true })
  .orderBy([{ column: "id", direction: "DESC" }])
  .take(10)
  .findMany();

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

// Update a user
const updatedUser = await users.where({ id: 1 }).update({ active: false });

// Delete a user
const deletedUser = await users.where({ id: 1 }).delete();
```

## Documentation

PgBuddy documentation:

- [Introduction](./docs/introduction.md)
- [Chainable API](./docs/chainable-api.md)
- [CRUD Operations](./docs/crud-operations.md)
- [Select Operations](./docs/select-operations.md)
- [API Reference](./docs/api-reference.md)
- [Examples](./docs/examples.md)
- [Data Transformation](./docs/data-transformation.md)

## Advanced Features

PgBuddy is a wrapper around postgres.js. For advanced PostgreSQL features like:

- Transactions
- Prepared Statements
- Listen/Notify
- Copy Operations
- Custom Types
- Connection Pooling

Please refer to the [postgres.js documentation](https://github.com/porsager/postgres).

## License

MIT

## Contributing

Contributions welcome!
