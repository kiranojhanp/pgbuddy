# Chainable API

## Installation

```bash
npm install pgbuddy postgres
```

## Setup

```typescript
import postgres from "postgres";
import { z } from "zod";
import { PgBuddyClient } from "pgbuddy";

const sql = postgres("postgres://username:password@localhost:5432/dbname");
const db = new PgBuddyClient(sql);
```

## Defining Tables

```typescript
const UserSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  email: z.string().email(),
  status: z.enum(["active", "inactive"]),
  created_at: z.date(),
});

const users = db.table("users", UserSchema);
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
const firstUser = await users
  .where({ status: "active" })
  .orderBy([{ column: "created_at", direction: "DESC" }])
  .findFirst();
```

### Find Unique

```typescript
// Throws if more than one record matches
const uniqueUser = await users.where({ id: 1 }).findUnique();
```

## Create, Update, Delete

### Create

```typescript
const newUser = await users.create({
  name: "John Doe",
  email: "john@example.com",
  status: "active",
  created_at: new Date(),
});

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
// Returns an array of updated records
const updatedUsers = await users.where({ id: 1 }).update({ status: "inactive" });
const [updatedUser] = updatedUsers;
```

### Delete

```typescript
// Returns an array of deleted records
const deletedUsers = await users.where({ id: 1 }).delete();
const [deletedUser] = deletedUsers;
```

## Count

```typescript
const userCount = await users.where({ status: "active" }).count();
```

## Advanced Where Conditions

```typescript
const advancedQuery = await users
  .where([
    { field: "name", operator: "LIKE", value: "John", pattern: "startsWith" },
    { field: "created_at", operator: ">", value: new Date("2023-01-01") },
  ])
  .findMany();
```

## Available Operators

- `=`, `!=`, `>`, `<`, `>=`, `<=`
- `LIKE`, `ILIKE` (with optional patterns: `startsWith`, `endsWith`, `contains`, `exact`)
- `IN`
- `IS NULL`, `IS NOT NULL`

## Error Handling

Two error types are thrown:

- `TableError` — thrown when table configuration is invalid
- `QueryError` — thrown for invalid queries, missing `where` on mutations, or multiple results from `findUnique`

```typescript
try {
  const user = await users.where({ id: 999 }).findUnique();
} catch (error) {
  if (error instanceof QueryError) {
    console.error("Query error:", error.message);
  } else {
    console.error("Unexpected error:", error);
  }
}
```
