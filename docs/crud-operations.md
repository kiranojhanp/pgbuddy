# CRUD Operations

## Insert Operations

Assumes your table is defined with a Zod schema, for example:

```typescript
import { z } from "zod";

const UserSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  email: z.string().email(),
  status: z.enum(["active", "inactive"]),
  created_at: z.date(),
});

const userTable = db.table("users", UserSchema);
```

### Basic Insert

```typescript
const user = await userTable.create({
  name: 'John Doe',
  email: 'john@example.com'
});
```

### Bulk Insert

```typescript
const users = await userTable.createMany([
  { name: 'John Doe', email: 'john@example.com' },
  { name: 'Jane Doe', email: 'jane@example.com' }
]);
```

### Insert with Selected Return Fields

```typescript
const user = await userTable
  .select(['id', 'created_at'])
  .create({ name: 'John Doe', email: 'john@example.com' });
```

## Update Operations

### Basic Update

```typescript
const updated = await userTable
  .where({ id: 1 })
  .update({ status: 'active' });
const [updatedUser] = updated;
```

### Complex Update Conditions

```typescript
const updated = await userTable
  .where([
    { field: 'status', operator: '=', value: 'pending' },
    { field: 'created_at', operator: '<', value: oneWeekAgo }
  ])
  .update({ last_login: new Date() });
```

### Update with Return Fields

```typescript
const updated = await userTable
  .where({ id: 1 })
  .select(['id', 'status', 'updated_at'])
  .update({ status: 'inactive' });
```

## Delete Operations

### Basic Delete

```typescript
const deleted = await userTable
  .where({ id: 1 })
  .delete();
const [deletedUser] = deleted;
```

### Complex Delete Conditions

```typescript
const deleted = await userTable
  .where([
    { field: 'status', operator: '=', value: 'inactive' },
    { field: 'last_login', operator: '<', value: threeMonthsAgo }
  ])
  .delete();
```

### Delete with Return Fields

```typescript
const deleted = await userTable
  .where({ id: 1 })
  .select(['id', 'email'])
  .delete();
```

## Best Practices

- `where` is required for `update` and `delete` — calling either without it throws a `QueryError`.
- Use `select` to limit which columns are returned from mutations.
- For large inserts, `createMany` sends a single query rather than N separate inserts.
- Wrap mutations in try/catch and handle `QueryError` for query failures and `TableError` for configuration issues:

```typescript
try {
  const result = await userTable
    .where({ id: 1 })
    .update({ status: 'active' });
} catch (error) {
  if (error instanceof QueryError) {
    // Handle query-specific errors
  }
  // Handle other errors
}
```
