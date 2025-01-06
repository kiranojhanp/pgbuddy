import type { Row, Sql } from "postgres";

/**
 * Utility type to extract keys that match a specific value type
 */
type KeysMatching<T, V> = {
  [K in keyof T]: T[K] extends V ? K : never;
}[keyof T];

/**
 * Common parameters shared across all database operations
 */
interface BaseParams<T extends Row> {
  debug?: boolean;
  select?: (keyof T)[];
}

/**
 * Parameters for SELECT query operations
 */
interface SelectParams<T extends Row> extends BaseParams<T> {
  select?: (keyof T)[];
  skip?: number;
  take?: number;
  search?: {
    columns: KeysMatching<T, string>[];
    query: string;
  };
  orderBy?: `${keyof T & string} ${"ASC" | "DESC"}`;
}

/**
 * Parameters for INSERT query operations
 */
interface InsertParams<T extends Row> extends BaseParams<T> {
  data: Partial<T> | Partial<T>[];
}

/**
 * Parameters for UPDATE/DELETE query operations
 */
interface ModifyParams<T extends Row> extends BaseParams<T> {
  data?: Partial<T>;
  where: Partial<T>;
}

/**
 * PgBuddy provides a type-safe, SQL-injection-protected interface for common PostgreSQL operations.
 * It enforces best practices by requiring table operations to be performed through a table-specific
 * context, which provides proper type checking and validation.
 *
 * @example
 * import postgres from "postgres";
 * import { PgBuddy } from "pgbuddy";
 *
 * // Initialize with postgres connection
 * const sql = postgres({ options })
 * const db = new PgBuddy(sql);
 *
 * // Create a type-safe table context
 * interface User {
 *   id: number;
 *   name: string;
 *   email: string;
 *   role: string;
 * }
 * const userTable = db.table<User>("users");
 *
 * // Perform operations with type safety
 * // Select with pagination and search
 * const users = await userTable.select({
 *   select: ["id", "name", "email"],
 *   page: 1,
 *   pageSize: 10,
 *   search: {
 *     columns: ["name", "email"],
 *     query: "john"
 *   },
 *   orderBy: "created_at DESC"
 * });
 *
 * // Insert with returning specific columns
 * const newUser = await userTable.insert({
 *   data: { name: "John", email: "john@example.com" },
 *   select: ["id", "name"]
 * });
 *
 * // Update with conditions
 * const updated = await userTable.update({
 *   data: { role: "admin" },
 *   where: { id: 1 },
 *   select: ["id", "name", "role"]
 * });
 *
 * // Delete with conditions
 * const deleted = await userTable.delete({
 *   where: { role: "guest" },
 *   select: ["id", "name"]
 * });
 */
export class PgBuddy {
  private sql: Sql<{}>;

  constructor(sql: Sql<{}>) {
    this.sql = sql;
  }

  /**
   * Returns a type-safe table-specific API for performing database operations
   * @param tableName The name of the database table
   * @throws {Error} If table name is invalid
   */
  table<T extends Row>(tableName: string) {
    if (!tableName || typeof tableName !== "string" || !tableName.trim()) {
      throw new Error("Invalid or empty table name.");
    }

    return {
      insert: (params: InsertParams<T>) =>
        this.insert<T>({ ...params, table: tableName }),

      update: (params: ModifyParams<T>) =>
        this.update<T>({ ...params, table: tableName }),

      delete: (params: ModifyParams<T>) =>
        this.delete<T>({ ...params, table: tableName }),

      select: (params: SelectParams<T>) =>
        this.select<T>({ ...params, table: tableName }),
    };
  }

  private async insert<T extends Row>(
    params: InsertParams<T> & { table: string }
  ): Promise<Partial<T>> {
    const { table, data, select = ["*"] as (keyof T)[] } = params;

    if (!data || (Array.isArray(data) && data.length === 0)) {
      throw new Error("Invalid data to insert");
    }

    const dataToInsert = (Array.isArray(data) ? data : [data]) as Row[];
    const columnKeys = Object.keys(Array.isArray(data) ? data[0] : data);

    const [result] = await this.sql<[T]>`
      INSERT INTO ${this.sql(table)}
      ${this.sql(dataToInsert, columnKeys)}
      RETURNING ${
        select.length === 1 && select[0] === "*"
          ? this.sql`*`
          : this.sql(select as string[])
      }
    `;

    return result;
  }

  private async update<T extends Row>(
    params: ModifyParams<T> & { table: string }
  ): Promise<Partial<T>> {
    const { table, data, where, select = ["*"] as (keyof T)[] } = params;

    if (!data || typeof data !== "object" || Object.keys(data).length === 0) {
      throw new Error("Invalid or empty data to update");
    }

    if (
      !where ||
      typeof where !== "object" ||
      Object.keys(where).length === 0
    ) {
      throw new Error(
        "Conditions are required for updates to prevent accidental table-wide updates"
      );
    }

    const [result] = await this.sql<[T]>`
          UPDATE ${this.sql(table)}
          SET ${this.sql(data as Record<string, any>, Object.keys(data))}
          WHERE ${Object.entries(where).reduce(
            (acc, [key, value], index) =>
              index === 0
                ? this.sql`${this.sql(key)} = ${value}`
                : this.sql`${acc} AND ${this.sql(key)} = ${value}`,
            this.sql``
          )}
          RETURNING ${
            select.length === 1 && select[0] === "*"
              ? this.sql`*`
              : this.sql(select as string[])
          }
      `;

    return result;
  }

  private async delete<T extends Row>(
    params: ModifyParams<T> & { table: string }
  ): Promise<Partial<T>> {
    const { table, where, select = ["*"] as (keyof T)[] } = params;

    if (!where || Object.keys(where).length === 0) {
      throw new Error("No conditions provided for the DELETE operation.");
    }

    const [result] = await this.sql<[T]>`
      DELETE FROM ${this.sql(table)}
      WHERE ${Object.entries(where).reduce(
        (acc, [key, value], index) =>
          index === 0
            ? this.sql`${this.sql(key)} = ${value}`
            : this.sql`${acc} AND ${this.sql(key)} = ${value}`,
        this.sql``
      )}
      RETURNING ${
        select.length === 0 || select.includes("*")
          ? this.sql`*`
          : this.sql(select as string[])
      }
    `;

    return result;
  }

  private async select<T extends Row>(
    params: SelectParams<T> & { table: string }
  ): Promise<Partial<T>[]> {
    const {
      table,
      select = ["*"] as (keyof T)[],
      orderBy,
      skip = 0,
      take = 10,
      search,
    } = params;

    if (
      !Array.isArray(select) ||
      select.some((col) => !col || typeof col !== "string" || !col.trim())
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

    const [result] = await this.sql<[T[]]>`
              SELECT ${
                select.length === 1 && select[0] === "*"
                  ? this.sql`*`
                  : this.sql(select as string[])
              }
              FROM ${this.sql(table)}
              ${
                search &&
                search.query &&
                search.columns &&
                Array.isArray(search.columns)
                  ? this.sql`
                    WHERE ${search.columns
                      .map(
                        (col) =>
                          this.sql`${this.sql(col as string)} ILIKE ${
                            "%" + search.query + "%"
                          }`
                      )
                      .reduce((acc, condition, idx) =>
                        idx === 0 ? condition : this.sql`${acc} OR ${condition}`
                      )}
                  `
                  : this.sql``
              }
              ${
                orderBy
                  ? this.sql`ORDER BY ${this.sql`${orderBy}`}`
                  : this.sql``
              }
              LIMIT ${take} OFFSET ${skip}
    `;

    return result;
  }
}
