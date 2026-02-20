import type { Row, Sql } from "postgres";
import { Errors, QueryError } from "../errors";
import type {
  WhereCondition,
  SortSpec,
  LikePattern,
  SqlOperator,
} from "../types";
import { isValidName } from "./validators";

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
  sql: Sql<{}>,
  select: (keyof T)[]
): any {
  // Handle asterisk (*) or empty selection
  if (!Array.isArray(select) || !select.length || select[0] === "*") {
    return sql`*`;
  }

  // Validate column names
  const invalidColumns = select.filter((col) => !isValidName(col));
  if (invalidColumns.length) {
    throw new QueryError(
      Errors.SELECT.INVALID_COLUMNS(invalidColumns.join(", "))
    );
  }

  // Return safe column selection
  return sql(select as string[]);
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
  sql: Sql<{}>,
  where?: WhereCondition<T>[] | Partial<T>
): any {
  if (!where) return sql``;

  if (Array.isArray(where)) {
    return createAdvancedWhereFragment(sql, where);
  } else {
    return createSimpleWhereFragment(sql, where as Partial<T>);
  }
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
  sql: Sql<{}>,
  conditions?: Partial<T>
): any {
  const entries = Object.entries(conditions ?? {});
  if (!entries.length) return sql``;

  const whereClause = entries.reduce((acc, [key, value], index) => {
    const condition =
      value === null ? sql`${sql(key)} IS NULL` : sql`${sql(key)} = ${value}`;

    return index === 0 ? condition : sql`${acc} AND ${condition}`;
  }, sql``);

  return sql`WHERE ${whereClause}`;
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
  sql: Sql<{}>,
  conditions: WhereCondition<T>[]
): any {
  if (!conditions?.length) return sql``;

  const whereClause = conditions.reduce((acc, condition, index) => {
    const fragment = createConditionFragment(
      sql,
      condition.field as string,
      condition.operator,
      condition.value,
      "pattern" in condition ? condition.pattern : undefined
    );

    return index === 0 ? fragment : sql`${acc} AND ${fragment}`;
  }, sql``);

  return sql`WHERE ${whereClause}`;
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
  sql: Sql<{}>,
  field: string,
  operator: SqlOperator,
  value: any,
  pattern?: LikePattern
): any {
  if (operator === "IS NULL") {
    return sql`${sql(field)} IS NULL`;
  }

  if (operator === "IS NOT NULL") {
    return sql`${sql(field)} IS NOT NULL`;
  }

  if (operator === "IN") {
    if (!Array.isArray(value) || !value.length) {
      throw new QueryError(Errors.WHERE.INVALID_IN(field));
    }
    return sql`${sql(field)} = ANY(${value})`;
  }

  // LIKE operators
  if (operator === "LIKE" || operator === "ILIKE") {
    return createLikeCondition(sql, field, operator, value, pattern);
  }

  // Comparison operators
  if (["=", "!=", ">", "<", ">=", "<="].includes(operator)) {
    if (value == null) {
      throw new QueryError(Errors.WHERE.INVALID_COMPARISON(field, operator));
    }
    return sql`${sql(field)} ${sql.unsafe(operator)} ${value}`;
  }

  throw new QueryError(Errors.WHERE.UNSUPPORTED_OPERATOR(field, operator));
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
  sql: Sql<{}>,
  field: string,
  operator: SqlOperator,
  value: any,
  pattern?: LikePattern
): any {
  if (typeof value !== "string") {
    throw new QueryError(Errors.WHERE.INVALID_LIKE(field));
  }

  // If the user has already included % or _ wildcards, use as-is
  if (value.includes("%") || value.includes("_")) {
    return sql`${sql(field)} ${sql.unsafe(operator)} ${value}`;
  }

  // Otherwise, escape special characters and apply pattern
  const escapedValue = value.replace(/[%_\\]/g, (char) => `\\${char}`);
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
  const patterns = {
    startsWith: () => value + "%",
    endsWith: () => "%" + value,
    contains: () => "%" + value + "%",
    exact: () => value,
    default: () => value,
  };

  return (pattern ? patterns[pattern] : patterns.default)();
}

/**
 * Creates ORDER BY clause
 * @param sql SQL tag template
 * @param orderBy Sort specifications
 * @returns SQL fragment for ORDER BY
 * @throws {QueryError} If direction is invalid
 */
export function createSortFragment<T extends Row>(
  sql: Sql<{}>,
  orderBy?: SortSpec<T>[]
): any {
  if (!orderBy?.length) return sql``;

  const sortClause = orderBy.reduce((acc, { column, direction }, index) => {
    // Validate sort direction
    if (!["ASC", "DESC"].includes(direction)) {
      throw new QueryError(Errors.WHERE.INVALID_SORT);
    }

    // Validate column name
    if (!column || typeof column !== "string" || !column.trim()) {
      throw new QueryError(Errors.SELECT.INVALID_COLUMNS(String(column)));
    }

    const sortFragment = sql`${sql(column as string)} ${sql.unsafe(direction)}`;

    return index === 0 ? sortFragment : sql`${acc}, ${sortFragment}`;
  }, sql``);

  return sql`ORDER BY ${sortClause}`;
}

/**
 * Creates LIMIT/OFFSET clause for pagination
 * @param sql SQL tag template
 * @param take Number of rows to take (limit)
 * @param skip Number of rows to skip (offset)
 * @returns SQL fragment for LIMIT/OFFSET
 */
export function createLimitFragment(
  sql: Sql<{}>,
  take?: number,
  skip?: number
): any {
  // No pagination parameters provided
  if (!take && !skip) return sql``;

  // Both limit and offset provided
  if (take && skip) return sql`LIMIT ${take} OFFSET ${skip}`;

  // Only limit (take) provided
  if (take) return sql`LIMIT ${take}`;

  // Only offset (skip) provided
  return sql`OFFSET ${skip}`;
}
