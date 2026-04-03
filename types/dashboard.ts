import type { Trade } from "@/lib/api";

export type VolumeChangeDirection = "increase" | "decrease" | "same";

export interface DashboardToken {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  total_volume: number;
  image: string;
  tx: number;
  denom: string;
  holders: number | string;
  fdvUsd?: number;
  creationTime: number;
  tokenId?: string;
  liquidity?: number;
}

export interface DashboardServerData {
  tokens: DashboardToken[];
  trades: Trade[];
  newListings: DashboardToken[];
  totalItems: number;
  volumeChanges: Record<string, VolumeChangeDirection>;
}
