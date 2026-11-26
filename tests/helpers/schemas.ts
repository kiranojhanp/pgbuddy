import { z } from "zod";

/** Shared users table used by the integration tests. */
export const UserSchema = z.object({
  id: z.number().int().optional(),
  email: z.string(),
  status: z.enum(["active", "inactive"]),
  last_login: z.date().nullable().optional(),
});
