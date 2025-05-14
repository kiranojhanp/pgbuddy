import type { Row, Sql } from "postgres";
import { Errors, QueryError, TableError } from "./errors";
import type {
    InsertParams,
    ModifyParams,
    SelectFields,
    SelectParams,
    SqlOperator,
    WhereCondition,
    SortSpec,
    LikePattern,
} from "./types";

/** PostgreSQL query builder with type safety (Legacy API, use PgClient for new code) */
export class PgBuddy {
    private sql: Sql<{}>;

    constructor(sql: Sql<{}>) {
        this.sql = sql;
    }

    /**
     * Creates table-specific CRUD operations interface
     * @param tableName Target table name
     * @returns Object with type-safe table operations
     * @throws {TableError} If table name is invalid
     */
    table<T extends Row>(tableName: string) {
        if (!this.isValidTableName(tableName)) {
            throw new TableError(Errors.TABLE.INVALID_NAME);
        }

        const table = tableName.trim();

        return {
            insert: <K extends (keyof T)[] = ["*"]>(params: InsertParams<T, K>) =>
                this.insert<T, K>({ ...params, table: table }),

            update: <K extends (keyof T)[] = ["*"]>(params: ModifyParams<T, K>) =>
                this.update<T, K>({ ...params, table: table }),

            delete: <K extends (keyof T)[] = ["*"]>(params: ModifyParams<T, K>) =>
                this.delete<T, K>({ ...params, table: table }),

            select: <K extends (keyof T)[] = ["*"]>(params: SelectParams<T, K>) =>
                this.select<T, K>({ ...params, table: table }),
        };
    }

    /**
     * Validates the provided table name.
     * @param name The name of the table to validate.
     * @returns True if the table name is valid; otherwise, false.
     */
    private isValidTableName(name: string): boolean {
        return Boolean(name && typeof name === "string" && name.trim());
    }

    /**
     * Inserts one or more rows into a table
     * @param params Insert parameters including data and table
     * @returns Inserted rows
     * @throws {QueryError} If data is invalid or empty
     */
    private async insert<T extends Row, K extends (keyof T)[] = ["*"]>({
        table,
        data,
        select = ["*" as keyof T] as K,
    }: InsertParams<T, K> & { table: string }): Promise<SelectFields<T, K>> {
        const rows = (Array.isArray(data) ? data : [data]) as Row[];

        if (!rows.length) {
            throw new QueryError(Errors.INSERT.INVALID_DATA);
        }

        const columns = Object.keys(rows[0]);
        if (!columns.length) {
            throw new QueryError(Errors.INSERT.NO_COLUMNS);
        }

        return this.sql<SelectFields<T, K>>`
            INSERT INTO ${this.sql(table)}
            ${this.sql(rows, columns)}
            RETURNING ${this.buildSelect(select)}
        `;
    }

    /**
     * Updates rows matching WHERE conditions
     * @param params Update parameters including data and conditions
     * @returns Updated rows
     * @throws {QueryError} If data or conditions are invalid
     */
    private async update<T extends Row, K extends (keyof T)[] = ["*"]>({
        table,
        select = ["*" as keyof T] as K,
        where,
        data,
    }: ModifyParams<T, K> & { table: string }): Promise<SelectFields<T, K>> {
        if (!data || !this.isValidUpdateData(data)) {
            throw new QueryError(Errors.UPDATE.INVALID_DATA);
        }

        if (!this.isValidWhereCondition(where)) {
            throw new QueryError(Errors.UPDATE.NO_CONDITIONS);
        }

        return this.sql<SelectFields<T, K>>`
            UPDATE ${this.sql(table)}
            SET ${this.sql(data as Record<string, any>, Object.keys(data))}
            WHERE ${this.buildWhereConditions(where)}
            RETURNING ${this.buildSelect(select)}
        `;
    }

    /**
     * Validates the provided update data.
     * @param data The data to validate, which should be an object with at least one key.
     * @returns True if the data is valid; otherwise, false.
     */
    private isValidUpdateData<T>(data: Partial<T>): boolean {
        return data && typeof data === "object" && Object.keys(data).length > 0;
    }

    /**
     * Validates the provided WHERE condition.
     * @param where The condition to validate, which should be an object with at least one key.
     * @returns True if the WHERE condition is valid; otherwise, false.
     */
    private isValidWhereCondition(where: any): boolean {
        return where && typeof where === "object" && Object.keys(where).length > 0;
    }

    /**
     * Deletes rows matching WHERE conditions
     * @param params Delete parameters including conditions
     * @returns Deleted rows
     * @throws {Error} If conditions are missing
     */
    private async delete<T extends Row, K extends (keyof T)[] = ["*"]>({
        table,
        select = ["*" as keyof T] as K,
        where,
    }: ModifyParams<T, K> & { table: string }): Promise<SelectFields<T, K>> {
        if (!this.isValidWhereCondition(where)) {
            throw new QueryError(Errors.DELETE.NO_CONDITIONS);
        }

        return this.sql<SelectFields<T, K>>`
            DELETE FROM ${this.sql(table)}
            WHERE ${this.buildWhereConditions(where)}
            RETURNING ${this.buildSelect(select)}
        `;
    }

    /**
     * Selects rows with filtering, sorting, and pagination
     * @param params Select parameters including conditions and options
     * @returns Matching rows
     * @throws {Error} If pagination parameters are invalid
     */
    private async select<T extends Row, K extends (keyof T)[] = ["*"]>({
        table,
        select = ["*" as keyof T] as K,
        where,
        orderBy,
        skip,
        take,
    }: SelectParams<T> & { table: string }): Promise<SelectFields<T, K>> {
        this.validatePagination(skip, take);

        const result = this.sql<SelectFields<T, K>>`
            SELECT ${this.buildSelect(select)}
            FROM ${this.sql(table)}
            ${this.buildWhereConditions(where)}
            ${this.createSortFragment(orderBy)}
            ${this.createLimitFragment(take, skip)}`;

        return result;
    }

    /**
     * Validates pagination parameters for skip and take.
     * @param skip The number of rows to skip (offset). Must be a non-negative integer.
     * @param take The number of rows to take (limit). Must be a positive integer.
     * @throws {QueryError} If take is not a positive integer or if skip is a negative integer.
     */
    private validatePagination(skip?: number, take?: number) {
        if (take !== undefined && (!Number.isInteger(take) || take <= 0)) {
            throw new QueryError(Errors.SELECT.INVALID_TAKE);
        }

        if (skip !== undefined && (!Number.isInteger(skip) || skip < 0)) {
            throw new QueryError(Errors.SELECT.INVALID_SKIP);
        }
    }

    /**
     * Builds SELECT column list with validation
     * @param select Columns to select
     * @returns SQL fragment for SELECT clause
     * @throws {Error} If column names are invalid
     */
    private buildSelect<T>(select: (keyof T)[]) {
        if (!Array.isArray(select) || !select.length || select[0] === "*") {
            return this.sql`*`;
        }

        const invalidColumns = select.filter((col) => !this.isValidColumnName(col));
        if (!!invalidColumns.length) {
            throw new QueryError(
                Errors.SELECT.INVALID_COLUMNS(invalidColumns.join(", "))
            );
        }

        return this.sql(select as string[]);
    }

    /**
     * Checks if the given value is a valid column name.
     * A valid column name is a non-empty string after trimming whitespace.
     * @param {any} col - The value to check.
     * @returns {boolean} - True if the value is a valid column name, false otherwise.
     */
    private isValidColumnName(col: any): boolean {
        return col && typeof col === "string" && Boolean(col.trim());
    }

    /**
     * Builds WHERE conditions supporting both simple and advanced formats
     * @param where WHERE conditions
     * @returns SQL fragment for WHERE clause
     */
    private buildWhereConditions<T extends Row>(
        where?: WhereCondition<T>[] | Partial<T>
    ) {
        if (!where) return this.sql``;
        return Array.isArray(where)
            ? this.createAdvancedWhereFragment(where)
            : this.createSimpleWhereFragment(where);
    }

    /**
     * Creates WHERE clause for simple equality conditions
     * @param where Simple WHERE conditions
     * @returns SQL fragment
     */
    private createSimpleWhereFragment<T extends Row>(
        conditions: SelectParams<T>["where"]
    ) {
        if (!conditions) return this.sql``;

        const entries = Object.entries(conditions);
        if (!entries.length) return this.sql``;

        return this.sql`WHERE ${entries.reduce((acc, [key, value], index) => {
            const condition =
                value === null
                    ? this.sql`${this.sql(key)} IS NULL`
                    : this.sql`${this.sql(key)} = ${value}`;

            return index === 0 ? condition : this.sql`${acc} AND ${condition}`;
        }, this.sql``)}`;
    }

    /**
     * Creates WHERE clause for advanced conditions with operators
     * @param where Advanced WHERE conditions
     * @returns SQL fragment
     */
    private createAdvancedWhereFragment<T extends Row>(
        conditions: WhereCondition<T>[]
    ) {
        if (!conditions.length) return this.sql``;

        const whereClause = conditions.reduce((acc, condition, index) => {
            const fragment = this.createConditionFragment(
                condition.field as string,
                condition.operator,
                condition.value,
                "pattern" in condition ? condition.pattern : undefined
            );

            return index === 0 ? fragment : this.sql`${acc} AND ${fragment}`;
        }, this.sql``);

        return this.sql`WHERE ${whereClause}`;
    }

    /**
     * Creates SQL condition based on operator type
     * @param field Column name
     * @param operator SQL operator
     * @param value Comparison value
     * @param pattern Optional pattern for LIKE operators
     * @returns SQL fragment for condition
     * @throws {QueryError} If operator or value is invalid
     */
    private createConditionFragment(
        field: string,
        operator: SqlOperator,
        value: any,
        pattern?: LikePattern
    ) {
        if (operator === "IS NULL") {
            return this.sql`${this.sql(field)} IS NULL`;
        }

        if (operator === "IS NOT NULL") {
            return this.sql`${this.sql(field)} IS NOT NULL`;
        }

        if (operator === "IN") {
            if (!Array.isArray(value) || !value.length) {
                throw new QueryError(Errors.WHERE.INVALID_IN(value));
            }
            return this.sql`${this.sql(field)} IN ${value}`;
        }

        // LIKE operators
        if (operator === "LIKE" || operator === "ILIKE") {
            return this.createLikeCondition(field, operator, value, pattern);
        }

        // Comparison operators
        if (["=", "!=", ">", "<", ">=", "<="].includes(operator)) {
            if (value == null) {
                throw new QueryError(Errors.WHERE.INVALID_COMPARISON(field, operator));
            }
            return this.sql`${this.sql(field)} ${this.sql.unsafe(operator)} ${value}`;
        }

        throw new QueryError(Errors.WHERE.UNSUPPORTED_OPERATOR(field, operator));
    }

    /**
     * Creates SQL LIKE condition based on operator type
     * @param field Column name
     * @param operator SQL operator
     * @param value Comparison value
     * @param pattern Optional pattern for LIKE operators
     * @returns SQL fragment for the LIKE operation
     * @throws {QueryError} If operator or value is invalid
     */
    private createLikeCondition(
        field: string,
        operator: SqlOperator,
        value: any,
        pattern?: LikePattern
    ) {
        if (typeof value !== "string") {
            throw new QueryError(Errors.WHERE.INVALID_LIKE(value));
        }

        if (value.includes("%") || value.includes("_")) {
            return this.sql`${this.sql(field)} ${this.sql.unsafe(operator)} ${value}`;
        }

        const escapedValue = value.replace(/[%_\\]/g, (char) => `\\${char}`);
        const likePattern = this.getLikePattern(escapedValue, pattern);

        return this.sql`${this.sql(field)} ${this.sql.unsafe(
            operator
        )} ${likePattern}`;
    }

    /**
     * Generates LIKE pattern based on pattern type
     * @param value Escaped value
     * @param pattern Pattern type
     * @returns Formatted LIKE pattern
     */
    private getLikePattern(
        value: string,
        pattern?: LikePattern
    ): string {
        const patterns = {
            startsWith: () => value + "%",
            endsWith: () => "%" + value,
            contains: () => "%" + value + "%",
            exact: () => value,
            default: () => value,
        };

        return (pattern ? patterns[pattern] : patterns.default)();
    }

    /**
     * Creates ORDER BY clause
     * @param orderBy Sort specifications
     * @returns SQL fragment for ORDER BY
     * @throws {QueryError} If direction is invalid
     */
    private createSortFragment<T extends Row>(
        orderBy: SelectParams<T>["orderBy"]
    ) {
        if (!orderBy?.length) return this.sql``;

        const sortClause = orderBy.reduce((acc, { column, direction }, index) => {
            if (!["ASC", "DESC"].includes(direction)) {
                throw new QueryError(Errors.WHERE.INVALID_SORT);
            }

            const sortFragment = this.sql`${this.sql(
                column as string
            )} ${this.sql.unsafe(direction)}`;

            return index === 0 ? sortFragment : this.sql`${acc}, ${sortFragment}`;
        }, this.sql``);

        return this.sql`ORDER BY ${sortClause}`;
    }

    /**
     * Creates LIMIT/OFFSET clause for pagination
     * @param take Number of rows to take
     * @param skip Number of rows to skip
     * @returns SQL fragment for LIMIT/OFFSET
     */
    private createLimitFragment(take?: number, skip?: number) {
        if (!take && !skip) return this.sql``;
        if (take && skip) return this.sql`LIMIT ${take} OFFSET ${skip}`;
        if (take) return this.sql`LIMIT ${take}`;
        if (skip) return this.sql`OFFSET ${skip}`;
        return this.sql``;
    }
}
