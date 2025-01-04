import type { Sql } from "postgres";

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

export class EasyPG {
  private sql: Sql<{}>;

  constructor(sql: Sql<{}>) {
    this.sql = sql;
  }

  /**
   * Builds and executes a simple SELECT query.
   * @param params - Table name and optional columns to select.
   * @returns The query result.
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

    // Validate the table name and columns
    if (!table || typeof table !== "string" || !table.trim()) {
      throw new Error("Invalid or empty table name");
    }

    // Validate columns
    if (
      !Array.isArray(columns) ||
      columns.some((col) => !col || typeof col !== "string" || !col.trim())
    ) {
      throw new Error("Invalid or empty column names");
    }

    // Validate search
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

    // Calculate offset for pagination
    const offset = (page - 1) * pageSize;

    // Use dynamic query features of js to build the query
    const query = this.sql`
    SELECT ${
      columns.length === 1 && columns[0] === "*"
        ? this.sql`*`
        : this.sql(columns)
    }
    FROM ${this.sql(table)}
    ${
      search && search.query && search.columns && Array.isArray(search.columns)
        ? this.sql`
            WHERE ${search.columns
              .map(
                (col) =>
                  this.sql`${this.sql(col)} ILIKE ${"%" + search.query + "%"}`
              )
              .reduce((acc, condition, idx) =>
                idx === 0 ? condition : this.sql`${acc} OR ${condition}`
              )}
          `
        : this.sql``
    }
    ${orderBy ? this.sql`ORDER BY ${this.sql`${orderBy}`}` : this.sql``}
    LIMIT ${pageSize} OFFSET ${offset}
  `;

    if (debug) await query.describe();
    const result = await query;
    return result;
  }
}
