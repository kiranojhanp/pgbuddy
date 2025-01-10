# API Reference

## PgBuddy Class

### Constructor

```typescript
constructor(sql: Sql<{}>)
```

Creates a new PgBuddy instance with a postgres connection.

### Methods

#### table<T extends Row>(tableName: string)

Creates a table-specific CRUD operations interface.

- **Parameters:**
  - `tableName`: string - The name of the table
  - `T`: Generic type parameter representing the table structure
- **Returns:** Table operations object
- **Throws:** `TableError` if table name is invalid

## Table Operations

### Insert

```typescript
insert<K extends (keyof T)[] = ["*"]>(params: InsertParams<T, K>): Promise<SelectFields<T, K>>
```

- **Parameters:**
  - `data`: Single record or array of records to insert
  - `select?`: Array of fields to return (default: ["*"])
- **Returns:** Inserted records
- **Throws:** `QueryError` if data is invalid

### Update

```typescript
update<K extends (keyof T)[] = ["*"]>(params: ModifyParams<T, K>): Promise<SelectFields<T, K>>
```

- **Parameters:**
  - `data`: Record with fields to update
  - `where`: Conditions for update
  - `select?`: Array of fields to return (default: ["*"])
- **Returns:** Updated records
- **Throws:** `QueryError` if data or conditions are invalid

### Delete

```typescript
delete<K extends (keyof T)[] = ["*"]>(params: ModifyParams<T, K>): Promise<SelectFields<T, K>>
```

- **Parameters:**
  - `where`: Conditions for deletion
  - `select?`: Array of fields to return (default: ["*"])
- **Returns:** Deleted records
- **Throws:** `QueryError` if conditions are missing

### Select

```typescript
select<K extends (keyof T)[] = ["*"]>(params: SelectParams<T, K>): Promise<SelectFields<T, K>>
```

- **Parameters:**
  - `select?`: Array of fields to return (default: ["*"])
  - `where?`: Filter conditions
  - `orderBy?`: Sort specifications
  - `take?`: Number of records to return
  - `skip?`: Number of records to skip
- **Returns:** Matching records
- **Throws:** `QueryError` if pagination parameters are invalid

## Types

### WhereCondition<T>

```typescript
interface WhereCondition<T> {
  field: keyof T;
  operator: SqlOperator;
  value: any;
  pattern?: "startsWith" | "endsWith" | "contains" | "exact";
}
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
  | "IN"
  | "LIKE"
  | "ILIKE"
  | "IS NULL"
  | "IS NOT NULL";
```

### OrderBy<T>

```typescript
interface OrderBy<T> {
  column: keyof T;
  direction: "ASC" | "DESC";
}
```

## Error Types

### QueryError

Thrown for invalid query parameters or conditions.

### TableError

Thrown for invalid table operations or configurations.