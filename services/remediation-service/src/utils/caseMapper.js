/**
 * Converts a raw pg row's snake_case keys to camelCase, so API responses are
 * consistent with the Java services' Jackson-serialized camelCase JSON.
 * Internal DB access (node-postgres) stays snake_case, matching actual
 * column names - only the boundary where a row becomes an HTTP response
 * gets remapped. Shallow only: nested JSONB objects (e.g. `playbook`,
 * `remediationRecommendations`) already use camelCase because the
 * application code that builds and stores them uses camelCase - only the
 * row's own top-level columns came from raw SQL and need converting.
 */
function toCamelCase(row) {
  if (row === null || row === undefined) return row;
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

function toCamelCaseList(rows) {
  return rows.map(toCamelCase);
}

module.exports = { toCamelCase, toCamelCaseList };
