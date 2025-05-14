import type { Row, Sql } from "postgres";
import { Errors, QueryError } from "./errors";
import type { SelectFields, WhereCondition, SortSpec } from "./types";
import {
  buildSelect,
  buildWhereConditions,
  createSortFragment,
  createLimitFragment,
  validatePagination,
  isValidData,
  isValidWhereConditions,
} from "./utils";

/**
 * Table-specific query builder with chainable methods.
 *
 * This class provides a fluent API for building PostgreSQL queries
 * with full type safety. It supports common operations like select,
 * insert, update, and delete with automatic type inference.
 *
 * @example
 * ```typescript
 * // Define your table type
 * interface User {
 *   id: number;
 *   name: string;
 *   email: string;
 *   status: "active" | "inactive";
 *   created_at: Date;
 * }
 *
 * // Create a table instance
 * const users = db.table<User>("users");
 *
 * // Chain methods to build and execute queries
 * const activeUsers = await users
 *   .where({ status: "active" })
 *   .orderBy([{ column: "created_at", direction: "DESC" }])
 *   .take(10)
 *   .findMany();
 * ```
 *
 * @template T The table row type that extends Postgres.js Row
 */
export class Table<T extends Row> {
  private sql: Sql<{}>;
  private tableName: string;
  private whereConditions?: WhereCondition<T>[] | Partial<T>;
  private selectedFields: (keyof T)[] = ["*" as keyof T];
  private skipValue?: number;
  private takeValue?: number;
  private orderByValue?: SortSpec<T>[];

  constructor(sql: Sql<{}>, tableName: string) {
    this.sql = sql;
    this.tableName = tableName;
  }

  /**
   * Specify fields to select from the table.
   *
   * @param fields - An array of column names to select from the table
   * @returns `this` for method chaining
   *
   * @example
   * ```typescript
   * // Select only specific fields
   * const userEmails = await users
   *   .select(["id", "email"])
   *   .findMany();
   *
   * // Result type will be { id: number; email: string }[]
   * ```
   */
  select<K extends (keyof T)[]>(fields: K): Table<T> {
    this.selectedFields = fields;
    return this;
  }

  /**
   * Set WHERE conditions for filtering records.
   *
   * @param conditions - Conditions for the WHERE clause. Can be:
   *   - An object with field-value pairs for equality comparisons
   *   - An array of WhereCondition objects for advanced filtering
   * @returns `this` for method chaining
   *
   * @example
   * ```typescript
   * // Simple equality conditions
   * const activeUsers = await users
   *   .where({ status: "active" })
   *   .findMany();
   *
   * // Advanced conditions with operators
   * const recentUsers = await users
   *   .where([
   *     { field: "created_at", operator: ">", value: new Date("2023-01-01") },
   *     { field: "status", operator: "=", value: "active" }
   *   ])
   *   .findMany();
   *
   * // Pattern matching
   * const johnUsers = await users
   *   .where([
   *     { field: "name", operator: "LIKE", value: "John", pattern: "startsWith" }
   *   ])
   *   .findMany();
   * ```
   */
  where(conditions: WhereCondition<T>[] | Partial<T>): Table<T> {
    this.whereConditions = conditions;
    return this;
  }

  /**
   * Set number of records to skip (for pagination)
   *
   * @param count - Number of records to skip (offset)
   * @returns `this` for method chaining
   * @throws {QueryError} If count is negative or not an integer
   *
   * @example
   * ```typescript
   * // Skip first 10 records
   * const page2Users = await users
   *   .skip(10)
   *   .take(5)
   *   .findMany();
   * ```
   */
  skip(count: number): Table<T> {
    validatePagination(count, undefined);
    this.skipValue = count;
    return this;
  }

  /**
   * Set number of records to take (for pagination)
   *
   * @param count - Number of records to return (limit)
   * @returns `this` for method chaining
   * @throws {QueryError} If count is not a positive integer
   *
   * @example
   * ```typescript
   * // Take only 5 records
   * const topUsers = await users
   *   .orderBy([{ column: "created_at", direction: "DESC" }])
   *   .take(5)
   *   .findMany();
   * ```
   */
  take(count: number): Table<T> {
    validatePagination(undefined, count);
    this.takeValue = count;
    return this;
  }

  /**
   * Set sort order for query results
   *
   * @param spec - Array of sort specifications with column names and directions
   * @returns `this` for method chaining
   *
   * @example
   * ```typescript
   * // Sort by created_at in descending order
   * const newestUsers = await users
   *   .orderBy([{ column: "created_at", direction: "DESC" }])
   *   .findMany();
   *
   * // Multiple sort criteria
   * const sortedUsers = await users
   *   .orderBy([
   *     { column: "status", direction: "ASC" },
   *     { column: "name", direction: "ASC" }
   *   ])
   *   .findMany();
   * ```
   */
  orderBy(spec: SortSpec<T>[]): Table<T> {
    this.orderByValue = spec;
    return this;
  }

  /**
   * Find multiple records that match the query criteria
   *
   * @returns Promise resolving to an array of records matching the query conditions
   *
   * @example
   * ```typescript
   * // Find all active users
   * const activeUsers = await users
   *   .where({ status: "active" })
   *   .findMany();
   *
   * // With pagination and sorting
   * const paginatedUsers = await users
   *   .where({ status: "active" })
   *   .orderBy([{ column: "created_at", direction: "DESC" }])
   *   .skip(10)
   *   .take(5)
   *   .findMany();
   * ```
   */
  async findMany<K extends (keyof T)[] = typeof this.selectedFields>(): Promise<
    SelectFields<T, K>
  > {
    return this.executeSelect() as Promise<SelectFields<T, K>>;
  }

  /**
   * Find the first matching record or null if no records match
   *
   * @returns Promise resolving to the first matching record or null
   *
   * @example
   * ```typescript
   * // Find the newest active user
   * const newestUser = await users
   *   .where({ status: "active" })
   *   .orderBy([{ column: "created_at", direction: "DESC" }])
   *   .findFirst();
   *
   * if (newestUser) {
   *   console.log(`Found user: ${newestUser.name}`);
   * } else {
   *   console.log("No active users found");
   * }
   * ```
   */
  async findFirst<
    K extends (keyof T)[] = typeof this.selectedFields
  >(): Promise<SelectFields<T, K>[0] | null> {
    const results = (await this.take(1).executeSelect()) as SelectFields<T, K>;
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Find a unique record or throw an error if multiple records match
   *
   * @returns Promise resolving to the unique matching record or null if none found
   * @throws {QueryError} If multiple records match the query conditions
   *
   * @example
   * ```typescript
   * // Find a user by ID (should be unique)
   * const user = await users
   *   .where({ id: 123 })
   *   .findUnique();
   *
   * // Find user by email (should be unique)
   * try {
   *   const user = await users
   *     .where({ email: "user@example.com" })
   *     .findUnique();
   *
   *   if (user) {
   *     console.log(`Found user: ${user.name}`);
   *   } else {
   *     console.log("User not found");
   *   }
   * } catch (error) {
   *   console.error("Multiple users found with the same email");
   * }
   * ```
   */
  async findUnique<
    K extends (keyof T)[] = typeof this.selectedFields
  >(): Promise<SelectFields<T, K>[0] | null> {
    const results = (await this.executeSelect()) as SelectFields<T, K>;

    if (results.length > 1) {
      throw new QueryError("Expected at most one record but found multiple");
    }

    return results.length === 1 ? results[0] : null;
  }

  /**
   * Count records matching the query conditions
   *
   * @returns Promise resolving to the number of records matching the query
   *
   * @example
   * ```typescript
   * // Count active users
   * const activeUserCount = await users
   *   .where({ status: "active" })
   *   .count();
   *
   * console.log(`There are ${activeUserCount} active users`);
   *
   * // Count users created after a specific date
   * const newUserCount = await users
   *   .where([
   *     { field: "created_at", operator: ">", value: new Date("2023-01-01") }
   *   ])
   *   .count();
   * ```
   */
  async count(): Promise<number> {
    const result = await this.sql<[{ count: string }]>`
            SELECT COUNT(*) as count
            FROM ${this.sql(this.tableName)}
            ${buildWhereConditions(this.sql, this.whereConditions)}
        `;

    return parseInt(result[0].count, 10);
  }

  /**
   * Create a new record in the table
   *
   * @param data - The data to insert into the table
   * @returns Promise resolving to the created record with auto-generated values
   * @throws {QueryError} If data is invalid (empty or not an object)
   *
   * @example
   * ```typescript
   * // Create a new user
   * const newUser = await users.create({
   *   name: "John Doe",
   *   email: "john@example.com",
   *   status: "active",
   *   created_at: new Date()
   * });
   *
   * console.log(`Created user with ID: ${newUser.id}`);
   *
   * // Create with selected return fields
   * const createdUser = await users
   *   .select(["id", "email"])
   *   .create({
   *     name: "Jane Smith",
   *     email: "jane@example.com",
   *     status: "active",
   *     created_at: new Date()
   *   });
   *
   * // createdUser will only have id and email properties
   * ```
   */
  async create<K extends (keyof T)[] = typeof this.selectedFields>(
    data: Partial<T>
  ): Promise<SelectFields<T, K>[0]> {
    if (!isValidData(data)) {
      throw new QueryError(Errors.INSERT.INVALID_DATA);
    }

    const result = await this.sql<SelectFields<T, K>>`
            INSERT INTO ${this.sql(this.tableName)}
            ${this.sql(data as Row)}
            RETURNING ${buildSelect(this.sql, this.selectedFields)}
        `;

    return result[0];
  }

  /**
   * Create multiple records in a single transaction
   *
   * @param records - Array of records to insert
   * @returns Promise resolving to the array of created records with auto-generated values
   * @throws {QueryError} If records array is empty or contains invalid data
   *
   * @example
   * ```typescript
   * // Create multiple users in one query
   * const newUsers = await users.createMany([
   *   {
   *     name: "John Doe",
   *     email: "john@example.com",
   *     status: "active",
   *     created_at: new Date()
   *   },
   *   {
   *     name: "Jane Smith",
   *     email: "jane@example.com",
   *     status: "active",
   *     created_at: new Date()
   *   }
   * ]);
   *
   * console.log(`Created ${newUsers.length} users`);
   *
   * // With specific return fields
   * const createdUsers = await users
   *   .select(["id", "email"])
   *   .createMany([...userData]);
   * ```
   */
  async createMany<K extends (keyof T)[] = typeof this.selectedFields>(
    records: Partial<T>[]
  ): Promise<SelectFields<T, K>> {
    if (!Array.isArray(records) || records.length === 0) {
      throw new QueryError(Errors.INSERT.INVALID_DATA);
    }

    for (const record of records) {
      if (!isValidData(record)) {
        throw new QueryError(Errors.INSERT.INVALID_DATA);
      }
    }

    // Get columns from first record
    const columns = Object.keys(records[0]);

    return this.sql<SelectFields<T, K>>`
            INSERT INTO ${this.sql(this.tableName)}
            ${this.sql(records as Row[], columns)}
            RETURNING ${buildSelect(this.sql, this.selectedFields)}
        `;
  }

  /**
   * Update records matching the current where conditions
   *
   * @param data - The data to update in matching records
   * @returns Promise resolving to the array of updated records
   * @throws {QueryError} If no where conditions are specified or data is invalid
   *
   * @example
   * ```typescript
   * // Update a user by ID
   * const updatedUser = await users
   *   .where({ id: 123 })
   *   .update({ status: "inactive" });
   *
   * // Update multiple users
   * const updatedUsers = await users
   *   .where({ status: "active" })
   *   .update({
   *     status: "inactive",
   *     updated_at: new Date()
   *   });
   *
   * console.log(`Updated ${updatedUsers.length} users`);
   *
   * // With return field selection
   * const updatedUserIds = await users
   *   .where([{ field: "last_login", operator: "<", value: cutoffDate }])
   *   .select(["id"])
   *   .update({ status: "inactive" });
   * ```
   */
  async update<K extends (keyof T)[] = typeof this.selectedFields>(
    data: Partial<T>
  ): Promise<SelectFields<T, K>> {
    if (!isValidWhereConditions(this.whereConditions)) {
      throw new QueryError(Errors.UPDATE.NO_CONDITIONS);
    }

    if (!isValidData(data)) {
      throw new QueryError(Errors.UPDATE.INVALID_DATA);
    }

    return this.sql<SelectFields<T, K>>`
                UPDATE ${this.sql(this.tableName)}
                SET ${this.sql(data as Row)}
                ${buildWhereConditions(this.sql, this.whereConditions)}
                RETURNING ${buildSelect(this.sql, this.selectedFields)}
            `;
  }

  /**
   * Delete records matching the current where conditions
   *
   * @returns Promise resolving to the array of deleted records
   * @throws {QueryError} If no where conditions are specified
   *
   * @example
   * ```typescript
   * // Delete a user by ID
   * const deletedUser = await users
   *   .where({ id: 123 })
   *   .delete();
   *
   * // Delete inactive users
   * const deletedUsers = await users
   *   .where({ status: "inactive" })
   *   .delete();
   *
   * console.log(`Deleted ${deletedUsers.length} inactive users`);
   *
   * // With specific return fields
   * const deletedUserIds = await users
   *   .where([{ field: "last_login", operator: "<", value: cutoffDate }])
   *   .select(["id"])
   *   .delete();
   * ```
   */
  async delete<K extends (keyof T)[] = typeof this.selectedFields>(): Promise<
    SelectFields<T, K>
  > {
    if (!isValidWhereConditions(this.whereConditions)) {
      throw new QueryError(Errors.DELETE.NO_CONDITIONS);
    }

    return this.sql<SelectFields<T, K>>`
                DELETE FROM ${this.sql(this.tableName)}
                ${buildWhereConditions(this.sql, this.whereConditions)}
                RETURNING ${buildSelect(this.sql, this.selectedFields)}
            `;
  }

  /**
   * Execute the SELECT query with current parameters
   *
   * @returns Promise resolving to the query results
   * @private
   */
  private async executeSelect<
    K extends (keyof T)[] = typeof this.selectedFields
  >(): Promise<SelectFields<T, K>> {
    return this.sql<SelectFields<T, K>>`
            SELECT ${buildSelect(this.sql, this.selectedFields)}
            FROM ${this.sql(this.tableName)}
            ${buildWhereConditions(this.sql, this.whereConditions)}
            ${createSortFragment(this.sql, this.orderByValue)}
            ${createLimitFragment(this.sql, this.takeValue, this.skipValue)}
        `;
  }
}
