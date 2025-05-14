import { PgBuddy } from '../../src';
import { QueryError } from '../../src/errors';
import { createMockSql, TestUser } from '../test-utils';
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import type { WhereCondition } from '../../src/types';

describe('Delete Operations', () => {
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

    describe('Basic delete functionality', () => {
        test('should delete a record with simple where condition', async () => {
            // Mock the SQL response
            mockSql.mockResolvedValue([{
                id: 1,
                name: 'John Doe',
                email: 'john@example.com',
                active: true,
                created_at: new Date()
            }]);

            const result = await userTable.delete({
                where: { id: 1 }
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify the deleted record is returned
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe(1);
        });

        test('should delete with complex where conditions', async () => {
            // Mock the SQL response
            mockSql.mockResolvedValue([{
                id: 1,
                name: 'John Doe',
                email: 'john@example.com',
                active: true,
                created_at: new Date()
            }]);

            const result = await userTable.delete({
                where: [
                    { field: 'email', operator: '=', value: 'john@example.com' },
                    { field: 'active', operator: '=', value: true }
                ] as WhereCondition<TestUser>[]
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify the deleted record is returned
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe(1);
        });

        test('should return only selected fields when select is specified', async () => {
            // Mock the SQL response with just the id field
            mockSql.mockResolvedValue([{ id: 1 }]);

            const result = await userTable.delete({
                where: { id: 1 },
                select: ['id']
            });

            // Verify result only has the selected field
            expect(result).toEqual([{ id: 1 }]);
            expect(Object.keys(result[0])).toHaveLength(1);
            expect(mockSql).toHaveBeenCalled();
        });
    });

    describe('Advanced where conditions', () => {
        test('should delete with IS NULL condition', async () => {
            // Mock the SQL response
            mockSql.mockResolvedValue([{
                id: 2,
                name: 'Jane Doe',
                email: null,
                active: true,
                created_at: new Date()
            }]);

            const result = await userTable.delete({
                where: [
                    { field: 'email', operator: 'IS NULL' }
                ] as WhereCondition<TestUser>[]
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify the deleted record is returned
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe(2);
            expect(result[0].email).toBeNull();
        });

        test('should delete with IS NOT NULL condition', async () => {
            // Mock the SQL response
            mockSql.mockResolvedValue([{
                id: 1,
                name: 'John Doe',
                email: 'john@example.com',
                active: true,
                created_at: new Date()
            }]);

            const result = await userTable.delete({
                where: [
                    { field: 'email', operator: 'IS NOT NULL' }
                ] as WhereCondition<TestUser>[]
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify the deleted record is returned
            expect(result).toHaveLength(1);
            expect(result[0].email).toBe('john@example.com');
        });

        test('should delete with IN condition', async () => {
            // Mock the SQL response
            mockSql.mockResolvedValue([
                {
                    id: 1,
                    name: 'John Doe',
                    email: 'john@example.com',
                    active: true,
                    created_at: new Date()
                },
                {
                    id: 2,
                    name: 'Jane Doe',
                    email: 'jane@example.com',
                    active: true,
                    created_at: new Date()
                }
            ]);

            const result = await userTable.delete({
                where: [
                    { field: 'id', operator: 'IN', value: [1, 2] }
                ] as WhereCondition<TestUser>[]
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify multiple deleted records are returned
            expect(result).toHaveLength(2);
        });

        test('should delete with LIKE operator', async () => {
            // Mock the SQL response
            mockSql.mockResolvedValue([{
                id: 1,
                name: 'John Doe',
                email: 'john@example.com',
                active: true,
                created_at: new Date()
            }]);

            const result = await userTable.delete({
                where: [
                    {
                        field: 'email',
                        operator: 'LIKE',
                        value: '%example.com',
                        pattern: 'endsWith'
                    }
                ] as any // Using any due to TypeScript complexity with pattern
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify the deleted record is returned
            expect(result).toHaveLength(1);
        });

        test('should delete with comparison operators', async () => {
            // Mock the SQL response
            mockSql.mockResolvedValue([{
                id: 1,
                name: 'John Doe',
                email: 'john@example.com',
                active: true,
                created_at: new Date()
            }]);

            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

            const result = await userTable.delete({
                where: [
                    { field: 'created_at', operator: '>', value: oneWeekAgo }
                ] as WhereCondition<TestUser>[]
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify the deleted record is returned
            expect(result).toHaveLength(1);
        });
    });

    describe('Error handling', () => {
        test('should throw QueryError for missing where condition', async () => {
            await expect(userTable.delete({
                where: {} as any
            })).rejects.toThrow(QueryError);
        });

        test('should throw QueryError for empty array where condition', async () => {
            await expect(userTable.delete({
                where: [] as any
            })).rejects.toThrow(QueryError);
        });

        test('should throw QueryError for undefined where condition', async () => {
            await expect(userTable.delete({
                where: undefined as any
            })).rejects.toThrow(QueryError);
        });

        test('should throw QueryError for null where condition', async () => {
            await expect(userTable.delete({
                where: null as any
            })).rejects.toThrow(QueryError);
        });

        test('should throw QueryError for invalid IN value', async () => {
            await expect(userTable.delete({
                where: [
                    { field: 'id', operator: 'IN', value: [] }
                ] as WhereCondition<TestUser>[]
            })).rejects.toThrow(QueryError);
        });

        test('should throw QueryError for invalid LIKE value', async () => {
            await expect(userTable.delete({
                where: [
                    { field: 'email', operator: 'LIKE', value: 123 as any }
                ] as WhereCondition<TestUser>[]
            })).rejects.toThrow(QueryError);
        });
    });

    describe('Edge cases', () => {
        test('should handle deletion of records that don\'t exist', async () => {
            // Mock empty SQL response (no records found)
            mockSql.mockResolvedValue([]);

            const result = await userTable.delete({
                where: { id: 999 }
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify empty result
            expect(result).toEqual([]);
        });

        test('should support where conditions with null values', async () => {
            // Mock the SQL response
            mockSql.mockResolvedValue([{
                id: 1,
                name: 'John Doe',
                email: null,
                active: true,
                created_at: new Date()
            }]);

            const result = await userTable.delete({
                where: { email: null }
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify the deleted record is returned
            expect(result).toHaveLength(1);
            expect(result[0].email).toBeNull();
        });

        test('should handle deletion of multiple records', async () => {
            // Mock multiple records in SQL response
            mockSql.mockResolvedValue([
                {
                    id: 1,
                    name: 'John Doe',
                    email: 'john@example.com',
                    active: false,
                    created_at: new Date()
                },
                {
                    id: 2,
                    name: 'Jane Doe',
                    email: 'jane@example.com',
                    active: false,
                    created_at: new Date()
                },
                {
                    id: 3,
                    name: 'Bob Smith',
                    email: 'bob@example.com',
                    active: false,
                    created_at: new Date()
                }
            ]);

            const result = await userTable.delete({
                where: { active: false }
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify all deleted records are returned
            expect(result).toHaveLength(3);
        });

        test('should correctly handle Date objects in where conditions', async () => {
            // Mock the SQL response
            mockSql.mockResolvedValue([{
                id: 1,
                name: 'John Doe',
                email: 'john@example.com',
                active: true,
                created_at: new Date('2023-01-01')
            }]);

            const targetDate = new Date('2023-01-01');
            const result = await userTable.delete({
                where: [
                    { field: 'created_at', operator: '=', value: targetDate }
                ] as WhereCondition<TestUser>[]
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();

            // Verify the deleted record is returned
            expect(result).toHaveLength(1);
        });
    });
});
