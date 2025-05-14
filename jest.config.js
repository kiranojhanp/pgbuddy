/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/tests'],
    collectCoverage: true,
    collectCoverageFrom: ['src/**/*.ts'],
    coverageDirectory: 'coverage',
    testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
    moduleFileExtensions: ['ts', 'js', 'json'],
    modulePathIgnorePatterns: ['<rootDir>/dist/'],
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            isolatedModules: true,
            diagnostics: false // Disable type checking
        }]
    }
};
