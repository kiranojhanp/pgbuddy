# Examples

## Setup

```typescript
import postgres from 'postgres';
import { PgBuddy } from 'pgbuddy';

// Database connection
const sql = postgres('postgres://username:password@localhost:5432/dbname');
const pgBuddy = new PgBuddy(sql);

// Define table types
interface User {
  id: number;
  name: string;
  email: string;
  status: 'active' | 'inactive';
  created_at: Date;
  updated_at: Date;
}

const userTable = pgBuddy.table<User>('users');
```

## Common Use Cases

### User Management System

```typescript
async function createUser(userData: Omit<User, 'id' | 'created_at' | 'updated_at'>) {
  return userTable.insert({
    data: userData,
    select: ['id', 'email']
  });
}

async function deactivateInactiveUsers(daysInactive: number) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

  return userTable.update({
    data: { status: 'inactive' },
    where: [
      { field: 'last_login', operator: '<', value: cutoffDate },
      { field: 'status', operator: '=', value: 'active' }
    ]
  });
}

async function searchUsers(query: string) {
  return userTable.select({
    where: [
      {
        field: 'name',
        operator: 'LIKE',
        value: query,
        pattern: 'contains'
      }
    ],
    orderBy: [{ column: 'name', direction: 'ASC' }]
  });
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

const postTable = pgBuddy.table<Post>('posts');

// Create draft post
async function createDraft(authorId: number, title: string, content: string) {
  return postTable.insert({
    data: {
      author_id: authorId,
      title,
      content,
      status: 'draft',
      publish_date: null
    }
  });
}

// Publish post
async function publishPost(postId: number) {
  return postTable.update({
    data: {
      status: 'published',
      publish_date: new Date()
    },
    where: { id: postId }
  });
}

// Get published posts with pagination
async function getPublishedPosts(page: number, pageSize: number) {
  return postTable.select({
    where: { status: 'published' },
    orderBy: [{ column: 'publish_date', direction: 'DESC' }],
    take: pageSize,
    skip: (page - 1) * pageSize
  });
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

const orderTable = pgBuddy.table<Order>('orders');

// Create new order
async function createOrder(customerId: number, amount: number, shippingAddress: string) {
  return orderTable.insert({
    data: {
      customer_id: customerId,
      status: 'pending',
      total_amount: amount,
      shipping_address: shippingAddress,
      tracking_number: null
    }
  });
}

// Update order status
async function updateOrderStatus(orderId: number, status: Order['status'], trackingNumber?: string) {
  return orderTable.update({
    data: {
      status,
      tracking_number: trackingNumber || null,
      updated_at: new Date()
    },
    where: { id: orderId }
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

  return orderTable.select({
    where: conditions,
    orderBy: [{ column: 'created_at', direction: 'DESC' }]
  });
}

// Get orders pending shipment
async function getPendingShipments() {
  return orderTable.select({
    where: { status: 'processing' },
    orderBy: [{ column: 'created_at', direction: 'ASC' }]
  });
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

const productTable = pgBuddy.table<Product>('products');

// Update stock levels
async function updateStock(productId: number, quantity: number) {
  return productTable.update({
    data: {
      stock_quantity: quantity,
      last_restock_date: new Date()
    },
    where: { id: productId }
  });
}

// Get low stock products
async function getLowStockProducts() {
  return productTable.select({
    where: [
      {
        field: 'stock_quantity',
        operator: '<=',
        value: sql`low_stock_threshold`
      }
    ],
    orderBy: [{ column: 'stock_quantity', direction: 'ASC' }]
  });
}

// Search products
async function searchProducts(query: string) {
  return productTable.select({
    where: [
      {
        field: 'name',
        operator: 'ILIKE',
        value: query,
        pattern: 'contains'
      }
    ],
    orderBy: [{ column: 'name', direction: 'ASC' }]
  });
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

const eventLogTable = pgBuddy.table<EventLog>('event_logs');

// Log new event
async function logEvent(
  eventType: string,
  severity: EventLog['severity'],
  message: string,
  metadata: Record<string, any> = {}
) {
  return eventLogTable.insert({
    data: {
      event_type: eventType,
      severity,
      message,
      metadata,
      timestamp: new Date()
    }
  });
}

// Get recent errors
async function getRecentErrors(hours: number = 24) {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - hours);

  return eventLogTable.select({
    where: [
      { field: 'severity', operator: '=', value: 'error' },
      { field: 'timestamp', operator: '>', value: cutoff }
    ],
    orderBy: [{ column: 'timestamp', direction: 'DESC' }]
  });
}

// Get event statistics
async function getEventStats(startDate: Date, endDate: Date) {
  return eventLogTable.select({
    where: [
      { field: 'timestamp', operator: '>=', value: startDate },
      { field: 'timestamp', operator: '<=', value: endDate }
    ],
    orderBy: [
      { column: 'event_type', direction: 'ASC' },
      { column: 'severity', direction: 'ASC' }
    ]
  });
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
async function safeCreateUser(userData: Partial<User>) {
  return handleDatabaseOperation(async () => {
    const user = await userTable.insert({
      data: userData,
      select: ['id', 'email']
    });
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