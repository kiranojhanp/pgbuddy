# Select Operations

These examples assume a table is already set up. See the [Introduction](introduction.md) or [Chainable API](chainable-api.md) for setup. The schema used here has fields: `id`, `name`, `email`, `status`, `age`, `last_login`, `deleted_at`, `created_at`.

## Basic Queries

### Simple Select

```typescript
const users = await userTable
  .where({ status: 'active' })
  .findMany();
```

### Select Specific Fields

```typescript
const users = await userTable
  .select(['id', 'name', 'email'])
  .where({ status: 'active' })
  .findMany();
```

## Advanced Filtering

### Complex Conditions

```typescript
const users = await userTable
  .where([
    { field: 'age', operator: '>=', value: 18 },
    { field: 'status', operator: '=', value: 'active' },
    { field: 'last_login', operator: '>', value: lastMonth }
  ])
  .findMany();
```

### Pattern Matching

```typescript
const users = await userTable
  .where([
    {
      field: 'email',
      operator: 'LIKE',
      value: '@example.com',
      pattern: 'endsWith'
    }
  ])
  .findMany();
```

### NULL Checks

```typescript
const users = await userTable
  .where([
    { field: 'deleted_at', operator: 'IS NULL' }
  ])
  .findMany();
```

## Sorting

### Basic Sorting

```typescript
const users = await userTable
  .orderBy([
    { column: 'created_at', direction: 'DESC' }
  ])
  .findMany();
```

### Multiple Sort Criteria

```typescript
const users = await userTable
  .orderBy([
    { column: 'status', direction: 'ASC' },
    { column: 'created_at', direction: 'DESC' }
  ])
  .findMany();
```

## Pagination

### Limit and Offset

```typescript
const users = await userTable
  .skip(20)
  .take(10)
  .findMany();
```

### Page-based Pagination

```typescript
function getPage(pageNumber: number, pageSize: number) {
  return userTable
    .orderBy([{ column: 'id', direction: 'ASC' }])
    .skip((pageNumber - 1) * pageSize)
    .take(pageSize)
    .findMany();
}
```

## Combining Features

### Complete Example

```typescript
const users = await userTable
  .select(['id', 'name', 'email', 'status'])
  .where([
    { field: 'status', operator: '=', value: 'active' },
    { field: 'email', operator: 'LIKE', value: '@company.com', pattern: 'endsWith' },
    { field: 'last_login', operator: '>', value: thirtyDaysAgo }
  ])
  .orderBy([
    { column: 'name', direction: 'ASC' }
  ])
  .skip(0)
  .take(20)
  .findMany();
```

## Performance Tips

- Use `select` to specify only the columns you need — returning fewer columns reduces network and memory overhead.
- Make sure indexes exist on fields used in `where` and `orderBy` clauses.
- Use `take` with a reasonable limit to avoid fetching unbounded result sets.
- For large tables, consider keyset pagination over offset-based pagination.
- Place the most selective `where` conditions first to help the query planner.
