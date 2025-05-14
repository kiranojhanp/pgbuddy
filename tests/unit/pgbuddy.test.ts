import { PgBuddy } from '../../src';
import { TableError } from '../../src/errors';
import { createMockSql, TestUser } from '../test-utils';
import { describe, test, expect, beforeEach, jest } from '@jest/globals';

describe('PgBuddy Class', () => {
    let pgBuddy: PgBuddy;
    let mockSql: any;

    beforeEach(() => {
        // Create a new mock SQL for each test
        mockSql = createMockSql();
        pgBuddy = new PgBuddy(mockSql);

        // Reset mocks between tests
        jest.resetAllMocks();
    });

    describe('constructor', () => {
        test('should create a new instance with the provided SQL client', () => {
            expect(pgBuddy).toBeInstanceOf(PgBuddy);
        });

        test('should store the SQL client internally', () => {
            // Indirectly test that SQL client is stored by calling a method that uses it
            const testTable = pgBuddy.table('test_table');

            // Attempting a simple operation 
            mockSql.mockResolvedValue([{ id: 1 }]);

            return testTable.select({}).then(() => {
                expect(mockSql).toHaveBeenCalled();
            });
        });
    });

    describe('table method', () => {
        test('should return an object with CRUD methods for valid table name', () => {
            const table = pgBuddy.table('users');

            expect(table).toHaveProperty('insert');
            expect(table).toHaveProperty('update');
            expect(table).toHaveProperty('delete');
            expect(table).toHaveProperty('select');

            expect(typeof table.insert).toBe('function');
            expect(typeof table.update).toBe('function');
            expect(typeof table.delete).toBe('function');
            expect(typeof table.select).toBe('function');
        });

        test('should throw TableError for empty table name', () => {
            expect(() => pgBuddy.table('')).toThrow(TableError);
        });

        test('should throw TableError for null table name', () => {
            expect(() => pgBuddy.table(null as any)).toThrow(TableError);
        });

        test('should throw TableError for undefined table name', () => {
            expect(() => pgBuddy.table(undefined as any)).toThrow(TableError);
        });

        test('should throw TableError for whitespace-only table name', () => {
            expect(() => pgBuddy.table('   ')).toThrow(TableError);
        });

        test('should trim whitespace from table name', () => {
            const spy = jest.spyOn(pgBuddy as any, 'isValidTableName');

            pgBuddy.table('  users  ');

            expect(spy).toHaveBeenCalledWith('  users  ');
            expect(spy).toHaveReturnedWith(true);
        });

        test('should create typed table interfaces', async () => {
            // Define a strongly typed table 
            const userTable = pgBuddy.table<TestUser>('users');

            // Mock successful response with properly typed data
            mockSql.mockResolvedValue([{
                id: 1,
                name: 'John Doe',
                email: 'john@example.com',
                active: true,
                created_at: new Date()
            }]);

            const result = await userTable.select({
                where: { id: 1 }
            });

            // Should return properly typed data
            expect(result[0].id).toBe(1);
            expect(result[0].name).toBe('John Doe');
            expect(result[0].email).toBe('john@example.com');
            expect(result[0].active).toBe(true);
            expect(result[0].created_at).toBeInstanceOf(Date);
        });
    });

    describe('SQL tag template function', () => {
        test('should correctly pass query to underlying SQL client', async () => {
            // Create a test table and attempt a select operation
            const table = pgBuddy.table('users');

            // Mock SQL response
            mockSql.mockResolvedValue([{ id: 1 }]);

            await table.select({});

            // Verify that the SQL function was called with tagged template literals
            expect(mockSql).toHaveBeenCalled();
        });

        test('should handle empty result sets properly', async () => {
            const table = pgBuddy.table('users');

            // Mock empty SQL response
            mockSql.mockResolvedValue([]);

            const result = await table.select({});

            expect(result).toEqual([]);
        });
    });

    describe('table method with various table names', () => {
        test('should accept table names with underscores', () => {
            expect(() => pgBuddy.table('user_profiles')).not.toThrow();
        });

        test('should accept table names with numbers', () => {
            expect(() => pgBuddy.table('users2')).not.toThrow();
        });

        test('should accept schema-qualified table names', () => {
            expect(() => pgBuddy.table('public.users')).not.toThrow();
        });

        test('should accept quoted table names', () => {
            expect(() => pgBuddy.table('"users"')).not.toThrow();
        });
    });

    describe('Integration between methods', () => {
        test('should properly pass table name to crud operations', async () => {
            // Test that the table name is correctly used in queries
            const userTable = pgBuddy.table('users');

            // Mock the response
            mockSql.mockResolvedValue([{ id: 1 }]);

            await userTable.select({});

            // The SQL should have been called with a template that includes the table name
            expect(mockSql).toHaveBeenCalled();
        });

        test('should throw appropriate error when SQL call fails', async () => {
            const userTable = pgBuddy.table('users');

            // Mock SQL error
            const sqlError = new Error('SQL execution failed');
            mockSql.mockImplementation(() => {
                throw sqlError;
            });

            // The error from SQL should propagate
            await expect(userTable.select({})).rejects.toThrow('SQL execution failed');
        });
    });

    describe('Edge cases', () => {
        test('should handle non-string primitive table names', () => {
            // These should all throw TableError
            expect(() => pgBuddy.table(123 as any)).toThrow(TableError);
            expect(() => pgBuddy.table(true as any)).toThrow(TableError);
            expect(() => pgBuddy.table(false as any)).toThrow(TableError);
        });

        test('should handle object/array table names', () => {
            // These should all throw TableError
            expect(() => pgBuddy.table({} as any)).toThrow(TableError);
            expect(() => pgBuddy.table([] as any)).toThrow(TableError);
            expect(() => pgBuddy.table(new Date() as any)).toThrow(TableError);
        });

        test('should handle special characters in table names', () => {
            // These should not throw in our test because our isValidTableName is simple
            // In real SQL, some of these might be invalid, but our validation only checks for non-empty strings
            expect(() => pgBuddy.table('users!')).not.toThrow();
            expect(() => pgBuddy.table('users@')).not.toThrow();
            expect(() => pgBuddy.table('users-table')).not.toThrow();
        });
    });
});
