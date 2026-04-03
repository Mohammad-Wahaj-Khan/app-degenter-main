export type Token = {
  symbol: string;
  name?: string;
  imageUri?: string;
  denom?: string;
  tokenId?: string;
  pairContract?: string;
  mcapUsd?: number;
  priceChange?: Record<string, number> | number;
  priceUsd?: number;
  volume?: Record<string, number> | number;
  volumeUSD?: Record<string, number> | number;
  volUsd?: number;
};
