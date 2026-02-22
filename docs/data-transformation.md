# Case Transformation with postgres.js and PgBuddy

## Overview

PgBuddy is a thin wrapper around a postgres.js instance, so all postgres.js features are available. Case transformation is a postgres.js feature — here's how to use it with PgBuddy.

## Setup

Configure postgres.js with your desired transformation, then pass the instance to `PgBuddyClient`:

```typescript
// db.ts
import postgres from "postgres";
import { PgBuddyClient } from "pgbuddy";

const sql = postgres({
  host: "localhost",
  database: "mydb",
  transform: postgres.camel  // postgres.js feature
});

const db = new PgBuddyClient(sql);

export { sql, db };
```

## postgres.js Transformation Options

### Two-way transformations

```typescript
postgres({ transform: postgres.camel })   // snake_case ↔ camelCase
postgres({ transform: postgres.pascal })  // snake_case ↔ PascalCase
postgres({ transform: postgres.kebab })   // snake_case ↔ kebab-case
```

### One-way transformations

```typescript
// Database → application (snake_case → camelCase)
postgres({ transform: postgres.toCamel })

// Application → database (camelCase → snake_case)
postgres({ transform: postgres.fromCamel })
```

## Example

```typescript
const sql = postgres({
  host: "localhost",
  database: "mydb",
  transform: postgres.camel
});

const db = new PgBuddyClient(sql);

await sql`
  CREATE TABLE IF NOT EXISTS user_profiles (
    user_id INTEGER,
    first_name TEXT,
    last_name TEXT
  )
`;

// Interpolated values are transformed before being sent to the database
await sql`INSERT INTO user_profiles ${sql([{
  userId: 1,          // → user_id
  firstName: 'John',  // → first_name
  lastName: 'Doe'     // → last_name
}])}`;

// Query results come back transformed to camelCase
const data = await sql`SELECT user_id, first_name, last_name FROM user_profiles`;
console.log(data[0]); // { userId: 1, firstName: 'John', lastName: 'Doe' }
```

## Notes

- The transformation is applied by postgres.js, not PgBuddy.
- It only applies to postgres.js operations — PgBuddy receives already-transformed data.
- Use this when your database uses snake_case but your application code uses camelCase.

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
  userId: number;
  firstName: string;
  lastName: string;
}

// queries.ts - Database queries
import { z } from 'zod';
import { sql, db } from './db';

// Raw postgres.js query — transformation is applied automatically
const rawQuery = async () => {
  return sql`SELECT user_id, first_name FROM user_profiles`;
  // Results: { userId, firstName }
};

// PgBuddy query — schema uses camelCase to match the transformed output
const UserProfileSchema = z.object({
  userId: z.number().int(),
  firstName: z.string(),
  lastName: z.string()
});

const userProfileTable = db.table('user_profiles', UserProfileSchema);

const pgBuddyQuery = async () => {
  return userProfileTable
    .where({ userId: 1 })
    .findFirst();
};
```
