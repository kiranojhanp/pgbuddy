import type { PgBuddyClient, ValidatorAdapter } from "../../src";

interface User {
  id: number;
  email: string;
}

const UserSchema = {
  _output: {} as User,
  _input: {} as User,
};

const adapter: ValidatorAdapter = {
  fields: () => ["id", "email"],
  parse: (_schema, value) => value as User,
  parsePartial: (_schema, value) => value as Partial<User>,
};

declare const db: PgBuddyClient;

async function check() {
  const users = db.table("users", UserSchema);
  const rows = await users.where({ email: "a@example.com" }).findMany();
  const _rows: User[] = rows;

  const created = await users.create({ id: 1, email: "a@example.com" });
  const _created: User = created;

  const [updated] = (await users.where({ id: 1 }).update({ email: "b@example.com" })) as User[];
  const _updated: User | undefined = updated;

  const withPosts = db.table("users", UserSchema, {
    adapterRelations: {
      posts: {
        table: "posts",
        fields: ["id", "user_id"] as const,
        localKey: "id",
        foreignKey: "user_id",
        relation: "many",
      },
    },
  });

  const included = await withPosts.include("posts").withCount("posts").findMany();
  const _posts = included[0]?.posts ?? [];
  const _postId: unknown = _posts[0]?.id;
  const _postCount: number | undefined = included[0]?.posts_count;

  return [_rows, _created, _updated, _posts, _postCount, _postId, adapter];
}

export { check };
