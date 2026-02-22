import type { Row } from "postgres";
import type { input as ZodInput, ZodIssue, ZodObject, output as ZodOutput, ZodRawShape } from "zod";
import { Errors, QueryError } from "./errors";
import type { Table } from "./table";
import type { SelectFields, SelectKeys, SortSpec, WhereCondition } from "./types";

type ZodSchema = ZodObject<ZodRawShape>;
type RowFromSchema<S extends ZodSchema> = ZodOutput<S>;
type InsertFromSchema<S extends ZodSchema> = ZodInput<S>;
type ZodParseResult = { success: boolean; data?: unknown; error?: { issues: ZodIssue[] } };
type ZodLikeType = { safeParse: (value: unknown) => ZodParseResult };
type ZodShape = Record<string, ZodLikeType>;

function formatIssues(issues: ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function invalidDataError(context: string, issues: ZodIssue[]): QueryError {
  return new QueryError(`Invalid ${context}: ${formatIssues(issues)}`);
}

function getIssues(result: ZodParseResult): ZodIssue[] {
  return result.error?.issues ?? [];
}

function validateValue(field: string, schema: ZodLikeType, value: unknown, context: string): void {
  if (value === null) return;
  const result = schema.safeParse(value);
  if (!result.success) {
    throw invalidDataError(`${context} for ${field}`, getIssues(result));
  }
}

function getShape(schema: ZodSchema): ZodShape {
  return schema.shape as unknown as ZodShape;
}

function ensureFieldExists(shape: ZodShape, field: string): void {
  if (!Object.hasOwn(shape, field)) {
    throw new QueryError(Errors.WHERE.INVALID_FIELD(field));
  }
}

function validateWhereObject<S extends ZodSchema>(
  schema: S,
  conditions: Partial<RowFromSchema<S>>
): void {
  const shape = getShape(schema);
  for (const [key, value] of Object.entries(conditions)) {
    if (value === undefined) {
      throw new QueryError(Errors.WHERE.INVALID_FIELD(key));
    }
    ensureFieldExists(shape, key);
    const fieldSchema = shape[key];
    if (fieldSchema) {
      validateValue(key, fieldSchema, value, "where value");
    }
  }
}

function validateWhereAdvanced<S extends ZodSchema>(
  schema: S,
  conditions: WhereCondition<RowFromSchema<S>>[]
): void {
  const shape = getShape(schema);
  for (const condition of conditions) {
    const field = condition.field as string;
    ensureFieldExists(shape, field);

    if (condition.operator === "IS NULL" || condition.operator === "IS NOT NULL") {
      if ("value" in condition && condition.value !== undefined) {
        throw new QueryError(Errors.WHERE.INVALID_FIELD(field));
      }
      continue;
    }

    if (condition.operator === "IN") {
      if (!Array.isArray(condition.value) || condition.value.length === 0) {
        throw new QueryError(Errors.WHERE.INVALID_IN(field));
      }
      for (const entry of condition.value) {
        const fieldSchema = shape[field];
        if (fieldSchema) {
          validateValue(field, fieldSchema, entry, "where IN value");
        }
      }
      continue;
    }

    if (condition.operator === "LIKE" || condition.operator === "ILIKE") {
      if (typeof condition.value !== "string") {
        throw new QueryError(Errors.WHERE.INVALID_LIKE(field));
      }
      continue;
    }

    const fieldSchema = shape[field];
    if (fieldSchema) {
      validateValue(field, fieldSchema, condition.value, "where value");
    }
  }
}

export class ZodTable<
  S extends ZodSchema,
  K extends SelectKeys<RowFromSchema<S>> = ["*"],
  I extends Row = RowFromSchema<S>,
> {
  private table: Table<RowFromSchema<S>, K, I>;
  private schema: S;

  constructor(table: Table<RowFromSchema<S>, K, I>, schema: S) {
    this.table = table;
    this.schema = schema;
  }

  select<K2 extends SelectKeys<RowFromSchema<S>>>(fields: K2): ZodTable<S, K2, I> {
    return new ZodTable<S, K2, I>(this.table.select(fields), this.schema);
  }

  where(
    conditions: WhereCondition<RowFromSchema<S>>[] | Partial<RowFromSchema<S>>
  ): ZodTable<S, K, I> {
    if (Array.isArray(conditions)) {
      validateWhereAdvanced(this.schema, conditions);
    } else {
      validateWhereObject(this.schema, conditions);
    }
    return new ZodTable<S, K, I>(this.table.where(conditions), this.schema);
  }

  orderBy(spec: SortSpec<RowFromSchema<S>>[]): ZodTable<S, K, I> {
    return new ZodTable<S, K, I>(this.table.orderBy(spec), this.schema);
  }

  skip(count: number): ZodTable<S, K, I> {
    return new ZodTable<S, K, I>(this.table.skip(count), this.schema);
  }

  take(count: number): ZodTable<S, K, I> {
    return new ZodTable<S, K, I>(this.table.take(count), this.schema);
  }

  async findMany(): Promise<SelectFields<RowFromSchema<S>, K>> {
    return this.table.findMany() as Promise<SelectFields<RowFromSchema<S>, K>>;
  }

  async findFirst(): Promise<SelectFields<RowFromSchema<S>, K>[0] | null> {
    return this.table.findFirst() as Promise<SelectFields<RowFromSchema<S>, K>[0] | null>;
  }

  async findUnique(): Promise<SelectFields<RowFromSchema<S>, K>[0] | null> {
    return this.table.findUnique() as Promise<SelectFields<RowFromSchema<S>, K>[0] | null>;
  }

  async count(): Promise<number> {
    return this.table.count();
  }

  async create(data: InsertFromSchema<S>): Promise<SelectFields<RowFromSchema<S>, K>[0]> {
    const result = this.schema.safeParse(data);
    if (!result.success) {
      throw invalidDataError("data", getIssues(result));
    }
    return this.table.create(result.data as I) as Promise<SelectFields<RowFromSchema<S>, K>[0]>;
  }

  async createMany(records: InsertFromSchema<S>[]): Promise<SelectFields<RowFromSchema<S>, K>> {
    const parsed: RowFromSchema<S>[] = [];
    for (let i = 0; i < records.length; i += 1) {
      const result = this.schema.safeParse(records[i]);
      if (!result.success) {
        throw invalidDataError(`data at index ${i}`, getIssues(result));
      }
      parsed.push(result.data);
    }
    return this.table.createMany(parsed as I[]) as Promise<SelectFields<RowFromSchema<S>, K>>;
  }

  async update(data: Partial<InsertFromSchema<S>>): Promise<SelectFields<RowFromSchema<S>, K>> {
    const partialSchema = this.schema.partial();
    const result = partialSchema.safeParse(data);
    if (!result.success) {
      throw invalidDataError("update data", getIssues(result));
    }
    return this.table.update(result.data as Partial<RowFromSchema<S>>) as Promise<
      SelectFields<RowFromSchema<S>, K>
    >;
  }

  async delete(): Promise<SelectFields<RowFromSchema<S>, K>> {
    return this.table.delete() as Promise<SelectFields<RowFromSchema<S>, K>>;
  }
}
