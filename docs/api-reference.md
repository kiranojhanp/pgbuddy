# API Reference

## PgBuddyClient

### Constructor

```typescript
constructor(sql: Sql<{}>, options?: { strictNames?: boolean; allowSchema?: boolean })
```

Creates a new PgBuddyClient instance with a postgres.js connection.

### table<T extends Row, I extends Row = T>(tableName: string, options?: { strictNames?: boolean; allowSchema?: boolean })

Creates a chainable table query builder.

- **Parameters:**
  - `tableName`: string - The name of the table
  - `T`: Generic type parameter representing the table structure
  - `I`: Insertable row type (defaults to `T`)
  - `options`: Optional name validation flags
- **Returns:** `Table<T, ["*"], I>`

### tableWithInsert<T extends Row, AutoKeys extends keyof T>(tableName: string, options?: { strictNames?: boolean; allowSchema?: boolean })

Creates a chainable table query builder with insert type inferred from auto-generated keys.

- **Parameters:**
  - `tableName`: string - The name of the table
  - `T`: Generic type parameter representing the table structure
  - `AutoKeys`: Keys in `T` that are auto-generated (optional on insert)
  - `options`: Optional name validation flags
- **Returns:** `Table<T, ["*"], Insertable<T, AutoKeys>>`

Migration note: if you previously called `db.table<T>(...)` and passed partial insert objects, use `tableWithInsert<T, AutoKeys>(...)` or `Insertable<T, AutoKeys>` to encode auto-generated columns.
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

#### create(data: I)

Insert a single record and return it (respects `select`).
`I` is the insertable row type for the table (defaults to `T`).

#### createMany(records: I[])

Insert multiple records and return them (respects `select`).
Use `Insertable<T, AutoKeys>` to mark auto-generated keys as optional.

#### update(data: Partial<T>)

Update records matching `where` and return the updated rows (respects `select`). Requires `where`.

#### delete()

Delete records matching `where` and return the deleted rows (respects `select`). Requires `where`.

## Types

### Insertable<T, AutoKeys>

```typescript
type Insertable<T extends Row, AutoKeys extends keyof T = never> =
  Omit<T, AutoKeys> & Partial<Pick<T, AutoKeys>>;
```

Helper for marking auto-generated columns as optional when using `create`/`createMany`.

### Updatable<T>

```typescript
type Updatable<T extends Row> = Partial<T>;
```

Helper for update payloads.

### Model<T, AutoKeys>

```typescript
type Model<T extends Row, AutoKeys extends keyof T = never> = {
  Insert: Insertable<T, AutoKeys>;
  Update: Updatable<T>;
  Select: T;
};
```

Grouped helper types for Prisma-like ergonomics.

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
