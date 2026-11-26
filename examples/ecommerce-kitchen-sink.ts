/**
 * Ecommerce kitchen sink.
 *
 * Runs the full pgbuddy surface against a real PostgreSQL database:
 * schemas, relations, joins, aggregates, grouped expressions, computed fields,
 * true batch, streaming, locking, writes, predicates, cursors, and error helpers.
 *
 * Usage:
 *   DATABASE_URL=postgres://postgres:postgres@localhost:5432/pgbuddy \
 *     bun run examples/ecommerce-kitchen-sink.ts
 *
 * The script drops and recreates its own tables. Do not point it at a
 * database you care about.
 */
import type { Sql } from "postgres";
import postgres from "postgres";
import { z } from "zod";
import {
  and,
  between,
  constraintName,
  contains,
  Errors,
  endsWith,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isCheckViolation,
  isDeadlock,
  isForeignKeyViolation,
  isNotNull,
  isNotNullViolation,
  isNull,
  isPostgresError,
  isSerializationFailure,
  isUniqueViolation,
  like,
  lt,
  lte,
  ne,
  not,
  notBetween,
  notInArray,
  or,
  PgBuddyClient,
  PostgresErrorCodes,
  QueryError,
  sqlExpr,
  startsWith,
  TableError,
  type WhereCondition,
  zodValidator,
} from "../src";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const UserSchema = z.object({
  id: z.number().int(),
  email: z.string(),
  full_name: z.string(),
  status: z.enum(["active", "inactive", "banned"]),
  deleted_at: z.date().nullable(),
  created_at: z.date(),
});

const CategorySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string(),
});

const ProductSchema = z.object({
  id: z.number().int(),
  category_id: z.number().int(),
  sku: z.string(),
  name: z.string(),
  price_cents: z.number().int(),
  stock: z.number().int(),
  created_at: z.date(),
});

const OrderSchema = z.object({
  id: z.number().int(),
  user_id: z.number().int(),
  status: z.enum(["pending", "paid", "shipped", "cancelled"]),
  total_cents: z.number().int(),
  placed_at: z.date(),
});

const OrderItemSchema = z.object({
  order_id: z.number().int(),
  product_id: z.number().int(),
  quantity: z.number().int(),
  unit_price_cents: z.number().int(),
});

const ReviewSchema = z.object({
  id: z.number().int(),
  product_id: z.number().int(),
  user_id: z.number().int(),
  rating: z.number().int(),
  body: z.string(),
  published: z.boolean(),
  created_at: z.date(),
});

type User = z.infer<typeof UserSchema>;

const InventorySchema = z.object({
  product_id: z.number().int(),
  quantity: z.number().int(),
});

const UserTableQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(2),
  sort: z.enum(["id", "full_name", "created_at"]).default("id"),
  direction: z.enum(["asc", "desc"]).default("asc"),
  status: z.enum(["active", "inactive", "banned"]).optional(),
});

const PriceOverrideSchema = z.object({
  product_id: z.number().int(),
  price_cents: z.number().int(),
});

const AuditLogSchema = z.object({
  id: z.number().int().optional(),
  actor: z.string(),
  action: z.string().nullable(),
  created_at: z.date(),
});

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function createSchema(sql: Sql<Record<string, unknown>>): Promise<void> {
  await sql`
    DROP TABLE IF EXISTS
      price_overrides, audit_log, order_items, reviews, inventory, orders, products, categories, users
    CASCADE
  `;

  await sql`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'banned')),
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE
    )
  `;

  await sql`
    CREATE TABLE products (
      id INTEGER PRIMARY KEY,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
      stock INTEGER NOT NULL CHECK (stock >= 0),
      created_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'shipped', 'cancelled')),
      total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
      placed_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`
    CREATE TABLE order_items (
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
      PRIMARY KEY (order_id, product_id)
    )
  `;

  await sql`
    CREATE TABLE reviews (
      id INTEGER PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      body TEXT NOT NULL,
      published BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`
    CREATE TABLE inventory (
      product_id INTEGER PRIMARY KEY REFERENCES products(id),
      quantity INTEGER NOT NULL CHECK (quantity >= 0)
    )
  `;

  await sql`
    CREATE TABLE price_overrides (
      product_id INTEGER PRIMARY KEY REFERENCES products(id),
      price_cents INTEGER NOT NULL CHECK (price_cents >= 0)
    )
  `;

  await sql`
    CREATE TABLE audit_log (
      id SERIAL PRIMARY KEY,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  const now = new Date("2026-01-01T00:00:00Z");

  await sql`
    INSERT INTO users (id, email, full_name, status, deleted_at, created_at) VALUES
      (1, 'ada@example.com', 'Ada Lovelace', 'active', NULL, ${now}),
      (2, 'grace@example.com', 'Grace Hopper', 'active', NULL, ${now}),
      (3, 'linus@example.com', 'Linus Torvalds', 'inactive', ${now}, ${now})
  `;

  await sql`
    INSERT INTO categories (id, name, slug) VALUES
      (1, 'Electronics', 'electronics'),
      (2, 'Books', 'books')
  `;

  await sql`
    INSERT INTO products (id, category_id, sku, name, price_cents, stock, created_at) VALUES
      (1, 1, 'LAPTOP-1', 'Laptop', 129900, 5, ${now}),
      (2, 2, 'BOOK-1', 'The Analytical Engine', 1999, 20, ${now}),
      (3, 1, 'HEADSET-1', 'Headphones', 8900, 0, ${now})
  `;

  await sql`
    INSERT INTO orders (id, user_id, status, total_cents, placed_at) VALUES
      (1, 1, 'paid', 129900, ${now}),
      (2, 2, 'pending', 1999, ${now}),
      (3, 1, 'shipped', 8900, ${now})
  `;

  await sql`
    INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents) VALUES
      (1, 1, 1, 129900),
      (2, 2, 1, 1999),
      (3, 3, 1, 8900)
  `;

  await sql`
    INSERT INTO reviews (id, product_id, user_id, rating, body, published, created_at) VALUES
      (1, 1, 1, 5, 'Excellent laptop', true, ${now}),
      (2, 1, 2, 4, 'Very good', true, ${now}),
      (3, 2, 2, 5, 'A classic', false, ${now})
  `;

  await sql`
    INSERT INTO inventory (product_id, quantity) VALUES
      (1, 5), (2, 20), (3, 0)
  `;
}

function createTables(db: PgBuddyClient) {
  const users = db.table("users", UserSchema, {
    unique: [["email"]],
    relations: {
      orders: {
        table: "orders",
        schema: OrderSchema,
        localKey: "id",
        foreignKey: "user_id",
        relation: "many",
      },
      reviews: {
        table: "reviews",
        schema: ReviewSchema,
        localKey: "id",
        foreignKey: "user_id",
        relation: "many",
      },
    },
  });

  const categories = db.table("categories", CategorySchema, {
    unique: [["slug"]],
    relations: {
      products: {
        table: "products",
        schema: ProductSchema,
        localKey: "id",
        foreignKey: "category_id",
        relation: "many",
      },
    },
  });

  const products = db.table("products", ProductSchema, {
    unique: [["sku"]],
    relations: {
      category: {
        table: "categories",
        schema: CategorySchema,
        localKey: "category_id",
        foreignKey: "id",
        relation: "one",
      },
      reviews: {
        table: "reviews",
        schema: ReviewSchema,
        localKey: "id",
        foreignKey: "product_id",
        relation: "many",
      },
    },
  });

  const orders = db.table("orders", OrderSchema, {
    relations: {
      user: {
        table: "users",
        schema: UserSchema,
        localKey: "user_id",
        foreignKey: "id",
        relation: "one",
      },
      items: {
        table: "order_items",
        schema: OrderItemSchema,
        localKey: "id",
        foreignKey: "order_id",
        relation: "many",
      },
    },
  });

  const orderItems = db.table("order_items", OrderItemSchema, {
    relations: {
      product: {
        table: "products",
        schema: ProductSchema,
        localKey: "product_id",
        foreignKey: "id",
        relation: "one",
      },
    },
  });

  const reviews = db.table("reviews", ReviewSchema);

  const inventory = db.table("inventory", InventorySchema, {
    unique: [["product_id"]],
  });

  const auditLog = db.table("audit_log", AuditLogSchema);

  const priceOverrides = db.table("price_overrides", PriceOverrideSchema);

  return {
    users,
    categories,
    products,
    orders,
    orderItems,
    reviews,
    inventory,
    auditLog,
    priceOverrides,
  };
}

// ---------------------------------------------------------------------------
// Kitchen sink
// ---------------------------------------------------------------------------

export async function run(sql: Sql<Record<string, unknown>>, db: PgBuddyClient): Promise<void> {
  await createSchema(sql);

  const {
    users,
    categories,
    products,
    orders,
    orderItems,
    reviews,
    inventory,
    auditLog,
    priceOverrides,
  } = createTables(db);

  // --- Basic reads ---------------------------------------------------------
  const allUsers = await users.findMany();
  const allCategories = await categories.findMany();
  const firstUser = await users.orderBy([{ column: "id", direction: "ASC" }]).findFirst();
  const ada = await users.whereUnique({ email: "ada@example.com" }).findUnique();
  const adaOrThrow = await users.whereUnique({ email: "ada@example.com" }).findUniqueOrThrow();
  const activeCount = await users.where(eq("status", "active")).count();
  const hasGrace = await users.where({ email: "grace@example.com" }).exists();
  const firstActive = await users
    .where({ status: "active" })
    .orderBy([{ column: "id", direction: "ASC" }])
    .findFirstOrThrow();

  console.log("reads", {
    allUsers,
    allCategories,
    firstUser,
    ada,
    adaOrThrow,
    activeCount,
    hasGrace,
    firstActive,
  });

  // --- True batch + streaming ---------------------------------------------
  const [batchOrders, batchCount] = await db.batch((tx) => [
    tx.sql`SELECT id, status FROM orders ORDER BY id`,
    tx.sql`SELECT count(*)::int AS count FROM orders`,
  ]);

  const streamedUsers: User[] = [];
  for await (const batch of users.orderBy([{ column: "id", direction: "ASC" }]).stream(2)) {
    streamedUsers.push(...batch);
  }

  // App-level paginated table helper: validates query params, maps only
  // allowed sort/filter fields, and fetches rows + total in one batch.
  const query = UserTableQuerySchema.parse({
    page: "2",
    pageSize: "1",
    sort: "full_name",
    direction: "asc",
    status: "active",
  });
  const sortColumns = {
    id: "id",
    full_name: "full_name",
    created_at: "created_at",
  } as const;
  const direction = query.direction === "asc" ? "ASC" : "DESC";
  const pageResult = await users
    .where(query.status ? { status: query.status } : {})
    .orderBy([{ column: sortColumns[query.sort], direction }])
    .skip((query.page - 1) * query.pageSize)
    .take(query.pageSize)
    .findManyAndCount();

  console.log("pagination", {
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.ceil(pageResult.total / query.pageSize),
    total: pageResult.total,
    rows: pageResult.rows,
  });

  console.log("batch", { batchOrders, batchCount, streamedUsers });

  // --- Filtering -----------------------------------------------------------
  const conditions: WhereCondition<User>[] = [
    { field: "status", operator: "=", value: "active" },
    { field: "id", operator: ">", value: 0 },
  ];

  const operatorRows = await users.where(conditions).findMany();

  const predicateRows = await users
    .where(
      and(
        eq("status", "active"),
        ne("email", "blocked@example.com"),
        gt("id", 0),
        gte("id", 1),
        lt("id", 100),
        lte("id", 100),
        inArray("id", [1, 2]),
        notInArray("id", [99]),
        isNull("deleted_at"),
        isNotNull("email"),
        like("email", "%@example.com"),
        ilike("email", "%@EXAMPLE.COM"),
        contains("full_name", "a"),
        startsWith("email", "a"),
        endsWith("email", ".com"),
        between("id", 1, 10),
        notBetween("id", 100, 200),
        not(eq("status", "banned")),
        or(eq("status", "active"), eq("status", "inactive"))
      )
    )
    .findMany();

  const rawFiltered = await users.whereRaw(sql`lower(email) LIKE ${"%@example.com"}`).findMany();

  const nestedPredicate = await users
    .where(and(or(eq("id", 1), eq("id", 2)), not(eq("status", "banned"))))
    .findMany();

  console.log("filters", { operatorRows, predicateRows, rawFiltered, nestedPredicate });

  // --- Projection, sorting, pagination ------------------------------------
  const emails = await users.select(["id", "email"]).findMany();
  const withoutDeleted = await users.omit(["deleted_at"]).findMany();
  const ordered = await users
    .orderBy([
      { column: "status", direction: "ASC", nulls: "first" },
      { column: "id", direction: "DESC" },
    ])
    .orderByRaw(sql`lower(full_name) ASC`)
    .skip(0)
    .take(5)
    .findMany();

  const distinctStatuses = await users.select(["status"]).distinct().findMany();
  const latestOrderPerUser = await orders
    .distinctOn(["user_id"])
    .orderBy([
      { column: "user_id", direction: "ASC" },
      { column: "placed_at", direction: "DESC" },
    ])
    .findMany();
  const distinctOrderStatuses = await orders
    .select(["status"])
    .distinctOnExpr([sql`status`])
    .orderByRaw(sql`status, id`)
    .findMany();

  const firstPage = await orders
    .orderBy([
      { column: "status", direction: "ASC" },
      { column: "id", direction: "ASC" },
    ])
    .cursor({ status: "paid", id: 1 })
    .take(10)
    .findMany();

  console.log("projection", {
    emails,
    withoutDeleted,
    ordered,
    distinctStatuses,
    latestOrderPerUser,
    distinctOrderStatuses,
    firstPage,
  });

  // --- Computed fields -----------------------------------------------------
  const computed = await users.findMany({
    computed: {
      lowerEmail: sqlExpr<string>(sql`lower(email)`),
      orderCount: sqlExpr<number>(
        sql`(select count(*)::int from orders where orders.user_id = users.id)`
      ),
    },
  });

  const projected = await users
    .selectExpr({ lowerEmail: sqlExpr<string>(sql`lower(email)`) })
    .where({ status: "active" })
    .orderBy([{ column: "id", direction: "ASC" }])
    .skip(0)
    .take(5)
    .select(["id", "email"])
    .findMany();

  const projectedFirst = await users
    .selectExpr({ lowerEmail: sqlExpr<string>(sql`lower(email)`) })
    .where({ status: "active" })
    .findFirst();
  const projectedFirstOrThrow = await users
    .selectExpr({ lowerEmail: sqlExpr<string>(sql`lower(email)`) })
    .where({ status: "active" })
    .findFirstOrThrow();
  const projectedUnique = await users
    .selectExpr({ lowerEmail: sqlExpr<string>(sql`lower(email)`) })
    .whereUnique({ email: "ada@example.com" })
    .findUnique();
  const projectedUniqueOrThrow = await users
    .selectExpr({ lowerEmail: sqlExpr<string>(sql`lower(email)`) })
    .whereUnique({ email: "ada@example.com" })
    .findUniqueOrThrow();
  const projectedCount = await users
    .selectExpr({ lowerEmail: sqlExpr<string>(sql`lower(email)`) })
    .count();
  const projectedExists = await users
    .selectExpr({ lowerEmail: sqlExpr<string>(sql`lower(email)`) })
    .where({ email: "ada@example.com" })
    .exists();

  const projectedDistinct = await users
    .selectExpr({ lowerEmail: sqlExpr<string>(sql`lower(email)`) })
    .distinct()
    .findMany();
  const projectedDistinctOn = await users
    .selectExpr({ lowerEmail: sqlExpr<string>(sql`lower(email)`) })
    .distinctOn(["status"])
    .orderBy([
      { column: "status", direction: "ASC" },
      { column: "id", direction: "DESC" },
    ])
    .findMany();
  const projectedDistinctOnExpr = await users
    .selectExpr({ lowerEmail: sqlExpr<string>(sql`lower(email)`) })
    .distinctOnExpr([sql`status`])
    .orderByRaw(sql`status, id`)
    .findMany();
  const projectedCursor = await users
    .selectExpr({ lowerEmail: sqlExpr<string>(sql`lower(email)`) })
    .orderBy([{ column: "id", direction: "ASC" }])
    .cursor({ id: 1 })
    .findMany();
  const projectedRaw = await users
    .selectExpr({ lowerEmail: sqlExpr<string>(sql`lower(email)`) })
    .whereRaw(sql`id > ${0}`)
    .orderByRaw(sql`id ASC`)
    .findMany();

  console.log("computed", {
    computed,
    projected,
    projectedFirst,
    projectedFirstOrThrow,
    projectedUnique,
    projectedUniqueOrThrow,
    projectedCount,
    projectedExists,
    projectedDistinct,
    projectedDistinctOn,
    projectedDistinctOnExpr,
    projectedCursor,
    projectedRaw,
  });

  // --- Relations -----------------------------------------------------------
  const included = await users
    .include("orders", (orders) =>
      orders
        .where({ status: "paid" })
        .orderBy([{ column: "id", direction: "DESC" }])
        .take(2)
    )
    .withCount("orders", (orders) => orders.where({ status: "paid" }))
    .findMany();

  const declarativeIncludes = await users
    .include("orders", {
      where: { status: "pending" },
      orderBy: [{ column: "id", direction: "ASC" }],
      take: 1,
      select: ["id", "status"],
    })
    .findMany();

  const related = await users
    .whereRelated("orders", (orders) => orders.where({ status: "paid" }))
    .whereMissing("reviews")
    .findMany();

  const everyReview = await products
    .whereEvery("reviews", (reviews) => reviews.where({ published: true }))
    .findMany();

  const projectedRelations = await users
    .selectExpr({ lowerEmail: sqlExpr<string>(sql`lower(email)`) })
    .include("orders", { where: { status: "paid" }, take: 1 })
    .withCount("orders")
    .whereRelated("orders", (orders) => orders.where({ status: "paid" }))
    .findMany();

  const noRefinementEvery = await users.whereEvery("orders").findMany();

  const orderGraph = await orders
    .include("user", (user) => user.select(["id", "email"]))
    .include("items", (items) => items.select(["order_id", "product_id", "quantity"]))
    .findMany();

  const orderWithProduct = await orderItems
    .include("product", (product) => product.select(["id", "name", "price_cents"]))
    .findMany();

  console.log("relations", {
    included,
    declarativeIncludes,
    related,
    everyReview,
    projectedRelations,
    noRefinementEvery,
    orderGraph,
    orderWithProduct,
  });

  // --- Joins ---------------------------------------------------------------
  const productCategories = await products
    .innerJoin("categories", CategorySchema, sql`"categories"."id" = "products"."category_id"`)
    .select(["id", "name"])
    .whereRaw(sql`"products"."stock" > ${0}`)
    .orderByRaw(sql`"products"."name" ASC`)
    .take(10)
    .findMany();

  const productCategoryFirst = await products
    .innerJoin("categories", CategorySchema, sql`"categories"."id" = "products"."category_id"`)
    .whereRaw(sql`"products"."stock" > ${0}`)
    .findFirst();

  const productCategoryOrThrow = await products
    .innerJoin("categories", CategorySchema, sql`"categories"."id" = "products"."category_id"`)
    .whereRaw(sql`"products"."stock" > ${0}`)
    .findFirstOrThrow();

  const reviewedProducts = await products
    .leftJoin("reviews", ReviewSchema, sql`"reviews"."product_id" = "products"."id"`)
    .select(["id", "name"])
    .whereRaw(sql`"products"."id" = ${1}`)
    .orderByRaw(sql`"reviews"."id" ASC`)
    .findMany();

  const reviewedProductFirst = await products
    .leftJoin("reviews", ReviewSchema, sql`"reviews"."product_id" = "products"."id"`)
    .whereRaw(sql`"products"."id" = ${3}`)
    .findFirst();

  console.log("joins", {
    productCategories,
    productCategoryFirst,
    productCategoryOrThrow,
    reviewedProducts,
    reviewedProductFirst,
  });

  // --- Grouped aggregates --------------------------------------------------
  const grouped = await orders
    .where(ne("status", "cancelled"))
    .groupBy(["status"], {
      count: sqlExpr<number>(sql`count(*)::int`),
      total: sqlExpr<number>(sql`sum(total_cents)::int`),
    })
    .having(sql`count(*) > 0`)
    .orderBy([{ column: "status", direction: "ASC" }])
    .findMany();

  const groupedFirst = await orders
    .groupBy(["status"], { count: sqlExpr<number>(sql`count(*)::int`) })
    .orderByRaw(sql`status ASC`)
    .findFirst();

  const groupedOrThrow = await orders
    .groupBy(["status"], { count: sqlExpr<number>(sql`count(*)::int`) })
    .having(sql`count(*) > 0`)
    .findFirstOrThrow();

  const groupedPage = await orders
    .groupBy(["status"], { count: sqlExpr<number>(sql`count(*)::int`) })
    .skip(0)
    .take(2)
    .findMany();

  const groupedExpr = await orders
    .groupByExpr(
      { statusLower: sqlExpr<string>(sql`lower(status)`) },
      { count: sqlExpr<number>(sql`count(*)::int`) }
    )
    .having({ count: { gt: 1 } })
    .orderByRaw(sql`lower(status) ASC`)
    .findMany();

  console.log("grouped", { grouped, groupedFirst, groupedOrThrow, groupedPage, groupedExpr });

  // --- Aggregate helpers ---------------------------------------------------
  const aggregate = await orders.aggregate({
    count: true,
    countDistinct: ["status"],
    sum: ["total_cents"],
    avg: ["total_cents"],
    min: ["total_cents"],
    max: ["total_cents"],
  });

  console.log("aggregate", aggregate);

  // --- Transactions and locking -------------------------------------------
  const readOnlyTotal = await db.transaction((tx) => tx.table("orders", OrderSchema).count(), {
    isolationLevel: "serializable",
    readOnly: true,
    deferrable: true,
  });

  const locked = await db.transaction(
    async (tx) => {
      const pending = await tx
        .table("orders", OrderSchema)
        .where({ status: "pending" })
        .for("update", { skipLocked: true })
        .findMany();

      const projectedLock = await tx
        .table("orders", OrderSchema)
        .selectExpr({ total: sqlExpr<number>(sql`total_cents * 2`) })
        .where({ status: "pending" })
        .for("share", { noWait: true })
        .findMany();

      return { pending, projectedLock };
    },
    { isolationLevel: "read committed" }
  );

  console.log("transactions", { readOnlyTotal, locked });

  // --- Writes --------------------------------------------------------------
  const created = await users.create(
    {
      id: 10,
      email: "new@example.com",
      full_name: "New Customer",
      status: "active",
      deleted_at: null,
      created_at: new Date("2026-02-01T00:00:00Z"),
    },
    { computed: { lowerEmail: sqlExpr<string>(sql`lower(email)`) } }
  );

  const skipped = await users.create(
    {
      id: 11,
      email: "ada@example.com",
      full_name: "Duplicate Ada",
      status: "active",
      deleted_at: null,
      created_at: new Date(),
    },
    { onConflict: "nothing" }
  );

  const bulkSkipped = await users.createMany(
    [
      {
        id: 12,
        email: "ada@example.com",
        full_name: "Another Ada",
        status: "active",
        deleted_at: null,
        created_at: new Date(),
      },
      {
        id: 13,
        email: "bulk@example.com",
        full_name: "Bulk Customer",
        status: "inactive",
        deleted_at: null,
        created_at: new Date(),
      },
    ],
    { skipDuplicates: true, computed: { lowerEmail: sqlExpr<string>(sql`lower(email)`) } }
  );

  const bulkUpdated = await users.createMany(
    [
      {
        id: 14,
        email: "new@example.com",
        full_name: "New Customer Updated",
        status: "inactive",
        deleted_at: null,
        created_at: new Date(),
      },
    ],
    {
      onConflict: {
        target: ["email"],
        update: ["full_name"],
        set: { status: sql`'active'` },
      },
      computed: { lowerEmail: sqlExpr<string>(sql`lower(email)`) },
    }
  );

  const upserted = await users.upsert({
    where: { email: "new@example.com" },
    create: {
      id: 15,
      email: "new@example.com",
      full_name: "Should Not Insert",
      status: "active",
      deleted_at: null,
      created_at: new Date(),
    },
    update: { full_name: "Upserted Customer" },
    targetWhere: sql`users.email IS NOT NULL`,
    setWhere: sql`users.deleted_at IS NULL`,
    computed: { lowerEmail: sqlExpr<string>(sql`lower(email)`) },
  });

  const findOrCreate = await users.upsert({
    where: { email: "created-by-upsert@example.com" },
    create: {
      id: 16,
      email: "created-by-upsert@example.com",
      full_name: "Created By Upsert",
      status: "active",
      deleted_at: null,
      created_at: new Date(),
    },
  });

  const updated = await users
    .where({ email: "bulk@example.com" })
    .update(
      { full_name: "Bulk Customer Renamed" },
      { computed: { upperName: sqlExpr<string>(sql`upper(full_name)`) } }
    );

  const reverted = await users
    .where({ status: "inactive" })
    .update({ status: "active" }, { returning: false });

  const deleted = await users
    .where({ email: "created-by-upsert@example.com" })
    .delete({ computed: { lowerEmail: sqlExpr<string>(sql`lower(email)`) } });

  const deletedCount = await users
    .where({ email: "bulk@example.com" })
    .delete({ returning: false });

  const inventoryRow = await inventory.whereUnique({ product_id: 1 }).findUnique();
  const inventoryUpdated = await inventory.where({ product_id: 1 }).update({ quantity: 4 });
  const inventoryGrouped = await inventory
    .groupBy(["product_id"], { total: sqlExpr<number>(sql`sum(quantity)::int`) })
    .findMany();

  const auditEntry = await auditLog.create({
    actor: "kitchen-sink",
    action: "started",
    created_at: new Date(),
  });
  const auditRows = await auditLog.omit(["created_at"]).findMany();
  const auditUpdated = await auditLog.where({ id: auditEntry.id }).update({ action: "finished" });
  const auditDeleted = await auditLog.where({ id: auditEntry.id }).delete();

  const insertedFromSelect = await priceOverrides.insertFrom(
    sql`SELECT id, price_cents + 100 FROM products WHERE id = 1`,
    { columns: ["product_id", "price_cents"] }
  );
  const updatedFrom = await products
    .whereRaw(sql`"price_overrides"."product_id" = "products"."id"`)
    .updateFrom({ price_cents: sql`"price_overrides"."price_cents"` }, sql`price_overrides`, {
      returning: false,
    });
  const deletedUsing = await priceOverrides
    .whereRaw(sql`"price_overrides"."product_id" = "products"."id"`)
    .deleteUsing(sql`products`, { returning: false });

  console.log("writes", {
    created,
    skipped,
    bulkSkipped,
    bulkUpdated,
    upserted,
    findOrCreate,
    updated,
    reverted,
    deleted,
    deletedCount,
    inventoryRow,
    inventoryUpdated,
    inventoryGrouped,
    auditRows,
    auditUpdated,
    auditDeleted,
    insertedFromSelect,
    updatedFrom,
    deletedUsing,
  });

  // --- Error helpers -------------------------------------------------------
  let queryErrorCode: string | undefined;
  try {
    await users.update({ status: "active" });
  } catch (error) {
    if (error instanceof QueryError) {
      queryErrorCode = error.code;
    }
  }

  let noRowsMessage: string | undefined;
  try {
    await users.where({ id: 999 }).findFirstOrThrow();
  } catch (error) {
    if (error instanceof QueryError && error.message === Errors.QUERY.NO_ROWS) {
      noRowsMessage = error.message;
    }
  }

  try {
    await users.create({
      id: 20,
      email: "ada@example.com",
      full_name: "Duplicate",
      status: "active",
      deleted_at: null,
      created_at: new Date(),
    });
  } catch (error) {
    if (isPostgresError(error)) {
      console.log("pg-error", {
        unique: isUniqueViolation(error),
        foreignKey: isForeignKeyViolation(error),
        notNull: isNotNullViolation(error),
        check: isCheckViolation(error),
        serialization: isSerializationFailure(error),
        deadlock: isDeadlock(error),
        constraint: constraintName(error),
        uniqueCode: PostgresErrorCodes.uniqueViolation,
      });
    }
  }

  try {
    await reviews.create({
      id: 20,
      product_id: 1,
      user_id: 1,
      rating: 6,
      body: "Out of range",
      published: false,
      created_at: new Date(),
    });
  } catch (error) {
    console.log("check violation", isCheckViolation(error));
  }

  try {
    await reviews.create({
      id: 21,
      product_id: 999,
      user_id: 1,
      rating: 5,
      body: "Missing product",
      published: false,
      created_at: new Date(),
    });
  } catch (error) {
    console.log("foreign key violation", isForeignKeyViolation(error));
  }

  try {
    await auditLog.create({
      actor: "kitchen-sink",
      action: null as never,
      created_at: new Date(),
    });
  } catch (error) {
    console.log("not null violation", isNotNullViolation(error));
  }

  try {
    db.table("bad name", UserSchema);
  } catch (error) {
    if (error instanceof TableError) {
      console.log("table error", error.message);
    }
  }

  console.log("errors", { queryErrorCode, noRowsMessage });
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("DATABASE_URL is required, for example:");
    console.error("  DATABASE_URL=postgres://postgres:postgres@localhost:5432/pgbuddy \\");
    console.error("    bun run examples/ecommerce-kitchen-sink.ts");
    process.exitCode = 1;
    return;
  }

  const sql = postgres(databaseUrl);
  const db = new PgBuddyClient(sql, {
    adapter: zodValidator,
    strictNames: true,
    maxTake: 1000,
    defaultTake: 100,
  });

  try {
    await run(sql as unknown as Sql<Record<string, unknown>>, db);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
