import { z } from "zod";
import type { PgBuddyClient } from "../../src";

declare const db: PgBuddyClient;

const UserSchema = z.object({
  id: z.number(),
  email: z.string(),
});

async function check() {
  const user = await db.batch(async (tx) => {
    return tx.table("users", UserSchema).where({ id: 1 }).findFirst();
  });

  const _user: { id: number; email: string } | null = user;

  const [numberRows, stringRows] = await db.batch([
    db.sql<{ value: number }[]>`select 1 as value`,
    db.sql<{ value: string }[]>`select 'ok' as value`,
  ]);

  const _number: Array<{ value: number }> = numberRows;
  const _string: Array<{ value: string }> = stringRows;

  const empty = await db.batch([]);
  const _empty: [] = empty;

  return [_user, _number, _string, _empty];
}

export { check };
