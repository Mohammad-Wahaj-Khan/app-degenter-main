"use client";

export type PriceDirection = "up" | "down" | "same" | "neutral";

const ACTIVE_TOKEN_PRICE_CACHE_KEY = "degenter:active-token-price";

type ActiveTokenPriceCache = {
  tokenKey: string;
  price: number;
  direction?: PriceDirection;
};

const readCache = (): ActiveTokenPriceCache | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      window.sessionStorage.getItem(ACTIVE_TOKEN_PRICE_CACHE_KEY) ||
      window.localStorage.getItem(ACTIVE_TOKEN_PRICE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveTokenPriceCache>;
    if (
      typeof parsed?.tokenKey !== "string" ||
      !Number.isFinite(Number(parsed?.price))
    ) {
      return null;
    }
    return {
      tokenKey: parsed.tokenKey,
      price: Number(parsed.price),
      direction:
        parsed.direction === "up" || parsed.direction === "down"
          ? parsed.direction
          : "neutral",
    };
  } catch {
    return null;
  }
};

const writeCache = (payload: ActiveTokenPriceCache) => {
  if (typeof window === "undefined") return;
  const raw = JSON.stringify(payload);
  try {
    window.sessionStorage.setItem(ACTIVE_TOKEN_PRICE_CACHE_KEY, raw);
    window.localStorage.setItem(ACTIVE_TOKEN_PRICE_CACHE_KEY, raw);
  } catch {
    // Ignore storage write errors and keep metadata updates functional.
  }
};

const getPriceDirection = (
  tokenKey: string,
  currentPrice: number
): PriceDirection => {
  const cached = readCache();
  if (!cached || cached.tokenKey !== tokenKey) {
    writeCache({ tokenKey, price: currentPrice, direction: "neutral" });
    return "neutral";
  }

  let direction: PriceDirection = cached.direction || "neutral";
  if (currentPrice > cached.price) direction = "up";
  else if (currentPrice < cached.price) direction = "down";

  writeCache({ tokenKey, price: currentPrice, direction });
  return direction;
};

export const formatTokenPriceLabel = (price: number) => {
  if (!Number.isFinite(price) || price <= 0) return "0.00";
  if (price >= 1) {
    return price.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return price.toPrecision(4);
};

const getDirectionArrow = (direction: PriceDirection) => {
  if (direction === "up") return "↑";
  if (direction === "down") return "↓";
  return "";
};

const ensureMeta = (
  key: string,
  attr: "name" | "property",
  content: string
) => {
  if (typeof document === "undefined") return;
  let tag = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
};

export const applyTokenPageMetadata = ({
  tokenKey,
  symbol,
  price,
  appName = "Degenter",
}: {
  tokenKey: string;
  symbol: string;
  price: number;
  appName?: string;
}) => {
  if (typeof document === "undefined" || !tokenKey || !symbol) return;

  const safePrice = Number.isFinite(price) ? price : 0;
  const priceLabel = formatTokenPriceLabel(safePrice);
  const direction = getPriceDirection(tokenKey, safePrice);
  const arrow = getDirectionArrow(direction);
  const title = arrow
    ? `${symbol} ${arrow} $${priceLabel} | ${appName}`
    : `${symbol} $${priceLabel} | ${appName}`;
  const description = `Live ${symbol} stats — currently $${priceLabel}. Track trades, holders, security, swaps, and markets on ${appName}.`;

  document.title = title;
  ensureMeta("description", "name", description);
  ensureMeta("og:title", "property", title);
  ensureMeta("og:description", "property", description);
  ensureMeta("twitter:title", "name", title);
  ensureMeta("twitter:description", "name", description);
};
