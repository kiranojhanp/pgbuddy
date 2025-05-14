import { Errors, QueryError } from "../errors";

/**
 * Validates if a value is a valid table or column name
 * @param name Value to check
 * @returns True if valid name
 */
export function isValidName(name: any): boolean {
    return Boolean(name && typeof name === "string" && name.trim());
}

/**
 * Validates pagination parameters
 * @param skip Number of rows to skip
 * @param take Number of rows to take
 * @throws {QueryError} If parameters are invalid
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
 * Validates data for insert or update operations
 * @param data Data to validate 
 * @returns True if data is valid
 */
export function isValidData(data: any): boolean {
    return data && typeof data === 'object' && Object.keys(data).length > 0;
}

/**
 * Validates WHERE conditions
 * @param where WHERE conditions to validate
 * @returns True if conditions are valid
 */
export function isValidWhereConditions(where: any): boolean {
    return where && typeof where === 'object' && Object.keys(where).length > 0;
}
