import type { Trade } from "@/lib/api";

type RawRecord = Record<string, any>;

export const extractArrayPayload = (payload: any): any[] => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.tokens)) return payload.tokens;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.trades)) return payload.trades;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
};

export const toFiniteNumber = (value: unknown, fallback = 0): number => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
      ? Number(value)
      : Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const normalizeDashboardToken = (token: RawRecord) => ({
  id: token.tokenId?.toString() || token.id?.toString() || token.denom || "",
  symbol: token.symbol || "",
  name: token.name || "",
  current_price: toFiniteNumber(
    token.priceUsd ?? token.priceNative ?? token.current_price
  ),
  price_change_percentage_24h: toFiniteNumber(token.change24hPct),
  market_cap: toFiniteNumber(token.mcapUsd ?? token.mcapNative),
  total_volume: toFiniteNumber(token.volUsd ?? token.volNative),
  fdvUsd: toFiniteNumber(token.fdvUsd),
  image: token.imageUri || token.image || "",
  tx: toFiniteNumber(token.tx),
  denom: token.denom || "",
  holders: token.holders ?? 0,
  creationTime: token.createdAt || 0,
  liquidity: toFiniteNumber(
    token.liquidity ?? token.liquidityUsd ?? token.volUsd ?? token.volNative
  ),
});

const inferTradeClass = (trade: RawRecord): Trade["class"] => {
  const usdValue = toFiniteNumber(trade.valueUsd);
  const nativeValue = toFiniteNumber(trade.valueNative);
  const size = usdValue > 0 ? usdValue : nativeValue;

  if (size < 1000) return "shrimp";
  if (size < 10000) return "shark";
  return "whale";
};

export const normalizeTrade = (trade: RawRecord): Trade => ({
  time:
    typeof trade.time === "string" && trade.time
      ? trade.time
      : new Date().toISOString(),
  txHash: trade.txHash || trade.tx_hash || "",
  pairContract: trade.pairContract || trade.pair_contract || "",
  signer: trade.signer || "",
  direction: trade.direction === "sell" ? "sell" : "buy",
  offerDenom: trade.offerDenom || "",
  offerAmountBase: String(trade.offerAmountBase ?? ""),
  offerAmount: toFiniteNumber(trade.offerAmount),
  askDenom: trade.askDenom || "",
  askAmountBase: String(trade.askAmountBase ?? ""),
  askAmount: toFiniteNumber(trade.askAmount),
  returnAmountBase: String(trade.returnAmountBase ?? ""),
  returnAmount: toFiniteNumber(trade.returnAmount),
  priceNative: toFiniteNumber(trade.priceNative),
  priceUsd: toFiniteNumber(trade.priceUsd),
  valueNative: toFiniteNumber(trade.valueNative),
  valueUsd: toFiniteNumber(trade.valueUsd),
  class:
    trade.class === "whale" || trade.class === "shark" || trade.class === "shrimp"
      ? trade.class
      : inferTradeClass(trade),
});
