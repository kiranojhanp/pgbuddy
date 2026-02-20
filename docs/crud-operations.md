# CRUD Operations

## Insert Operations

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

1. **Always Use WHERE Clauses**:
   - Required for update and delete operations
   - Prevents accidental bulk operations

2. **Return Relevant Fields**:
   - Use the `select` parameter to limit returned data
   - Helps with performance and network bandwidth

3. **Bulk Operations**:
   - Use array input for bulk inserts
   - Consider batching large operations

4. **Error Handling**:
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
