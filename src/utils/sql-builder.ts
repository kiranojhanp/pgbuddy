import type { Row, Sql } from "postgres";
import { Errors, QueryError } from "../errors";
import type {
    WhereCondition,
    SortSpec,
    LikePattern,
    SqlOperator
} from "../types";
import { isValidName } from "./validators";

/**
 * Builds SELECT columns list
 * @param sql SQL tag template 
 * @param select Columns to select
 * @returns SQL fragment for SELECT clause
 * @throws {QueryError} If column names are invalid
 */
export function buildSelect<T extends Row>(
    sql: Sql<{}>,
    select: (keyof T)[]
): any {
    if (!Array.isArray(select) || !select.length || select[0] === "*") {
        return sql`*`;
    }

    const invalidColumns = select.filter((col) => !isValidName(col));
    if (invalidColumns.length) {
        throw new QueryError(
            Errors.SELECT.INVALID_COLUMNS(invalidColumns.join(", "))
        );
    }

    return sql(select as string[]);
}

/**
 * Builds WHERE conditions supporting both simple and advanced formats
 * @param sql SQL tag template
 * @param where WHERE conditions
 * @returns SQL fragment for WHERE clause
 */
export function buildWhereConditions<T extends Row>(
    sql: Sql<{}>,
    where?: WhereCondition<T>[] | Partial<T>
): any {
    if (!where) return sql``;

    if (Array.isArray(where)) {
        return createAdvancedWhereFragment(sql, where);
    } else {
        return createSimpleWhereFragment(sql, where as Partial<T>);
    }
}

/**
 * Creates WHERE clause for simple equality conditions
 * @param sql SQL tag template
 * @param conditions Simple WHERE conditions
 * @returns SQL fragment
 */
export function createSimpleWhereFragment<T extends Row>(
    sql: Sql<{}>,
    conditions?: Partial<T>
): any {
    if (!conditions) return sql``;

    const entries = Object.entries(conditions);
    if (!entries.length) return sql``;

    const whereClause = entries.reduce((acc, [key, value], index) => {
        const condition =
            value === null
                ? sql`${sql(key)} IS NULL`
                : sql`${sql(key)} = ${value}`;

        return index === 0 ? condition : sql`${acc} AND ${condition}`;
    }, sql``);

    return sql`WHERE ${whereClause}`;
}

/**
 * Creates WHERE clause for advanced conditions with operators
 * @param sql SQL tag template
 * @param conditions Advanced WHERE conditions
 * @returns SQL fragment
 */
export function createAdvancedWhereFragment<T extends Row>(
    sql: Sql<{}>,
    conditions: WhereCondition<T>[]
): any {
    if (!conditions.length) return sql``;

    const whereClause = conditions.reduce((acc, condition, index) => {
        const fragment = createConditionFragment(
            sql,
            condition.field as string,
            condition.operator,
            condition.value,
            "pattern" in condition ? condition.pattern : undefined
        );

        return index === 0 ? fragment : sql`${acc} AND ${fragment}`;
    }, sql``);

    return sql`WHERE ${whereClause}`;
}

/**
 * Creates SQL condition based on operator type
 * @param sql SQL tag template
 * @param field Column name
 * @param operator SQL operator
 * @param value Comparison value
 * @param pattern Optional pattern for LIKE operators
 * @returns SQL fragment for condition
 * @throws {QueryError} If operator or value is invalid
 */
export function createConditionFragment(
    sql: Sql<{}>,
    field: string,
    operator: SqlOperator,
    value: any,
    pattern?: LikePattern
): any {
    if (operator === "IS NULL") {
        return sql`${sql(field)} IS NULL`;
    }

    if (operator === "IS NOT NULL") {
        return sql`${sql(field)} IS NOT NULL`;
    }

    if (operator === "IN") {
        if (!Array.isArray(value) || !value.length) {
            throw new QueryError(Errors.WHERE.INVALID_IN(field));
        }
        return sql`${sql(field)} IN ${value}`;
    }

    // LIKE operators
    if (operator === "LIKE" || operator === "ILIKE") {
        return createLikeCondition(sql, field, operator, value, pattern);
    }

    // Comparison operators
    if (["=", "!=", ">", "<", ">=", "<="].includes(operator)) {
        if (value == null) {
            throw new QueryError(Errors.WHERE.INVALID_COMPARISON(field, operator));
        }
        return sql`${sql(field)} ${sql.unsafe(operator)} ${value}`;
    }

    throw new QueryError(Errors.WHERE.UNSUPPORTED_OPERATOR(field, operator));
}

/**
 * Creates SQL LIKE condition based on operator type
 * @param sql SQL tag template
 * @param field Column name
 * @param operator SQL operator
 * @param value Comparison value
 * @param pattern Optional pattern for LIKE operators
 * @returns SQL fragment for the LIKE operation
 * @throws {QueryError} If operator or value is invalid
 */
export function createLikeCondition(
    sql: Sql<{}>,
    field: string,
    operator: SqlOperator,
    value: any,
    pattern?: LikePattern
): any {
    if (typeof value !== "string") {
        throw new QueryError(Errors.WHERE.INVALID_LIKE(field));
    }

    if (value.includes("%") || value.includes("_")) {
        return sql`${sql(field)} ${sql.unsafe(operator)} ${value}`;
    }

    const escapedValue = value.replace(/[%_\\]/g, (char) => `\\${char}`);
    const likePattern = getLikePattern(escapedValue, pattern);

    return sql`${sql(field)} ${sql.unsafe(operator)} ${likePattern}`;
}

/**
 * Generates LIKE pattern based on pattern type
 * @param value Escaped value
 * @param pattern Pattern type
 * @returns Formatted LIKE pattern
 */
export function getLikePattern(value: string, pattern?: LikePattern): string {
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
 * @param sql SQL tag template
 * @param orderBy Sort specifications
 * @returns SQL fragment for ORDER BY
 * @throws {QueryError} If direction is invalid
 */
export function createSortFragment<T extends Row>(
    sql: Sql<{}>,
    orderBy?: SortSpec<T>[]
): any {
    if (!orderBy?.length) return sql``;

    const sortClause = orderBy.reduce((acc, { column, direction }, index) => {
        if (!["ASC", "DESC"].includes(direction)) {
            throw new QueryError(Errors.WHERE.INVALID_SORT);
        }

        const sortFragment = sql`${sql(column as string)} ${sql.unsafe(direction)}`;

        return index === 0 ? sortFragment : sql`${acc}, ${sortFragment}`;
    }, sql``);

    return sql`ORDER BY ${sortClause}`;
}

/**
 * Creates LIMIT/OFFSET clause for pagination
 * @param sql SQL tag template
 * @param take Number of rows to take
 * @param skip Number of rows to skip
 * @returns SQL fragment for LIMIT/OFFSET
 */
export function createLimitFragment(
    sql: Sql<{}>,
    take?: number,
    skip?: number
): any {
    if (!take && !skip) return sql``;
    if (take && skip) return sql`LIMIT ${take} OFFSET ${skip}`;
    if (take) return sql`LIMIT ${take}`;
    if (skip) return sql`OFFSET ${skip}`;
    return sql``;
}
