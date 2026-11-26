# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Breaking:** Zod is the default validator and a required peer. Plain
  TypeScript-only tables (`db.table<T>()`, `tableWithInsert`, `columns`, and
  `Insertable`/`Model`/`Updatable`/`Selectable`) remain removed. A
  connection-level `ValidatorAdapter` can validate tables from Valibot, Yup, or
  a custom library; Zod remains required for relations and schema-derived
  projections.
- `findFirstOrThrow()` / `findUniqueOrThrow()` now set
  `QueryError.code = "NO_ROWS"`.

### Added
- `withAggregate` for per-relation count/sum/avg/min/max, including through
  relations and a `where` refinement.
- `orderByRelated` for ordering parents by correlated relation aggregates.
- Per-field `columnCodecs` for custom encode/decode serialization across writes,
  filters, cursors, and result rows.
- `db.batch(callback | pending queries)` for true one-round-trip batches; the
  callback must synchronously return pending queries.
- `db.batchSQL([...])` typed raw statement batch using `sql.batch`.
- `insertFrom`, `updateFrom`, and `deleteUsing` for `INSERT … SELECT`,
  `UPDATE … FROM`, and `DELETE … USING`.
- Typed aggregate `HAVING` conditions via `groupBy(...).having({...})`.
- Expression-based grouping via `groupByExpr({ alias: sqlExpr(...) })`.
- SELECT cancellation via `signal()` and batched streaming via `stream()`.
- `findManyAndCount()` for page rows plus filtered total in one batch.
- Lazy `findMany()` / `count()` terminals that `db.batch()` can combine into
  one round trip.
- `explain()` for SELECT plans.
- `whereExpr()` and `orderByExpr()` for typed SQL expressions.
- Conditional aggregates via `db.filtered(expression, condition)`.
- Backward `findManyInfinite({ direction: "backward" })` pages.
- JSONB and array predicates: `jsonContains`, `jsonHasKey`,
  `jsonHasAnyKey`, `jsonHasAllKeys`, `arrayContains`, `arrayContainedBy`,
  `arrayOverlaps`.
- Opt-in transaction retry for serialization failures/deadlocks; transaction
  clients now inherit column mapping/codecs and the connection adapter.
- `findManyInfinite()` for keyset pages with `nextCursor` and `hasMore`.
- Optional `maxSkip` pagination guard and `stream()` batch-size cap.
- Runtime validation of transaction isolation modes and flags.
- Dependency security update: Zod `>=4.6.6` and current tsup tooling; `bun audit`
  reports no vulnerabilities.
- Adapter relation keys are inferred from `fields` field lists.
- postgres.js v4 is now the only supported major.
- `toSQL()` inspection for SELECT builders, including computed projections.
- `db.prepare(text)` for reusable raw prepared statements.
- `Table.prepare()` for reusable prepared SELECT plans with fixed parameters.
- Connection-level `ValidatorAdapter` support: configure one adapter on
  `PgBuddyClient` and use `db.table` for every table, including joins,
  aggregates, grouped queries, computed projections, `omit`, and field-list
  adapter relations.
- Prapti-style schema + adapter split with built-in `zodValidator` and
  schema-inferred types.
- Tree-shakeable Valibot/Yup adapters at `pgbuddy/adapters/valibot` and
  `pgbuddy/adapters/yup` (optional peers).
- Cyclic relation configurations are rejected instead of recursing forever.
- Relation and join configs accept `columnMap`/`columnCodecs` for includes,
  counts, selected right-side join columns, and relation filters.
- Per-table/client `columnMap` for schema field → database column mapping
  across reads, writes, filters, ordering, aggregates, cursors, and grouping.
- Many-to-many/through relations with junction tables, filtering, and counts.
- Nested includes via child relation configs, with recursive result types.
- The batched relation loader was extracted into `src/relations.ts`.
- Chained narrow joins with table aliases and self-joins; schema-aware
  `ZodJoinQuery` supports multiple `innerJoin`/`leftJoin` calls and nested
  right-side rows.
- `allowedColumns` client/table option: an allowlist for `create`, `createMany`
  and `update` payload keys, rejected with a `QueryError` when a key is not
  allowlisted. Mitigates mass assignment when write payloads contain
  user-controlled keys.
- `maxTake` client/table option and a default `take()` cap of 10,000 rows to
  prevent caller-controlled limits from requesting unbounded result sets.
- `PgBuddyClientOptions` is exported from the public API.
- Composable predicate helpers: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`,
  `inArray`, `notInArray`, `isNull`, `isNotNull`, `like`, `ilike`, `contains`,
  `startsWith`, `endsWith`, `between`, `notBetween`, `and`, `or`, `not`.
  They support OR/NOT conditions, column/value composition, and are validated
  by `ZodTable` against the schema.
- `whereRaw(fragment)` adds a postgres.js fragment to the WHERE clause.
- `db.transaction(async (tx) => ...)` with nested savepoint support.
- The underlying postgres.js instance is exposed as `db.sql`.
- `findFirstOrThrow()` and `findUniqueOrThrow()`.
- Database error helpers: `isPostgresError`, `isUniqueViolation`,
  `isForeignKeyViolation`, `isNotNullViolation`, `isCheckViolation`,
  `isSerializationFailure`, `isDeadlock`, `constraintName`, and
  `PostgresErrorCodes`.
- `upsert({ where, create, update })` (INSERT ... ON CONFLICT DO UPDATE).
- `createMany(records, { skipDuplicates })` (ON CONFLICT DO NOTHING).
- `distinct()` / `distinctOn(columns)` and keyset pagination with `cursor()`.
- `ZodTable` now selects its schema columns explicitly instead of `SELECT *`
  (so columns outside the schema are not returned), and supports `omit()` for
  schema-derived projections.
- `unique` table option and `whereUnique()` for validated unique lookups.
- Read-only relations for `ZodTable`: declare `relations` and use
  `include(name)` on `find*` methods. Supports `relation: "one" | "many"`,
  composite keys, per-relation `where`/`orderBy`/`take`/`select` refinements,
  `withCount`, and `whereRelated`/`whereMissing` (`EXISTS`/`NOT EXISTS`).
  Relation rows are fetched in batched queries and typed from the related Zod
  schema.
- `defaultTake` for bounding `findMany`, `columns` for explicit plain-Table
  projections, and `omit()` on plain tables.
- `exists()`, `aggregate()` (count/countDistinct/sum/avg/min/max), and
  count-returning `update`/`delete` via `{ returning: false }`.
- `orderByRaw()` and `NULLS FIRST/LAST` ordering.
- SQL fragment values in `update()`, chunked `createMany`, and generalized
  conflict options (`onConflict`, `targetWhere`, `setWhere`, find-or-create
  upsert).
- `QueryError.code` for programmatic handling, and a real-PostgreSQL CI job.
- Computed select fields via `findMany({ computed: { alias: sqlExpr<T>(sql`...`) } })`
  and the chainable `selectExpr({...})`, with typed results.
- Composite keyset cursors (lexicographic conditions over the leading
  `orderBy` columns).
- camelCase ↔ snake_case column mapping through postgres.js `transform`
  (`postgres.camel`), verified end to end.
- `withCount` accepts a relation refinement (counts matching rows only), and
  relation table names respect `strictNames`/`allowSchema`.
- `orderByRaw` now combines with `orderBy`; added `distinctOnExpr`, row-locking
  (`for("update" | "share" | ...)`, `SKIP LOCKED`/`NOWAIT`), and `whereEvery`.
- Writes omit `undefined` values; `create` supports `onConflict: "nothing"`;
  bulk `onConflict` accepts arbitrary `SET` expressions; `RETURNING` supports
  computed fields on create/update/delete/upsert.
- Added `groupBy(columns, aggregates)` with `having()`, typed grouped rows, and
  `orderBy`/`take` composition.
- `include` accepts a declarative `{ where, orderBy, take, select }` options
  object in addition to the builder callback.
- Added a runnable ecommerce kitchen-sink example covering the full public API.
- Added narrow `innerJoin`/`leftJoin` with nested right-side rows and typed
  nullable results; schema-derived columns for ZodTable.
- `createMany` accepts `computed` `RETURNING`; `whereEvery` is optional; relation
  methods (`include`, `withCount`, `whereRelated`, `whereMissing`,
  `whereEvery`) compose after `selectExpr`.
- `ZodTable.select` and `ZodTable.orderBy` now validate their columns against
  the Zod schema at runtime (`"*"` remains allowed for `select`), and
  `orderBy` validates the sort direction eagerly.
- `ZodTable.where` rejects non-plain-object conditions and `ZodTable.createMany`
  rejects non-array input with a `QueryError` instead of throwing a `TypeError`.

### Changed
- The `postgres` peer dependency range is widened from `^3.4.5` to
  `^3.4.5 || ^4.0.0`. postgres.js v4 needed no pgbuddy runtime changes
  (pgbuddy imports postgres.js types only); the full suite passes against both
  `3.4.5` and `4.1.1`, and CI now runs a version matrix.
- **Security**: `allowSchema` is now enforced in non-strict mode too. Dotted
  table and column names (`public.users`, `users.id`) are rejected unless
  `allowSchema: true` is set. This is a behaviour change for code relying on
  dotted names with default options.
- `where`, `orderBy` and `select` snapshot their inputs, so mutating an array or
  object after building a query no longer changes the generated SQL (this also
  closes a `ZodTable` validation TOCTOU).
- Repeated `.where()` calls now combine with `AND` instead of replacing the
  previous conditions, which makes conditional query building safe.
- `create`, `createMany` and `update` reject `undefined` values with a
  `QueryError` instead of leaking postgres.js's `UNDEFINED_VALUE`. Simple
  `where` conditions do the same.

### Fixed
- Error messages escape control characters in user-supplied names, preventing
  log-line forging through crafted column/table names.
- `getLikePattern` no longer resolves inherited object properties, so invalid
  runtime values such as `"__proto__"` cannot throw a `TypeError`.
- Publish workflow verifies the source commit for `workflow_dispatch` runs
  (previously the tag/version checks were skipped) and pins every GitHub Action
  to a commit SHA. CI uses `--frozen-lockfile`.
- Documentation: corrected the stale README quick start, documented the new
  options, and replaced the "inputs and outputs" validation claim with the
  actual input-only behaviour.

## [0.2.0] - 2026-02-22

### Added
- `noUncheckedIndexedAccess` TypeScript compiler flag for safer array index access
- `Errors.QUERY.NOT_UNIQUE` and `Errors.QUERY.INSERT_RETURNED_EMPTY` constants for consistent error messages
- `SelectKeys`, `PickFields`, and `SortDirection` are now exported from the public API
- `peerDependenciesMeta` to mark `zod` as optional — users who don't use `ZodTable` no longer see peer dependency warnings

### Fixed
- **Security**: LIKE wildcard characters (`%`, `_`, `\`) in user-supplied values are now always escaped before being passed to the database. Previously, values containing `%` or `_` bypassed escaping entirely and were passed through as raw SQL patterns.
- **Bug**: `create()` now throws a `QueryError` if the database returns no rows instead of returning `undefined` typed as `T`
- **Bug**: `count()` safely handles an empty result set by defaulting to `0` instead of crashing
- **Bug**: `createMany()` guards `records[0]` access with a proper non-null assertion after the empty-check guard
- **Bug**: `findFirst()` and `findUnique()` use safe index access (`?? null`) compatible with `noUncheckedIndexedAccess`
- **Bug**: `client.ts` table name validation now explicitly rejects non-string inputs (e.g. `null`, numbers) instead of silently coercing them with `String()`
- Dead code removed: redundant `if (skip === undefined) return` branch in `createLimitFragment` that could never be reached
- Dead code removed: `columns.length === 0` check in `createMany` that was already guaranteed by prior `isValidData` validation

### Changed
- `validators.ts`: all function parameters typed `any` changed to `unknown` with proper type narrowing
- Package URLs changed from SSH (`git@github.com`) to HTTPS for correct display on npm registry
- Package version synced with git tag (`0.1.4` → `0.2.0`)
- CI/CD: `npm-publish.yml` workflow now correctly triggers on `master` branch (was incorrectly set to `main`)
- `findUnique` error message moved into `Errors.QUERY.NOT_UNIQUE` constant for consistency

## [0.1.4] - 2025

### Fixed
- Update email validation in `UserSchema` to use `z.email()`

### Added
- Enhanced validation tests for `ZodTable` with additional error cases

### Docs
- Updated documentation to reflect chainable API with Zod integration
- Updated Quick Start examples to include new chainable API and Zod integration

## [0.1.3] - 2025

### Changed
- Switched from Bun to Node.js for dependency management and publishing in CI workflow
- Improved coverage check logic with file filtering and total calculations

## [0.1.2] - 2025

### Added
- Zod integration for schema validation (`ZodTable`)
- Enhanced SQL utilities with strict name checks

## [0.1.1] - 2025

### Added
- `Insertable` and `Model` types for better type safety
- `Table` class state management with immutable chainable query builder
- Type-safe `select`, `where`, `skip`, `take`, and `orderBy` methods
- `create` and `createMany` with input validation
- Integration and unit tests for `PgBuddyClient` and SQL utilities

## [0.1.0] - 2025

### Added
- Initial public release
- `PgBuddyClient` with `table()` and `tableWithInsert()` factory methods
- Chainable query builder (`findMany`, `findFirst`, `findUnique`, `count`, `create`, `createMany`, `update`, `delete`)
- Full TypeScript type safety with compile-time column checking
- SQL injection protection via `postgres.js` parameterized queries
- `WhereCondition` support: `=`, `!=`, `>`, `<`, `>=`, `<=`, `LIKE`, `ILIKE`, `IN`, `IS NULL`, `IS NOT NULL`
- `LikePattern` helpers: `startsWith`, `endsWith`, `contains`, `exact`

[0.2.0]: https://github.com/kiranojhanp/pgbuddy/compare/v0.1.4...v0.2.0
[0.1.4]: https://github.com/kiranojhanp/pgbuddy/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/kiranojhanp/pgbuddy/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/kiranojhanp/pgbuddy/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/kiranojhanp/pgbuddy/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/kiranojhanp/pgbuddy/releases/tag/v0.1.0
