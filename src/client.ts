import type { Row, Sql } from "postgres";
import { Errors, TableError } from "./errors";
import { Table } from "./table";
import { isValidName } from "./utils";

/**
 * Main client for PostgreSQL database operations with a chainable interface
 */
export class PgClient {
    private sql: Sql<{}>;

    /**
     * Creates a new PgClient instance
     * @param sql postgres.js SQL instance
     */
    constructor(sql: Sql<{}>) {
        this.sql = sql;
    }

    /**
     * Creates a table query builder with chainable interface
     * @param tableName Target table name
     * @returns Table query builder
     * @throws {TableError} If table name is invalid
     */
    table<T extends Row>(tableName: string): Table<T> {
        if (!isValidName(tableName)) {
            throw new TableError(Errors.TABLE.INVALID_NAME);
        }

        return new Table<T>(this.sql, tableName.trim());
    }
}
