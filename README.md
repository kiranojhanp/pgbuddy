# PgBuddy

<p align="center">
  <img src="assets/banner.png" alt="PgBuddy banner" width="100%" />
</p>

A no-nonsense, type-safe, tiny query builder wrapping [postgres.js](https://github.com/porsager/postgres).

[![npm version](https://img.shields.io/npm/v/pgbuddy.svg)](https://www.npmjs.com/package/pgbuddy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Installation

```bash
npm install pgbuddy postgres zod
```

---

## Quick start

```ts
import postgres from "postgres";
import { PgBuddy } from "pgbuddy";
import { z } from "zod";

const sql = postgres(process.env.DATABASE_URL);
const db = new PgBuddy(sql);

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
});

const users = db.table("users", UserSchema);

// Create
const user = await users.create({ name: "Alice", email: "alice@example.com" });

// Read
const all = await users.findMany();
const one = await users.findFirst({ where: { email: "alice@example.com" } });

// Update
await users.update({ where: { id: user.id }, data: { name: "Alice Smith" } });

// Delete
await users.delete({ where: { id: user.id } });
```

Tip: Use [Kanel](https://github.com/kristiandupont/kanel) to auto-generate TypeScript interfaces directly from your database schema.

## Documentation

- [Introduction](docs/introduction.md)
- [CRUD operations](docs/crud-operations.md)
- [Select operations](docs/select-operations.md)
- [Chainable API](docs/chainable-api.md)
- [Data transformation](docs/data-transformation.md)
- [API reference](docs/api-reference.md)
- [Examples](docs/examples.md)

---

## License

[MIT](LICENSE)
