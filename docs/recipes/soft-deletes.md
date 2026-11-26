# Soft Deletes

pgbuddy does not apply a global soft-delete filter. That is intentional: a
hidden global predicate is dangerous for admin tools, restores, and background
jobs. Use an explicit app-level helper.

## Schema

```sql
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;
CREATE INDEX users_active_idx ON users (id) WHERE deleted_at IS NULL;
```

## A small app-level scope

```ts
import { isNull, sqlExpr } from "pgbuddy";

const users = db.table("users", UserSchema);

export const activeUsers = () => users.where(isNull("deleted_at"));

export async function softDeleteUser(id: number) {
  return users
    .where({ id })
    .update({ deleted_at: new Date() });
}

export async function restoreUser(id: number) {
  return users
    .where({ id })
    .update({ deleted_at: null });
}
```

Use `activeUsers()` for normal reads and the base `users` table for restores,
admin views, and audits.

## Unique values with soft deletes

A normal unique index blocks reuse of an email after the row is soft-deleted.
Use a partial unique index instead:

```sql
CREATE UNIQUE INDEX users_email_active_key
  ON users (email)
  WHERE deleted_at IS NULL;
```

Then `upsert` conflict targets must match that index semantics; a partial index
cannot be used as a plain `ON CONFLICT (email)` target. For app-level
find-or-create, query `activeUsers().where({ email })` first and handle the
deleted row explicitly.

## Hard delete

Keep a separate helper that calls `.delete()`; do not make soft delete the only
removal path unless your retention policy requires it.
