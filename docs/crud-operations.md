# CRUD Operations

These examples assume a table is already set up. See the [Introduction](introduction.md) or [Chainable API](chainable-api.md) for setup.

## Insert

### Basic insert

```typescript
const user = await userTable.create({
  name: 'John Doe',
  email: 'john@example.com'
});
```

### Bulk insert

```typescript
const users = await userTable.createMany([
  { name: 'John Doe', email: 'john@example.com' },
  { name: 'Jane Doe', email: 'jane@example.com' }
]);
```

### Insert with selected return fields

```typescript
const user = await userTable
  .select(['id', 'created_at'])
  .create({ name: 'John Doe', email: 'john@example.com' });
```

## Update

### Basic update

```typescript
const [updatedUser] = await userTable
  .where({ id: 1 })
  .update({ status: 'active' });
```

### Complex update conditions

```typescript
const updated = await userTable
  .where([
    { field: 'status', operator: '=', value: 'pending' },
    { field: 'created_at', operator: '<', value: oneWeekAgo }
  ])
  .update({ last_login: new Date() });
```

### Update with selected return fields

```typescript
const updated = await userTable
  .where({ id: 1 })
  .select(['id', 'status', 'updated_at'])
  .update({ status: 'inactive' });
```

## Delete

### Basic delete

```typescript
const [deletedUser] = await userTable
  .where({ id: 1 })
  .delete();
```

### Complex delete conditions

```typescript
const deleted = await userTable
  .where([
    { field: 'status', operator: '=', value: 'inactive' },
    { field: 'last_login', operator: '<', value: threeMonthsAgo }
  ])
  .delete();
```

### Delete with selected return fields

```typescript
const deleted = await userTable
  .where({ id: 1 })
  .select(['id', 'email'])
  .delete();
```

## Notes

- `where` is required for `update` and `delete` — calling either without it throws a `QueryError`.
- Use `select` to limit which columns are returned from mutations.
- `createMany` sends a single query regardless of how many records you pass.
- See [Error Types](api-reference.md#error-types) for details on `QueryError` and `TableError`.
