/** @fileoverview Type-safe PostgreSQL query builder with support for CRUD operations */

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
  LikePattern
};
