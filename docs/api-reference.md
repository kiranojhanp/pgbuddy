# API Reference

## PgBuddyClient

### Constructor

```typescript
constructor(sql: Sql<{}>)
```

Creates a new PgBuddyClient instance with a postgres.js connection.

### table<T extends Row>(tableName: string)

Creates a chainable table query builder.

- **Parameters:**
  - `tableName`: string - The name of the table
  - `T`: Generic type parameter representing the table structure
- **Returns:** `Table<T>`
- **Throws:** `TableError` if the table name is invalid

## Table<T>

The Table API is chainable. You can compose query state with `select`, `where`, `skip`, `take`, and `orderBy`, then execute with `findMany`, `findFirst`, `findUnique`, or `count`. Mutations use `create`, `createMany`, `update`, and `delete`.

### Chainable query methods

#### select<K extends (keyof T)[]>(fields: K)

Specify which columns to return. Affects `find*`, `create`, `createMany`, `update`, and `delete` return values.

#### where(conditions: WhereCondition<T>[] | Partial<T>)

Filter results with either field-value equality or advanced `WhereCondition` operators.

#### skip(count: number)

Skip a number of records (offset). Throws `QueryError` if invalid.

#### take(count: number)

Limit the number of records returned. Throws `QueryError` if invalid.

#### orderBy(spec: SortSpec<T>[]) 

Sort results by column(s) and direction.

### Query execution

#### findMany()

Returns all matching records.

#### findFirst()

Returns the first matching record or `null`.

#### findUnique()

Returns the only matching record or `null`. Throws `QueryError` if multiple records match.

#### count()

Returns the number of matching records.

### Mutations

#### create(data: Partial<T>)

Insert a single record and return it (respects `select`).

#### createMany(records: Partial<T>[]) 

Insert multiple records and return them (respects `select`).

#### update(data: Partial<T>)

Update records matching `where` and return the updated rows (respects `select`). Requires `where`.

#### delete()

Delete records matching `where` and return the deleted rows (respects `select`). Requires `where`.

## Types

### WhereCondition<T>

```typescript
type WhereCondition<T> = {
  field: keyof T;
} & (
  | { operator: "=" | "!=" | ">" | "<" | ">=" | "<="; value: string | number | boolean | Date }
  | { operator: "LIKE" | "ILIKE"; value: string; pattern?: LikePattern }
  | { operator: "IN"; value: Array<string | number | boolean | Date> }
  | { operator: "IS NULL" | "IS NOT NULL"; value?: never }
);
```

### SqlOperator

```typescript
type SqlOperator =
  | "="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "LIKE"
  | "ILIKE"
  | "IN"
  | "IS NULL"
  | "IS NOT NULL";
```

### LikePattern

```typescript
type LikePattern = "startsWith" | "endsWith" | "contains" | "exact";
```

### SortSpec<T>

```typescript
interface SortSpec<T> {
  column: keyof T & string;
  direction: "ASC" | "DESC";
}
```

## Error Types

### QueryError

Thrown for invalid query parameters, pagination values, or unsafe operations.

### TableError

Thrown when table configuration is invalid.
