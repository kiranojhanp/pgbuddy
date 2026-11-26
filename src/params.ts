const PARAM = Symbol("pgbuddy.param");

/** Named placeholder for a parameterized prepared query. */
export class SqlParam {
  readonly [PARAM] = true;

  constructor(readonly name: string) {}
}

export function isSqlParam(value: unknown): value is SqlParam {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { [PARAM]?: unknown })[PARAM] === true &&
    typeof (value as { name?: unknown }).name === "string"
  );
}
