import type { Row, Sql } from "postgres";
import type { ZodObject, ZodRawShape } from "zod";
import { Errors, TableError } from "./errors";
import { Table } from "./table";
import type { Insertable } from "./types";
import { isValidIdentifier, isValidName } from "./utils";
import { ZodTable } from "./zod-table";

function isZodSchema(value: unknown): value is ZodObject<ZodRawShape> {
  return (
    typeof value === "object" &&
    value !== null &&
    "shape" in value &&
    typeof (value as { shape: unknown }).shape === "object" &&
    "safeParse" in value &&
    typeof (value as { safeParse: unknown }).safeParse === "function" &&
    "_def" in value
  );
}

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
  private sql: Sql<Record<string, unknown>>;

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
    sql: Sql<Record<string, unknown>>,
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
  ): Table<T, ["*"], I>;
  table<S extends ZodObject<ZodRawShape>>(
    tableName: string,
    schema: S,
    options?: { strictNames?: boolean; allowSchema?: boolean }
  ): ZodTable<S>;
  table<
    T extends Row,
    I extends Row = T,
    S extends ZodObject<ZodRawShape> = ZodObject<ZodRawShape>,
  >(
    tableName: string,
    schemaOrOptions?: S | { strictNames?: boolean; allowSchema?: boolean },
    options?: { strictNames?: boolean; allowSchema?: boolean }
  ): Table<T, ["*"], I> | ZodTable<S> {
    const schema = isZodSchema(schemaOrOptions) ? schemaOrOptions : undefined;
    const resolvedOptions = isZodSchema(schemaOrOptions) ? options : schemaOrOptions;

    const strictNames = resolvedOptions?.strictNames ?? this.strictNames ?? false;
    const allowSchema = resolvedOptions?.allowSchema ?? this.allowSchema ?? false;

    if (typeof tableName !== "string") {
      throw new TableError(Errors.TABLE.INVALID_NAME);
    }
    const trimmedName = tableName.trim();
    const isValid = strictNames
      ? isValidIdentifier(trimmedName, { allowSchema })
      : isValidName(trimmedName);

    if (!isValid) {
      throw new TableError(Errors.TABLE.INVALID_NAME);
    }

    // Use unknown cast through Row to avoid explicit any in the internal implementation
    const table = new Table<Row, ["*"], Row>(this.sql, trimmedName, {
      strictNames,
      allowSchema,
    });

    if (schema) {
      // table is typed as Table<Row> internally (impl signature); cast to align with ZodTable's expected generic
      // biome-ignore lint/suspicious/noExplicitAny: necessary to bridge internal Row type and ZodTable's generic
      return new ZodTable(table as unknown as Table<any, ["*"], any>, schema) as ZodTable<S>;
    }

    return table as Table<T, ["*"], I>;
  }

  tableWithInsert<T extends Row, AutoKeys extends keyof T>(
    tableName: string,
    options?: { strictNames?: boolean; allowSchema?: boolean }
  ): Table<T, ["*"], Insertable<T, AutoKeys>> {
    return this.table<T, Insertable<T, AutoKeys>>(tableName, options);
  }
}
