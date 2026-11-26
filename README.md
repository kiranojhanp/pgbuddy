# PgBuddy

> PgBuddy is a lightweight, type-safe PostgreSQL query helper for postgres.js.

## Documentation

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


## Copy this prompt for an AI agent

~~~text
You are an AI coding agent working in a TypeScript project that uses PgBuddy.

# PgBuddy

PgBuddy is a type-safe query helper for postgres.js v4. It is not an ORM. Raw SQL is always available via `db.sql`.

Docs (source of truth, don't invent APIs):
- https://github.com/kiranojhanp/pgbuddy/blob/master/llms.txt
- https://github.com/kiranojhanp/pgbuddy/blob/master/docs/api-reference.md
- https://github.com/kiranojhanp/pgbuddy/blob/master/docs/advanced.md
- https://github.com/kiranojhanp/pgbuddy/blob/master/docs/recipes/paginated-tables.md

If an API isn't in the docs or the installed types, say so instead of guessing.

## Rules
- Strict TypeScript. No `any` or casts to silence errors.
- One `PgBuddyClient` per postgres.js connection.
- Define tables with `db.table("name", ZodObjectSchema)`. Use `.optional()` for DB defaults/generated ids and `.nullable()` for nullable columns.
- Validate external input with Zod before any write. Never pass a raw request body to a write. Use `z.strictObject` to reject unknown keys.
- `db.sql`, `whereRaw`, `orderByRaw`, `prepare`, and `batchSQL` are for trusted SQL only. Pass values as parameters, never interpolate user input.
- Use `findManyAndCount()` for page + total, `db.batch([...])` for independent queries, and `db.transaction()` for dependent steps.
- Don't add CTEs, set operations, window functions, migrations, or relation write graphs to PgBuddy. Use raw SQL and tell me when you do.

## Before finishing
Run `bun test`, `bun run test:types`, and `bun run build`. Fix failures; never weaken tests to pass.
Report what changed, what raw SQL was used, and anything unverified. Don't claim a feature works unless a test covers it.
~~~


## License

MIT
