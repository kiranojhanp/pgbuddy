import type { Row } from "postgres";
import type { ZodObject, ZodRawShape } from "zod";
import { Errors, QueryError } from "./errors";
import type { WhereInput } from "./predicates";
import type { GroupedQuery, JoinOptions, JoinQuery, ProjectedQuery, Table } from "./table";
import type {
  AggregateOptions,
  AggregateResult,
  ComputedMap,
  CreateManyOptions,
  SelectKeys,
  SortSpec,
  SqlFragment,
  UpdateData,
  UpsertOptions,
} from "./types";

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

/**
 * A table built from a non-Zod validation adapter. Zod-backed tables retain
 * relations, schema-derived projections, and computed fields.
 */
export class ValidatedTable<T extends Row, K extends SelectKeys<T> = ["*"], I extends Row = T> {
  private readonly table: Table<T, K, I>;
  private readonly adapter: ValidationAdapter<T, I>;

  constructor(table: Table<T, K, I>, adapter: ValidationAdapter<T, I>) {
    this.table = table;
    this.adapter = adapter;
  }

  private wrap<K2 extends SelectKeys<T>>(table: Table<T, K2, I>): ValidatedTable<T, K2, I> {
    return new ValidatedTable<T, K2, I>(table, this.adapter);
  }

  select<K2 extends SelectKeys<T>>(fields: K2): ValidatedTable<T, K2, I> {
    return this.wrap(this.table.select(fields));
  }

  omit<K2 extends readonly (keyof T & string)[]>(
    columns: K2
  ): ValidatedTable<T, readonly Exclude<keyof T & string, K2[number]>[], I> {
    return new ValidatedTable(
      this.table.omit(columns) as unknown as Table<
        T,
        readonly Exclude<keyof T & string, K2[number]>[],
        I
      >,
      this.adapter
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

  where(conditions: WhereInput<T>): ValidatedTable<T, K, I> {
    return this.wrap(this.table.where(conditions));
  }

  whereRaw(fragment: SqlFragment): ValidatedTable<T, K, I> {
    return this.wrap(this.table.whereRaw(fragment));
  }

  whereUnique(where: Partial<T>): ValidatedTable<T, K, I> {
    return this.wrap(this.table.whereUnique(where));
  }

  orderBy(spec: SortSpec<T>[]): ValidatedTable<T, K, I> {
    return this.wrap(this.table.orderBy(spec));
  }

  orderByRaw(fragment: SqlFragment): ValidatedTable<T, K, I> {
    return this.wrap(this.table.orderByRaw(fragment));
  }

  skip(count: number): ValidatedTable<T, K, I> {
    return this.wrap(this.table.skip(count));
  }

  take(count: number): ValidatedTable<T, K, I> {
    return this.wrap(this.table.take(count));
  }

  distinct(): ValidatedTable<T, K, I> {
    return this.wrap(this.table.distinct());
  }

  distinctOn(columns: readonly (keyof T & string)[]): ValidatedTable<T, K, I> {
    return this.wrap(this.table.distinctOn(columns));
  }

  distinctOnExpr(expressions: readonly SqlFragment[]): ValidatedTable<T, K, I> {
    return this.wrap(this.table.distinctOnExpr(expressions));
  }

  cursor(value: Partial<T>): ValidatedTable<T, K, I> {
    return this.wrap(this.table.cursor(value));
  }

  findMany(): Promise<Array<T>> {
    return this.table.findMany() as Promise<Array<T>>;
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

  count(): Promise<number> {
    return this.table.count();
  }

  exists(): Promise<boolean> {
    return this.table.exists();
  }

  toSQL(): { text: string; parameters: readonly unknown[] } {
    return this.table.toSQL();
  }

  prepare(): () => Promise<Array<T>> {
    return this.table.prepare() as () => Promise<Array<T>>;
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
