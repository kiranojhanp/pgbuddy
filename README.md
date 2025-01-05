# PGBuddy

![PGBuddy banner](assets/pg-buddy-banner.png)

**PGBuddy** is your no-nonsense, tiny sidekick for `postgres.js`. At under 30KB, it's like that friend who shows up with exactly what you need, no extra baggage. Perfect for those "I just want a simple CRUD query" moments.

## Features 🌟

- **Simple CRUD Support**: Just the essentials you need, nothing you don't! 🎯
- **Focused Scope**: In a world of Swiss Army knives, PGBuddy is your trusty pocket knife – small but mighty! 💪
- **SQL Injection Prevention**: Keeps your queries safer than your phone's face ID 🔒
- **Lightweight and Minimal**: At under 30KB, it's like a backyard barbie – no fancy stuff, just what you need ✨

## Installation 🚀

```bash
npm install postgres@^3.4.5
npm install pgbuddy
```

## Usage 🛠️

### Initial Setup

```typescript
import postgres from "postgres";
import { PGBuddy } from "pgbuddy";

const sql = postgres({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  username: env.DB_USER,
  password: env.DB_PASSWORD,
});

const db = new PGBuddy(sql);
```

### Select Queries

#### The Basic Stuff

```typescript
const result = db.select({
  table: "users",
  columns: ["id", "name", "email"],
});
console.log(result);
```

#### Search & Pagination

```typescript
const result = db.select({
  table: "users",
  columns: ["id", "name", "email"],
  search: { columns: ["name", "email"], query: "john" },
  page: 2,
  pageSize: 5,
});
console.log(result);
```

#### Sorting

```typescript
const result = db.select({
  table: "users",
  columns: ["id", "name"],
  orderBy: "name ASC",
});
console.log(result);
```

### Insert Queries

#### Single Record

```typescript
const result = await db.insert({
  table: "users",
  data: { name: "John", email: "john@example.com" },
  returning: ["id", "name", "email"],
});
console.log(result);
```

#### Bulk Insert

```typescript
const result = await db.insert({
  table: "users",
  data: [
    { name: "John", email: "john@example.com" },
    { name: "Jane", email: "jane@example.com" },
  ],
});
console.log(result);
```

### Update Queries

#### Update One Record

```typescript
const result = await db.update({
  table: "users",
  data: { name: "Updated Name", email: "updated@example.com" },
  conditions: { id: 1 },
  returning: ["id", "name", "email", "updated_at"],
});
console.log(result);
```

#### Update Many Records

```typescript
const result = await db.update({
  table: "users",
  data: { active: false },
  conditions: { role: "guest" },
  returning: ["id", "name"],
});
console.log(result);
```

### Delete Queries

#### Delete One Record

```typescript
const result = await db.delete({
  table: "users",
  conditions: { id: 1 },
  returning: ["id", "name"],
});
console.log(result);
```

#### Delete Multiple Records

```typescript
const result = await db.delete({
  table: "users",
  conditions: { status: "inactive" },
  returning: ["id", "name"],
});
console.log(result);
```

## API Reference 📚

### `select(params: SelectParams): PaginatedQueryResult`

Constructs a `SELECT` query with optional search, sort, and pagination features.

#### Parameters

- `table` (string, required): The table name to query.
- `columns` (string[], optional): List of columns to include in the result. Defaults to `['*']`.
- `search` (object, optional):
  - `columns` (string[]): Array of column names to search.
  - `query` (string): The search pattern.
- `orderBy` (string, optional): SQL `ORDER BY` clause (e.g., `"name ASC"`).
- `page` (number, optional): The page number for pagination. Defaults to `1`.
- `pageSize` (number, optional): Number of results per page. Defaults to `10`.

#### Returns

- `PaginatedQueryResult`:
  - `queries` (string[]): The constructed SQL query strings.
  - `values` (any[]): The parameterized values for the query.

### `insert(params: QueryParams): Promise<any>`

Executes an `INSERT` query for adding records to a database table. Supports single or bulk insert operations.

#### Parameters

- `table` (string, required): The table name to insert into.
- `data` (object | object[], required): Single record or array of records to insert.
- `returning` (string[], optional): Columns to return after insertion. Defaults to `['*']`.
- `debug` (boolean, optional): Logs the constructed query for debugging purposes. Defaults to `false`.

#### Returns

- `Promise<any>`: The result of the insert operation, including the specified returning fields.

### `update(params: QueryParams): Promise<any>`

Executes an `UPDATE` query to modify records in a database table. Supports filtering conditions and returning fields.

#### Parameters

- `table` (string, required): The table name to update.
- `data` (object, required): Column-value pairs to update.
- `conditions` (object, required): Filtering conditions to identify records for update.
- `returning` (string[], optional): Columns to return after the update. Defaults to `['*']`.
- `debug` (boolean, optional): Logs the constructed query for debugging purposes. Defaults to `false`.

#### Returns

- `Promise<any>`: The result of the update operation, including the specified returning fields.

### `delete(params: Omit<QueryParams, "data">): Promise<any>`

Deletes records in a specified table that match given conditions.

#### Parameters

- `table` (string, required): The table name from which to delete records.
- `conditions` (object, required): Filtering conditions to identify records for deletion.
- `returning` (string[], optional): Columns to return after deletion. Defaults to `['*']`.
- `debug` (boolean, optional): Logs the constructed query for debugging purposes. Defaults to `false`.

#### Returns

- `Promise<any>`: The result of the delete operation, including the specified returning fields.

## Coming Soon™️ 🔮

- Upsert functionality support
- Soft Deletes support
- Improved Typesafety
- Advanced Filter support for select
- Simplified and intuitive syntax for queries
- Write migration in typescript

## License 📜

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.

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
