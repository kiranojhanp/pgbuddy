import { jest } from '@jest/globals';

/**
 * Creates a mock postgres.js SQL instance for testing
 * 
 * This is intentionally using 'any' to bypass TypeScript issues.
 * At runtime, this will provide the necessary SQL mock functionality.
 */
export function createMockSql(): any {
    const sqlMock: any = jest.fn();

    // Add the unsafe method used by PgBuddy
    sqlMock.unsafe = jest.fn(() => 'UNSAFE_SQL');

    return sqlMock;
}

/**
 * Test User interface for use in tests
 */
export interface TestUser {
    id: number;
    name: string;
    email: string | null;
    active: boolean;
    created_at: Date;
}

/**
 * Test Product interface for use in tests
 */
export interface TestProduct {
    id: number;
    name: string;
    price: number;
    stock: number;
    created_at: Date;
}
