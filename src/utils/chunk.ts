/**
 * Split records so a multi-row INSERT stays under PostgreSQL's parameter
 * limit. postgres.js throws once a statement reaches 65,534 parameters.
 */
export function chunkRecords<T>(
  records: readonly T[],
  columnCount: number,
  maxParameters = 65_533
): T[][] {
  if (records.length === 0 || columnCount <= 0) return [];

  const rowsPerChunk = Math.max(1, Math.floor(maxParameters / columnCount));
  if (records.length <= rowsPerChunk) {
    return [records.slice()];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < records.length; index += rowsPerChunk) {
    chunks.push(records.slice(index, index + rowsPerChunk));
  }
  return chunks;
}
