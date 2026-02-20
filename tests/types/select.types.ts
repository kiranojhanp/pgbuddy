import type { Table } from "../../src";

interface User {
  id: number;
  email: string;
  status: "active" | "inactive";
  last_login: Date | null;
}

declare const table: Table<User>;

// Default selection returns full rows
const all = table.findMany();
const _all: Promise<User[]> = all;

// Projection narrows the shape
const emails = table.select(["email"]).findMany();
const _emails: Promise<Array<{ email: string }>> = emails;

// Explicit star selection returns full rows
const all2 = table.select(["*"] as const).findMany();
const _all2: Promise<User[]> = all2;

// @ts-expect-error '*' is not allowed alongside column names
const bad = table.select(["email", "*"] as const).findMany();
void bad;
