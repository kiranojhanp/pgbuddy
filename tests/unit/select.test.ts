import { PgBuddy } from '../../src';
import { QueryError } from '../../src/errors';
import { createMockSql, TestUser } from '../test-utils';
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import type { WhereCondition } from '../../src/types';

describe('Select Operations', () => {
    let pgBuddy: PgBuddy;
    let mockSql: any;
    let userTable: any;

    beforeEach(() => {
        // Create a new mock SQL for each test
        mockSql = createMockSql();
        pgBuddy = new PgBuddy(mockSql);
        userTable = pgBuddy.table<TestUser>('users');

        // Reset mocks between tests
        jest.resetAllMocks();
    });

    describe('Basic Select', () => {
        test('should select all records with no conditions', async () => {
            // Mock the SQL response
            mockSql.mockResolvedValue([
                { id: 1, name: 'John Doe', email: 'john@example.com', active: true, created_at: new Date() },
                { id: 2, name: 'Jane Doe', email: 'jane@example.com', active: true, created_at: new Date() }
            ]);

            const result = await userTable.select({});

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify result contains all records
            expect(result).toHaveLength(2);
            expect(result[0].id).toBe(1);
            expect(result[1].id).toBe(2);
        });

        test('should select with simple where condition', async () => {
            // Mock the SQL response
            mockSql.mockResolvedValue([
                { id: 1, name: 'John Doe', email: 'john@example.com', active: true, created_at: new Date() }
            ]);

            const result = await userTable.select({
                where: { active: true }
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify filtered result
            expect(result).toHaveLength(1);
            expect(result[0].active).toBe(true);
        });

        test('should select only specified fields', async () => {
            // Mock the SQL response with just id and name fields
            mockSql.mockResolvedValue([
                { id: 1, name: 'John Doe' },
                { id: 2, name: 'Jane Doe' }
            ]);

            const result = await userTable.select({
                select: ['id', 'name']
            });

            // Verify result only has the selected fields
            expect(result).toEqual([
                { id: 1, name: 'John Doe' },
                { id: 2, name: 'Jane Doe' }
            ]);

            // Ensure no other fields are present
            expect(result[0].email).toBeUndefined();
            expect(result[0].active).toBeUndefined();

            expect(mockSql).toHaveBeenCalled();
        });

        test('should handle empty result sets', async () => {
            // Mock empty SQL response
            mockSql.mockResolvedValue([]);

            const result = await userTable.select({
                where: { id: 999 }  // Non-existent ID
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify empty result
            expect(result).toEqual([]);
        });
    });

    describe('Advanced Filtering', () => {
        test('should filter with complex conditions', async () => {
            // Mock the SQL response
            mockSql.mockResolvedValue([
                { id: 1, name: 'John Doe', email: 'john@example.com', active: true, created_at: new Date() }
            ]);

            const result = await userTable.select({
                where: [
                    { field: 'active', operator: '=', value: true },
                    { field: 'id', operator: '>', value: 0 }
                ] as WhereCondition<TestUser>[]
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify filtered result
            expect(result).toHaveLength(1);
        });

        test('should support IS NULL operator', async () => {
            // Mock the SQL response
            mockSql.mockResolvedValue([
                { id: 2, name: 'Jane Doe', email: null, active: true, created_at: new Date() }
            ]);

            const result = await userTable.select({
                where: [
                    { field: 'email', operator: 'IS NULL' }
                ] as WhereCondition<TestUser>[]
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify filtered result
            expect(result).toHaveLength(1);
            expect(result[0].email).toBeNull();
        });

        test('should support IS NOT NULL operator', async () => {
            // Mock the SQL response
            mockSql.mockResolvedValue([
                { id: 1, name: 'John Doe', email: 'john@example.com', active: true, created_at: new Date() }
            ]);

            const result = await userTable.select({
                where: [
                    { field: 'email', operator: 'IS NOT NULL' }
                ] as WhereCondition<TestUser>[]
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify filtered result
            expect(result).toHaveLength(1);
            expect(result[0].email).toBe('john@example.com');
        });

        test('should support IN operator', async () => {
            // Mock the SQL response
            mockSql.mockResolvedValue([
                { id: 1, name: 'John Doe', email: 'john@example.com', active: true, created_at: new Date() },
                { id: 2, name: 'Jane Doe', email: 'jane@example.com', active: true, created_at: new Date() }
            ]);

            const result = await userTable.select({
                where: [
                    { field: 'id', operator: 'IN', value: [1, 2] }
                ] as WhereCondition<TestUser>[]
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify filtered result
            expect(result).toHaveLength(2);
        });

        test('should support LIKE operator with patterns', async () => {
            // Mock the SQL response
            mockSql.mockResolvedValue([
                { id: 1, name: 'John Doe', email: 'john@example.com', active: true, created_at: new Date() }
            ]);

            const result = await userTable.select({
                where: [
                    {
                        field: 'email',
                        operator: 'LIKE',
                        value: 'john',
                        pattern: 'startsWith'
                    }
                ] as any // Using any due to TypeScript complexity with pattern
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify filtered result
            expect(result).toHaveLength(1);
        });

        test('should support ILIKE operator', async () => {
            // Mock the SQL response
            mockSql.mockResolvedValue([
                { id: 1, name: 'John Doe', email: 'john@example.com', active: true, created_at: new Date() }
            ]);

            const result = await userTable.select({
                where: [
                    {
                        field: 'email',
                        operator: 'ILIKE',
                        value: 'JOHN',
                        pattern: 'contains'
                    }
                ] as any // Using any due to TypeScript complexity with pattern
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify filtered result
            expect(result).toHaveLength(1);
        });

        test('should throw error for invalid IN value', async () => {
            // Wrap in a function to test the thrown error
            const selectFn = () => userTable.select({
                where: [
                    { field: 'id', operator: 'IN', value: [] }
                ] as WhereCondition<TestUser>[]
            });

            // Execute and check error
            await expect(selectFn()).rejects.toThrow(QueryError);
        });

        test('should throw error for invalid LIKE value', async () => {
            // Wrap in a function to test the thrown error
            const selectFn = () => userTable.select({
                where: [
                    { field: 'email', operator: 'LIKE', value: 123 as any }
                ] as WhereCondition<TestUser>[]
            });

            // Execute and check error
            await expect(selectFn()).rejects.toThrow(QueryError);
        });
    });

    describe('Sorting', () => {
        test('should support single column sorting', async () => {
            // Mock the SQL response
            mockSql.mockResolvedValue([
                { id: 1, name: 'Alice', email: 'alice@example.com', active: true, created_at: new Date() },
                { id: 2, name: 'Bob', email: 'bob@example.com', active: true, created_at: new Date() },
                { id: 3, name: 'Charlie', email: 'charlie@example.com', active: true, created_at: new Date() }
            ]);

            const result = await userTable.select({
                orderBy: [{ column: 'name', direction: 'ASC' }]
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify sorted result (already sorted in this mock)
            expect(result).toHaveLength(3);
            expect(result[0].name).toBe('Alice');
            expect(result[1].name).toBe('Bob');
            expect(result[2].name).toBe('Charlie');
        });

        test('should support multiple column sorting', async () => {
            // Mock the SQL response - sorted by name ASC, then created_at DESC
            const date1 = new Date(2023, 1, 1);
            const date2 = new Date(2023, 2, 1);
            const date3 = new Date(2023, 3, 1);

            mockSql.mockResolvedValue([
                { id: 1, name: 'Alice', email: 'alice@example.com', active: true, created_at: date3 },
                { id: 3, name: 'Alice', email: 'alice2@example.com', active: true, created_at: date1 },
                { id: 2, name: 'Bob', email: 'bob@example.com', active: true, created_at: date2 }
            ]);

            const result = await userTable.select({
                orderBy: [
                    { column: 'name', direction: 'ASC' },
                    { column: 'created_at', direction: 'DESC' }
                ]
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Since we're mocking the response, verify the structure matches what we expect
            // when ordering by name ASC, created_at DESC
            expect(result).toHaveLength(3);
            expect(result[0].name).toBe('Alice');
            expect(result[0].created_at).toEqual(date3);
            expect(result[1].name).toBe('Alice');
            expect(result[1].created_at).toEqual(date1);
            expect(result[2].name).toBe('Bob');
        });

        test('should throw error for invalid sort direction', async () => {
            // Wrap in a function to test the thrown error
            const selectFn = () => userTable.select({
                orderBy: [{ column: 'name', direction: 'INVALID' as any }]
            });

            // Execute and check error
            await expect(selectFn()).rejects.toThrow(QueryError);
        });
    });

    describe('Pagination', () => {
        test('should support take parameter', async () => {
            // Mock the SQL response
            mockSql.mockResolvedValue([
                { id: 1, name: 'John Doe', email: 'john@example.com', active: true, created_at: new Date() },
                { id: 2, name: 'Jane Doe', email: 'jane@example.com', active: true, created_at: new Date() }
            ]);

            const result = await userTable.select({
                take: 2
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify limited result
            expect(result).toHaveLength(2);
        });

        test('should support skip parameter', async () => {
            // Mock the SQL response - these would be rows 3 & 4 after skipping 2
            mockSql.mockResolvedValue([
                { id: 3, name: 'Bob Smith', email: 'bob@example.com', active: true, created_at: new Date() },
                { id: 4, name: 'Alice Jones', email: 'alice@example.com', active: true, created_at: new Date() }
            ]);

            const result = await userTable.select({
                skip: 2
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify skipped result
            expect(result).toHaveLength(2);
            expect(result[0].id).toBe(3);
            expect(result[1].id).toBe(4);
        });

        test('should support both take and skip parameters', async () => {
            // Mock the SQL response - these would be rows 3 & 4 after skipping 2 and taking 2
            mockSql.mockResolvedValue([
                { id: 3, name: 'Bob Smith', email: 'bob@example.com', active: true, created_at: new Date() },
                { id: 4, name: 'Alice Jones', email: 'alice@example.com', active: true, created_at: new Date() }
            ]);

            const result = await userTable.select({
                take: 2,
                skip: 2
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify paginated result
            expect(result).toHaveLength(2);
            expect(result[0].id).toBe(3);
            expect(result[1].id).toBe(4);
        });

        test('should throw error for negative skip value', async () => {
            // Wrap in a function to test the thrown error
            const selectFn = () => userTable.select({
                skip: -1
            });

            // Execute and check error
            await expect(selectFn()).rejects.toThrow(QueryError);
        });

        test('should throw error for zero or negative take value', async () => {
            // Wrap in a function to test the thrown error
            const selectFn = () => userTable.select({
                take: 0
            });

            // Execute and check error
            await expect(selectFn()).rejects.toThrow(QueryError);
        });

        test('should throw error for non-integer skip value', async () => {
            // Wrap in a function to test the thrown error
            const selectFn = () => userTable.select({
                skip: 1.5
            });

            // Execute and check error
            await expect(selectFn()).rejects.toThrow(QueryError);
        });

        test('should throw error for non-integer take value', async () => {
            // Wrap in a function to test the thrown error
            const selectFn = () => userTable.select({
                take: 1.5
            });

            // Execute and check error
            await expect(selectFn()).rejects.toThrow(QueryError);
        });
    });

    describe('Combined Features', () => {
        test('should support filtering, sorting, and pagination together', async () => {
            // Mock the SQL response
            mockSql.mockResolvedValue([
                { id: 3, name: 'Bob Smith', email: 'bob@example.com', active: true, created_at: new Date() }
            ]);

            const result = await userTable.select({
                where: { active: true },
                orderBy: [{ column: 'name', direction: 'ASC' }],
                take: 1,
                skip: 2
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify combined operations result
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe(3);
        });

        test('should combine multiple filtering methods', async () => {
            // Mock the SQL response
            mockSql.mockResolvedValue([
                { id: 1, name: 'John Doe', email: 'john@example.com', active: true, created_at: new Date() }
            ]);

            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

            const result = await userTable.select({
                where: [
                    { field: 'active', operator: '=', value: true },
                    { field: 'email', operator: 'LIKE', value: '%@example.com', pattern: 'endsWith' },
                    { field: 'created_at', operator: '>=', value: oneMonthAgo }
                ] as any // Using any due to TypeScript complexity with pattern
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify complex filtering result
            expect(result).toHaveLength(1);
        });

        test('should allow complex queries with all features', async () => {
            // Mock the SQL response
            mockSql.mockResolvedValue([
                { id: 5, name: 'Test User' } // Only selected fields
            ]);

            const result = await userTable.select({
                select: ['id', 'name'],
                where: [
                    { field: 'active', operator: '=', value: true },
                    { field: 'id', operator: 'IN', value: [1, 2, 5, 10] }
                ] as WhereCondition<TestUser>[],
                orderBy: [
                    { column: 'created_at', direction: 'DESC' },
                    { column: 'name', direction: 'ASC' }
                ],
                take: 1,
                skip: 1
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify complex query result
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe(5);
            expect(result[0].name).toBe('Test User');
            expect(Object.keys(result[0])).toHaveLength(2); // Only id and name fields
        });
    });

    describe('Edge Cases', () => {
        test('should handle special characters in LIKE patterns properly', async () => {
            // Mock the SQL response
            mockSql.mockResolvedValue([
                { id: 1, name: 'John Doe', email: 'john_doe@example.com', active: true, created_at: new Date() }
            ]);

            // Test with underscore in the search pattern
            const result = await userTable.select({
                where: [
                    {
                        field: 'email',
                        operator: 'LIKE',
                        value: '%\\_doe%', // Looking for literal underscore
                        pattern: 'contains'
                    }
                ] as any // Using any due to TypeScript complexity with pattern
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify result with escaped special characters
            expect(result).toHaveLength(1);
        });

        test('should handle case-insensitive searching with ILIKE', async () => {
            // Mock the SQL response
            mockSql.mockResolvedValue([
                { id: 1, name: 'John Doe', email: 'JOHN@example.com', active: true, created_at: new Date() }
            ]);

            // Test with case-insensitive search
            const result = await userTable.select({
                where: [
                    {
                        field: 'email',
                        operator: 'ILIKE',
                        value: 'john',
                        pattern: 'startsWith'
                    }
                ] as any // Using any due to TypeScript complexity with pattern
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify case-insensitive search result
            expect(result).toHaveLength(1);
        });

        test('should handle extreme pagination values', async () => {
            // Mock empty SQL response for extreme pagination
            mockSql.mockResolvedValue([]);

            // Test with extreme skip value
            const result = await userTable.select({
                skip: 10000,
                take: 10
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify empty result for pagination beyond available data
            expect(result).toEqual([]);
        });

        test('should handle selecting rows with JSON/complex data types', async () => {
            // Create a test product with metadata field
            const metadataValue = { color: 'red', size: 'large', tags: ['featured', 'sale'] };

            // Mock SQL response with a JSON field
            mockSql.mockResolvedValue([
                {
                    id: 1,
                    name: 'Product',
                    metadata: metadataValue
                }
            ]);

            // We assume a hypothetical productTable with metadata field
            const productTable = pgBuddy.table('products');

            const result = await productTable.select({
                where: { id: 1 }
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify JSON field is correctly returned
            expect(result).toHaveLength(1);
            expect(result[0].metadata).toEqual(metadataValue);
            expect(result[0].metadata.color).toBe('red');
            expect(result[0].metadata.tags).toContain('sale');
        });

        test('should handle Date objects correctly in filtering and results', async () => {
            const targetDate = new Date('2023-06-15T12:00:00Z');

            // Mock SQL response with date comparison
            mockSql.mockResolvedValue([
                {
                    id: 1,
                    name: 'John Doe',
                    created_at: targetDate
                }
            ]);

            const result = await userTable.select({
                where: [
                    { field: 'created_at', operator: '=', value: targetDate }
                ] as WhereCondition<TestUser>[]
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify date handling
            expect(result).toHaveLength(1);
            expect(result[0].created_at).toEqual(targetDate);
        });
    });
});
