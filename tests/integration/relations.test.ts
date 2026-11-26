import type { Sql } from "postgres";
import { z } from "zod";
import { Errors, eq, PgBuddyClient, sqlExpr, TableError } from "../../src";
import { startPglite } from "../helpers/pglite";

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
});

const PostSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  title: z.string(),
  published: z.boolean(),
  created_at: z.date(),
});

const TeamSchema = z.object({
  tenant_id: z.number(),
  slug: z.string(),
  name: z.string(),
});

const TagSchema = z.object({
  id: z.number(),
  name: z.string(),
});

const CommentSchema = z.object({
  id: z.number(),
  post_id: z.number(),
  body: z.string(),
});

const MemberSchema = z.object({
  id: z.number(),
  tenant_id: z.number(),
  team_slug: z.string(),
  name: z.string(),
});

describe("relations", () => {
  let sql: Sql<Record<string, unknown>>;
  let stop: () => Promise<void>;
  let db: PgBuddyClient;

  beforeAll(async () => {
    const started = await startPglite();
    sql = started.sql;
    stop = started.stop;
    db = new PgBuddyClient(sql);

    await sql`DROP TABLE IF EXISTS comments;`;
    await sql`DROP TABLE IF EXISTS post_tags;`;
    await sql`DROP TABLE IF EXISTS tags;`;
    await sql`DROP TABLE IF EXISTS members;`;
    await sql`DROP TABLE IF EXISTS teams;`;
    await sql`DROP TABLE IF EXISTS posts;`;
    await sql`DROP TABLE IF EXISTS users;`;
    await sql`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);`;
    await sql`
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        published BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `;
    await sql`
      CREATE TABLE tags (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      );
    `;
    await sql`
      CREATE TABLE comments (
        id INTEGER PRIMARY KEY,
        post_id INTEGER NOT NULL,
        body TEXT NOT NULL
      );
    `;
    await sql`
      CREATE TABLE post_tags (
        post_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (post_id, tag_id)
      );
    `;
    await sql`
      CREATE TABLE teams (
        tenant_id INTEGER NOT NULL,
        slug TEXT NOT NULL,
        name TEXT NOT NULL,
        PRIMARY KEY (tenant_id, slug)
      );
    `;
    await sql`
      CREATE TABLE members (
        id INTEGER PRIMARY KEY,
        tenant_id INTEGER NOT NULL,
        team_slug TEXT NOT NULL,
        name TEXT NOT NULL
      );
    `;
  });

  afterAll(async () => {
    await sql`DROP TABLE IF EXISTS comments;`;
    await sql`DROP TABLE IF EXISTS post_tags;`;
    await sql`DROP TABLE IF EXISTS tags;`;
    await sql`DROP TABLE IF EXISTS members;`;
    await sql`DROP TABLE IF EXISTS teams;`;
    await sql`DROP TABLE IF EXISTS posts;`;
    await sql`DROP TABLE IF EXISTS users;`;
    await stop();
  });

  beforeEach(async () => {
    await sql`TRUNCATE comments, post_tags, tags, members, teams, posts, users;`;
  });

  const users = () =>
    db.table("users", UserSchema, {
      relations: {
        posts: {
          table: "posts",
          schema: PostSchema,
          localKey: "id",
          foreignKey: "user_id",
          relation: "many",
          relations: {
            comments: {
              table: "comments",
              schema: CommentSchema,
              localKey: "id",
              foreignKey: "post_id",
              relation: "many",
            },
            tags: {
              table: "tags",
              schema: TagSchema,
              localKey: "id",
              relation: "many",
              through: {
                table: "post_tags",
                parentKey: "post_id",
                relatedKey: "tag_id",
                targetKey: "id",
              },
            },
          },
        },
      },
    });

  const posts = () =>
    db.table("posts", PostSchema, {
      relations: {
        author: {
          table: "users",
          schema: UserSchema,
          localKey: "user_id",
          foreignKey: "id",
          relation: "one",
        },
        tags: {
          table: "tags",
          schema: TagSchema,
          localKey: "id",
          relation: "many",
          through: {
            table: "post_tags",
            parentKey: "post_id",
            relatedKey: "tag_id",
            targetKey: "id",
          },
        },
      },
    });

  const teams = () =>
    db.table("teams", TeamSchema, {
      relations: {
        members: {
          table: "members",
          schema: MemberSchema,
          localKey: ["tenant_id", "slug"],
          foreignKey: ["tenant_id", "team_slug"],
          relation: "many",
        },
      },
    });

  test("include loads a to-many relation", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada'), (2, 'Grace')`;
    await sql`
      INSERT INTO posts (id, user_id, title)
      VALUES (10, 1, 'First'), (11, 1, 'Second'), (12, 2, 'Third')
    `;

    const rows = await users()
      .include("posts")
      .orderBy([{ column: "id", direction: "ASC" }])
      .findMany();

    expect(rows).toHaveLength(2);
    expect(rows[0]?.posts.map((post) => post.id)).toEqual([10, 11]);
    expect(rows[1]?.posts.map((post) => post.id)).toEqual([12]);
  });

  test("include loads a to-one relation", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada')`;
    await sql`INSERT INTO posts (id, user_id, title) VALUES (10, 1, 'First')`;

    const rows = await posts().include("author").findMany();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.author?.name).toBe("Ada");
  });

  test("include works with findFirst and findUnique", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada')`;
    await sql`INSERT INTO posts (id, user_id, title) VALUES (10, 1, 'First')`;

    const first = await users().include("posts").findFirst();
    expect(first?.posts).toHaveLength(1);

    const unique = await users().where({ id: 1 }).include("posts").findUnique();
    expect(unique?.posts).toHaveLength(1);

    const firstOrThrow = await users().include("posts").findFirstOrThrow();
    expect(firstOrThrow.posts).toHaveLength(1);

    const uniqueOrThrow = await users().where({ id: 1 }).include("posts").findUniqueOrThrow();
    expect(uniqueOrThrow.posts).toHaveLength(1);
  });

  test("returns empty arrays when there are no parents", async () => {
    const rows = await users().include("posts").findMany();
    expect(rows).toEqual([]);
  });

  test("include auto-selects an omitted local key and strips it afterwards", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada')`;
    await sql`
      INSERT INTO posts (id, user_id, title)
      VALUES (10, 1, 'First'), (11, 1, 'Second')
    `;

    const rows = await users().select(["name"]).include("posts").findMany();

    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("id");
    expect(rows[0]?.name).toBe("Ada");
    expect(rows[0]?.posts.map((post) => post.id)).toEqual([10, 11]);
  });

  test("include auto-selects the local key for withCount too", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada')`;
    await sql`INSERT INTO posts (id, user_id, title) VALUES (10, 1, 'First')`;

    const rows = await users().select(["name"]).withCount("posts").findMany();

    expect(rows).toEqual([{ name: "Ada", posts_count: 1 }]);
  });

  test("relation refinements filter, order, limit and project", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada'), (2, 'Grace')`;
    await sql`
      INSERT INTO posts (id, user_id, title, published, created_at)
      VALUES
        (10, 1, 'First', true, '2024-01-01T00:00:00Z'),
        (11, 1, 'Second', true, '2024-01-02T00:00:00Z'),
        (12, 1, 'Third', false, '2024-01-03T00:00:00Z'),
        (13, 2, 'Fourth', true, '2024-01-04T00:00:00Z'),
        (14, 2, 'Fifth', true, '2024-01-05T00:00:00Z')
    `;

    const rows = await users()
      .include("posts", (posts) =>
        posts
          .where({ published: true })
          .orderBy([{ column: "created_at", direction: "DESC" }])
          .take(1)
          .select(["id", "title"])
      )
      .orderBy([{ column: "id", direction: "ASC" }])
      .findMany();

    // take() applies per parent, not to the whole batched query.
    expect(rows).toHaveLength(2);
    expect(rows[0]?.posts).toEqual([{ id: 11, title: "Second", comments: [], tags: [] }]);
    expect(rows[1]?.posts).toEqual([{ id: 14, title: "Fifth", comments: [], tags: [] }]);
    expect(Object.keys(rows[0]?.posts[0] ?? {}).sort()).toEqual([
      "comments",
      "id",
      "tags",
      "title",
    ]);
  });

  test("relation select includes the foreign key only when requested", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada')`;
    await sql`INSERT INTO posts (id, user_id, title) VALUES (10, 1, 'First')`;

    const rows = await users()
      .include("posts", (posts) => posts.select(["id", "user_id", "title"]))
      .findMany();

    expect(rows[0]?.posts[0]).toEqual({
      id: 10,
      user_id: 1,
      title: "First",
      comments: [],
      tags: [],
    });
  });

  test("relation refinements are parameterized", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada')`;
    await sql`INSERT INTO posts (id, user_id, title) VALUES (10, 1, 'First')`;

    const injection = "' OR 1=1 --";
    const rows = await users()
      .include("posts", (posts) => posts.where({ title: injection }))
      .findMany();

    expect(rows[0]?.posts).toEqual([]);
  });

  test("withCount adds a numeric count for every parent", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada'), (2, 'Grace')`;
    await sql`
      INSERT INTO posts (id, user_id, title)
      VALUES (10, 1, 'First'), (11, 1, 'Second')
    `;

    const rows = await users()
      .withCount("posts")
      .orderBy([{ column: "id", direction: "ASC" }])
      .findMany();

    expect(rows[0]?.posts_count).toBe(2);
    expect(rows[1]?.posts_count).toBe(0);
    expect(typeof rows[0]?.posts_count).toBe("number");
  });

  test("withCount composes with include", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada')`;
    await sql`INSERT INTO posts (id, user_id, title) VALUES (10, 1, 'First')`;

    const rows = await users().withCount("posts").include("posts").findMany();

    expect(rows[0]?.posts_count).toBe(1);
    expect(rows[0]?.posts).toHaveLength(1);
  });

  test("withCount and include work with findUnique", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada')`;
    await sql`INSERT INTO posts (id, user_id, title) VALUES (10, 1, 'First')`;

    const row = await users().where({ id: 1 }).withCount("posts").include("posts").findUnique();

    expect(row?.posts_count).toBe(1);
    expect(row?.posts).toHaveLength(1);
  });

  test("whereRelated filters with EXISTS and composes with where", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada'), (2, 'Grace'), (3, 'Linus')`;
    await sql`
      INSERT INTO posts (id, user_id, title, published)
      VALUES
        (10, 1, 'First', true),
        (11, 1, 'Second', false),
        (12, 3, 'Third', true)
    `;

    const rows = await users()
      .whereRelated("posts", (posts) => posts.where({ published: true }))
      .orderBy([{ column: "id", direction: "ASC" }])
      .findMany();

    expect(rows.map((row) => row.id)).toEqual([1, 3]);

    const narrowed = await users()
      .whereRelated("posts", (posts) => posts.where({ published: true }))
      .where(eq("name", "Linus"))
      .findMany();

    expect(narrowed.map((row) => row.id)).toEqual([3]);
  });

  test("whereRelated is parameterized", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada')`;
    await sql`INSERT INTO posts (id, user_id, title) VALUES (10, 1, 'First')`;

    const rows = await users()
      .whereRelated("posts", (posts) => posts.where({ title: "' OR 1=1 --" }))
      .findMany();

    expect(rows).toEqual([]);
  });

  test("whereMissing filters with NOT EXISTS", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada'), (2, 'Grace')`;
    await sql`INSERT INTO posts (id, user_id, title) VALUES (10, 1, 'First')`;

    const rows = await users()
      .whereMissing("posts")
      .orderBy([{ column: "id", direction: "ASC" }])
      .findMany();

    expect(rows.map((row) => row.id)).toEqual([2]);
  });

  test("whereRelated composes with include", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada'), (2, 'Grace')`;
    await sql`
      INSERT INTO posts (id, user_id, title)
      VALUES (10, 1, 'First'), (11, 2, 'Second')
    `;

    const rows = await users().whereRelated("posts").include("posts").findMany();

    expect(rows).toHaveLength(2);
    expect(rows[0]?.posts).toHaveLength(1);
  });

  test("include supports composite keys", async () => {
    await sql`
      INSERT INTO teams (tenant_id, slug, name)
      VALUES (1, 'a', 'Alpha'), (1, 'b', 'Beta'), (2, 'a', 'Gamma')
    `;
    await sql`
      INSERT INTO members (id, tenant_id, team_slug, name)
      VALUES (10, 1, 'a', 'Ada'), (11, 1, 'a', 'Grace'), (12, 1, 'b', 'Linus')
    `;

    const rows = await teams()
      .include("members")
      .orderBy([{ column: "name", direction: "ASC" }])
      .findMany();

    expect(rows.map((row) => [row.name, row.members.map((member) => member.id)])).toEqual([
      ["Alpha", [10, 11]],
      ["Beta", [12]],
      ["Gamma", []],
    ]);
  });

  test("include auto-selects composite local keys", async () => {
    await sql`
      INSERT INTO teams (tenant_id, slug, name)
      VALUES (1, 'a', 'Alpha')
    `;
    await sql`
      INSERT INTO members (id, tenant_id, team_slug, name)
      VALUES (10, 1, 'a', 'Ada')
    `;

    const rows = await teams().select(["name"]).include("members").findMany();

    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("tenant_id");
    expect(rows[0]).not.toHaveProperty("slug");
    expect(rows[0]?.name).toBe("Alpha");
    expect(rows[0]?.members.map((member) => member.id)).toEqual([10]);
  });

  test("withCount supports composite keys", async () => {
    await sql`
      INSERT INTO teams (tenant_id, slug, name)
      VALUES (1, 'a', 'Alpha'), (1, 'b', 'Beta')
    `;
    await sql`
      INSERT INTO members (id, tenant_id, team_slug, name)
      VALUES (10, 1, 'a', 'Ada'), (11, 1, 'b', 'Grace')
    `;

    const rows = await teams()
      .withCount("members")
      .orderBy([{ column: "name", direction: "ASC" }])
      .findMany();

    expect(rows.map((row) => row.members_count)).toEqual([1, 1]);
  });

  test("whereRelated and whereMissing support composite keys", async () => {
    await sql`
      INSERT INTO teams (tenant_id, slug, name)
      VALUES (1, 'a', 'Alpha'), (1, 'b', 'Beta')
    `;
    await sql`
      INSERT INTO members (id, tenant_id, team_slug, name)
      VALUES (10, 1, 'a', 'Ada')
    `;

    const withMembers = await teams()
      .whereRelated("members")
      .orderBy([{ column: "name", direction: "ASC" }])
      .findMany();
    expect(withMembers.map((row) => row.name)).toEqual(["Alpha"]);

    const withoutMembers = await teams().whereMissing("members").findMany();
    expect(withoutMembers.map((row) => row.name)).toEqual(["Beta"]);
  });

  test("include throws for an unknown relation", () => {
    expect(() =>
      // @ts-expect-error - "comments" is not a configured relation
      users().include("comments")
    ).toThrow(Errors.SELECT.INVALID_RELATION("comments"));
  });

  test("relation configs are validated when the table is created", () => {
    expect(() =>
      db.table("users", UserSchema, {
        relations: {
          posts: {
            table: "",
            schema: PostSchema,
            localKey: "id",
            foreignKey: "user_id",
            relation: "many",
          },
        },
      })
    ).toThrow(TableError);

    expect(() =>
      db.table("users", UserSchema, {
        relations: {
          posts: {
            table: "posts",
            schema: PostSchema,
            localKey: "missing",
            foreignKey: "user_id",
            relation: "many",
          },
        },
      })
    ).toThrow(/parent schema has no column "missing"/);

    expect(() =>
      db.table("users", UserSchema, {
        relations: {
          posts: {
            table: "posts",
            schema: PostSchema,
            localKey: "id",
            foreignKey: "missing",
            relation: "many",
          },
        },
      })
    ).toThrow(/related schema has no column "missing"/);

    expect(() =>
      db.table("users", UserSchema, {
        relations: {
          posts: {
            table: "posts",
            schema: PostSchema,
            localKey: "id",
            foreignKey: "user_id",
            relation: "sometimes",
          } as never,
        },
      })
    ).toThrow(/relation" must be "one" or "many"/);

    expect(() =>
      db.table("users", UserSchema, {
        relations: {
          "": {
            table: "posts",
            schema: PostSchema,
            localKey: "id",
            foreignKey: "user_id",
            relation: "many",
          },
        },
      })
    ).toThrow(TableError);

    expect(() =>
      db.table("users", UserSchema, {
        relations: {
          posts: {
            table: "posts",
            schema: PostSchema,
            localKey: ["id", "name"],
            foreignKey: ["user_id"],
            relation: "many",
          },
        },
      })
    ).toThrow(/same number of columns/);
  });

  test("withCount accepts a relation refinement", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada'), (2, 'Grace')`;
    await sql`
      INSERT INTO posts (id, user_id, title)
      VALUES (10, 1, 'First'), (11, 1, 'Second'), (12, 2, 'Third')
    `;

    const rows = await users()
      .withCount("posts", (posts) => posts.where({ title: "First" }))
      .orderBy([{ column: "id", direction: "ASC" }])
      .findMany();

    expect(rows.map((row) => row.posts_count)).toEqual([1, 0]);
  });

  test("relation table names respect strictNames/allowSchema", () => {
    expect(() =>
      db.table("users", UserSchema, {
        strictNames: true,
        relations: {
          posts: {
            table: "bad-name",
            schema: PostSchema,
            localKey: "id",
            foreignKey: "user_id",
            relation: "many",
          },
        },
      })
    ).toThrow(TableError);

    expect(() =>
      db.table("users", UserSchema, {
        relations: {
          posts: {
            table: "public.posts",
            schema: PostSchema,
            localKey: "id",
            foreignKey: "user_id",
            relation: "many",
          },
        },
      })
    ).toThrow(TableError);

    expect(() =>
      db.table("users", UserSchema, {
        allowSchema: true,
        relations: {
          posts: {
            table: "public.posts",
            schema: PostSchema,
            localKey: "id",
            foreignKey: "user_id",
            relation: "many",
          },
        },
      })
    ).not.toThrow();
  });

  test("computed fields compose with includes", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada')`;
    await sql`INSERT INTO posts (id, user_id, title) VALUES (10, 1, 'First')`;

    const rows = await users()
      .include("posts")
      .selectExpr({ lowerName: sqlExpr<string>(sql`lower(name)`) })
      .findMany();

    expect(rows[0]?.lowerName).toBe("ada");
    expect(rows[0]?.posts).toHaveLength(1);
  });

  test("whereEvery matches parents whose related rows all match", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada'), (2, 'Grace'), (3, 'Linus')`;
    await sql`
      INSERT INTO posts (id, user_id, title)
      VALUES (10, 1, 'First'), (11, 1, 'Second'), (12, 2, 'Third')
    `;

    const rows = await users()
      .whereEvery("posts", (posts) => posts.where({ title: "First" }))
      .orderBy([{ column: "id", direction: "ASC" }])
      .findMany();

    // Ada has "Second", Grace has "Third"; Linus has no posts (vacuously true).
    expect(rows.map((row) => row.id)).toEqual([3]);
  });

  test("include accepts declarative refinement options", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada')`;
    await sql`
      INSERT INTO posts (id, user_id, title)
      VALUES (10, 1, 'First'), (11, 1, 'Second')
    `;

    const rows = await users()
      .include("posts", {
        where: { title: "First" },
        orderBy: [{ column: "id", direction: "ASC" }],
        take: 1,
        select: ["id", "title"],
      })
      .findMany();

    expect(rows[0]?.posts).toEqual([{ id: 10, title: "First", comments: [], tags: [] }]);
  });

  test("innerJoin and leftJoin nest the right row", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada'), (2, 'Grace')`;
    await sql`
      INSERT INTO posts (id, user_id, title, published)
      VALUES (10, 1, 'First', true)
    `;

    const inner = await users()
      .innerJoin("posts", PostSchema, sql`"posts"."user_id" = "users"."id"`)
      .findMany();

    expect(inner).toHaveLength(1);
    expect(inner[0]?.name).toBe("Ada");
    expect(inner[0]?.posts.title).toBe("First");

    const left = await users()
      .leftJoin("posts", PostSchema, sql`"posts"."user_id" = "users"."id"`)
      .orderByRaw(sql`"users"."id" ASC`)
      .findMany();

    expect(left[0]?.posts.title).toBe("First");
    expect(left[1]?.posts).toBeNull();
  });

  test("whereEvery without a refinement is a no-op", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada')`;

    const rows = await users().whereEvery("posts").findMany();
    expect(rows).toHaveLength(1);
  });

  test("selectExpr composes with include after it", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada')`;
    await sql`INSERT INTO posts (id, user_id, title) VALUES (10, 1, 'First')`;

    const rows = await users()
      .selectExpr({ lowerName: sqlExpr<string>(sql`lower(name)`) })
      .include("posts")
      .findMany();

    expect(rows[0]?.lowerName).toBe("ada");
    expect(rows[0]?.posts).toHaveLength(1);
  });

  test("multiple joins and aliases nest every right row", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada'), (2, 'Grace')`;
    await sql`
      INSERT INTO posts (id, user_id, title, published)
      VALUES (10, 1, 'First', true), (11, 2, 'Second', true), (12, 1, 'Third', true)
    `;

    const rows = await db
      .table("users", UserSchema)
      .innerJoin("posts", PostSchema, sql`"posts"."user_id" = "users"."id"`)
      .innerJoin(
        "other_posts",
        PostSchema,
        sql`"other_posts"."user_id" = "users"."id" AND "other_posts"."id" = 12`,
        {
          table: "posts",
          alias: "other_posts",
        }
      )
      .whereRaw(sql`"users"."id" = 1 AND "posts"."id" = 10`)
      .findMany();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.posts.title).toBe("First");
    expect(rows[0]?.other_posts.title).toBe("Third");

    const aliased = await db
      .table("users", UserSchema)
      .innerJoin("manager", UserSchema, sql`"manager"."id" = "users"."id"`, {
        table: "users",
        alias: "manager",
      })
      .whereRaw(sql`"users"."id" = 1`)
      .findMany();

    expect(aliased[0]?.manager.name).toBe("Ada");
  });

  test("through relations load, count, and filter", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada')`;
    await sql`
      INSERT INTO posts (id, user_id, title)
      VALUES (10, 1, 'First'), (11, 1, 'Second'), (12, 1, 'Third')
    `;
    await sql`INSERT INTO tags (id, name) VALUES (1, 'typescript'), (2, 'postgres')`;
    await sql`
      INSERT INTO post_tags (post_id, tag_id)
      VALUES (10, 1), (10, 2), (11, 2)
    `;

    const included = await posts()
      .include("tags", (tags) => tags.orderBy([{ column: "id", direction: "ASC" }]))
      .withCount("tags")
      .orderBy([{ column: "id", direction: "ASC" }])
      .findMany();

    expect(included[0]?.tags.map((tag) => tag.name)).toEqual(["typescript", "postgres"]);
    expect(included[0]?.tags_count).toBe(2);
    expect(included[1]?.tags.map((tag) => tag.name)).toEqual(["postgres"]);

    const limited = await posts()
      .include("tags", (tags) => tags.orderBy([{ column: "id", direction: "DESC" }]).take(1))
      .where({ id: 10 })
      .findMany();

    expect(limited[0]?.tags.map((tag) => tag.id)).toEqual([2]);

    const filtered = await posts()
      .whereRelated("tags", (tags) => tags.where({ name: "typescript" }))
      .findMany();

    expect(filtered.map((post) => post.id)).toEqual([10]);

    const counted = await posts()
      .withCount("tags", (tags) => tags.where({ name: "postgres" }))
      .orderBy([{ column: "id", direction: "ASC" }])
      .findMany();

    expect(counted.map((post) => post.tags_count)).toEqual([1, 1, 0]);

    const missing = await posts()
      .whereMissing("tags")
      .orderBy([{ column: "id", direction: "ASC" }])
      .findMany();

    expect(missing.map((post) => post.id)).toEqual([12]);

    const every = await posts()
      .whereEvery("tags", (tags) => tags.where({ name: "postgres" }))
      .orderBy([{ column: "id", direction: "ASC" }])
      .findMany();

    expect(every.map((post) => post.id)).toEqual([11, 12]);
  });

  test("nested includes load declared child relations", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada')`;
    await sql`
      INSERT INTO posts (id, user_id, title)
      VALUES (10, 1, 'First'), (11, 1, 'Second')
    `;
    await sql`
      INSERT INTO comments (id, post_id, body)
      VALUES (100, 10, 'one'), (101, 10, 'two'), (102, 11, 'three')
    `;
    await sql`INSERT INTO tags (id, name) VALUES (1, 'typescript')`;
    await sql`INSERT INTO post_tags (post_id, tag_id) VALUES (10, 1)`;

    const rows = await users()
      .include("posts", (posts) => posts.orderBy([{ column: "id", direction: "ASC" }]))
      .findMany();

    expect(rows[0]?.posts[0]?.comments.map((comment) => comment.body)).toEqual(["one", "two"]);
    expect(rows[0]?.posts[0]?.tags.map((tag) => tag.name)).toEqual(["typescript"]);
    expect(rows[0]?.posts[1]?.comments.map((comment) => comment.body)).toEqual(["three"]);
    expect(rows[0]?.posts[1]?.tags).toEqual([]);
  });

  test("withAggregate computes per-relation aggregates", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada')`;
    await sql`
      INSERT INTO posts (id, user_id, title)
      VALUES (10, 1, 'First'), (11, 1, 'Second'), (12, 1, 'Third')
    `;
    await sql`INSERT INTO tags (id, name) VALUES (1, 'typescript'), (2, 'postgres')`;
    await sql`
      INSERT INTO post_tags (post_id, tag_id)
      VALUES (10, 1), (10, 2), (11, 2)
    `;

    const direct = await users()
      .withAggregate("posts", {
        count: true,
        sum: ["id"],
        avg: ["id"],
        min: ["id"],
        max: ["id"],
      })
      .findMany();

    expect(direct[0]?.posts_count).toBe(3);
    expect(direct[0]?.posts_sum_id).toBe(33);
    expect(direct[0]?.posts_avg_id).toBe(11);

    const filtered = await users()
      .withAggregate("posts", { count: true }, (posts) => posts.where({ title: "First" }))
      .findMany();

    expect(filtered[0]?.posts_count).toBe(1);

    const through = await posts()
      .orderBy([{ column: "id", direction: "ASC" }])
      .withAggregate("tags", { count: true, min: ["id"], max: ["id"] })
      .findMany();

    expect(through[0]?.tags_count).toBe(2);
    expect(through[0]?.tags_min_id).toBe(1);
    expect(through[0]?.tags_max_id).toBe(2);
    expect(through[2]?.tags_count).toBe(0);
    expect(through[2]?.tags_min_id).toBeNull();
  });

  test("orderByRelated orders parents by related aggregates", async () => {
    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada'), (2, 'Grace')`;
    await sql`
      INSERT INTO posts (id, user_id, title)
      VALUES (10, 1, 'First'), (11, 1, 'Second'), (12, 2, 'Third')
    `;
    await sql`INSERT INTO tags (id, name) VALUES (1, 'typescript'), (2, 'postgres')`;
    await sql`
      INSERT INTO post_tags (post_id, tag_id)
      VALUES (10, 1), (10, 2), (11, 2)
    `;

    const byPosts = await users()
      .orderByRelated("posts", { aggregate: "count", direction: "DESC" })
      .findMany();
    expect(byPosts.map((user) => user.id)).toEqual([1, 2]);

    const byTags = await posts()
      .orderByRelated("tags", { aggregate: "count", direction: "DESC" })
      .findMany();
    expect(byTags[0]?.id).toBe(10);
    expect(byTags[0]?.title).toBe("First");
  });

  test("cyclic relation configs are rejected", () => {
    const cyclic: Record<string, unknown> = {
      table: "posts",
      schema: PostSchema,
      localKey: "id",
      foreignKey: "user_id",
      relation: "many",
    };
    cyclic.relations = { loop: cyclic };

    expect(() => db.table("users", UserSchema, { relations: { posts: cyclic } })).toThrow(
      TableError
    );
  });

  test("joins can map and decode right-side columns", async () => {
    const PostJoinSchema = z.object({
      id: z.number(),
      headline: z.string(),
      published: z.boolean(),
    });

    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada')`;
    await sql`
      INSERT INTO posts (id, user_id, title, published)
      VALUES (10, 1, 'First', true)
    `;

    const rows = await users()
      .innerJoin("posts", PostJoinSchema, sql`"posts"."user_id" = "users"."id"`, {
        columnMap: { headline: "title" },
        columnCodecs: {
          headline: { decode: (value) => `decoded:${String(value)}` },
        },
      })
      .whereRaw(sql`"users"."id" = 1`)
      .findMany();

    expect(rows[0]?.posts.headline).toBe("decoded:First");
  });

  test("relation column maps and codecs apply to includes and counts", async () => {
    const TagMapSchema = z.object({
      id: z.number(),
      label: z.string(),
    });

    const postsMapped = db.table("posts", PostSchema, {
      relations: {
        tags: {
          table: "tags",
          schema: TagMapSchema,
          localKey: "id",
          relation: "many",
          columnMap: { label: "name" },
          columnCodecs: {
            label: { decode: (value) => `mapped:${String(value)}` },
          },
          through: {
            table: "post_tags",
            parentKey: "post_id",
            relatedKey: "tag_id",
            targetKey: "id",
          },
        },
      },
    });

    await sql`INSERT INTO users (id, name) VALUES (1, 'Ada')`;
    await sql`INSERT INTO posts (id, user_id, title) VALUES (10, 1, 'First'), (11, 1, 'Second')`;
    await sql`INSERT INTO tags (id, name) VALUES (1, 'typescript')`;
    await sql`INSERT INTO post_tags (post_id, tag_id) VALUES (10, 1)`;

    const rows = await postsMapped.include("tags").withCount("tags").findMany();

    expect(rows[0]?.tags[0]?.label).toBe("mapped:typescript");
    expect(rows[0]?.tags_count).toBe(1);

    const related = await postsMapped
      .whereRelated("tags", (tags) => tags.where({ label: "typescript" }))
      .findMany();
    expect(related.map((post) => post.id)).toEqual([10]);

    const missing = await postsMapped
      .whereMissing("tags")
      .orderBy([{ column: "id", direction: "ASC" }])
      .findMany();
    expect(missing.map((post) => post.id)).toEqual([11]);
  });
});
