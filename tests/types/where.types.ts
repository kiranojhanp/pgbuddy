import type { Predicate, Table } from "../../src";
import { and, contains, eq, not, or, startsWith } from "../../src";

interface User {
  id: number;
  email: string;
  status: "active" | "inactive";
  last_login: Date | null;
}

declare const users: Table<User>;

// Predicates infer the row type from the where() context.
const q1 = users.where(or(eq("email", "ada@example.com"), eq("status", "active")));
const q2 = users.where(and(contains("email", "example"), not(eq("status", "inactive"))));
const q3 = users.where(startsWith("email", "a"));
const _all = [q1, q2, q3];

// A predicate can also be named explicitly with the row type.
const predicate: Predicate<User> = eq("email", "ada@example.com");
const q4 = users.where(predicate);
const _typed = q4;

// Unknown fields are rejected.
// @ts-expect-error - "nope" is not a column of User
users.where(eq("nope", "x"));

// Values are checked against the column type.
// @ts-expect-error - id is a number
users.where(eq("id", "not-a-number"));

// Composing predicates still infers the row type.
// @ts-expect-error - "nope" is not a column of User
users.where(and(eq("email", "a"), or(eq("nope", 1))));
