import type { PendingQuery, Row } from "postgres";

export interface DeferredQuery<T> extends Promise<T> {
  readonly __pgbuddyDeferred: true;
  /** Build/return the postgres.js pending query without awaiting it. */
  // biome-ignore lint/suspicious/noExplicitAny: postgres.js PendingQuery is invariant per result shape
  pending(): PendingQuery<any>;
  /** Turn raw batch rows into the terminal result. */
  resolve(rows: unknown): T | Promise<T>;
}

export type DeferredResult<Q> = Q extends DeferredQuery<infer T> ? Awaited<T> : never;

export function isDeferredQuery(value: unknown): value is DeferredQuery<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __pgbuddyDeferred?: unknown }).__pgbuddyDeferred === true &&
    typeof (value as { pending?: unknown }).pending === "function" &&
    typeof (value as { resolve?: unknown }).resolve === "function"
  );
}

export function deferredQuery<T>(
  // biome-ignore lint/suspicious/noExplicitAny: postgres.js PendingQuery is invariant per result shape
  build: () => PendingQuery<any>,
  resolveRows: (rows: unknown) => T | Promise<T>
): DeferredQuery<T> {
  let consumed = false;
  let built = false;
  let pending: PendingQuery<Row[]> | undefined;

  const getPending = (): PendingQuery<Row[]> => {
    if (!built) {
      pending = build();
      built = true;
    }
    return pending as PendingQuery<Row[]>;
  };

  const promise = new Promise<T>((resolve, reject) => {
    queueMicrotask(() => {
      if (consumed) return;
      consumed = true;
      try {
        Promise.resolve(getPending())
          .then((rows) => resolveRows(rows))
          .then(resolve, reject);
      } catch (error) {
        reject(error);
      }
    });
  });

  return Object.assign(promise, {
    __pgbuddyDeferred: true as const,
    pending: () => {
      consumed = true;
      return getPending();
    },
    resolve: resolveRows,
  });
}
