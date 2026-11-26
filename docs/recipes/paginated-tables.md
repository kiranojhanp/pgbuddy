# Paginated Tables

pgbuddy provides the SQL primitive, not the HTTP/table UX:

```ts
const { rows, total } = await users
  .where({ status: "active" })
  .orderBy([{ column: "created_at", direction: "DESC" }])
  .skip(offset)
  .take(pageSize)
  .findManyAndCount();
```

`findManyAndCount()` sends the page query and the filtered count in one
postgres.js batch, so it uses one round trip. `total` ignores `skip`/`take` and
counts all rows matching the current filters.

The application should own query-string parsing, the response envelope, and the
allowlists for sortable/filterable fields.

## App-level helper

```ts
import { z } from "zod";
import { PgBuddyClient } from "pgbuddy";

const UserListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(["created_at", "full_name", "email"]).default("created_at"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  status: z.enum(["active", "inactive", "banned"]).optional(),
});

const userSortColumns = {
  created_at: "created_at",
  full_name: "full_name",
  email: "email",
} as const;

export async function listUsers(db: PgBuddyClient, input: unknown) {
  const query = UserListQuery.parse(input);
  const offset = (query.page - 1) * query.pageSize;

  const { rows, total } = await db
    .table("users", UserSchema)
    .where(query.status ? { status: query.status } : {})
    .orderBy([
      {
        column: userSortColumns[query.sort],
        direction: query.direction === "asc" ? "ASC" : "DESC",
      },
    ])
    .skip(offset)
    .take(query.pageSize)
    .findManyAndCount();

  const pageCount = Math.ceil(total / query.pageSize);

  return {
    data: rows,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      pageCount,
      hasNextPage: query.page < pageCount,
      hasPreviousPage: query.page > 1,
    },
  };
}
```

The sort and status maps are deliberately explicit. Do not pass arbitrary
query-string values into `orderBy` or `where`.

## Infinite queries

Keyset pagination is the right fit for infinite scrolling:

```ts
const first = await users
  .orderBy([{ column: "id", direction: "ASC" }])
  .take(20)
  .findManyInfinite();

const next = await users
  .orderBy([{ column: "id", direction: "ASC" }])
  .cursor(first.nextCursor!)
  .take(20)
  .findManyInfinite();
```

`findManyInfinite()` returns:

```ts
{
  rows,
  nextCursor, // Partial<T> | null
  hasMore,
}
```

It fetches one extra row to determine `hasMore`, so use a deterministic,
unique ordering (or a composite cursor) to avoid duplicates/skips. It requires
an explicit `orderBy` of schema columns and a `take()` limit; raw `orderByRaw`
is not supported for cursor derivation. It does not fetch a total.

## Choosing a pagination mode

- **Offset pages** (`skip`/`take` + `findManyAndCount`) work well for
  admin tables, search results, and UIs that need page numbers.
- **Keyset pages** (`cursor(...).take(...)`) avoid large offsets and are better
  for infinite feeds. They do not have a natural `total`, so return `hasMore`
  or fetch an exact count only when needed.
- Exact counts can be expensive on large tables. For large datasets, return
  `hasMore` instead of `total`, use an approximate count, or cache the count.

## Relations

If the table includes relations, `findManyAndCount()` still batches the base
rows and count together. Relation hydration runs afterward as separate batched
queries. Keep relation `take` refinements small for table pages.

## Security

- Validate query params with Zod before using them.
- Allowlist sortable columns and filterable columns.
- Apply tenant/authorization predicates server-side before pagination.
- Cap `pageSize` and the offset to avoid expensive scans.
