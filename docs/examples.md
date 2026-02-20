# Examples

## Setup

```typescript
import postgres from 'postgres';
import { PgBuddyClient, type Insertable, type Model } from 'pgbuddy';

// Database connection
const sql = postgres('postgres://username:password@localhost:5432/dbname');
const db = new PgBuddyClient(sql);

// Define table types
interface User {
  id: number;
  name: string;
  email: string;
  status: 'active' | 'inactive';
  created_at: Date;
  updated_at: Date;
}

type UserInsert = Insertable<User, 'id' | 'created_at' | 'updated_at'>;
const userTable = db.table<User, UserInsert>('users');

// Or Prisma-like grouped types
type UserModel = Model<User, 'id' | 'created_at' | 'updated_at'>;
const userTable2 = db.table<User, UserModel['Insert']>('users');
```

Migration note: if you previously used `db.table<T>(...)` with partial insert objects, define `Insertable<T, AutoKeys>` or `Model<T, AutoKeys>` and pass the insert type as the second generic.

## Common Use Cases

### User Management System

```typescript
async function createUser(userData: Omit<User, 'id' | 'created_at' | 'updated_at'>) {
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
interface Post {
  id: number;
  title: string;
  content: string;
  author_id: number;
  status: 'draft' | 'published' | 'archived';
  publish_date: Date | null;
  created_at: Date;
}

type PostInsert = Insertable<Post, 'id' | 'created_at'>;
const postTable = db.table<Post, PostInsert>('posts');

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
interface Order {
  id: number;
  customer_id: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  total_amount: number;
  created_at: Date;
  updated_at: Date;
  shipping_address: string;
  tracking_number: string | null;
}

type OrderInsert = Insertable<Order, 'id' | 'created_at' | 'updated_at'>;
const orderTable = db.table<Order, OrderInsert>('orders');

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
interface Product {
  id: number;
  sku: string;
  name: string;
  description: string;
  price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  last_restock_date: Date;
}

type ProductModel = Model<Product, 'id'>;
const productTable = db.table<Product, ProductModel['Insert']>('products');

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
interface EventLog {
  id: number;
  event_type: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  metadata: Record<string, any>;
  timestamp: Date;
}

type EventLogInsert = Insertable<EventLog, 'id'>;
const eventLogTable = db.table<EventLog, EventLogInsert>('event_logs');

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
async function safeCreateUser(userData: UserInsert) {
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
