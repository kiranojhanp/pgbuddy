import { Errors, QueryError } from "../errors";
import { isPredicate } from "../predicates";

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  if (value instanceof Date) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * Validates if a value is a valid table or column name.
 *
 * A valid name must be a non-empty string after trimming whitespace.
 *
 * @param name - The value to check as a table or column name
 * @returns `true` if the name is valid, `false` otherwise
 *
 * @example
 * ```typescript
 * isValidName("users");     // true
 * isValidName("  posts  "); // true (will be trimmed)
 * isValidName("");         // false (empty)
 * isValidName(null);       // false
 * isValidName(123);        // false (not a string)
 * ```
 */
export function isValidName(name: unknown): boolean {
  return Boolean(name && typeof name === "string" && name.trim());
}

export function isValidIdentifier(name: unknown, options?: { allowSchema?: boolean }): boolean {
  if (!isValidName(name)) return false;
  const trimmed = String(name).trim();
  const parts = options?.allowSchema ? trimmed.split(".") : [trimmed];
  if (parts.some((part) => !part.length)) return false;

  const identifierRegex = /^[A-Za-z_][A-Za-z0-9_]*$/;
  return parts.every((part) => identifierRegex.test(part));
}

/**
 * Default upper bound for `take()`. Prevents caller-controlled limits from
 * requesting an unbounded number of rows.
 */
export const DEFAULT_MAX_TAKE = 10_000;

/**
 * Validates pagination parameters for SQL LIMIT and OFFSET clauses.
 *
 * - `take` must be a positive integer (> 0)
 * - `take` must not exceed `maxTake` when one is configured
 * - `skip` must be a non-negative integer (≥ 0)
 *
 * @param skip - Number of rows to skip (OFFSET)
 * @param take - Number of rows to take (LIMIT)
 * @param maxTake - Optional upper bound for `take`
 * @throws {QueryError} If `take` is not a positive integer, `skip` is negative,
 * or `take` exceeds `maxTake`
 *
 * @example
 * ```typescript
 * // Valid values
 * validatePagination(0, 10);  // skip 0, take 10
 * validatePagination(5, 20);  // skip 5, take 20
 * validatePagination(0, 10, 100); // skip 0, take 10, max 100
 *
 * // Throws QueryError: "Take must be > 0"
 * validatePagination(0, 0);
 * validatePagination(0, -5);
 *
 * // Throws QueryError: "Take must be ≤ 100"
 * validatePagination(0, 101, 100);
 *
 * // Throws QueryError: "Skip must be ≥ 0"
 * validatePagination(-1, 10);
 * ```
 */
export function validatePagination(skip?: number, take?: number, maxTake?: number): void {
  if (take !== undefined && (!Number.isInteger(take) || take <= 0)) {
    throw new QueryError(Errors.SELECT.INVALID_TAKE, { code: "INVALID_TAKE" });
  }

  if (take !== undefined && maxTake !== undefined && take > maxTake) {
    throw new QueryError(Errors.SELECT.TAKE_EXCEEDS_MAX(maxTake), { code: "INVALID_TAKE" });
  }

  if (skip !== undefined && (!Number.isInteger(skip) || skip < 0)) {
    throw new QueryError(Errors.SELECT.INVALID_SKIP, { code: "INVALID_SKIP" });
  }
}

/**
 * Validates data for insert or update operations.
 *
 * Valid data must be a non-null, plain object with at least one property and
 * no `undefined` values (postgres.js rejects `undefined` parameters anyway,
 * so this fails early with a `QueryError` instead).
 *
 * @param data - The data to validate for insert/update operations
 * @returns `true` if the data is valid, `false` otherwise
 *
 * @example
 * ```typescript
 * isValidData({ name: "John" });          // true
 * isValidData({ id: 1, status: "active" }); // true
 * isValidData({});                        // false (empty object)
 * isValidData(null);                      // false
 * isValidData("string");                  // false (not an object)
 * isValidData({ name: undefined });       // false (undefined value)
 * ```
 */
export function isValidData(data: unknown): boolean {
  return (
    isPlainObject(data) &&
    Object.keys(data).length > 0 &&
    Object.values(data).every((value) => value !== undefined)
  );
}

/**
 * Validates WHERE conditions for SQL queries.
 *
 * Valid conditions must be a non-null object with at least one property,
 * or an array of condition objects.
 *
 * @param where - The WHERE conditions to validate
 * @returns `true` if the conditions are valid, `false` otherwise
 *
 * @example
 * ```typescript
 * // Simple conditions
 * isValidWhereConditions({ id: 1 });             // true
 * isValidWhereConditions({ status: "active" });  // true
 *
 * // Advanced conditions
 * isValidWhereConditions([
 *   { field: "status", operator: "=", value: "active" }
 * ]);                                           // true
 *
 * // Invalid conditions
 * isValidWhereConditions({});                   // false (empty)
 * isValidWhereConditions(null);                 // false
 * isValidWhereConditions("string");             // false (not an object)
 * ```
 */
export function isValidWhereInput(where: unknown): boolean {
  if (isPredicate(where)) return true;
  return isValidWhereConditions(where);
}

export function isValidWhereConditions(where: unknown): boolean {
  if (Array.isArray(where)) {
    return (
      where.length > 0 &&
      where.every((entry) => {
        if (!isPlainObject(entry)) return false;
        const field = (entry as Record<string, unknown>).field;
        const operator = (entry as Record<string, unknown>).operator;
        const value = (entry as Record<string, unknown>).value;

        if (!isValidName(field)) return false;
        if (typeof operator !== "string" || !operator.trim()) return false;

        if (operator === "IS NULL" || operator === "IS NOT NULL") {
          return value === undefined;
        }

        return value !== undefined;
      })
    );
  }

  return isPlainObject(where) && Object.keys(where).length > 0;
}
