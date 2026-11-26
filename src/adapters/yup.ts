import type { ValidatorAdapter } from "../adapter";

type YupObject = {
  fields: Record<string, unknown>;
  validateSync: (value: unknown, options?: object) => unknown;
  partial: () => YupObject;
};

/**
 * Validator adapter for Yup object schemas.
 * Import from `pgbuddy/adapters/yup`.
 */
export const yupValidator: ValidatorAdapter = {
  fields: <S>(schema: S): readonly string[] => Object.keys((schema as unknown as YupObject).fields),
  parse: <S>(schema: S, value: unknown): unknown =>
    (schema as unknown as YupObject).validateSync(value, { abortEarly: false }),
  parsePartial: <S>(schema: S, value: unknown): unknown =>
    (schema as unknown as YupObject).partial().validateSync(value, { abortEarly: false }),
};
