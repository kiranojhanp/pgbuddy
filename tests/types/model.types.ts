import type { Model, Updatable, Insertable } from "../../src";
import type { Table } from "../../src";

interface User {
  id: number;
  email: string;
  status: "active" | "inactive";
  last_login: Date | null;
}

type UserModel = Model<User, "id">;

// Insert type marks auto keys optional
const insert1: UserModel["Insert"] = {
  email: "a@example.com",
  status: "active",
  last_login: null,
};

// Update type is partial
const update1: Updatable<User> = { status: "inactive" };

// Insertable type helper works directly
const insert2: Insertable<User, "id"> = {
  email: "b@example.com",
  status: "active",
  last_login: null,
};

// @ts-expect-error missing required fields
const badInsert: UserModel["Insert"] = { status: "active" };
void badInsert;

// Table with insert type should accept insert payloads
declare const table: Table<User, ["*"], UserModel["Insert"]>;
const _created = table.create(insert1);
void _created;
