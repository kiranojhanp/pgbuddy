# PgBuddy

> PgBuddy is a lightweight, type-safe PostgreSQL query helper for postgres.js v4. The canonical AI index is [llms.txt](https://github.com/kiranojhanp/pgbuddy/blob/master/llms.txt).

## Copy this prompt for an AI agent

~~~text
You are an AI coding agent working in a TypeScript project that uses PgBuddy.

# Project
PgBuddy is a lightweight, type-safe PostgreSQL query helper for postgres.js v4.
It is a helper, not an ORM or runtime. The user provides a postgres.js Sql
instance. Raw SQL is always available through db.sql.

Canonical documentation (GitHub):
- LLM index: https://github.com/kiranojhanp/pgbuddy/blob/master/llms.txt
- API reference: https://github.com/kiranojhanp/pgbuddy/blob/master/docs/api-reference.md
- Introduction: https://github.com/kiranojhanp/pgbuddy/blob/master/docs/introduction.md
- Advanced execution: https://github.com/kiranojhanp/pgbuddy/blob/master/docs/advanced.md
- Pagination recipe: https://github.com/kiranojhanp/pgbuddy/blob/master/docs/recipes/paginated-tables.md

# Requirements
- postgres.js ^4.0.0
- Zod >=4.6.6 for Zod tables and relation features
- Valibot or Yup only when the project uses a connection-level adapter
- TypeScript only; keep types strict

# Setup
npm install pgbuddy postgres zod

import postgres from "postgres";
import { PgBuddyClient } from "pgbuddy";
import { z } from "zod";

const sql = postgres(process.env.DATABASE_URL);
const db = new PgBuddyClient(sql);

# Core rules
1. Create one PgBuddyClient per postgres.js connection.
2. Define each table from a Zod object schema with db.table("table", Schema).
3. Validate user input before it reaches db.table writes. Never pass an
   unvalidated request body as a write payload.
4. Use z.object for stripping or z.strictObject to reject unknown keys.
5. Use .optional() for database defaults/generated ids and .nullable() for
   nullable columns.
6. Use db.sql, whereRaw, orderByRaw, prepare, and batchSQL only for trusted SQL.
7. Prefer findManyAndCount() for page + total in one round trip.
8. Prefer db.batch([...]) for independent queries; it uses one postgres.js batch.
9. Use db.transaction() for sequential work that depends on earlier results.
10. Do not add CTEs, set operations, window functions, migrations, or relation
    write graphs to PgBuddy; use raw SQL or another tool for those.

# Common patterns

Create:
const user = await users.create({ name: "Alice", email: "alice@example.com" });

Read:
const found = await users.where({ email: "alice@example.com" }).findFirst();

Filter, sort, page:
const page = await users
  .where({ status: "active" })
  .orderBy([{ column: "created_at", direction: "DESC" }])
  .skip(0)
  .take(25)
  .findMany();

Page + total, one round trip:
const { rows, total } = await users
  .where({ status: "active" })
  .orderBy([{ column: "created_at", direction: "DESC" }])
  .skip(0)
  .take(25)
  .findManyAndCount();

Typed batch:
const [rows, count] = await db.batch([
  users.where({ status: "active" }).findMany(),
  users.where({ status: "active" }).count(),
]);

Relations:
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
const rows = await users.include("posts").withCount("posts").findMany();

Raw SQL escape hatch:
const rows = await db.sql`select * from users where id = ${id}`;

# Before finishing
- Run: bun test
- Run: bun run test:types
- Run: bun run build
- Report any behavior that required raw SQL.
- Do not claim a feature works unless it is covered by a test or a runnable example.
~~~

## Human documentation

- [llms.txt](https://github.com/kiranojhanp/pgbuddy/blob/master/llms.txt)
- [Introduction](https://github.com/kiranojhanp/pgbuddy/blob/master/docs/introduction.md)
- [CRUD operations](https://github.com/kiranojhanp/pgbuddy/blob/master/docs/crud-operations.md)
- [Select operations](https://github.com/kiranojhanp/pgbuddy/blob/master/docs/select-operations.md)
- [Chainable API](https://github.com/kiranojhanp/pgbuddy/blob/master/docs/chainable-api.md)
- [Data transformation](https://github.com/kiranojhanp/pgbuddy/blob/master/docs/data-transformation.md)
- [Advanced execution](https://github.com/kiranojhanp/pgbuddy/blob/master/docs/advanced.md)
- [API reference](https://github.com/kiranojhanp/pgbuddy/blob/master/docs/api-reference.md)
- [Paginated tables recipe](https://github.com/kiranojhanp/pgbuddy/blob/master/docs/recipes/paginated-tables.md)
- [Soft deletes recipe](https://github.com/kiranojhanp/pgbuddy/blob/master/docs/recipes/soft-deletes.md)
- [Tenant/RLS recipe](https://github.com/kiranojhanp/pgbuddy/blob/master/docs/recipes/tenant-scoping.md)
- [Kitchen sink](https://github.com/kiranojhanp/pgbuddy/blob/master/docs/kitchen-sink.md)
- [Roadmap](https://github.com/kiranojhanp/pgbuddy/blob/master/docs/roadmap.md)

## Requirements

- postgres.js `^4.0.0`
- Zod `>=4.6.6` for Zod tables and relation features
- Valibot/Yup optional
- PostgreSQL 16 is verified in CI; other versions are not currently tested

## License

MIT
