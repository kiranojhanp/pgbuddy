# API Reference

## PgBuddyClient

### Constructor

```typescript
constructor(sql: Sql<{}>, options?: { strictNames?: boolean; allowSchema?: boolean })
```

Creates a new `PgBuddyClient` instance with a postgres.js connection.

### table(tableName, schema, options?)

```typescript
table<S extends ZodObject<any>>(
  tableName: string,
  schema: S,
  options?: { strictNames?: boolean; allowSchema?: boolean }
)
```

Creates a chainable table query builder with Zod validation.

- `tableName` — table name
- `schema` — Zod schema for input/output validation
- `options` — optional name validation flags
- Returns `ZodTable<S>`

### table(tableName, options?)

```typescript
table<T extends Row, I extends Row = T>(
  tableName: string,
  options?: { strictNames?: boolean; allowSchema?: boolean }
)
```

Creates a chainable table query builder without Zod validation.

- `tableName` — table name
- `T` — full row type
- `I` — insertable row type (defaults to `T`)
- `options` — optional name validation flags
- Returns `Table<T, ["*"], I>`

### tableWithInsert(tableName, options?)

```typescript
tableWithInsert<T extends Row, AutoKeys extends keyof T>(
  tableName: string,
  options?: { strictNames?: boolean; allowSchema?: boolean }
)
```

Creates a table query builder where auto-generated keys are optional on insert.

- `tableName` — table name
- `T` — full row type
- `AutoKeys` — keys in `T` that are auto-generated and optional on insert
- `options` — optional name validation flags
- Returns `Table<T, ["*"], Insertable<T, AutoKeys>>`
- Throws `TableError` if the table name is invalid

---

## ZodTable\<S\>

`ZodTable` has the same chainable API as `Table`, with runtime validation added:

- `where` validates field names and values against the schema
- `create` / `createMany` validate input data
- `update` validates partial updates

---

## Table\<T\>

The `Table` API is chainable. Build up query state with `select`, `where`, `skip`, `take`, and `orderBy`, then execute with `findMany`, `findFirst`, `findUnique`, or `count`. Mutations are `create`, `createMany`, `update`, and `delete`.

### Chainable query methods

#### select(fields)

```typescript
select<K extends (keyof T)[]>(fields: K)
```

Specify which columns to return. Applies to `find*`, `create`, `createMany`, `update`, and `delete`.

#### where(conditions)

```typescript
where(conditions: WhereCondition<T>[] | Partial<T>)
```

Filter results with field-value equality or advanced `WhereCondition` operators.

#### skip(count)

```typescript
skip(count: number)
```

Skip a number of records (offset). Throws `QueryError` if the value is invalid.

#### take(count)

```typescript
take(count: number)
```

Limit the number of records returned. Throws `QueryError` if the value is invalid.

#### orderBy(spec)

```typescript
orderBy(spec: SortSpec<T>[])
```

Sort results by one or more columns.

### Query execution

#### findMany()

Returns all matching records.

#### findFirst()

Returns the first matching record, or `null`.

#### findUnique()

Returns the only matching record, or `null`. Throws `QueryError` if more than one record matches.

#### count()

Returns the number of matching records.

### Mutations

#### create(data)

```typescript
create(data: I)
```

Insert a single record and return it (respects `select`). `I` is the insertable row type (defaults to `T`).

#### createMany(records)

```typescript
createMany(records: I[])
```

Insert multiple records and return them (respects `select`). Use `Insertable<T, AutoKeys>` to mark auto-generated keys as optional.

#### update(data)

```typescript
update(data: Partial<T>)
```

Update records matching `where` and return the updated rows (respects `select`). Requires `where`.

#### delete()

Delete records matching `where` and return the deleted rows (respects `select`). Requires `where`.

---

## Types

### Insertable\<T, AutoKeys\>

```typescript
type Insertable<T extends Row, AutoKeys extends keyof T = never> =
  Omit<T, AutoKeys> & Partial<Pick<T, AutoKeys>>;
```

Marks auto-generated columns as optional when using `create`/`createMany` without Zod.

### Updatable\<T\>

```typescript
type Updatable<T extends Row> = Partial<T>;
```

Type for update payloads.

### Model\<T, AutoKeys\>

```typescript
type Model<T extends Row, AutoKeys extends keyof T = never> = {
  Insert: Insertable<T, AutoKeys>;
  Update: Updatable<T>;
  Select: T;
};
```

Groups `Insert`, `Update`, and `Select` types — a Prisma-style type bundle without Zod.

### WhereCondition\<T\>

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

### SortSpec\<T\>

```typescript
interface SortSpec<T> {
  column: keyof T & string;
  direction: "ASC" | "DESC";
}
```

---

## Error types

### QueryError

Thrown for invalid query parameters, bad pagination values, or unsafe operations (such as `update` or `delete` without a `where` clause).

### TableError

Thrown when table configuration is invalid (such as an invalid table name).
