import type { Row, Sql } from "postgres";
import { Errors, QueryError } from "./errors";
import type {
    SelectFields,
    WhereCondition,
    SortSpec
} from "./types";
import {
    buildSelect,
    buildWhereConditions,
    createSortFragment,
    createLimitFragment,
    validatePagination,
    isValidData,
    isValidWhereConditions
} from "./utils";

/**
 * Table-specific query builder with chainable methods
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
     * Specify fields to select
     * @param fields List of field names
     * @returns this (chainable)
     */
    select<K extends (keyof T)[]>(fields: K): Table<T> {
        this.selectedFields = fields;
        return this;
    }

    /**
     * Set WHERE conditions
     * @param conditions Simple equality conditions or complex conditions
     * @returns this (chainable)
     */
    where(conditions: WhereCondition<T>[] | Partial<T>): Table<T> {
        this.whereConditions = conditions;
        return this;
    }

    /**
     * Set number of records to skip (for pagination)
     * @param count Number of records to skip
     * @returns this (chainable)
     */
    skip(count: number): Table<T> {
        validatePagination(count, undefined);
        this.skipValue = count;
        return this;
    }

    /**
     * Set number of records to take (for pagination)
     * @param count Number of records to return
     * @returns this (chainable)
     */
    take(count: number): Table<T> {
        validatePagination(undefined, count);
        this.takeValue = count;
        return this;
    }

    /**
     * Set sort order
     * @param spec Sort specifications
     * @returns this (chainable)
     */
    orderBy(spec: SortSpec<T>[]): Table<T> {
        this.orderByValue = spec;
        return this;
    }

    /**
     * Find multiple records
     * @returns Array of matching records
     */
    async findMany<K extends (keyof T)[] = typeof this.selectedFields>(): Promise<SelectFields<T, K>> {
        return this.executeSelect() as Promise<SelectFields<T, K>>;
    }

    /**
     * Find first matching record or null
     * @returns First matching record or null
     */
    async findFirst<K extends (keyof T)[] = typeof this.selectedFields>(): Promise<(SelectFields<T, K>[0] | null)> {
        const results = await this.take(1).executeSelect() as SelectFields<T, K>;
        return results.length > 0 ? results[0] : null;
    }

    /**
     * Find unique record or throw if multiple records found
     * @returns Unique record or null
     * @throws {QueryError} If multiple records match the query
     */
    async findUnique<K extends (keyof T)[] = typeof this.selectedFields>(): Promise<(SelectFields<T, K>[0] | null)> {
        const results = await this.executeSelect() as SelectFields<T, K>;

        if (results.length > 1) {
            throw new QueryError("Expected at most one record but found multiple");
        }

        return results.length === 1 ? results[0] : null;
    }

    /**
     * Count records matching the query
     * @returns Count of matching records
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
     * Create a new record
     * @param data Record data
     * @returns Created record
     */
    async create<K extends (keyof T)[] = typeof this.selectedFields>(data: Partial<T>): Promise<SelectFields<T, K>[0]> {
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
     * Create multiple records
     * @param records Array of record data to insert
     * @returns Array of created records
     */
    async createMany<K extends (keyof T)[] = typeof this.selectedFields>(records: Partial<T>[]): Promise<SelectFields<T, K>> {
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
     * @param data Update data
     * @returns Updated records
     * @throws {QueryError} If no where conditions are specified
     */
    async update<K extends (keyof T)[] = typeof this.selectedFields>(data: Partial<T>): Promise<SelectFields<T, K>> {
        if (!isValidWhereConditions(this.whereConditions)) {
            throw new QueryError(Errors.UPDATE.NO_CONDITIONS);
        }

        if (!isValidData(data)) {
            throw new QueryError(Errors.UPDATE.INVALID_DATA);
        }

        return this.sql<SelectFields<T, K>>`
            UPDATE ${this.sql(this.tableName)}
            SET ${this.sql(data as Row, Object.keys(data))}
            WHERE ${buildWhereConditions(this.sql, this.whereConditions)}
            RETURNING ${buildSelect(this.sql, this.selectedFields)}
        `;
    }

    /**
     * Delete records matching the current where conditions
     * @returns Deleted records
     * @throws {QueryError} If no where conditions are specified
     */
    async delete<K extends (keyof T)[] = typeof this.selectedFields>(): Promise<SelectFields<T, K>> {
        if (!isValidWhereConditions(this.whereConditions)) {
            throw new QueryError(Errors.DELETE.NO_CONDITIONS);
        }

        return this.sql<SelectFields<T, K>>`
            DELETE FROM ${this.sql(this.tableName)}
            WHERE ${buildWhereConditions(this.sql, this.whereConditions)}
            RETURNING ${buildSelect(this.sql, this.selectedFields)}
        `;
    }

    /**
     * Execute the SELECT query with current parameters
     * @returns Query results
     */
    private async executeSelect<K extends (keyof T)[] = typeof this.selectedFields>(): Promise<SelectFields<T, K>> {
        return this.sql<SelectFields<T, K>>`
            SELECT ${buildSelect(this.sql, this.selectedFields)}
            FROM ${this.sql(this.tableName)}
            ${buildWhereConditions(this.sql, this.whereConditions)}
            ${createSortFragment(this.sql, this.orderByValue)}
            ${createLimitFragment(this.sql, this.takeValue, this.skipValue)}
        `;
    }
}
