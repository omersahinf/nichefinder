export function normalizeKeyword(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function slugifyNiche(value: string): string {
  return (
    normalizeKeyword(value)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "niche"
  );
}

export function keywordFromSlug(slug: string): string {
  return slug
    .replace(/-/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
