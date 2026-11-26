import type { Row, Sql } from "postgres";
import { Errors, QueryError } from "../errors";
import { getPredicateNode, isPredicate, type Predicate, type WhereInput } from "../predicates";
import type {
  ColumnCodecs,
  LikePattern,
  SelectKeys,
  SortSpec,
  SqlFragment,
  SqlOperator,
  WhereCondition,
} from "../types";
import { isValidIdentifier, isValidName } from "./validators";

type NameOptions = {
  strictNames?: boolean;
  allowSchema?: boolean;
  columnMap?: Readonly<Record<string, string>>;
  columnCodecs?: ColumnCodecs;
};

function encodeValue(field: string, value: unknown, options?: NameOptions): unknown {
  const encode = options?.columnCodecs?.[field]?.encode;
  return encode ? encode(value) : value;
}
type IdentifierKind = "select" | "where";

function normalizeIdentifier(
  value: unknown,
  options?: NameOptions,
  kind: IdentifierKind = "select"
): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    const msg =
      kind === "where"
        ? Errors.WHERE.INVALID_FIELD(String(value))
        : Errors.SELECT.INVALID_COLUMNS(String(value));
    throw new QueryError(msg, { code: kind === "where" ? "INVALID_WHERE" : "INVALID_COLUMNS" });
  }

  const isValid = options?.strictNames
    ? isValidIdentifier(trimmed, { allowSchema: options?.allowSchema })
    : // Even without strict name validation, dotted names are schema-qualified
      // identifiers (postgres.js splits on "."), so reject them unless the
      // caller opted in to schema-qualified names.
      isValidName(trimmed) && (options?.allowSchema !== false || !trimmed.includes("."));

  if (!isValid) {
    const msg =
      kind === "where"
        ? Errors.WHERE.INVALID_FIELD(trimmed)
        : Errors.SELECT.INVALID_COLUMNS(trimmed);
    throw new QueryError(msg, { code: kind === "where" ? "INVALID_WHERE" : "INVALID_COLUMNS" });
  }

  return options?.columnMap?.[trimmed] ?? trimmed;
}

/**
 * Builds a SQL-safe column list for SELECT statements.
 *
 * This function handles both "*" (all columns) and specific column selections.
 * It validates column names and returns a properly formatted SQL fragment.
 *
 * @param sql - The postgres.js SQL tag template instance
 * @param select - Array of column names to select
 * @returns SQL fragment for the SELECT clause
 * @throws {QueryError} If any column name is invalid
 *
 * @example
 * ```typescript
 * // Select all columns
 * buildSelect(sql, ["*"]);       // Returns: *
 *
 * // Select specific columns
 * buildSelect(sql, ["id", "name", "email"]);
 * // Returns: "id", "name", "email"
 *
 * // Invalid column names will throw
 * buildSelect(sql, ["id", ""]);  // Throws: Invalid columns: ""
 * ```
 */
export function buildSelect<T extends Row>(
  sql: Sql<Record<string, unknown>>,
  select: SelectKeys<T>,
  options?: NameOptions
): SqlFragment {
  // Handle asterisk (*) or empty selection
  if (!Array.isArray(select) || !select.length || select[0] === "*") {
    return sql`*`;
  }

  const columns = (select as string[]).map((col) => normalizeIdentifier(col, options, "select"));

  // Return safe column selection
  return sql(columns) as unknown as SqlFragment;
}

/**
 * Builds WHERE conditions supporting both simple and advanced formats.
 *
 * This function handles two types of WHERE conditions:
 * 1. Simple equality conditions (object with field-value pairs)
 * 2. Advanced conditions with operators (array of WhereCondition objects)
 *
 * @param sql - The postgres.js SQL tag template instance
 * @param where - The WHERE conditions to build
 * @returns SQL fragment for the WHERE clause
 *
 * @example
 * ```typescript
 * // Simple equality conditions
 * buildWhereConditions(sql, { status: "active", type: "user" });
 * // Produces: WHERE "status" = 'active' AND "type" = 'user'
 *
 * // Advanced conditions with operators
 * buildWhereConditions(sql, [
 *   { field: "status", operator: "=", value: "active" },
 *   { field: "created_at", operator: ">", value: new Date("2023-01-01") }
 * ]);
 * // Produces: WHERE "status" = 'active' AND "created_at" > '2023-01-01T00:00:00.000Z'
 * ```
 */
export function buildWhereConditions<T extends Row>(
  sql: Sql<Record<string, unknown>>,
  where?: WhereInput<T>,
  options?: NameOptions
): SqlFragment {
  if (!where) return sql``;

  const expression = buildWhereInputExpression(sql, where, options);
  return expression ? sql`WHERE ${expression}` : sql``;
}

/**
 * Builds a single WHERE clause from one or more inputs, joining them with
 * `AND`. Used by `Table` so repeated `.where()` calls compose instead of
 * replacing each other.
 */
export function buildWhereExpression<T extends Row>(
  sql: Sql<Record<string, unknown>>,
  inputs: readonly WhereInput<T>[],
  options?: NameOptions
): SqlFragment | null {
  const fragments = inputs
    .map((input) => buildWhereInputExpression(sql, input, options))
    .filter((fragment): fragment is SqlFragment => fragment !== null);

  if (!fragments.length) return null;

  return fragments.reduce(
    (acc, fragment, index) => (index === 0 ? fragment : sql`${acc} AND ${fragment}`),
    sql``
  );
}

export function buildWhereInputs<T extends Row>(
  sql: Sql<Record<string, unknown>>,
  inputs: readonly WhereInput<T>[],
  options?: NameOptions
): SqlFragment {
  const expression = buildWhereExpression(sql, inputs, options);
  return expression ? sql`WHERE ${expression}` : sql``;
}

function buildWhereInputExpression<T extends Row>(
  sql: Sql<Record<string, unknown>>,
  input: WhereInput<T>,
  options?: NameOptions
): SqlFragment | null {
  if (isPredicate(input)) {
    return buildPredicate(sql, input as Predicate<T>, options);
  }

  if (Array.isArray(input)) {
    if (!input.length) return null;
    return advancedWhereExpression(sql, input, options);
  }

  return simpleWhereExpression(sql, input as Partial<T>, options);
}

function buildPredicate<T extends Row>(
  sql: Sql<Record<string, unknown>>,
  predicate: Predicate<T>,
  options?: NameOptions
): SqlFragment {
  const node = getPredicateNode(predicate);

  switch (node.type) {
    case "comparison": {
      if (node.value === null || node.value === undefined) {
        throw new QueryError(Errors.WHERE.INVALID_COMPARISON(node.field, node.operator), {
          code: "INVALID_WHERE",
        });
      }
      const field = normalizeIdentifier(node.field, options, "where");
      const value = encodeValue(node.field, node.value, options);
      return sql`${sql(field)} ${sql.unsafe(node.operator)} ${value}`;
    }

    case "in": {
      if (!Array.isArray(node.values) || node.values.length === 0) {
        throw new QueryError(Errors.WHERE.INVALID_IN(node.field), { code: "INVALID_WHERE" });
      }
      const field = normalizeIdentifier(node.field, options, "where");
      const values = node.values.map((value) => encodeValue(node.field, value, options));
      return node.negated
        ? sql`${sql(field)} <> ALL(${values})`
        : sql`${sql(field)} = ANY(${values})`;
    }

    case "null": {
      const field = normalizeIdentifier(node.field, options, "where");
      return node.negated ? sql`${sql(field)} IS NOT NULL` : sql`${sql(field)} IS NULL`;
    }

    case "like": {
      const field = normalizeIdentifier(node.field, options, "where");
      const value = encodeValue(node.field, node.value, options);
      return sql`${sql(field)} ${sql.unsafe(node.operator)} ${value}`;
    }

    case "stringPattern": {
      const field = normalizeIdentifier(node.field, options, "where");
      const encoded = encodeValue(node.field, node.value, options);
      if (typeof encoded !== "string") {
        throw new QueryError(Errors.WHERE.INVALID_LIKE(node.field), { code: "INVALID_WHERE" });
      }
      const escaped = escapeLikeValue(encoded);
      const pattern = getLikePattern(escaped, node.pattern);
      return sql`${sql(field)} LIKE ${pattern}`;
    }

    case "operator": {
      const field = normalizeIdentifier(node.field, options, "where");
      const value = encodeValue(node.field, node.value, options);
      return sql`${sql(field)} ${sql.unsafe(node.operator)} ${value}`;
    }

    case "between": {
      if (
        node.low === null ||
        node.low === undefined ||
        node.high === null ||
        node.high === undefined
      ) {
        throw new QueryError(Errors.WHERE.INVALID_COMPARISON(node.field, "BETWEEN"), {
          code: "INVALID_WHERE",
        });
      }
      const field = normalizeIdentifier(node.field, options, "where");
      const operator = node.negated ? sql`NOT BETWEEN` : sql`BETWEEN`;
      const low = encodeValue(node.field, node.low, options);
      const high = encodeValue(node.field, node.high, options);
      return sql`${sql(field)} ${operator} ${low} AND ${high}`;
    }

    case "and":
    case "or": {
      if (node.predicates.length === 0) {
        throw new QueryError(Errors.WHERE.INVALID_CONDITIONS, { code: "INVALID_WHERE" });
      }
      const separator = node.type === "and" ? sql` AND ` : sql` OR `;
      const combined = node.predicates
        .map((inner) => buildPredicate(sql, inner, options))
        .reduce(
          (acc, fragment, index) => (index === 0 ? fragment : sql`${acc} ${separator} ${fragment}`),
          sql``
        );
      return sql`(${combined})`;
    }

    case "not": {
      return sql`NOT (${buildPredicate(sql, node.predicate, options)})`;
    }

    case "raw": {
      return node.fragment;
    }
  }
}

function escapeLikeValue(value: string): string {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`);
}

function simpleWhereExpression<T extends Row>(
  sql: Sql<Record<string, unknown>>,
  conditions?: Partial<T>,
  options?: NameOptions
): SqlFragment | null {
  const entries = Object.entries(conditions ?? {});
  if (!entries.length) return null;

  return entries.reduce((acc, [key, value], index) => {
    const normalizedKey = normalizeIdentifier(key, options, "where");
    if (value === undefined) {
      throw new QueryError(Errors.WHERE.UNDEFINED_VALUE(key), { code: "INVALID_WHERE" });
    }
    const encoded = value === null ? value : encodeValue(key, value, options);
    const condition =
      encoded === null
        ? sql`${sql(normalizedKey)} IS NULL`
        : sql`${sql(normalizedKey)} = ${encoded}`;

    return index === 0 ? condition : sql`${acc} AND ${condition}`;
  }, sql``);
}

function advancedWhereExpression<T extends Row>(
  sql: Sql<Record<string, unknown>>,
  conditions: WhereCondition<T>[],
  options?: NameOptions
): SqlFragment {
  return conditions.reduce((acc, condition, index) => {
    const normalizedField = normalizeIdentifier(condition.field, options, "where");
    const fragment = createConditionFragment(
      sql,
      normalizedField,
      condition.operator,
      condition.value,
      "pattern" in condition ? condition.pattern : undefined,
      options,
      String(condition.field)
    );

    return index === 0 ? fragment : sql`${acc} AND ${fragment}`;
  }, sql``);
}

/**
 * Creates WHERE clause for simple equality conditions.
 *
 * This function generates SQL for simple field = value conditions,
 * joined with AND operators. It also handles NULL values correctly
 * by using IS NULL instead of = NULL.
 *
 * @param sql - The postgres.js SQL tag template instance
 * @param conditions - Object with field-value pairs for equality checks
 * @returns SQL fragment for the WHERE clause
 *
 * @example
 * ```typescript
 * // Simple conditions
 * createSimpleWhereFragment(sql, { id: 123, status: "active" });
 * // Produces: WHERE "id" = 123 AND "status" = 'active'
 *
 * // With NULL value
 * createSimpleWhereFragment(sql, { id: 123, deleted_at: null });
 * // Produces: WHERE "id" = 123 AND "deleted_at" IS NULL
 * ```
 */
export function createSimpleWhereFragment<T extends Row>(
  sql: Sql<Record<string, unknown>>,
  conditions?: Partial<T>,
  options?: NameOptions
): SqlFragment {
  const expression = simpleWhereExpression(sql, conditions, options);
  return expression ? sql`WHERE ${expression}` : sql``;
}

/**
 * Creates WHERE clause for advanced conditions with operators.
 *
 * This function generates SQL for complex conditions with various operators
 * like =, >, <, LIKE, IN, IS NULL, etc. Conditions are joined with AND.
 *
 * @param sql - The postgres.js SQL tag template instance
 * @param conditions - Array of WhereCondition objects with operators
 * @returns SQL fragment for the WHERE clause
 *
 * @example
 * ```typescript
 * // Advanced conditions with different operators
 * createAdvancedWhereFragment(sql, [
 *   { field: "status", operator: "=", value: "active" },
 *   { field: "age", operator: ">", value: 18 },
 *   { field: "name", operator: "LIKE", value: "John", pattern: "startsWith" },
 *   { field: "role", operator: "IN", value: ["admin", "editor"] },
 *   { field: "deleted_at", operator: "IS NULL" }
 * ]);
 * // Produces complex WHERE clause with AND between conditions
 * ```
 */
export function createAdvancedWhereFragment<T extends Row>(
  sql: Sql<Record<string, unknown>>,
  conditions: WhereCondition<T>[],
  options?: NameOptions
): SqlFragment {
  if (!conditions?.length) return sql``;

  const expression = advancedWhereExpression(sql, conditions, options);
  return sql`WHERE ${expression}`;
}

/**
 * Creates SQL condition based on operator type
 * @param sql SQL tag template
 * @param field Column name
 * @param operator SQL operator
 * @param value Comparison value
 * @param pattern Optional pattern for LIKE operators
 * @returns SQL fragment for condition
 * @throws {QueryError} If operator or value is invalid
 */
export function createConditionFragment(
  sql: Sql<Record<string, unknown>>,
  field: string,
  operator: SqlOperator,
  value: unknown,
  pattern?: LikePattern,
  options?: NameOptions,
  sourceField?: string
): SqlFragment {
  if (operator === "IS NULL") {
    return sql`${sql(field)} IS NULL`;
  }

  if (operator === "IS NOT NULL") {
    return sql`${sql(field)} IS NOT NULL`;
  }

  if (operator === "IN") {
    if (!Array.isArray(value) || !value.length) {
      throw new QueryError(Errors.WHERE.INVALID_IN(field), { code: "INVALID_WHERE" });
    }
    const values = sourceField
      ? value.map((entry) => encodeValue(sourceField, entry, options))
      : value;
    return sql`${sql(field)} = ANY(${values})`;
  }

  const encoded = sourceField ? encodeValue(sourceField, value, options) : value;

  // LIKE operators
  if (operator === "LIKE" || operator === "ILIKE") {
    return createLikeCondition(sql, field, operator, encoded, pattern);
  }

  // Comparison operators
  if (["=", "!=", ">", "<", ">=", "<="].includes(operator)) {
    if (encoded == null) {
      throw new QueryError(Errors.WHERE.INVALID_COMPARISON(field, operator), {
        code: "INVALID_WHERE",
      });
    }
    return sql`${sql(field)} ${sql.unsafe(operator)} ${encoded}`;
  }

  throw new QueryError(Errors.WHERE.UNSUPPORTED_OPERATOR(field, operator), {
    code: "INVALID_WHERE",
  });
}

/**
 * Creates SQL LIKE condition based on operator type
 * @param sql SQL tag template
 * @param field Column name
 * @param operator SQL operator
 * @param value Comparison value
 * @param pattern Optional pattern for LIKE operators
 * @returns SQL fragment for the LIKE operation
 * @throws {QueryError} If operator or value is invalid
 */
export function createLikeCondition(
  sql: Sql<Record<string, unknown>>,
  field: string,
  operator: SqlOperator,
  value: unknown,
  pattern?: LikePattern
): SqlFragment {
  if (typeof value !== "string") {
    throw new QueryError(Errors.WHERE.INVALID_LIKE(field), { code: "INVALID_WHERE" });
  }

  // Always escape special LIKE characters to prevent unintended wildcard injection.
  // Use the `pattern` option to control wildcard placement explicitly.
  const escapedValue = escapeLikeValue(value);
  const likePattern = getLikePattern(escapedValue, pattern);

  return sql`${sql(field)} ${sql.unsafe(operator)} ${likePattern}`;
}

/**
 * Generates LIKE pattern based on pattern type
 * @param value Escaped value
 * @param pattern Pattern type
 * @returns Formatted LIKE pattern
 *
 * Patterns:
 * - startsWith: Matches strings that begin with the value (value%)
 * - endsWith: Matches strings that end with the value (%value)
 * - contains: Matches strings that contain the value anywhere (%value%)
 * - exact: Matches strings exactly equal to the value (value)
 * - default: Same as exact if no pattern specified
 */
export function getLikePattern(value: string, pattern?: LikePattern): string {
  // Use a switch rather than an object lookup so inherited keys such as
  // "constructor" or "__proto__" can never resolve to a prototype member.
  switch (pattern) {
    case "startsWith":
      return `${value}%`;
    case "endsWith":
      return `%${value}`;
    case "contains":
      return `%${value}%`;
    default:
      return value;
  }
}

/**
 * Creates ORDER BY clause
 * @param sql SQL tag template
 * @param orderBy Sort specifications
 * @returns SQL fragment for ORDER BY
 * @throws {QueryError} If direction is invalid
 */
export function createSortExpression<T extends Row>(
  sql: Sql<Record<string, unknown>>,
  orderBy?: SortSpec<T>[],
  options?: NameOptions
): SqlFragment {
  if (!orderBy?.length) return sql``;

  return orderBy.reduce((acc, { column, direction, nulls }, index) => {
    // Validate sort direction
    if (!["ASC", "DESC"].includes(direction)) {
      throw new QueryError(Errors.WHERE.INVALID_SORT, { code: "INVALID_SORT" });
    }

    if (nulls !== undefined && nulls !== "first" && nulls !== "last") {
      throw new QueryError(Errors.WHERE.INVALID_SORT, { code: "INVALID_SORT" });
    }

    // Validate column name
    const normalizedColumn = normalizeIdentifier(column, options, "select");
    const base = sql`${sql(normalizedColumn)} ${sql.unsafe(direction)}`;
    const sortFragment = nulls ? sql`${base} NULLS ${sql.unsafe(nulls.toUpperCase())}` : base;

    return index === 0 ? sortFragment : sql`${acc}, ${sortFragment}`;
  }, sql``);
}

export function createSortFragment<T extends Row>(
  sql: Sql<Record<string, unknown>>,
  orderBy?: SortSpec<T>[],
  options?: NameOptions
): SqlFragment {
  if (!orderBy?.length) return sql``;
  return sql`ORDER BY ${createSortExpression(sql, orderBy, options)}`;
}

/**
 * Creates LIMIT/OFFSET clause for pagination
 * @param sql SQL tag template
 * @param take Number of rows to take (limit)
 * @param skip Number of rows to skip (offset)
 * @returns SQL fragment for LIMIT/OFFSET
 */
export function createLimitFragment(
  sql: Sql<Record<string, unknown>>,
  take?: number,
  skip?: number
): SqlFragment {
  // No pagination parameters provided
  if (take === undefined && skip === undefined) return sql``;

  // Both limit and offset provided
  if (take !== undefined && skip !== undefined) {
    return sql`LIMIT ${take} OFFSET ${skip}`;
  }

  // Only limit (take) provided
  if (take !== undefined) return sql`LIMIT ${take}`;

  // Only offset (skip) provided
  return sql`OFFSET ${skip as number}`;
}
