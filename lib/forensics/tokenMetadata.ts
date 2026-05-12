import type { TokenMetadataResponse } from "./schema";

const API_BASE_URL = "/api/zigscan-beta";

const COMMON_DENOM_MAP: Record<
  string,
  { symbol: string; decimals: number; image_url?: string }
> = {
  uzig: { symbol: "ZIG", decimals: 6 },
  uusdc: { symbol: "USDC", decimals: 6 },
  uusdt: { symbol: "USDT", decimals: 6 },
  uatom: { symbol: "ATOM", decimals: 6 },
  uosmo: { symbol: "OSMO", decimals: 6 },
};

const fallbackTokenMetadata = (denom: string): TokenMetadataResponse => {
  const common = COMMON_DENOM_MAP[denom.toLowerCase()];

  return {
    status: "1",
    message: "OK",
    result: {
      denom,
      metadata: {
        symbol: common?.symbol || denom,
        decimals: common?.decimals ?? 0,
        image_url: common?.image_url || null,
      },
    },
  };
};

export async function getEnrichedTokenMetadata(
  denom: string,
): Promise<TokenMetadataResponse> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/accounts/token-metadata?denom=${encodeURIComponent(denom)}`,
      {
        method: "GET",
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return fallbackTokenMetadata(denom);
    }

    const data = (await response.json()) as TokenMetadataResponse;
    if (!data?.result?.metadata?.symbol) {
      return fallbackTokenMetadata(denom);
    }

    return data;
  } catch {
    return fallbackTokenMetadata(denom);
  }
}
