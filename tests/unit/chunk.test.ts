import { chunkRecords } from "../../src/utils/chunk";

describe("chunkRecords", () => {
  test("keeps small batches in one chunk", () => {
    const records = Array.from({ length: 10 }, (_, id) => ({ id }));
    expect(chunkRecords(records, 2)).toEqual([records]);
    expect(chunkRecords([], 2)).toEqual([]);
  });

  test("splits rows above the parameter limit", () => {
    const records = Array.from({ length: 33_000 }, (_, id) => ({ id }));
    const chunks = chunkRecords(records, 2);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(32_766);
    expect(chunks[1]).toHaveLength(234);
    expect(chunks.flat()).toHaveLength(33_000);
  });

  test("uses the column count to choose the batch size", () => {
    const records = Array.from({ length: 2_000 }, (_, id) => ({ id }));
    const chunks = chunkRecords(records, 100);

    expect(chunks.length).toBe(4);
    expect(chunks[0]?.length).toBe(655);
  });
});
