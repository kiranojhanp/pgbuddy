import { Errors } from "../../src";
import {
  isValidData,
  isValidWhereConditions,
  validatePagination,
} from "../../src/utils/validators";

describe("validators", () => {
  test("isValidWhereConditions validates advanced conditions", () => {
    expect(isValidWhereConditions([{ field: "status", operator: "=", value: "active" }])).toBe(
      true
    );

    expect(isValidWhereConditions([{ field: "status", operator: "IS NULL" }])).toBe(true);

    expect(isValidWhereConditions([{ field: "status", operator: "IS NULL", value: "oops" }])).toBe(
      false
    );

    expect(isValidWhereConditions([{ field: "", operator: "=", value: "active" }])).toBe(false);

    expect(isValidWhereConditions([{ field: "status", operator: "", value: "active" }])).toBe(
      false
    );

    expect(isValidWhereConditions([{ field: "status", operator: "=", value: undefined }])).toBe(
      false
    );
  });

  test("isValidData rejects undefined values but allows null", () => {
    expect(isValidData({ name: "Ada" })).toBe(true);
    expect(isValidData({ name: null })).toBe(true);
    expect(isValidData({ name: undefined })).toBe(false);
    expect(isValidData({})).toBe(false);
  });

  test("validatePagination enforces maxTake", () => {
    expect(() => validatePagination(undefined, 10, 10)).not.toThrow();
    expect(() => validatePagination(undefined, 11, 10)).toThrow(Errors.SELECT.TAKE_EXCEEDS_MAX(10));
    expect(() => validatePagination(0, 10, 10)).not.toThrow();
  });
});
