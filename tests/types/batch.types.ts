import type { PgBuddyClient } from "../../src";

declare const db: PgBuddyClient;

async function check() {
  const [numberResult, stringResult] = await db.batch([async () => 1, async () => "ok"] as const);

  const _tuple: [number, string] = [numberResult, stringResult];

  const empty = await db.batch([]);
  const _empty: [] = empty;

  return [_tuple, _empty];
}

export { check };
