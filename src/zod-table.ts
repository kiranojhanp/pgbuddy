import type { Row, Sql } from "postgres";
import type { input as ZodInput, ZodIssue, ZodObject, output as ZodOutput, ZodRawShape } from "zod";
import { Errors, QueryError, type QueryErrorCode, TableError } from "./errors";
import {
  getPredicateNode,
  isPredicate,
  type Predicate,
  rawPredicate,
  type WhereInput,
} from "./predicates";
import {
  type AggregateSpec,
  type CountSpec,
  type IncludeSpec,
  type NormalizedRelation,
  type NormalizedThrough,
  RelationLoader,
  type RelationRefinement,
} from "./relations";
import type { GroupedExprQuery, GroupedQuery, JoinQuery, Table } from "./table";
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
  PickFields,
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
  buildWhereExpression,
  buildWhereInputs,
  isPlainObject,
  isValidIdentifier,
  isValidName,
  validatePagination,
} from "./utils";

type ZodSchema = ZodObject<ZodRawShape>;
export type RowFromSchema<S extends ZodSchema> = ZodOutput<S>;
type InsertFromSchema<S extends ZodSchema> = ZodInput<S>;
type ZodParseResult = { success: boolean; data?: unknown; error?: { issues: ZodIssue[] } };
type ZodLikeType = { safeParse: (value: unknown) => ZodParseResult };
type ZodShape = Record<string, ZodLikeType>;

/** Reserved aliases used by the batched relation queries. */
function formatIssues(issues: ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function isSqlFragment(value: unknown): value is SqlFragment {
  return (
    typeof value === "function" ||
    (typeof value === "object" &&
      value !== null &&
      Array.isArray((value as { strings?: unknown }).strings) &&
      Array.isArray((value as { args?: unknown }).args))
  );
}

function invalidDataError(context: string, issues: ZodIssue[]): QueryError {
  return new QueryError(`Invalid ${context}: ${formatIssues(issues)}`, { code: "INVALID_DATA" });
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

function ensureFieldExists(
  shape: ZodShape,
  field: string,
  message: (field: string) => string = Errors.WHERE.INVALID_FIELD,
  code: QueryErrorCode = "INVALID_WHERE"
): void {
  if (!Object.hasOwn(shape, field)) {
    throw new QueryError(message(field), { code });
  }
}

function validateWhereObject<S extends ZodSchema>(
  schema: S,
  conditions: Partial<RowFromSchema<S>>
): void {
  const shape = getShape(schema);
  for (const [key, value] of Object.entries(conditions)) {
    if (value === undefined) {
      throw new QueryError(Errors.WHERE.INVALID_FIELD(key), { code: "INVALID_WHERE" });
    }
    ensureFieldExists(shape, key);
    const fieldSchema = shape[key];
    if (fieldSchema) {
      validateValue(key, fieldSchema, value, "where value");
    }
  }
}

function validatePredicate<S extends ZodSchema>(
  schema: S,
  predicate: Predicate<RowFromSchema<S>>
): void {
  const node = getPredicateNode(predicate);
  const shape = getShape(schema);

  switch (node.type) {
    case "raw":
      // Explicit escape hatch; the caller opted out of schema validation.
      return;

    case "and":
    case "or":
      for (const inner of node.predicates) {
        validatePredicate(schema, inner);
      }
      return;

    case "not":
      validatePredicate(schema, node.predicate);
      return;

    case "null":
      ensureFieldExists(shape, node.field);
      return;

    case "in": {
      ensureFieldExists(shape, node.field);
      if (!Array.isArray(node.values) || node.values.length === 0) {
        throw new QueryError(Errors.WHERE.INVALID_IN(node.field), { code: "INVALID_WHERE" });
      }
      const fieldSchema = shape[node.field];
      if (fieldSchema) {
        for (const value of node.values) {
          validateValue(node.field, fieldSchema, value, "where IN value");
        }
      }
      return;
    }

    case "like":
    case "stringPattern": {
      ensureFieldExists(shape, node.field);
      if (typeof node.value !== "string") {
        throw new QueryError(Errors.WHERE.INVALID_LIKE(node.field), { code: "INVALID_WHERE" });
      }
      return;
    }

    case "between": {
      ensureFieldExists(shape, node.field);
      const fieldSchema = shape[node.field];
      if (fieldSchema) {
        validateValue(node.field, fieldSchema, node.low, "where value");
        validateValue(node.field, fieldSchema, node.high, "where value");
      }
      return;
    }

    case "comparison": {
      ensureFieldExists(shape, node.field);
      const fieldSchema = shape[node.field];
      if (fieldSchema) {
        validateValue(node.field, fieldSchema, node.value, "where value");
      }
      return;
    }
  }
}

function validateWhereAdvanced<S extends ZodSchema>(
  schema: S,
  conditions: WhereCondition<RowFromSchema<S>>[]
): void {
  const shape = getShape(schema);
  for (const condition of conditions) {
    if (!isPlainObject(condition)) {
      throw new QueryError(Errors.WHERE.INVALID_CONDITIONS, { code: "INVALID_WHERE" });
    }

    const field = condition.field as string;
    ensureFieldExists(shape, field);

    if (condition.operator === "IS NULL" || condition.operator === "IS NOT NULL") {
      if ("value" in condition && condition.value !== undefined) {
        throw new QueryError(Errors.WHERE.INVALID_FIELD(field), { code: "INVALID_WHERE" });
      }
      continue;
    }

    if (condition.operator === "IN") {
      if (!Array.isArray(condition.value) || condition.value.length === 0) {
        throw new QueryError(Errors.WHERE.INVALID_IN(field), { code: "INVALID_WHERE" });
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
        throw new QueryError(Errors.WHERE.INVALID_LIKE(field), { code: "INVALID_WHERE" });
      }
      continue;
    }

    const fieldSchema = shape[field];
    if (fieldSchema) {
      validateValue(field, fieldSchema, condition.value, "where value");
    }
  }
}

function validateWhereInput<S extends ZodSchema>(
  schema: S,
  conditions: WhereInput<RowFromSchema<S>>
): void {
  if (Array.isArray(conditions)) {
    validateWhereAdvanced(schema, conditions);
  } else if (isPredicate(conditions)) {
    validatePredicate(schema, conditions as Predicate<RowFromSchema<S>>);
  } else if (isPlainObject(conditions)) {
    validateWhereObject(schema, conditions as Partial<RowFromSchema<S>>);
  } else {
    throw new QueryError(Errors.WHERE.INVALID_CONDITIONS, { code: "INVALID_WHERE" });
  }
}

/**
 * Snapshot a where input so a caller that keeps a reference to an array or
 * object cannot mutate a relation query after it was validated.
 */
function copyWhereInput<T extends Row>(input: WhereInput<T>): WhereInput<T> {
  if (isPredicate(input)) return input;

  return Array.isArray(input)
    ? (input.map((condition) => ({ ...condition })) as WhereCondition<T>[])
    : { ...input };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isZodSchemaLike(value: unknown): value is ZodObject<ZodRawShape> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { shape?: unknown; safeParse?: unknown; _def?: unknown };
  return (
    typeof candidate.shape === "object" &&
    candidate.shape !== null &&
    typeof candidate.safeParse === "function" &&
    "_def" in candidate
  );
}

function normalizeRelationKeys(value: unknown, context: string): string[] {
  const values =
    typeof value === "string" ? [value] : Array.isArray(value) ? (value as unknown[]) : null;

  if (!values || values.length === 0) {
    throw new TableError(
      `${context} must be a non-empty string or a non-empty array of non-empty strings`
    );
  }

  return values.map((entry) => {
    if (!isNonEmptyString(entry)) {
      throw new TableError(
        `${context} must be a non-empty string or a non-empty array of non-empty strings`
      );
    }
    return entry.trim();
  });
}

/** Junction-table configuration for a many-to-many relation. */
export type ZodThroughConfig = {
  /** Junction table name. */
  table: string;
  /** Junction column(s) that reference the parent `localKey`. */
  parentKey: string | readonly string[];
  /** Junction column(s) that reference the related `targetKey`. */
  relatedKey: string | readonly string[];
  /** Related-table column(s) being referenced. Defaults to `"id"`. */
  targetKey?: string | readonly string[];
};

/** A relation declared in the table's `relations` option. */
export type ZodRelationConfig = {
  /** Table name of the related records. */
  table: string;
  /** Column(s) on this table used to look up related rows. */
  localKey: string | readonly string[];
  /** Column(s) on the related table that reference `localKey`. */
  foreignKey?: string | readonly string[];
  /** Many-to-many junction configuration. Mutually exclusive with `foreignKey`. */
  through?: ZodThroughConfig;
  /** "one" returns a record or null; "many" returns an array. */
  relation: "one" | "many";
  /** Zod schema for the related rows (also determines default selected columns). */
  schema: ZodObject<ZodRawShape>;
  /** Nested relations loaded automatically when this relation is included. */
  relations?: ZodRelations;
  /** Related-table schema field → database column map. */
  columnMap?: ColumnMap;
  /** Related-table per-field codecs. */
  columnCodecs?: ColumnCodecs;
};

export type ZodRelations = Record<string, ZodRelationConfig>;

type RelationRow<C extends ZodRelationConfig> = ZodOutput<C["schema"]>;

type RelationChildren<C extends ZodRelationConfig> = C extends {
  relations: infer CR extends ZodRelations;
}
  ? CR
  : Record<never, never>;

type EmptySelection = Record<never, never>;

type RelationSelection<R extends ZodRelations> = {
  [N in keyof R]?: SelectKeys<RelationRow<R[N]>>;
};

type SelectedRelationRow<C extends ZodRelationConfig, Fields> = Fields extends readonly string[]
  ? string extends Fields[number]
    ? RelationRow<C>
    : Fields extends readonly ["*"]
      ? RelationRow<C>
      : PickFields<RelationRow<C>, Extract<Fields[number], keyof RelationRow<C> & string>[]>
  : RelationRow<C>;

type SelectedRelationRowDeep<C extends ZodRelationConfig, Fields> = SelectedRelationRow<C, Fields> &
  IncludedRelations<RelationChildren<C>, keyof RelationChildren<C>>;

type RelationRowDeep<C extends ZodRelationConfig> = RelationRow<C> &
  IncludedRelations<RelationChildren<C>, keyof RelationChildren<C>>;

type RelationValue<C extends ZodRelationConfig> = C extends { relation: "one" }
  ? RelationRowDeep<C> | null
  : RelationRowDeep<C>[];

type SelectedRelationValue<C extends ZodRelationConfig, Fields> = C extends { relation: "one" }
  ? SelectedRelationRowDeep<C, Fields> | null
  : SelectedRelationRowDeep<C, Fields>[];

export type IncludedRelations<
  R extends ZodRelations,
  Inc extends keyof R,
  Sel extends RelationSelection<R> = EmptySelection,
> = {
  [N in Inc]: N extends keyof Sel ? SelectedRelationValue<R[N], Sel[N]> : RelationValue<R[N]>;
};

export type IncludedRelationCounts<R extends ZodRelations, Cnt extends keyof R> = {
  [N in Cnt as `${N & string}_count`]: number;
};

export type WithRelations<
  T,
  R extends ZodRelations,
  Inc extends keyof R,
  Sel extends RelationSelection<R> = EmptySelection,
  Cnt extends keyof R = never,
> = T & IncludedRelations<R, Inc, Sel> & IncludedRelationCounts<R, Cnt>;

type WithRelationSelection<Sel, Name extends PropertyKey, Keys> = Omit<Sel, Name> & {
  [P in Name]: Keys;
};

function normalizeCounts(counts: readonly (string | CountSpec)[] | undefined): CountSpec[] {
  return (counts ?? []).map((entry) => (typeof entry === "string" ? { name: entry } : entry));
}

function normalizeIncludes(includes: readonly unknown[] | undefined): IncludeSpec[] {
  if (!includes) return [];

  return includes.map((entry) => {
    if (typeof entry === "string") return { name: entry };

    if (isPlainObject(entry) && typeof entry.name === "string") {
      return {
        name: entry.name,
        refinement: entry.refinement as RelationRefinement | undefined,
      };
    }

    throw new QueryError("Invalid include specification");
  });
}

/** Per-relation aggregate specification accepted by `withAggregate`. */
export type RelationAggregate<C extends ZodRelationConfig> = {
  count?: boolean;
  sum?: readonly (keyof RelationRow<C> & string)[];
  avg?: readonly (keyof RelationRow<C> & string)[];
  min?: readonly (keyof RelationRow<C> & string)[];
  max?: readonly (keyof RelationRow<C> & string)[];
};

/** Correlated related aggregate ordering accepted by `orderByRelated`. */
export type RelatedOrder<C extends ZodRelationConfig> = {
  aggregate: "count" | "sum" | "avg" | "min" | "max";
  column?: keyof RelationRow<C> & string;
  direction: "ASC" | "DESC";
  nulls?: "first" | "last";
};

type AggregateColumnValue<C extends ZodRelationConfig, K> = K extends keyof RelationRow<C>
  ? RelationRow<C>[K]
  : never;

type AggregateFields<
  Name extends string,
  C extends ZodRelationConfig,
  Spec extends RelationAggregate<C>,
> = (Spec["count"] extends true ? { [P in `${Name}_count`]: number } : Record<never, never>) &
  (Spec["sum"] extends readonly (infer K extends keyof RelationRow<C> & string)[]
    ? { [P in `${Name}_sum_${K}`]: number | null }
    : Record<never, never>) &
  (Spec["avg"] extends readonly (infer K extends keyof RelationRow<C> & string)[]
    ? { [P in `${Name}_avg_${K}`]: number | null }
    : Record<never, never>) &
  (Spec["min"] extends readonly (infer K extends keyof RelationRow<C> & string)[]
    ? { [P in `${Name}_min_${K}`]: AggregateColumnValue<C, K> | null }
    : Record<never, never>) &
  (Spec["max"] extends readonly (infer K extends keyof RelationRow<C> & string)[]
    ? { [P in `${Name}_max_${K}`]: AggregateColumnValue<C, K> | null }
    : Record<never, never>);

function normalizeAggregate<C extends ZodRelationConfig>(
  config: C,
  raw: RelationAggregate<C>
): AggregateSpec["aggregate"] {
  if (!isPlainObject(raw)) {
    throw new QueryError(Errors.SELECT.INVALID_AGGREGATE, { code: "INVALID_AGGREGATE" });
  }

  const shape = config.schema.shape as unknown as ZodShape;
  const normalized: AggregateSpec["aggregate"] = {};

  if (raw.count !== undefined) {
    if (typeof raw.count !== "boolean") {
      throw new QueryError(Errors.SELECT.INVALID_AGGREGATE, { code: "INVALID_AGGREGATE" });
    }
    if (raw.count) normalized.count = true;
  }

  for (const kind of ["sum", "avg", "min", "max"] as const) {
    const columns = raw[kind];
    if (columns === undefined) continue;
    if (!Array.isArray(columns) || columns.some((column) => !Object.hasOwn(shape, column))) {
      throw new QueryError(Errors.SELECT.INVALID_AGGREGATE, { code: "INVALID_AGGREGATE" });
    }
    normalized[kind] = [...columns];
  }

  if (
    !normalized.count &&
    !normalized.sum?.length &&
    !normalized.avg?.length &&
    !normalized.min?.length &&
    !normalized.max?.length
  ) {
    throw new QueryError(Errors.SELECT.INVALID_AGGREGATE, { code: "INVALID_AGGREGATE" });
  }

  return normalized;
}

type NameOptions = { strictNames: boolean; allowSchema: boolean };

function normalizeRelation<S extends ZodSchema>(
  name: string,
  raw: unknown,
  parentSchema: S,
  nameOptions: NameOptions,
  path: WeakSet<object>
): NormalizedRelation {
  const context = `Invalid relation ${JSON.stringify(name)}`;

  if (!name.trim()) {
    throw new TableError(`${context}: relation name must be a non-empty string`);
  }

  if (!isPlainObject(raw)) {
    throw new TableError(`${context}: expected a relation configuration object`);
  }

  if (path.has(raw)) {
    throw new TableError(`${context}: cyclic relation configuration`);
  }
  path.add(raw);

  const table = raw.table;
  if (!isNonEmptyString(table)) {
    throw new TableError(`${context}: "table" must be a non-empty string`);
  }

  const tableName = table.trim();
  const validTableName = nameOptions.strictNames
    ? isValidIdentifier(tableName, { allowSchema: nameOptions.allowSchema })
    : isValidName(tableName) && (nameOptions.allowSchema || !tableName.includes("."));

  if (!validTableName) {
    throw new TableError(`${context}: invalid relation table name ${JSON.stringify(tableName)}`);
  }

  const relation = raw.relation;
  if (relation !== "one" && relation !== "many") {
    throw new TableError(`${context}: "relation" must be "one" or "many"`);
  }

  const localKeys = normalizeRelationKeys(raw.localKey, `${context}: "localKey"`);

  if (new Set(localKeys).size !== localKeys.length) {
    throw new TableError(`${context}: "localKey" must not contain duplicate columns`);
  }

  const parentShape = getShape(parentSchema);
  for (const key of localKeys) {
    if (!Object.hasOwn(parentShape, key)) {
      throw new TableError(
        `${context}: parent schema has no column ${JSON.stringify(key)} for "localKey"`
      );
    }
  }

  if (!isZodSchemaLike(raw.schema)) {
    throw new TableError(`${context}: "schema" must be a Zod object schema`);
  }
  const relatedSchema = raw.schema;
  const relatedShape = relatedSchema.shape as unknown as ZodShape;

  if (raw.columnMap !== undefined) {
    if (!isPlainObject(raw.columnMap)) {
      throw new TableError(`${context}: "columnMap" must be an object`);
    }
    for (const [field, column] of Object.entries(raw.columnMap)) {
      if (!Object.hasOwn(relatedShape, field) || typeof column !== "string" || !column.trim()) {
        throw new TableError(`${context}: invalid "columnMap" entry`);
      }
    }
  }
  if (raw.columnCodecs !== undefined) {
    if (!isPlainObject(raw.columnCodecs)) {
      throw new TableError(`${context}: "columnCodecs" must be an object`);
    }
    for (const [field, codec] of Object.entries(raw.columnCodecs)) {
      if (
        !Object.hasOwn(relatedShape, field) ||
        !isPlainObject(codec) ||
        (codec.encode !== undefined && typeof codec.encode !== "function") ||
        (codec.decode !== undefined && typeof codec.decode !== "function")
      ) {
        throw new TableError(`${context}: invalid "columnCodecs" entry`);
      }
    }
  }

  let childRelations: {
    relations: ZodRelations;
    info: Map<string, NormalizedRelation>;
  };
  try {
    childRelations =
      raw.relations === undefined
        ? { relations: {} as ZodRelations, info: new Map<string, NormalizedRelation>() }
        : normalizeRelations(raw.relations, relatedSchema, nameOptions, path);
  } finally {
    path.delete(raw);
  }

  if (raw.through !== undefined) {
    if (raw.foreignKey !== undefined) {
      throw new TableError(`${context}: use either "through" or "foreignKey", not both`);
    }
    if (relation !== "many") {
      throw new TableError(`${context}: "through" relations must use relation: "many"`);
    }
    if (!isPlainObject(raw.through)) {
      throw new TableError(`${context}: "through" must be an object`);
    }

    const throughTable = raw.through.table;
    if (!isNonEmptyString(throughTable)) {
      throw new TableError(`${context}: "through.table" must be a non-empty string`);
    }

    const throughTableName = throughTable.trim();
    const validThroughTable = nameOptions.strictNames
      ? isValidIdentifier(throughTableName, { allowSchema: nameOptions.allowSchema })
      : isValidName(throughTableName) &&
        (nameOptions.allowSchema || !throughTableName.includes("."));

    if (!validThroughTable) {
      throw new TableError(
        `${context}: invalid junction table name ${JSON.stringify(throughTableName)}`
      );
    }

    const parentKeys = normalizeRelationKeys(
      raw.through.parentKey,
      `${context}: "through.parentKey"`
    );
    const relatedKeys = normalizeRelationKeys(
      raw.through.relatedKey,
      `${context}: "through.relatedKey"`
    );
    const targetKeys = normalizeRelationKeys(
      raw.through.targetKey ?? "id",
      `${context}: "through.targetKey"`
    );

    if (parentKeys.length !== localKeys.length) {
      throw new TableError(
        `${context}: "localKey" and "through.parentKey" must have the same number of columns`
      );
    }
    if (relatedKeys.length !== targetKeys.length) {
      throw new TableError(
        `${context}: "through.relatedKey" and "through.targetKey" must have the same number of columns`
      );
    }
    if (new Set(parentKeys).size !== parentKeys.length) {
      throw new TableError(`${context}: "through.parentKey" must not contain duplicate columns`);
    }
    if (new Set(relatedKeys).size !== relatedKeys.length) {
      throw new TableError(`${context}: "through.relatedKey" must not contain duplicate columns`);
    }
    if (new Set(targetKeys).size !== targetKeys.length) {
      throw new TableError(`${context}: "through.targetKey" must not contain duplicate columns`);
    }
    for (const key of targetKeys) {
      if (!Object.hasOwn(relatedShape, key)) {
        throw new TableError(
          `${context}: related schema has no column ${JSON.stringify(key)} for "through.targetKey"`
        );
      }
    }

    const through: NormalizedThrough = {
      table: throughTableName,
      parentKeys,
      relatedKeys,
      targetKeys,
    };
    const config: ZodRelationConfig = {
      table: tableName,
      localKey: Array.isArray(raw.localKey) ? [...localKeys] : (localKeys[0] as string),
      relation,
      schema: relatedSchema,
      relations: childRelations.relations,
      columnMap: raw.columnMap as ColumnMap | undefined,
      columnCodecs: raw.columnCodecs as ColumnCodecs | undefined,
      through: {
        table: throughTableName,
        parentKey: Array.isArray(raw.through.parentKey)
          ? [...parentKeys]
          : (parentKeys[0] as string),
        relatedKey: Array.isArray(raw.through.relatedKey)
          ? [...relatedKeys]
          : (relatedKeys[0] as string),
        targetKey: Array.isArray(raw.through.targetKey)
          ? [...targetKeys]
          : (targetKeys[0] as string),
      },
    };

    return { config, localKeys, foreignKeys: [], through, children: childRelations.info };
  }

  const foreignKeys = normalizeRelationKeys(raw.foreignKey, `${context}: "foreignKey"`);

  if (localKeys.length !== foreignKeys.length) {
    throw new TableError(
      `${context}: "localKey" and "foreignKey" must have the same number of columns`
    );
  }

  if (new Set(foreignKeys).size !== foreignKeys.length) {
    throw new TableError(`${context}: "foreignKey" must not contain duplicate columns`);
  }

  for (const key of foreignKeys) {
    if (!Object.hasOwn(relatedShape, key)) {
      throw new TableError(
        `${context}: related schema has no column ${JSON.stringify(key)} for "foreignKey"`
      );
    }
  }

  const config: ZodRelationConfig = {
    table: tableName,
    localKey: Array.isArray(raw.localKey) ? [...localKeys] : (localKeys[0] as string),
    foreignKey: Array.isArray(raw.foreignKey) ? [...foreignKeys] : (foreignKeys[0] as string),
    relation,
    schema: relatedSchema,
    relations: childRelations.relations,
    columnMap: raw.columnMap as ColumnMap | undefined,
    columnCodecs: raw.columnCodecs as ColumnCodecs | undefined,
  };

  return { config, localKeys, foreignKeys, children: childRelations.info };
}

function normalizeRelations<S extends ZodSchema, R extends ZodRelations>(
  relations: unknown,
  schema: S,
  nameOptions: NameOptions,
  path: WeakSet<object> = new WeakSet()
): { relations: R; info: Map<string, NormalizedRelation> } {
  if (relations === undefined) {
    return { relations: {} as R, info: new Map() };
  }

  if (!isPlainObject(relations)) {
    throw new TableError("Invalid relations option: expected an object");
  }

  const normalized: Record<string, ZodRelationConfig> = {};
  const info = new Map<string, NormalizedRelation>();

  for (const [name, raw] of Object.entries(relations)) {
    const relation = normalizeRelation(name, raw, schema, nameOptions, path);
    // defineProperty avoids the `__proto__` setter for hostile relation names.
    Object.defineProperty(normalized, name, {
      configurable: true,
      enumerable: true,
      value: relation.config,
      writable: true,
    });
    info.set(name, relation);
  }

  return { relations: normalized as unknown as R, info };
}

type RelationBuilderState<C extends ZodRelationConfig> = {
  whereInputs?: readonly WhereInput<RelationRow<C>>[];
  orderByValue?: readonly SortSpec<RelationRow<C>>[];
  takeValue?: number;
  selectedFields?: readonly string[];
};

function relationSchemaColumns(config: ZodRelationConfig): string[] {
  return Object.keys(config.schema.shape);
}

function resolveRelationSelection(config: ZodRelationConfig, fields: unknown): string[] {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new QueryError(Errors.SELECT.INVALID_COLUMNS(String(fields)));
  }

  const columns = fields as unknown[];
  if (columns.length === 1 && columns[0] === "*") {
    return relationSchemaColumns(config);
  }

  const shape = config.schema.shape as unknown as ZodShape;
  const resolved: string[] = [];
  for (const column of columns) {
    if (typeof column !== "string" || !Object.hasOwn(shape, column)) {
      throw new QueryError(Errors.SELECT.INVALID_COLUMNS(columns.join(", ")));
    }
    resolved.push(column);
  }
  return resolved;
}

/**
 * Chainable refinement for a single `include`d relation. Use it to filter,
 * order, limit and project the rows loaded for that relation.
 *
 * @example
 * ```typescript
 * await users.include("posts", (posts) =>
 *   posts.where({ published: true }).orderBy([{ column: "created_at", direction: "DESC" }]).take(5)
 * );
 * ```
 */
export class RelationBuilder<
  C extends ZodRelationConfig = ZodRelationConfig,
  K extends SelectKeys<RelationRow<C>> = ["*"],
> {
  private readonly config: C;
  private readonly whereInputs: readonly WhereInput<RelationRow<C>>[];
  private readonly orderByValue?: readonly SortSpec<RelationRow<C>>[];
  private readonly takeValue?: number;
  private readonly selectedFields?: readonly string[];

  constructor(config: C, state?: RelationBuilderState<C>) {
    this.config = config;
    this.whereInputs = state?.whereInputs ?? [];
    this.orderByValue = state?.orderByValue;
    this.takeValue = state?.takeValue;
    this.selectedFields = state?.selectedFields;
  }

  private next(state: RelationBuilderState<C>): RelationBuilder<C, K> {
    return new RelationBuilder<C, K>(this.config, state);
  }

  /** Add a validated, parameterized WHERE condition for the related rows. */
  where(conditions: WhereInput<RelationRow<C>>): RelationBuilder<C, K> {
    const schema = this.config.schema as unknown as ZodSchema;
    validateWhereInput(schema, conditions as unknown as WhereInput<RowFromSchema<ZodSchema>>);

    return this.next({
      whereInputs: [...this.whereInputs, copyWhereInput(conditions)],
      orderByValue: this.orderByValue,
      takeValue: this.takeValue,
      selectedFields: this.selectedFields,
    });
  }

  /** Order the related rows. Applies per parent when combined with `take`. */
  orderBy(spec: SortSpec<RelationRow<C>>[]): RelationBuilder<C, K> {
    if (!Array.isArray(spec)) {
      throw new QueryError(Errors.SELECT.INVALID_SORT_SPEC);
    }

    const shape = this.config.schema.shape as unknown as ZodShape;
    const copied: SortSpec<RelationRow<C>>[] = [];
    for (const entry of spec) {
      if (!isPlainObject(entry)) {
        throw new QueryError(Errors.SELECT.INVALID_SORT_SPEC);
      }

      const { column, direction } = entry as unknown as SortSpec<RelationRow<C>>;
      if (typeof column !== "string" || !Object.hasOwn(shape, column)) {
        throw new QueryError(Errors.SELECT.INVALID_COLUMNS(String(column)));
      }
      if (direction !== "ASC" && direction !== "DESC") {
        throw new QueryError(Errors.WHERE.INVALID_SORT);
      }
      copied.push({ column, direction });
    }

    return this.next({
      whereInputs: this.whereInputs,
      orderByValue: copied,
      takeValue: this.takeValue,
      selectedFields: this.selectedFields,
    });
  }

  /**
   * Limit the number of related rows. For a to-many relation the limit is
   * applied per parent row, not across the whole batched query.
   */
  take(count: number): RelationBuilder<C, K> {
    validatePagination(undefined, count);

    return this.next({
      whereInputs: this.whereInputs,
      orderByValue: this.orderByValue,
      takeValue: count,
      selectedFields: this.selectedFields,
    });
  }

  /**
   * Project the related rows. The foreign key is fetched internally for
   * mapping and only included in the result when explicitly selected.
   */
  select<K2 extends SelectKeys<RelationRow<C>>>(fields: K2): RelationBuilder<C, K2> {
    const selected = resolveRelationSelection(this.config, fields);

    return new RelationBuilder<C, K2>(this.config, {
      whereInputs: this.whereInputs,
      orderByValue: this.orderByValue,
      takeValue: this.takeValue,
      selectedFields: selected,
    });
  }

  /** @internal Snapshot the accumulated refinement. */
  getRefinement(): RelationRefinement {
    return {
      whereInputs: this.whereInputs as unknown as readonly WhereInput<Row>[],
      orderBy: this.orderByValue as unknown as readonly SortSpec<Row>[] | undefined,
      take: this.takeValue,
      select: this.selectedFields,
    };
  }
}

/**
 * The subset of {@link RelationBuilder} accepted by `whereRelated`; relation
 * filters only use the WHERE part of a refinement.
 */
export type RelationFilter<C extends ZodRelationConfig> = {
  where(conditions: WhereInput<RelationRow<C>>): RelationFilter<C>;
};

/** Declarative form of an `include` refinement. */
export type RelationOptions<
  C extends ZodRelationConfig,
  K extends SelectKeys<RelationRow<C>> = ["*"],
> = {
  where?: WhereInput<RelationRow<C>>;
  orderBy?: SortSpec<RelationRow<C>>[];
  take?: number;
  select?: K;
};

function buildKeyLink(
  sql: Sql<Record<string, unknown>>,
  parentTable: string,
  relation: NormalizedRelation,
  parentColumnMap?: Readonly<Record<string, string>>
): SqlFragment {
  let link = sql``;

  relation.localKeys.forEach((localKey, index) => {
    const foreignKey = relation.foreignKeys[index];
    if (!foreignKey) throw new QueryError("Invalid relation configuration");

    const parentColumn = parentColumnMap?.[localKey] ?? localKey;
    const foreignColumn = relation.config.columnMap?.[foreignKey] ?? foreignKey;
    const condition = sql`${sql(parentTable)}.${sql(parentColumn)} = ${sql(relation.config.table)}.${sql(foreignColumn)}`;
    link = index === 0 ? condition : sql`${link} AND ${condition}`;
  });

  return link;
}

/** Relation filters need the parent table name for the correlated column. */
function getParentTableName(table: { getTableName(): string }): string {
  const candidate = table.getTableName();
  if (!candidate) {
    throw new QueryError("Relation filters require the parent table name", {
      code: "INVALID_RELATION",
    });
  }
  return candidate;
}

export class ZodTable<
  S extends ZodSchema,
  K extends SelectKeys<RowFromSchema<S>> = ["*"],
  I extends Row = RowFromSchema<S>,
  R extends ZodRelations = Record<string, never>,
  Inc extends keyof R = never,
  Sel extends RelationSelection<R> = EmptySelection,
  Cnt extends keyof R = never,
> {
  private table: Table<RowFromSchema<S>, K, I>;
  private schema: S;
  private relations: R;
  private relationInfo: Map<string, NormalizedRelation>;
  private includes: readonly IncludeSpec[];
  private counts: readonly CountSpec[];

  constructor(
    table: Table<RowFromSchema<S>, K, I>,
    schema: S,
    relations?: R,
    includes?: readonly (keyof R | IncludeSpec)[],
    counts?: readonly (string | CountSpec)[]
  ) {
    const normalized = normalizeRelations<S, R>(relations, schema, table.getNameOptions());
    this.table = table;
    this.schema = schema;
    this.relations = normalized.relations;
    this.relationInfo = normalized.info;
    this.includes = normalizeIncludes(includes as readonly unknown[] | undefined);
    this.counts = normalizeCounts(counts);
  }

  private wrap<K2 extends SelectKeys<RowFromSchema<S>>>(
    table: Table<RowFromSchema<S>, K2, I>
  ): ZodTable<S, K2, I, R, Inc, Sel, Cnt> {
    return new ZodTable<S, K2, I, R, Inc, Sel, Cnt>(
      table,
      this.schema,
      this.relations,
      this.includes,
      this.counts
    );
  }

  private getRelation(name: unknown): NormalizedRelation {
    if (typeof name !== "string" || !Object.hasOwn(this.relations, name)) {
      throw new QueryError(Errors.SELECT.INVALID_RELATION(String(name)), {
        code: "INVALID_RELATION",
      });
    }

    const relation = this.relationInfo.get(name);
    if (!relation) {
      throw new QueryError(Errors.SELECT.INVALID_RELATION(name), { code: "INVALID_RELATION" });
    }
    return relation;
  }

  private buildRefinement<C extends ZodRelationConfig, K2 extends SelectKeys<RelationRow<C>>>(
    config: C,
    refine: (relation: RelationBuilder<C>) => RelationBuilder<C, K2>
  ): RelationRefinement {
    if (typeof refine !== "function") {
      throw new QueryError("Relation refinement must be a function");
    }

    const builder = refine(new RelationBuilder<C>(config));
    if (!(builder instanceof RelationBuilder)) {
      throw new QueryError("Relation refinement must return the relation builder");
    }
    return builder.getRefinement();
  }

  /**
   * Include a relation declared in the table's `relations` option. Only
   * `find*` methods populate includes; mutations return plain rows.
   *
   * @example
   * ```typescript
   * const rows = await users
   *   .include("posts", (posts) =>
   *     posts.where({ published: true }).orderBy([{ column: "id", direction: "DESC" }]).take(3)
   *   )
   *   .findMany();
   * ```
   */
  include<Name extends keyof R, K2 extends SelectKeys<RelationRow<R[Name]>> = ["*"]>(
    name: Name,
    options: RelationOptions<R[Name], K2>
  ): ZodTable<S, K, I, R, Inc | Name, WithRelationSelection<Sel, Name, K2>, Cnt>;
  include<Name extends keyof R, K2 extends SelectKeys<RelationRow<R[Name]>> = ["*"]>(
    name: Name,
    refine?: (relation: RelationBuilder<R[Name]>) => RelationBuilder<R[Name], K2>
  ): ZodTable<S, K, I, R, Inc | Name, WithRelationSelection<Sel, Name, K2>, Cnt>;
  include<Name extends keyof R, K2 extends SelectKeys<RelationRow<R[Name]>> = ["*"]>(
    name: Name,
    refine?:
      | ((relation: RelationBuilder<R[Name]>) => RelationBuilder<R[Name], K2>)
      | RelationOptions<R[Name], K2>
  ): ZodTable<S, K, I, R, Inc | Name, WithRelationSelection<Sel, Name, K2>, Cnt> {
    const relation = this.getRelation(name);
    let refinement: RelationRefinement | undefined;

    if (typeof refine === "function") {
      refinement = this.buildRefinement(relation.config as R[Name], refine);
    } else if (refine !== undefined) {
      if (!isPlainObject(refine)) {
        throw new QueryError("Relation options must be an object");
      }

      let builder = new RelationBuilder<R[Name]>(relation.config as R[Name]);
      if (refine.where !== undefined) builder = builder.where(refine.where);
      if (refine.orderBy !== undefined) builder = builder.orderBy(refine.orderBy);
      if (refine.take !== undefined) builder = builder.take(refine.take);
      if (refine.select !== undefined) {
        builder = builder.select(refine.select) as unknown as RelationBuilder<R[Name]>;
      }
      refinement = builder.getRefinement();
    }

    const includes: IncludeSpec[] = [
      ...this.includes.filter((entry) => entry.name !== String(name)),
      { name: String(name), refinement },
    ];

    return new ZodTable<S, K, I, R, Inc | Name, WithRelationSelection<Sel, Name, K2>, Cnt>(
      this.table,
      this.schema,
      this.relations,
      includes,
      this.counts
    );
  }

  /**
   * Add a `<name>_count` number to every returned row with the number of
   * related rows. Only `find*` methods populate counts; mutations return
   * plain rows. Counts include all related rows (refinements on `include`
   * do not affect them).
   */
  withCount<Name extends keyof R>(
    name: Name,
    refine?: (relation: RelationBuilder<R[Name]>) => RelationBuilder<R[Name]>
  ): ZodTable<S, K, I, R, Inc, Sel, Cnt | Name> {
    const relation = this.getRelation(name);
    const refinement = refine
      ? this.buildRefinement(relation.config as R[Name], refine)
      : undefined;

    const key = String(name);
    const counts: CountSpec[] = [
      ...this.counts.filter((entry) => entry.name !== key),
      { name: key, refinement },
    ];

    return new ZodTable<S, K, I, R, Inc, Sel, Cnt | Name>(
      this.table,
      this.schema,
      this.relations,
      this.includes,
      counts
    );
  }

  /**
   * Add per-relation aggregate fields. Aggregates are computed over the
   * related rows, optionally filtered by a relation refinement.
   */
  withAggregate<Name extends keyof R, Spec extends RelationAggregate<R[Name]>>(
    name: Name,
    aggregate: Spec,
    refine?: (relation: RelationBuilder<R[Name]>) => RelationBuilder<R[Name]>
  ): ZodAggregatedQuery<S, K, I, R, Inc, Sel, Cnt, Name, Spec> {
    const relation = this.getRelation(name);
    const normalized = normalizeAggregate(relation.config as R[Name], aggregate);
    const refinement = refine
      ? this.buildRefinement(relation.config as R[Name], refine)
      : undefined;

    const spec: AggregateSpec = {
      name: String(name),
      aggregate: normalized,
      refinement,
    };

    return new ZodAggregatedQuery<S, K, I, R, Inc, Sel, Cnt, Name, Spec>(this, [spec]);
  }

  /** @internal Terminal query used by `withAggregate`. */
  async findManyWithAggregates(
    specs: readonly AggregateSpec[]
  ): Promise<Array<Record<string, unknown>>> {
    const keys = specs.flatMap((spec) => this.getRelation(spec.name).localKeys);
    const prepared = this.prepareQuery(keys);
    const rows = (await prepared.table.findMany()) as Array<Record<string, unknown>>;
    return this.finalize(rows, prepared.stripKeys, specs);
  }

  /**
   * Order parent rows by a correlated aggregate over a relation.
   */
  orderByRelated<Name extends keyof R>(
    name: Name,
    spec: RelatedOrder<R[Name]>
  ): ZodTable<S, K, I, R, Inc, Sel, Cnt> {
    const relation = this.getRelation(name);
    return this.wrap(this.table.orderByRaw(this.buildRelatedOrder(relation, spec)));
  }

  private relationNameOptions(relation: NormalizedRelation): {
    columnMap?: ColumnMap;
    columnCodecs?: ColumnCodecs;
  } {
    return {
      columnMap: relation.config.columnMap,
      columnCodecs: relation.config.columnCodecs,
    };
  }

  private buildRelatedOrder(
    relation: NormalizedRelation,
    spec: RelatedOrder<ZodRelationConfig>
  ): SqlFragment {
    const sql = this.table.getSql();
    const aggregate = spec.aggregate;
    const direction = spec.direction;
    const nulls = spec.nulls;

    if (direction !== "ASC" && direction !== "DESC") {
      throw new QueryError(Errors.WHERE.INVALID_SORT, { code: "INVALID_SORT" });
    }
    if (nulls !== undefined && nulls !== "first" && nulls !== "last") {
      throw new QueryError(Errors.WHERE.INVALID_SORT, { code: "INVALID_SORT" });
    }

    const shape = getShape(relation.config.schema as unknown as ZodSchema);
    if (aggregate === "count") {
      if (spec.column !== undefined) {
        throw new QueryError(Errors.SELECT.INVALID_AGGREGATE, { code: "INVALID_AGGREGATE" });
      }
    } else if (typeof spec.column !== "string" || !Object.hasOwn(shape, spec.column)) {
      throw new QueryError(Errors.SELECT.INVALID_AGGREGATE, { code: "INVALID_AGGREGATE" });
    }

    const parentTable = getParentTableName(this.table);
    const functionName = sql.unsafe(aggregate.toUpperCase());
    const through = relation.through;

    let from: SqlFragment;
    let link: SqlFragment;
    let aggregateColumn: SqlFragment;

    if (through) {
      const junction = sql("__pgbuddy_order_through");
      const related = sql("__pgbuddy_order_related");
      const join = through.targetKeys.reduce((acc, targetKey, index) => {
        const relatedKey = through.relatedKeys[index];
        if (!relatedKey) throw new QueryError("Invalid relation configuration");
        const mappedTarget = relation.config.columnMap?.[targetKey] ?? targetKey;
        const condition = sql`${related}.${sql(mappedTarget)} = ${junction}.${sql(relatedKey)}`;
        return index === 0 ? condition : sql`${acc} AND ${condition}`;
      }, sql``);
      from = sql`FROM ${sql(through.table)} AS ${junction} JOIN ${sql(relation.config.table)} AS ${related} ON ${join}`;
      link = relation.localKeys.reduce((acc, localKey, index) => {
        const junctionKey = through.parentKeys[index];
        if (!junctionKey) throw new QueryError("Invalid relation configuration");
        const parentColumn = this.table.getNameOptions().columnMap?.[localKey] ?? localKey;
        const condition = sql`${sql(parentTable)}.${sql(parentColumn)} = ${junction}.${sql(junctionKey)}`;
        return index === 0 ? condition : sql`${acc} AND ${condition}`;
      }, sql``);
      aggregateColumn =
        aggregate === "count"
          ? sql`COUNT(*)::int`
          : sql`${functionName}(${related}.${sql(
              relation.config.columnMap?.[spec.column as string] ?? (spec.column as string)
            )})`;
    } else {
      from = sql`FROM ${sql(relation.config.table)}`;
      link = buildKeyLink(sql, parentTable, relation, this.table.getNameOptions().columnMap);
      aggregateColumn =
        aggregate === "count"
          ? sql`COUNT(*)::int`
          : sql`${functionName}(${sql(relation.config.table)}.${sql(
              relation.config.columnMap?.[spec.column as string] ?? (spec.column as string)
            )})`;
    }

    return sql`(SELECT ${aggregateColumn} ${from} WHERE ${link}) ${sql.unsafe(direction)}${
      nulls ? sql` NULLS ${sql.unsafe(nulls.toUpperCase())}` : sql``
    }`;
  }

  /**
   * Filter parent rows to those with at least one related row matching the
   * optional relation filter. Compiles to a parameterized `EXISTS` subquery
   * and composes with other `where` inputs.
   */
  whereRelated<Name extends keyof R>(
    name: Name,
    refine?: (relation: RelationFilter<R[Name]>) => RelationFilter<R[Name]>
  ): ZodTable<S, K, I, R, Inc, Sel, Cnt> {
    const relation = this.getRelation(name);
    let refinement: RelationRefinement | undefined;

    if (refine) {
      if (typeof refine !== "function") {
        throw new QueryError("Relation filter must be a function");
      }
      const filter = refine(new RelationBuilder<R[Name]>(relation.config as R[Name]));
      if (!(filter instanceof RelationBuilder)) {
        throw new QueryError("Relation filter must return the relation builder");
      }
      refinement = filter.getRefinement();
    }

    return this.wrap(this.table.whereRaw(this.buildExistsFragment(relation, refinement, false)));
  }

  /**
   * Filter parent rows to those with no related rows. Compiles to a
   * parameterized `NOT EXISTS` subquery.
   */
  whereMissing<Name extends keyof R>(name: Name): ZodTable<S, K, I, R, Inc, Sel, Cnt> {
    const relation = this.getRelation(name);
    return this.wrap(this.table.whereRaw(this.buildExistsFragment(relation, undefined, true)));
  }

  /**
   * Filter parent rows where every related row matches the refinement.
   * Compiles to `NOT EXISTS (... WHERE NOT (refinement))`.
   */
  whereEvery<Name extends keyof R>(
    name: Name,
    refine?: (relation: RelationFilter<R[Name]>) => RelationFilter<R[Name]>
  ): ZodTable<S, K, I, R, Inc, Sel, Cnt> {
    const relation = this.getRelation(name);

    if (refine === undefined) {
      return this;
    }

    if (typeof refine !== "function") {
      throw new QueryError("Relation filter must be a function");
    }

    const filter = refine(new RelationBuilder<R[Name]>(relation.config as R[Name]));
    if (!(filter instanceof RelationBuilder)) {
      throw new QueryError("Relation filter must return the relation builder");
    }

    const refinement = filter.getRefinement();
    if (!refinement.whereInputs?.length) {
      return this;
    }

    return this.wrap(this.table.whereRaw(this.buildEveryFragment(relation, refinement)));
  }

  private buildEveryFragment(
    relation: NormalizedRelation,
    refinement: RelationRefinement
  ): SqlFragment {
    if (relation.through) {
      return this.buildThroughExists(relation, refinement, true, true);
    }

    const sql = this.table.getSql();
    const parentTable = getParentTableName(this.table);
    const link = buildKeyLink(sql, parentTable, relation, this.table.getNameOptions().columnMap);
    const linkExpression = buildWhereExpression(sql, [rawPredicate<Row>(link)]);
    const refinementExpression = buildWhereExpression(
      sql,
      (refinement.whereInputs ?? []) as readonly WhereInput<Row>[],
      this.relationNameOptions(relation)
    );

    const where = refinementExpression
      ? sql`WHERE ${linkExpression} AND NOT (${refinementExpression})`
      : sql`WHERE ${linkExpression}`;

    return sql`NOT EXISTS (SELECT 1 FROM ${sql(relation.config.table)} ${where})`;
  }

  private buildThroughExists(
    relation: NormalizedRelation,
    refinement: RelationRefinement | undefined,
    negate: boolean,
    negateRefinement: boolean
  ): SqlFragment {
    const through = relation.through;
    if (!through) throw new QueryError("Invalid relation configuration");

    const sql = this.table.getSql();
    const parentTable = getParentTableName(this.table);
    const junction = sql("__pgbuddy_through");

    const link = relation.localKeys.reduce((acc, localKey, index) => {
      const junctionKey = through.parentKeys[index];
      if (!junctionKey) throw new QueryError("Invalid relation configuration");

      const parentColumn = this.table.getNameOptions().columnMap?.[localKey] ?? localKey;
      const condition = sql`${sql(parentTable)}.${sql(parentColumn)} = ${junction}.${sql(junctionKey)}`;
      return index === 0 ? condition : sql`${acc} AND ${condition}`;
    }, sql``);

    const tuple = (keys: readonly string[], qualifier?: string): SqlFragment => {
      const columns = keys.map((key) =>
        qualifier ? sql`${sql(qualifier)}.${sql(key)}` : sql`${sql(key)}`
      );
      if (columns.length === 1) return columns[0] as SqlFragment;
      return sql`(${columns.reduce((acc, column, index) => (index === 0 ? column : sql`${acc}, ${column}`), sql``)})`;
    };

    const targetWhere = buildWhereExpression(
      sql,
      (refinement?.whereInputs ?? []) as readonly WhereInput<Row>[],
      this.relationNameOptions(relation)
    );
    const targetFilter = targetWhere
      ? sql`WHERE ${negateRefinement ? sql`NOT (${targetWhere})` : targetWhere}`
      : sql``;
    const mappedTargetKeys = through.targetKeys.map(
      (key) => relation.config.columnMap?.[key] ?? key
    );
    const targetQuery = sql`SELECT ${tuple(mappedTargetKeys)} FROM ${sql(relation.config.table)} ${targetFilter}`;
    const junctionTarget = tuple(through.relatedKeys, "__pgbuddy_through");

    const exists = sql`EXISTS (
      SELECT 1 FROM ${sql(through.table)} AS ${junction}
      WHERE ${link} AND ${junctionTarget} IN (${targetQuery})
    )`;

    return negate ? sql`NOT ${exists}` : exists;
  }

  private buildExistsFragment(
    relation: NormalizedRelation,
    refinement: RelationRefinement | undefined,
    negate: boolean
  ): SqlFragment {
    if (relation.through) {
      return this.buildThroughExists(relation, refinement, negate, false);
    }

    const sql = this.table.getSql();
    const parentTable = getParentTableName(this.table);
    const link = buildKeyLink(sql, parentTable, relation, this.table.getNameOptions().columnMap);
    const inputs: WhereInput<Row>[] = [
      ...((refinement?.whereInputs ?? []) as readonly WhereInput<Row>[]),
      rawPredicate<Row>(link),
    ];
    const where = buildWhereInputs(sql, inputs, this.relationNameOptions(relation));
    const exists = sql`EXISTS (SELECT 1 FROM ${sql(relation.config.table)} ${where})`;

    return negate ? sql`NOT ${exists}` : exists;
  }

  private projectedFields(): string[] {
    const selected = this.table.getSelectedFields() as readonly string[];
    if (!selected.length || selected[0] === "*") {
      return Object.keys(getShape(this.schema));
    }
    return [...selected];
  }

  private requiredLocalKeys(extra: readonly string[] = []): string[] {
    const keys = new Set<string>(extra);

    for (const include of this.includes) {
      const relation = this.getRelation(include.name);
      for (const key of relation.localKeys) keys.add(key);
    }

    for (const spec of this.counts) {
      const relation = this.getRelation(spec.name);
      for (const key of relation.localKeys) keys.add(key);
    }

    return [...keys];
  }

  private prepareQuery(extraKeys: readonly string[] = []): {
    table: Table<RowFromSchema<S>, SelectKeys<RowFromSchema<S>>, I>;
    stripKeys: readonly string[];
  } {
    const prepared = this.table as unknown as Table<
      RowFromSchema<S>,
      SelectKeys<RowFromSchema<S>>,
      I
    >;

    if (this.includes.length === 0 && this.counts.length === 0) {
      return { table: prepared, stripKeys: [] };
    }

    const projection = this.projectedFields();
    const missing = this.requiredLocalKeys(extraKeys).filter((key) => !projection.includes(key));
    if (missing.length === 0) {
      return { table: prepared, stripKeys: [] };
    }

    // Fetch the key columns needed for mapping, then strip them again after
    // the relation values are attached unless the caller asked for them.
    const table = this.table.select([...projection, ...missing] as never) as unknown as Table<
      RowFromSchema<S>,
      SelectKeys<RowFromSchema<S>>,
      I
    >;

    return { table, stripKeys: missing };
  }

  private async finalize(
    rows: Array<Record<string, unknown>>,
    stripKeys: readonly string[],
    aggregateSpecs: readonly AggregateSpec[] = []
  ): Promise<Array<Record<string, unknown>>> {
    const result = rows.map((row) => ({ ...row }));
    await this.loadRelations(result);

    if (aggregateSpecs.length > 0) {
      const loader = new RelationLoader(this.table.getSql());
      await loader.aggregate(result, this.relationInfo, aggregateSpecs);
    }

    if (stripKeys.length > 0) {
      const protectedKeys = new Set<string>([
        ...this.includes.map((include) => include.name),
        ...this.counts.map((spec) => `${spec.name}_count`),
      ]);

      for (const row of result) {
        for (const key of stripKeys) {
          if (!protectedKeys.has(key)) delete row[key];
        }
      }
    }

    return result;
  }

  private async loadRelations(rows: Array<Record<string, unknown>>): Promise<void> {
    const loader = new RelationLoader(this.table.getSql());
    await loader.load(rows, this.relationInfo, this.includes, this.counts);
  }

  omit<K2 extends readonly (keyof RowFromSchema<S> & string)[]>(
    columns: K2
  ): ZodTable<
    S,
    readonly Exclude<keyof RowFromSchema<S> & string, K2[number]>[],
    I,
    R,
    Inc,
    Sel,
    Cnt
  > {
    const shape = getShape(this.schema);
    const omitted = new Set<string>(columns);

    for (const column of omitted) {
      ensureFieldExists(shape, column, Errors.SELECT.INVALID_COLUMNS, "INVALID_COLUMNS");
    }

    // `omit` re-selects from the full schema, so it composes predictably with
    // the default projection. Use `select` when you want an inclusive subset.
    const remaining = Object.keys(shape).filter((column) => !omitted.has(column));

    const projected = this.table.select(
      remaining as unknown as (keyof RowFromSchema<S> & string)[]
    ) as unknown as Table<
      RowFromSchema<S>,
      readonly Exclude<keyof RowFromSchema<S> & string, K2[number]>[],
      I
    >;

    return this.wrap(projected);
  }

  select<K2 extends SelectKeys<RowFromSchema<S>>>(
    fields: K2
  ): ZodTable<S, K2, I, R, Inc, Sel, Cnt> {
    if (!Array.isArray(fields)) {
      throw new QueryError(Errors.SELECT.INVALID_COLUMNS(String(fields)));
    }

    const columns = fields as readonly string[];
    const shape = getShape(this.schema);

    // With a schema, "*" means "every schema column", never SELECT * — this
    // keeps unknown database columns out of the result.
    if (columns.length === 0 || (columns.length === 1 && columns[0] === "*")) {
      const keys = Object.keys(shape) as unknown as (keyof RowFromSchema<S> & string)[];
      return this.wrap(this.table.select(keys as never)) as ZodTable<S, K2, I, R, Inc, Sel, Cnt>;
    }

    for (const column of columns) {
      ensureFieldExists(shape, column, Errors.SELECT.INVALID_COLUMNS, "INVALID_COLUMNS");
    }

    return this.wrap(this.table.select(fields));
  }

  where(conditions: WhereInput<RowFromSchema<S>>): ZodTable<S, K, I, R, Inc, Sel, Cnt> {
    validateWhereInput(this.schema, conditions);
    return this.wrap(this.table.where(conditions));
  }

  /**
   * Add aliased computed SQL expressions to the projection. Terminal methods
   * on the returned query preserve relation types and add the computed fields.
   */
  selectExpr<X extends ComputedMap>(
    expressions: X
  ): ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X> {
    return new ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X>(this, expressions);
  }

  /**
   * Filter by a unique column set declared in the `unique` table option.
   * Fields and values are validated against the schema.
   */
  whereUnique(where: Partial<RowFromSchema<S>>): ZodTable<S, K, I, R, Inc, Sel, Cnt> {
    if (!isPlainObject(where)) {
      throw new QueryError(Errors.WHERE.INVALID_CONDITIONS, { code: "INVALID_WHERE" });
    }

    validateWhereObject(this.schema, where);

    return this.wrap(this.table.whereUnique(where));
  }

  /**
   * Add a raw postgres.js fragment to the WHERE clause. This bypasses schema
   * validation; only pass trusted SQL.
   */
  whereRaw(fragment: SqlFragment): ZodTable<S, K, I, R, Inc, Sel, Cnt> {
    return this.wrap(this.table.whereRaw(fragment));
  }

  orderBy(spec: SortSpec<RowFromSchema<S>>[]): ZodTable<S, K, I, R, Inc, Sel, Cnt> {
    if (!Array.isArray(spec)) {
      throw new QueryError(Errors.SELECT.INVALID_SORT_SPEC);
    }

    const shape = getShape(this.schema);
    for (const entry of spec) {
      if (!isPlainObject(entry)) {
        throw new QueryError(Errors.SELECT.INVALID_SORT_SPEC);
      }

      const { column, direction } = entry as unknown as SortSpec<RowFromSchema<S>>;
      ensureFieldExists(shape, column, Errors.SELECT.INVALID_COLUMNS, "INVALID_COLUMNS");
      if (direction !== "ASC" && direction !== "DESC") {
        throw new QueryError(Errors.WHERE.INVALID_SORT);
      }
    }

    return this.wrap(this.table.orderBy(spec));
  }

  orderByRaw(fragment: SqlFragment): ZodTable<S, K, I, R, Inc, Sel, Cnt> {
    return this.wrap(this.table.orderByRaw(fragment));
  }

  distinct(): ZodTable<S, K, I, R, Inc, Sel, Cnt> {
    return this.wrap(this.table.distinct());
  }

  distinctOnExpr(expressions: readonly SqlFragment[]): ZodTable<S, K, I, R, Inc, Sel, Cnt> {
    return this.wrap(this.table.distinctOnExpr(expressions));
  }

  for(mode: LockMode, options?: LockOptions): ZodTable<S, K, I, R, Inc, Sel, Cnt> {
    return this.wrap(this.table.for(mode, options));
  }

  distinctOn(
    columns: readonly (keyof RowFromSchema<S> & string)[]
  ): ZodTable<S, K, I, R, Inc, Sel, Cnt> {
    if (!Array.isArray(columns) || columns.length === 0) {
      throw new QueryError(Errors.SELECT.INVALID_COLUMNS(""));
    }

    const shape = getShape(this.schema);
    for (const column of columns) {
      ensureFieldExists(shape, column, Errors.SELECT.INVALID_COLUMNS, "INVALID_COLUMNS");
    }

    return this.wrap(this.table.distinctOn(columns));
  }

  cursor(value: Partial<RowFromSchema<S>>): ZodTable<S, K, I, R, Inc, Sel, Cnt> {
    if (!isPlainObject(value)) {
      throw new QueryError(Errors.SELECT.INVALID_CURSOR, { code: "INVALID_CURSOR" });
    }

    const keys = Object.keys(value);
    if (keys.length === 0) {
      throw new QueryError(Errors.SELECT.INVALID_CURSOR, { code: "INVALID_CURSOR" });
    }

    const shape = getShape(this.schema);

    for (const field of keys) {
      ensureFieldExists(shape, field, Errors.SELECT.INVALID_COLUMNS, "INVALID_COLUMNS");

      const cursorValue = value[field as keyof RowFromSchema<S>];
      if (cursorValue === undefined || cursorValue === null) {
        throw new QueryError(Errors.SELECT.INVALID_CURSOR, { code: "INVALID_CURSOR" });
      }

      const fieldSchema = shape[field];
      if (fieldSchema) {
        validateValue(field, fieldSchema, cursorValue, "cursor value");
      }
    }

    return this.wrap(this.table.cursor(value));
  }

  skip(count: number): ZodTable<S, K, I, R, Inc, Sel, Cnt> {
    return this.wrap(this.table.skip(count));
  }

  take(count: number): ZodTable<S, K, I, R, Inc, Sel, Cnt> {
    return this.wrap(this.table.take(count));
  }

  /** Inspect the current SELECT query without executing it. */
  toSQL(computed?: ComputedMap): { text: string; parameters: readonly unknown[] } {
    return this.table.toSQL(computed);
  }

  /**
   * Build a reusable prepared executor for the base SELECT. Relation includes
   * are not applied by prepared execution.
   */
  prepare(): () => Promise<Array<SelectFields<RowFromSchema<S>, K>[0]>> {
    return this.table.prepare();
  }

  async findMany<X extends Record<string, SqlExpression<unknown>> = Record<never, never>>(
    options?: ComputedOptions<X>
  ): Promise<
    Array<WithRelations<SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>, R, Inc, Sel, Cnt>>
  > {
    const prepared = this.prepareQuery();
    const rows = (await prepared.table.findMany(options)) as Array<Record<string, unknown>>;
    const enriched = await this.finalize(rows, prepared.stripKeys);
    return enriched as unknown as Array<
      WithRelations<SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>, R, Inc, Sel, Cnt>
    >;
  }

  async findFirst<X extends Record<string, SqlExpression<unknown>> = Record<never, never>>(
    options?: ComputedOptions<X>
  ): Promise<WithRelations<
    SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>,
    R,
    Inc,
    Sel,
    Cnt
  > | null> {
    const prepared = this.prepareQuery();
    const row = (await prepared.table.findFirst(options)) as Record<string, unknown> | null;
    if (!row) return null;

    const [enriched] = await this.finalize([row], prepared.stripKeys);
    return enriched as unknown as WithRelations<
      SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>,
      R,
      Inc,
      Sel,
      Cnt
    >;
  }

  async findUnique<X extends Record<string, SqlExpression<unknown>> = Record<never, never>>(
    options?: ComputedOptions<X>
  ): Promise<WithRelations<
    SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>,
    R,
    Inc,
    Sel,
    Cnt
  > | null> {
    const prepared = this.prepareQuery();
    const row = (await prepared.table.findUnique(options)) as Record<string, unknown> | null;
    if (!row) return null;

    const [enriched] = await this.finalize([row], prepared.stripKeys);
    return enriched as unknown as WithRelations<
      SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>,
      R,
      Inc,
      Sel,
      Cnt
    >;
  }

  async findFirstOrThrow<X extends Record<string, SqlExpression<unknown>> = Record<never, never>>(
    options?: ComputedOptions<X>
  ): Promise<
    WithRelations<SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>, R, Inc, Sel, Cnt>
  > {
    const row = await this.findFirst(options);
    if (!row) {
      throw new QueryError(Errors.QUERY.NO_ROWS, { code: "NO_ROWS" });
    }
    return row;
  }

  async findUniqueOrThrow<X extends Record<string, SqlExpression<unknown>> = Record<never, never>>(
    options?: ComputedOptions<X>
  ): Promise<
    WithRelations<SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>, R, Inc, Sel, Cnt>
  > {
    const row = await this.findUnique(options);
    if (!row) {
      throw new QueryError(Errors.QUERY.NO_ROWS, { code: "NO_ROWS" });
    }
    return row;
  }

  async count(): Promise<number> {
    return this.table.count();
  }

  async exists(): Promise<boolean> {
    return this.table.exists();
  }

  innerJoin<Name extends string, S2 extends ZodSchema>(
    name: Name,
    schema: S2,
    on: SqlFragment,
    options?: {
      table?: string;
      alias?: string;
      columnMap?: ColumnMap;
      columnCodecs?: ColumnCodecs;
    }
  ): ZodJoinQuery<RowFromSchema<S>, K, I, { [P in Name]: RowFromSchema<S2> }> {
    if (!isZodSchemaLike(schema)) {
      throw new QueryError(Errors.SELECT.INVALID_JOIN, { code: "INVALID_JOIN" });
    }

    return new ZodJoinQuery(
      this.table.innerJoin<Name, RowFromSchema<S2>>(name, {
        table: options?.table ?? name,
        alias: options?.alias ?? name,
        columns: Object.keys(schema.shape) as (keyof RowFromSchema<S2> & string)[],
        on,
        columnMap: options?.columnMap,
        columnCodecs: options?.columnCodecs,
      }) as JoinQuery<RowFromSchema<S>, K, I, { [P in Name]: RowFromSchema<S2> }>
    );
  }

  leftJoin<Name extends string, S2 extends ZodSchema>(
    name: Name,
    schema: S2,
    on: SqlFragment,
    options?: {
      table?: string;
      alias?: string;
      columnMap?: ColumnMap;
      columnCodecs?: ColumnCodecs;
    }
  ): ZodJoinQuery<RowFromSchema<S>, K, I, { [P in Name]: RowFromSchema<S2> | null }> {
    if (!isZodSchemaLike(schema)) {
      throw new QueryError(Errors.SELECT.INVALID_JOIN, { code: "INVALID_JOIN" });
    }

    return new ZodJoinQuery(
      this.table.leftJoin<Name, RowFromSchema<S2>>(name, {
        table: options?.table ?? name,
        alias: options?.alias ?? name,
        columns: Object.keys(schema.shape) as (keyof RowFromSchema<S2> & string)[],
        on,
        columnMap: options?.columnMap,
        columnCodecs: options?.columnCodecs,
      }) as JoinQuery<RowFromSchema<S>, K, I, { [P in Name]: RowFromSchema<S2> | null }>
    );
  }

  groupBy<
    G extends readonly (keyof RowFromSchema<S> & string)[],
    X extends ComputedMap = Record<never, never>,
  >(
    columns: G,
    aggregates?: X
  ): GroupedQuery<RowFromSchema<S>, SelectKeys<RowFromSchema<S>>, I, G, X> {
    const shape = getShape(this.schema);

    for (const column of columns) {
      ensureFieldExists(shape, column, Errors.SELECT.INVALID_COLUMNS, "INVALID_COLUMNS");
    }

    return this.table.groupBy(columns as never, aggregates) as GroupedQuery<
      RowFromSchema<S>,
      SelectKeys<RowFromSchema<S>>,
      I,
      G,
      X
    >;
  }

  groupByExpr<
    G extends Record<string, SqlExpression<unknown>>,
    X extends ComputedMap = Record<never, never>,
  >(expressions: G, aggregates?: X): GroupedExprQuery<RowFromSchema<S>, K, I, G, X> {
    return this.table.groupByExpr(expressions, aggregates);
  }

  async aggregate(options: AggregateOptions<RowFromSchema<S>>): Promise<AggregateResult> {
    if (!options || typeof options !== "object") {
      throw new QueryError(Errors.SELECT.INVALID_AGGREGATE, { code: "INVALID_AGGREGATE" });
    }

    const shape = getShape(this.schema);

    for (const key of ["countDistinct", "sum", "avg", "min", "max"] as const) {
      for (const column of options[key] ?? []) {
        ensureFieldExists(shape, column, Errors.SELECT.INVALID_COLUMNS, "INVALID_COLUMNS");
      }
    }

    return this.table.aggregate(options);
  }

  async create<X extends ComputedMap = Record<never, never>>(
    data: InsertFromSchema<S>,
    options: { onConflict: "nothing"; computed?: X }
  ): Promise<(SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>) | null>;
  async create<X extends ComputedMap = Record<never, never>>(
    data: InsertFromSchema<S>,
    options?: { computed?: X }
  ): Promise<SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>>;
  async create<X extends ComputedMap = Record<never, never>>(
    data: InsertFromSchema<S>,
    options?: { computed?: X; onConflict?: "nothing" }
  ): Promise<(SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>) | null> {
    const result = this.schema.safeParse(data);
    if (!result.success) {
      throw invalidDataError("data", getIssues(result));
    }
    return this.table.create(result.data as I, options) as Promise<
      (SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>) | null
    >;
  }

  async upsert<X extends ComputedMap = Record<never, never>>(
    options: UpsertOptions<RowFromSchema<S>, InsertFromSchema<S>> & { computed?: X }
  ): Promise<SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>> {
    if (!isPlainObject(options.where)) {
      throw new QueryError(Errors.INSERT.INVALID_CONFLICT_TARGET, { code: "CONFLICT" });
    }

    validateWhereObject(this.schema, options.where);

    const created = this.schema.safeParse(options.create);
    if (!created.success) {
      throw invalidDataError("data", getIssues(created));
    }

    let update: Partial<RowFromSchema<S>> | undefined;

    if (options.update !== undefined && Object.keys(options.update).length > 0) {
      const updated = this.schema.partial().safeParse(options.update);
      if (!updated.success) {
        throw invalidDataError("update data", getIssues(updated));
      }
      update = updated.data as Partial<RowFromSchema<S>>;
    }

    return this.table.upsert({
      where: options.where,
      create: created.data as I,
      update,
      targetWhere: options.targetWhere,
      setWhere: options.setWhere,
      computed: options.computed,
    }) as Promise<SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>>;
  }

  async createMany<X extends ComputedMap = Record<never, never>>(
    records: InsertFromSchema<S>[],
    options?: CreateManyOptions & { computed?: X }
  ): Promise<Array<SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>>> {
    if (!Array.isArray(records)) {
      throw new QueryError(Errors.INSERT.INVALID_DATA, { code: "INVALID_DATA" });
    }

    const parsed: RowFromSchema<S>[] = [];
    for (let i = 0; i < records.length; i += 1) {
      const result = this.schema.safeParse(records[i]);
      if (!result.success) {
        throw invalidDataError(`data at index ${i}`, getIssues(result));
      }
      parsed.push(result.data);
    }
    return this.table.createMany(parsed as I[], options) as Promise<
      Array<SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>>
    >;
  }

  async updateFrom<X extends ComputedMap = Record<never, never>>(
    data: UpdateData<RowFromSchema<S>>,
    from: SqlFragment,
    options?: { returning?: boolean; computed?: X }
  ): Promise<Array<SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>> | number> {
    return this.table.updateFrom(data, from, options);
  }

  async deleteUsing(
    using: SqlFragment,
    options?: { returning?: boolean }
  ): Promise<Array<SelectFields<RowFromSchema<S>, K>[0]> | number> {
    return this.table.deleteUsing(using, options);
  }

  async insertFrom<X extends ComputedMap = Record<never, never>>(
    select: SqlFragment,
    options?: {
      columns?: readonly (keyof RowFromSchema<S> & string)[];
      returning?: boolean;
      computed?: X;
    }
  ): Promise<Array<SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>> | number> {
    return this.table.insertFrom(select, options);
  }

  async update<X extends ComputedMap = Record<never, never>>(
    data: UpdateData<RowFromSchema<S>>,
    options?: { returning?: true; computed?: X }
  ): Promise<Array<SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>>>;
  async update(data: UpdateData<RowFromSchema<S>>, options: { returning: false }): Promise<number>;
  async update<X extends ComputedMap = Record<never, never>>(
    data: UpdateData<RowFromSchema<S>>,
    options?: { returning?: boolean; computed?: X }
  ): Promise<Array<SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>> | number> {
    const shape = getShape(this.schema);
    const plain: Record<string, unknown> = {};
    const fragments: Record<string, SqlFragment> = {};

    for (const [key, value] of Object.entries(data)) {
      if (isSqlFragment(value)) {
        ensureFieldExists(shape, key, Errors.WHERE.INVALID_FIELD, "INVALID_WHERE");
        fragments[key] = value;
      } else {
        plain[key] = value;
      }
    }

    const partialSchema = this.schema.partial();
    const result = partialSchema.safeParse(plain);
    if (!result.success) {
      throw invalidDataError("update data", getIssues(result));
    }
    const parsed = { ...result.data, ...fragments } as UpdateData<RowFromSchema<S>>;

    return (
      options?.returning === false
        ? this.table.update(parsed, { returning: false })
        : this.table.update(parsed, { computed: options?.computed })
    ) as Promise<Array<SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>> | number>;
  }

  async delete<X extends ComputedMap = Record<never, never>>(options?: {
    returning?: true;
    computed?: X;
  }): Promise<Array<SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>>>;
  async delete(options: { returning: false }): Promise<number>;
  async delete<X extends ComputedMap = Record<never, never>>(options?: {
    returning?: boolean;
    computed?: X;
  }): Promise<Array<SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>> | number> {
    return (
      options?.returning === false
        ? this.table.delete({ returning: false })
        : this.table.delete({ computed: options?.computed })
    ) as Promise<Array<SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>> | number>;
  }
}

/**
 * Terminal query returned by `withAggregate`. Aggregate fields are added on
 * top of the normal relation selection.
 */
export class ZodAggregatedQuery<
  S extends ZodSchema,
  K extends SelectKeys<RowFromSchema<S>>,
  I extends Row,
  R extends ZodRelations,
  Inc extends keyof R,
  Sel extends RelationSelection<R>,
  Cnt extends keyof R,
  Name extends keyof R,
  Spec extends RelationAggregate<R[Name]>,
> {
  private readonly table: ZodTable<S, K, I, R, Inc, Sel, Cnt>;
  private readonly specs: readonly AggregateSpec[];

  constructor(table: ZodTable<S, K, I, R, Inc, Sel, Cnt>, specs: readonly AggregateSpec[]) {
    this.table = table;
    this.specs = specs;
  }

  findMany(): Promise<
    Array<
      WithRelations<SelectFields<RowFromSchema<S>, K>[0], R, Inc, Sel, Cnt> &
        AggregateFields<Name & string, R[Name], Spec>
    >
  > {
    return this.table.findManyWithAggregates(this.specs) as Promise<
      Array<
        WithRelations<SelectFields<RowFromSchema<S>, K>[0], R, Inc, Sel, Cnt> &
          AggregateFields<Name & string, R[Name], Spec>
      >
    >;
  }

  async findFirst(): Promise<
    | (WithRelations<SelectFields<RowFromSchema<S>, K>[0], R, Inc, Sel, Cnt> &
        AggregateFields<Name & string, R[Name], Spec>)
    | null
  > {
    const rows = await this.table.take(1).findManyWithAggregates(this.specs);
    return (
      (rows[0] as
        | (WithRelations<SelectFields<RowFromSchema<S>, K>[0], R, Inc, Sel, Cnt> &
            AggregateFields<Name & string, R[Name], Spec>)
        | undefined) ?? null
    );
  }

  async findFirstOrThrow(): Promise<
    WithRelations<SelectFields<RowFromSchema<S>, K>[0], R, Inc, Sel, Cnt> &
      AggregateFields<Name & string, R[Name], Spec>
  > {
    const row = await this.findFirst();
    if (!row) {
      throw new QueryError(Errors.QUERY.NO_ROWS, { code: "NO_ROWS" });
    }
    return row;
  }

  count(): Promise<number> {
    return this.table.count();
  }

  exists(): Promise<boolean> {
    return this.table.exists();
  }
}

/**
 * Schema-aware narrow join query. Use it to add further joins with a schema
 * instead of a column list.
 */
export class ZodJoinQuery<
  T extends Row,
  K extends SelectKeys<T>,
  I extends Row,
  Joined extends Record<string, unknown>,
> {
  private readonly join: JoinQuery<T, K, I, Joined>;

  constructor(join: JoinQuery<T, K, I, Joined>) {
    this.join = join;
  }

  innerJoin<Name extends string, S2 extends ZodSchema>(
    name: Name,
    schema: S2,
    on: SqlFragment,
    options?: {
      table?: string;
      alias?: string;
      columnMap?: ColumnMap;
      columnCodecs?: ColumnCodecs;
    }
  ): ZodJoinQuery<T, K, I, Joined & { [P in Name]: RowFromSchema<S2> }> {
    if (!isZodSchemaLike(schema)) {
      throw new QueryError(Errors.SELECT.INVALID_JOIN, { code: "INVALID_JOIN" });
    }

    return new ZodJoinQuery(
      this.join.innerJoin<Name, RowFromSchema<S2>>(name, {
        table: options?.table ?? name,
        alias: options?.alias ?? name,
        columns: Object.keys(schema.shape) as (keyof RowFromSchema<S2> & string)[],
        on,
        columnMap: options?.columnMap,
        columnCodecs: options?.columnCodecs,
      }) as JoinQuery<T, K, I, Joined & { [P in Name]: RowFromSchema<S2> }>
    );
  }

  leftJoin<Name extends string, S2 extends ZodSchema>(
    name: Name,
    schema: S2,
    on: SqlFragment,
    options?: {
      table?: string;
      alias?: string;
      columnMap?: ColumnMap;
      columnCodecs?: ColumnCodecs;
    }
  ): ZodJoinQuery<T, K, I, Joined & { [P in Name]: RowFromSchema<S2> | null }> {
    if (!isZodSchemaLike(schema)) {
      throw new QueryError(Errors.SELECT.INVALID_JOIN, { code: "INVALID_JOIN" });
    }

    return new ZodJoinQuery(
      this.join.leftJoin<Name, RowFromSchema<S2>>(name, {
        table: options?.table ?? name,
        alias: options?.alias ?? name,
        columns: Object.keys(schema.shape) as (keyof RowFromSchema<S2> & string)[],
        on,
        columnMap: options?.columnMap,
        columnCodecs: options?.columnCodecs,
      }) as JoinQuery<T, K, I, Joined & { [P in Name]: RowFromSchema<S2> | null }>
    );
  }

  where(conditions: WhereInput<T>): ZodJoinQuery<T, K, I, Joined> {
    return new ZodJoinQuery(this.join.where(conditions));
  }

  whereRaw(fragment: SqlFragment): ZodJoinQuery<T, K, I, Joined> {
    return new ZodJoinQuery(this.join.whereRaw(fragment));
  }

  orderBy(spec: SortSpec<T>[]): ZodJoinQuery<T, K, I, Joined> {
    return new ZodJoinQuery(this.join.orderBy(spec));
  }

  orderByRaw(fragment: SqlFragment): ZodJoinQuery<T, K, I, Joined> {
    return new ZodJoinQuery(this.join.orderByRaw(fragment));
  }

  skip(count: number): ZodJoinQuery<T, K, I, Joined> {
    return new ZodJoinQuery(this.join.skip(count));
  }

  take(count: number): ZodJoinQuery<T, K, I, Joined> {
    return new ZodJoinQuery(this.join.take(count));
  }

  distinct(): ZodJoinQuery<T, K, I, Joined> {
    return new ZodJoinQuery(this.join.distinct());
  }

  distinctOn(columns: readonly (keyof T & string)[]): ZodJoinQuery<T, K, I, Joined> {
    return new ZodJoinQuery(this.join.distinctOn(columns));
  }

  distinctOnExpr(expressions: readonly SqlFragment[]): ZodJoinQuery<T, K, I, Joined> {
    return new ZodJoinQuery(this.join.distinctOnExpr(expressions));
  }

  select<K2 extends SelectKeys<T>>(fields: K2): ZodJoinQuery<T, K2, I, Joined> {
    return new ZodJoinQuery(this.join.select(fields));
  }

  findMany(): Promise<Array<SelectFields<T, K>[0] & Joined>> {
    return this.join.findMany();
  }

  findFirst(): Promise<(SelectFields<T, K>[0] & Joined) | null> {
    return this.join.findFirst();
  }

  findFirstOrThrow(): Promise<SelectFields<T, K>[0] & Joined> {
    return this.join.findFirstOrThrow();
  }
}

/**
 * Result of `ZodTable.selectExpr`: a terminal query with typed computed fields
 * and relation selections.
 */
export class ZodProjectedQuery<
  S extends ZodSchema,
  K extends SelectKeys<RowFromSchema<S>>,
  I extends Row,
  R extends ZodRelations,
  Inc extends keyof R,
  Sel extends RelationSelection<R>,
  Cnt extends keyof R,
  X extends ComputedMap,
> {
  private readonly table: ZodTable<S, K, I, R, Inc, Sel, Cnt>;
  private readonly computed: X;

  constructor(table: ZodTable<S, K, I, R, Inc, Sel, Cnt>, computed: X) {
    this.table = table;
    this.computed = computed;
  }

  /** Inspect the current SELECT query without executing it. */
  toSQL(): { text: string; parameters: readonly unknown[] } {
    return this.table.toSQL(this.computed);
  }

  findMany(): Promise<
    Array<WithRelations<SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>, R, Inc, Sel, Cnt>>
  > {
    return this.table.findMany({ computed: this.computed }) as Promise<
      Array<
        WithRelations<SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>, R, Inc, Sel, Cnt>
      >
    >;
  }

  findFirst(): Promise<WithRelations<
    SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>,
    R,
    Inc,
    Sel,
    Cnt
  > | null> {
    return this.table.findFirst({ computed: this.computed }) as Promise<WithRelations<
      SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>,
      R,
      Inc,
      Sel,
      Cnt
    > | null>;
  }

  findUnique(): Promise<WithRelations<
    SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>,
    R,
    Inc,
    Sel,
    Cnt
  > | null> {
    return this.table.findUnique({ computed: this.computed }) as Promise<WithRelations<
      SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>,
      R,
      Inc,
      Sel,
      Cnt
    > | null>;
  }

  findFirstOrThrow(): Promise<
    WithRelations<SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>, R, Inc, Sel, Cnt>
  > {
    return this.table.findFirstOrThrow({ computed: this.computed });
  }

  findUniqueOrThrow(): Promise<
    WithRelations<SelectFields<RowFromSchema<S>, K>[0] & ComputedResult<X>, R, Inc, Sel, Cnt>
  > {
    return this.table.findUniqueOrThrow({ computed: this.computed });
  }

  where(conditions: WhereInput<RowFromSchema<S>>): ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X> {
    return new ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X>(
      this.table.where(conditions),
      this.computed
    );
  }

  whereRaw(fragment: SqlFragment): ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X> {
    return new ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X>(
      this.table.whereRaw(fragment),
      this.computed
    );
  }

  whereUnique(where: Partial<RowFromSchema<S>>): ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X> {
    return new ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X>(
      this.table.whereUnique(where),
      this.computed
    );
  }

  orderBy(spec: SortSpec<RowFromSchema<S>>[]): ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X> {
    return new ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X>(
      this.table.orderBy(spec),
      this.computed
    );
  }

  orderByRaw(fragment: SqlFragment): ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X> {
    return new ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X>(
      this.table.orderByRaw(fragment),
      this.computed
    );
  }

  skip(count: number): ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X> {
    return new ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X>(
      this.table.skip(count),
      this.computed
    );
  }

  take(count: number): ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X> {
    return new ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X>(
      this.table.take(count),
      this.computed
    );
  }

  distinct(): ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X> {
    return new ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X>(
      this.table.distinct(),
      this.computed
    );
  }

  distinctOn(
    columns: readonly (keyof RowFromSchema<S> & string)[]
  ): ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X> {
    return new ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X>(
      this.table.distinctOn(columns),
      this.computed
    );
  }

  distinctOnExpr(
    expressions: readonly SqlFragment[]
  ): ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X> {
    return new ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X>(
      this.table.distinctOnExpr(expressions),
      this.computed
    );
  }

  for(mode: LockMode, options?: LockOptions): ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X> {
    return new ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X>(
      this.table.for(mode, options),
      this.computed
    );
  }

  cursor(value: Partial<RowFromSchema<S>>): ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X> {
    return new ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X>(
      this.table.cursor(value),
      this.computed
    );
  }

  select<K2 extends SelectKeys<RowFromSchema<S>>>(
    fields: K2
  ): ZodProjectedQuery<S, K2, I, R, Inc, Sel, Cnt, X> {
    return new ZodProjectedQuery<S, K2, I, R, Inc, Sel, Cnt, X>(
      this.table.select(fields),
      this.computed
    );
  }

  include<Name extends keyof R, K2 extends SelectKeys<RelationRow<R[Name]>> = ["*"]>(
    name: Name,
    refine?:
      | ((relation: RelationBuilder<R[Name]>) => RelationBuilder<R[Name], K2>)
      | RelationOptions<R[Name], K2>
  ): ZodProjectedQuery<S, K, I, R, Inc | Name, WithRelationSelection<Sel, Name, K2>, Cnt, X> {
    return new ZodProjectedQuery<
      S,
      K,
      I,
      R,
      Inc | Name,
      WithRelationSelection<Sel, Name, K2>,
      Cnt,
      X
    >(
      this.table.include(name, refine as never) as unknown as ZodTable<
        S,
        K,
        I,
        R,
        Inc | Name,
        WithRelationSelection<Sel, Name, K2>,
        Cnt
      >,
      this.computed
    );
  }

  withCount<Name extends keyof R>(
    name: Name,
    refine?: (relation: RelationBuilder<R[Name]>) => RelationBuilder<R[Name]>
  ): ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt | Name, X> {
    return new ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt | Name, X>(
      this.table.withCount(name, refine),
      this.computed
    );
  }

  whereRelated<Name extends keyof R>(
    name: Name,
    refine?: (relation: RelationFilter<R[Name]>) => RelationFilter<R[Name]>
  ): ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X> {
    return new ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X>(
      this.table.whereRelated(name, refine),
      this.computed
    );
  }

  whereMissing<Name extends keyof R>(name: Name): ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X> {
    return new ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X>(
      this.table.whereMissing(name),
      this.computed
    );
  }

  whereEvery<Name extends keyof R>(
    name: Name,
    refine?: (relation: RelationFilter<R[Name]>) => RelationFilter<R[Name]>
  ): ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X> {
    return new ZodProjectedQuery<S, K, I, R, Inc, Sel, Cnt, X>(
      this.table.whereEvery(name, refine),
      this.computed
    );
  }

  count(): Promise<number> {
    return this.table.count();
  }

  exists(): Promise<boolean> {
    return this.table.exists();
  }
}
