/** 1 to 40 characters after trimming (matches the database check). Returns the cleaned name, or null when invalid. */
export function cleanDisplayName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim();
  return name.length >= 1 && name.length <= 40 ? name : null;
}
