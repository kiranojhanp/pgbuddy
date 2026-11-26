# CRUD Operations

These examples assume a table is already set up. See the
[Introduction](introduction.md) or [Chainable API](chainable-api.md) for setup.

## Insert

### Basic insert

```typescript
const user = await userTable.create({
  name: "John Doe",
  email: "john@example.com",
});
```

`create` returns the inserted row (respecting `select`). `undefined` values are
omitted so database defaults apply.

### Skip conflicts

```typescript
const inserted = await userTable.create(data, { onConflict: "nothing" });

if (!inserted) {
  // a conflicting row already existed
}
```

### Computed return fields

```typescript
import { sqlExpr } from "pgbuddy";

const user = await userTable.create(data, {
  computed: { lowerEmail: sqlExpr<string>(sql`lower(email)`) },
});
```

### Bulk insert

```typescript
const users = await userTable.createMany([
  { name: "John Doe", email: "john@example.com" },
  { name: "Jane Doe", email: "jane@example.com" },
]);
```

Large batches are chunked automatically to stay under PostgreSQL's parameter
limit. Use `skipDuplicates` to add `ON CONFLICT DO NOTHING`:

```typescript
const inserted = await userTable.createMany(records, { skipDuplicates: true });
```

Or update conflicting rows. `update` assigns from `EXCLUDED`; `set` accepts
arbitrary expressions:

```typescript
await userTable.createMany(records, {
  onConflict: {
    target: ["email"],
    update: ["name"],
    set: { updated_at: sql`now()` },
  },
});
```

`createMany` also accepts `computed`:

```typescript
const inserted = await userTable.createMany(records, {
  computed: { lowerEmail: sqlExpr<string>(sql`lower(email)`) },
});
```

### Upsert

```typescript
const user = await userTable.upsert({
  where: { email: "john@example.com" },
  create: { email: "john@example.com", name: "John Doe" },
  update: { name: "John Smith" },
});
```

- Omitting `update` returns the existing row instead of erroring.
- `targetWhere` supports partial unique indexes.
- `setWhere` adds a `WHERE` to the `DO UPDATE` branch.
- `computed` adds typed `RETURNING` expressions.

### Insert with selected return fields

```typescript
const user = await userTable
  .select(["id", "created_at"])
  .create({ name: "John Doe", email: "john@example.com" });
```

## Update

### Basic update

```typescript
const [updatedUser] = await userTable
  .where({ id: 1 })
  .update({ status: "active" });
```

`update` returns an array of updated rows and requires `where`.

### SQL expressions

```typescript
const [updated] = await userTable
  .where({ id: 1 })
  .update({ views: sql`views + 1`, updated_at: sql`now()` });
```

### Computed return fields and counts

```typescript
const [updated] = await userTable
  .where({ id: 1 })
  .update(
    { status: "inactive" },
    { computed: { upper: sqlExpr<string>(sql`upper(status)`) } }
  );

// Return the affected-row count instead of rows
const count = await userTable
  .where({ status: "inactive" })
  .update({ status: "active" }, { returning: false });
```

`undefined` values are omitted, which makes conditional payloads safe:

```typescript
await userTable.where({ id }).update({
  name: maybeName,
  status: maybeStatus,
});
```

### Update with selected return fields

```typescript
const updated = await userTable
  .where({ id: 1 })
  .select(["id", "status", "updated_at"])
  .update({ status: "inactive" });
```

## Delete

### Basic delete

```typescript
const [deletedUser] = await userTable.where({ id: 1 }).delete();
```

### Computed fields and counts

```typescript
const [deleted] = await userTable
  .where({ id: 1 })
  .delete({ computed: { lower: sqlExpr<string>(sql`lower(email)`) } });

const count = await userTable
  .where({ status: "inactive" })
  .delete({ returning: false });
```

### Delete with selected return fields

```typescript
const deleted = await userTable
  .where({ id: 1 })
  .select(["id", "email"])
  .delete();
```

## Row locking

Lock selected rows inside a transaction:

```typescript
await db.transaction(async (tx) => {
  const rows = await tx
    .table("jobs", JobSchema)
    .where({ status: "pending" })
    .for("update", { skipLocked: true })
    .take(10)
    .findMany();
});
```

`for` accepts `"update"`, `"share"`, `"no key update"`, and `"key share"`;
pass either `skipLocked` or `noWait`.

## Notes

- `where` is required for `update` and `delete` — calling either without it throws a `QueryError`.
- `where` still rejects explicit `undefined`; only write payloads omit undefined keys.
- Use `select` to limit which columns are returned from mutations.
- `createMany` chunks large batches automatically.
- `take` is capped at 10,000 rows by default (`maxTake` option). `findMany` without `take` still returns every matching row, so paginate untrusted queries.
- See [Error Types](api-reference.md#error-types) for details on `QueryError` and `TableError`.
