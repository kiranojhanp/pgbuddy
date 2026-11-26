import { z } from "zod";
import type { RowFromSchema, ZodTable } from "../../src";

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

type UserRelations = {
  posts: {
    table: "posts";
    schema: typeof PostSchema;
    localKey: "id";
    foreignKey: "user_id";
    relation: "many";
    relations: {
      comments: {
        table: "comments";
        schema: typeof CommentSchema;
        localKey: "id";
        foreignKey: "post_id";
        relation: "many";
      };
    };
  };
};

declare const users: ZodTable<
  typeof UserSchema,
  ["*"],
  RowFromSchema<typeof UserSchema>,
  UserRelations
>;

async function check() {
  const rows = await users.include("posts").findMany();
  const _rows: Array<User & { posts: Array<Post & { comments: Comment[] }> }> = rows;

  const selected = await users
    .include("posts", (posts) => posts.select(["id", "title"]))
    .findMany();
  const _selected: Array<
    User & { posts: Array<{ id: number; title: string; comments: Comment[] }> }
  > = selected;

  return [_rows, _selected];
}

export { check };
