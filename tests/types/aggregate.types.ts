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

type User = z.infer<typeof UserSchema>;

type UserRelations = {
  posts: {
    table: "posts";
    schema: typeof PostSchema;
    localKey: "id";
    foreignKey: "user_id";
    relation: "many";
  };
};

declare const users: ZodTable<
  typeof UserSchema,
  ["*"],
  RowFromSchema<typeof UserSchema>,
  UserRelations
>;

async function check() {
  const rows = await users
    .withAggregate("posts", {
      count: true,
      sum: ["id"],
      avg: ["id"],
      min: ["id"],
      max: ["id"],
    })
    .findMany();
  const _rows: Array<
    User & {
      posts_count: number;
      posts_sum_id: number | null;
      posts_avg_id: number | null;
      posts_min_id: number | null;
      posts_max_id: number | null;
    }
  > = rows;

  const included = await users.include("posts").withAggregate("posts", { count: true }).findMany();
  const _included: Array<User & { posts: Array<z.infer<typeof PostSchema>>; posts_count: number }> =
    included;

  const ordered = await users
    .orderByRelated("posts", { aggregate: "count", direction: "DESC" })
    .findMany();
  const _ordered: User[] = ordered;

  const summed = await users
    .orderByRelated("posts", {
      aggregate: "sum",
      column: "id",
      direction: "DESC",
      nulls: "last",
    })
    .findMany();
  const _summed: User[] = summed;

  return [_rows, _included, _ordered, _summed];
}

export { check };
