/**
 * PgBuddy - A type-safe PostgreSQL query builder with support for CRUD operations.
 *
 * This library provides a lightweight, chainable API for working with PostgreSQL databases
 * using the postgres.js library. It focuses on type safety, developer experience, and
 * simple but powerful abstractions for common database operations.
 *
 * Key features:
 * - Full TypeScript type safety for table schemas and query results
 * - Chainable API for building complex queries
 * - Support for advanced WHERE conditions, sorting, and pagination
 * - Automatic SQL injection protection via postgres.js
 * - Minimal dependencies and small footprint
 *
 * @example
 * ```typescript
 * import postgres from "postgres";
 * import { z } from "zod";
 * import { PgBuddyClient } from "pgbuddy";
 *
 * // Create postgres.js connection
 * const sql = postgres("postgres://username:password@localhost:5432/dbname");
 *
 * // Create PgBuddyClient instance
 * const db = new PgBuddyClient(sql);
 *
 * // Define the table with a Zod schema
 * const UserSchema = z.object({
 *   id: z.number().int(),
 *   name: z.string(),
 *   email: z.string().email(),
 *   status: z.enum(["active", "inactive"]),
 *   created_at: z.date(),
 * });
 *
 * const users = db.table("users", UserSchema);
 *
 * // Use the chainable API
 * async function example() {
 *   // Find active users
 *   const activeUsers = await users
 *     .where({ status: "active" })
 *     .orderBy([{ column: "created_at", direction: "DESC" }])
 *     .findMany();
 *
 *   // Create a new user
 *   const newUser = await users.create({
 *     name: "John Doe",
 *     email: "john@example.com",
 *     status: "active",
 *     created_at: new Date()
 *   });
 * }
 * ```
 *
 * @packageDocumentation
 */

import { ValidatedTable } from "./adapter";
// Export the new client
import type {
  BatchQuery,
  BatchResults,
  PgBuddyClientOptions,
  PreparedQuery,
  TransactionOptions,
} from "./client";
import { PgBuddyClient } from "./client";
import { Errors, QueryError, type QueryErrorCode, TableError } from "./errors";
import { GroupedQuery, JoinQuery, ProjectedQuery } from "./table";
import type {
  AggregateOptions,
  AggregateResult,
  ColumnCodec,
  ColumnCodecs,
  ColumnMap,
  ComputedMap,
  ComputedOptions,
  ComputedResult,
  CreateManyOptions,
  LikePattern,
  PickFields,
  SelectFields,
  SelectKeys,
  SortDirection,
  SortSpec,
  SqlExpression,
  SqlFragment,
  SqlOperator,
  UpdateData,
  UpsertOptions,
  WhereCondition,
} from "./types";
// Re-export types for external use
import { sqlExpr } from "./types";
import { ZodAggregatedQuery, ZodJoinQuery, ZodProjectedQuery, ZodTable } from "./zod-table";

// Export the new client and related classes/types
export {
  PgBuddyClient,
  ZodTable,
  ValidatedTable,
  ProjectedQuery,
  GroupedQuery,
  JoinQuery,
  ZodAggregatedQuery,
  ZodJoinQuery,
  ZodProjectedQuery,
  Errors,
  QueryError,
  TableError,
  sqlExpr,
};
export type {
  ValidatedInput,
  ValidatedRow,
  ValidationAdapter,
  ValidationResult,
  ValidatorAdapter,
} from "./adapter";
export { zodValidator } from "./adapter";
export type { PostgresErrorLike } from "./database-errors";
export {
  constraintName,
  isCheckViolation,
  isDeadlock,
  isForeignKeyViolation,
  isNotNullViolation,
  isPostgresError,
  isSerializationFailure,
  isUniqueViolation,
  PostgresErrorCodes,
} from "./database-errors";
export type { Predicate, WhereInput } from "./predicates";
export {
  and,
  between,
  contains,
  endsWith,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  not,
  notBetween,
  notInArray,
  or,
  startsWith,
} from "./predicates";
export type { GroupedRow, JoinOptions, JoinResult, JoinValue, Table } from "./table";
export type {
  IncludedRelations,
  RelationAggregate,
  RowFromSchema,
  WithRelations,
  ZodRelationConfig,
  ZodRelations,
} from "./zod-table";
export type {
  AggregateOptions,
  AggregateResult,
  SelectFields,
  SelectKeys,
  PickFields,
  SortDirection,
  SqlOperator,
  WhereCondition,
  SortSpec,
  LikePattern,
  UpdateData,
  BatchQuery,
  BatchResults,
  PreparedQuery,
  PgBuddyClientOptions,
  TransactionOptions,
  CreateManyOptions,
  UpsertOptions,
  QueryErrorCode,
  SqlExpression,
  SqlFragment,
  ColumnMap,
  ColumnCodec,
  ColumnCodecs,
  ComputedResult,
  ComputedOptions,
  ComputedMap,
};
