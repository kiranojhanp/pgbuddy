# PgBuddy Documentation

## Introduction

PgBuddy is a type-safe query builder that works as a wrapper around [postgres.js](https://github.com/porsager/postgres). It provides a higher-level, type-safe interface while maintaining access to all underlying postgres.js functionality.

### Features

- 🛡️ **Type Safety**: Full TypeScript support with strongly typed queries and results
- 🔒 **SQL Injection Prevention**: Built-in protection through parameterized queries
- 🎯 **CRUD Operations**: Simple yet powerful interface for Create, Read, Update, and Delete operations
- 📦 **Minimal Dependencies**: Just a lightweight wrapper over postgres.js
- 🎨 **Flexible Querying**: Support for complex filters, sorting, and pagination
- ⚡ **Full postgres.js Access**: Direct access to all postgres.js features when needed

### Installation

```bash
npm install pgbuddy postgres
# or
yarn add pgbuddy postgres
```

### Quick Start

```typescript
import postgres from 'postgres';
import { PgBuddyClient } from 'pgbuddy';

// Initialize postgres connection
const sql = postgres('postgres://username:password@localhost:5432/dbname');

// Create PgBuddy client
const db = new PgBuddyClient(sql);

// Define your table type
interface User {
  id: number;
  name: string;
  email: string;
  created_at: Date;
}

// Create table interface
const userTable = db.table<User>('users');
```

### Advanced Features

PgBuddy is intentionally designed as a lightweight wrapper that focuses on type safety and common CRUD operations. For advanced PostgreSQL features, you can:

1. **Access the Underlying postgres.js Instance**:
```typescript
const db = new PgBuddyClient(sql);
// Use the sql instance directly for advanced features
const result = await sql`
  WITH RECURSIVE cte AS (...)
  SELECT * FROM cte
`;
```

2. **Use postgres.js Features**:
- Transactions
- Prepared Statements
- Listen/Notify
- Copy From/To
- Custom Types
- And more...

For these advanced features, please refer to the [postgres.js documentation](https://github.com/porsager/postgres).

### Why PgBuddy?

1. **Type Safety First**: 
   - Catch errors at compile time instead of runtime
   - AutoComplete support for table columns and query options
   - Type inference for query results

2. **Developer Experience**:
   - Intuitive API design for common operations
   - Seamless integration with postgres.js
   - No magic, just a thin typescript layer

3. **Safety Features**:
   - SQL injection prevention
   - Input validation
   - Required WHERE clauses for destructive operations

### Relationship with postgres.js

PgBuddy is built on top of postgres.js and:
- Provides type-safe wrappers for common operations
- Maintains full access to postgres.js functionality
- Adds zero overhead to postgres.js performance
- Doesn't modify or limit postgres.js features

For anything not covered by PgBuddy's high-level interface, you can and should use postgres.js directly. This includes:
- Complex queries with CTEs
- Window functions
- Advanced PostgreSQL features
- Custom query optimization
- Connection pooling configuration
- Binary data handling
- Custom type parsers

### Next Steps

- Check out the [CRUD Operations](crud-operations.md) guide
- Learn about complex queries in the [Select Operations](select-operations.md) guide
- Learn about data transformation in the [Data Transformation](data-transformation.md) guide
- Browse the [API Reference](api-reference.md)
- See practical use cases in the [Examples](examples.md)
- Visit the [postgres.js documentation](https://github.com/porsager/postgres) for advanced features
