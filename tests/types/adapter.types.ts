import type { PgBuddyClient, ValidationAdapter } from "../../src";

interface User {
  id: number;
  email: string;
}

const adapter: ValidationAdapter<User, User> = {
  __pgbuddyAdapter: true,
  fields: ["id", "email"],
  parse(value) {
    return { success: true, data: value as User };
  },
  parsePartial(value) {
    return { success: true, data: value as Partial<User> };
  },
};

declare const db: PgBuddyClient;

async function check() {
  const users = db.tableWithAdapter("users", adapter);
  const rows = await users.where({ email: "a@example.com" }).findMany();
  const _rows: User[] = rows;

  const created = await users.create({ id: 1, email: "a@example.com" });
  const _created: User = created;

  const [updated] = (await users.where({ id: 1 }).update({ email: "b@example.com" })) as User[];
  const _updated: User | undefined = updated;

  const withPosts = db.tableWithAdapter("users", adapter, {
    adapterRelations: {
      posts: {
        table: "posts",
        fields: ["id", "user_id"],
        localKey: "id",
        foreignKey: "user_id",
        relation: "many",
      },
    },
  });

  const included = await withPosts.include("posts").withCount("posts").findMany();
  const _posts: Array<Record<string, unknown>> = included[0]?.posts ?? [];
  const _postCount: number | undefined = included[0]?.posts_count;

  return [_rows, _created, _updated, _posts, _postCount];
}

export { check };
