import type { Row } from "postgres";
import { Errors, QueryError } from "./errors";
import type { WhereInput } from "./predicates";
import type { Table } from "./table";
import type {
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
