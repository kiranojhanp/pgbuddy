import type { SqlFragment, Table } from "../../src";

interface User {
  id: number;
  name: string;
}

interface Post {
  id: number;
  user_id: number;
  title: string;
}

declare const users: Table<User>;
declare const on: SqlFragment;

async function check() {
  const inner = await users
    .innerJoin<"posts", Post>("posts", {
      columns: ["id", "user_id", "title"],
      on,
    })
    .findMany();
  const _inner: Array<User & { posts: Post }> = inner;

  const left = await users
    .leftJoin<"posts", Post>("posts", {
      columns: ["id", "user_id", "title"],
      on,
    })
    .findMany();
  const _left: Array<User & { posts: Post | null }> = left;

  const selected = await users
    .select(["id"])
    .innerJoin<"posts", Post>("posts", {
      columns: ["id", "user_id", "title"],
      on,
    })
    .findMany();
  const _selected: Array<{ id: number; posts: Post }> = selected;

  // @ts-expect-error - left join rows are nullable
  const _bad: Array<User & { posts: Post }> = left;

  return [_inner, _left, _bad, _selected];
}

export { check };
