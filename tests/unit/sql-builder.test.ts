import type { Sql } from "postgres";
import { Errors, QueryError, type SqlOperator } from "../../src";
import {
  buildSelect,
  buildWhereConditions,
  createAdvancedWhereFragment,
  createConditionFragment,
  createLikeCondition,
  createLimitFragment,
  createSimpleWhereFragment,
  createSortFragment,
  getLikePattern,
} from "../../src/utils/sql-builder";
import { startPglite } from "../helpers/pglite";

type Item = {
  id: number;
  name: string;
  score: number;
  deleted_at: Date | null;
};

describe("sql-builder utilities", () => {
  let sql: Sql<Record<string, unknown>>;
  let stop: () => Promise<void>;

  const expectQueryError = (fn: () => void, message: string) => {
    try {
      fn();
      throw new Error("Expected QueryError");
    } catch (error) {
      expect(error).toBeInstanceOf(QueryError);
      expect((error as Error).message).toBe(message);
    }
  };

  beforeAll(async () => {
    const started = await startPglite();
    sql = started.sql;
    stop = started.stop;

    await sql`DROP TABLE IF EXISTS items;`;
    await sql`
      CREATE TABLE items (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        score INTEGER NOT NULL,
        deleted_at TIMESTAMPTZ NULL
      );
    `;
  });

  afterAll(async () => {
    await sql`DROP TABLE IF EXISTS items;`;
    await stop();
  });

  beforeEach(async () => {
    await sql`DELETE FROM items;`;
    await sql`
      INSERT INTO items (name, score, deleted_at)
      VALUES
        ('alpha', 10, NULL),
        ('beta', 20, NOW()),
        ('gamma', 30, NULL);
    `;
  });

  test("buildSelect supports star and column lists", async () => {
    const allRows = await sql`SELECT ${buildSelect<Item>(sql, ["*"])} FROM items ORDER BY id`;
    const projected =
      await sql`SELECT ${buildSelect<Item>(sql, ["id", "name"])} FROM items ORDER BY id`;

    expect(allRows).toHaveLength(3);
    expect(allRows[0]).toHaveProperty("score");
    expect(projected[0]).toHaveProperty("id");
    expect("score" in projected[0]).toBe(false);
  });

  test("buildSelect rejects invalid column names", () => {
    expect(() => buildSelect<Item>(sql, [""] as Array<keyof Item>)).toThrow(
      Errors.SELECT.INVALID_COLUMNS("")
    );
  });

  test("buildSelect rejects invalid identifiers in strict mode", () => {
    expect(() =>
      buildSelect<Item>(sql, ["bad-name"] as Array<keyof Item>, {
        strictNames: true,
      })
    ).toThrow(Errors.SELECT.INVALID_COLUMNS("bad-name"));
  });

  test("createSimpleWhereFragment handles null comparisons", async () => {
    const whereNull = createSimpleWhereFragment<Item>(sql, { deleted_at: null });
    const rows = await sql`SELECT * FROM items ${whereNull} ORDER BY id`;

    expect(rows).toHaveLength(2);
    expect(rows[0].deleted_at).toBeNull();
  });

  test("createSimpleWhereFragment returns no clause for empty input", async () => {
    const none = createSimpleWhereFragment<Item>(sql);
    const empty = createSimpleWhereFragment<Item>(sql, {});

    const noneRows = await sql`SELECT * FROM items ${none}`;
    const emptyRows = await sql`SELECT * FROM items ${empty}`;

    expect(noneRows).toHaveLength(3);
    expect(emptyRows).toHaveLength(3);
  });

  test("buildWhereConditions handles object and array inputs", async () => {
    const simple = buildWhereConditions<Item>(sql, { name: "alpha" });
    const simpleRows = await sql`SELECT * FROM items ${simple}`;

    const advanced = buildWhereConditions<Item>(sql, [
      { field: "score", operator: ">", value: 15 },
    ]);
    const advancedRows = await sql`SELECT * FROM items ${advanced}`;

    expect(simpleRows).toHaveLength(1);
    expect(advancedRows).toHaveLength(2);
  });

  test("buildWhereConditions rejects invalid fields in strict mode", () => {
    expect(() =>
      buildWhereConditions<Item>(sql, { "bad-name": "alpha" } as Partial<Item>, {
        strictNames: true,
      })
    ).toThrow(Errors.WHERE.INVALID_FIELD("bad-name"));
  });

  test("createAdvancedWhereFragment returns no clause for empty input", async () => {
    const whereEmpty = createAdvancedWhereFragment<Item>(sql, []);
    const rows = await sql`SELECT * FROM items ${whereEmpty} ORDER BY id`;

    expect(rows).toHaveLength(3);
  });

  test("createConditionFragment validates operators and values", () => {
    expectQueryError(
      () => createConditionFragment(sql, "name", "IN", []),
      Errors.WHERE.INVALID_IN("name")
    );

    expectQueryError(
      () => createConditionFragment(sql, "name", "LIKE", 123),
      Errors.WHERE.INVALID_LIKE("name")
    );

    expectQueryError(
      () => createConditionFragment(sql, "score", ">", null),
      Errors.WHERE.INVALID_COMPARISON("score", ">")
    );

    const invalidOperator = "NOPE" as unknown as SqlOperator;
    expectQueryError(
      () => createConditionFragment(sql, "name", invalidOperator, "alpha"),
      Errors.WHERE.UNSUPPORTED_OPERATOR("name", "NOPE")
    );
  });

  test("createConditionFragment handles IN and LIKE branches", async () => {
    const inFragment = createConditionFragment(sql, "name", "IN", ["alpha", "gamma"]);
    const inRows = await sql`SELECT * FROM items WHERE ${inFragment} ORDER BY id`;

    // Use "startsWith" pattern instead of raw "a%" - wildcards in values are now always escaped
    const likeFragment = createLikeCondition(sql, "name", "LIKE", "a", "startsWith");
    const likeRows = await sql`SELECT * FROM items WHERE ${likeFragment} ORDER BY id`;

    expect(inRows).toHaveLength(2);
    expect(likeRows).toHaveLength(1);
    expect(likeRows[0]?.name).toBe("alpha");
  });

  test("createConditionFragment handles IS NOT NULL and comparisons", async () => {
    const notNull = createConditionFragment(sql, "deleted_at", "IS NOT NULL", undefined);
    const notNullRows = await sql`SELECT * FROM items WHERE ${notNull}`;

    const greater = createConditionFragment(sql, "score", ">", 15);
    const greaterRows = await sql`SELECT * FROM items WHERE ${greater} ORDER BY id`;

    expect(notNullRows).toHaveLength(1);
    expect(greaterRows).toHaveLength(2);
  });

  test("createLikeCondition escapes and applies pattern", async () => {
    const patternFragment = createLikeCondition(sql, "name", "ILIKE", "alpha", "startsWith");
    const rows = await sql`SELECT * FROM items WHERE ${patternFragment}`;

    expect(rows).toHaveLength(1);
  });

  test("createLikeCondition always escapes wildcard characters", async () => {
    // Values containing _ or % are now always escaped - they match literally
    const wildcardFragment = createLikeCondition(sql, "name", "LIKE", "a____", undefined);
    const rows = await sql`SELECT * FROM items WHERE ${wildcardFragment}`;

    // "a____" is escaped to "a\_\_\_\_" so it only matches the literal string "a____"
    // None of our test items have that exact name, so 0 rows returned
    expect(rows).toHaveLength(0);
  });

  test("createLikeCondition rejects non-string", () => {
    expect(() => createLikeCondition(sql, "name", "ILIKE", 123)).toThrow(QueryError);
  });

  test("getLikePattern formats patterns", () => {
    expect(getLikePattern("alpha", "startsWith")).toBe("alpha%");
    expect(getLikePattern("alpha", "endsWith")).toBe("%alpha");
    expect(getLikePattern("alpha", "contains")).toBe("%alpha%");
    expect(getLikePattern("alpha", "exact")).toBe("alpha");
    expect(getLikePattern("alpha")).toBe("alpha");
  });

  test("createSortFragment validates direction and column", () => {
    expectQueryError(
      () => createSortFragment<Item>(sql, [{ column: "name", direction: "UP" as "ASC" }]),
      Errors.WHERE.INVALID_SORT
    );

    expectQueryError(
      () => createSortFragment<Item>(sql, [{ column: "" as "name", direction: "ASC" }]),
      Errors.SELECT.INVALID_COLUMNS("")
    );
  });

  test("createSortFragment orders results", async () => {
    const orderBy = createSortFragment<Item>(sql, [{ column: "score", direction: "DESC" }]);
    const rows = await sql`SELECT * FROM items ${orderBy}`;

    expect(rows[0].score).toBe(30);
  });

  test("createLimitFragment supports take/skip combinations", async () => {
    const takeOnly = createLimitFragment(sql, 1, undefined);
    const skipOnly = createLimitFragment(sql, undefined, 1);
    const takeSkip = createLimitFragment(sql, 1, 1);
    const none = createLimitFragment(sql, undefined, undefined);
    const skipZero = createLimitFragment(sql, undefined, 0);

    const takeRows = await sql`SELECT * FROM items ORDER BY id ${takeOnly}`;
    const skipRows = await sql`SELECT * FROM items ORDER BY id ${skipOnly}`;
    const takeSkipRows = await sql`SELECT * FROM items ORDER BY id ${takeSkip}`;
    const allRows = await sql`SELECT * FROM items ORDER BY id ${none}`;
    const skipZeroRows = await sql`SELECT * FROM items ORDER BY id ${skipZero}`;

    expect(takeRows).toHaveLength(1);
    expect(skipRows).toHaveLength(2);
    expect(takeSkipRows).toHaveLength(1);
    expect(allRows).toHaveLength(3);
    expect(skipZeroRows).toHaveLength(3);
  });
});
