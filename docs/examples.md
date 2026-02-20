# Examples

## Setup

```typescript
import postgres from 'postgres';
import { z } from 'zod';
import { PgBuddyClient } from 'pgbuddy';

// Database connection
const sql = postgres('postgres://username:password@localhost:5432/dbname');
const db = new PgBuddyClient(sql);

const UserSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  email: z.string().email(),
  status: z.enum(['active', 'inactive']),
  last_login: z.date().nullable(),
  created_at: z.date(),
  updated_at: z.date()
});

type User = z.infer<typeof UserSchema>;
type UserInput = z.input<typeof UserSchema>;

const userTable = db.table('users', UserSchema);
```

## Common Use Cases

### User Management System

```typescript
async function createUser(
  userData: Omit<UserInput, 'id' | 'created_at' | 'updated_at'>
) {
  return userTable.select(['id', 'email']).create(userData);
}

async function deactivateInactiveUsers(daysInactive: number) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

  return userTable
    .where([
      { field: 'last_login', operator: '<', value: cutoffDate },
      { field: 'status', operator: '=', value: 'active' }
    ])
    .update({ status: 'inactive' });
}

async function searchUsers(query: string) {
  return userTable
    .where([
      {
        field: 'name',
        operator: 'LIKE',
        value: query,
        pattern: 'contains'
      }
    ])
    .orderBy([{ column: 'name', direction: 'ASC' }])
    .findMany();
}
```

### Blog Post System

```typescript
const PostSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  content: z.string(),
  author_id: z.number().int(),
  status: z.enum(['draft', 'published', 'archived']),
  publish_date: z.date().nullable(),
  created_at: z.date()
});

type Post = z.infer<typeof PostSchema>;

const postTable = db.table('posts', PostSchema);

// Create draft post
async function createDraft(authorId: number, title: string, content: string) {
  return postTable.create({
    author_id: authorId,
    title,
    content,
    status: 'draft',
    publish_date: null
  });
}

// Publish post
async function publishPost(postId: number) {
  return postTable
    .where({ id: postId })
    .update({
      status: 'published',
      publish_date: new Date()
    });
}

// Get published posts with pagination
async function getPublishedPosts(page: number, pageSize: number) {
  return postTable
    .where({ status: 'published' })
    .orderBy([{ column: 'publish_date', direction: 'DESC' }])
    .take(pageSize)
    .skip((page - 1) * pageSize)
    .findMany();
}
```

### Order Processing System

```typescript
const OrderSchema = z.object({
  id: z.number().int(),
  customer_id: z.number().int(),
  status: z.enum(['pending', 'processing', 'shipped', 'delivered', 'cancelled']),
  total_amount: z.number(),
  created_at: z.date(),
  updated_at: z.date(),
  shipping_address: z.string(),
  tracking_number: z.string().nullable()
});

type Order = z.infer<typeof OrderSchema>;

const orderTable = db.table('orders', OrderSchema);

// Create new order
async function createOrder(customerId: number, amount: number, shippingAddress: string) {
  return orderTable.create({
    customer_id: customerId,
    status: 'pending',
    total_amount: amount,
    shipping_address: shippingAddress,
    tracking_number: null
  });
}

// Update order status
async function updateOrderStatus(orderId: number, status: Order['status'], trackingNumber?: string) {
  return orderTable
    .where({ id: orderId })
    .update({
      status,
      tracking_number: trackingNumber || null,
      updated_at: new Date()
    });
}

// Get customer orders with filters
async function getCustomerOrders(customerId: number, status?: Order['status']) {
  const conditions: Array<WhereCondition<Order>> = [
    { field: 'customer_id', operator: '=', value: customerId }
  ];

  if (status) {
    conditions.push({ field: 'status', operator: '=', value: status });
  }

  return orderTable
    .where(conditions)
    .orderBy([{ column: 'created_at', direction: 'DESC' }])
    .findMany();
}

// Get orders pending shipment
async function getPendingShipments() {
  return orderTable
    .where({ status: 'processing' })
    .orderBy([{ column: 'created_at', direction: 'ASC' }])
    .findMany();
}
```

### Inventory Management System

```typescript
const ProductSchema = z.object({
  id: z.number().int(),
  sku: z.string(),
  name: z.string(),
  description: z.string(),
  price: z.number(),
  stock_quantity: z.number().int(),
  low_stock_threshold: z.number().int(),
  last_restock_date: z.date()
});

type Product = z.infer<typeof ProductSchema>;

const productTable = db.table('products', ProductSchema);

// Update stock levels
async function updateStock(productId: number, quantity: number) {
  return productTable
    .where({ id: productId })
    .update({
      stock_quantity: quantity,
      last_restock_date: new Date()
    });
}

// Get low stock products
async function getLowStockProducts() {
  return productTable
    .where([
      {
        field: 'stock_quantity',
        operator: '<=',
        value: sql`low_stock_threshold`
      }
    ])
    .orderBy([{ column: 'stock_quantity', direction: 'ASC' }])
    .findMany();
}

// Search products
async function searchProducts(query: string) {
  return productTable
    .where([
      {
        field: 'name',
        operator: 'ILIKE',
        value: query,
        pattern: 'contains'
      }
    ])
    .orderBy([{ column: 'name', direction: 'ASC' }])
    .findMany();
}
```

### Event Logging System

```typescript
const EventLogSchema = z.object({
  id: z.number().int(),
  event_type: z.string(),
  severity: z.enum(['info', 'warning', 'error']),
  message: z.string(),
  metadata: z.record(z.any()),
  timestamp: z.date()
});

type EventLog = z.infer<typeof EventLogSchema>;

const eventLogTable = db.table('event_logs', EventLogSchema);

// Log new event
async function logEvent(
  eventType: string,
  severity: EventLog['severity'],
  message: string,
  metadata: Record<string, any> = {}
) {
  return eventLogTable.create({
    event_type: eventType,
    severity,
    message,
    metadata,
    timestamp: new Date()
  });
}

// Get recent errors
async function getRecentErrors(hours: number = 24) {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - hours);

  return eventLogTable
    .where([
      { field: 'severity', operator: '=', value: 'error' },
      { field: 'timestamp', operator: '>', value: cutoff }
    ])
    .orderBy([{ column: 'timestamp', direction: 'DESC' }])
    .findMany();
}

// Get event statistics
async function getEventStats(startDate: Date, endDate: Date) {
  return eventLogTable
    .where([
      { field: 'timestamp', operator: '>=', value: startDate },
      { field: 'timestamp', operator: '<=', value: endDate }
    ])
    .orderBy([
      { column: 'event_type', direction: 'ASC' },
      { column: 'severity', direction: 'ASC' }
    ])
    .findMany();
}
```

## Error Handling Examples

```typescript
// Generic error handler
async function handleDatabaseOperation<T>(
  operation: () => Promise<T>
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof QueryError) {
      console.error('Query Error:', error.message);
      // Handle specific query errors
    } else if (error instanceof TableError) {
      console.error('Table Error:', error.message);
      // Handle table-related errors
    } else {
      console.error('Unexpected Error:', error);
      // Handle other errors
    }
    return null;
  }
}

// Usage with error handling
async function safeCreateUser(userData: UserInput) {
  return handleDatabaseOperation(async () => {
    const user = await userTable.select(['id', 'email']).create(userData);
    return user;
  });
}
```

These examples demonstrate common real-world usage patterns for PgBuddy in different types of applications. They showcase:

- Type safety with TypeScript
- Complex query conditions
- Error handling patterns
- Business logic implementation
- System design patterns

Each example can be extended or modified based on specific requirements while maintaining type safety and query efficiency.
