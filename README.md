# PgBuddy

<p align="center">
  <img src="assets/banner.png" alt="PgBuddy banner" width="100%" />
</p>

> A lightweight, type-safe PostgreSQL query helper for postgres.js v4. Zod-first by default, with relations, joins, mapping/codecs, one-round-trip batching, pagination, prepared queries, and connection-level validation adapters — while keeping raw SQL available.

[![npm version](https://img.shields.io/npm/v/pgbuddy.svg)](https://www.npmjs.com/package/pgbuddy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## For AI agents

- **Canonical index:** [llms.txt](llms.txt)
- **API reference:** [docs/api-reference.md](docs/api-reference.md)
- **Full guide:** [docs/introduction.md](docs/introduction.md)
- **Recipes:** [docs/recipes/paginated-tables.md](docs/recipes/paginated-tables.md), [soft deletes](docs/recipes/soft-deletes.md), [tenant/RLS](docs/recipes/tenant-scoping.md)
- **Advanced execution:** [docs/advanced.md](docs/advanced.md)

## What it is

PgBuddy wraps a user-provided postgres.js `Sql` instance. It is a helper, not a
runtime or ORM:

- **Zod-first** table schemas validate writes and derive projections.
- **One adapter per connection** — Zod, Valibot, Yup, or custom.
- **Raw SQL is always available** through `db.sql`.
- **Batch-friendly** by default: `findManyAndCount`, typed deferred queries, and
  `db.batch` use one round trip.
- **Only postgres.js v4** is supported.

## Install

```bash
npm install pgbuddy postgres zod
```

Valibot and Yup are optional peer dependencies.

## Quick start

```ts
import postgres from "postgres";
import { PgBuddyClient } from "pgbuddy";
import { z } from "zod";

const sql = postgres(process.env.DATABASE_URL);
const db = new PgBuddyClient(sql);

const UserSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  email: z.email(),
  status: z.enum(["active", "inactive"]).optional(),
  created_at: z.date().optional(),
  deleted_at: z.date().nullable().optional(),
});

const users = db.table("users", UserSchema);

const user = await users.create({
  name: "Alice",
  email: "alice@example.com",
});

const found = await users
  .where({ email: "alice@example.com" })
  .findFirst();

await users
  .where({ id: user.id! })
  .update({ name: "Alice Smith" });

await users.where({ id: user.id! }).delete();
```

Use `.optional()` for database defaults or generated ids and `.nullable()` for
nullable columns. Unknown keys are stripped by `z.object`; use `z.strictObject`
to reject them.

## Core examples

### Filter, sort, and page

```ts
const page = await users
  .where({ status: "active" })
  .orderBy([{ column: "created_at", direction: "DESC" }])
  .skip(0)
  .take(25)
  .findMany();
```

### Page plus total in one batch

```ts
const { rows, total } = await users
  .where({ status: "active" })
  .orderBy([{ column: "created_at", direction: "DESC" }])
  .skip(0)
  .take(25)
  .findManyAndCount();
```

### Relations

```ts
const PostSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  title: z.string(),
});

const users = db.table("users", UserSchema, {
  relations: {
    posts: {
      table: "posts",
      schema: PostSchema,
      localKey: "id",
      foreignKey: "user_id",
      relation: "many",
    },
  },
});

const rows = await users
  .include("posts", (posts) => posts.orderBy([{ column: "id", direction: "DESC" }]).take(3))
  .withCount("posts")
  .findMany();
```

### Raw SQL escape hatch

```ts
const rows = await db.sql`select * from users where id = ${id}`;
```

## Documentation

| Topic | Start here |
| --- | --- |
| Introduction and design | [docs/introduction.md](docs/introduction.md) |
| CRUD and writes | [docs/crud-operations.md](docs/crud-operations.md) |
| Filtering, sorting, pagination | [docs/select-operations.md](docs/select-operations.md) |
| Chaining, relations, joins | [docs/chainable-api.md](docs/chainable-api.md) |
| Column mapping and codecs | [docs/data-transformation.md](docs/data-transformation.md) |
| Advanced execution | [docs/advanced.md](docs/advanced.md) |
| API reference | [docs/api-reference.md](docs/api-reference.md) |
| Paginated tables recipe | [docs/recipes/paginated-tables.md](docs/recipes/paginated-tables.md) |
| Soft deletes recipe | [docs/recipes/soft-deletes.md](docs/recipes/soft-deletes.md) |
| Tenant/RLS recipe | [docs/recipes/tenant-scoping.md](docs/recipes/tenant-scoping.md) |
| Kitchen sink | [docs/kitchen-sink.md](docs/kitchen-sink.md) |
| Roadmap | [docs/roadmap.md](docs/roadmap.md) |
| LLM index | [llms.txt](llms.txt) |

## Validation adapters

Zod is the default. Configure one adapter on the connection; every table uses
it:

```ts
import { PgBuddyClient } from "pgbuddy";
import { valibotValidator } from "pgbuddy/adapters/valibot";

const db = new PgBuddyClient(sql, { adapter: valibotValidator });
const users = db.table("users", ValibotUserSchema);
```

Built-ins: `zodValidator`, `pgbuddy/adapters/valibot`,
`pgbuddy/adapters/yup`. See [API reference](docs/api-reference.md) for adapter
relations and type details.

## Requirements

- postgres.js `^4.0.0`
- Zod `>=4.6.6` for Zod tables and relation features
- Valibot/Yup optional
- PostgreSQL 16 is verified in CI; other versions are not currently tested

## Development

```bash
bun install
bun test
bun run test:types
bun run build
bun run example:kitchen-sink
```

## License

MIT
