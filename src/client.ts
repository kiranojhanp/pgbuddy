import type { Row, Sql } from "postgres";
import type { ZodObject, ZodRawShape } from "zod";
import { Errors, QueryError, TableError } from "./errors";
import { Table } from "./table";
import type { ColumnCodecs, ColumnMap, SelectKeys } from "./types";
import { DEFAULT_MAX_TAKE, isValidIdentifier, isValidName } from "./utils";
import { type RowFromSchema, type ZodRelations, ZodTable } from "./zod-table";

/**
 * Options shared by {@link PgBuddyClient} and {@link PgBuddyClient.table}.
 *
 * - `strictNames` — require identifiers to match `[A-Za-z_][A-Za-z0-9_]*`
 *   (default `false`)
 * - `allowSchema` — allow schema-qualified (dotted) table and column names
 *   (default `false`; even in non-strict mode dots are rejected otherwise)
 * - `allowedColumns` — allowlist of column names accepted by `create`,
 *   `createMany` and `update`. Recommended when write payloads may contain
 *   user-controlled keys.
 * - `maxTake` — upper bound for `take()` (default {@link DEFAULT_MAX_TAKE}).
 * - `unique` — unique column sets used by `whereUnique` (for example
 *   `[["email"], ["tenant_id", "slug"]]`).
 * - `defaultTake` — default row limit for `findMany` when no `take()` is set.
 * - `columnMap` — map schema field names to database column names.
 * - `columnCodecs` — per-field encode/decode hooks for custom database types.
 */
export type PgBuddyClientOptions = {
  strictNames?: boolean;
  allowSchema?: boolean;
  allowedColumns?: readonly string[];
  maxTake?: number;
  unique?: readonly (readonly string[])[];
  defaultTake?: number;
  /** Schema field name → database column name. */
  columnMap?: ColumnMap;
  /** Per-field encode/decode hooks. */
  columnCodecs?: ColumnCodecs;
  /** Relations available to `ZodTable.include`. */
  relations?: ZodRelations;
};

/**
 * Options for `db.transaction`.
 */
export type TransactionOptions = {
  isolationLevel?: "read uncommitted" | "read committed" | "repeatable read" | "serializable";
  readOnly?: boolean;
  deferrable?: boolean;
};

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

function assertDefaultTake(defaultTake: number | undefined): void {
  if (defaultTake !== undefined && (!Number.isInteger(defaultTake) || defaultTake <= 0)) {
    throw new TableError(Errors.TABLE.INVALID_DEFAULT_TAKE);
  }
}

function assertColumnMap(columnMap: ColumnMap | undefined): void {
  if (columnMap === undefined) return;

  if (typeof columnMap !== "object" || columnMap === null || Array.isArray(columnMap)) {
    throw new TableError(Errors.TABLE.INVALID_COLUMN_MAP);
  }

  const values = Object.values(columnMap);
  if (values.some((value) => typeof value !== "string" || !value.trim())) {
    throw new TableError(Errors.TABLE.INVALID_COLUMN_MAP);
  }
  if (new Set(values).size !== values.length) {
    throw new TableError(Errors.TABLE.INVALID_COLUMN_MAP);
  }
}

function assertColumnCodecs(codecs: ColumnCodecs | undefined): void {
  if (codecs === undefined) return;
  if (typeof codecs !== "object" || codecs === null || Array.isArray(codecs)) {
    throw new TableError(Errors.TABLE.INVALID_COLUMN_CODECS);
  }

  for (const codec of Object.values(codecs)) {
    if (
      typeof codec !== "object" ||
      codec === null ||
      (codec.encode !== undefined && typeof codec.encode !== "function") ||
      (codec.decode !== undefined && typeof codec.decode !== "function")
    ) {
      throw new TableError(Errors.TABLE.INVALID_COLUMN_CODECS);
    }
  }
}

function assertUniqueOption(unique: readonly (readonly string[])[] | undefined): void {
  if (unique === undefined) return;

  if (
    !Array.isArray(unique) ||
    unique.some(
      (columns) =>
        !Array.isArray(columns) ||
        columns.length === 0 ||
        columns.some((column) => typeof column !== "string")
    )
  ) {
    throw new TableError(Errors.TABLE.INVALID_UNIQUE);
  }
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
 * // Define the table with a Zod schema
 * const UserSchema = z.object({
 *   id: z.number().int(),
 *   name: z.string(),
 *   email: z.string(),
 *   created_at: z.date(),
 * });
 * const users = db.table("users", UserSchema);
 * ```
 */
export class PgBuddyClient {
  /**
   * The underlying postgres.js instance. Use it as the escape hatch for raw
   * SQL when pgbuddy does not model what you need.
   */
  readonly sql: Sql<Record<string, unknown>>;

  private strictNames: boolean;
  private allowSchema: boolean;
  private allowedColumns?: readonly string[];
  private maxTake?: number;
  private uniqueKeys?: readonly (readonly string[])[];
  private defaultTake?: number;
  private columnMap?: ColumnMap;
  private columnCodecs?: ColumnCodecs;

  /**
   * Creates a new PgBuddyClient instance.
   *
   * @param sql - A postgres.js SQL instance used for database operations.
   * You must first initialize a postgres.js connection and pass it here.
   * @param options - Optional identifier and write-hardening options.
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
  constructor(sql: Sql<Record<string, unknown>>, options?: PgBuddyClientOptions) {
    if (
      options?.allowedColumns !== undefined &&
      (!Array.isArray(options.allowedColumns) ||
        !options.allowedColumns.every((column) => typeof column === "string"))
    ) {
      throw new TableError(Errors.TABLE.INVALID_ALLOWED_COLUMNS);
    }

    if (
      options?.maxTake !== undefined &&
      (!Number.isInteger(options.maxTake) || options.maxTake <= 0)
    ) {
      throw new TableError(Errors.TABLE.INVALID_MAX_TAKE);
    }

    assertColumnMap(options?.columnMap);
    assertColumnCodecs(options?.columnCodecs);

    assertUniqueOption(options?.unique);
    assertDefaultTake(options?.defaultTake);

    this.sql = sql;
    this.strictNames = Boolean(options?.strictNames);
    this.allowSchema = Boolean(options?.allowSchema);
    this.allowedColumns = options?.allowedColumns ? [...options.allowedColumns] : undefined;
    this.maxTake = options?.maxTake;
    this.uniqueKeys = options?.unique?.map((list) => [...list]);
    this.defaultTake = options?.defaultTake;
    this.columnMap = options?.columnMap ? { ...options.columnMap } : undefined;
    this.columnCodecs = options?.columnCodecs ? { ...options.columnCodecs } : undefined;
  }

  /**
   * Run a callback in a transaction. `tx` is a `PgBuddyClient` bound to the
   * transaction's connection; use it for every query inside the callback.
   * Nested calls use savepoints (postgres.js).
   *
   * @example
   * ```typescript
   * await db.transaction(async (tx) => {
   *   const users = tx.table("users", UserSchema);
   *   const orders = tx.table("orders", OrderSchema);
   *   await orders.create({ user_id: (await users.create({ ... })).id });
   * });
   * ```
   */
  async transaction<T>(
    fn: (tx: PgBuddyClient) => Promise<T>,
    transactionOptions?: TransactionOptions
  ): Promise<T> {
    const options: PgBuddyClientOptions = {
      strictNames: this.strictNames,
      allowSchema: this.allowSchema,
      allowedColumns: this.allowedColumns,
      maxTake: this.maxTake,
      unique: this.uniqueKeys,
      defaultTake: this.defaultTake,
    };

    // postgres.js v4 exposes nested `begin`; v3 exposes `savepoint` on the
    // transaction-scoped sql. Support both.
    const runner = this.sql as unknown as {
      begin?: (
        arg: string | ((txSql: Sql<Record<string, unknown>>) => Promise<T>),
        cb?: (txSql: Sql<Record<string, unknown>>) => Promise<T>
      ) => Promise<T>;
      savepoint?: (
        arg: string | ((txSql: Sql<Record<string, unknown>>) => Promise<T>),
        cb?: (txSql: Sql<Record<string, unknown>>) => Promise<T>
      ) => Promise<T>;
    };
    const start = runner.begin ?? runner.savepoint;

    if (typeof start !== "function") {
      throw new QueryError("Transactions are not supported by this postgres.js instance");
    }

    const parts: string[] = [];
    if (transactionOptions?.isolationLevel) {
      parts.push(`isolation level ${transactionOptions.isolationLevel}`);
    }
    if (transactionOptions?.readOnly) parts.push("read only");
    if (transactionOptions?.deferrable) parts.push("deferrable");
    const mode = parts.join(" ");

    if (mode && typeof runner.begin !== "function") {
      throw new QueryError("Transaction options are not supported in nested transactions");
    }

    const run = (txSql: Sql<Record<string, unknown>>) => new PgBuddyClient(txSql, options);

    return mode
      ? await start.call(this.sql, mode, (txSql) => fn(run(txSql)))
      : await start.call(this.sql, (txSql) => fn(run(txSql)));
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
   * const users = db.table("users", UserSchema);
   *
   * // Use the builder with chainable methods
   * const activeUsers = await users
   *   .where({ status: "active" })
   *   .select(["id", "name", "email"])
   *   .orderBy([{ column: "created_at", direction: "DESC" }])
   *   .findMany();
   * ```
   */
  table<S extends ZodObject<ZodRawShape>, R extends ZodRelations>(
    tableName: string,
    schema: S,
    options: PgBuddyClientOptions & { relations: R }
  ): ZodTable<S, ["*"], RowFromSchema<S>, R>;
  table<S extends ZodObject<ZodRawShape>>(
    tableName: string,
    schema: S,
    options?: PgBuddyClientOptions
  ): ZodTable<S>;
  table<S extends ZodObject<ZodRawShape>>(
    tableName: string,
    schema: S,
    options?: PgBuddyClientOptions
  ): ZodTable<S> {
    if (!isZodSchema(schema)) {
      throw new TableError(Errors.TABLE.INVALID_SCHEMA);
    }

    const strictNames = options?.strictNames ?? this.strictNames ?? false;
    const allowSchema = options?.allowSchema ?? this.allowSchema ?? false;
    const allowedColumns = options?.allowedColumns ?? this.allowedColumns;
    const maxTake = options?.maxTake ?? this.maxTake ?? DEFAULT_MAX_TAKE;
    const uniqueKeys = options?.unique ?? this.uniqueKeys;
    const defaultTake = options?.defaultTake ?? this.defaultTake;
    const columnMap = options?.columnMap ?? this.columnMap;
    const columnCodecs = options?.columnCodecs ?? this.columnCodecs;

    if (typeof tableName !== "string") {
      throw new TableError(Errors.TABLE.INVALID_NAME);
    }

    if (
      allowedColumns !== undefined &&
      (!Array.isArray(allowedColumns) ||
        !allowedColumns.every((column) => typeof column === "string"))
    ) {
      throw new TableError(Errors.TABLE.INVALID_ALLOWED_COLUMNS);
    }

    if (!Number.isInteger(maxTake) || maxTake <= 0) {
      throw new TableError(Errors.TABLE.INVALID_MAX_TAKE);
    }

    assertUniqueOption(uniqueKeys);
    assertDefaultTake(defaultTake);
    assertColumnMap(columnMap);
    assertColumnCodecs(columnCodecs);

    if (columnCodecs) {
      for (const field of Object.keys(columnCodecs)) {
        if (!Object.hasOwn(schema.shape, field)) {
          throw new TableError(Errors.TABLE.INVALID_COLUMN_CODECS);
        }
      }
    }

    if (columnMap) {
      for (const [field, column] of Object.entries(columnMap)) {
        if (!Object.hasOwn(schema.shape, field) || !column) {
          throw new TableError(Errors.TABLE.INVALID_COLUMN_MAP);
        }
      }
    }

    if (defaultTake !== undefined && defaultTake > maxTake) {
      throw new TableError(Errors.TABLE.INVALID_DEFAULT_TAKE);
    }

    if (uniqueKeys) {
      for (const column of uniqueKeys.flat()) {
        if (!Object.hasOwn(schema.shape, column)) {
          throw new TableError(Errors.TABLE.INVALID_UNIQUE);
        }
      }
    }

    const trimmedName = tableName.trim();
    const isValid = strictNames
      ? isValidIdentifier(trimmedName, { allowSchema })
      : // postgres.js treats "." as a schema separator, so dotted names are
        // schema-qualified even when strict name validation is off.
        isValidName(trimmedName) && (allowSchema || !trimmedName.includes("."));

    if (!isValid) {
      throw new TableError(Errors.TABLE.INVALID_NAME);
    }

    const schemaColumns = Object.keys(schema.shape);
    const table = new Table<Row, ["*"], Row>(this.sql, trimmedName, {
      strictNames,
      allowSchema,
      allowedColumns,
      maxTake,
      uniqueKeys,
      defaultTake,
      columnMap,
      columnCodecs,
      selectedFields: schemaColumns.length
        ? (schemaColumns as unknown as SelectKeys<Row>)
        : undefined,
    });

    const zodTable = new ZodTable(
      table as unknown as Table<RowFromSchema<S>, ["*"], RowFromSchema<S>>,
      schema,
      options?.relations
    );

    return zodTable as unknown as ZodTable<S>;
  }
}
