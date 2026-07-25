export function normalizeTags(values) {
  const normalized = [];
  const seen = new Set();

  for (const value of values) {
    const tag = value.trim().toLowerCase();
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      normalized.push(tag);
    }
  }

  return normalized;
}
