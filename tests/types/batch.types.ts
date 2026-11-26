import type { PgBuddyClient } from "../../src";

declare const db: PgBuddyClient;

async function check() {
  const [numberRows, stringRows] = await db.batch([
    db.sql<{ value: number }[]>`select 1 as value`,
    db.sql<{ value: string }[]>`select 'ok' as value`,
  ]);

  const _number: Array<{ value: number }> = numberRows;
  const _string: Array<{ value: string }> = stringRows;

  const [callbackRows] = await db.batch((tx) => [tx.sql<{ value: number }[]>`select 1 as value`]);
  const _callbackRows: Array<{ value: number }> = callbackRows;

  const empty = await db.batch([]);
  const _empty: [] = empty;

  return [_number, _string, _callbackRows, _empty];
}

export { check };
