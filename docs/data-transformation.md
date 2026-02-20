# Case Transformation with postgres.js and PgBuddy

## Overview

As PgBuddy is a thin wrapper that accepts a postgres.js instance, all the features of postgres.js are available to you. The case transformation feature comes from postgres.js itself and here's how to use it's capabilities when working with PgBuddy.

## Setup

First, configure postgres.js with your desired case transformation:

```typescript
// db.ts
import postgres from "postgres";
import { PgBuddyClient } from "pgbuddy";

// Configure postgres.js with case transformation
const sql = postgres({
  host: "localhost",
  database: "mydb",
  transform: postgres.camel  // This is a postgres.js feature
});

// Pass the configured postgres.js instance to PgBuddyClient
const db = new PgBuddyClient(sql);

export { sql, db };
```

## postgres.js Case Transformation Options

postgres.js provides several built-in transformation functions:

### Two-way Transformations
```typescript
postgres({ transform: postgres.camel })   // snake_case ↔ camelCase
postgres({ transform: postgres.pascal })  // snake_case ↔ PascalCase
postgres({ transform: postgres.kebab })   // snake_case ↔ kebab-case
```

### One-way Transformations
```typescript
// Database to Application (snake_case to camelCase)
postgres({ transform: postgres.toCamel })

// Application to Database (camelCase to snake_case)
postgres({ transform: postgres.fromCamel })
```

## Example Usage

```typescript
// Configure postgres.js with camelCase transformation
const sql = postgres({
  host: "localhost",
  database: "mydb",
  transform: postgres.camel
});

// Pass it to PgBuddyClient
const db = new PgBuddyClient(sql);

// For direct postgres.js queries, the transformation will be applied
await sql`
  CREATE TABLE IF NOT EXISTS user_profiles (
    user_id INTEGER,
    first_name TEXT,
    last_name TEXT
  )
`;

// The transformation applies to interpolated values
await sql`INSERT INTO user_profiles ${sql([{ 
  userId: 1,          // Will be transformed to user_id
  firstName: 'John',  // Will be transformed to first_name
  lastName: 'Doe'     // Will be transformed to last_name
}])}`;

// Query results will be transformed back to camelCase
const data = await sql`SELECT user_id, first_name, last_name FROM user_profiles`;
console.log(data[0]); // { userId: 1, firstName: 'John', lastName: 'Doe' }
```

## Important Notes

1. This is a postgres.js feature, not a PgBuddy feature
2. The transformation only applies to postgres.js operations
3. PgBuddy will receive the transformed data from postgres.js

## When to Use This

Use case transformation when:
- Your database uses snake_case but your application uses camelCase
- You want to maintain consistent naming conventions across your application
- You want to avoid manual property name mapping

## Example Application Architecture

```typescript
// db.ts - Database configuration
import postgres from "postgres";
import { PgBuddyClient } from "pgbuddy";

const sql = postgres({
  host: "localhost",
  database: "mydb",
  transform: postgres.camel
});

const db = new PgBuddyClient(sql);

export { sql, db };

// types.ts - Type definitions
interface UserProfile {
  // Use camelCase in your TypeScript types
  userId: number;
  firstName: string;
  lastName: string;
}

// queries.ts - Database queries
import { sql, db } from './db';

// Using raw postgres.js - transformation will be applied
const rawQuery = async () => {
  return sql`SELECT user_id, first_name FROM user_profiles`;
  // Results will be in camelCase: { userId, firstName }
};

// Using PgBuddy - working with the transformed data
const userProfileTable = db.table<UserProfile>('user_profiles');

const pgBuddyQuery = async () => {
  return userProfileTable
    .where({ userId: 1 })
    .findFirst();
};
```

Remember: The case transformation is handled entirely by postgres.js, and PgBuddy simply works with the transformed data that postgres.js provides.
