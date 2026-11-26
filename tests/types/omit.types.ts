import { z } from "zod";
import type { Table, ZodTable } from "../../src";

const AccountSchema = z.object({
  id: z.number(),
  email: z.email(),
  password_hash: z.string(),
});

declare const accounts: ZodTable<typeof AccountSchema>;

const withoutHash = accounts.omit(["password_hash"]).findMany();
const _withoutHash: Promise<Array<{ id: number; email: string }>> = withoutHash;

const withoutId = accounts.omit(["id"]).findMany();
const _withoutId: Promise<Array<{ email: string; password_hash: string }>> = withoutId;

// @ts-expect-error - "missing" is not a schema column
accounts.omit(["missing"]);

interface AccountRow {
  id: number;
  email: string;
  password_hash: string;
}

declare const table: Table<AccountRow>;

const plainRows = table.omit(["password_hash"]).findMany();
const _plainRows: Promise<Array<{ id: number; email: string }>> = plainRows;
