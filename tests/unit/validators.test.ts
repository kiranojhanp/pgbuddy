import { isValidWhereConditions } from "../../src/utils/validators";

describe("validators", () => {
  test("isValidWhereConditions validates advanced conditions", () => {
    expect(
      isValidWhereConditions([
        { field: "status", operator: "=", value: "active" },
      ])
    ).toBe(true);

    expect(
      isValidWhereConditions([
        { field: "status", operator: "IS NULL" },
      ])
    ).toBe(true);

    expect(
      isValidWhereConditions([
        { field: "status", operator: "IS NULL", value: "oops" },
      ])
    ).toBe(false);

    expect(
      isValidWhereConditions([
        { field: "", operator: "=", value: "active" },
      ])
    ).toBe(false);

    expect(
      isValidWhereConditions([
        { field: "status", operator: "", value: "active" },
      ])
    ).toBe(false);

    expect(
      isValidWhereConditions([
        { field: "status", operator: "=", value: undefined },
      ])
    ).toBe(false);
  });
});
