// app/lib/api.ts
const DEFAULT_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const normalizeBaseUrl = (value?: string) => {
  if (!value) return DEFAULT_BASE_URL;
  const trimmed = value.trim();
  if (!trimmed || /undefined|null/i.test(trimmed)) return DEFAULT_BASE_URL;
  return trimmed.replace(/\/+$/, "");
};
const BASE_URL = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
export const API_BASE_URL = BASE_URL;
const resolveApiKey = () =>
  process.env.X_API_KEY ||
  process.env.NEXT_PUBLIC_X_API_KEY ||
  process.env.NEXT_PUBLIC_API_KEY ||
  process.env.NEXT_PUBLIC_DEGENTER_API_KEY ||
  process.env.DEGENTER_API_KEY ||
  process.env.API_KEY ||
  undefined;
export const API_KEY = resolveApiKey();
export const API_HEADERS: Record<string, string> = API_KEY
  ? { "x-api-key": API_KEY }
  : {};

/* ===== Types ===== */
export type Bucket = "30m" | "1h" | "4h" | "24h";
export type PriceSource = "best" | "first" | "all" | "pool";
export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
export type Unit = "native" | "usd";

export interface TokenSummary {
  [x: string]: any;
  tokenId: string;
  denom?: string;
  symbol?: string;
  name?: string;
  imageUri?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  priceInNative?: number;
  priceInUsd?: number;
  priceSource?: string;
  priceChange?: Record<string, number>;
  volume?: Record<string, number>;
  liquidity?: number;
  fdv?: number;
  mc?: number;
  circulatingSupply?: number;
  supply?: number;
  holder?: number | string;
  tradeCount?: { buy: number; sell: number; total: number };
  txBuckets?: Record<string, number>;
  creationTime?: string;
  socials?: any;
}

export interface TokenDetailResponse {
  success: boolean;
  data: {
    token?: {
      tokenId?: string;
      denom?: string;
      symbol?: string;
      name?: string;
      display?: string;
      exponent?: number;
      imageUri?: string;
      website?: string;
      twitter?: string;
      telegram?: string;
      createdAt?: string;
      description?: string | null;
    };
    price?: {
      source?: string;
      poolId?: string;
      pairContract?: string;
      native?: number;
      usd?: number;
      changePct?: Record<string, number>;
    };
    mcapDetail?: { native?: number; usd?: number };
    fdvDetail?: { native?: number; usd?: number };
    supply?: { circulating?: number; max?: number };
    priceInNative?: number;
    priceInUsd?: number;
    priceSource?: string;
    dominant?: string;
    pairView?: string;
    poolId?: string;
    pairContract?: string;
    pools?: number;
    holder?: number | string;
    creationTime?: string;
    circulatingSupply?: number;
    fdvNative?: number;
    fdv?: number;
    mcNative?: number;
    mc?: number;
    priceChange?: Record<string, number>;
    volume?: Record<string, number>;
    volumeUSD?: Record<string, number>;
    txBuckets?: Record<string, number>;
    uniqueTraders?: number;
    trade?: number;
    sell?: number;
    buy?: number;
    v?: number;
    vBuy?: number;
    vSell?: number;
    vUSD?: number;
    vBuyUSD?: number;
    vSellUSD?: number;
    liquidity?: number;
    liquidityNative?: number;
  };
  twitter?:
    | {
        handle?: string;
        userId?: string;
        name?: string;
        isBlueVerified?: boolean;
        verifiedType?: string | null;
        profilePicture?: string;
        coverPicture?: string;
        followers?: number;
        following?: number;
        createdAtTwitter?: string;
        lastRefreshed?: string;
      }
    | null;
}

// TypeScript Interfaces
export interface Token {
  tokenId: string;
  denom: string;
  symbol: string;
  name: string;
  imageUri: string;
  createdAt: string;
  priceNative: number;
  priceUsd: number;
  mcapNative: number;
  mcapUsd: number;
  fdvNative: number;
  fdvUsd: number;
  holders: number;
  volNative: number;
  volUsd: number;
  liquidity?: number;
  liquidityNative?: number;
  liquidityUsd?: number;
  tx: number;
  change24hPct: number;
}

export interface OHLCVData {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades: number;
}

export interface Trade {
  time: string;
  txHash: string;
  pairContract: string;
  signer: string;
  direction: "buy" | "sell";
  offerDenom: string;
  offerAmountBase: string;
  offerAmount: number;
  askDenom: string;
  askAmountBase: string;
  askAmount: number;
  returnAmountBase: string;
  returnAmount: number;
  priceNative: number;
  priceUsd: number;
  valueNative: number;
  valueUsd: number;
  class: string;
}

export class TokenAPI {
  constructor(private baseUrl: string = BASE_URL) {}

  private async fetchData<T>(
    endpoint: string,
    init: RequestInit = {}
  ): Promise<T> {
    const headers = new Headers(init.headers || undefined);
    if (API_KEY) headers.set("x-api-key", API_KEY);
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      cache: "no-store",
      ...init,
      headers,
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return res.json() as Promise<T>;
  }

  /* ---------------- Token Summary ---------------- */
  async getTokenSummaryBySymbol(
    symbol: string,
    priceSource: PriceSource = "best",
    includePools = true,
    init: RequestInit = {},
    poolId?: string | null
  ) {
    const safeSymbol = encodeURIComponent(symbol);
    const include = includePools ? "&includePools=1" : "";
    const pool = poolId ? `&poolId=${encodeURIComponent(poolId)}` : "";
    return this.fetchData<{ success: boolean; data: TokenSummary }>(
      `/tokens/${safeSymbol}?priceSource=${priceSource}${include}${pool}`,
      init
    );
  }

  async getTokenDetailsBySymbol(
    symbol: string,
    priceSource: PriceSource = "best",
    includePools = true,
    init: RequestInit = {},
    poolId?: string | null
  ) {
    const safeSymbol = encodeURIComponent(symbol);
    const include = includePools ? "&includePools=1" : "";
    const pool = poolId ? `&poolId=${encodeURIComponent(poolId)}` : "";
    return this.fetchData<TokenDetailResponse>(
      `/tokens/${safeSymbol}?priceSource=${priceSource}${include}${pool}`,
      init
    );
  }

  /* ---------------- Token OHLCV ---------------- */
  async getTokenOHLCV(
    symbol: string,
    tf: Timeframe = "1h",
    priceSource: PriceSource = "best",
    unit: Unit = "native",
    init: RequestInit = {}
  ) {
    const safeSymbol = encodeURIComponent(symbol);
    return this.fetchData<OHLCVData[]>(
      `/tokens/${safeSymbol}/ohlcv?tf=${tf}&priceSource=${priceSource}&unit=${unit}`,
      init
    );
  }

  async getLargeTrades(
    bucket: Bucket = "24h",
    unit: Unit = "usd",
    init: RequestInit = {}
  ): Promise<Trade[]> {
    return this.fetchData<Trade[]>(
      `/trades/?tf=${bucket}&unit=${unit}&limit=50`,
      init
    );
  }

  async getTopTokensForDashboard(
    bucket: Bucket = "24h",
    priceSource: PriceSource = "best",
    sort: string = "volume",
    limit: number = 100,
    offset: number = 0,
    init: RequestInit = {}
  ): Promise<Token[]> {
    return this.fetchData<Token[]>(
      `/tokens?bucket=${bucket}&priceSource=${priceSource}&dir=desc&includeChange=1&limit=${limit}&offset=${offset}&sort=${sort}`,
      init
    );
  }
  async getTopMarketTokens(
    bucket: Bucket = "30m",
    priceSource: PriceSource = "best",
    sort: string = "volume",
    limit: number = 100,
    offset: number = 0,
    init: RequestInit = {}
  ): Promise<Token[]> {
    return this.fetchData<Token[]>(
      `/tokens?bucket=${bucket}&priceSource=${priceSource}&dir=desc&includeChange=1&limit=${limit}&offset=${offset}&sort=${sort}`,
      init
    );
  }
  /* ---------------- Other Endpoints ---------------- */
  async getTokenPools(
    symbol: string,
    bucket: Bucket = "24h",
    init: RequestInit = {}
  ) {
    const safeSymbol = encodeURIComponent(symbol);
    return this.fetchData<any>(
      `/tokens/${safeSymbol}/pools?bucket=${bucket}`,
      init
    );
  }

  async getTokenSecurity(symbol: string, init: RequestInit = {}) {
    const safeSymbol = encodeURIComponent(symbol);
    return this.fetchData<any>(`/tokens/${safeSymbol}/security`, init);
  }

  async getTokenHolders(
    symbol: string,
    limit = 100,
    offset = 0,
    init: RequestInit = {}
  ) {
    const safeSymbol = encodeURIComponent(symbol);
    return this.fetchData<any>(
      `/tokens/${safeSymbol}/holders?limit=${limit}&offset=${offset}`,
      init
    );
  }

  async getTokenTrades(
    symbol: string,
    tf: Bucket = "24h",
    limit = 200,
    unit: Unit = "usd",
    init: RequestInit = {}
  ) {
    const safeSymbol = encodeURIComponent(symbol);
    return this.fetchData<any>(
      `/trades/token/${safeSymbol}?tf=${tf}&limit=${limit}&unit=${unit}`,
      init
    );
  }

  async healthCheck(init: RequestInit = {}) {
    return this.fetchData<{ ok: boolean }>("/health", init);
  }
}

export const tokenAPI = new TokenAPI();
