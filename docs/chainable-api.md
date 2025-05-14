# PgBuddy - ```typescript

import postgres from "postgres";
import { PgBuddyClient } from "pgbuddy";

// PostgreSQL connection
const sql = postgres("postgres://username:password@localhost:5432/dbname");

// Create PgBuddyClient instance
const db = new PgBuddyClient(sql); API

This document explains the new chainable API in PgBuddy.

## Installation

```bash
npm install pgbuddy postgres
```

## Setup

```typescript
import postgres from "postgres";
import { PgClient } from "pgbuddy";

// Create postgres.js connection
const sql = postgres("postgres://username:password@localhost:5432/dbname");

// Create PgClient instance
const db = new PgClient(sql);
```

## Defining Tables

```typescript
// Define your table type
interface User {
  id: number;
  name: string;
  email: string;
  status: "active" | "inactive";
  created_at: Date;
}

// Define table
const users = db.table<User>("users");
```

## Find Operations

### Find Many

```typescript
// Find all records
const allUsers = await users.findMany();

// Find with conditions
const activeUsers = await users.where({ status: "active" }).findMany();

// Select specific fields
const userEmails = await users.select(["id", "email"]).findMany();

// With pagination and sorting
const paginatedUsers = await users
  .skip(10)
  .take(5)
  .orderBy([{ column: "created_at", direction: "DESC" }])
  .findMany();
```

### Find First

```typescript
// Find first matching record
const firstUser = await users
  .where({ status: "active" })
  .orderBy([{ column: "created_at", direction: "DESC" }])
  .findFirst();
```

### Find Unique

```typescript
// Find a unique record (throws if multiple found)
const uniqueUser = await users.where({ id: 1 }).findUnique();
```

## Create, Update, Delete

### Create

```typescript
// Create a single record
const newUser = await users.create({
  name: "John Doe",
  email: "john@example.com",
  status: "active",
  created_at: new Date(),
});

// Create multiple records
const newUsers = await users.createMany([
  {
    name: "John Doe",
    email: "john@example.com",
    status: "active",
    created_at: new Date(),
  },
  {
    name: "Jane Smith",
    email: "jane@example.com",
    status: "active",
    created_at: new Date(),
  },
]);
```

### Update

```typescript
// Update records
const updatedUser = await users.where({ id: 1 }).update({ status: "inactive" });
```

### Delete

```typescript
// Delete records
const deletedUser = await users.where({ id: 1 }).delete();
```

## Count

```typescript
// Count records
const userCount = await users.where({ status: "active" }).count();
```

## Advanced Where Conditions

```typescript
// Advanced filtering
const advancedQuery = await users
  .where([
    { field: "name", operator: "LIKE", value: "John", pattern: "startsWith" },
    { field: "created_at", operator: ">", value: new Date("2023-01-01") },
  ])
  .findMany();
```

## Operators

Available operators:

- `=`, `!=`, `>`, `<`, `>=`, `<=`
- `LIKE`, `ILIKE` (with optional patterns: `startsWith`, `endsWith`, `contains`, `exact`)
- `IN`
- `IS NULL`, `IS NOT NULL`

## Error Handling

The library throws typed errors for various conditions:

- `TableError`: For table-related errors
- `QueryError`: For query-related errors

```typescript
try {
  const user = await users.where({ id: 999 }).findUnique();
  // Use user data
} catch (error) {
  if (error instanceof QueryError) {
    console.error("Query error:", error.message);
  } else {
    console.error("Unexpected error:", error);
  }
}
```

## Migration from Legacy API

The legacy `PgBuddy` class is still available but marked as deprecated. For new code, use the `PgBuddyClient` class which provides the chainable interface.

Legacy:

```typescript
const pgBuddy = new PgBuddy(sql);
const result = await pgBuddy.table("users").select({
  where: { status: "active" },
  take: 10,
});
```

New:

```typescript
const db = new PgBuddyClient(sql);
const result = await db
  .table("users")
  .where({ status: "active" })
  .take(10)
  .findMany();
```
