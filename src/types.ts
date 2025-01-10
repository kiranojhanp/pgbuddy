import type { Row } from "postgres";

/** Base parameters for all database operations */
export interface BaseParams<T extends Row> {
  /** Enable debug logging */
  debug?: boolean;
  /** Columns to return in query result */
  select?: (keyof T)[];
}

/** Supported SQL comparison operators */
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

/** Pattern types for LIKE/ILIKE */
export type LikePattern = "startsWith" | "endsWith" | "contains" | "exact";

/** Sort direction */
export type SortDirection = "ASC" | "DESC";

/**
 * Condition for WHERE clauses with type-safe field references
 * Supports comparison, pattern matching, IN lists, and NULL checks
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

/** Sort specification */
export interface SortSpec<T extends Row> {
  column: keyof T & string;
  direction: SortDirection;
}

/** Parameters for SELECT queries */
export interface SelectParams<T extends Row, K extends (keyof T)[] = (keyof T)[]> extends BaseParams<T> {
  /** Advanced or simple WHERE conditions */
  where?: WhereCondition<T>[] | Partial<T>;
  /** Columns to return */
  select?: K;
  /** Number of rows to skip */
  skip?: number;
  /** Number of rows to take */
  take?: number;
  /** Sort specification */
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

/** Parameters for INSERT queries */
export interface InsertParams<T extends Row, K extends (keyof T)[] = ["*"]>
  extends BaseParams<T> {
  /** Single record or array of records to insert */
  data: Partial<T> | Partial<T>[];
  /** Columns to return */
  select?: K;
}

/** Parameters for UPDATE and DELETE queries */
export interface ModifyParams<T extends Row, K extends (keyof T)[] = ["*"]>
  extends BaseParams<T> {
  /** WHERE conditions for targeting specific rows */
  where: WhereCondition<T>[] | Partial<T>;
  /** Data to update (for UPDATE queries) */
  data?: Partial<T>;
  /** Columns to return */
  select?: K;
}
