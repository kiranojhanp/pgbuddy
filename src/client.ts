import type { Row, Sql } from "postgres";
import { Errors, TableError } from "./errors";
import { Table } from "./table";
import { isValidIdentifier, isValidName } from "./utils";
import type { Insertable } from "./types";

/**
 * Main client for PostgreSQL database operations with a chainable interface.
 * This is the primary entry point for the PgBuddy library.
 *
 * Use this class to create table query builders for your database tables.
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
 *   created_at: Date;
 * }
 *
 * // Define table
 * const users = db.table<User>("users");
 * ```
 */
export class PgBuddyClient {
  private sql: Sql<{}>;

  private strictNames: boolean;
  private allowSchema: boolean;

  /**
   * Creates a new PgBuddyClient instance.
   *
   * @param sql - A postgres.js SQL instance used for database operations.
   * You must first initialize a postgres.js connection and pass it here.
   *
   * @example
   * ```typescript
   * import postgres from "postgres";
   * import { PgBuddyClient } from "pgbuddy";
   *
   * const sql = postgres("postgres://username:password@localhost:5432/dbname");
   * const db = new PgBuddyClient(sql);
   * ```
   */
  constructor(
    sql: Sql<{}>,
    options?: { strictNames?: boolean; allowSchema?: boolean }
  ) {
    this.sql = sql;
    this.strictNames = Boolean(options?.strictNames);
    this.allowSchema = Boolean(options?.allowSchema);
  }

  /**
   * Creates a table query builder with chainable interface.
   *
   * @param tableName - The name of the database table to operate on.
   * @returns A type-safe Table query builder instance for the specified table.
   * @throws {TableError} If the table name is invalid (empty, not a string, etc.).
   *
   * @example
   * ```typescript
   * // Define your table type
   * interface User {
   *   id: number;
   *   name: string;
   *   email: string;
   *   status: "active" | "inactive";
   *   created_at: Date;
   * }
   *
   * // Create a table builder
   * const users = db.table<User>("users");
   *
   * // Use the builder with chainable methods
   * const activeUsers = await users
   *   .where({ status: "active" })
   *   .select(["id", "name", "email"])
   *   .orderBy([{ column: "created_at", direction: "DESC" }])
   *   .findMany();
   * ```
   */
  table<T extends Row, I extends Row = T>(
    tableName: string,
    options?: { strictNames?: boolean; allowSchema?: boolean }
  ): Table<T, ["*"], I> {
    const strictNames =
      options?.strictNames ?? this.strictNames ?? false;
    const allowSchema =
      options?.allowSchema ?? this.allowSchema ?? false;

    const trimmedName = String(tableName ?? "").trim();
    const isValid = strictNames
      ? isValidIdentifier(trimmedName, { allowSchema })
      : isValidName(trimmedName);

    if (!isValid) {
      throw new TableError(Errors.TABLE.INVALID_NAME);
    }

    return new Table<T, ["*"], I>(this.sql, trimmedName);
  }

  tableWithInsert<T extends Row, AutoKeys extends keyof T>(
    tableName: string,
    options?: { strictNames?: boolean; allowSchema?: boolean }
  ): Table<T, ["*"], Insertable<T, AutoKeys>> {
    return this.table<T, Insertable<T, AutoKeys>>(tableName, options);
  }
}
