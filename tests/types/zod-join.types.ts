import { z } from "zod";
import type { SqlFragment, ZodTable } from "../../src";

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
});

const PostSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  title: z.string(),
});

const CommentSchema = z.object({
  id: z.number(),
  post_id: z.number(),
  body: z.string(),
});

type User = z.infer<typeof UserSchema>;
type Post = z.infer<typeof PostSchema>;
type Comment = z.infer<typeof CommentSchema>;

declare const users: ZodTable<typeof UserSchema>;
declare const on: SqlFragment;

async function check() {
  const rows = await users
    .innerJoin("posts", PostSchema, on)
    .leftJoin("comments", CommentSchema, on)
    .findMany();
  const _rows: Array<User & { posts: Post; comments: Comment | null }> = rows;

  const aliased = await users
    .innerJoin("manager", UserSchema, on, { table: "users", alias: "manager" })
    .findMany();
  const _aliased: Array<User & { manager: User }> = aliased;

  return [_rows, _aliased];
}

export { check };
