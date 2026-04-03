import { API_BASE_URL, API_HEADERS } from "@/lib/api";

// API Configuration
const BASE_URL = API_BASE_URL;

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
  tx: number;
  change24hPct: number;
}

export interface Pool {
  id: string;
  tokenA: string;
  tokenB: string;
  liquidity: number;
  volume24h: number;
  fee: number;
}

export interface OHLCVData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TokenHolder {
  address: string;
  balance: number;
  percentage: number;
}

export interface TokenSecurity {
  isHoneypot: boolean;
  buyTax: number;
  sellTax: number;
  isOpenSource: boolean;
  isProxy: boolean;
  isBlacklisted: boolean;
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

export interface TradeLeaderboard {
  wallet: string;
  profit: number;
  trades: number;
  winRate: number;
}

// API Query Parameters
export type Bucket = "30m" | "1h" | "4h" | "24h";
export type PriceSource = "best" | "first" | "pool" | "all";
export type Timeframe = "1h" | "4h" | "1d" | "1M";
export type Mode = "price" | "mcap";
export type Unit = "native" | "usd";
export type SortField =
  | "price"
  | "mcap"
  | "volume"
  | "tx"
  | "traders"
  | "created"
  | "change24h";
export type Direction = "asc" | "desc";

// API Client Class
export class TokenAPI {
  private baseUrl: string;

  constructor(baseUrl: string = BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async fetchData<T>(endpoint: string): Promise<T> {
    try {
      const headers = API_HEADERS;
      const response = await fetch(`${this.baseUrl}${endpoint}`, { headers });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("API fetch error:", error);
      throw error;
    }
  }

  // Token List Endpoints
  async getTokensByMarketCap(bucket: Bucket = "24h"): Promise<Token[]> {
    return this.fetchData<Token[]>(
      `/tokens?bucket=${bucket}&sort=mcap&dir=desc`
    );
  }

  async getTokensByPriceChange(bucket: Bucket = "24h"): Promise<Token[]> {
    return this.fetchData<Token[]>(
      `/tokens?bucket=${bucket}&priceSource=best&includeChange=1&sort=change24h&dir=desc`
    );
  }

  async getTokensByPrice(
    bucket: Bucket = "24h",
    direction: Direction = "asc"
  ): Promise<Token[]> {
    return this.fetchData<Token[]>(
      `/tokens?bucket=${bucket}&priceSource=first&sort=price&dir=${direction}`
    );
  }

  async getTokensByVolume(bucket: Bucket = "24h"): Promise<Token[]> {
    return this.fetchData<Token[]>(
      `/tokens?bucket=${bucket}&sort=volume&dir=desc`
    );
  }

  async getTokensByTransactions(bucket: Bucket = "24h"): Promise<Token[]> {
    return this.fetchData<Token[]>(`/tokens?bucket=${bucket}&sort=tx&dir=desc`);
  }

  async getTokensByTraders(bucket: Bucket = "24h"): Promise<Token[]> {
    return this.fetchData<Token[]>(
      `/tokens?bucket=${bucket}&sort=traders&dir=desc`
    );
  }

  async getNewestTokens(bucket: Bucket = "24h"): Promise<Token[]> {
    return this.fetchData<Token[]>(
      `/tokens?bucket=${bucket}&sort=created&dir=desc`
    );
  }

  async getTopTokensForDashboard(
    bucket: Bucket = "30m",
    priceSource: PriceSource = "best",
    limit: number = 50,
    offset: number = 0
  ): Promise<Token[]> {
    return this.fetchData<Token[]>(
      `/tokens?bucket=${bucket}&priceSource=${priceSource}&dir=desc&includeChange=1&limit=${limit}&offset=${offset}&sort=volume`
    );
  }

  // Token Summary Endpoints
  async getTokenSummary(
    tokenId: string,
    priceSource: PriceSource = "best",
    includePools: boolean = false
  ): Promise<Token> {
    const includePoolsParam = includePools ? "&includePools=1" : "";
    return this.fetchData<Token>(
      `/tokens/${tokenId}?priceSource=${priceSource}${includePoolsParam}`
    );
  }

  async getTokenSummaryByPool(
    tokenId: string,
    poolId: string,
    includePools: boolean = false
  ): Promise<Token> {
    const includePoolsParam = includePools ? "&includePools=1" : "";
    return this.fetchData<Token>(
      `/tokens/${tokenId}?priceSource=pool&poolId=${poolId}${includePoolsParam}`
    );
  }

  // Token OHLCV Endpoints
  async getTokenOHLCV(
    tokenId: string,
    timeframe: Timeframe = "1h",
    priceSource: PriceSource = "best",
    unit: Unit = "native",
    mode: Mode = "price"
  ): Promise<OHLCVData[]> {
    let endpoint = `/tokens/${tokenId}/ohlcv?tf=${timeframe}&priceSource=${priceSource}`;
    if (unit !== "native") endpoint += `&unit=${unit}`;
    if (mode !== "price") endpoint += `&mode=${mode}`;
    return this.fetchData<OHLCVData[]>(endpoint);
  }

  async getTokenOHLCVByPool(
    tokenId: string,
    poolId: string,
    timeframe: Timeframe = "1h"
  ): Promise<OHLCVData[]> {
    return this.fetchData<OHLCVData[]>(
      `/tokens/${tokenId}/ohlcv?tf=${timeframe}&priceSource=pool&poolId=${poolId}`
    );
  }

  // Token Additional Data Endpoints
  async getTokenHolders(tokenId: string): Promise<TokenHolder[]> {
    return this.fetchData<TokenHolder[]>(`/tokens/${tokenId}/holders`);
  }

  async getTokenPools(
    tokenId: string,
    bucket: Bucket = "24h"
  ): Promise<Pool[]> {
    return this.fetchData<Pool[]>(`/tokens/${tokenId}/pools?bucket=${bucket}`);
  }

  async getTokenSecurity(tokenId: string): Promise<TokenSecurity> {
    return this.fetchData<TokenSecurity>(`/tokens/${tokenId}/security`);
  }

  // Trades Endpoints
  async getAllTrades(
    timeframe: Bucket = "24h",
    unit: Unit = "usd"
  ): Promise<Trade[]> {
    return this.fetchData<Trade[]>(`/trades?tf=${timeframe}&unit=${unit}`);
  }

  // async getWhaleTrades(
  //   timeframe: Bucket = "1h",
  //   uint: Uint = "zig"
  // ): Promise<Trade[]> {
  //   return this.fetchData<Trade[]>(
  //     `/trades?tf=${timeframe}&class=whale&unit=${unit}`
  //   );
  // }

  async getTokenTrades(
    tokenId: string,
    timeframe: Bucket = "24h",
    limit: number = 200,
    unit: Unit = "usd"
  ): Promise<Trade[]> {
    return this.fetchData<Trade[]>(
      `/trades/token/${tokenId}?tf=${timeframe}&limit=${limit}&unit=${unit}`
    );
  }

  // async getWalletTrades(
  //   address: string,
  //   timeframe: Bucket = "1d",
  //   unit: Unit = "usd"
  // ): Promise<Trade[]> {
  //   return this.fetchData<Trade[]>(
  //     `/trades/wallet/${address}?tf=${timeframe}&unit=${unit}`
  //   );
  // }

  async getProfitableTraders(
    bucket: Bucket = "24h"
  ): Promise<TradeLeaderboard[]> {
    return this.fetchData<TradeLeaderboard[]>(
      `/trades/leaderboard/profitable?bucket=${bucket}`
    );
  }

  async getLargeTrades(
    bucket: Bucket = "24h",
    uint: Unit = "usd"
  ): Promise<Trade[]> {
    return this.fetchData<Trade[]>(
      `/trades/?tf=${bucket}&unit=${uint}&limit=5000`
    );
  }

  // Health Check
  async healthCheck(): Promise<any> {
    return this.fetchData<any>("/health");
  }
}

// Create and export API instance
export const tokenAPI = new TokenAPI();

// Helper functions for common use cases
export const getTopTokens = () => tokenAPI.getTokensByMarketCap();
export const getTrendingTokens = () => tokenAPI.getTokensByPriceChange();
export const getTokenChart = (tokenId: string, timeframe: Timeframe = "1h") =>
  tokenAPI.getTokenOHLCV(tokenId, timeframe, "best", "usd");
export const getTokenDetails = (tokenId: string) =>
  tokenAPI.getTokenSummary(tokenId, "best", true);

export const getTopTokensForDashboard = () =>
  tokenAPI.getTopTokensForDashboard();
