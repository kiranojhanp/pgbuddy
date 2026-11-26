import { sqlExpr, type Table } from "../../src";

interface User {
  id: number;
  email: string;
}

declare const users: Table<User>;
declare const fragment: Parameters<typeof sqlExpr>[0];

async function check() {
  const rows = await users.findMany({
    computed: {
      lower: sqlExpr<string>(fragment),
    },
  });
  const _rows: Array<{ id: number; email: string; lower: string }> = rows;

  const first = await users.findFirst({
    computed: {
      count: sqlExpr<number>(fragment),
    },
  });
  const _first: { id: number; email: string; count: number } | null = first;

  const chained = await users.selectExpr({ lower: sqlExpr<string>(fragment) }).findMany();
  const _chained: Array<{ id: number; email: string; lower: string }> = chained;

  const created = await users.create(
    { id: 1, email: "a@example.com" },
    { computed: { lower: sqlExpr<string>(fragment) } }
  );
  const _created: { id: number; email: string; lower: string } = created;

  const skipped = await users.create({ id: 2, email: "b@example.com" }, { onConflict: "nothing" });
  const _skipped: { id: number; email: string } | null = skipped;

  const updated = await users.update(
    { email: "c@example.com" },
    { computed: { lower: sqlExpr<string>(fragment) } }
  );
  const _updated: Array<{ id: number; email: string; lower: string }> = updated;

  const deleted = await users.delete({
    computed: { lower: sqlExpr<string>(fragment) },
  });
  const _deleted: Array<{ id: number; email: string; lower: string }> = deleted;

  const grouped = await users.groupBy(["email"], { count: sqlExpr<number>(fragment) }).findMany();
  const _grouped: Array<{ email: string; count: number }> = grouped;

  const many = await users.createMany([{ id: 3, email: "c@example.com" }], {
    computed: { lower: sqlExpr<string>(fragment) },
  });
  const _many: Array<{ id: number; email: string; lower: string }> = many;

  // @ts-expect-error - lower is a string
  const _bad: Array<{ id: number; email: string; lower: number }> = rows;

  return [_rows, _first, _bad, _created, _skipped, _updated, _deleted, _grouped];
}

export { check };
