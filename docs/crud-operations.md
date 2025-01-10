# CRUD Operations

## Insert Operations

### Basic Insert

```typescript
const user = await userTable.insert({
  data: {
    name: 'John Doe',
    email: 'john@example.com'
  }
});
```

### Bulk Insert

```typescript
const users = await userTable.insert({
  data: [
    { name: 'John Doe', email: 'john@example.com' },
    { name: 'Jane Doe', email: 'jane@example.com' }
  ]
});
```

### Insert with Selected Return Fields

```typescript
const user = await userTable.insert({
  data: { name: 'John Doe', email: 'john@example.com' },
  select: ['id', 'created_at']
});
```

## Update Operations

### Basic Update

```typescript
const updated = await userTable.update({
  data: { status: 'active' },
  where: { id: 1 }
});
```

### Complex Update Conditions

```typescript
const updated = await userTable.update({
  data: { last_login: new Date() },
  where: [
    { field: 'status', operator: '=', value: 'pending' },
    { field: 'created_at', operator: '<', value: oneWeekAgo }
  ]
});
```

### Update with Return Fields

```typescript
const updated = await userTable.update({
  data: { status: 'inactive' },
  where: { id: 1 },
  select: ['id', 'status', 'updated_at']
});
```

## Delete Operations

### Basic Delete

```typescript
const deleted = await userTable.delete({
  where: { id: 1 }
});
```

### Complex Delete Conditions

```typescript
const deleted = await userTable.delete({
  where: [
    { field: 'status', operator: '=', value: 'inactive' },
    { field: 'last_login', operator: '<', value: threeMonthsAgo }
  ]
});
```

### Delete with Return Fields

```typescript
const deleted = await userTable.delete({
  where: { id: 1 },
  select: ['id', 'email']
});
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
     const result = await userTable.update({
       data: { status: 'active' },
       where: { id: 1 }
     });
   } catch (error) {
     if (error instanceof QueryError) {
       // Handle query-specific errors
     }
     // Handle other errors
   }
   ```