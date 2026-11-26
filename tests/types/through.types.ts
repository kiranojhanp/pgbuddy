import { z } from "zod";
import type { RowFromSchema, ZodTable } from "../../src";

const PostSchema = z.object({
  id: z.number(),
  title: z.string(),
});

const TagSchema = z.object({
  id: z.number(),
  name: z.string(),
});

type Post = z.infer<typeof PostSchema>;
type Tag = z.infer<typeof TagSchema>;

type PostRelations = {
  tags: {
    table: "tags";
    schema: typeof TagSchema;
    localKey: "id";
    relation: "many";
    through: {
      table: "post_tags";
      parentKey: "post_id";
      relatedKey: "tag_id";
      targetKey: "id";
    };
  };
};

declare const posts: ZodTable<
  typeof PostSchema,
  ["*"],
  RowFromSchema<typeof PostSchema>,
  PostRelations
>;

async function check() {
  const rows = await posts.include("tags").withCount("tags").findMany();
  const _rows: Array<Post & { tags: Tag[]; tags_count: number }> = rows;

  const filtered = await posts
    .whereRelated("tags", (tags) => tags.where({ name: "typescript" }))
    .findMany();
  const _filtered: Array<Post & { tags?: Tag[]; tags_count?: number }> = filtered;

  return [_rows, _filtered];
}

export { check };
