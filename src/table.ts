import type { Row, Sql } from "postgres";
import { Errors, QueryError } from "./errors";
import { gt, isPredicate, lt, rawPredicate, type WhereInput } from "./predicates";
import type {
  AggregateOptions,
  AggregateResult,
  ColumnCodecs,
  ColumnMap,
  ComputedMap,
  ComputedOptions,
  ComputedResult,
  CreateManyOptions,
  LockMode,
  LockOptions,
  SelectFields,
  SelectKeys,
  SortSpec,
  SqlExpression,
  SqlFragment,
  UpdateData,
  UpsertOptions,
  WhereCondition,
} from "./types";

import {
  buildSelect,
  buildWhereInputs,
  chunkRecords,
  createLimitFragment,
  createSortExpression,
  DEFAULT_MAX_TAKE,
  isValidData,
  isValidIdentifier,
  isValidName,
  isValidWhereInput,
  validatePagination,
} from "./utils";

/**
 * Result of `selectExpr`: a terminal query with typed computed fields.
 */
export class ProjectedQuery<
  T extends Row,
  K extends SelectKeys<T>,
  I extends Row,
  X extends ComputedMap,
> {
  private readonly table: Table<T, K, I>;
  private readonly computed: X;

  constructor(table: Table<T, K, I>, computed: X) {
    this.table = table;
    this.computed = computed;
  }

  findMany(): Promise<Array<SelectFields<T, K>[0] & ComputedResult<X>>> {
    return this.table.findMany({ computed: this.computed });
  }

  findFirst(): Promise<(SelectFields<T, K>[0] & ComputedResult<X>) | null> {
    return this.table.findFirst({ computed: this.computed });
  }

  findUnique(): Promise<(SelectFields<T, K>[0] & ComputedResult<X>) | null> {
    return this.table.findUnique({ computed: this.computed });
  }

  findFirstOrThrow(): Promise<SelectFields<T, K>[0] & ComputedResult<X>> {
    return this.table.findFirstOrThrow({ computed: this.computed });
  }

  findUniqueOrThrow(): Promise<SelectFields<T, K>[0] & ComputedResult<X>> {
    return this.table.findUniqueOrThrow({ computed: this.computed });
  }

  where(conditions: WhereInput<T>): ProjectedQuery<T, K, I, X> {
    return new ProjectedQuery(this.table.where(conditions), this.computed);
  }

  whereRaw(fragment: SqlFragment): ProjectedQuery<T, K, I, X> {
    return new ProjectedQuery(this.table.whereRaw(fragment), this.computed);
  }

  whereUnique(where: Partial<T>): ProjectedQuery<T, K, I, X> {
    return new ProjectedQuery(this.table.whereUnique(where), this.computed);
  }

  orderBy(spec: SortSpec<T>[]): ProjectedQuery<T, K, I, X> {
    return new ProjectedQuery(this.table.orderBy(spec), this.computed);
  }

  orderByRaw(fragment: SqlFragment): ProjectedQuery<T, K, I, X> {
    return new ProjectedQuery(this.table.orderByRaw(fragment), this.computed);
  }

  skip(count: number): ProjectedQuery<T, K, I, X> {
    return new ProjectedQuery(this.table.skip(count), this.computed);
  }

  take(count: number): ProjectedQuery<T, K, I, X> {
    return new ProjectedQuery(this.table.take(count), this.computed);
  }

  distinct(): ProjectedQuery<T, K, I, X> {
    return new ProjectedQuery(this.table.distinct(), this.computed);
  }

  distinctOn(columns: readonly (keyof T & string)[]): ProjectedQuery<T, K, I, X> {
    return new ProjectedQuery(this.table.distinctOn(columns), this.computed);
  }

  distinctOnExpr(expressions: readonly SqlFragment[]): ProjectedQuery<T, K, I, X> {
    return new ProjectedQuery(this.table.distinctOnExpr(expressions), this.computed);
  }

  for(mode: LockMode, options?: LockOptions): ProjectedQuery<T, K, I, X> {
    return new ProjectedQuery(this.table.for(mode, options), this.computed);
  }

  cursor(value: Partial<T>): ProjectedQuery<T, K, I, X> {
    return new ProjectedQuery(this.table.cursor(value), this.computed);
  }

  select<K2 extends SelectKeys<T>>(fields: K2): ProjectedQuery<T, K2, I, X> {
    return new ProjectedQuery(this.table.select(fields), this.computed);
  }

  count(): Promise<number> {
    return this.table.count();
  }

  exists(): Promise<boolean> {
    return this.table.exists();
  }
}

/** A grouped row: selected group columns plus typed aggregates. */
export type GroupedRow<
  T extends Row,
  G extends readonly (keyof T & string)[],
  X extends ComputedMap,
> = Pick<T, G[number]> & ComputedResult<X>;

/**
 * Result of `groupBy`: grouped rows plus typed aggregate aliases.
 */
export class GroupedQuery<
  T extends Row,
  K extends SelectKeys<T>,
  I extends Row,
  G extends readonly (keyof T & string)[],
  X extends ComputedMap,
> {
  private readonly table: Table<T, K, I>;
  private readonly columns: G;
  private readonly aggregates: X;
  private readonly havingValue?: SqlFragment;

  constructor(table: Table<T, K, I>, columns: G, aggregates: X, having?: SqlFragment) {
    this.table = table;
    this.columns = columns;
    this.aggregates = aggregates;
    this.havingValue = having;
  }

  private next(overrides: {
    table?: Table<T, K, I>;
    having?: SqlFragment;
  }): GroupedQuery<T, K, I, G, X> {
    return new GroupedQuery(
      overrides.table ?? this.table,
      this.columns,
      this.aggregates,
      overrides.having ?? this.havingValue
    );
  }

  having(fragment: SqlFragment): GroupedQuery<T, K, I, G, X> {
    return this.next({ having: fragment });
  }

  where(conditions: WhereInput<T>): GroupedQuery<T, K, I, G, X> {
    return this.next({ table: this.table.where(conditions) });
  }

  whereRaw(fragment: SqlFragment): GroupedQuery<T, K, I, G, X> {
    return this.next({ table: this.table.whereRaw(fragment) });
  }

  orderBy(spec: SortSpec<T>[]): GroupedQuery<T, K, I, G, X> {
    return this.next({ table: this.table.orderBy(spec) });
  }

  orderByRaw(fragment: SqlFragment): GroupedQuery<T, K, I, G, X> {
    return this.next({ table: this.table.orderByRaw(fragment) });
  }

  skip(count: number): GroupedQuery<T, K, I, G, X> {
    return this.next({ table: this.table.skip(count) });
  }

  take(count: number): GroupedQuery<T, K, I, G, X> {
    return this.next({ table: this.table.take(count) });
  }

  findMany(): Promise<Array<GroupedRow<T, G, X>>> {
    return this.table.executeGrouped(this.columns, this.aggregates, this.havingValue);
  }

  async findFirst(): Promise<GroupedRow<T, G, X> | null> {
    const rows = await this.take(1).findMany();
    return rows[0] ?? null;
  }

  async findFirstOrThrow(): Promise<GroupedRow<T, G, X>> {
    const row = await this.findFirst();
    if (!row) {
      throw new QueryError(Errors.QUERY.NO_ROWS, { code: "NO_ROWS" });
    }
    return row;
  }
}

/** A joined value: nullable for left joins, required for inner joins. */
export type JoinValue<J extends Row, Mode extends "inner" | "left"> = Mode extends "left"
  ? J | null
  : J;

/** A left row plus a nested joined row under the join name. */
export type JoinResult<
  T extends Row,
  Name extends string,
  J extends Row,
  Mode extends "inner" | "left",
> = T & { [P in Name]: JoinValue<J, Mode> };

/** Options for a single narrow join. */
export type JoinOptions<J extends Row = Row> = {
  /** Right-hand table name. Defaults to the join name. */
  table?: string;
  /** SQL alias for the right-hand table. Defaults to the join name. */
  alias?: string;
  columns: readonly (keyof J & string)[];
  on: SqlFragment;
};

type JoinSpec = {
  name: string;
  table: string;
  alias: string;
  columns: readonly string[];
  on: SqlFragment;
  mode: "inner" | "left";
};

type JoinHost = {
  getSql(): Sql<Record<string, unknown>>;
  getNameOptions(): { strictNames: boolean; allowSchema: boolean; columnMap?: ColumnMap };
  getTableName(): string;
};

function createJoinSpec<J extends Row>(
  table: JoinHost,
  name: string,
  options: JoinOptions<J>,
  mode: "inner" | "left",
  existing: readonly JoinSpec[]
): JoinSpec {
  const fail = (): never => {
    throw new QueryError(Errors.SELECT.INVALID_JOIN, { code: "INVALID_JOIN" });
  };

  if (typeof name !== "string" || !name.trim()) fail();
  if (!options || typeof options !== "object") fail();

  const normalizedName = name.trim();
  if (!isValidIdentifier(normalizedName, { allowSchema: false })) fail();

  const tableName = (options.table ?? normalizedName).trim();
  const alias = (options.alias ?? normalizedName).trim();
  const { strictNames, allowSchema } = table.getNameOptions();

  if (!tableName || !alias) fail();

  const validTable = strictNames
    ? isValidIdentifier(tableName, { allowSchema })
    : isValidName(tableName) && (allowSchema || !tableName.includes("."));

  if (!validTable || !isValidIdentifier(alias, { allowSchema: false })) fail();

  // A right-side alias must not collide with the left table name, another
  // join alias, or another nested result key.
  if (alias === table.getTableName()) fail();
  if (existing.some((join) => join.alias === alias || join.name === normalizedName)) fail();

  if (
    !Array.isArray(options.columns) ||
    options.columns.length === 0 ||
    options.columns.some((column) => typeof column !== "string" || !column) ||
    new Set(options.columns).size !== options.columns.length ||
    !options.on
  ) {
    fail();
  }

  return {
    name: normalizedName,
    table: tableName,
    alias,
    columns: options.columns,
    on: options.on,
    mode,
  };
}

/**
 * Narrow join query. Each joined row is nested under its join name, so
 * duplicate column names never collide with the left row.
 */
export class JoinQuery<
  T extends Row,
  K extends SelectKeys<T>,
  I extends Row,
  Joined extends Record<string, unknown> = Record<never, never>,
> {
  private readonly table: Table<T, K, I>;
  private readonly joins: readonly JoinSpec[];

  /** @internal */
  constructor(table: Table<T, K, I>, joins: readonly JoinSpec[]) {
    this.table = table;
    this.joins = joins;
  }

  private next(table: Table<T, K, I>): JoinQuery<T, K, I, Joined> {
    return new JoinQuery<T, K, I, Joined>(table, this.joins);
  }

  private nextJoin<Name extends string, J extends Row, Mode extends "inner" | "left">(
    table: Table<T, K, I>,
    name: Name,
    options: JoinOptions<J>,
    mode: Mode
  ): JoinQuery<T, K, I, Joined & { [P in Name]: JoinValue<J, Mode> }> {
    const spec = createJoinSpec(table, name, options, mode, this.joins);
    return new JoinQuery<T, K, I, Joined & { [P in Name]: JoinValue<J, Mode> }>(table, [
      ...this.joins,
      spec,
    ]);
  }

  innerJoin<Name extends string, J extends Row = Row>(
    name: Name,
    options: JoinOptions<J>
  ): JoinQuery<T, K, I, Joined & { [P in Name]: J }> {
    return this.nextJoin(this.table, name, options, "inner");
  }

  leftJoin<Name extends string, J extends Row = Row>(
    name: Name,
    options: JoinOptions<J>
  ): JoinQuery<T, K, I, Joined & { [P in Name]: J | null }> {
    return this.nextJoin(this.table, name, options, "left");
  }

  where(conditions: WhereInput<T>): JoinQuery<T, K, I, Joined> {
    return this.next(this.table.where(conditions));
  }

  whereRaw(fragment: SqlFragment): JoinQuery<T, K, I, Joined> {
    return this.next(this.table.whereRaw(fragment));
  }

  orderBy(spec: SortSpec<T>[]): JoinQuery<T, K, I, Joined> {
    return this.next(this.table.orderBy(spec));
  }

  orderByRaw(fragment: SqlFragment): JoinQuery<T, K, I, Joined> {
    return this.next(this.table.orderByRaw(fragment));
  }

  skip(count: number): JoinQuery<T, K, I, Joined> {
    return this.next(this.table.skip(count));
  }

  take(count: number): JoinQuery<T, K, I, Joined> {
    return this.next(this.table.take(count));
  }

  distinct(): JoinQuery<T, K, I, Joined> {
    return this.next(this.table.distinct());
  }

  distinctOn(columns: readonly (keyof T & string)[]): JoinQuery<T, K, I, Joined> {
    return this.next(this.table.distinctOn(columns));
  }

  distinctOnExpr(expressions: readonly SqlFragment[]): JoinQuery<T, K, I, Joined> {
    return this.next(this.table.distinctOnExpr(expressions));
  }

  select<K2 extends SelectKeys<T>>(fields: K2): JoinQuery<T, K2, I, Joined> {
    return new JoinQuery<T, K2, I, Joined>(this.table.select(fields), this.joins);
  }

  findMany(): Promise<Array<SelectFields<T, K>[0] & Joined>> {
    return this.table.executeJoins(this.joins) as Promise<Array<SelectFields<T, K>[0] & Joined>>;
  }

  async findFirst(): Promise<(SelectFields<T, K>[0] & Joined) | null> {
    const rows = await this.take(1).findMany();
    return rows[0] ?? null;
  }

  async findFirstOrThrow(): Promise<SelectFields<T, K>[0] & Joined> {
    const row = await this.findFirst();
    if (!row) {
      throw new QueryError(Errors.QUERY.NO_ROWS, { code: "NO_ROWS" });
    }
    return row;
  }
}

/**
 * Table-specific query builder with chainable methods.
 *
 * This class provides a fluent API for building PostgreSQL queries
 * with full type safety. It supports common operations like select,
 * insert, update, and delete with automatic type inference.
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
 * // Create a table instance
 * const users = db.table("users", UserSchema);
 *
 * // Chain methods to build and execute queries
 * const activeUsers = await users
 *   .where({ status: "active" })
 *   .orderBy([{ column: "created_at", direction: "DESC" }])
 *   .take(10)
 *   .findMany();
 * ```
 *
 * @template T The table row type that extends Postgres.js Row
 */
type TableState<T extends Row> = {
  whereInputs?: readonly WhereInput<T>[];
  selectedFields?: SelectKeys<T>;
  skipValue?: number;
  takeValue?: number;
  orderByValue?: SortSpec<T>[];
  orderByRawValue?: SqlFragment;
  columns?: readonly string[];
  lockValue?: { mode: LockMode; skipLocked?: boolean; noWait?: boolean };
  distinctValue?: boolean;
  distinctOnValue?: readonly string[];
  distinctOnExprValue?: readonly SqlFragment[];
  cursorValue?: Partial<T>;
  strictNames?: boolean;
  allowSchema?: boolean;
  allowedColumns?: readonly string[];
  columnMap?: ColumnMap;
  columnCodecs?: ColumnCodecs;
  maxTake?: number;
  uniqueKeys?: readonly (readonly string[])[];
  uniqueWhere?: boolean;
  defaultTake?: number;
};

/**
 * Snapshots WHERE inputs so a caller that keeps a reference to an array or
 * object cannot change a query after it was built (or, for ZodTable, after it
 * was validated). Predicates are immutable and shared as-is.
 */
function copyWhereInputs<T extends Row>(inputs?: readonly WhereInput<T>[]): WhereInput<T>[] {
  return (inputs ?? []).map((input) => {
    if (isPredicate(input)) return input;

    return Array.isArray(input)
      ? (input.map((condition) => ({ ...condition })) as WhereCondition<T>[])
      : { ...input };
  });
}

function omitUndefined<T>(value: T): T {
  if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof Date) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) result[key] = entry;
  }
  return result as T;
}

function describeQuery(query: unknown): { text: string; parameters: readonly unknown[] } {
  const parameters: unknown[] = [];

  const render = (value: unknown): string => {
    const source = value as {
      strings?: readonly string[];
      args?: readonly unknown[];
      value?: unknown;
      constructor?: { name?: string };
    };

    if (Array.isArray(source?.strings) && Array.isArray(source.args)) {
      const strings = source.strings;
      const args = source.args;
      let text = "";
      strings.forEach((part, index) => {
        text += part;
        if (index < args.length) {
          text += render(args[index]);
        }
      });
      return text;
    }

    if (
      typeof source === "object" &&
      source !== null &&
      source.constructor?.name === "Identifier" &&
      typeof source.value === "string"
    ) {
      return source.value;
    }

    parameters.push(value);
    return `$${parameters.length}`;
  };

  if (!query || typeof query !== "object") {
    throw new QueryError("Unable to inspect query");
  }

  return { text: render(query), parameters };
}

export class Table<T extends Row, K extends SelectKeys<T> = ["*"], I extends Row = T> {
  private sql: Sql<Record<string, unknown>>;
  private tableName: string;
  private whereInputs: WhereInput<T>[];
  private selectedFields: K;
  private skipValue?: number;
  private takeValue?: number;
  private orderByValue?: SortSpec<T>[];
  private orderByRawValue?: SqlFragment;
  private columns?: string[];
  private lockValue?: { mode: LockMode; skipLocked?: boolean; noWait?: boolean };
  private distinctValue: boolean;
  private distinctOnValue?: string[];
  private distinctOnExprValue?: SqlFragment[];
  private cursorValue?: Partial<T>;
  private strictNames: boolean;
  private allowSchema: boolean;
  private allowedColumns?: readonly string[];
  private columnMap?: ColumnMap;
  private columnCodecs?: ColumnCodecs;
  private maxTake: number;
  private uniqueKeys?: readonly (readonly string[])[];
  private uniqueWhere: boolean;
  private defaultTake?: number;

  constructor(sql: Sql<Record<string, unknown>>, tableName: string, state?: TableState<T>) {
    this.sql = sql;
    this.tableName = tableName;
    this.whereInputs = copyWhereInputs(state?.whereInputs);
    this.selectedFields = [...(state?.selectedFields ?? state?.columns ?? ["*"])] as unknown as K;
    this.skipValue = state?.skipValue;
    this.takeValue = state?.takeValue;
    this.orderByValue = state?.orderByValue?.map((spec) => ({ ...spec }));
    this.orderByRawValue = state?.orderByRawValue;
    this.columns = state?.columns ? [...state.columns] : undefined;
    this.lockValue = state?.lockValue ? { ...state.lockValue } : undefined;
    this.distinctValue = Boolean(state?.distinctValue);
    this.distinctOnValue = state?.distinctOnValue ? [...state.distinctOnValue] : undefined;
    this.distinctOnExprValue = state?.distinctOnExprValue
      ? [...state.distinctOnExprValue]
      : undefined;
    this.cursorValue = state?.cursorValue ? { ...state.cursorValue } : undefined;
    this.strictNames = Boolean(state?.strictNames);
    this.allowSchema = Boolean(state?.allowSchema);
    this.allowedColumns = state?.allowedColumns ? [...state.allowedColumns] : undefined;
    this.columnMap = state?.columnMap ? { ...state.columnMap } : undefined;
    this.columnCodecs = state?.columnCodecs ? { ...state.columnCodecs } : undefined;
    this.maxTake = state?.maxTake ?? DEFAULT_MAX_TAKE;
    this.uniqueKeys = state?.uniqueKeys?.map((columns) => [...columns]);
    this.uniqueWhere = Boolean(state?.uniqueWhere);
    this.defaultTake = state?.defaultTake;
  }

  /** @internal Returns the identifier validation options. */
  getNameOptions(): {
    strictNames: boolean;
    allowSchema: boolean;
    columnMap?: ColumnMap;
    columnCodecs?: ColumnCodecs;
  } {
    return {
      strictNames: this.strictNames,
      allowSchema: this.allowSchema,
      columnMap: this.columnMap,
      columnCodecs: this.columnCodecs,
    };
  }

  private resolveColumn(field: string): string {
    return this.columnMap?.[field] ?? field;
  }

  private encodeValue(field: string, value: unknown): unknown {
    if (
      typeof value === "function" ||
      (typeof value === "object" &&
        value !== null &&
        Array.isArray((value as { strings?: unknown }).strings) &&
        Array.isArray((value as { args?: unknown }).args))
    ) {
      return value;
    }

    const encode = this.columnCodecs?.[field]?.encode;
    return encode ? encode(value) : value;
  }

  private decodeRow(row: Record<string, unknown>): Record<string, unknown> {
    const decoded = { ...row };
    if (!this.columnCodecs) return decoded;

    for (const [field, codec] of Object.entries(this.columnCodecs)) {
      if (codec.decode && field in decoded) {
        decoded[field] = codec.decode(decoded[field]);
      }
    }
    return decoded;
  }

  private decodeRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    if (!this.columnCodecs) return rows;
    return rows.map((row) => this.decodeRow(row));
  }

  private mapRecord(record: Record<string, unknown>): Record<string, unknown> {
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      mapped[this.resolveColumn(key)] = this.encodeValue(key, value);
    }
    return mapped;
  }

  private nameOptions(): {
    strictNames: boolean;
    allowSchema: boolean;
    columnMap?: ColumnMap;
    columnCodecs?: ColumnCodecs;
  } {
    return {
      strictNames: this.strictNames,
      allowSchema: this.allowSchema,
      columnMap: this.columnMap,
      columnCodecs: this.columnCodecs,
    };
  }

  /** @internal Returns the table name. */
  getTableName(): string {
    return this.tableName;
  }

  /** @internal Returns the underlying postgres.js instance. */
  getSql(): Sql<Record<string, unknown>> {
    return this.sql;
  }

  /** @internal Returns the current SELECT projection. */
  getSelectedFields(): SelectKeys<T> {
    return [...this.selectedFields] as SelectKeys<T>;
  }

  private hasWhereConditions(): boolean {
    return this.whereInputs.length > 0 && this.whereInputs.every(isValidWhereInput);
  }

  private clone(next: Partial<TableState<T>>): Table<T, K, I> {
    return new Table<T, K, I>(this.sql, this.tableName, {
      whereInputs: this.whereInputs,
      selectedFields: this.selectedFields,
      skipValue: this.skipValue,
      takeValue: this.takeValue,
      orderByValue: this.orderByValue,
      orderByRawValue: this.orderByRawValue,
      columns: this.columns,
      lockValue: this.lockValue,
      distinctValue: this.distinctValue,
      distinctOnValue: this.distinctOnValue,
      distinctOnExprValue: this.distinctOnExprValue,
      cursorValue: this.cursorValue,
      strictNames: this.strictNames,
      allowSchema: this.allowSchema,
      allowedColumns: this.allowedColumns,
      columnMap: this.columnMap,
      columnCodecs: this.columnCodecs,
      maxTake: this.maxTake,
      uniqueKeys: this.uniqueKeys,
      uniqueWhere: this.uniqueWhere,
      defaultTake: this.defaultTake,
      ...next,
    });
  }

  /**
   * Rejects write payload keys that are outside the configured allowlist.
   * Without an allowlist, any key is treated as a column (matching postgres.js).
   */
  private assertAllowedColumns(columns: string[], operation: "insert" | "update"): void {
    if (!this.allowedColumns) return;

    const allowed = new Set(this.allowedColumns);
    for (const column of columns) {
      if (!allowed.has(column)) {
        throw new QueryError(
          operation === "insert"
            ? Errors.INSERT.COLUMN_NOT_ALLOWED(column)
            : Errors.UPDATE.COLUMN_NOT_ALLOWED(column),
          { code: "COLUMN_NOT_ALLOWED" }
        );
      }
    }
  }

  /**
   * Specify fields to select from the table.
   *
   * @param fields - An array of column names to select from the table
   * @returns `this` for method chaining
   *
   * @example
   * ```typescript
   * // Select only specific fields
   * const userEmails = await users
   *   .select(["id", "email"])
   *   .findMany();
   *
   * // Result type will be { id: number; email: string }[]
   * ```
   */
  select<K2 extends SelectKeys<T>>(fields: K2): Table<T, K2, I> {
    return new Table<T, K2, I>(this.sql, this.tableName, {
      whereInputs: this.whereInputs,
      selectedFields: fields,
      skipValue: this.skipValue,
      takeValue: this.takeValue,
      orderByValue: this.orderByValue,
      orderByRawValue: this.orderByRawValue,
      columns: this.columns,
      lockValue: this.lockValue,
      distinctValue: this.distinctValue,
      distinctOnValue: this.distinctOnValue,
      distinctOnExprValue: this.distinctOnExprValue,
      cursorValue: this.cursorValue,
      strictNames: this.strictNames,
      allowSchema: this.allowSchema,
      allowedColumns: this.allowedColumns,
      columnMap: this.columnMap,
      columnCodecs: this.columnCodecs,
      maxTake: this.maxTake,
      uniqueKeys: this.uniqueKeys,
      uniqueWhere: this.uniqueWhere,
      defaultTake: this.defaultTake,
    });
  }

  /**
   * Filter by a unique column set declared in the `unique` table option.
   *
   * @example
   * ```typescript
   * const user = await users.whereUnique({ email }).findUnique();
   * ```
   */
  whereUnique(where: Partial<T>): Table<T, K, I> {
    if (!isValidData(where)) {
      throw new QueryError(Errors.WHERE.INVALID_CONDITIONS, { code: "INVALID_WHERE" });
    }

    const keys = Object.keys(where);
    const matches = this.uniqueKeys?.some(
      (unique) => unique.length === keys.length && keys.every((key) => unique.includes(key))
    );

    if (!matches) {
      throw new QueryError(Errors.WHERE.INVALID_UNIQUE(keys.join(", ")), { code: "INVALID_WHERE" });
    }

    return this.clone({ whereInputs: [...this.whereInputs, where], uniqueWhere: true });
  }

  /**
   * Add aliased computed SQL expressions to the projection. Terminal methods
   * on the returned query are typed with the computed fields.
   *
   * @example
   * ```typescript
   * const rows = await users.selectExpr({
   *   lowerEmail: sqlExpr<string>(sql`lower(email)`),
   * }).findMany();
   * ```
   */
  selectExpr<X extends ComputedMap>(expressions: X): ProjectedQuery<T, K, I, X> {
    return new ProjectedQuery<T, K, I, X>(this, expressions);
  }

  /**
   * Set WHERE conditions for filtering records.
   *
   * @param conditions - Conditions for the WHERE clause. Can be:
   *   - An object with field-value pairs for equality comparisons
   *   - An array of WhereCondition objects for advanced filtering
   * @returns `this` for method chaining
   *
   * @example
   * ```typescript
   * // Simple equality conditions
   * const activeUsers = await users
   *   .where({ status: "active" })
   *   .findMany();
   *
   * // Advanced conditions with operators
   * const recentUsers = await users
   *   .where([
   *     { field: "created_at", operator: ">", value: new Date("2023-01-01") },
   *     { field: "status", operator: "=", value: "active" }
   *   ])
   *   .findMany();
   *
   * // Pattern matching
   * const johnUsers = await users
   *   .where([
   *     { field: "name", operator: "LIKE", value: "John", pattern: "startsWith" }
   *   ])
   *   .findMany();
   * ```
   */
  where(conditions: WhereInput<T>): Table<T, K, I> {
    return this.clone({ whereInputs: [...this.whereInputs, conditions] });
  }

  /**
   * Add a raw postgres.js fragment to the WHERE clause. This is an escape
   * hatch: identifiers and values are not validated, so only pass trusted SQL.
   */
  whereRaw(fragment: SqlFragment): Table<T, K, I> {
    return this.clone({ whereInputs: [...this.whereInputs, rawPredicate<T>(fragment)] });
  }

  /**
   * Set number of records to skip (for pagination)
   *
   * @param count - Number of records to skip (offset)
   * @returns `this` for method chaining
   * @throws {QueryError} If count is negative or not an integer
   *
   * @example
   * ```typescript
   * // Skip first 10 records
   * const page2Users = await users
   *   .skip(10)
   *   .take(5)
   *   .findMany();
   * ```
   */
  skip(count: number): Table<T, K, I> {
    validatePagination(count, undefined);
    return this.clone({ skipValue: count });
  }

  /**
   * Set number of records to take (for pagination)
   *
   * @param count - Number of records to return (limit)
   * @returns `this` for method chaining
   * @throws {QueryError} If count is not a positive integer or exceeds the
   * configured `maxTake` (10,000 by default)
   *
   * @example
   * ```typescript
   * // Take only 5 records
   * const topUsers = await users
   *   .orderBy([{ column: "created_at", direction: "DESC" }])
   *   .take(5)
   *   .findMany();
   * ```
   */
  take(count: number): Table<T, K, I> {
    validatePagination(undefined, count, this.maxTake);
    return this.clone({ takeValue: count });
  }

  /**
   * Set sort order for query results
   *
   * @param spec - Array of sort specifications with column names and directions
   * @returns `this` for method chaining
   *
   * @example
   * ```typescript
   * // Sort by created_at in descending order
   * const newestUsers = await users
   *   .orderBy([{ column: "created_at", direction: "DESC" }])
   *   .findMany();
   *
   * // Multiple sort criteria
   * const sortedUsers = await users
   *   .orderBy([
   *     { column: "status", direction: "ASC" },
   *     { column: "name", direction: "ASC" }
   *   ])
   *   .findMany();
   * ```
   */
  orderBy(spec: SortSpec<T>[]): Table<T, K, I> {
    return this.clone({ orderByValue: spec });
  }

  /**
   * Raw ORDER BY expression for things the column/direction model cannot
   * express (functions, NULLS ordering, relevance). Replaces `orderBy`.
   */
  orderByRaw(fragment: SqlFragment): Table<T, K, I> {
    return this.clone({ orderByRawValue: fragment });
  }

  private orderFragment(): SqlFragment {
    const hasSort = Boolean(this.orderByValue?.length);
    const hasRaw = Boolean(this.orderByRawValue);

    if (!hasSort && !hasRaw) return this.sql``;
    if (!hasSort) return this.sql`ORDER BY ${this.orderByRawValue}`;
    if (!hasRaw) {
      return this
        .sql`ORDER BY ${createSortExpression(this.sql, this.orderByValue, this.nameOptions())}`;
    }

    return this
      .sql`ORDER BY ${createSortExpression(this.sql, this.orderByValue, this.nameOptions())}, ${this.orderByRawValue}`;
  }

  /**
   * Remove columns from the current projection. Requires an explicit
   * projection.
   */
  omit<K2 extends readonly (keyof T & string)[]>(
    columns: K2
  ): Table<T, readonly Exclude<keyof T & string, K2[number]>[], I> {
    const projection = this.getSelectedFields() as readonly string[];
    const available = projection.length === 1 && projection[0] === "*" ? this.columns : projection;

    if (!available) {
      throw new QueryError(Errors.SELECT.CANNOT_OMIT_STAR, { code: "INVALID_COLUMNS" });
    }

    const omitted = new Set<string>(columns);
    for (const column of omitted) {
      if (!available.includes(column)) {
        throw new QueryError(Errors.SELECT.INVALID_COLUMNS(column), { code: "INVALID_COLUMNS" });
      }
    }

    const remaining = available.filter((column) => !omitted.has(column));

    return new Table<T, readonly Exclude<keyof T & string, K2[number]>[], I>(
      this.sql,
      this.tableName,
      {
        whereInputs: this.whereInputs,
        selectedFields: remaining as unknown as SelectKeys<T>,
        skipValue: this.skipValue,
        takeValue: this.takeValue,
        orderByValue: this.orderByValue,
        orderByRawValue: this.orderByRawValue,
        columns: this.columns,
        lockValue: this.lockValue,
        distinctValue: this.distinctValue,
        distinctOnValue: this.distinctOnValue,
        distinctOnExprValue: this.distinctOnExprValue,
        cursorValue: this.cursorValue,
        strictNames: this.strictNames,
        allowSchema: this.allowSchema,
        allowedColumns: this.allowedColumns,
        columnMap: this.columnMap,
        columnCodecs: this.columnCodecs,
        maxTake: this.maxTake,
        uniqueKeys: this.uniqueKeys,
        uniqueWhere: this.uniqueWhere,
        defaultTake: this.defaultTake,
      }
    );
  }

  /**
   * Lock the selected rows (`FOR UPDATE`, `FOR SHARE`, `FOR NO KEY UPDATE`,
   * `FOR KEY SHARE`). Optionally add `SKIP LOCKED` or `NOWAIT`.
   */
  for(mode: LockMode, options?: LockOptions): Table<T, K, I> {
    if (!["update", "share", "no key update", "key share"].includes(mode)) {
      throw new QueryError(Errors.SELECT.INVALID_LOCK, { code: "INVALID_LOCK" });
    }
    if (options?.skipLocked && options?.noWait) {
      throw new QueryError(Errors.SELECT.INVALID_LOCK, { code: "INVALID_LOCK" });
    }

    return this.clone({
      lockValue: { mode, skipLocked: options?.skipLocked, noWait: options?.noWait },
    });
  }

  private lockFragment(): SqlFragment {
    if (!this.lockValue) return this.sql``;

    const mode = this.sql.unsafe(this.lockValue.mode.toUpperCase());
    const suffix = this.lockValue.skipLocked
      ? this.sql` SKIP LOCKED`
      : this.lockValue.noWait
        ? this.sql` NOWAIT`
        : this.sql``;

    return this.sql` FOR ${mode}${suffix}`;
  }

  /** Add `DISTINCT` to the SELECT clause. */
  distinct(): Table<T, K, I> {
    return this.clone({
      distinctValue: true,
      distinctOnValue: undefined,
      distinctOnExprValue: undefined,
    });
  }

  /**
   * Add `DISTINCT ON (columns)` to the SELECT clause. PostgreSQL requires the
   * leading ORDER BY expressions to match the DISTINCT ON expressions.
   */
  distinctOn(columns: readonly (keyof T & string)[]): Table<T, K, I> {
    if (!Array.isArray(columns) || columns.length === 0) {
      throw new QueryError(Errors.SELECT.INVALID_COLUMNS(""), { code: "INVALID_COLUMNS" });
    }
    return this.clone({
      distinctValue: true,
      distinctOnValue: [...columns],
      distinctOnExprValue: undefined,
    });
  }

  /**
   * Add `DISTINCT ON (expressions)`. PostgreSQL requires the leading ORDER BY
   * expressions to match.
   */
  distinctOnExpr(expressions: readonly SqlFragment[]): Table<T, K, I> {
    if (!Array.isArray(expressions) || expressions.length === 0) {
      throw new QueryError(Errors.SELECT.INVALID_COLUMNS(""), { code: "INVALID_COLUMNS" });
    }

    return this.clone({
      distinctValue: true,
      distinctOnExprValue: [...expressions],
      distinctOnValue: undefined,
    });
  }

  /**
   * Keyset pagination: filter rows after (ASC) or before (DESC) the given
   * single-column cursor. The cursor column must match the first `orderBy`
   * column; without `orderBy`, ascending order is assumed.
   *
   * @example
   * ```typescript
   * await users
   *   .orderBy([{ column: "id", direction: "ASC" }])
   *   .cursor({ id: lastId })
   *   .take(20)
   *   .findMany();
   * ```
   */
  cursor(value: Partial<T>): Table<T, K, I> {
    const keys = value ? Object.keys(value) : [];
    if (keys.length === 0) {
      throw new QueryError(Errors.SELECT.INVALID_CURSOR, { code: "INVALID_CURSOR" });
    }

    for (const key of keys) {
      const cursorValue = value[key as keyof T];
      if (cursorValue === undefined || cursorValue === null) {
        throw new QueryError(Errors.SELECT.INVALID_CURSOR, { code: "INVALID_CURSOR" });
      }
    }

    return this.clone({ cursorValue: { ...value } });
  }

  /**
   * Find multiple records that match the query criteria
   *
   * @returns Promise resolving to an array of records matching the query conditions
   *
   * @example
   * ```typescript
   * // Find all active users
   * const activeUsers = await users
   *   .where({ status: "active" })
   *   .findMany();
   *
   * // With pagination and sorting
   * const paginatedUsers = await users
   *   .where({ status: "active" })
   *   .orderBy([{ column: "created_at", direction: "DESC" }])
   *   .skip(10)
   *   .take(5)
   *   .findMany();
   * ```
   */
  async findMany<X extends Record<string, SqlExpression<unknown>> = Record<never, never>>(
    options?: ComputedOptions<X>
  ): Promise<Array<SelectFields<T, K>[0] & ComputedResult<X>>> {
    return this.executeSelect(options?.computed) as Promise<
      Array<SelectFields<T, K>[0] & ComputedResult<X>>
    >;
  }

  /**
   * Find the first matching record or null if no records match
   *
   * @returns Promise resolving to the first matching record or null
   *
   * @example
   * ```typescript
   * // Find the newest active user
   * const newestUser = await users
   *   .where({ status: "active" })
   *   .orderBy([{ column: "created_at", direction: "DESC" }])
   *   .findFirst();
   *
   * if (newestUser) {
   *   console.log(`Found user: ${newestUser.name}`);
   * } else {
   *   console.log("No active users found");
   * }
   * ```
   */
  async findFirst<X extends Record<string, SqlExpression<unknown>> = Record<never, never>>(
    options?: ComputedOptions<X>
  ): Promise<(SelectFields<T, K>[0] & ComputedResult<X>) | null> {
    const results = await this.take(1).executeSelect(options?.computed);
    return (results[0] as (SelectFields<T, K>[0] & ComputedResult<X>) | undefined) ?? null;
  }

  /**
   * Find a unique record or throw an error if multiple records match
   *
   * @returns Promise resolving to the unique matching record or null if none found
   * @throws {QueryError} If multiple records match the query conditions
   *
   * @example
   * ```typescript
   * // Find a user by ID (should be unique)
   * const user = await users
   *   .where({ id: 123 })
   *   .findUnique();
   *
   * // Find user by email (should be unique)
   * try {
   *   const user = await users
   *     .where({ email: "user@example.com" })
   *     .findUnique();
   *
   *   if (user) {
   *     console.log(`Found user: ${user.name}`);
   *   } else {
   *     console.log("User not found");
   *   }
   * } catch (error) {
   *   console.error("Multiple users found with the same email");
   * }
   * ```
   */
  async findUnique<X extends Record<string, SqlExpression<unknown>> = Record<never, never>>(
    options?: ComputedOptions<X>
  ): Promise<(SelectFields<T, K>[0] & ComputedResult<X>) | null> {
    // whereUnique already guarantees a unique target; otherwise fetch two rows
    // to detect a non-unique match. Fetch directly rather than via take(), so
    // a user-configured maxTake of 1 does not break uniqueness detection.
    const take = this.uniqueWhere ? 1 : 2;
    const results = (await this.clone({ takeValue: take }).executeSelect(
      options?.computed
    )) as Array<SelectFields<T, K>[0] & ComputedResult<X>>;

    if (!this.uniqueWhere && results.length > 1) {
      throw new QueryError(Errors.QUERY.NOT_UNIQUE, { code: "NOT_UNIQUE" });
    }

    return results.length === 1 ? (results[0] ?? null) : null;
  }

  /**
   * Find the first matching record or throw if none exists.
   *
   * @throws {QueryError} If no record matches
   */
  async findFirstOrThrow<X extends Record<string, SqlExpression<unknown>> = Record<never, never>>(
    options?: ComputedOptions<X>
  ): Promise<SelectFields<T, K>[0] & ComputedResult<X>> {
    const result = await this.findFirst(options);
    if (!result) {
      throw new QueryError(Errors.QUERY.NO_ROWS, { code: "NO_ROWS" });
    }
    return result;
  }

  /**
   * Find a unique record or throw if none exists.
   *
   * @throws {QueryError} If no record matches or multiple records match
   */
  async findUniqueOrThrow<X extends Record<string, SqlExpression<unknown>> = Record<never, never>>(
    options?: ComputedOptions<X>
  ): Promise<SelectFields<T, K>[0] & ComputedResult<X>> {
    const result = await this.findUnique(options);
    if (!result) {
      throw new QueryError(Errors.QUERY.NO_ROWS, { code: "NO_ROWS" });
    }
    return result;
  }

  /**
   * Group matching records by one or more columns. Aggregates are aliased SQL
   * expressions; use `having()` for a raw aggregate filter.
   */
  groupBy<G extends readonly (keyof T & string)[], X extends ComputedMap = Record<never, never>>(
    columns: G,
    aggregates?: X
  ): GroupedQuery<T, K, I, G, X> {
    if (!Array.isArray(columns) || columns.length === 0) {
      throw new QueryError(Errors.SELECT.INVALID_GROUP, { code: "INVALID_GROUP" });
    }

    return new GroupedQuery<T, K, I, G, X>(this, columns, (aggregates ?? {}) as X);
  }

  /**
   * Execute a grouped SELECT. Used by `GroupedQuery`.
   */
  async executeGrouped<G extends readonly (keyof T & string)[], X extends ComputedMap>(
    columns: G,
    aggregates: X,
    having?: SqlFragment
  ): Promise<Array<GroupedRow<T, G, X>>> {
    if (!Array.isArray(columns) || columns.length === 0) {
      throw new QueryError(Errors.SELECT.INVALID_GROUP, { code: "INVALID_GROUP" });
    }

    const options = this.nameOptions();
    const groupSelection = columns.reduce((acc, field, index) => {
      buildSelect(this.sql, [field] as never, {
        strictNames: this.strictNames,
        allowSchema: this.allowSchema,
      });
      const column = this.resolveColumn(field);
      const part =
        column === field
          ? this.sql`${this.sql(field as never)}`
          : this.sql`${this.sql(column as never)} AS ${this.sql(field as never)}`;
      return index === 0 ? part : this.sql`${acc}, ${part}`;
    }, this.sql``);
    const groupColumns = this.sql(columns.map((column) => this.resolveColumn(column)) as string[]);
    const aggregateEntries = Object.entries(aggregates);

    const seen = new Set<string>(columns as readonly string[]);
    const aggregateParts: SqlFragment[] = [];

    for (const [alias, expression] of aggregateEntries) {
      if (!alias || seen.has(alias) || !expression?.fragment) {
        throw new QueryError(Errors.SELECT.INVALID_GROUP, { code: "INVALID_GROUP" });
      }
      seen.add(alias);
      aggregateParts.push(this.sql`${expression.fragment} AS ${this.sql(alias)}`);
    }

    const aggregateList = aggregateParts.reduce(
      (acc, part, index) => (index === 0 ? part : this.sql`${acc}, ${part}`),
      this.sql``
    );
    const selection = aggregateParts.length
      ? this.sql`${groupSelection}, ${aggregateList}`
      : groupSelection;

    const rows = await this.sql<Array<Record<string, unknown>>>`
            SELECT ${this.distinctValue && !this.distinctOnValue && !this.distinctOnExprValue ? this.sql`DISTINCT ` : this.sql``}${selection}
            FROM ${this.sql(this.tableName)}
            ${buildWhereInputs(this.sql, this.whereInputs, options)}
            GROUP BY ${groupColumns}
            ${having ? this.sql`HAVING ${having}` : this.sql``}
            ${this.orderFragment()}
            ${createLimitFragment(this.sql, this.takeValue ?? this.defaultTake, this.skipValue)}
        `;

    return this.decodeRows(rows) as unknown as Array<GroupedRow<T, G, X>>;
  }

  /**
   * Aggregate matching records. Supports count, countDistinct, sum, avg, min,
   * and max over columns. Use `groupBy()` for grouped aggregates.
   */
  async aggregate(options: AggregateOptions<T>): Promise<AggregateResult> {
    if (!options || typeof options !== "object") {
      throw new QueryError(Errors.SELECT.INVALID_AGGREGATE, { code: "INVALID_AGGREGATE" });
    }

    const parts: SqlFragment[] = [];
    const countDistinct = options.countDistinct ?? [];
    const sum = options.sum ?? [];
    const avg = options.avg ?? [];
    const min = options.min ?? [];
    const max = options.max ?? [];

    if (options.count) {
      parts.push(this.sql`COUNT(*)::int`);
    }

    for (const column of countDistinct) {
      parts.push(this.sql`COUNT(DISTINCT ${this.sql(this.resolveColumn(column) as never)})::int`);
    }
    for (const column of sum) {
      parts.push(this.sql`SUM(${this.sql(this.resolveColumn(column) as never)})`);
    }
    for (const column of avg) {
      parts.push(this.sql`AVG(${this.sql(this.resolveColumn(column) as never)})`);
    }
    for (const column of min) {
      parts.push(this.sql`MIN(${this.sql(this.resolveColumn(column) as never)})`);
    }
    for (const column of max) {
      parts.push(this.sql`MAX(${this.sql(this.resolveColumn(column) as never)})`);
    }

    if (parts.length === 0) {
      throw new QueryError(Errors.SELECT.INVALID_AGGREGATE, { code: "INVALID_AGGREGATE" });
    }

    const combined = parts.reduce(
      (acc, part, index) => (index === 0 ? part : this.sql`${acc}, ${part}`),
      this.sql``
    );

    // Read by position: aggregate aliases are not stable under postgres.js
    // column transforms (camelCase mapping).
    const rows = await this.sql`
            SELECT ${combined}
            FROM ${this.sql(this.tableName)}
            ${buildWhereInputs(this.sql, this.whereInputs, this.nameOptions())}
        `.values();

    const row = rows[0] as unknown[] | undefined;
    const result: AggregateResult = {
      countDistinct: {},
      sum: {},
      avg: {},
      min: {},
      max: {},
    };

    if (!row) return result;

    let index = 0;

    if (options.count) {
      result.count = Number(row[index]);
      index += 1;
    }

    for (const column of countDistinct) {
      result.countDistinct[column] = Number(row[index]);
      index += 1;
    }
    for (const column of sum) {
      const value = row[index];
      result.sum[column] = value === null || value === undefined ? null : Number(value);
      index += 1;
    }
    for (const column of avg) {
      const value = row[index];
      result.avg[column] = value === null || value === undefined ? null : Number(value);
      index += 1;
    }
    for (const column of min) {
      result.min[column] = row[index];
      index += 1;
    }
    for (const column of max) {
      result.max[column] = row[index];
      index += 1;
    }

    return result;
  }

  /**
   * Count records matching the query conditions
   *
   * @returns Promise resolving to the number of records matching the query
   *
   * @example
   * ```typescript
   * // Count active users
   * const activeUserCount = await users
   *   .where({ status: "active" })
   *   .count();
   *
   * console.log(`There are ${activeUserCount} active users`);
   *
   * // Count users created after a specific date
   * const newUserCount = await users
   *   .where([
   *     { field: "created_at", operator: ">", value: new Date("2023-01-01") }
   *   ])
   *   .count();
   * ```
   */
  async count(): Promise<number> {
    const result = await this.sql<[{ count: string }]>`
            SELECT COUNT(*) as count
            FROM ${this.sql(this.tableName)}
            ${buildWhereInputs(this.sql, this.whereInputs, this.nameOptions())}
        `;

    return parseInt(result[0]?.count ?? "0", 10);
  }

  /**
   * Check whether at least one record matches the current conditions.
   */
  async exists(): Promise<boolean> {
    const result = await this.sql<[{ exists: boolean }]>`
            SELECT EXISTS(
              SELECT 1 FROM ${this.sql(this.tableName)}
              ${buildWhereInputs(this.sql, this.whereInputs, this.nameOptions())}
            ) AS exists
        `;

    return Boolean(result[0]?.exists);
  }

  /**
   * Create a new record in the table
   *
   * @param data - The data to insert into the table
   * @returns Promise resolving to the created record with auto-generated values
   * @throws {QueryError} If data is invalid (empty or not an object)
   *
   * @example
   * ```typescript
   * // Create a new user
   * // If id is auto-generated:
   * const users = db.table("users", UserSchema);
   *
   * const newUser = await users.create({
   *   name: "John Doe",
   *   email: "john@example.com",
   *   status: "active",
   *   created_at: new Date()
   * });
   *
   * console.log(`Created user with ID: ${newUser.id}`);
   *
   * // Create with selected return fields
   * const createdUser = await users
   *   .select(["id", "email"])
   *   .create({
   *     name: "Jane Smith",
   *     email: "jane@example.com",
   *     status: "active",
   *     created_at: new Date()
   *   });
   *
   * // createdUser will only have id and email properties
   * ```
   */
  async create<X extends ComputedMap = Record<never, never>>(
    data: I,
    options: { onConflict: "nothing"; computed?: X }
  ): Promise<(SelectFields<T, K>[0] & ComputedResult<X>) | null>;
  async create<X extends ComputedMap = Record<never, never>>(
    data: I,
    options?: { computed?: X }
  ): Promise<SelectFields<T, K>[0] & ComputedResult<X>>;
  async create<X extends ComputedMap = Record<never, never>>(
    data: I,
    options?: { computed?: X; onConflict?: "nothing" }
  ): Promise<(SelectFields<T, K>[0] & ComputedResult<X>) | null> {
    const cleaned = omitUndefined(data);
    if (!isValidData(cleaned)) {
      throw new QueryError(Errors.INSERT.INVALID_DATA, { code: "INVALID_DATA" });
    }

    this.assertAllowedColumns(Object.keys(cleaned), "insert");

    const conflict =
      options?.onConflict === "nothing" ? this.sql`ON CONFLICT DO NOTHING ` : this.sql``;

    const result = await this.sql<SelectFields<T, K>>`
            INSERT INTO ${this.sql(this.tableName)}
            ${this.sql(this.mapRecord(cleaned) as Row)}
            ${conflict}RETURNING ${this.buildSelection(options?.computed)}
        `;

    const created = result[0];
    if (!created) {
      if (options?.onConflict === "nothing") return null;
      throw new QueryError(Errors.QUERY.INSERT_RETURNED_EMPTY, { code: "INSERT_RETURNED_EMPTY" });
    }
    return this.decodeRow(created) as SelectFields<T, K>[0] & ComputedResult<X>;
  }

  /**
   * Insert a record, or update the existing row when it conflicts with the
   * unique columns named in `where`.
   *
   * @example
   * ```typescript
   * const user = await users.upsert({
   *   where: { email: "ada@example.com" },
   *   create: { email: "ada@example.com", name: "Ada" },
   *   update: { name: "Ada Lovelace" },
   * });
   * ```
   */
  async upsert<X extends ComputedMap = Record<never, never>>(
    options: UpsertOptions<T, I> & { computed?: X }
  ): Promise<SelectFields<T, K>[0] & ComputedResult<X>> {
    const create = omitUndefined(options.create);

    if (!isValidData(options.where)) {
      throw new QueryError(Errors.INSERT.INVALID_CONFLICT_TARGET, { code: "CONFLICT" });
    }
    if (!isValidData(create)) {
      throw new QueryError(Errors.INSERT.INVALID_DATA, { code: "INVALID_DATA" });
    }

    const update = omitUndefined(options.update ?? {});
    if (options.update !== undefined && !isValidData(update)) {
      throw new QueryError(Errors.UPDATE.INVALID_DATA, { code: "INVALID_DATA" });
    }

    this.assertAllowedColumns(Object.keys(create), "insert");
    if (Object.keys(update).length > 0) {
      this.assertAllowedColumns(Object.keys(update), "update");
    }

    const target = Object.keys(options.where);
    const targetFragment = this.sql`(${this.sql(
      target.map((column) => this.resolveColumn(column))
    )})`;

    for (const column of target) {
      if (!(column in create)) {
        throw new QueryError(Errors.INSERT.INVALID_CONFLICT_TARGET, { code: "CONFLICT" });
      }
    }

    // An empty update means "find or create": a no-op assignment returns the
    // existing row instead of erroring on ON CONFLICT DO NOTHING.
    const updateEntries: ReadonlyArray<readonly [string, unknown]> =
      Object.keys(update).length > 0
        ? Object.entries(update)
        : [[target[0] as string, create[target[0] as keyof I]]];

    const assignments = updateEntries.reduce((acc, [column, value], index) => {
      const assignment = this
        .sql`${this.sql(this.resolveColumn(column) as never)} = ${this.encodeValue(column, value)}`;
      return index === 0 ? assignment : this.sql`${acc}, ${assignment}`;
    }, this.sql``);

    const targetWhere = options.targetWhere ? this.sql` WHERE ${options.targetWhere}` : this.sql``;
    const setWhere = options.setWhere ? this.sql` WHERE ${options.setWhere}` : this.sql``;

    const result = await this.sql<SelectFields<T, K>>`
            INSERT INTO ${this.sql(this.tableName)}
            ${this.sql(this.mapRecord(create) as Row)}
            ON CONFLICT ${targetFragment}${targetWhere} DO UPDATE SET ${assignments}${setWhere}
            RETURNING ${this.buildSelection(options.computed)}
        `;

    const row = result[0];
    if (!row) {
      throw new QueryError(Errors.QUERY.INSERT_RETURNED_EMPTY, { code: "INSERT_RETURNED_EMPTY" });
    }
    return this.decodeRow(row) as SelectFields<T, K>[0] & ComputedResult<X>;
  }

  /**
   * Create multiple records in a single transaction
   *
   * @param records - Array of records to insert
   * @returns Promise resolving to the array of created records with auto-generated values
   * @throws {QueryError} If records array is empty or contains invalid data
   *
   * @example
   * ```typescript
   * // Create multiple users in one query
   * const newUsers = await users.createMany([
   *   {
   *     name: "John Doe",
   *     email: "john@example.com",
   *     status: "active",
   *     created_at: new Date()
   *   },
   *   {
   *     name: "Jane Smith",
   *     email: "jane@example.com",
   *     status: "active",
   *     created_at: new Date()
   *   }
   * ]);
   *
   * console.log(`Created ${newUsers.length} users`);
   *
   * // With specific return fields
   * const createdUsers = await users
   *   .select(["id", "email"])
   *   .createMany([...userData]);
   * ```
   */
  async createMany<X extends ComputedMap = Record<never, never>>(
    records: I[],
    options?: CreateManyOptions & { computed?: X }
  ): Promise<Array<SelectFields<T, K>[0] & ComputedResult<X>>> {
    if (!Array.isArray(records) || records.length === 0) {
      throw new QueryError(Errors.INSERT.INVALID_DATA, { code: "INVALID_DATA" });
    }

    const cleanedRecords = records.map((record) => omitUndefined(record));

    // Validate and normalize columns from the first record
    // records.length === 0 was checked above, so records[0] is always defined here
    const firstRecord = cleanedRecords.at(0);
    if (!firstRecord) {
      throw new QueryError(Errors.INSERT.INVALID_DATA, { code: "INVALID_DATA" });
    }
    if (!isValidData(firstRecord)) {
      throw new QueryError(Errors.INSERT.INVALID_DATA, { code: "INVALID_DATA" });
    }

    const columns = Object.keys(firstRecord);
    const columnSet = new Set(columns);

    for (const record of cleanedRecords) {
      if (!isValidData(record)) {
        throw new QueryError(Errors.INSERT.INVALID_DATA, { code: "INVALID_DATA" });
      }

      const recordKeys = Object.keys(record);
      if (recordKeys.length !== columns.length) {
        throw new QueryError(Errors.INSERT.INCONSISTENT_COLUMNS, { code: "INCONSISTENT_COLUMNS" });
      }

      for (const key of recordKeys) {
        if (!columnSet.has(key)) {
          throw new QueryError(Errors.INSERT.INCONSISTENT_COLUMNS, {
            code: "INCONSISTENT_COLUMNS",
          });
        }
      }
    }

    if (options?.skipDuplicates && options.onConflict) {
      throw new QueryError(Errors.INSERT.CONFLICT_OPTIONS, { code: "CONFLICT" });
    }

    if (options?.onConflict) {
      const { target, update = [], set = {} } = options.onConflict;
      const setColumns = Object.keys(set);
      const overlaps = update.some((column) => setColumns.includes(column));

      if (
        !Array.isArray(target) ||
        target.length === 0 ||
        !Array.isArray(update) ||
        (update.length === 0 && setColumns.length === 0) ||
        overlaps ||
        [...target, ...update].some((column) => !columns.includes(column)) ||
        setColumns.some((column) => !column)
      ) {
        throw new QueryError(Errors.INSERT.INVALID_CONFLICT, { code: "CONFLICT" });
      }
    }

    this.assertAllowedColumns(columns, "insert");

    const chunks = chunkRecords(cleanedRecords, columns.length);

    if (chunks.length <= 1) {
      return this.insertMany(cleanedRecords, columns, options) as Promise<
        Array<SelectFields<T, K>[0] & ComputedResult<X>>
      >;
    }

    return this.inTransaction(async (table) => {
      const inserted: Array<SelectFields<T, K>[0]> = [];

      for (const chunk of chunks) {
        inserted.push(...(await table.insertMany(chunk, columns, options)));
      }

      return inserted;
    }) as Promise<Array<SelectFields<T, K>[0] & ComputedResult<X>>>;
  }

  private async insertMany(
    records: I[],
    columns: string[],
    options?: CreateManyOptions & { computed?: ComputedMap }
  ): Promise<Array<SelectFields<T, K>[0]>> {
    let conflict = this.sql``;

    if (options?.skipDuplicates) {
      conflict = this.sql`ON CONFLICT DO NOTHING `;
    } else if (options?.onConflict) {
      const { target, update = [], set = {} } = options.onConflict;
      const assignments: SqlFragment[] = [];

      for (const column of update) {
        const mapped = this.resolveColumn(column);
        assignments.push(
          this.sql`${this.sql(mapped as never)} = EXCLUDED.${this.sql(mapped as never)}`
        );
      }
      for (const [column, expression] of Object.entries(set)) {
        assignments.push(
          this.sql`${this.sql(this.resolveColumn(column) as never)} = ${expression}`
        );
      }

      const assignmentList = assignments.reduce(
        (acc, assignment, index) => (index === 0 ? assignment : this.sql`${acc}, ${assignment}`),
        this.sql``
      );

      conflict = this.sql`ON CONFLICT (${this.sql(
        target.map((column) => this.resolveColumn(column))
      )}) DO UPDATE SET ${assignmentList} `;
    }

    const mappedColumns = columns.map((column) => this.resolveColumn(column));
    const mappedRecords = records.map((record) => this.mapRecord(record));

    const result = await this.sql<SelectFields<T, K>>`
            INSERT INTO ${this.sql(this.tableName)}
            ${this.sql(mappedRecords as Row[], mappedColumns)}
            ${conflict}RETURNING ${this.buildSelection(options?.computed)}
        `;
    return this.decodeRows(result as Array<Record<string, unknown>>) as SelectFields<T, K>;
  }

  private async inTransaction<R>(fn: (table: Table<T, K, I>) => Promise<R>): Promise<R> {
    const runner = this.sql as unknown as {
      begin?: (cb: (txSql: Sql<Record<string, unknown>>) => Promise<R>) => Promise<R>;
      savepoint?: (cb: (txSql: Sql<Record<string, unknown>>) => Promise<R>) => Promise<R>;
    };
    const start = runner.begin ?? runner.savepoint;

    if (typeof start !== "function") {
      return fn(this);
    }

    return start.call(this.sql, (txSql) =>
      fn(
        new Table<T, K, I>(txSql as unknown as Sql<Record<string, unknown>>, this.tableName, {
          whereInputs: this.whereInputs,
          selectedFields: this.selectedFields,
          skipValue: this.skipValue,
          takeValue: this.takeValue,
          orderByValue: this.orderByValue,
          distinctValue: this.distinctValue,
          distinctOnValue: this.distinctOnValue,
          distinctOnExprValue: this.distinctOnExprValue,
          cursorValue: this.cursorValue,
          strictNames: this.strictNames,
          allowSchema: this.allowSchema,
          allowedColumns: this.allowedColumns,
          columnMap: this.columnMap,
          columnCodecs: this.columnCodecs,
          maxTake: this.maxTake,
          uniqueKeys: this.uniqueKeys,
          uniqueWhere: this.uniqueWhere,
          defaultTake: this.defaultTake,
        })
      )
    );
  }

  /**
   * Update records matching the current where conditions
   *
   * @param data - The data to update in matching records
   * @returns Promise resolving to the array of updated records
   * @throws {QueryError} If no where conditions are specified or data is invalid
   *
   * @example
   * ```typescript
   * // Update a user by ID
   * const updatedUser = await users
   *   .where({ id: 123 })
   *   .update({ status: "inactive" });
   *
   * // Update multiple users
   * const updatedUsers = await users
   *   .where({ status: "active" })
   *   .update({
   *     status: "inactive",
   *     updated_at: new Date()
   *   });
   *
   * console.log(`Updated ${updatedUsers.length} users`);
   *
   * // With return field selection
   * const updatedUserIds = await users
   *   .where([{ field: "last_login", operator: "<", value: cutoffDate }])
   *   .select(["id"])
   *   .update({ status: "inactive" });
   * ```
   */
  async update<X extends ComputedMap = Record<never, never>>(
    data: UpdateData<T>,
    options?: { returning?: true; computed?: X }
  ): Promise<Array<SelectFields<T, K>[0] & ComputedResult<X>>>;
  async update(data: UpdateData<T>, options: { returning: false }): Promise<number>;
  async update<X extends ComputedMap = Record<never, never>>(
    data: UpdateData<T>,
    options?: { returning?: boolean; computed?: X }
  ): Promise<Array<SelectFields<T, K>[0] & ComputedResult<X>> | number> {
    if (!this.hasWhereConditions()) {
      throw new QueryError(Errors.UPDATE.NO_CONDITIONS, { code: "NO_CONDITIONS" });
    }

    const cleaned = omitUndefined(data);

    if (!isValidData(cleaned)) {
      throw new QueryError(Errors.UPDATE.INVALID_DATA, { code: "INVALID_DATA" });
    }

    this.assertAllowedColumns(Object.keys(cleaned), "update");

    const assignments = Object.entries(cleaned).reduce((acc, [column, value], index) => {
      const assignment = this
        .sql`${this.sql(this.resolveColumn(column) as never)} = ${this.encodeValue(column, value)}`;
      return index === 0 ? assignment : this.sql`${acc}, ${assignment}`;
    }, this.sql``);

    const where = buildWhereInputs(this.sql, this.whereInputs, this.nameOptions());

    if (options?.returning === false) {
      const result = await this.sql`
                UPDATE ${this.sql(this.tableName)}
                SET ${assignments}
                ${where}
            `;
      return (result as unknown as { count?: number }).count ?? 0;
    }

    const rows = await this.sql<Array<SelectFields<T, K>[0]>>`
                UPDATE ${this.sql(this.tableName)}
                SET ${assignments}
                ${where}
                RETURNING ${this.buildSelection(options?.computed)}
            `;
    return this.decodeRows(rows as Array<Record<string, unknown>>) as Array<
      SelectFields<T, K>[0] & ComputedResult<X>
    >;
  }

  /**
   * Delete records matching the current where conditions
   *
   * @returns Promise resolving to the array of deleted records
   * @throws {QueryError} If no where conditions are specified
   *
   * @example
   * ```typescript
   * // Delete a user by ID
   * const deletedUser = await users
   *   .where({ id: 123 })
   *   .delete();
   *
   * // Delete inactive users
   * const deletedUsers = await users
   *   .where({ status: "inactive" })
   *   .delete();
   *
   * console.log(`Deleted ${deletedUsers.length} inactive users`);
   *
   * // With specific return fields
   * const deletedUserIds = await users
   *   .where([{ field: "last_login", operator: "<", value: cutoffDate }])
   *   .select(["id"])
   *   .delete();
   * ```
   */
  async delete<X extends ComputedMap = Record<never, never>>(options?: {
    returning?: true;
    computed?: X;
  }): Promise<Array<SelectFields<T, K>[0] & ComputedResult<X>>>;
  async delete(options: { returning: false }): Promise<number>;
  async delete<X extends ComputedMap = Record<never, never>>(options?: {
    returning?: boolean;
    computed?: X;
  }): Promise<Array<SelectFields<T, K>[0] & ComputedResult<X>> | number> {
    if (!this.hasWhereConditions()) {
      throw new QueryError(Errors.DELETE.NO_CONDITIONS, { code: "NO_CONDITIONS" });
    }

    const where = buildWhereInputs(this.sql, this.whereInputs, this.nameOptions());

    if (options?.returning === false) {
      const result = await this.sql`
                DELETE FROM ${this.sql(this.tableName)}
                ${where}
            `;
      return (result as unknown as { count?: number }).count ?? 0;
    }

    const rows = await this.sql<Array<SelectFields<T, K>[0]>>`
                DELETE FROM ${this.sql(this.tableName)}
                ${where}
                RETURNING ${this.buildSelection(options?.computed)}
            `;
    return this.decodeRows(rows as Array<Record<string, unknown>>) as Array<
      SelectFields<T, K>[0] & ComputedResult<X>
    >;
  }

  private distinctFragment(): SqlFragment {
    if (!this.distinctValue) return this.sql``;
    if (this.distinctOnExprValue?.length) {
      const expressions = this.distinctOnExprValue.reduce(
        (acc, expression, index) => (index === 0 ? expression : this.sql`${acc}, ${expression}`),
        this.sql``
      );
      return this.sql`DISTINCT ON (${expressions}) `;
    }

    if (this.distinctOnValue?.length) {
      return this.sql`DISTINCT ON (${this.sql(
        this.distinctOnValue.map((column) => this.resolveColumn(column)) as string[]
      )}) `;
    }
    return this.sql`DISTINCT `;
  }

  private selectWhereInputs(): WhereInput<T>[] {
    if (!this.cursorValue) return this.whereInputs;

    const entries = Object.entries(this.cursorValue) as Array<[keyof T & string, unknown]>;
    if (entries.length === 0) {
      throw new QueryError(Errors.SELECT.INVALID_CURSOR, { code: "INVALID_CURSOR" });
    }

    for (const [, value] of entries) {
      if (value === undefined || value === null) {
        throw new QueryError(Errors.SELECT.INVALID_CURSOR, { code: "INVALID_CURSOR" });
      }
    }

    const order = this.orderByValue ?? [];

    // Single-column cursor keeps the simple path, defaulting to ASC.
    if (entries.length === 1) {
      const [column, value] = entries[0] as [keyof T & string, unknown];
      const spec = order[0];

      if (spec && spec.column !== column) {
        throw new QueryError(Errors.SELECT.INVALID_CURSOR, { code: "INVALID_CURSOR" });
      }

      const direction = spec?.direction ?? "ASC";
      if (direction !== "ASC" && direction !== "DESC") {
        throw new QueryError(Errors.WHERE.INVALID_SORT, { code: "INVALID_SORT" });
      }

      const predicate =
        direction === "ASC"
          ? gt<T, keyof T & string>(column, value as T[keyof T & string])
          : lt<T, keyof T & string>(column, value as T[keyof T & string]);

      return [...this.whereInputs, predicate];
    }

    // Composite cursor: orderBy must start with the cursor columns, in order.
    if (order.length < entries.length) {
      throw new QueryError(Errors.SELECT.INVALID_CURSOR, { code: "INVALID_CURSOR" });
    }

    for (let index = 0; index < entries.length; index += 1) {
      const [column] = entries[index] as [keyof T & string, unknown];
      const spec = order[index];
      if (!spec || spec.column !== column) {
        throw new QueryError(Errors.SELECT.INVALID_CURSOR, { code: "INVALID_CURSOR" });
      }
      if (spec.direction !== "ASC" && spec.direction !== "DESC") {
        throw new QueryError(Errors.WHERE.INVALID_SORT, { code: "INVALID_SORT" });
      }
    }

    let comparison = this.sql``;

    for (let index = 0; index < entries.length; index += 1) {
      const [column, value] = entries[index] as [keyof T & string, unknown];
      const spec = order[index];
      const operator = spec?.direction === "DESC" ? "<" : ">";

      const prefix = entries
        .slice(0, index)
        .reduce(
          (acc, [prefixColumn, prefixValue], prefixIndex) =>
            prefixIndex === 0
              ? this.sql`${this.sql(this.resolveColumn(prefixColumn) as never)} = ${prefixValue}`
              : this
                  .sql`${acc} AND ${this.sql(this.resolveColumn(prefixColumn) as never)} = ${prefixValue}`,
          this.sql``
        );

      const term = this
        .sql`${this.sql(this.resolveColumn(column) as never)} ${this.sql.unsafe(operator)} ${value}`;
      const termWithPrefix = index === 0 ? term : this.sql`${prefix} AND ${term}`;
      comparison = index === 0 ? termWithPrefix : this.sql`${comparison} OR ${termWithPrefix}`;
    }

    return [...this.whereInputs, rawPredicate<T>(this.sql`(${comparison})`)];
  }

  /**
   * Execute the SELECT query with current parameters
   *
   * @returns Promise resolving to the query results
   * @private
   */
  private buildSelection(computed?: Record<string, SqlExpression<unknown>>): SqlFragment {
    const selected = this.selectedFields as readonly string[];
    const wildcard = selected.length === 0 || selected[0] === "*";

    if (wildcard && this.columnMap && Object.keys(this.columnMap).length > 0) {
      throw new QueryError(Errors.SELECT.INVALID_COLUMNS("*"), { code: "INVALID_COLUMNS" });
    }

    const base = wildcard
      ? this.sql`*`
      : selected.reduce((acc, field, index) => {
          buildSelect(this.sql, [field] as never, {
            strictNames: this.strictNames,
            allowSchema: this.allowSchema,
          });
          const column = this.resolveColumn(field);
          const part =
            column === field
              ? this.sql`${this.sql(field)}`
              : this.sql`${this.sql(column)} AS ${this.sql(field)}`;
          return index === 0 ? part : this.sql`${acc}, ${part}`;
        }, this.sql``);

    const entries = Object.entries(computed ?? {});
    if (entries.length === 0) return base;
    const seen = new Set<string>();

    const expressions = entries.reduce((acc, [alias, expression], index) => {
      if (!alias || seen.has(alias) || selected.includes(alias)) {
        throw new QueryError(Errors.SELECT.INVALID_COLUMNS(alias), {
          code: "INVALID_COLUMNS",
        });
      }
      seen.add(alias);

      const part = this.sql`${expression.fragment} AS ${this.sql(alias)}`;
      return index === 0 ? part : this.sql`${acc}, ${part}`;
    }, this.sql``);

    return this.sql`${base}, ${expressions}`;
  }

  /**
   * Join a table with `INNER JOIN`. The joined row is nested under `name`;
   * use `leftJoin` for nullable rows. Right-side columns must be listed
   * explicitly (or supplied by the ZodTable overload).
   */
  innerJoin<Name extends string, J extends Row = Row>(
    name: Name,
    options: JoinOptions<J>
  ): JoinQuery<T, K, I, { [P in Name]: J }> {
    const spec = createJoinSpec(this, name, options, "inner", []);
    return new JoinQuery<T, K, I, { [P in Name]: J }>(this, [spec]);
  }

  /** Join a table with `LEFT JOIN`; unmatched right rows are `null`. */
  leftJoin<Name extends string, J extends Row = Row>(
    name: Name,
    options: JoinOptions<J>
  ): JoinQuery<T, K, I, { [P in Name]: J | null }> {
    const spec = createJoinSpec(this, name, options, "left", []);
    return new JoinQuery<T, K, I, { [P in Name]: J | null }>(this, [spec]);
  }

  /**
   * Execute narrow joins. Used by `JoinQuery`.
   */
  async executeJoins<Joined extends Record<string, unknown>>(
    joins: readonly JoinSpec[]
  ): Promise<Array<SelectFields<T, K>[0] & Joined>> {
    if (joins.length === 0) {
      throw new QueryError(Errors.SELECT.INVALID_JOIN, { code: "INVALID_JOIN" });
    }

    const options = this.nameOptions();
    const selected = this.selectedFields as readonly string[];
    if (
      (selected.length === 0 || selected[0] === "*") &&
      this.columnMap &&
      Object.keys(this.columnMap).length > 0
    ) {
      throw new QueryError(Errors.SELECT.INVALID_COLUMNS("*"), { code: "INVALID_COLUMNS" });
    }
    const leftSelection =
      selected.length === 0 || selected[0] === "*"
        ? this.sql`${this.sql(this.tableName)}.*`
        : selected.reduce((acc, field, index) => {
            buildSelect(this.sql, [field] as never, {
              strictNames: this.strictNames,
              allowSchema: this.allowSchema,
            });
            const column = this.resolveColumn(field);
            const qualified = this.sql`${this.sql(this.tableName)}.${this.sql(column as never)}`;
            const part =
              column === field ? qualified : this.sql`${qualified} AS ${this.sql(field)}`;
            return index === 0 ? part : this.sql`${acc}, ${part}`;
          }, this.sql``);

    const rightSelections = joins.reduce((acc, join, joinIndex) => {
      const parts = join.columns.map((column, columnIndex) => {
        buildSelect(this.sql, [column] as never, options);
        const alias = `__pgbuddy_join_${joinIndex}_${columnIndex}`;
        return this.sql`${this.sql(join.alias)}.${this.sql(column as never)} AS ${this.sql(alias)}`;
      });
      const joined = parts.reduce(
        (partsAcc, part, index) => (index === 0 ? part : this.sql`${partsAcc}, ${part}`),
        this.sql``
      );
      return joinIndex === 0 ? joined : this.sql`${acc}, ${joined}`;
    }, this.sql``);

    const joinClauses = joins.reduce((acc, join, index) => {
      const keyword = this.sql.unsafe(join.mode === "left" ? "LEFT JOIN" : "INNER JOIN");
      const clause = this
        .sql`${keyword} ${this.sql(join.table)} AS ${this.sql(join.alias)} ON ${join.on}`;
      return index === 0 ? clause : this.sql`${acc} ${clause}`;
    }, this.sql``);

    const rows = await this.sql<Array<Record<string, unknown>>>`
            SELECT ${this.distinctFragment()}${leftSelection}, ${rightSelections}
            FROM ${this.sql(this.tableName)}
            ${joinClauses}
            ${buildWhereInputs(this.sql, this.whereInputs, options)}
            ${this.orderFragment()}
            ${createLimitFragment(this.sql, this.takeValue ?? this.defaultTake, this.skipValue)}
        `;

    return rows.map((row) => {
      const result = { ...row };

      joins.forEach((join, joinIndex) => {
        const right: Record<string, unknown> = {};
        let hasRight = false;

        join.columns.forEach((column, columnIndex) => {
          const alias = `__pgbuddy_join_${joinIndex}_${columnIndex}`;
          const value = result[alias];
          if (value !== null && value !== undefined) hasRight = true;
          right[column] = value ?? null;
          delete result[alias];
        });

        result[join.name] = join.mode === "left" && !hasRight ? null : right;
      });

      return this.decodeRow(result) as SelectFields<T, K>[0] & Joined;
    });
  }

  private buildSelectQuery(computed?: Record<string, SqlExpression<unknown>>): SqlFragment {
    return this.sql`
            SELECT ${this.distinctFragment()}${this.buildSelection(computed)}
            FROM ${this.sql(this.tableName)}
            ${buildWhereInputs(this.sql, this.selectWhereInputs(), this.nameOptions())}
            ${this.orderFragment()}
            ${createLimitFragment(this.sql, this.takeValue ?? this.defaultTake, this.skipValue)}
            ${this.lockFragment()}
        `;
  }

  private async executeSelect(
    computed?: Record<string, SqlExpression<unknown>>
  ): Promise<Array<SelectFields<T, K>[0]>> {
    const rows = await this.buildSelectQuery(computed);
    return this.decodeRows(rows as Array<Record<string, unknown>>) as Array<SelectFields<T, K>[0]>;
  }

  /**
   * Inspect the current SELECT query without executing it. Identifiers are
   * already quoted; values are returned separately in `parameters`.
   */
  toSQL(computed?: ComputedMap): { text: string; parameters: readonly unknown[] } {
    return describeQuery(this.buildSelectQuery(computed));
  }
}
