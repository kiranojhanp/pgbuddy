# Roadmap

Priority order, not a release commitment. The guiding rule is to remove common
reasons to drop to raw SQL without turning pgbuddy into a schema toolkit or a
full SQL AST.

## Complete

- Join v2: chained joins, aliases, self-joins, typed right rows
- Direct, through, and nested relations with filters/counts/aggregates
- Relation and join column mapping/codecs
- Per-column mapping and codecs
- Connection-level Zod/Valibot/Yup adapters
- Per-relation aggregates and ordering
- One-round-trip batch, deferred builders, and `batchSQL`
- `toSQL`, fixed/parameterized prepared plans, `EXPLAIN`
- `INSERT ... SELECT`, `UPDATE ... FROM`, `DELETE ... USING`
- Expression filters/order, `groupByExpr`, typed HAVING, filtered aggregates
- Paginated tables, keyset infinite pages (forward/backward), row counts
- SELECT cancellation and streaming
- JSONB/array predicates

## Out of scope

- CTEs, set operations (`UNION`/`INTERSECT`/`EXCEPT`), typed window functions
- Views, enums, domains, RLS, generated columns, constraints as schema metadata
- Migrations, introspection, and code generation
- Relation writes (`connect`/`create`/`update` graphs)
- Multi-dialect support (PostgreSQL only)

Raw join `ON` clauses remain explicit SQL by design.
