import * as v from "valibot";
import * as yup from "yup";
import type { PgBuddyClient } from "../../src";

declare const db: PgBuddyClient;

async function check() {
  const valibotSchema = v.object({
    id: v.number(),
    email: v.string(),
  });
  const valibotRows = await db.table("valibot_users", valibotSchema).findMany();
  const _valibotRows: Array<{ id: number; email: string }> = valibotRows;

  const yupSchema = yup.object({
    id: yup.number().required(),
    email: yup.string().required(),
  });
  const yupRows = await db.table("yup_users", yupSchema).findMany();
  const _yupRows: Array<{ id: number; email: string }> = yupRows;

  return [_valibotRows, _yupRows];
}

export { check };
