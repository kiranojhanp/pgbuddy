import { Errors, QueryError, TableError } from "../../src";

describe("Errors helpers", () => {
  test("error message helpers format strings", () => {
    expect(Errors.SELECT.INVALID_COLUMNS("id")).toBe("Invalid columns: id");
    expect(Errors.WHERE.INVALID_IN("field")).toBe("Invalid IN values: field");
    expect(Errors.WHERE.INVALID_LIKE("field")).toBe("LIKE/ILIKE requires string: field");
    expect(Errors.WHERE.INVALID_COMPARISON("field", ">=")).toBe("Invalid value for >=: field");
    expect(Errors.WHERE.UNSUPPORTED_OPERATOR("field", "NOPE")).toBe(
      "Unsupported operator NOPE: field"
    );
  });

  test("error message helpers escape control characters in names", () => {
    expect(Errors.WHERE.INVALID_FIELD("bad\nWARN")).toBe("Invalid field: bad\\u000aWARN");
    expect(Errors.SELECT.INVALID_COLUMNS("a\u0000b")).toBe("Invalid columns: a\\u0000b");
    expect(Errors.INSERT.COLUMN_NOT_ALLOWED("x\r\ny")).toBe(
      "Column not allowed on insert: x\\u000d\\u000ay"
    );
  });

  test("error classes set names", () => {
    const tableError = new TableError("table error");
    const queryError = new QueryError("query error");

    expect(tableError.name).toBe("TableError");
    expect(queryError.name).toBe("QueryError");
  });
});
