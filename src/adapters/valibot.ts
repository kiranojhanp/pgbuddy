import { partial } from "valibot";
import type { ValidatorAdapter } from "../adapter";

type ValibotResult<O> = { value: O } | { issues: ArrayLike<unknown> };
type ValibotSchema<O = unknown> = {
  readonly entries?: Record<string, unknown>;
  readonly "~standard": {
    readonly validate: (value: unknown) => ValibotResult<O> | Promise<ValibotResult<O>>;
  };
};

function parse<O>(schema: ValibotSchema<O>, value: unknown): O {
  const result = schema["~standard"].validate(value);
  if (result instanceof Promise) {
    throw new Error(
      "Valibot async schemas are not supported. Use synchronous schemas without async actions."
    );
  }
  if ("issues" in result) {
    const message = Array.from(result.issues as ArrayLike<{ message?: string }>)
      .map((issue) => issue?.message ?? "Unknown issue")
      .join("; ");
    throw new Error(`Valibot validation failed: ${message}`);
  }
  return result.value;
}

/**
 * Validator adapter for Valibot object schemas.
 * Import from `pgbuddy/adapters/valibot`.
 */
export const valibotValidator: ValidatorAdapter = {
  fields: <S>(schema: S): readonly string[] => Object.keys((schema as ValibotSchema).entries ?? {}),
  parse: <S>(schema: S, value: unknown): unknown => parse(schema as ValibotSchema, value),
  parsePartial: <S>(schema: S, value: unknown): unknown =>
    parse(partial(schema as never) as unknown as ValibotSchema, value),
};
