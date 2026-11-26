import type { Row, Sql } from "postgres";
import { Errors, QueryError } from "./errors";
import { rawPredicate, type WhereInput } from "./predicates";
import type { SortSpec, SqlFragment } from "./types";
import { buildWhereInputs, createSortFragment } from "./utils";
import type { ZodRelationConfig } from "./zod-table";

const RELATION_ROW_NUMBER = "__pgbuddy_relation_row_number";
const RELATION_COUNT = "__pgbuddy_relation_count";
const RELATION_SUBQUERY = "__pgbuddy_relation";

export type NormalizedThrough = {
  table: string;
  parentKeys: readonly string[];
  relatedKeys: readonly string[];
  targetKeys: readonly string[];
};

export type NormalizedRelation = {
  config: ZodRelationConfig;
  localKeys: readonly string[];
  foreignKeys: readonly string[];
  through?: NormalizedThrough;
  children: Map<string, NormalizedRelation>;
};

export type RelationRefinement = {
  whereInputs?: readonly WhereInput<Row>[];
  orderBy?: readonly SortSpec<Row>[];
  take?: number;
  select?: readonly string[];
};

export type IncludeSpec = {
  name: string;
  refinement?: RelationRefinement;
};

export type CountSpec = {
  name: string;
  refinement?: RelationRefinement;
};

export type RelationAggregateSpec = {
  count?: boolean;
  sum?: readonly string[];
  avg?: readonly string[];
  min?: readonly string[];
  max?: readonly string[];
};

export type AggregateSpec = {
  name: string;
  aggregate: RelationAggregateSpec;
  refinement?: RelationRefinement;
};

function serializeKey(values: readonly unknown[]): string | null {
  const parts: string[] = [];

  for (const value of values) {
    if (value === null || value === undefined) return null;

    if (value instanceof Date) {
      parts.push(`date:${value.getTime()}`);
    } else if (typeof value === "object") {
      parts.push(`json:${JSON.stringify(value)}`);
    } else {
      parts.push(`${typeof value}:${String(value)}`);
    }
  }

  return parts.join("\u0000");
}

function buildKeyFilter(
  sql: Sql<Record<string, unknown>>,
  foreignKeys: readonly string[],
  keys: readonly (readonly unknown[])[]
): SqlFragment {
  if (foreignKeys.length === 1) {
    const column = foreignKeys[0];
    if (!column) throw new QueryError("Invalid relation configuration");
    return sql`${sql(column)} = ANY(${keys.map((key) => key[0])})`;
  }

  let tuples = sql``;
  keys.forEach((key, index) => {
    let tuple = sql``;
    key.forEach((value, valueIndex) => {
      tuple = valueIndex === 0 ? sql`${value}` : sql`${tuple}, ${value}`;
    });
    const fragment = sql`(${tuple})`;
    tuples = index === 0 ? fragment : sql`${tuples}, ${fragment}`;
  });

  return sql`(${sql(foreignKeys as string[])}) IN (${tuples})`;
}

function setRowValue(row: Record<string, unknown>, key: string, value: unknown): void {
  // defineProperty avoids the `__proto__` setter for hostile relation names.
  Object.defineProperty(row, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function pickFields(
  row: Record<string, unknown>,
  fields: readonly string[]
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const field of fields) {
    setRowValue(picked, field, row[field]);
  }
  return picked;
}

function compareSortValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : 1;
  return String(a) < String(b) ? -1 : 1;
}

function sortRelationRows(
  rows: Array<Record<string, unknown>>,
  orderBy: readonly SortSpec<Row>[] | undefined
): Array<Record<string, unknown>> {
  if (!orderBy?.length) return rows;

  return rows.sort((left, right) => {
    for (const spec of orderBy) {
      const a = left[spec.column as string];
      const b = right[spec.column as string];

      if (a === null || a === undefined || b === null || b === undefined) {
        if (a === b) continue;
        const nulls = spec.nulls ?? (spec.direction === "ASC" ? "last" : "first");
        const aNull = a === null || a === undefined;
        return aNull === (nulls === "first") ? -1 : 1;
      }

      const compared = compareSortValues(a, b);
      if (compared !== 0) return spec.direction === "ASC" ? compared : -compared;
    }

    return 0;
  });
}

function relationSchemaColumns(config: ZodRelationConfig): string[] {
  return Object.keys(config.schema.shape);
}

function resolveRelationFields(
  relation: NormalizedRelation,
  refinement: RelationRefinement | undefined
): { requested: string[]; queryFields: string[] } {
  const requested = refinement?.select
    ? [...refinement.select]
    : relationSchemaColumns(relation.config);
  const queryFields = [...requested];

  for (const foreignKey of relation.foreignKeys) {
    if (!queryFields.includes(foreignKey)) queryFields.push(foreignKey);
  }

  for (const child of relation.children.values()) {
    for (const key of child.localKeys) {
      if (!queryFields.includes(key)) queryFields.push(key);
    }
  }

  return { requested, queryFields };
}

function emptyAggregate(name: string, spec: RelationAggregateSpec): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  if (spec.count) values[`${name}_count`] = 0;
  for (const kind of ["sum", "avg", "min", "max"] as const) {
    for (const column of spec[kind] ?? []) {
      values[`${name}_${kind}_${column}`] = null;
    }
  }
  return values;
}

function aggregateRows(
  children: Array<Record<string, unknown>>,
  spec: AggregateSpec
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  if (spec.aggregate.count) {
    values[`${spec.name}_count`] = children.length;
  }

  for (const kind of ["sum", "avg", "min", "max"] as const) {
    for (const column of spec.aggregate[kind] ?? []) {
      const present = children
        .map((child) => child[column])
        .filter((value) => value !== null && value !== undefined);

      if (present.length === 0) {
        values[`${spec.name}_${kind}_${column}`] = null;
        continue;
      }

      if (kind === "sum" || kind === "avg") {
        const total = present.reduce<number>((sum, value) => sum + Number(value), 0);
        values[`${spec.name}_${kind}_${column}`] = kind === "avg" ? total / present.length : total;
      } else {
        const sorted = [...present].sort((left, right) =>
          typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left) < String(right)
              ? -1
              : 1
        );
        values[`${spec.name}_${kind}_${column}`] =
          kind === "min" ? sorted[0] : sorted[sorted.length - 1];
      }
    }
  }

  return values;
}

/**
 * Batched relation loader. It is shared by all relation paths (direct,
 * through, and nested) so relation behavior stays consistent.
 */
export class RelationLoader {
  private readonly sql: Sql<Record<string, unknown>>;

  constructor(sql: Sql<Record<string, unknown>>) {
    this.sql = sql;
  }

  async load(
    rows: Array<Record<string, unknown>>,
    relations: Map<string, NormalizedRelation>,
    includes: readonly IncludeSpec[],
    counts: readonly CountSpec[] = []
  ): Promise<void> {
    if (rows.length === 0) return;

    for (const include of includes) {
      const relation = relations.get(include.name);
      if (!relation) {
        throw new QueryError(Errors.SELECT.INVALID_RELATION(include.name), {
          code: "INVALID_RELATION",
        });
      }

      const requested = resolveRelationFields(relation, include.refinement);
      const parentKeys = this.collectParentKeys(rows, relation, include.name);
      const uniqueKeys = new Map<string, readonly unknown[]>();

      for (const key of parentKeys) {
        if (key.serialized && !uniqueKeys.has(key.serialized)) {
          uniqueKeys.set(key.serialized, key.values);
        }
      }

      if (uniqueKeys.size === 0) {
        for (const row of rows) {
          setRowValue(row, include.name, relation.config.relation === "one" ? null : []);
        }
        continue;
      }

      const buckets = new Map<string, Array<Record<string, unknown>>>();

      if (relation.through) {
        const entries = await this.fetchThroughRelated(
          relation,
          include.refinement,
          [...uniqueKeys.values()],
          requested.queryFields
        );

        for (const entry of entries) {
          const bucket = buckets.get(entry.parentSerialized);
          if (bucket) {
            bucket.push(entry.child);
          } else {
            buckets.set(entry.parentSerialized, [entry.child]);
          }
        }
      } else {
        const children = await this.fetchRelated(
          relation,
          include.refinement,
          [...uniqueKeys.values()],
          requested.queryFields
        );

        for (const child of children) {
          const serialized = serializeKey(relation.foreignKeys.map((key) => child[key]));
          if (!serialized) continue;

          const bucket = buckets.get(serialized);
          if (bucket) {
            bucket.push(child);
          } else {
            buckets.set(serialized, [child]);
          }
        }
      }

      if (relation.children.size > 0) {
        const children = [...new Set([...buckets.values()].flat())];
        const childIncludes: IncludeSpec[] = [...relation.children.keys()].map((name) => ({
          name,
        }));
        await this.load(children, relation.children, childIncludes, []);
      }

      const nestedKeys = [...relation.children.keys()];

      rows.forEach((row, index) => {
        const serialized = parentKeys[index]?.serialized ?? null;
        const bucket = serialized ? (buckets.get(serialized) ?? []) : [];
        const projected = bucket.map((child) =>
          pickFields(child, [...requested.requested, ...nestedKeys])
        );

        setRowValue(
          row,
          include.name,
          relation.config.relation === "one" ? (projected[0] ?? null) : projected
        );
      });
    }

    for (const spec of counts) {
      const relation = relations.get(spec.name);
      if (!relation) {
        throw new QueryError(Errors.SELECT.INVALID_RELATION(spec.name), {
          code: "INVALID_RELATION",
        });
      }
      const parentKeys = this.collectParentKeys(rows, relation, spec.name);
      const uniqueKeys = new Map<string, readonly unknown[]>();

      for (const key of parentKeys) {
        if (key.serialized && !uniqueKeys.has(key.serialized)) {
          uniqueKeys.set(key.serialized, key.values);
        }
      }

      const countsByKey =
        uniqueKeys.size === 0
          ? new Map<string, number>()
          : await this.fetchCounts(
              relation,
              [...uniqueKeys.values()],
              spec.refinement?.whereInputs
            );

      rows.forEach((row, index) => {
        const serialized = parentKeys[index]?.serialized ?? null;
        setRowValue(row, `${spec.name}_count`, serialized ? (countsByKey.get(serialized) ?? 0) : 0);
      });
    }
  }

  async aggregate(
    rows: Array<Record<string, unknown>>,
    relations: Map<string, NormalizedRelation>,
    specs: readonly AggregateSpec[]
  ): Promise<void> {
    for (const spec of specs) {
      const relation = relations.get(spec.name);
      if (!relation) {
        throw new QueryError(Errors.SELECT.INVALID_RELATION(spec.name), {
          code: "INVALID_RELATION",
        });
      }

      const parentKeys = this.collectParentKeys(rows, relation, spec.name);
      const uniqueKeys = new Map<string, readonly unknown[]>();
      for (const key of parentKeys) {
        if (key.serialized && !uniqueKeys.has(key.serialized)) {
          uniqueKeys.set(key.serialized, key.values);
        }
      }

      const values =
        uniqueKeys.size === 0
          ? new Map<string, Record<string, unknown>>()
          : await this.fetchAggregates(relation, spec, [...uniqueKeys.values()]);

      rows.forEach((row, index) => {
        const serialized = parentKeys[index]?.serialized ?? null;
        const aggregate = serialized ? values.get(serialized) : undefined;
        const resolved = aggregate ?? emptyAggregate(spec.name, spec.aggregate);
        for (const [field, value] of Object.entries(resolved)) {
          setRowValue(row, field, value);
        }
      });
    }
  }

  private collectParentKeys(
    rows: Array<Record<string, unknown>>,
    relation: NormalizedRelation,
    name: string
  ): Array<{ serialized: string | null; values: readonly unknown[] }> {
    return rows.map((row) => {
      const values = relation.localKeys.map((key) => row[key]);

      if (values.some((value) => value === undefined)) {
        throw new QueryError(Errors.SELECT.MISSING_RELATION_KEY(name));
      }
      if (values.some((value) => value === null)) {
        return { serialized: null, values: [] };
      }

      return { serialized: serializeKey(values), values };
    });
  }

  private async fetchThroughRelated(
    relation: NormalizedRelation,
    refinement: RelationRefinement | undefined,
    keys: readonly (readonly unknown[])[],
    queryFields: readonly string[]
  ): Promise<Array<{ parentSerialized: string; child: Record<string, unknown> }>> {
    const through = relation.through;
    if (!through) return [];

    const sql = this.sql;
    const parentFilter = buildKeyFilter(sql, through.parentKeys, keys);
    const junctionFields = [...through.parentKeys, ...through.relatedKeys];

    const junctionRows = await sql<Record<string, unknown>[]>`
      SELECT ${sql(junctionFields)}
      FROM ${sql(through.table)}
      ${buildWhereInputs(sql, [rawPredicate<Row>(parentFilter)])}
    `;

    if (junctionRows.length === 0) return [];

    const relatedKeys = new Map<string, readonly unknown[]>();
    for (const row of junctionRows) {
      const values = through.relatedKeys.map((key) => row[key]);
      const serialized = serializeKey(values);
      if (serialized && !relatedKeys.has(serialized)) {
        relatedKeys.set(serialized, values);
      }
    }

    if (relatedKeys.size === 0) return [];

    const fields = [...new Set([...queryFields, ...through.targetKeys])];
    const relatedRows = await sql<Record<string, unknown>[]>`
      SELECT ${sql(fields)}
      FROM ${sql(relation.config.table)}
      ${buildWhereInputs(sql, [
        rawPredicate<Row>(buildKeyFilter(sql, through.targetKeys, [...relatedKeys.values()])),
        ...((refinement?.whereInputs ?? []) as readonly WhereInput<Row>[]),
      ])}
    `;

    const children = new Map<string, Record<string, unknown>>();
    for (const row of relatedRows) {
      const serialized = serializeKey(through.targetKeys.map((key) => row[key]));
      if (serialized) children.set(serialized, row);
    }

    const perParent = new Map<string, Array<Record<string, unknown>>>();
    for (const row of junctionRows) {
      const parentSerialized = serializeKey(through.parentKeys.map((key) => row[key]));
      const relatedSerialized = serializeKey(through.relatedKeys.map((key) => row[key]));
      if (!parentSerialized || !relatedSerialized) continue;

      const child = children.get(relatedSerialized);
      if (!child) continue;

      const bucket = perParent.get(parentSerialized);
      if (bucket) {
        bucket.push(child);
      } else {
        perParent.set(parentSerialized, [child]);
      }
    }

    const entries: Array<{ parentSerialized: string; child: Record<string, unknown> }> = [];
    for (const [parentSerialized, bucket] of perParent) {
      const sorted = sortRelationRows(bucket, refinement?.orderBy);
      const limited = refinement?.take !== undefined ? sorted.slice(0, refinement.take) : sorted;
      for (const child of limited) entries.push({ parentSerialized, child });
    }

    return entries;
  }

  private async fetchRelated(
    relation: NormalizedRelation,
    refinement: RelationRefinement | undefined,
    keys: readonly (readonly unknown[])[],
    queryFields: readonly string[]
  ): Promise<Array<Record<string, unknown>>> {
    const sql = this.sql;
    const keyFilter = rawPredicate<Row>(buildKeyFilter(sql, relation.foreignKeys, keys));
    const inputs: WhereInput<Row>[] = [
      ...((refinement?.whereInputs ?? []) as readonly WhereInput<Row>[]),
      keyFilter,
    ];
    const where = buildWhereInputs(sql, inputs);
    const orderBy = refinement?.orderBy as SortSpec<Row>[] | undefined;
    const take = refinement?.take;

    if (take !== undefined) {
      return this.fetchRelatedLimited(relation, queryFields, where, orderBy, take);
    }

    return await sql<Record<string, unknown>[]>`
      SELECT ${sql(queryFields as string[])}
      FROM ${sql(relation.config.table)}
      ${where}
      ${createSortFragment(sql, orderBy)}
    `;
  }

  private async fetchRelatedLimited(
    relation: NormalizedRelation,
    queryFields: readonly string[],
    where: SqlFragment,
    orderBy: SortSpec<Row>[] | undefined,
    take: number
  ): Promise<Array<Record<string, unknown>>> {
    const sql = this.sql;

    if (queryFields.includes(RELATION_ROW_NUMBER)) {
      throw new QueryError(
        `Relation on ${relation.config.table} cannot select reserved column ${RELATION_ROW_NUMBER}`
      );
    }

    const partition = sql`PARTITION BY ${sql(relation.foreignKeys as string[])}`;
    const order = createSortFragment(sql, orderBy);
    const windowOrder = order ? sql` ${order}` : sql``;

    let foreignKeyOrder = sql``;
    relation.foreignKeys.forEach((key, index) => {
      const fragment = sql`${sql(key)} ASC`;
      foreignKeyOrder = index === 0 ? fragment : sql`${foreignKeyOrder}, ${fragment}`;
    });

    return await sql<Record<string, unknown>[]>`
      SELECT ${sql(queryFields as string[])}
      FROM (
        SELECT ${sql(queryFields as string[])},
          row_number() OVER (${partition}${windowOrder}) AS ${sql(RELATION_ROW_NUMBER)}
        FROM ${sql(relation.config.table)}
        ${where}
      ) AS ${sql(RELATION_SUBQUERY)}
      WHERE ${sql(RELATION_ROW_NUMBER)} <= ${take}
      ORDER BY ${foreignKeyOrder}, ${sql(RELATION_ROW_NUMBER)} ASC
    `;
  }

  private async fetchAggregates(
    relation: NormalizedRelation,
    spec: AggregateSpec,
    keys: readonly (readonly unknown[])[]
  ): Promise<Map<string, Record<string, unknown>>> {
    if (relation.through) {
      const queryFields = [
        ...new Set([
          ...(spec.aggregate.sum ?? []),
          ...(spec.aggregate.avg ?? []),
          ...(spec.aggregate.min ?? []),
          ...(spec.aggregate.max ?? []),
          ...relation.through.targetKeys,
        ]),
      ];
      const entries = await this.fetchThroughRelated(
        relation,
        { whereInputs: spec.refinement?.whereInputs },
        keys,
        queryFields
      );
      const perParent = new Map<string, Array<Record<string, unknown>>>();
      for (const entry of entries) {
        const bucket = perParent.get(entry.parentSerialized);
        if (bucket) bucket.push(entry.child);
        else perParent.set(entry.parentSerialized, [entry.child]);
      }

      const result = new Map<string, Record<string, unknown>>();
      for (const [parentSerialized, children] of perParent) {
        result.set(parentSerialized, aggregateRows(children, spec));
      }
      return result;
    }

    const sql = this.sql;
    const parts: SqlFragment[] = [];
    const valueColumns: Array<{ kind: "count" | "sum" | "avg" | "min" | "max"; column?: string }> =
      [];

    if (spec.aggregate.count) {
      parts.push(sql`COUNT(*)::int`);
      valueColumns.push({ kind: "count" });
    }
    for (const kind of ["sum", "avg", "min", "max"] as const) {
      for (const column of spec.aggregate[kind] ?? []) {
        const mapped = sql(column);
        const expression = sql`${sql.unsafe(kind.toUpperCase())}(${mapped})`;
        parts.push(expression);
        valueColumns.push({ kind, column });
      }
    }

    if (parts.length === 0) return new Map();

    const where = buildWhereInputs(sql, [
      ...((spec.refinement?.whereInputs ?? []) as readonly WhereInput<Row>[]),
      rawPredicate<Row>(buildKeyFilter(sql, relation.foreignKeys, keys)),
    ]);
    const selection = parts.reduce(
      (acc, part, index) => (index === 0 ? part : sql`${acc}, ${part}`),
      sql``
    );
    const query = sql`
      SELECT ${sql(relation.foreignKeys as string[])}, ${selection}
      FROM ${sql(relation.config.table)}
      ${where}
      GROUP BY ${sql(relation.foreignKeys as string[])}
    `;
    const resultRows = (await (
      query as unknown as { values(): Promise<unknown[][]> }
    ).values()) as unknown[][];
    const result = new Map<string, Record<string, unknown>>();

    for (const row of resultRows) {
      const serialized = serializeKey(relation.foreignKeys.map((_key, index) => row[index]));
      if (!serialized) continue;

      const values: Record<string, unknown> = {};
      let index = relation.foreignKeys.length;
      for (const entry of valueColumns) {
        const field =
          entry.kind === "count"
            ? `${spec.name}_count`
            : `${spec.name}_${entry.kind}_${entry.column}`;
        const value = row[index];
        values[field] =
          entry.kind === "min" || entry.kind === "max"
            ? (value ?? null)
            : value === null || value === undefined
              ? entry.kind === "count"
                ? 0
                : null
              : Number(value);
        index += 1;
      }
      result.set(serialized, values);
    }

    return result;
  }

  private async fetchCounts(
    relation: NormalizedRelation,
    keys: readonly (readonly unknown[])[],
    refinement?: readonly WhereInput<Row>[]
  ): Promise<Map<string, number>> {
    if (relation.through) {
      const entries = await this.fetchThroughRelated(
        relation,
        { whereInputs: refinement },
        keys,
        relation.through.targetKeys
      );
      const counts = new Map<string, number>();

      for (const entry of entries) {
        counts.set(entry.parentSerialized, (counts.get(entry.parentSerialized) ?? 0) + 1);
      }

      return counts;
    }

    const sql = this.sql;

    for (const foreignKey of relation.foreignKeys) {
      if (foreignKey === RELATION_COUNT) {
        throw new QueryError(
          `Relation on ${relation.config.table} cannot use reserved column ${RELATION_COUNT}`
        );
      }
    }

    const where = buildWhereInputs(sql, [
      ...(refinement ?? []),
      rawPredicate<Row>(buildKeyFilter(sql, relation.foreignKeys, keys)),
    ]);

    const rows = await sql<Record<string, unknown>[]>`
      SELECT ${sql(relation.foreignKeys as string[])}, COUNT(*) AS ${sql(RELATION_COUNT)}
      FROM ${sql(relation.config.table)}
      ${where}
      GROUP BY ${sql(relation.foreignKeys as string[])}
    `;

    const counts = new Map<string, number>();
    for (const row of rows) {
      const serialized = serializeKey(relation.foreignKeys.map((key) => row[key]));
      if (serialized) {
        counts.set(serialized, Number(row[RELATION_COUNT] ?? 0));
      }
    }

    return counts;
  }
}
