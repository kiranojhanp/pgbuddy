import * as postgres from 'postgres';
import { Sql } from 'postgres';

/**
 * Parameters for SELECT query operations
 * @interface SelectParams
 * @property {string} table - The name of the database table to query
 * @property {boolean} [debug] - Enable debug mode to log query details
 * @property {string[]} [columns] - Specific columns to select (defaults to ["*"])
 * @property {number} [page] - Page number for pagination (1-based indexing)
 * @property {number} [pageSize] - Number of records per page
 * @property {Object} [search] - Search configuration for filtering results
 * @property {string[]} search.columns - Columns to search within
 * @property {string} search.query - Search term to match against columns
 * @property {string} [orderBy] - Column name and direction for sorting results
 */
interface SelectParams {
    table: string;
    debug?: boolean;
    columns?: string[];
    page?: number;
    pageSize?: number;
    search?: {
        columns: string[];
        query: string;
    };
    orderBy?: string;
}
/**
 * Parameters for INSERT query operations
 * @interface QueryParams
 * @property {string} table - The name of the database table
 * @property {Object|Object[]} data - Single record or array of records to insert
 * @property {string[]} [returning] - Columns to return after insert (defaults to ["*"])
 * @property {Object} [conditions] - WHERE conditions for the query
 * @property {boolean} [debug] - Enable debug mode to log query details
 */
interface QueryParams {
    table: string;
    data: Record<string, any> | Record<string, any>[];
    returning?: string[];
    conditions?: Record<string, any>;
    debug?: boolean;
}
/**
 * PostgreSQL helper class for building and executing common database operations
 * with built-in protection against SQL injection
 * @class PgBuddy
 */
declare class PgBuddy {
    private sql;
    /**
     * Creates an instance of PgBuddy
     * @param {Sql<{}>} sql - The `postgres.js` instance
     */
    constructor(sql: Sql<{}>);
    /**
     * Executes an INSERT query.
     * Supports single or bulk inserts and dynamically determines columns from the provided data.
     * @async
     * @param {QueryParams} params - Parameters for the INSERT operation
     * @returns {Promise<any>} Result of the INSERT operation
     * @throws {Error} If table name is invalid or data is empty
     *
     * @example
     * // Insert a single record
     * await pgBuddy.input({
     *   table: 'users',
     *   data: { name: 'John', email: 'john@example.com' }
     * });
     *
     * // Bulk insert multiple records
     * await pgBuddy.input({
     *   table: 'users',
     *   data: [
     *     { name: 'John', email: 'john@example.com' },
     *     { name: 'Jane', email: 'jane@example.com' }
     *   ]
     * });
     */
    input(params: QueryParams): Promise<postgres.RowList<postgres.Row[]>>;
    /**
     * Updates records in a specified table that match given conditions
     * @async
     * @param {QueryParams} params - The parameters for the UPDATE operation
     * @param {string} params.table - The name of the database table to update
     * @param {Record<string, any>} params.data - Object containing column-value pairs to update
     * @param {Record<string, any>} params.conditions - WHERE conditions for filtering records to update
     * @param {string[]} [params.returning=["*"]] - Columns to return after update
     * @param {boolean} [params.debug=false] - Enable debug mode to log query details
     * @returns {Promise<any>} The result of the UPDATE operation
     * @throws {Error} If table name is invalid, data is empty, or conditions are missing
     *
     * @example
     * // Update a single record by ID
     * async function updateUser() {
     *   const result = await db.update({
     *     table: "user",
     *     data: {
     *       name: "Updated Name",
     *       email: "updated@example.com"
     *     },
     *     conditions: { id: 1 },
     *     returning: ["id", "name", "email", "updated_at"],
     *   });
     *   console.log("Updated User:", result);
     * }
     *
     * // Update multiple records matching a condition
     * async function deactivateGuests() {
     *   const result = await db.update({
     *     table: "user",
     *     data: { active: false },
     *     conditions: { role: "guest" },
     *     returning: ["id", "name"],
     *   });
     *   console.log("Deactivated Guests:", result);
     * }
     */
    update(params: QueryParams): Promise<postgres.RowList<postgres.Row[]>>;
    /**
     * Performs a SELECT query with optional pagination, searching, and ordering
     * @async
     * @param {SelectParams} params - Parameters for the SELECT operation
     * @returns {Promise<any>} Query results
     * @throws {Error} If table name is invalid or column names are invalid
     *
     * @example
     * // Basic select with pagination
     * await pgBuddy.select({
     *   table: 'users',
     *   page: 1,
     *   pageSize: 10
     * });
     *
     * // Select with search and ordering
     * await pgBuddy.select({
     *   table: 'users',
     *   search: {
     *     columns: ['name', 'email'],
     *     query: 'john'
     *   },
     *   orderBy: 'created_at DESC'
     * });
     */
    select(params: SelectParams): Promise<postgres.RowList<postgres.Row[]>>;
}

export { PgBuddy };
