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
 * import { PgBuddyClient } from "pgbuddy";
 *
 * // Create postgres.js connection
 * const sql = postgres("postgres://username:password@localhost:5432/dbname");
 *
 * // Create PgBuddyClient instance
 * const db = new PgBuddyClient(sql);
 *
 * // Define your table type
 * interface User {
 *   id: number;
 *   name: string;
 *   email: string;
 *   status: "active" | "inactive";
 *   created_at: Date;
 * }
 *
 * // Define table
 * const users = db.table<User>("users");
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

// Export the new client
import { PgBuddyClient } from "./client";
import { Table } from "./table";
import { Errors, QueryError, TableError } from "./errors";

// Legacy query builder
import { PgBuddy } from "./legacy";

// Re-export types for external use
import type {
  InsertParams,
  ModifyParams,
  SelectFields,
  SelectParams,
  SqlOperator,
  WhereCondition,
  SortSpec,
  LikePattern,
} from "./types";

// Export the new client and related classes/types
export { PgBuddyClient, Table, Errors, QueryError, TableError, PgBuddy };
export type {
  InsertParams,
  ModifyParams,
  SelectFields,
  SelectParams,
  SqlOperator,
  WhereCondition,
  SortSpec,
  LikePattern,
};
