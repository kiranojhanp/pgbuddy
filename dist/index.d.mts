import * as postgres from 'postgres';
import { Sql } from 'postgres';

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
declare class PgBuddy {
    private sql;
    constructor(sql: Sql<{}>);
    /**
     * Builds and executes a simple SELECT query.
     * @param params - Table name and optional columns to select.
     * @returns The query result.
     */
    select(params: SelectParams): Promise<postgres.RowList<postgres.Row[]>>;
}

export { PgBuddy };
