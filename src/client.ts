import type { PendingQuery, Row, Sql } from "postgres";
import type { ZodObject, ZodRawShape } from "zod";
import {
  type AdapterRelations,
  bindValidator,
  isValidationAdapter,
  type ValidatedInput,
  type ValidatedRow,
  ValidatedTable,
  type ValidationAdapter,
  type ValidatorAdapter,
  zodValidator,
} from "./adapter";
import { PostgresErrorCodes } from "./database-errors";
import { type DeferredQuery, isDeferredQuery } from "./deferred";
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
  /** Optional upper bound for `skip()` offsets. */
  maxSkip?: number;
  unique?: readonly (readonly string[])[];
  defaultTake?: number;
  /** Schema field name → database column name. */
  columnMap?: ColumnMap;
  /** Per-field encode/decode hooks. */
  columnCodecs?: ColumnCodecs;
  /** Relations available to `ZodTable.include`. */
  relations?: ZodRelations;
  /** Validation library adapter for all tables on this connection. */
  adapter?: ValidatorAdapter;
};

/**
 * Options for `db.transaction`.
 */
export type TransactionRetryOptions = {
  /** Retries after the first attempt. Defaults to 3 when `retry` is set. */
  max?: number;
  /** Base delay between attempts in milliseconds. Defaults to 0. */
  delayMs?: number;
  /** Defaults to exponential backoff. */
  backoff?: "fixed" | "exponential";
  /** SQLSTATE codes to retry. Defaults to serialization failure and deadlock. */
  on?: readonly string[];
};

export type TransactionOptions = {
  isolationLevel?: "read uncommitted" | "read committed" | "repeatable read" | "serializable";
  readOnly?: boolean;
  deferrable?: boolean;
  /** Retry serialization failures/deadlocks by rerunning the callback. */
  retry?: TransactionRetryOptions;
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

// biome-ignore lint/suspicious/noExplicitAny: postgres.js PendingQuery is invariant per result shape
export type BatchQuery = PendingQuery<any>;

export type PreparedQuery<T extends Row = Row> = (parameters?: readonly unknown[]) => Promise<T[]>;

export type BatchSQLStatement = {
  text: string;
  parameters?: readonly unknown[];
};

export type BatchSQLResults<Q extends readonly BatchSQLStatement[]> = {
  -readonly [K in keyof Q]: Row[];
};

export type BatchResults<Q extends readonly (BatchQuery | DeferredQuery<unknown>)[]> =
  Q extends readonly [
    infer Head extends BatchQuery | DeferredQuery<unknown>,
    ...infer Tail extends readonly (BatchQuery | DeferredQuery<unknown>)[],
  ]
    ? [
        Head extends DeferredQuery<infer R>
          ? Awaited<R>
          : Head extends PendingQuery<infer R>
            ? NonNullable<Awaited<R>>
            : never,
        ...BatchResults<Tail>,
      ]
    : [];

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
  private maxSkip?: number;
  private uniqueKeys?: readonly (readonly string[])[];
  private defaultTake?: number;
  private columnMap?: ColumnMap;
  private columnCodecs?: ColumnCodecs;
  private adapter: ValidatorAdapter;

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
    if (
      options?.maxSkip !== undefined &&
      (!Number.isInteger(options.maxSkip) || options.maxSkip < 0)
    ) {
      throw new TableError(Errors.TABLE.INVALID_MAX_SKIP);
    }

    assertColumnMap(options?.columnMap);
    assertColumnCodecs(options?.columnCodecs);

    assertUniqueOption(options?.unique);
    assertDefaultTake(options?.defaultTake);

    this.sql = sql;
    this.adapter = options?.adapter ?? zodValidator;
    this.strictNames = Boolean(options?.strictNames);
    this.allowSchema = Boolean(options?.allowSchema);
    this.allowedColumns = options?.allowedColumns ? [...options.allowedColumns] : undefined;
    this.maxTake = options?.maxTake;
    this.maxSkip = options?.maxSkip;
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
      maxSkip: this.maxSkip,
      unique: this.uniqueKeys,
      defaultTake: this.defaultTake,
      columnMap: this.columnMap,
      columnCodecs: this.columnCodecs,
      adapter: this.adapter,
    };

    // postgres.js v4 exposes nested `begin`;
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

    const isolationLevels = [
      "read uncommitted",
      "read committed",
      "repeatable read",
      "serializable",
    ] as const;
    if (
      transactionOptions?.isolationLevel !== undefined &&
      !isolationLevels.includes(transactionOptions.isolationLevel)
    ) {
      throw new QueryError(Errors.QUERY.INVALID_TRANSACTION, { code: "INVALID_TRANSACTION" });
    }
    if (
      transactionOptions?.readOnly !== undefined &&
      typeof transactionOptions.readOnly !== "boolean"
    ) {
      throw new QueryError(Errors.QUERY.INVALID_TRANSACTION, { code: "INVALID_TRANSACTION" });
    }
    if (
      transactionOptions?.deferrable !== undefined &&
      typeof transactionOptions.deferrable !== "boolean"
    ) {
      throw new QueryError(Errors.QUERY.INVALID_TRANSACTION, { code: "INVALID_TRANSACTION" });
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
    const runOnce = async (): Promise<T> =>
      mode
        ? await start.call(this.sql, mode, (txSql) => fn(run(txSql)))
        : await start.call(this.sql, (txSql) => fn(run(txSql)));

    const retry = transactionOptions?.retry;
    if (retry !== undefined) {
      if (retry.max !== undefined && (!Number.isInteger(retry.max) || retry.max < 0)) {
        throw new QueryError(Errors.QUERY.INVALID_TRANSACTION, {
          code: "INVALID_TRANSACTION",
        });
      }
      if (retry.delayMs !== undefined && (!Number.isInteger(retry.delayMs) || retry.delayMs < 0)) {
        throw new QueryError(Errors.QUERY.INVALID_TRANSACTION, {
          code: "INVALID_TRANSACTION",
        });
      }
      if (
        retry.backoff !== undefined &&
        retry.backoff !== "fixed" &&
        retry.backoff !== "exponential"
      ) {
        throw new QueryError(Errors.QUERY.INVALID_TRANSACTION, {
          code: "INVALID_TRANSACTION",
        });
      }
      if (
        retry.on !== undefined &&
        (!Array.isArray(retry.on) ||
          retry.on.some((code) => typeof code !== "string" || !/^[0-9A-Z]{5}$/.test(code)))
      ) {
        throw new QueryError(Errors.QUERY.INVALID_TRANSACTION, {
          code: "INVALID_TRANSACTION",
        });
      }
    }

    const maxRetries = retry ? (retry.max ?? 3) : 0;
    const retryCodes = new Set(
      retry?.on ?? [PostgresErrorCodes.serializationFailure, PostgresErrorCodes.deadlockDetected]
    );
    let attempt = 0;

    while (true) {
      try {
        return await runOnce();
      } catch (error) {
        attempt += 1;
        const code =
          typeof error === "object" && error !== null && "code" in error
            ? String((error as { code: unknown }).code)
            : undefined;
        if (attempt > maxRetries || !code || !retryCodes.has(code)) throw error;

        const baseDelay = retry?.delayMs ?? 0;
        const multiplier = retry?.backoff === "fixed" ? 1 : 2 ** (attempt - 1);
        const delay = Math.min(baseDelay * multiplier, 30_000);
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }

  /**
   * Create a reusable prepared statement from trusted SQL. Uses postgres.js
   * named preparation (`prepare: true`); parameters are bound on every call.
   */
  prepare<T extends Row = Row>(text: string): PreparedQuery<T> {
    if (typeof text !== "string" || !text.trim()) {
      throw new TableError("prepare requires a non-empty SQL string");
    }

    return async (parameters: readonly unknown[] = []) => {
      if (!Array.isArray(parameters)) {
        throw new TableError("prepare parameters must be an array");
      }
      return this.sql.unsafe<T[]>(text, parameters as never, { prepare: true });
    };
  }

  /**
   * Run raw SQL statements as one postgres.js batch (one round trip, one
   * implicit transaction).
   */
  async batchSQL<Q extends readonly BatchSQLStatement[]>(
    statements: Q
  ): Promise<BatchSQLResults<Q>> {
    if (!Array.isArray(statements) || statements.length === 0) {
      throw new TableError("batchSQL requires a non-empty array of statements");
    }
    for (const statement of statements) {
      if (
        !statement ||
        typeof statement.text !== "string" ||
        !statement.text.trim() ||
        (statement.parameters !== undefined && !Array.isArray(statement.parameters))
      ) {
        throw new TableError("batchSQL received an invalid statement");
      }
    }

    const queries = statements.map((statement) =>
      this.sql.unsafe(statement.text, (statement.parameters ?? []) as never)
    );

    return (await this.sql.batch(queries)) as BatchSQLResults<Q>;
  }

  /**
   * True postgres.js batch: one SQL batch, one implicit transaction, one
   * round trip. Pass pending queries directly or return them from a
   * transaction-like synchronous callback.
   */
  // biome-ignore lint/suspicious/noExplicitAny: accepts deferred queries of any row shape
  batch<Q extends readonly DeferredQuery<any>[]>(queries: [...Q]): Promise<BatchResults<Q>>;
  // biome-ignore lint/suspicious/noExplicitAny: accepts deferred queries of any row shape
  batch<Q extends readonly DeferredQuery<any>[]>(
    build: (tx: PgBuddyClient) => [...Q]
  ): Promise<BatchResults<Q>>;
  // biome-ignore lint/suspicious/noExplicitAny: accepts pending queries of any row shape
  batch<Q extends readonly PendingQuery<any>[]>(queries: [...Q]): Promise<BatchResults<Q>>;
  // biome-ignore lint/suspicious/noExplicitAny: accepts pending queries of any row shape
  batch<Q extends readonly PendingQuery<any>[]>(
    build: (tx: PgBuddyClient) => [...Q]
  ): Promise<BatchResults<Q>>;
  async batch(input: unknown): Promise<unknown> {
    const queries =
      typeof input === "function" ? (input as (tx: PgBuddyClient) => unknown)(this) : input;

    if (!Array.isArray(queries)) {
      throw new TableError("batch callback must return an array of pending postgres.js queries");
    }
    if (queries.length === 0) return [];
    if (queries.every(isDeferredQuery)) {
      const pending = queries.map((query) => query.pending());
      const results = await this.sql.batch(pending as never);
      return Promise.all(queries.map((query, index) => query.resolve(results[index])));
    }
    return this.sql.batch(queries as never);
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
  private buildAdapterTable<
    T extends Row,
    I extends Row = T,
    const AR extends AdapterRelations = Record<string, never>,
  >(
    tableName: string,
    adapter: ValidationAdapter<T, I>,
    options?: PgBuddyClientOptions & { adapterRelations?: AR }
  ): ValidatedTable<T, ["*"], I, AR> {
    if (!isValidationAdapter(adapter)) {
      throw new TableError("Adapter tables require a ValidationAdapter");
    }
    if (
      !Array.isArray(adapter.fields) ||
      adapter.fields.length === 0 ||
      adapter.fields.some((field) => typeof field !== "string" || !field)
    ) {
      throw new TableError("ValidationAdapter.fields must be a non-empty array of column names");
    }

    const strictNames = options?.strictNames ?? this.strictNames ?? false;
    const allowSchema = options?.allowSchema ?? this.allowSchema ?? false;
    const allowedColumns = options?.allowedColumns ?? this.allowedColumns;
    const maxTake = options?.maxTake ?? this.maxTake ?? DEFAULT_MAX_TAKE;
    const maxSkip = options?.maxSkip ?? this.maxSkip;
    const uniqueKeys = options?.unique ?? this.uniqueKeys;
    const defaultTake = options?.defaultTake ?? this.defaultTake;
    const columnMap = options?.columnMap ?? this.columnMap;
    const columnCodecs = options?.columnCodecs ?? this.columnCodecs;

    if (typeof tableName !== "string" || !tableName.trim()) {
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
    if (maxSkip !== undefined && (!Number.isInteger(maxSkip) || maxSkip < 0)) {
      throw new TableError(Errors.TABLE.INVALID_MAX_SKIP);
    }
    assertUniqueOption(uniqueKeys);
    assertDefaultTake(defaultTake);
    assertColumnMap(columnMap);
    assertColumnCodecs(columnCodecs);
    if (defaultTake !== undefined && defaultTake > maxTake) {
      throw new TableError(Errors.TABLE.INVALID_DEFAULT_TAKE);
    }

    if (columnMap) {
      for (const field of Object.keys(columnMap)) {
        if (!adapter.fields.includes(field as keyof T & string)) {
          throw new TableError(Errors.TABLE.INVALID_COLUMN_MAP);
        }
      }
    }
    if (columnCodecs) {
      for (const field of Object.keys(columnCodecs)) {
        if (!adapter.fields.includes(field as keyof T & string)) {
          throw new TableError(Errors.TABLE.INVALID_COLUMN_CODECS);
        }
      }
    }

    const trimmedName = tableName.trim();
    const isValid = strictNames
      ? isValidIdentifier(trimmedName, { allowSchema })
      : isValidName(trimmedName) && (allowSchema || !trimmedName.includes("."));
    if (!isValid) {
      throw new TableError(Errors.TABLE.INVALID_NAME);
    }

    const table = new Table<Row, ["*"], Row>(this.sql, trimmedName, {
      strictNames,
      allowSchema,
      allowedColumns,
      maxTake,
      maxSkip,
      uniqueKeys,
      defaultTake,
      columnMap,
      columnCodecs,
      columns: adapter.fields as readonly string[],
    });

    return new ValidatedTable(
      table as unknown as Table<T, ["*"], I>,
      adapter,
      options?.adapterRelations
    );
  }

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
  table<S, const AR extends AdapterRelations = Record<string, never>>(
    tableName: string,
    schema: S,
    options?: PgBuddyClientOptions & { adapterRelations?: AR }
  ): ValidatedTable<ValidatedRow<S>, ["*"], ValidatedInput<S>, AR>;
  table(
    tableName: string,
    schema: unknown,
    options?: PgBuddyClientOptions & { adapterRelations?: AdapterRelations }
  ): ZodTable<ZodObject<ZodRawShape>> | ValidatedTable<Row, ["*"], Row, AdapterRelations> {
    if (this.adapter !== zodValidator) {
      if (options?.relations) {
        throw new TableError("Relations require the Zod adapter");
      }
      const bound = bindValidator(schema, this.adapter) as unknown as ValidationAdapter<Row, Row>;
      return this.buildAdapterTable(tableName, bound, options) as unknown as ValidatedTable<
        Row,
        ["*"],
        Row,
        AdapterRelations
      >;
    }

    if (!isZodSchema(schema)) {
      throw new TableError(Errors.TABLE.INVALID_SCHEMA);
    }

    const strictNames = options?.strictNames ?? this.strictNames ?? false;
    const allowSchema = options?.allowSchema ?? this.allowSchema ?? false;
    const allowedColumns = options?.allowedColumns ?? this.allowedColumns;
    const maxTake = options?.maxTake ?? this.maxTake ?? DEFAULT_MAX_TAKE;
    const maxSkip = options?.maxSkip ?? this.maxSkip;
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
    if (maxSkip !== undefined && (!Number.isInteger(maxSkip) || maxSkip < 0)) {
      throw new TableError(Errors.TABLE.INVALID_MAX_SKIP);
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
      maxSkip,
      uniqueKeys,
      defaultTake,
      columnMap,
      columnCodecs,
      selectedFields: schemaColumns.length
        ? (schemaColumns as unknown as SelectKeys<Row>)
        : undefined,
    });

    const zodTable = new ZodTable(
      table as unknown as Table<
        RowFromSchema<ZodObject<ZodRawShape>>,
        ["*"],
        RowFromSchema<ZodObject<ZodRawShape>>
      >,
      schema,
      options?.relations
    );

    return zodTable as unknown as ZodTable<ZodObject<ZodRawShape>>;
  }
}
