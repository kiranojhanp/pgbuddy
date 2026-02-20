/**
 * Collection of error messages used throughout the library.
 * These provide consistent and informative error messages for various failure conditions.
 */
export const Errors = {
  TABLE: {
    INVALID_NAME: "Invalid table name",
  },
  INSERT: {
    INVALID_DATA: "Invalid data to insert",
    NO_COLUMNS: "No columns specified",
    INCONSISTENT_COLUMNS: "Inconsistent columns in batch insert",
  },
  UPDATE: {
    INVALID_DATA: "Invalid data to update",
    NO_CONDITIONS: "WHERE clause required",
    NO_COLUMNS: "No columns specified",
  },
  DELETE: {
    NO_CONDITIONS: "WHERE clause required",
  },
  SELECT: {
    INVALID_TAKE: "Take must be > 0",
    INVALID_SKIP: "Skip must be ≥ 0",
    INVALID_COLUMNS: (cols: string) => `Invalid columns: ${cols}`,
  },
  WHERE: {
    INVALID_IN: (field: string) => `Invalid IN values: ${field}`,
    INVALID_LIKE: (field: string) => `LIKE/ILIKE requires string: ${field}`,
    INVALID_COMPARISON: (field: string, op: string) =>
      `Invalid value for ${op}: ${field}`,
    INVALID_SORT: "Sort must be ASC/DESC",
    UNSUPPORTED_OPERATOR: (field: string, op: string) =>
      `Unsupported operator ${op}: ${field}`,
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
 *   const users = db.table<User>("");  // Empty table name
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
  constructor(message: string) {
    super(message);
    this.name = "QueryError";
  }
}
