export function normalizeSafeNextPath(
  value: string | null | undefined,
  fallback = "/dashboard"
) {
  if (!value) {
    return fallback;
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  return value;
}
