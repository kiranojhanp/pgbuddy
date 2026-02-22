# Select Operations

These examples assume a table is already set up. See the [Introduction](introduction.md) or [Chainable API](chainable-api.md) for setup. The schema used here has fields: `id`, `name`, `email`, `status`, `age`, `last_login`, `deleted_at`, `created_at`.

## Basic Queries

### Simple select

```typescript
const users = await userTable
  .where({ status: 'active' })
  .findMany();
```

### Select specific fields

```typescript
const users = await userTable
  .select(['id', 'name', 'email'])
  .where({ status: 'active' })
  .findMany();
```

## Advanced Filtering

### Complex conditions

```typescript
const users = await userTable
  .where([
    { field: 'age', operator: '>=', value: 18 },
    { field: 'status', operator: '=', value: 'active' },
    { field: 'last_login', operator: '>', value: lastMonth }
  ])
  .findMany();
```

### Pattern matching

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

### NULL checks

```typescript
const users = await userTable
  .where([
    { field: 'deleted_at', operator: 'IS NULL' }
  ])
  .findMany();
```

## Sorting

### Basic sorting

```typescript
const users = await userTable
  .orderBy([
    { column: 'created_at', direction: 'DESC' }
  ])
  .findMany();
```

### Multiple sort criteria

```typescript
const users = await userTable
  .orderBy([
    { column: 'status', direction: 'ASC' },
    { column: 'created_at', direction: 'DESC' }
  ])
  .findMany();
```

## Pagination

### Limit and offset

```typescript
const users = await userTable
  .skip(20)
  .take(10)
  .findMany();
```

### Page-based pagination

```typescript
function getPage(pageNumber: number, pageSize: number) {
  return userTable
    .orderBy([{ column: 'id', direction: 'ASC' }])
    .skip((pageNumber - 1) * pageSize)
    .take(pageSize)
    .findMany();
}
```

## Combining features

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

## Performance tips

- Use `select` to return only the columns you need — fewer columns means less data over the wire.
- Index the fields you filter and sort on.
- Always use `take` to bound result sets on large tables.
- For large datasets, keyset pagination performs better than offset-based pagination.
- Put your most selective `where` conditions first.
