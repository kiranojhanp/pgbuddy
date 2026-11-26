import { z } from "zod";
import type { PgBuddyClient } from "../../src";

declare const db: PgBuddyClient;

const UserSchema = z.object({
  id: z.number(),
  email: z.string(),
});

async function check() {
  const users = db.table("users", UserSchema);
  const rows = await users.findMany();
  const _rows: Array<{ id: number; email: string }> = rows;

  const created = await users.create({ id: 1, email: "a@example.com" });
  const _created: { id: number; email: string } = created;

  return [_rows, _created];
}

export { check };
