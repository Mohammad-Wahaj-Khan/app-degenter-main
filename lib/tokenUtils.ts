const NEW_TOKEN_TAG_LIFESPAN_MS = 3 * 24 * 60 * 60 * 1000; // last 3 days tokens
const parseCreationTimestamp = (
  value: number | string | undefined | null
): number | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
};

export const isTokenNew = (
  creationTime: number | string | undefined | null
): boolean => {
  const timestamp = parseCreationTimestamp(creationTime);
  if (timestamp === null) {
    return false;
  }

  const ageMs = Date.now() - timestamp;
  return ageMs >= 0 && ageMs <= NEW_TOKEN_TAG_LIFESPAN_MS;
};
