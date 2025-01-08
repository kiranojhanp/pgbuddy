# PGBuddy

![PGBuddy banner](assets/pg-buddy-banner.png)

**PGBuddy** is your no-nonsense, tiny sidekick for `postgres.js`. At under 30KB, it's like that friend who shows up with exactly what you need, no extra baggage.

## Features 🌟

- **Type-Safe CRUD Operations**: Write queries with confidence using full TypeScript support! 🎯
- **Table-Specific API**: Create dedicated query builders for each table with proper typing! 💪
- **SQL Injection Prevention**: Built-in protection using postgres.js's safe query building 🔒
- **Advanced Filtering**: Rich querying capabilities with support for complex conditions 🎯
- **Smart Pagination**: Efficient data handling with skip/take pagination 📚
- **Flexible Sorting**: Multi-column sorting with type-safe column selection 📋
- **Lightweight and Minimal**: No bloat, just pure PostgreSQL goodness ✨

## Why PGBuddy? 📚

Performing CRUD operations these days is like signing up for a gym membership: you just want to get fit, but suddenly you’re paying for a personal trainer, a nutritionist, and access to an exclusive yoga studio you’ll never attend. ORMs have somehow turned the simple task of interacting with a database into a venture-funded spectacle. Seriously, some of them have raised millions of dollars to do what SQL already does—except with more steps, less control, and a whole lot of hand-holding. Hats off to the founders, though, for convincing investors that wrapping SQL in 37 layers of abstraction deserves that kind of cash. Meanwhile, all you wanted was to insert a row.

And here’s the kicker: with that kind of funding, you’d think these ORMs would also walk your dog, brew your coffee, and maybe write better code for you. But no. Instead, you get a stack trace so long it could wrap around the Earth when something inevitably goes wrong. And what’s SQL doing during all this chaos? Just sitting in the corner, waiting to save you from this madness.

`Postgres.js` is a popular library in the JavaScript database ecosystem. It’s fast, lightweight, and functions as both a client and a driver, removing the need for additional dependencies like pg. Its use of JavaScript template literals for writing safe SQL queries feels intuitive and effective. However, as I worked with it, I encountered a familiar challenge: the repetitive nature of writing the same boilerplate CRUD operations for every project.

That’s where **PGBuddy 🐶** comes in. It’s designed to streamline these repetitive tasks, providing an efficient way to handle basic CRUD operations while letting developers focus on writing more meaningful and complex SQL queries. It’s not an attempt to add another heavy layer of abstraction but a small utility aimed at improving developer experience for common operations.

## Getting Started 🚀

### Installation

```bash
npm install postgres@^3.4.5 pgbuddy
```

### Quick Start Guide

Let's build a simple user management system to see PGBuddy in action:

```typescript
// 1. First, define your table structure
interface User {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user" | "guest";
  created_at: Date;
  last_login?: Date;
  is_active: boolean;
}

// 2. Initialize PGBuddy with your postgres connection
const sql = postgres({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  username: env.DB_USER,
  password: env.DB_PASSWORD,
});

const db = new PgBuddy(sql);

// 3. Create a type-safe table handler
const userTable = db.table<User>("users");

// 4. Start using it!
async function userOperations() {
  // Create a new user
  const newUser = await userTable.insert({
    data: {
      name: "John Doe",
      email: "john@example.com",
      role: "user",
      is_active: true
    }
  });

  // Find active admins, sorted by creation date
  const admins = await userTable.select({
    where: [
      { field: "role", operator: "=", value: "admin" },
      { field: "is_active", operator: "=", value: true }
    ],
    orderBy: [{ column: "created_at", direction: "DESC" }]
  });
}
```

## Deep Dive into Features 🤿

### Type Safety with TypeScript

PGBuddy leverages TypeScript to provide compile-time safety for your database operations. Here's how it works:

```typescript
interface Product {
  id: number;
  name: string;
  price: number;
  category_id: number;
  is_available: boolean;
}

const productTable = db.table<Product>("products");

// TypeScript will catch these errors:
await productTable.insert({
  data: {
    name: "Widget",
    price: "10.99", // Error: Type 'string' is not assignable to type 'number'
    category: 1,    // Error: Property 'category' does not exist
  }
});

// TypeScript ensures type-safe column selection
await productTable.select({
  select: ["id", "nam"], // Error: 'nam' does not exist in Product
  where: { prices: 100 } // Error: 'prices' does not exist in Product
});
```

### Advanced Querying Techniques

#### Pattern Matching with LIKE/ILIKE

```typescript
// Search for users with email patterns
const users = await userTable.select({
  where: [
    // Find Gmail users
    { 
      field: "email", 
      operator: "LIKE", 
      value: "@gmail.com", 
      pattern: "endsWith" 
    },
    // Case-insensitive name search
    { 
      field: "name", 
      operator: "ILIKE", 
      value: "john", 
      pattern: "contains" 
    }
  ]
});
```

#### Complex Filtering with Multiple Conditions

```typescript
// Find recently active premium users
const activeUsers = await userTable.select({
  where: [
    { field: "subscription_type", operator: "IN", value: ["premium", "pro"] },
    { field: "last_login", operator: ">=", value: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    { field: "is_verified", operator: "=", value: true },
    { field: "suspended_at", operator: "IS NULL" }
  ],
  orderBy: [
    { column: "last_login", direction: "DESC" }
  ],
  take: 50
});
```

#### Efficient Pagination

```typescript
// Implement an API endpoint with pagination
async function getUsersPaginated(page: number, pageSize: number) {
  const skip = (page - 1) * pageSize;
  
  const [users, totalCount] = await Promise.all([
    userTable.select({
      select: ["id", "name", "email", "role"],
      skip,
      take: pageSize,
      orderBy: [{ column: "name", direction: "ASC" }]
    }),
    userTable.select({
      select: ["id"],
    }).then(results => results.length)
  ]);

  return {
    data: users,
    pagination: {
      currentPage: page,
      pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize)
    }
  };
}
```

### Real-World Use Cases

#### User Authentication System

```typescript
interface AuthUser {
  id: number;
  email: string;
  password_hash: string;
  failed_attempts: number;
  locked_until: Date | null;
  last_login: Date | null;
}

async function handleLogin(email: string, passwordHash: string) {
  const authTable = db.table<AuthUser>("auth_users");
  
  // Find user and check login status
  const [user] = await authTable.select({
    where: [
      { field: "email", operator: "=", value: email },
      { field: "locked_until", operator: "IS NULL" },
      // Or lockout has expired
      { field: "locked_until", operator: "<=", value: new Date() }
    ]
  });

  if (!user) return { success: false, message: "User not found" };

  if (user.password_hash !== passwordHash) {
    // Update failed attempts
    await authTable.update({
      data: {
        failed_attempts: user.failed_attempts + 1,
        locked_until: user.failed_attempts >= 4 
          ? new Date(Date.now() + 30 * 60 * 1000) // Lock for 30 minutes
          : null
      },
      where: { id: user.id }
    });
    return { success: false, message: "Invalid credentials" };
  }

  // Successful login - reset counters and update timestamp
  await authTable.update({
    data: {
      failed_attempts: 0,
      locked_until: null,
      last_login: new Date()
    },
    where: { id: user.id }
  });

  return { success: true, user };
}
```

#### Order Management System

```typescript
interface Order {
  id: number;
  user_id: number;
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled";
  total_amount: number;
  created_at: Date;
  updated_at: Date;
}

interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
}

async function createOrder(userId: number, items: Array<{ productId: number; quantity: number }>) {
  const orderTable = db.table<Order>("orders");
  const orderItemTable = db.table<OrderItem>("order_items");
  const productTable = db.table<Product>("products");

  // Get product prices and check availability
  const products = await productTable.select({
    where: [
      { field: "id", operator: "IN", value: items.map(item => item.productId) },
      { field: "is_available", operator: "=", value: true }
    ]
  });

  if (products.length !== items.length) {
    throw new Error("Some products are not available");
  }

  // Calculate total amount
  const total = items.reduce((sum, item) => {
    const product = products.find(p => p.id === item.productId);
    return sum + (product?.price ?? 0) * item.quantity;
  }, 0);

  // Create order
  const [order] = await orderTable.insert({
    data: {
      user_id: userId,
      status: "pending",
      total_amount: total,
      created_at: new Date(),
      updated_at: new Date()
    }
  });

  // Create order items
  await orderItemTable.insert({
    data: items.map(item => ({
      order_id: order.id,
      product_id: item.productId,
      quantity: item.quantity,
      unit_price: products.find(p => p.id === item.productId)?.price ?? 0
    }))
  });

  return order;
}
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


## TypeScript Best Practices with PGBuddy 🏆

### Type Definition Tips

1. Use strict types for enumerable values:
```typescript
interface User {
  status: "active" | "suspended" | "deleted";
  role: "admin" | "user" | "guest";
}
```

2. Handle nullable fields explicitly:
```typescript
interface Profile {
  id: number;
  user_id: number;
  bio?: string;           // Optional field
  deleted_at: Date | null; // Nullable field
}
```

3. Use utility types for flexibility:
```typescript
// Define base type
interface User {
  id: number;
  email: string;
  password_hash: string;
}

// Define creation type without auto-generated fields
type CreateUser = Omit<User, "id">;

// Use in insert operations
await userTable.insert({
  data: {
    email: "new@example.com",
    password_hash: "hash"
  } satisfies CreateUser
});
```

### Error Handling Patterns

```typescript
async function safeOperation<T>(
  operation: () => Promise<T>
): Promise<[T | null, Error | null]> {
  try {
    const result = await operation();
    return [result, null];
  } catch (error) {
    if (error instanceof QueryError) {
      // Handle PGBuddy-specific errors
      console.error("Query Error:", error.message);
    } else {
      // Handle other errors
      console.error("Unknown Error:", error);
    }
    return [null, error as Error];
  }
}

// Usage example
const [user, error] = await safeOperation(() => 
  userTable.select({
    where: { id: 1 }
  })
);

if (error) {
  // Handle error case
  return;
}

// Use user data safely
console.log(user?.[0]?.name);
```

## Coming Soon™️ 🔮

- Transaction support with type-safe rollbacks
- Relationship handling with type inference
- Batch operations with optimized performance
- Migration assistance utilities
- Query performance analytics
- Custom operator support
- Dynamic query building helpers

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