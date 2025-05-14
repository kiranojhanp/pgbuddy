import type { Row } from "postgres";

/**
 * Base parameters for all database operations.
 * These properties can be used with any query type.
 */
export interface BaseParams<T extends Row> {
  /**
   * Enable debug logging for this operation.
   * When enabled, queries will output debugging information.
   */
  debug?: boolean;
  /**
   * Columns to return in query result.
   * If not specified, all columns will be returned.
   */
  select?: (keyof T)[];
}

/**
 * Supported SQL comparison operators for WHERE conditions.
 *
 * These operators can be used in WhereCondition objects to build advanced queries.
 *
 * @example
 * ```typescript
 * // Using equality operator
 * { field: "status", operator: "=", value: "active" }
 *
 * // Using comparison operator
 * { field: "age", operator: ">", value: 18 }
 *
 * // Using pattern matching
 * { field: "name", operator: "LIKE", value: "John", pattern: "startsWith" }
 *
 * // Using NULL check
 * { field: "deletedAt", operator: "IS NULL" }
 * ```
 */
export type SqlOperator =
  | "="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "LIKE"
  | "ILIKE"
  | "IN"
  | "IS NULL"
  | "IS NOT NULL";

/**
 * Pattern types for LIKE/ILIKE operators.
 *
 * These patterns control how string matching behaves with LIKE/ILIKE operators:
 * - `startsWith`: Matches strings that start with the value (adds % at end)
 * - `endsWith`: Matches strings that end with the value (adds % at beginning)
 * - `contains`: Matches strings that contain the value (adds % at both ends)
 * - `exact`: Uses the value exactly as provided with no automatic wildcards
 *
 * @example
 * ```typescript
 * // Find names starting with "Jo"
 * { field: "name", operator: "LIKE", value: "Jo", pattern: "startsWith" }
 * // Translates to: name LIKE 'Jo%'
 *
 * // Find names ending with "son"
 * { field: "name", operator: "LIKE", value: "son", pattern: "endsWith" }
 * // Translates to: name LIKE '%son'
 *
 * // Find names containing "oh"
 * { field: "name", operator: "LIKE", value: "oh", pattern: "contains" }
 * // Translates to: name LIKE '%oh%'
 * ```
 */
export type LikePattern = "startsWith" | "endsWith" | "contains" | "exact";

/**
 * Sort direction for ORDER BY clauses.
 *
 * - `ASC`: Ascending order (A to Z, 0 to 9, oldest to newest)
 * - `DESC`: Descending order (Z to A, 9 to 0, newest to oldest)
 */
export type SortDirection = "ASC" | "DESC";

/**
 * Condition for WHERE clauses with type-safe field references.
 * Supports comparison, pattern matching, IN lists, and NULL checks.
 *
 * This type provides a flexible way to build complex WHERE conditions
 * with proper type checking for field names and values.
 *
 * @template T The table row type containing field definitions
 *
 * @example
 * ```typescript
 * // Equality comparison
 * const condition1: WhereCondition<User> = {
 *   field: "status",
 *   operator: "=",
 *   value: "active"
 * };
 *
 * // Date comparison
 * const condition2: WhereCondition<User> = {
 *   field: "created_at",
 *   operator: ">",
 *   value: new Date("2023-01-01")
 * };
 *
 * // Pattern matching (case insensitive)
 * const condition3: WhereCondition<User> = {
 *   field: "name",
 *   operator: "ILIKE",
 *   value: "john",
 *   pattern: "contains"
 * };
 *
 * // IN list for multiple possible values
 * const condition4: WhereCondition<User> = {
 *   field: "status",
 *   operator: "IN",
 *   value: ["active", "pending"]
 * };
 *
 * // NULL check
 * const condition5: WhereCondition<User> = {
 *   field: "deleted_at",
 *   operator: "IS NULL"
 * };
 * ```
 */
export type WhereCondition<T> = {
  field: keyof T;
} & (
  | {
      operator: "=" | "!=" | ">" | "<" | ">=" | "<=";
      value: string | number | boolean | Date;
    }
  | {
      operator: "LIKE" | "ILIKE";
      value: string;
      pattern?: LikePattern;
    }
  | { operator: "IN"; value: Array<string | number | boolean | Date> }
  | { operator: "IS NULL" | "IS NOT NULL"; value?: never }
);

/**
 * Sort specification for ORDER BY clauses.
 *
 * @template T The table row type containing field definitions
 *
 * @example
 * ```typescript
 * // Sort by creation date (newest first)
 * const sort1: SortSpec<User> = {
 *   column: "created_at",
 *   direction: "DESC"
 * };
 *
 * // Sort by name (alphabetical)
 * const sort2: SortSpec<User> = {
 *   column: "name",
 *   direction: "ASC"
 * };
 *
 * // Multiple sort criteria
 * const sortCriteria: SortSpec<User>[] = [
 *   { column: "status", direction: "ASC" },
 *   { column: "created_at", direction: "DESC" }
 * ];
 * ```
 */
export interface SortSpec<T extends Row> {
  /** The column name to sort by */
  column: keyof T & string;
  /** The sort direction (ASC or DESC) */
  direction: SortDirection;
}

/**
 * Parameters for SELECT queries with filtering, sorting and pagination.
 *
 * @template T The table row type containing field definitions
 * @template K The array of fields to select (defaults to all fields)
 *
 * @example
 * ```typescript
 * // Example select parameters for User table
 * const params: SelectParams<User> = {
 *   // Select only specific fields
 *   select: ["id", "name", "email"],
 *
 *   // Where conditions (advanced)
 *   where: [
 *     { field: "status", operator: "=", value: "active" },
 *     { field: "created_at", operator: ">", value: new Date("2023-01-01") }
 *   ],
 *
 *   // Pagination
 *   skip: 10,
 *   take: 5,
 *
 *   // Sorting
 *   orderBy: [
 *     { column: "created_at", direction: "DESC" }
 *   ]
 * };
 * ```
 */
export interface SelectParams<
  T extends Row,
  K extends (keyof T)[] = (keyof T)[]
> extends BaseParams<T> {
  /**
   * Advanced or simple WHERE conditions to filter records.
   * Can be an object with field-value pairs for equality checks,
   * or an array of WhereCondition objects for advanced filtering.
   */
  where?: WhereCondition<T>[] | Partial<T>;

  /**
   * Columns to return in the result.
   * If not specified, all columns will be returned.
   */
  select?: K;

  /**
   * Number of rows to skip (for pagination).
   * Must be a non-negative integer.
   */
  skip?: number;

  /**
   * Number of rows to take (for pagination).
   * Must be a positive integer.
   */
  take?: number;

  /**
   * Sort specification for ordering results.
   * An array of column and direction pairs.
   */
  orderBy?: SortSpec<T>[];
}

/**
 * Utility type to pick specific fields from a given type.
 *
 * @template T - The source type from which fields will be picked.
 * @template K - An array of keys (field names) to pick from the source type.
 *
 * @example
 * type User = { id: number; name: string; age: number };
 * type UserPick = PickFields<User, ['id', 'name']>; // { id: number; name: string; }
 */
export type PickFields<T, K extends readonly (keyof T)[]> = {
  [P in K[number]]: T[P];
};

/**
 * Selects fields from type `T` based on keys in `K`. If `K` includes `"*"`, selects all fields.
 *
 * @template T - The type to select fields from (must extend `Row`).
 * @template K - Keys to select (or `"*"` for all fields).
 * @returns {T[] | PickFields<T, K>[]} - Array of `T` or objects with selected fields.
 *
 * @example
 * type User = { id: number; name: string; age: number };
 * type FullUsers = SelectFields<User, ["*"]>; // User[]
 * type PartialUsers = SelectFields<User, ["id", "name"]>; // { id: number; name: string }[]
 */
export type SelectFields<T, K extends readonly (keyof T)[]> = K extends ["*"]
  ? T[]
  : PickFields<T, K>[];

/**
 * Parameters for INSERT queries to add new records.
 *
 * @template T The table row type containing field definitions
 * @template K The array of fields to return (defaults to all fields)
 *
 * @example
 * ```typescript
 * // Insert a single user
 * const insertParams: InsertParams<User> = {
 *   data: {
 *     name: "John Doe",
 *     email: "john@example.com",
 *     status: "active",
 *     created_at: new Date()
 *   },
 *   select: ["id", "email"] // Only return these fields
 * };
 *
 * // Insert multiple users
 * const batchInsertParams: InsertParams<User> = {
 *   data: [
 *     {
 *       name: "John Doe",
 *       email: "john@example.com",
 *       status: "active"
 *     },
 *     {
 *       name: "Jane Smith",
 *       email: "jane@example.com",
 *       status: "inactive"
 *     }
 *   ]
 * };
 * ```
 */
export interface InsertParams<T extends Row, K extends (keyof T)[] = ["*"]>
  extends BaseParams<T> {
  /**
   * Single record or array of records to insert.
   * Required parameter for all insert operations.
   */
  data: Partial<T> | Partial<T>[];

  /**
   * Columns to return from the inserted record(s).
   * Defaults to all columns.
   */
  select?: K;
}

/**
 * Parameters for UPDATE and DELETE queries to modify existing records.
 *
 * @template T The table row type containing field definitions
 * @template K The array of fields to return (defaults to all fields)
 *
 * @example
 * ```typescript
 * // Update a user's status
 * const updateParams: ModifyParams<User> = {
 *   where: { id: 123 }, // Target specific user by ID
 *   data: {
 *     status: "inactive",
 *     updated_at: new Date()
 *   },
 *   select: ["id", "status"] // Only return these fields
 * };
 *
 * // Delete users with advanced conditions
 * const deleteParams: ModifyParams<User> = {
 *   where: [
 *     { field: "last_login", operator: "<", value: new Date("2022-01-01") },
 *     { field: "status", operator: "=", value: "inactive" }
 *   ]
 * };
 * ```
 */
export interface ModifyParams<T extends Row, K extends (keyof T)[] = ["*"]>
  extends BaseParams<T> {
  /**
   * WHERE conditions for targeting specific rows.
   * Required for both UPDATE and DELETE to prevent accidental bulk operations.
   * Can be an object with field-value pairs for equality checks,
   * or an array of WhereCondition objects for advanced filtering.
   */
  where: WhereCondition<T>[] | Partial<T>;

  /**
   * Data to update (for UPDATE queries).
   * Not applicable for DELETE operations.
   */
  data?: Partial<T>;

  /**
   * Columns to return from the affected record(s).
   * Defaults to all columns.
   */
  select?: K;
}
