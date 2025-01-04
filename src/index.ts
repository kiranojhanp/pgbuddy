import type { Sql } from "postgres";

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
export class PgBuddy {
  private sql: Sql<{}>;

  /**
   * Creates an instance of PgBuddy
   * @param {Sql<{}>} sql - The `postgres.js` instance
   */
  constructor(sql: Sql<{}>) {
    this.sql = sql;
  }

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
  async input(params: QueryParams) {
    const { table, data, returning = ["*"], debug = false } = params;

    // Input validation
    if (!table || typeof table !== "string" || !table.trim()) {
      throw new Error("Invalid or empty table name");
    }
    if (!data || (Array.isArray(data) && data.length === 0)) {
      throw new Error("Invalid data to insert");
    }

    // Determine if this is a bulk insert or single record insert
    // For bulk insert, we use the keys of the first object as our column template
    const columnKeys = Array.isArray(data)
      ? Object.keys(data[0])
      : Object.keys(data);

    // Build and execute the INSERT query
    // The sql template tag automatically handles SQL injection protection
    const query = this.sql`
      INSERT INTO ${this.sql(table)} 
      ${this.sql(data, columnKeys)}
      RETURNING ${
        returning.length === 1 && returning[0] === "*"
          ? this.sql`*`
          : this.sql(returning)
      }
    `;

    // Log query details in debug mode
    if (debug) await query.describe();
    return await query;
  }

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
  async select(params: SelectParams) {
    const {
      debug = false,
      table,
      columns = ["*"],
      orderBy,
      page = 1,
      pageSize = 10,
      search,
    } = params;

    // Input validation
    if (!table || typeof table !== "string" || !table.trim()) {
      throw new Error("Invalid or empty table name");
    }
    if (
      !Array.isArray(columns) ||
      columns.some((col) => !col || typeof col !== "string" || !col.trim())
    ) {
      throw new Error("Invalid or empty column names");
    }
    if (
      search &&
      (!Array.isArray(search.columns) ||
        search.columns.some(
          (col) => !col || typeof col !== "string" || !col.trim()
        ) ||
        !search.query)
    ) {
      throw new Error("Invalid search parameters");
    }

    // Calculate pagination offset (0-based)
    const offset = (page - 1) * pageSize;

    // Build the SELECT query with dynamic components
    const query = this.sql`
    SELECT ${
      columns.length === 1 && columns[0] === "*"
        ? this.sql`*`
        : this.sql(columns)
    }
    FROM ${this.sql(table)}
    ${
      // Add WHERE clause for search functionality if search parameters are provided
      search && search.query && search.columns && Array.isArray(search.columns)
        ? this.sql`
            WHERE ${search.columns
              .map(
                (col) =>
                  // Create ILIKE condition for case-insensitive partial matching
                  this.sql`${this.sql(col)} ILIKE ${"%" + search.query + "%"}`
              )
              // Combine multiple column conditions with OR
              .reduce((acc, condition, idx) =>
                idx === 0 ? condition : this.sql`${acc} OR ${condition}`
              )}
          `
        : this.sql``
    }
    ${
      // Add ORDER BY clause if specified
      orderBy ? this.sql`ORDER BY ${this.sql`${orderBy}`}` : this.sql``
    }
    LIMIT ${pageSize} OFFSET ${offset}
  `;

    // Log query details in debug mode
    if (debug) await query.describe();
    const result = await query;
    return result;
  }
}
