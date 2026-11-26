/**
 * Helpers for turning postgres.js / PostgreSQL errors into stable, readable
 * checks without hiding the original error.
 *
 * @example
 * ```typescript
 * try {
 *   await users.create({ email });
 * } catch (error) {
 *   if (isUniqueViolation(error)) {
 *     // error.constraint_name tells you which index was violated
 *   }
 * }
 * ```
 */

export type PostgresErrorLike = {
  code: string;
  constraint_name?: string;
  table_name?: string;
  column_name?: string;
  detail?: string;
  severity?: string;
};

/**
 * Common PostgreSQL SQLSTATE codes. Use these with `isPostgresError` or the
 * `is*Violation` helpers.
 */
export const PostgresErrorCodes = {
  uniqueViolation: "23505",
  foreignKeyViolation: "23503",
  notNullViolation: "23502",
  checkViolation: "23514",
  exclusionViolation: "23P01",
  serializationFailure: "40001",
  deadlockDetected: "40P01",
} as const;

const SQLSTATE = /^[0-9A-Z]{5}$/;

/**
 * Returns true for errors that came from PostgreSQL (they carry a 5-character
 * SQLSTATE in `code`), as opposed to network or driver errors.
 */
export function isPostgresError(error: unknown): error is PostgresErrorLike {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    SQLSTATE.test((error as { code: string }).code)
  );
}

function hasCode(error: unknown, code: string): boolean {
  return isPostgresError(error) && error.code === code;
}

/** SQLSTATE 23505 */
export function isUniqueViolation(error: unknown): boolean {
  return hasCode(error, PostgresErrorCodes.uniqueViolation);
}

/** SQLSTATE 23503 */
export function isForeignKeyViolation(error: unknown): boolean {
  return hasCode(error, PostgresErrorCodes.foreignKeyViolation);
}

/** SQLSTATE 23502 */
export function isNotNullViolation(error: unknown): boolean {
  return hasCode(error, PostgresErrorCodes.notNullViolation);
}

/** SQLSTATE 23514 */
export function isCheckViolation(error: unknown): boolean {
  return hasCode(error, PostgresErrorCodes.checkViolation);
}

/** SQLSTATE 40001 */
export function isSerializationFailure(error: unknown): boolean {
  return hasCode(error, PostgresErrorCodes.serializationFailure);
}

/** SQLSTATE 40P01 */
export function isDeadlock(error: unknown): boolean {
  return hasCode(error, PostgresErrorCodes.deadlockDetected);
}

/** The constraint name from a PostgreSQL error, when present. */
export function constraintName(error: unknown): string | undefined {
  return isPostgresError(error) ? error.constraint_name : undefined;
}
