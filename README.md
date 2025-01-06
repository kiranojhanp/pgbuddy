# PGBuddy

![PGBuddy banner](assets/pg-buddy-banner.png)

**PGBuddy** is your no-nonsense, tiny sidekick for `postgres.js`. At under 30KB, it's like that friend who shows up with exactly what you need, no extra baggage. Perfect for those "I just want a simple CRUD query" moments.

## Features 🌟

- **Type-Safe CRUD Operations**: Fully typed queries with TypeScript for better development experience! 🎯
- **Table-Specific API**: Create dedicated query builders for each table with proper typing! 💪
- **SQL Injection Prevention**: Keeps your queries safer than your phone's face ID 🔒
- **Lightweight and Minimal**: At under 30KB, it's like a backyard barbie – no fancy stuff, just what you need ✨

## Why PGBuddy? 📚

Performing CRUD operations these days is like signing up for a gym membership: you just want to get fit, but suddenly you’re paying for a personal trainer, a nutritionist, and access to an exclusive yoga studio you’ll never attend. ORMs have somehow turned the simple task of interacting with a database into a venture-funded spectacle. Seriously, some of them have raised millions of dollars to do what SQL already does—except with more steps, less control, and a whole lot of hand-holding. Hats off to the founders, though, for convincing investors that wrapping SQL in 37 layers of abstraction deserves that kind of cash. Meanwhile, all you wanted was to insert a row.

And here’s the kicker: with that kind of funding, you’d think these ORMs would also walk your dog, brew your coffee, and maybe write better code for you. But no. Instead, you get a stack trace so long it could wrap around the Earth when something inevitably goes wrong. And what’s SQL doing during all this chaos? Just sitting there, unbothered, waiting to save you from this madness.

That’s why articles like [“Stop Using Knex.js”](https://gajus.medium.com/stop-using-knex-js-and-earn-30-bf410349856c) by Gajus, the creator of Slonik, resonate with me so much. He argues that SQL query builders are often an anti-pattern. His advice is quite simple: use a query builder only when you actually need to generate dynamic queries, and rely on raw SQL for everything else. SQL is powerful, expressive, and—when used directly—cuts out the middleman.

This hit home for me because I’d always wondered why developers seemed allergic to SQL, flocking to ORMs like they were the only way to avoid drowning in database operations. Back when I worked at a remote dev agency, the CTO had a similar view. So, we ditched ORMs like TypeORM and Kysely in favor of Slonik. His argument? The additional abstraction was unnecessary. So, we switched to Slonik, wrote raw SQL for most tasks, and used its type safety and validation to keep things clean. It worked beautifully.

Fast forward to today, and `postgres.js` has become a popular choice in the JavaScript database ecosystem. It’s fast, lightweight, and functions as both a client and a driver, removing the need for additional dependencies like pg. Its use of JavaScript template literals for writing safe SQL queries feels intuitive and effective. However, as I worked with it, I encountered a familiar challenge: the repetitive nature of writing the same boilerplate CRUD operations for every project.

That’s where **PGBuddy 🐶** comes in. It’s designed to streamline these repetitive tasks, providing an efficient way to handle basic CRUD operations while letting developers focus on writing more meaningful and complex SQL queries. It’s not an attempt to add another heavy layer of abstraction but a small utility aimed at improving developer experience for common operations.

Sure, you might say, “Great, another abstraction—just what we needed.” Fair enough! Don’t use it if you don’t want to. But here’s the thing: you’re going to write this functionality eventually. When you find yourself deep in a pile of repetitive CRUD code, just remember that PGBuddy could’ve saved you many hours. And when you finally come around, I’ll be here to welcome you to the club. 😉

## Installation 🚀

```bash
npm install postgres@^3.4.5
npm install pgbuddy
```

## Usage 🛠️

### Initial Setup

```typescript
import postgres from "postgres";
import { PgBuddy } from "pgbuddy";

// Define table type
interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

// Initialize
const sql = postgres({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  username: env.DB_USER,
  password: env.DB_PASSWORD,
});

const db = new PgBuddy(sql);
const userTable = db.table<User>("users");

// Example operations
async function examples() {
  // Select with search and pagination
  const users = await userTable.select({
    select: ["id", "name", "email"],
    search: { columns: ["name", "email"], query: "john" },
    take: 10,
    skip: 0,
    orderBy: [
      { column: "name", direction: "ASC" },
      { column: "email", direction: "DESC" }
    ]
  });

  // Insert with returning values
  const newUser = await userTable.insert({
    data: { name: "John", email: "john@example.com" },
    select: ["id", "name"]
  });

  // Update with conditions
  const updated = await userTable.update({
    data: { role: "admin" },
    where: { id: 1 },
    select: ["id", "name", "role"]
  });

  // Delete with conditions
  const deleted = await userTable.delete({
    where: { role: "guest" },
    select: ["id", "name"]
  });
}
```

### Select Queries

#### Basic Select

```typescript
const users = await userTable.select({
  select: ["id", "name", "email"],  // TypeScript will ensure these columns exist
});
```

#### Search & Pagination

```typescript
const users = await userTable.select({
  select: ["id", "name", "email"],
  search: { columns: ["name", "email"], query: "john" },
  skip: 0,
  take: 10,
});
```

#### Sorting

```typescript
const users = await userTable.select({
  select: ["id", "name"],
  orderBy: [
    { column: "id", direction: "ASC" },
    { column: "name", direction: "DESC" }
  ]
});
```

### Insert Queries

#### Single Record

```typescript
const user = await userTable.insert({
  data: { name: "John", email: "john@example.com" },  // TypeScript validates the shape
  select: ["id", "name", "email"],
});
```

#### Bulk Insert

```typescript
const users = await userTable.insert({
  data: [
    { name: "John", email: "john@example.com" },
    { name: "Jane", email: "jane@example.com" },
  ],
});
```

### Update Queries

#### Update One Record

```typescript
const updated = await userTable.update({
  data: { name: "Updated Name" },
  where: { id: 1 },  // Type-safe conditions
  select: ["id", "name", "email"],
});
```

#### Update Many Records

```typescript
const deactivated = await userTable.update({
  data: { active: false },
  where: { role: "guest" },
  select: ["id", "name"],
});
```

### Delete Queries

#### Delete One Record

```typescript
const deleted = await userTable.delete({
  where: { id: 1 },
  select: ["id", "name"],
});
```

#### Delete Multiple Records

```typescript
const deleted = await userTable.delete({
  where: { status: "inactive" },
  select: ["id", "name"],
});
```

## API Reference 📚

### `table<T>(tableName: string)`

Creates a type-safe table context for performing operations on a specific table.

#### Parameters
- `tableName` (string, required): The name of the database table
- `T` (generic type): The TypeScript interface representing your table structure

#### Returns
Object with the following methods:
- `select`
- `insert`
- `update`
- `delete`

### `select(params: SelectParams<T>)`

Constructs a `SELECT` query with optional search, sort, and pagination features.

#### Parameters

- `columns` (Array<keyof T>, optional): List of type-safe column names. Defaults to `['*']`
- `search` (object, optional):
  - `columns` (Array<KeysMatching<T, string>>): Array of string column names to search
  - `query` (string): The search pattern
- `orderBy` (string, optional): SQL `ORDER BY` clause (e.g., `"name ASC"`)
- `page` (number, optional): The page number for pagination. Defaults to `1`
- `pageSize` (number, optional): Number of results per page. Defaults to `10`

#### Returns

- `Promise<Partial<T>[]>`: Array of typed results

### `insert(params: InsertParams<T>)`

Executes an `INSERT` query with proper typing for the data structure.

#### Parameters

- `data` (Partial<T> | Partial<T>[], required): Single record or array of records to insert
- `returning` (Array<keyof T>, optional): Columns to return after insertion. Defaults to `['*']`

#### Returns

- `Promise<Partial<T>>`: The inserted record with specified returning fields

### `update(params: ModifyParams<T>)`

Executes a type-safe `UPDATE` query.

#### Parameters

- `data` (Partial<T>, required): Column-value pairs to update
- `conditions` (Partial<T>, required): Type-safe filtering conditions
- `returning` (Array<keyof T>, optional): Columns to return after update. Defaults to `['*']`

#### Returns

- `Promise<Partial<T>>`: The updated record with specified returning fields

### `delete(params: ModifyParams<T>)`

Executes a type-safe `DELETE` query.

#### Parameters

- `conditions` (Partial<T>, required): Type-safe filtering conditions
- `returning` (Array<keyof T>, optional): Columns to return after deletion. Defaults to `['*']`

#### Returns

- `Promise<Partial<T>>`: The deleted record with specified returning fields

## Coming Soon™️ 🔮

- Explicit bulk queries : `insertMany`, `updateMany`, `deleteMany`
- Upsert functionality support
- Soft Deletes support
- Advanced Filter support for select

## Contributing

We welcome contributions! Feel free to open an issue or submit a pull request.

### Development

1. Clone the repository:
   ```bash
   git clone https://github.com/kiranojhanp/pgbuddy.git
   cd pgbuddy
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run tests:
   ```bash
   npm test
   ```

## License 📜

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.

## Shoutouts 🙌

Built on top of [Postgres.js](https://github.com/porsager/postgres)