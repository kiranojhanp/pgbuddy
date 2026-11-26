import type { Row, Sql } from "postgres";

/**
 * Opaque postgres.js query fragment. Useful for raw escape hatches such as
 * `whereRaw`.
 */
export type SqlFragment = ReturnType<Sql<Record<string, unknown>>["unsafe"]>;

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
  /** Optional NULLS FIRST / NULLS LAST ordering. */
  nulls?: "first" | "last";
}

/**
 * Valid select keys for queries.
 *
 * - ["*"] selects all columns
 * - Otherwise an array of column names
 */
export type SelectKeys<T extends Row> = ["*"] | readonly (keyof T & string)[];

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
export type PickFields<T, K extends readonly (keyof T & string)[]> = {
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
export type SelectFields<T extends Row, K extends SelectKeys<T>> = K extends ["*"]
  ? T[]
  : PickFields<T, Extract<K, readonly (keyof T & string)[]>>[];

/**
 * A typed SQL expression for computed select fields. Wrap a postgres.js
 * fragment with `sqlExpr<T>(fragment)`; the type parameter is the value type.
 */
export type SqlExpression<T> = {
  readonly fragment: SqlFragment;
  readonly result?: T;
};

export function sqlExpr<T>(fragment: SqlFragment): SqlExpression<T> {
  return { fragment };
}

/** Maps a record of expressions to the types they produce. */
export type ComputedResult<X extends Record<string, SqlExpression<unknown>>> = {
  [K in keyof X]: X[K] extends SqlExpression<infer V> ? V : never;
};

/** A map of aliases to typed SQL expressions. */
export type ComputedMap = Record<string, SqlExpression<unknown>>;

/** Row locking mode for SELECT queries. */
export type LockMode = "update" | "share" | "no key update" | "key share";

/** Options for row locking. `skipLocked` and `noWait` are mutually exclusive. */
export type LockOptions = {
  skipLocked?: boolean;
  noWait?: boolean;
};

/** Options for computed fields on `find*` methods. */
export type ComputedOptions<
  X extends Record<string, SqlExpression<unknown>> = Record<never, never>,
> = {
  computed?: X;
};

/**
 * Aggregations supported by `aggregate()`.
 */
export type AggregateOptions<T extends Row> = {
  count?: boolean;
  countDistinct?: readonly (keyof T & string)[];
  sum?: readonly (keyof T & string)[];
  avg?: readonly (keyof T & string)[];
  min?: readonly (keyof T & string)[];
  max?: readonly (keyof T & string)[];
};

/**
 * Result of `aggregate()`. Counts are numbers; `sum`/`avg` are numbers or
 * null; `min`/`max` keep the database value.
 */
export type AggregateResult = {
  count?: number;
  countDistinct: Record<string, number>;
  sum: Record<string, number | null>;
  avg: Record<string, number | null>;
  min: Record<string, unknown>;
  max: Record<string, unknown>;
};

/**
 * Options for `createMany`.
 */
export type CreateManyOptions = {
  /** Add `ON CONFLICT DO NOTHING` to skip rows that violate a unique index. */
  skipDuplicates?: boolean;
  /**
   * Update conflicting rows instead of failing. `update` columns are set to
   * the `EXCLUDED` values from the inserted row.
   */
  onConflict?: {
    target: readonly string[];
    /** Columns assigned from `EXCLUDED` (the inserted row). */
    update?: readonly string[];
    /** Arbitrary `SET` expressions keyed by destination column. */
    set?: Readonly<Record<string, SqlFragment>>;
  };
};

/** Data accepted by `update`; SQL fragments are allowed per field. */
export type UpdateData<T extends Row> = {
  [K in keyof T]?: T[K] | SqlFragment;
};

/**
 * Options for `upsert`.
 *
 * `where` identifies the conflict target and must be a plain object; its keys
 * become the `ON CONFLICT (...)` columns. Its values are not used in the query.
 */
export type UpsertOptions<T extends Row, I extends Row = T> = {
  where: Partial<T>;
  create: I;
  /** Columns to update on conflict. Empty means "return the existing row". */
  update?: Partial<T>;
  /** Optional WHERE for the conflict target (partial unique indexes). */
  targetWhere?: SqlFragment;
  /** Optional WHERE for the DO UPDATE branch. */
  setWhere?: SqlFragment;
};
