export const decodeTokenRef = (value?: string | null) => {
  const raw = (value ?? "").trim();
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

export const normalizeTokenRef = (value?: string | null) =>
  decodeTokenRef(value).trim().toLowerCase();

export const isIbcDenom = (value?: string | null) =>
  normalizeTokenRef(value).startsWith("ibc/");

export const tokenRouteRef = (
  denom?: string | null,
  symbol?: string | null,
  fallback?: string | null
) => {
  const cleanDenom = decodeTokenRef(denom).trim();
  const cleanSymbol = (symbol ?? "").trim();
  const cleanFallback = decodeTokenRef(fallback).trim();
  if (cleanDenom && isIbcDenom(cleanDenom)) {
    return cleanSymbol || cleanFallback || cleanDenom;
  }
  if (cleanDenom) return cleanDenom;
  return cleanSymbol || cleanFallback || "";
};

export const tokenFetchRef = (
  denom?: string | null,
  fallback?: string | number | null
) => {
  const cleanDenom = decodeTokenRef(denom).trim();
  if (cleanDenom) return cleanDenom;
  return fallback == null ? "" : String(fallback).trim();
};

export const tokenApiRef = (value?: string | number | null) => {
  const clean = decodeTokenRef(value == null ? "" : String(value)).trim();
  if (!clean) return "";
  if (isIbcDenom(clean)) return clean;
  const cachedDenom = resolveCachedTokenRouteDenom(clean);
  if (isIbcDenom(cachedDenom)) return cachedDenom;

  const lastPart = clean.split(".").pop()?.trim().toLowerCase();
  return lastPart === "zig" || lastPart === "uzig" ? "uzig" : clean;
};

const ROUTE_DENOM_CACHE_KEY = "dt:token-route-denoms";

const routeCacheKey = (routeRef?: string | null) => normalizeTokenRef(routeRef);

const readRouteDenomCache = (): Record<string, string> => {
  if (typeof window === "undefined") return {};
  try {
    const raw =
      sessionStorage.getItem(ROUTE_DENOM_CACHE_KEY) ||
      localStorage.getItem(ROUTE_DENOM_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeRouteDenomCache = (cache: Record<string, string>) => {
  if (typeof window === "undefined") return;
  try {
    const raw = JSON.stringify(cache);
    sessionStorage.setItem(ROUTE_DENOM_CACHE_KEY, raw);
    localStorage.setItem(ROUTE_DENOM_CACHE_KEY, raw);
  } catch {
    // ignore storage failures
  }
};

export const storeTokenRouteDenom = (
  routeRef?: string | null,
  denom?: string | null
) => {
  const key = routeCacheKey(routeRef);
  const cleanDenom = decodeTokenRef(denom).trim();
  if (!key || !isIbcDenom(cleanDenom)) return;
  const cache = readRouteDenomCache();
  cache[key] = cleanDenom;
  writeRouteDenomCache(cache);
};

export const storeTokenRoute = (
  denom?: string | null,
  symbol?: string | null,
  fallback?: string | null
) => {
  const routeRef = tokenRouteRef(denom, symbol, fallback);
  storeTokenRouteDenom(routeRef, denom);
  return routeRef;
};

export const resolveCachedTokenRouteDenom = (routeRef?: string | null) => {
  const key = routeCacheKey(routeRef);
  if (!key) return "";
  const cached = readRouteDenomCache()[key];
  if (isIbcDenom(cached)) return cached;
  if (typeof window === "undefined") return "";
  try {
    const recentRaw = localStorage.getItem("dt:recent-searches");
    const recent = recentRaw ? JSON.parse(recentRaw) : [];
    if (Array.isArray(recent)) {
      const match = recent.find((item: any) => {
        const itemRoute = tokenRouteRef(item?.denom, item?.symbol, item?.id);
        return routeCacheKey(itemRoute) === key && isIbcDenom(item?.denom);
      });
      if (match?.denom) {
        storeTokenRouteDenom(routeRef, match.denom);
        return match.denom;
      }
    }
  } catch {
    // ignore storage parse failures
  }
  return "";
};
