import { Errors, QueryError } from "../errors";

function isPlainObject(value: any): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  if (value instanceof Date) return false;
  const proto = Object.getPrototypeOf(value);
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
export function isValidName(name: any): boolean {
  return Boolean(name && typeof name === "string" && name.trim());
}

/**
 * Validates pagination parameters for SQL LIMIT and OFFSET clauses.
 *
 * - `take` must be a positive integer (> 0)
 * - `skip` must be a non-negative integer (≥ 0)
 *
 * @param skip - Number of rows to skip (OFFSET)
 * @param take - Number of rows to take (LIMIT)
 * @throws {QueryError} If `take` is not a positive integer or `skip` is negative
 *
 * @example
 * ```typescript
 * // Valid values
 * validatePagination(0, 10);  // skip 0, take 10
 * validatePagination(5, 20);  // skip 5, take 20
 *
 * // Throws QueryError: "Take must be > 0"
 * validatePagination(0, 0);
 * validatePagination(0, -5);
 *
 * // Throws QueryError: "Skip must be ≥ 0"
 * validatePagination(-1, 10);
 * ```
 */
export function validatePagination(skip?: number, take?: number): void {
  if (take !== undefined && (!Number.isInteger(take) || take <= 0)) {
    throw new QueryError(Errors.SELECT.INVALID_TAKE);
  }

  if (skip !== undefined && (!Number.isInteger(skip) || skip < 0)) {
    throw new QueryError(Errors.SELECT.INVALID_SKIP);
  }
}

/**
 * Validates data for insert or update operations.
 *
 * Valid data must be a non-null object with at least one property.
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
 * ```
 */
export function isValidData(data: any): boolean {
  return isPlainObject(data) && Object.keys(data).length > 0;
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
export function isValidWhereConditions(where: any): boolean {
  if (Array.isArray(where)) {
    return where.length > 0 && where.every((entry) => isPlainObject(entry));
  }

  return isPlainObject(where) && Object.keys(where).length > 0;
}
