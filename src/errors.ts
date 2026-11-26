/**
 * Escapes control characters in user-supplied names before they are embedded
 * in an error message, so a crafted column/table name cannot forge log lines.
 */
function safeName(value: string): string {
  let escaped = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    escaped += code < 0x20 || code === 0x7f ? `\\u${code.toString(16).padStart(4, "0")}` : char;
  }
  return escaped;
}

/**
 * Collection of error messages used throughout the library.
 * These provide consistent and informative error messages for various failure conditions.
 */
export const Errors = {
  TABLE: {
    INVALID_NAME: "Invalid table name",
    INVALID_SCHEMA: "table() requires a Zod schema",
    INVALID_COLUMNS: "columns must be a non-empty array of column names",
    INVALID_ALLOWED_COLUMNS: "allowedColumns must be an array of column names",
    INVALID_MAX_TAKE: "maxTake must be a positive integer",
    INVALID_MAX_SKIP: "maxSkip must be a non-negative integer",
    INVALID_DEFAULT_TAKE: "defaultTake must be a positive integer and <= maxTake",
    INVALID_UNIQUE: "unique must be an array of non-empty column lists",
    INVALID_COLUMN_MAP: "columnMap must map schema fields to unique database columns",
    INVALID_COLUMN_CODECS: "columnCodecs must contain encode/decode functions for schema fields",
  },
  QUERY: {
    INVALID_TRANSACTION: "Invalid transaction options",
    NOT_UNIQUE: "Expected at most one record but found multiple",
    NO_ROWS: "No record found",
    INSERT_RETURNED_EMPTY: "Insert returned no rows",
  },
  INSERT: {
    INVALID_DATA: "Invalid data to insert",
    NO_COLUMNS: "No columns specified",
    INCONSISTENT_COLUMNS: "Inconsistent columns in batch insert",
    INVALID_CONFLICT_TARGET: "upsert requires at least one conflict target",
    INVALID_CONFLICT: "Invalid onConflict target or update columns",
    CONFLICT_OPTIONS: "Cannot combine skipDuplicates with onConflict",
    COLUMN_NOT_ALLOWED: (column: string) => `Column not allowed on insert: ${safeName(column)}`,
  },
  UPDATE: {
    INVALID_DATA: "Invalid data to update",
    NO_CONDITIONS: "WHERE clause required",
    NO_COLUMNS: "No columns specified",
    COLUMN_NOT_ALLOWED: (column: string) => `Column not allowed on update: ${safeName(column)}`,
  },
  DELETE: {
    NO_CONDITIONS: "WHERE clause required",
  },
  SELECT: {
    INVALID_TAKE: "Take must be > 0",
    INVALID_SKIP: "Skip must be ≥ 0",
    TAKE_EXCEEDS_MAX: (max: number) => `Take must be ≤ ${max}`,
    SKIP_EXCEEDS_MAX: (max: number) => `Skip must be ≤ ${max}`,
    INVALID_SORT_SPEC: "Sort must be an array of { column, direction }",
    INVALID_CURSOR: "Cursor must be a non-empty object of non-null column values",
    CANNOT_OMIT_STAR: "omit requires explicit columns or a `columns` option",
    INVALID_AGGREGATE: "aggregate requires at least one aggregation",
    INVALID_LOCK: "Invalid lock mode or options",
    INVALID_GROUP: "groupBy requires a non-empty array of column names and valid aggregate aliases",
    INVALID_JOIN: "join requires a valid table, non-empty columns, and an ON fragment",
    INVALID_RELATION: (name: string) => `Unknown relation: ${safeName(name)}`,
    MISSING_RELATION_KEY: (name: string) =>
      `Relation ${safeName(name)} requires its local key to be selected`,
    INVALID_COLUMNS: (cols: string) => `Invalid columns: ${safeName(cols)}`,
  },
  WHERE: {
    INVALID_CONDITIONS: "Invalid where conditions",
    INVALID_FIELD: (field: string) => `Invalid field: ${safeName(field)}`,
    INVALID_IN: (field: string) => `Invalid IN values: ${safeName(field)}`,
    INVALID_LIKE: (field: string) => `LIKE/ILIKE requires string: ${safeName(field)}`,
    INVALID_COMPARISON: (field: string, op: string) =>
      `Invalid value for ${safeName(op)}: ${safeName(field)}`,
    INVALID_SORT: "Sort must be ASC/DESC",
    UNSUPPORTED_OPERATOR: (field: string, op: string) =>
      `Unsupported operator ${safeName(op)}: ${safeName(field)}`,
    UNDEFINED_VALUE: (field: string) => `Undefined value for field: ${safeName(field)}`,
    INVALID_UNIQUE: (keys: string) =>
      `whereUnique does not match a configured unique key: ${safeName(keys)}`,
  },
} as const;

/**
 * Error thrown for table-related issues.
 *
 * This error is thrown when there are problems with table operations,
 * such as using an invalid table name.
 *
 * @example
 * ```typescript
 * try {
 *   const users = db.table("", UserSchema);  // Empty table name
 * } catch (error) {
 *   if (error instanceof TableError) {
 *     console.error("Table error:", error.message);
 *   }
 * }
 * ```
 */
export class TableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TableError";
  }
}

export type QueryErrorCode =
  | "INVALID_DATA"
  | "INCONSISTENT_COLUMNS"
  | "NO_CONDITIONS"
  | "NOT_UNIQUE"
  | "NO_ROWS"
  | "INSERT_RETURNED_EMPTY"
  | "COLUMN_NOT_ALLOWED"
  | "INVALID_TAKE"
  | "INVALID_SKIP"
  | "INVALID_CURSOR"
  | "INVALID_SORT"
  | "INVALID_TRANSACTION"
  | "INVALID_COLUMNS"
  | "INVALID_WHERE"
  | "INVALID_RELATION"
  | "INVALID_AGGREGATE"
  | "INVALID_LOCK"
  | "INVALID_GROUP"
  | "INVALID_JOIN"
  | "CONFLICT";

/**
 * Error thrown for query-related issues.
 *
 * This error is thrown when there are problems with query operations,
 * such as invalid data, missing WHERE conditions, or invalid parameters.
 *
 * @example
 * ```typescript
 * try {
 *   // Attempting to update without WHERE conditions
 *   await users.update({ status: "inactive" });
 * } catch (error) {
 *   if (error instanceof QueryError) {
 *     console.error("Query error:", error.message);
 *     // Outputs: "Query error: WHERE clause required"
 *   }
 * }
 * ```
 */
export class QueryError extends Error {
  /** Stable code for programmatic handling. */
  readonly code?: QueryErrorCode;

  constructor(message: string, options?: { code?: QueryErrorCode }) {
    super(message);
    this.name = "QueryError";
    this.code = options?.code;
  }
}
