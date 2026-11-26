import { z } from "zod";
import type { PgBuddyClient } from "../../src";

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
});

const PostSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  title: z.string(),
});

const TeamSchema = z.object({
  tenant_id: z.number(),
  slug: z.string(),
  name: z.string(),
});

const MemberSchema = z.object({
  id: z.number(),
  tenant_id: z.number(),
  team_slug: z.string(),
  name: z.string(),
});

declare const db: PgBuddyClient;

const users = db.table("users", UserSchema, {
  relations: {
    posts: {
      table: "posts",
      schema: PostSchema,
      localKey: "id",
      foreignKey: "user_id",
      relation: "many",
    },
  },
});

const posts = db.table("posts", PostSchema, {
  relations: {
    author: {
      table: "users",
      schema: UserSchema,
      localKey: "user_id",
      foreignKey: "id",
      relation: "one",
    },
  },
});

const teams = db.table("teams", TeamSchema, {
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

async function check() {
  const rows = await users.include("posts").findMany();
  const _rows: Array<{
    id: number;
    name: string;
    posts: Array<{ id: number; user_id: number; title: string }>;
  }> = rows;

  const first = await users.include("posts").findFirst();
  const _first: {
    id: number;
    name: string;
    posts: Array<{ id: number; user_id: number; title: string }>;
  } | null = first;

  const withAuthor = await posts.include("author").findMany();
  const _withAuthor: Array<{
    id: number;
    user_id: number;
    title: string;
    author: { id: number; name: string } | null;
  }> = withAuthor;

  const _plain = await users.findMany();
  const _plainRows: Array<{ id: number; name: string }> = _plain;

  // @ts-expect-error - "comments" is not a configured relation
  users.include("comments");

  // Refinements keep the full relation shape when no select is given.
  const refined = await users
    .include("posts", (posts) =>
      posts
        .where({ title: "x" })
        .orderBy([{ column: "id", direction: "DESC" }])
        .take(5)
    )
    .findMany();
  const _refined: Array<{
    id: number;
    name: string;
    posts: Array<{ id: number; user_id: number; title: string }>;
  }> = refined;

  // select() narrows the returned relation type.
  const selected = await users
    .include("posts", (posts) =>
      posts
        .where({ title: "x" })
        .orderBy([{ column: "id", direction: "DESC" }])
        .take(5)
        .select(["id", "title"])
    )
    .findMany();
  const _selected: Array<{
    id: number;
    name: string;
    posts: Array<{ id: number; title: string }>;
  }> = selected;

  // @ts-expect-error - user_id was not selected
  selected[0]?.posts[0]?.user_id;

  // Selecting the foreign key keeps it in the result type.
  const selectedForeignKey = await users
    .include("posts", (posts) => posts.select(["id", "user_id"]))
    .findMany();
  const _selectedForeignKey: Array<{
    id: number;
    name: string;
    posts: Array<{ id: number; user_id: number }>;
  }> = selectedForeignKey;

  // To-one refinement narrowing keeps nullability.
  const selectedAuthor = await posts
    .include("author", (author) => author.select(["id", "name"]))
    .findMany();
  const _selectedAuthor: Array<{
    id: number;
    user_id: number;
    title: string;
    author: { id: number; name: string } | null;
  }> = selectedAuthor;

  const optionsSelected = await users
    .include("posts", { where: { title: "x" }, select: ["id", "title"], take: 1 })
    .findMany();
  const _optionsSelected: Array<{
    id: number;
    name: string;
    posts: Array<{ id: number; title: string }>;
  }> = optionsSelected;

  // Auto-selected local keys stay out of the result type.
  const projected = await users.select(["name"]).include("posts").findMany();
  const _projected: Array<{
    name: string;
    posts: Array<{ id: number; user_id: number; title: string }>;
  }> = projected;

  // @ts-expect-error - id is auto-selected internally but stripped
  projected[0]?.id;

  // withCount adds a number field.
  const counted = await users.withCount("posts").findMany();
  const _counted: Array<{ id: number; name: string; posts_count: number }> = counted;

  // @ts-expect-error - posts_count is a number, not a string
  const _badCount: Array<{ id: number; name: string; posts_count: string }> = counted;

  // withCount and include compose.
  const countedIncluded = await users.withCount("posts").include("posts").findMany();
  const _countedIncluded: Array<{
    id: number;
    name: string;
    posts_count: number;
    posts: Array<{ id: number; user_id: number; title: string }>;
  }> = countedIncluded;

  // Relation filters return the parent shape unchanged.
  const related = await users
    .whereRelated("posts", (posts) => posts.where({ title: "x" }))
    .findMany();
  const _related: Array<{ id: number; name: string }> = related;

  const relatedChained = await users
    .whereRelated("posts", (posts) => posts.where({ title: "x" }).where({ id: 1 }))
    .where({ name: "Ada" })
    .findMany();
  const _relatedChained: Array<{ id: number; name: string }> = relatedChained;

  const missing = await users.whereMissing("posts").findMany();
  const _missing: Array<{ id: number; name: string }> = missing;

  // @ts-expect-error - "comments" is not a configured relation
  users.whereRelated("comments");

  // @ts-expect-error - "comments" is not a configured relation
  users.whereMissing("comments");

  // @ts-expect-error - "comments" is not a configured relation
  users.withCount("comments");

  // Invalid refinement fields and selections are rejected.
  // @ts-expect-error - "missing" is not a column on the related schema
  users.include("posts", (posts) => posts.where({ missing: true }));

  // @ts-expect-error - "missing" is not a column on the related schema
  users.include("posts", (posts) => posts.select(["missing"]));

  // @ts-expect-error - direction must be ASC or DESC
  users.include("posts", (posts) => posts.orderBy([{ column: "id", direction: "UP" }]));

  // Composite keys are supported in relation configs and results.
  const teamRows = await teams.include("members").withCount("members").findMany();
  const _teamRows: Array<{
    tenant_id: number;
    slug: string;
    name: string;
    members: Array<{ id: number; tenant_id: number; team_slug: string; name: string }>;
    members_count: number;
  }> = teamRows;

  return [
    _rows,
    _first,
    _withAuthor,
    _plainRows,
    _refined,
    _selected,
    _selectedForeignKey,
    _selectedAuthor,
    _projected,
    _counted,
    _badCount,
    _countedIncluded,
    _related,
    _relatedChained,
    _missing,
    _teamRows,
  ];
}

export { check };
