# EasyPG

**EasyPG** is a set of lightweight helper functions for Postgres.js designed to make writing simple CRUD operations quick and painless. It is not intended to replace raw SQL for complex queries or become a full-fledged query builder. Instead, EasyPG focuses on simplicity, allowing you to easily handle straightforward database interactions.

---

## Features

- **Simple CRUD Support**: Simplifies common database operations like search, sorting, and pagination.
- **Focused Scope**: Aims to assist with simple queries without overcomplicating things.
- **SQL Injection Prevention**: Leverages Postgres.js's tagged template literals for safety.
- **Lightweight and Minimal**: Designed to complement, not replace, raw SQL queries.

---

## Installation

```bash
npm install easy-pg
```

---

## Usage

### Import and Initialize

```typescript
import postgres from "postgres";
import { EasyPG } from "easy-pg";

const sql = postgres();
const db = new EasyPG(sql);
```

### Select Queries

#### Basic Query
```typescript
const result = db.select({
  table: "users",
  columns: ["id", "name", "email"],
});
console.log(result);
```

#### Search with Pagination
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

---

## API Reference

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

---

## Example Projects

### Basic Setup
```typescript
import postgres from "postgres";
import { EasyPG } from "easy-pg";

const sql = postgres();
const db = new EasyPG(sql);

const users = db.select({
  table: "users",
  columns: ["id", "name"],
});

console.log(users);
```

---

## Contributing

We welcome contributions! Feel free to open an issue or submit a pull request.

### Development

1. Clone the repository:
   ```bash
   git clone https://github.com/kiranojhanp/easy-pg.git
   cd easy-pg
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run tests:
   ```bash
   npm test
   ```

---

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.

---

## Acknowledgments

Built on top of [Postgres.js](https://github.com/porsager/postgres).
