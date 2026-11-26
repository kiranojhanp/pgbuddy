import type { Row } from "postgres";
import { Errors, QueryError } from "./errors";
import type { LikePattern, SqlFragment, WhereCondition } from "./types";

const PREDICATE = Symbol("pgbuddy.predicate");

type ComparisonOperator = "=" | "!=" | ">" | "<" | ">=" | "<=";
type LikeOperator = "LIKE" | "ILIKE";
type StringPattern = "contains" | "startsWith" | "endsWith";

/**
 * Internal AST for a composable filter expression. Instances are created with
 * the exported helpers (`eq`, `and`, `or`, ...) and are immutable.
 */
export type PredicateNode<T extends Row> =
  | {
      type: "comparison";
      field: keyof T & string;
      operator: ComparisonOperator;
      value: unknown;
    }
  | {
      type: "in";
      field: keyof T & string;
      values: readonly unknown[];
      negated: boolean;
    }
  | {
      type: "null";
      field: keyof T & string;
      negated: boolean;
    }
  | {
      type: "like";
      field: keyof T & string;
      operator: LikeOperator;
      value: string;
      pattern?: LikePattern;
    }
  | {
      type: "stringPattern";
      field: keyof T & string;
      pattern: StringPattern;
      value: string;
    }
  | {
      type: "between";
      field: keyof T & string;
      low: unknown;
      high: unknown;
      negated: boolean;
    }
  | {
      type: "and" | "or";
      predicates: readonly Predicate<T>[];
    }
  | {
      type: "not";
      predicate: Predicate<T>;
    }
  | {
      type: "operator";
      field: keyof T & string;
      operator: "@>" | "<@" | "&&" | "?" | "?|" | "?&";
      value: unknown;
    }
  | {
      type: "raw";
      fragment: SqlFragment;
    };

/**
 * A composable filter expression. Combine predicates with `and`, `or` and
 * `not`, and pass them to {@link Table.where}.
 *
 * @example
 * ```typescript
 * await users
 *   .where(or(eq("email", email), eq("username", username)))
 *   .where(not(eq("status", "banned")))
 *   .findMany();
 * ```
 */
export interface Predicate<T extends Row> {
  readonly [PREDICATE]: PredicateNode<T>;
}

/**
 * All the shapes accepted by `where`:
 * - a plain object of equality conditions
 * - an array of `WhereCondition` objects
 * - a composable predicate from `eq`/`and`/`or`/...
 */
export type WhereInput<T extends Row> = Partial<T> | WhereCondition<T>[] | Predicate<T>;

function createPredicate<T extends Row>(node: PredicateNode<T>): Predicate<T> {
  return Object.freeze({ [PREDICATE]: node });
}

export function isPredicate(value: unknown): value is Predicate<Row> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { [PREDICATE]?: unknown })[PREDICATE] !== undefined
  );
}

export function getPredicateNode<T extends Row>(predicate: Predicate<T>): PredicateNode<T> {
  return predicate[PREDICATE];
}

function assertComparisonValue(field: string, operator: string, value: unknown): void {
  if (value === null || value === undefined) {
    throw new QueryError(Errors.WHERE.INVALID_COMPARISON(field, operator), {
      code: "INVALID_WHERE",
    });
  }
}

function assertLikeValue(field: string, value: unknown): asserts value is string {
  if (typeof value !== "string") {
    throw new QueryError(Errors.WHERE.INVALID_LIKE(field), { code: "INVALID_WHERE" });
  }
}

/** `field = value` */
export function eq<T extends Row, K extends keyof T & string>(field: K, value: T[K]): Predicate<T> {
  assertComparisonValue(field, "=", value);
  return createPredicate({ type: "comparison", field, operator: "=", value });
}

/** `field <> value` */
export function ne<T extends Row, K extends keyof T & string>(field: K, value: T[K]): Predicate<T> {
  assertComparisonValue(field, "!=", value);
  return createPredicate({ type: "comparison", field, operator: "!=", value });
}

/** `field > value` */
export function gt<T extends Row, K extends keyof T & string>(field: K, value: T[K]): Predicate<T> {
  assertComparisonValue(field, ">", value);
  return createPredicate({ type: "comparison", field, operator: ">", value });
}

/** `field >= value` */
export function gte<T extends Row, K extends keyof T & string>(
  field: K,
  value: T[K]
): Predicate<T> {
  assertComparisonValue(field, ">=", value);
  return createPredicate({ type: "comparison", field, operator: ">=", value });
}

/** `field < value` */
export function lt<T extends Row, K extends keyof T & string>(field: K, value: T[K]): Predicate<T> {
  assertComparisonValue(field, "<", value);
  return createPredicate({ type: "comparison", field, operator: "<", value });
}

/** `field <= value` */
export function lte<T extends Row, K extends keyof T & string>(
  field: K,
  value: T[K]
): Predicate<T> {
  assertComparisonValue(field, "<=", value);
  return createPredicate({ type: "comparison", field, operator: "<=", value });
}

/** `field = ANY(values)` */
export function inArray<T extends Row, K extends keyof T & string>(
  field: K,
  values: readonly T[K][]
): Predicate<T> {
  if (!Array.isArray(values) || values.length === 0) {
    throw new QueryError(Errors.WHERE.INVALID_IN(field), { code: "INVALID_WHERE" });
  }
  return createPredicate({ type: "in", field, values, negated: false });
}

/** `field <> ALL(values)` */
export function notInArray<T extends Row, K extends keyof T & string>(
  field: K,
  values: readonly T[K][]
): Predicate<T> {
  if (!Array.isArray(values) || values.length === 0) {
    throw new QueryError(Errors.WHERE.INVALID_IN(field), { code: "INVALID_WHERE" });
  }
  return createPredicate({ type: "in", field, values, negated: true });
}

function arrayPredicate<T extends Row, K extends keyof T & string>(
  field: K,
  values: readonly unknown[],
  operator: "@>" | "<@" | "&&"
): Predicate<T> {
  if (!Array.isArray(values)) {
    throw new QueryError(Errors.WHERE.INVALID_IN(field), { code: "INVALID_WHERE" });
  }
  return createPredicate({ type: "operator", field, operator, value: values });
}

/** PostgreSQL array containment: `field @> values`. */
export function arrayContains<T extends Row, K extends keyof T & string>(
  field: K,
  values: readonly unknown[]
): Predicate<T> {
  return arrayPredicate(field, values, "@>");
}

/** PostgreSQL array containment: `field <@ values`. */
export function arrayContainedBy<T extends Row, K extends keyof T & string>(
  field: K,
  values: readonly unknown[]
): Predicate<T> {
  return arrayPredicate(field, values, "<@");
}

/** PostgreSQL array overlap: `field && values`. */
export function arrayOverlaps<T extends Row, K extends keyof T & string>(
  field: K,
  values: readonly unknown[]
): Predicate<T> {
  return arrayPredicate(field, values, "&&");
}

function keyPredicate<T extends Row, K extends keyof T & string>(
  field: K,
  value: string | readonly string[],
  operator: "?" | "?|" | "?&"
): Predicate<T> {
  if (
    (typeof value === "string" && value.length === 0) ||
    (Array.isArray(value) && value.length === 0)
  ) {
    throw new QueryError(Errors.WHERE.INVALID_IN(field), { code: "INVALID_WHERE" });
  }
  return createPredicate({ type: "operator", field, operator, value });
}

/** JSONB containment: `field @> value`. */
export function jsonContains<T extends Row, K extends keyof T & string>(
  field: K,
  value: unknown
): Predicate<T> {
  return createPredicate({ type: "operator", field, operator: "@>", value });
}

/** JSONB key existence: `field ? key`. */
export function jsonHasKey<T extends Row, K extends keyof T & string>(
  field: K,
  key: string
): Predicate<T> {
  return keyPredicate(field, key, "?");
}

/** JSONB any-key existence: `field ?| keys`. */
export function jsonHasAnyKey<T extends Row, K extends keyof T & string>(
  field: K,
  keys: readonly string[]
): Predicate<T> {
  return keyPredicate(field, keys, "?|");
}

/** JSONB all-keys existence: `field ?& keys`. */
export function jsonHasAllKeys<T extends Row, K extends keyof T & string>(
  field: K,
  keys: readonly string[]
): Predicate<T> {
  return keyPredicate(field, keys, "?&");
}

/** `field IS NULL` */
export function isNull<T extends Row, K extends keyof T & string>(field: K): Predicate<T> {
  return createPredicate({ type: "null", field, negated: false });
}

/** `field IS NOT NULL` */
export function isNotNull<T extends Row, K extends keyof T & string>(field: K): Predicate<T> {
  return createPredicate({ type: "null", field, negated: true });
}

/**
 * SQL `LIKE`, with wildcards in `value` interpreted as patterns. For literal
 * matching use `contains`, `startsWith` or `endsWith`, which escape wildcards.
 */
export function like<T extends Row, K extends keyof T & string>(
  field: K,
  value: string
): Predicate<T> {
  assertLikeValue(field, value);
  return createPredicate({ type: "like", field, operator: "LIKE", value });
}

/** Case-insensitive SQL `ILIKE`. */
export function ilike<T extends Row, K extends keyof T & string>(
  field: K,
  value: string
): Predicate<T> {
  assertLikeValue(field, value);
  return createPredicate({ type: "like", field, operator: "ILIKE", value });
}

/** Literal containment (`%value%`), wildcard characters are escaped. */
export function contains<T extends Row, K extends keyof T & string>(
  field: K,
  value: string
): Predicate<T> {
  assertLikeValue(field, value);
  return createPredicate({ type: "stringPattern", field, pattern: "contains", value });
}

/** Literal prefix match (`value%`), wildcard characters are escaped. */
export function startsWith<T extends Row, K extends keyof T & string>(
  field: K,
  value: string
): Predicate<T> {
  assertLikeValue(field, value);
  return createPredicate({ type: "stringPattern", field, pattern: "startsWith", value });
}

/** Literal suffix match (`%value`), wildcard characters are escaped. */
export function endsWith<T extends Row, K extends keyof T & string>(
  field: K,
  value: string
): Predicate<T> {
  assertLikeValue(field, value);
  return createPredicate({ type: "stringPattern", field, pattern: "endsWith", value });
}

/** `field BETWEEN low AND high` */
export function between<T extends Row, K extends keyof T & string>(
  field: K,
  low: T[K],
  high: T[K]
): Predicate<T> {
  assertComparisonValue(field, "BETWEEN", low);
  assertComparisonValue(field, "BETWEEN", high);
  return createPredicate({ type: "between", field, low, high, negated: false });
}

/** `field NOT BETWEEN low AND high` */
export function notBetween<T extends Row, K extends keyof T & string>(
  field: K,
  low: T[K],
  high: T[K]
): Predicate<T> {
  assertComparisonValue(field, "NOT BETWEEN", low);
  assertComparisonValue(field, "NOT BETWEEN", high);
  return createPredicate({ type: "between", field, low, high, negated: true });
}

/** Combine predicates with `AND`. */
export function and<T extends Row>(...predicates: Predicate<T>[]): Predicate<T> {
  if (predicates.length === 0) {
    throw new QueryError(Errors.WHERE.INVALID_CONDITIONS, { code: "INVALID_WHERE" });
  }
  return createPredicate({ type: "and", predicates });
}

/** Combine predicates with `OR`. */
export function or<T extends Row>(...predicates: Predicate<T>[]): Predicate<T> {
  if (predicates.length === 0) {
    throw new QueryError(Errors.WHERE.INVALID_CONDITIONS, { code: "INVALID_WHERE" });
  }
  return createPredicate({ type: "or", predicates });
}

/** Negate a predicate with `NOT`. */
export function not<T extends Row>(predicate: Predicate<T>): Predicate<T> {
  return createPredicate({ type: "not", predicate });
}

/**
 * Wrap a raw postgres.js fragment as a predicate. Prefer the typed helpers;
 * this is an escape hatch, so identifiers and values are your responsibility.
 */
export function rawPredicate<T extends Row>(fragment: SqlFragment): Predicate<T> {
  return createPredicate({ type: "raw", fragment });
}
