export const Errors = {
  TABLE: {
    INVALID_NAME: "Invalid table name",
  },
  INSERT: {
    INVALID_DATA: "Invalid data to insert",
    NO_COLUMNS: "No columns specified",
  },
  UPDATE: {
    INVALID_DATA: "Invalid data to update",
    NO_CONDITIONS: "WHERE clause required",
    NO_COLUMNS: "No columns specified",
  },
  DELETE: {
    NO_CONDITIONS: "WHERE clause required",
  },
  SELECT: {
    INVALID_TAKE: "Take must be > 0",
    INVALID_SKIP: "Skip must be ≥ 0",
    INVALID_COLUMNS: (cols: string) => `Invalid columns: ${cols}`,
  },
  WHERE: {
    INVALID_IN: (field: string) => `Invalid IN values: ${field}`,
    INVALID_LIKE: (field: string) => `LIKE/ILIKE requires string: ${field}`,
    INVALID_COMPARISON: (field: string, op: string) =>
      `Invalid value for ${op}: ${field}`,
    INVALID_SORT: "Sort must be ASC/DESC",
    UNSUPPORTED_OPERATOR: (field: string, op: string) => `Unsupported operator ${op}: ${field}`,
  },
} as const;

export class TableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TableError";
  }
}

export class QueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueryError";
  }
}