import * as v from "valibot";
import * as yup from "yup";
import type { PgBuddyClient } from "../../src";
import { valibotValidator } from "../../src/adapters/valibot";
import { yupValidator } from "../../src/adapters/yup";

declare const db: PgBuddyClient;

async function check() {
  const valibotSchema = v.object({
    id: v.number(),
    email: v.string(),
  });
  const valibotUsers = db.tableWithValidator("valibot_users", valibotSchema, valibotValidator);
  const valibotRows = await valibotUsers.findMany();
  const _valibotRows: Array<{ id: number; email: string }> = valibotRows;

  const yupSchema = yup.object({
    id: yup.number().required(),
    email: yup.string().required(),
  });
  const yupUsers = db.tableWithValidator("yup_users", yupSchema, yupValidator);
  const yupRows = await yupUsers.findMany();
  const _yupRows: Array<{ id: number; email: string }> = yupRows;

  return [_valibotRows, _yupRows];
}

export { check };
