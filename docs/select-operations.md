# Select Operations

## Basic Queries

### Simple Select

```typescript
const users = await userTable.select({
  where: { status: 'active' }
});
```

### Select Specific Fields

```typescript
const users = await userTable.select({
  select: ['id', 'name', 'email'],
  where: { status: 'active' }
});
```

## Advanced Filtering

### Complex Conditions

```typescript
const users = await userTable.select({
  where: [
    { field: 'age', operator: '>=', value: 18 },
    { field: 'status', operator: '=', value: 'active' },
    { field: 'last_login', operator: '>', value: lastMonth }
  ]
});
```

### Pattern Matching

```typescript
const users = await userTable.select({
  where: [
    {
      field: 'email',
      operator: 'LIKE',
      value: '@example.com',
      pattern: 'endsWith'
    }
  ]
});
```

### NULL Checks

```typescript
const users = await userTable.select({
  where: [
    { field: 'deleted_at', operator: 'IS NULL' }
  ]
});
```

## Sorting

### Basic Sorting

```typescript
const users = await userTable.select({
  orderBy: [
    { column: 'created_at', direction: 'DESC' }
  ]
});
```

### Multiple Sort Criteria

```typescript
const users = await userTable.select({
  orderBy: [
    { column: 'status', direction: 'ASC' },
    { column: 'created_at', direction: 'DESC' }
  ]
});
```

## Pagination

### Limit and Offset

```typescript
const users = await userTable.select({
  take: 10,  // LIMIT
  skip: 20   // OFFSET
});
```

### Page-based Pagination

```typescript
function getPage(pageNumber: number, pageSize: number) {
  return userTable.select({
    take: pageSize,
    skip: (pageNumber - 1) * pageSize,
    orderBy: [{ column: 'id', direction: 'ASC' }]
  });
}
```

## Combining Features

### Complete Example

```typescript
const users = await userTable.select({
  select: ['id', 'name', 'email', 'status'],
  where: [
    { field: 'status', operator: '=', value: 'active' },
    { field: 'email', operator: 'LIKE', value: '@company.com', pattern: 'endsWith' },
    { field: 'last_login', operator: '>', value: thirtyDaysAgo }
  ],
  orderBy: [
    { column: 'name', direction: 'ASC' }
  ],
  take: 20,
  skip: 0
});
```

## Performance Tips

1. **Select Specific Fields**:
   - Always specify needed columns instead of using `*`
   - Reduces network bandwidth and processing time

2. **Use Appropriate Indexes**:
   - Ensure indexes exist for frequently queried fields
   - Consider index usage in WHERE and ORDER BY clauses

3. **Efficient Pagination**:
   - Use `take` and `skip` with appropriate limits
   - Consider keyset pagination for large datasets

4. **Optimize WHERE Conditions**:
   - Put most restrictive conditions first
   - Use appropriate operators for the use case