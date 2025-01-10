# PgBuddy

A no-nonsense, type-safe and [tiny](https://bundlephobia.com/package/pgbuddy) query builder wrapping `postgres.js`.

![PGBuddy banner](assets/pg-buddy-banner.png)

## Features

- 🛡️ Type-safe queries with TypeScript
- 🔒 SQL injection prevention
- 🎯 Simple CRUD operation builders
- 📦 Thin wrapper over postgres.js

## Installation

```bash
npm install pgbuddy postgres
```

## Quick Start

```typescript
import postgres from 'postgres';
import { PgBuddy } from 'pgbuddy';

const sql = postgres('postgres://username:password@localhost:5432/dbname');
const pgBuddy = new PgBuddy(sql);

interface User {
  id: number;
  email: string;
}

const userTable = pgBuddy.table<User>('users');

// Simple type-safe queries
await userTable.select({
  where: { email: 'user@example.com' }
});
```

## Documentation

PgBuddy provides type-safe wrappers for common database operations. For complete documentation, visit:

- [Introduction](./docs/introduction.md)
- [CRUD Operations](./docs/crud-operations.md)
- [Select Operations](./docs/select-operations.md)
- [API Reference](./docs/api-reference.md)
- [Examples](./docs/examples.md)

## Advanced Features

PgBuddy is a wrapper around postgres.js. For advanced PostgreSQL features like:
- Transactions
- Prepared Statements
- Listen/Notify
- Copy Operations
- Custom Types
- Connection Pooling

Please refer to the [postgres.js documentation](https://github.com/porsager/postgres).

## License

MIT

## Contributing

Contributions welcome! Please read our [contributing guidelines](CONTRIBUTING.md) first.