/**
 * Tag predicate for the packed `transactions.tags` text column (HJ-031).
 *
 * Decision: keep the packed column. Do not add `transaction_tags`.
 * `packTags` stores a JSON array string (`["Trip","kids"]`), at most 8 tags,
 * already trimmed and case-insensitively deduped. The register compares one
 * selected tag to those strings, ignoring case, and does not trim the query.
 * Repeatable tags AND that test. `TransactionQuery.tags` is the plain list.
 *
 * This fragment is residual. Case-insensitive membership is not btree-indexable,
 * and jsonb `@>` would be case-sensitive, so it would not match the register.
 * The keyset index is the access path. HJ-034's SQL `TransactionStore` is the
 * only caller; handlers must not paste this SQL.
 *
 * Element normalization (trim, collapse whitespace, 32 characters) mirrors
 * `parseTags` for one array element. The 8-tag cap is applied on write. A row
 * not written by `packTags` can disagree past the eighth distinct tag.
 */

const COLUMN_NAME = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;
const NORMALIZED_ELEMENT = "left(regexp_replace(btrim(elem.value), '\\s+', ' ', 'g'), 32)";

function tagExistsSql(column: string, param: number): string {
  return [
    "exists (",
    "  select 1",
    "  from jsonb_array_elements_text(",
    "    case",
    `      when jsonb_typeof(${column}::jsonb) = 'array' then ${column}::jsonb`,
    "      else '[]'::jsonb",
    "    end",
    "  ) as elem(value)",
    `  where ${NORMALIZED_ELEMENT} <> ''`,
    `    and lower(${NORMALIZED_ELEMENT}) = lower($${param})`,
    ")",
  ].join("\n");
}

/** `tags` is `TransactionQuery.tags` (plain strings), not the packed column. */
export function packedTagsSql(
  tags: readonly string[],
  options?: { column?: string; paramStart?: number },
): { sql: string; params: string[] } {
  const column = options?.column ?? "tags";
  if (!COLUMN_NAME.test(column)) {
    throw new Error("packedTagsSql column must be a plain identifier");
  }
  const start = options?.paramStart ?? 1;
  if (!Number.isInteger(start) || start < 1) {
    throw new Error("packedTagsSql paramStart must be a positive integer");
  }
  const seen = new Set<string>();
  const params: string[] = [];
  for (const tag of tags) {
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    params.push(tag);
  }
  if (!params.length) return { sql: "true", params: [] };
  const sql = params.map((_, i) => tagExistsSql(column, start + i)).join("\n and ");
  return { sql, params };
}
