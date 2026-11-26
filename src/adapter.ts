import type { Row } from "postgres";
import { type ZodObject, type ZodRawShape, z } from "zod";
import type { DeferredQuery } from "./deferred";
import { Errors, QueryError } from "./errors";
import type { WhereInput } from "./predicates";
import type {
  GroupedExprQuery,
  GroupedQuery,
  JoinOptions,
  JoinQuery,
  ProjectedQuery,
  Table,
} from "./table";
import type {
  AggregateOptions,
  AggregateResult,
  ColumnCodecs,
  ColumnMap,
  ComputedMap,
  ComputedOptions,
  CreateManyOptions,
  SelectKeys,
  SortSpec,
  SqlExpression,
  SqlFragment,
  UpdateData,
  UpsertOptions,
} from "./types";
import { type ZodRelations, ZodTable } from "./zod-table";

export type ValidationResult<T> = { success: true; data: T } | { success: false; error: string };

/**
 * A minimal validation contract for table inputs. Implement this to use a
 * validation library other than Zod. Relations and schema-derived projections
 * remain Zod-only for now.
 */
export interface ValidationAdapter<T extends Row, I extends Row = T> {
  readonly __pgbuddyAdapter: true;
  /** Columns exposed by the table, in projection order. */
  readonly fields: readonly (keyof T & string)[];
  /** Validate and normalize a full insert payload. */
  parse(value: unknown): ValidationResult<I>;
  /** Validate and normalize a partial update payload. */
  parsePartial(value: unknown): ValidationResult<Partial<I>>;
}

/**
 * Library-level adapter, modeled after Prapti's validation adapters: the
 * schema and the bridge are separate, so one adapter can serve many schemas.
 */
export interface ValidatorAdapter {
  fields<S>(schema: S): readonly string[];
  parse<S>(schema: S, value: unknown): unknown;
  parsePartial<S>(schema: S, value: unknown): unknown;
}

type InferOutput<T> = T extends { _output: infer U }
  ? U
  : T extends { __outputType: infer U }
    ? U
    : T extends { readonly "~standard": { readonly types?: { readonly output?: infer U } } }
      ? U
      : unknown;

type InferInput<T> = T extends { _input: infer U }
  ? U
  : T extends { __inputType: infer U }
    ? U
    : T extends { readonly "~standard": { readonly types?: { readonly input?: infer U } } }
      ? U
      : InferOutput<T>;

export type ValidatedRow<S> = InferOutput<S> & Row;
export type ValidatedInput<S> = InferInput<S> & Row;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Bind a schema + validator adapter to the per-table validation contract.
 */
export function bindValidator<S>(
  schema: S,
  validator: ValidatorAdapter
): ValidationAdapter<ValidatedRow<S>, ValidatedInput<S>> {
  const fields = validator.fields(schema);
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error("ValidatorAdapter.fields must return a non-empty array");
  }

  return {
    __pgbuddyAdapter: true,
    fields: fields as readonly (keyof ValidatedRow<S> & string)[],
    parse(value) {
      try {
        return {
          success: true,
          data: validator.parse(schema, value) as ValidatedInput<S>,
        };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
    parsePartial(value) {
      try {
        return {
          success: true,
          data: validator.parsePartial(schema, value) as Partial<ValidatedInput<S>>,
        };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
  };
}

/** Built-in adapter for Zod object schemas. */
export const zodValidator: ValidatorAdapter = {
  fields: <S>(schema: S): readonly string[] =>
    Object.keys((schema as unknown as ZodObject<ZodRawShape>).shape),
  parse: <S>(schema: S, value: unknown): unknown =>
    (schema as unknown as ZodObject<ZodRawShape>).parse(value),
  parsePartial: <S>(schema: S, value: unknown): unknown =>
    (schema as unknown as ZodObject<ZodRawShape>).partial().parse(value),
};

export function isValidationAdapter(value: unknown): value is ValidationAdapter<Row, Row> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __pgbuddyAdapter?: unknown }).__pgbuddyAdapter === true &&
    Array.isArray((value as { fields?: unknown }).fields) &&
    typeof (value as { parse?: unknown }).parse === "function" &&
    typeof (value as { parsePartial?: unknown }).parsePartial === "function"
  );
}

function parseOrThrow<T>(result: ValidationResult<T>, context: string): T {
  if (!result.success) {
    throw new QueryError(`Invalid ${context}: ${result.error}`, { code: "INVALID_DATA" });
  }
  return result.data;
}

export type AdapterRelationConfig<F extends readonly string[] = readonly string[]> = {
  table: string;
  fields: F;
  localKey: string | readonly string[];
  foreignKey?: string | readonly string[];
  relation: "one" | "many";
  through?: {
    table: string;
    parentKey: string | readonly string[];
    relatedKey: string | readonly string[];
    targetKey?: string | readonly string[];
  };
  relations?: AdapterRelations;
  columnMap?: ColumnMap;
  columnCodecs?: ColumnCodecs;
};

export type AdapterRelations = Record<string, AdapterRelationConfig>;

export type AdapterRelationRow<C extends AdapterRelationConfig> =
  C extends AdapterRelationConfig<infer F>
    ? { [K in F[number]]: unknown }
    : Record<string, unknown>;

export type AdapterRelationValue<C extends AdapterRelationConfig> = C["relation"] extends "one"
  ? AdapterRelationRow<C> | null
  : Array<AdapterRelationRow<C>>;

export type AdapterRelationFields<R extends AdapterRelations, Inc extends keyof R> = {
  [N in Inc]: AdapterRelationValue<R[N]>;
};

export type AdapterCountFields<Name extends PropertyKey> = {
  [P in `${Name & string}_count`]: number;
};

function toZodRelations(relations: AdapterRelations): ZodRelations {
  const out: Record<string, unknown> = {};

  for (const [name, config] of Object.entries(relations)) {
    const schema = z.object(Object.fromEntries(config.fields.map((field) => [field, z.unknown()])));
    out[name] = {
      table: config.table,
      schema,
      localKey: config.localKey,
      foreignKey: config.foreignKey,
      relation: config.relation,
      through: config.through,
      columnMap: config.columnMap,
      columnCodecs: config.columnCodecs,
      relations: config.relations ? toZodRelations(config.relations) : undefined,
    };
  }

  return out as ZodRelations;
}

/**
 * A relation-bearing adapter query. Relation row shapes are untyped because
 * the adapter exposes field names, not schemas.
 */
export class AdapterIncludedQuery<
  T extends Row,
  R extends AdapterRelations,
  Joined extends Record<string, unknown>,
> {
  private readonly zodTable: ZodTable<ZodObject<ZodRawShape>>;

  constructor(zodTable: ZodTable<ZodObject<ZodRawShape>>) {
    this.zodTable = zodTable;
  }

  include<Name extends keyof R & string>(
    name: Name
  ): AdapterIncludedQuery<T, R, Joined & AdapterRelationFields<R, Name>> {
    return new AdapterIncludedQuery<T, R, Joined & AdapterRelationFields<R, Name>>(
      this.zodTable.include(name) as unknown as ZodTable<ZodObject<ZodRawShape>>
    );
  }

  withCount<Name extends keyof R & string>(
    name: Name
  ): AdapterIncludedQuery<T, R, Joined & AdapterCountFields<Name>> {
    return new AdapterIncludedQuery<T, R, Joined & AdapterCountFields<Name>>(
      this.zodTable.withCount(name) as unknown as ZodTable<ZodObject<ZodRawShape>>
    );
  }

  whereRelated<Name extends keyof R & string>(name: Name): AdapterIncludedQuery<T, R, Joined> {
    return new AdapterIncludedQuery<T, R, Joined>(
      this.zodTable.whereRelated(name) as unknown as ZodTable<ZodObject<ZodRawShape>>
    );
  }

  whereMissing<Name extends keyof R & string>(name: Name): AdapterIncludedQuery<T, R, Joined> {
    return new AdapterIncludedQuery<T, R, Joined>(
      this.zodTable.whereMissing(name) as unknown as ZodTable<ZodObject<ZodRawShape>>
    );
  }

  findMany(): Promise<Array<T & Joined>> {
    return this.zodTable.findMany() as unknown as Promise<Array<T & Joined>>;
  }

  async findFirst(): Promise<(T & Joined) | null> {
    const rows = await this.zodTable.findFirst();
    return (rows as unknown as (T & Joined) | null) ?? null;
  }

  async findFirstOrThrow(): Promise<T & Joined> {
    const row = await this.findFirst();
    if (!row) throw new QueryError(Errors.QUERY.NO_ROWS, { code: "NO_ROWS" });
    return row;
  }
}

/**
 * A table built from a non-Zod validation adapter. Zod-backed tables retain
 * relations, schema-derived projections, and computed fields.
 */
export class ValidatedTable<
  T extends Row,
  K extends SelectKeys<T> = ["*"],
  I extends Row = T,
  R extends AdapterRelations = Record<string, never>,
> {
  private readonly table: Table<T, K, I>;
  private readonly adapter: ValidationAdapter<T, I>;
  private readonly adapterRelations?: R;
  private readonly relationTable?: ZodTable<ZodObject<ZodRawShape>>;

  constructor(table: Table<T, K, I>, adapter: ValidationAdapter<T, I>, adapterRelations?: R) {
    this.table = table;
    this.adapter = adapter;
    this.adapterRelations = adapterRelations;

    if (adapterRelations && Object.keys(adapterRelations).length > 0) {
      const schema = z.object(
        Object.fromEntries(adapter.fields.map((field) => [field, z.unknown()]))
      );
      this.relationTable = new ZodTable(
        table as unknown as Table<Record<string, unknown>, ["*"], Record<string, unknown>>,
        schema,
        toZodRelations(adapterRelations)
      ) as unknown as ZodTable<ZodObject<ZodRawShape>>;
    }
  }

  private wrap<K2 extends SelectKeys<T>>(table: Table<T, K2, I>): ValidatedTable<T, K2, I, R> {
    return new ValidatedTable<T, K2, I, R>(table, this.adapter, this.adapterRelations);
  }

  include<Name extends keyof R & string>(
    name: Name
  ): AdapterIncludedQuery<T, R, AdapterRelationFields<R, Name>> {
    if (!this.relationTable) {
      throw new QueryError("No adapter relations are configured for this table", {
        code: "INVALID_RELATION",
      });
    }
    return new AdapterIncludedQuery(
      this.relationTable.include(name) as unknown as ZodTable<ZodObject<ZodRawShape>>
    );
  }

  withCount<Name extends keyof R & string>(
    name: Name
  ): AdapterIncludedQuery<T, R, AdapterCountFields<Name>> {
    if (!this.relationTable) {
      throw new QueryError("No adapter relations are configured for this table", {
        code: "INVALID_RELATION",
      });
    }
    return new AdapterIncludedQuery(
      this.relationTable.withCount(name) as unknown as ZodTable<ZodObject<ZodRawShape>>
    );
  }

  select<K2 extends SelectKeys<T>>(fields: K2): ValidatedTable<T, K2, I, R> {
    return this.wrap(this.table.select(fields));
  }

  omit<K2 extends readonly (keyof T & string)[]>(
    columns: K2
  ): ValidatedTable<T, readonly Exclude<keyof T & string, K2[number]>[], I, R> {
    return new ValidatedTable(
      this.table.omit(columns) as unknown as Table<
        T,
        readonly Exclude<keyof T & string, K2[number]>[],
        I
      >,
      this.adapter,
      this.adapterRelations
    );
  }

  selectExpr<X extends ComputedMap>(expressions: X): ProjectedQuery<T, K, I, X> {
    return this.table.selectExpr(expressions);
  }

  groupBy<G extends readonly (keyof T & string)[], X extends ComputedMap = Record<never, never>>(
    columns: G,
    aggregates?: X
  ): GroupedQuery<T, K, I, G, X> {
    return this.table.groupBy(columns, aggregates);
  }

  groupByExpr<
    G extends Record<string, SqlExpression<unknown>>,
    X extends ComputedMap = Record<never, never>,
  >(expressions: G, aggregates?: X): GroupedExprQuery<T, K, I, G, X> {
    return this.table.groupByExpr(expressions, aggregates);
  }

  aggregate(options: AggregateOptions<T>): Promise<AggregateResult> {
    return this.table.aggregate(options);
  }

  innerJoin<Name extends string, J extends Row = Row>(
    name: Name,
    options: JoinOptions<J>
  ): JoinQuery<T, K, I, { [P in Name]: J }> {
    return this.table.innerJoin<Name, J>(name, options);
  }

  leftJoin<Name extends string, J extends Row = Row>(
    name: Name,
    options: JoinOptions<J>
  ): JoinQuery<T, K, I, { [P in Name]: J | null }> {
    return this.table.leftJoin<Name, J>(name, options);
  }

  where(conditions: WhereInput<T>): ValidatedTable<T, K, I, R> {
    return this.wrap(this.table.where(conditions));
  }

  whereExpr(expression: SqlExpression<boolean>): ValidatedTable<T, K, I, R> {
    return this.wrap(this.table.whereExpr(expression));
  }

  orderByExpr(
    expression: SqlExpression<unknown>,
    options?: { direction?: "ASC" | "DESC"; nulls?: "first" | "last" }
  ): ValidatedTable<T, K, I, R> {
    return this.wrap(this.table.orderByExpr(expression, options));
  }

  whereRaw(fragment: SqlFragment): ValidatedTable<T, K, I, R> {
    return this.wrap(this.table.whereRaw(fragment));
  }

  whereUnique(where: Partial<T>): ValidatedTable<T, K, I, R> {
    return this.wrap(this.table.whereUnique(where));
  }

  orderBy(spec: SortSpec<T>[]): ValidatedTable<T, K, I, R> {
    return this.wrap(this.table.orderBy(spec));
  }

  orderByRaw(fragment: SqlFragment): ValidatedTable<T, K, I, R> {
    return this.wrap(this.table.orderByRaw(fragment));
  }

  skip(count: number): ValidatedTable<T, K, I, R> {
    return this.wrap(this.table.skip(count));
  }

  take(count: number): ValidatedTable<T, K, I, R> {
    return this.wrap(this.table.take(count));
  }

  distinct(): ValidatedTable<T, K, I, R> {
    return this.wrap(this.table.distinct());
  }

  distinctOn(columns: readonly (keyof T & string)[]): ValidatedTable<T, K, I, R> {
    return this.wrap(this.table.distinctOn(columns));
  }

  distinctOnExpr(expressions: readonly SqlFragment[]): ValidatedTable<T, K, I, R> {
    return this.wrap(this.table.distinctOnExpr(expressions));
  }

  cursor(value: Partial<T>): ValidatedTable<T, K, I, R> {
    return this.wrap(this.table.cursor(value));
  }

  findMany(): DeferredQuery<Array<T>> {
    return this.table.findMany() as DeferredQuery<Array<T>>;
  }

  async findManyAndCount(
    options?: ComputedOptions<Record<string, SqlExpression<unknown>>>
  ): Promise<{
    rows: Array<T>;
    total: number;
  }> {
    const { rows, total } = await this.table.findManyAndCount(options);
    return { rows: rows as Array<T>, total };
  }

  async findManyInfinite(
    options?: ComputedOptions<Record<string, SqlExpression<unknown>>>
  ): Promise<{
    rows: Array<T>;
    nextCursor: Partial<T> | null;
    hasMore: boolean;
  }> {
    return this.table.findManyInfinite(options) as Promise<{
      rows: Array<T>;
      nextCursor: Partial<T> | null;
      hasMore: boolean;
    }>;
  }

  findFirst(): Promise<T | null> {
    return this.table.findFirst() as Promise<T | null>;
  }

  findUnique(): Promise<T | null> {
    return this.table.findUnique() as Promise<T | null>;
  }

  async findFirstOrThrow(): Promise<T> {
    return this.table.findFirstOrThrow() as Promise<T>;
  }

  async findUniqueOrThrow(): Promise<T> {
    return this.table.findUniqueOrThrow() as Promise<T>;
  }

  count(): DeferredQuery<number> {
    return this.table.count();
  }

  exists(): Promise<boolean> {
    return this.table.exists();
  }

  toSQL(): { text: string; parameters: readonly unknown[] } {
    return this.table.toSQL();
  }

  async explain(options?: {
    analyze?: boolean;
    verbose?: boolean;
    format?: "text" | "json";
  }): Promise<unknown[]> {
    return this.table.explain(options);
  }

  signal(signal: AbortSignal): ValidatedTable<T, K, I, R> {
    return new ValidatedTable(this.table.signal(signal), this.adapter, this.adapterRelations);
  }

  stream(batchSize = 1): AsyncIterable<Array<T>> {
    return this.table.stream(batchSize) as AsyncIterable<Array<T>>;
  }

  prepare(): () => Promise<Array<T>> {
    return this.table.prepare() as () => Promise<Array<T>>;
  }

  async updateFrom(
    data: Partial<I>,
    from: SqlFragment,
    options?: { returning?: boolean }
  ): Promise<T[] | number> {
    const parsed = parseOrThrow(this.adapter.parsePartial(data), "update data");
    return (
      options?.returning === false
        ? this.table.updateFrom(parsed as UpdateData<T>, from, { returning: false })
        : this.table.updateFrom(parsed as UpdateData<T>, from)
    ) as Promise<T[] | number>;
  }

  async deleteUsing(using: SqlFragment, options?: { returning?: boolean }): Promise<T[] | number> {
    return (
      options?.returning === false
        ? this.table.deleteUsing(using, { returning: false })
        : this.table.deleteUsing(using)
    ) as Promise<T[] | number>;
  }

  async insertFrom(
    select: SqlFragment,
    options?: {
      columns?: readonly (keyof T & string)[];
      returning?: boolean;
    }
  ): Promise<T[] | number> {
    return this.table.insertFrom(select, options) as Promise<T[] | number>;
  }

  async create(data: I): Promise<T> {
    const parsed = parseOrThrow(this.adapter.parse(data), "data");
    return this.table.create(parsed) as Promise<T>;
  }

  async createMany(records: I[], options?: CreateManyOptions): Promise<T[]> {
    if (!Array.isArray(records)) {
      throw new QueryError(Errors.INSERT.INVALID_DATA, { code: "INVALID_DATA" });
    }
    const parsed = records.map((record) => parseOrThrow(this.adapter.parse(record), "data"));
    return this.table.createMany(parsed, options) as Promise<T[]>;
  }

  async update(data: Partial<I>, options?: { returning?: boolean }): Promise<T[] | number> {
    const parsed = parseOrThrow(this.adapter.parsePartial(data), "update data");
    return (
      options?.returning === false
        ? this.table.update(parsed as UpdateData<T>, { returning: false })
        : this.table.update(parsed as UpdateData<T>)
    ) as Promise<T[] | number>;
  }

  async delete(options?: { returning?: boolean }): Promise<T[] | number> {
    return (
      options?.returning === false ? this.table.delete({ returning: false }) : this.table.delete()
    ) as Promise<T[] | number>;
  }

  async upsert(options: UpsertOptions<T, I>): Promise<T> {
    const create = parseOrThrow(this.adapter.parse(options.create), "data");
    const update = options.update
      ? parseOrThrow(this.adapter.parsePartial(options.update), "update data")
      : undefined;
    return this.table.upsert({
      ...options,
      create,
      update: update as Partial<T> | undefined,
    }) as Promise<T>;
  }
}
