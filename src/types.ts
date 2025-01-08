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
export interface SelectParams<T extends Row> extends BaseParams<T> {
  /** Advanced or simple WHERE conditions */
  where?: WhereCondition<T>[] | Partial<T>;
  /** Columns to return */
  select?: (keyof T)[];
  /** Number of rows to skip */
  skip?: number;
  /** Number of rows to take */
  take?: number;
  /** Sort specification */
  orderBy?: SortSpec<T>[];
}

/** Parameters for INSERT queries */
export interface InsertParams<T extends Row> extends BaseParams<T> {
  /** Single record or array of records to insert */
  data: Partial<T> | Partial<T>[];
}

/** Parameters for UPDATE and DELETE queries */
export interface ModifyParams<T extends Row> extends BaseParams<T> {
  /** WHERE conditions for targeting specific rows */
  where: Partial<T>;
  /** Data to update (for UPDATE queries) */
  data?: Partial<T>;
}
