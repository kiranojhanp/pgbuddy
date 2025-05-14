import { PgBuddy } from '../../src';
import { QueryError } from '../../src/errors';
import { createMockSql, TestUser } from '../test-utils';
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import type { WhereCondition } from '../../src/types';

describe('Update Operations', () => {
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

    describe('Basic update functionality', () => {
        test('should update a record with simple where condition', async () => {
            const updatedData = {
                active: false
            };

            // Define the expected response
            const mockResponse = [{
                id: 1,
                name: 'John Doe',
                email: 'john@example.com',
                active: false,
                created_at: new Date()
            }];

            // Mock the SQL response
            mockSql.mockResolvedValue(mockResponse);

            const result = await userTable.update({
                data: updatedData,
                where: { id: 1 }
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();
            // Verify returned data
            expect(result).toEqual(mockResponse);
            expect(result[0].active).toBe(false);
        });

        test('should update multiple fields at once', async () => {
            const updatedData = {
                name: 'Jane Smith',
                email: 'jane@example.com',
                active: false
            };

            // Define the expected response
            const mockResponse = [{
                id: 1,
                name: 'Jane Smith',
                email: 'jane@example.com',
                active: false,
                created_at: new Date()
            }];

            // Mock the SQL response
            mockSql.mockResolvedValue(mockResponse);

            const result = await userTable.update({
                data: updatedData,
                where: { id: 1 }
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();
            // Verify all fields were updated
            expect(result).toEqual(mockResponse);
            expect(result[0].name).toBe('Jane Smith');
            expect(result[0].email).toBe('jane@example.com');
            expect(result[0].active).toBe(false);
        });

        test('should return only selected fields when select is specified', async () => {
            const updatedData = {
                active: false
            };

            // Define the expected response with just the id field
            const mockResponse = [{ id: 1 }];

            // Mock the SQL response
            mockSql.mockResolvedValue(mockResponse);

            const result = await userTable.update({
                data: updatedData,
                where: { id: 1 },
                select: ['id']
            });

            // Verify result only has the selected field
            expect(result).toEqual(mockResponse);
            expect(mockSql).toHaveBeenCalled();
        });

        test('should support null values in data', async () => {
            const updatedData = {
                email: null
            };

            // Define the expected response
            const mockResponse = [{
                id: 1,
                name: 'John Doe',
                email: null,
                active: true,
                created_at: new Date()
            }];

            // Mock the SQL response
            mockSql.mockResolvedValue(mockResponse);

            const result = await userTable.update({
                data: updatedData,
                where: { id: 1 }
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();
            // Verify field was set to null
            expect(result).toEqual(mockResponse);
            expect(result[0].email).toBeNull();
        });
    });

    describe('Advanced where conditions', () => {
        test('should update with complex where conditions', async () => {
            const updatedData = {
                active: false
            };

            // Define the expected response
            const mockResponse = [{
                id: 1,
                name: 'John Doe',
                email: 'john@example.com',
                active: false,
                created_at: new Date()
            }];

            // Mock the SQL response
            mockSql.mockResolvedValue(mockResponse);

            const result = await userTable.update({
                data: updatedData,
                where: [
                    { field: 'email', operator: '=', value: 'john@example.com' }
                ] as WhereCondition<TestUser>[]
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();
            expect(result).toEqual(mockResponse);
        });

        test('should update with multiple complex where conditions', async () => {
            const updatedData = {
                active: false
            };

            // Define the expected response
            const mockResponse = [{
                id: 1,
                name: 'John Doe',
                email: 'john@example.com',
                active: false,
                created_at: new Date()
            }];

            // Mock the SQL response
            mockSql.mockResolvedValue(mockResponse);

            const result = await userTable.update({
                data: updatedData,
                where: [
                    { field: 'email', operator: '=', value: 'john@example.com' },
                    { field: 'active', operator: '=', value: true }
                ] as WhereCondition<TestUser>[]
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();
            expect(result).toEqual(mockResponse);
        });

        test('should update with complex conditions using different operators', async () => {
            const updatedData = {
                active: false
            };

            // Define the expected response
            const mockResponse = [{
                id: 1,
                name: 'John Doe',
                email: 'john@example.com',
                active: false,
                created_at: new Date()
            }];

            // Mock the SQL response
            mockSql.mockResolvedValue(mockResponse);

            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

            const result = await userTable.update({
                data: updatedData,
                where: [
                    { field: 'email', operator: 'LIKE', value: '%example.com', pattern: 'contains' },
                    { field: 'created_at', operator: '>', value: oneWeekAgo }
                ] as WhereCondition<TestUser>[]
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();
            expect(result).toEqual(mockResponse);
        });

        test('should update with IS NULL condition', async () => {
            const updatedData = {
                active: false
            };

            // Define the expected response
            const mockResponse = [{
                id: 2,
                name: 'Jane Doe',
                email: null,
                active: false,
                created_at: new Date()
            }];

            // Mock the SQL response
            mockSql.mockResolvedValue(mockResponse);

            const result = await userTable.update({
                data: updatedData,
                where: [
                    { field: 'email', operator: 'IS NULL' }
                ] as WhereCondition<TestUser>[]
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();
            expect(result).toEqual(mockResponse);
        });

        test('should update with IN condition', async () => {
            const updatedData = {
                active: false
            };

            // Define the expected response
            const mockResponse = [
                {
                    id: 1,
                    name: 'John Doe',
                    email: 'john@example.com',
                    active: false,
                    created_at: new Date()
                },
                {
                    id: 2,
                    name: 'Jane Smith',
                    email: 'jane@example.com',
                    active: false,
                    created_at: new Date()
                }
            ];

            // Mock the SQL response
            mockSql.mockResolvedValue(mockResponse);

            const result = await userTable.update({
                data: updatedData,
                where: [
                    { field: 'id', operator: 'IN', value: [1, 2] }
                ] as WhereCondition<TestUser>[]
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();
            expect(result).toEqual(mockResponse);
        });
    });

    describe('Error handling', () => {
        // For error tests, we'll use different mocking approach since most errors 
        // are thrown by PgBuddy before SQL is called

        test('should throw QueryError for missing where condition', async () => {
            const updatedData = {
                active: false
            };

            await expect(userTable.update({
                data: updatedData,
                where: {} as any
            })).rejects.toThrow(QueryError);
        });

        test('should throw QueryError for null data', async () => {
            await expect(userTable.update({
                data: null as any,
                where: { id: 1 }
            })).rejects.toThrow(QueryError);
        });

        test('should throw QueryError for empty data', async () => {
            await expect(userTable.update({
                data: {},
                where: { id: 1 }
            })).rejects.toThrow(QueryError);
        });

        test('should throw QueryError for undefined data', async () => {
            await expect(userTable.update({
                data: undefined as any,
                where: { id: 1 }
            })).rejects.toThrow(QueryError);
        });

        test('should throw QueryError for empty array where condition', async () => {
            const updatedData = {
                active: false
            };

            await expect(userTable.update({
                data: updatedData,
                where: [] as any
            })).rejects.toThrow(QueryError);
        });

        test('should throw QueryError for invalid IN condition', async () => {
            const updatedData = {
                active: false
            };

            await expect(userTable.update({
                data: updatedData,
                where: [
                    { field: 'id', operator: 'IN', value: [] }
                ] as WhereCondition<TestUser>[]
            })).rejects.toThrow(QueryError);
        });

        test('should throw QueryError for invalid LIKE value', async () => {
            const updatedData = {
                active: false
            };

            await expect(userTable.update({
                data: updatedData,
                where: [
                    { field: 'email', operator: 'LIKE', value: 123 as any }
                ] as WhereCondition<TestUser>[]
            })).rejects.toThrow(QueryError);
        });
    });

    describe('Edge cases', () => {
        test('should correctly handle Date objects in data', async () => {
            const now = new Date();
            const updatedData = {
                created_at: now
            };

            // Define the expected response
            const mockResponse = [{
                id: 1,
                name: 'John Doe',
                email: 'john@example.com',
                active: true,
                created_at: now
            }];

            // Mock the SQL response
            mockSql.mockResolvedValue(mockResponse);

            const result = await userTable.update({
                data: updatedData,
                where: { id: 1 }
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();
            // Verify date was updated
            expect(result).toEqual(mockResponse);
            expect(result[0].created_at).toEqual(now);
        });

        test('should handle boolean values in data', async () => {
            const updatedData = {
                active: true
            };

            // Define the expected response
            const mockResponse = [{
                id: 1,
                name: 'John Doe',
                email: 'john@example.com',
                active: true,
                created_at: new Date()
            }];

            // Mock the SQL response
            mockSql.mockResolvedValue(mockResponse);

            const result = await userTable.update({
                data: updatedData,
                where: { id: 1 }
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();
            // Verify boolean was updated
            expect(result).toEqual(mockResponse);
            expect(result[0].active).toBe(true);
        });

        test('should handle updating a record that doesn\'t exist', async () => {
            const updatedData = {
                active: false
            };

            // Define an empty response to simulate no records found
            const mockResponse: any[] = [];

            // Mock the SQL response
            mockSql.mockResolvedValue(mockResponse);

            const result = await userTable.update({
                data: updatedData,
                where: { id: 999 }
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();
            // Verify empty result
            expect(result).toEqual([]);
        });

        test('should support where condition with null value', async () => {
            const updatedData = {
                active: false
            };

            // Define the expected response
            const mockResponse = [{
                id: 1,
                name: 'John Doe',
                email: null,
                active: false,
                created_at: new Date()
            }];

            // Mock the SQL response
            mockSql.mockResolvedValue(mockResponse);

            const result = await userTable.update({
                data: updatedData,
                where: { email: null }
            });

            // Verify SQL was called
            expect(mockSql).toHaveBeenCalled();
            expect(result).toEqual(mockResponse);
        });
    });
});
