import { z } from "zod";
import type { PgBuddyClient } from "../../src";

declare const db: PgBuddyClient;

const UserSchema = z.object({
  id: z.number(),
  email: z.string(),
});

async function check() {
  const [numberRows, stringRows] = await db.batch([
    db.sql<{ value: number }[]>`select 1 as value`,
    db.sql<{ value: string }[]>`select 'ok' as value`,
  ]);

  const _number: Array<{ value: number }> = numberRows;
  const _string: Array<{ value: string }> = stringRows;

  const [callbackRows] = await db.batch((tx) => [tx.sql<{ value: number }[]>`select 1 as value`]);
  const _callbackRows: Array<{ value: number }> = callbackRows;

  const [userRows, userCount] = await db.batch([
    db.table("users", UserSchema).findMany(),
    db.table("users", UserSchema).count(),
  ]);
  const _userRows: Array<{ id: number; email: string }> = userRows;
  const _userCount: number = userCount;

  const empty = await db.batch([]);
  const _empty: [] = empty;

  return [_number, _string, _callbackRows, _empty, _userRows, _userCount];
}

export { check };
