# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
