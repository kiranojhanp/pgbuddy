# Tenant Scoping and RLS

Tenant isolation should be enforced in the database or in a single app-level
scope function, not by trusting each query.

## App-level scope

```ts
const orders = db.table("orders", OrderSchema);

export function tenantOrders(tenantId: string) {
  return orders.where({ tenant_id: tenantId });
}

// Every read/write goes through the scope.
await tenantOrders(tenantId).where({ status: "paid" }).findMany();
```

Never accept `tenant_id` from an untrusted request body as the only filter;
derive it from the authenticated session and apply it server-side.

## PostgreSQL RLS

Enable RLS and create a policy that reads a session setting:

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_tenant_isolation ON orders
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
```

Set the setting inside the same transaction as the queries:

```ts
await db.transaction(async (tx) => {
  await tx.sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

  return tx.table("orders", OrderSchema).where({ status: "paid" }).findMany();
});
```

Use `true` for the third `set_config` argument so the setting is
transaction-local. Do not set it once on a pooled connection and assume it
persists; pool connections are reused.

## Checklist

- Derive tenant IDs from authentication, never solely from query parameters.
- Apply tenant predicates to every read, write, update, and delete.
- Use RLS as defense in depth where possible.
- Test cross-tenant access explicitly.
- Avoid global query middleware that can be bypassed by raw SQL.
