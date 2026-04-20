"use client";

import { useEffect, useState, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { API_BASE_URL, API_HEADERS } from "@/lib/api";
import { tokenApiRef } from "@/lib/token-routing";

const API_BASE = API_BASE_URL;

const PAIR_CONTRACT_POOL_IDS: Record<string, string> = {
  zig1h72z8ptvcdqvuvy2lqanupwtextjmjmktj2ejgne2padxk0z8zds48shzq: "5",
  zig1jv7v8an78vwyfx409nvrguktz8dl97hg7v0qs59pnc9krlf4en8szqsq8h: "10",
  zig1f2jt3f9gzajp5uupeq6xm20h90uzy6l8klvrx52ujaznc8xu8d7sfnrd87: "12",
};

const normalizePairValue = (value?: string | null) =>
  (value ?? "").trim().toLowerCase();

const normalizeDenom = (value?: string | null) => {
  const raw = (value ?? "").trim().toLowerCase();
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

const isZigAsset = (value?: string | null) => {
  const normalized = normalizePairValue(value);
  return normalized === "zig" || normalized === "uzig";
};

const isLikelyPairContract = (value?: string | null) =>
  normalizePairValue(value).startsWith("zig1");

const isSelectedPairWithZig = (
  selectedPair?: {
    baseSymbol?: string | null;
    quoteSymbol?: string | null;
    baseDenom?: string | null;
    quoteDenom?: string | null;
  } | null
) =>
  isZigAsset(selectedPair?.baseSymbol) ||
  isZigAsset(selectedPair?.quoteSymbol) ||
  isZigAsset(selectedPair?.baseDenom) ||
  isZigAsset(selectedPair?.quoteDenom);

// Keep full denoms for API lookups. Symbols can collide across factory tokens.
const normalizeFetchRef = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
};

const getPoolIdFromPool = (pool: any): string | null => {
  const candidates = [
    pool?.poolId,
    pool?.pool_id,
    pool?.poolID,
    pool?.poolIdNumber,
    pool?.id,
  ];
  const value = candidates.find((candidate) => {
    const normalized = String(candidate ?? "").trim();
    return normalized !== "" && /^[0-9]+$/.test(normalized);
  });
  return value == null ? null : String(value);
};

const getKnownPoolIdForPairContract = (pairContract?: string | null) => {
  const normalized = normalizeDenom(pairContract);
  return normalized ? PAIR_CONTRACT_POOL_IDS[normalized] ?? null : null;
};

const buildPoolsLookupUrl = (tokenRef: string) =>
  `${API_BASE}/tokens/${encodeURIComponent(
    tokenApiRef(tokenRef)
  )}/pools?includeAllSides=1`;

const isMatchingPool = (
  pool: any,
  baseDenom?: string | null,
  quoteDenom?: string | null,
  pairContract?: string | null
) => {
  const selectedPairContract = normalizeDenom(pairContract);
  const poolPairContract = normalizeDenom(
    pool?.pairContract ?? pool?.pair_contract ?? pool?.contract_address
  );
  if (selectedPairContract && poolPairContract === selectedPairContract) return true;

  const poolBase = normalizeDenom(pool?.base?.denom);
  const poolQuote = normalizeDenom(pool?.quote?.denom);
  const selectedBase = normalizeDenom(baseDenom);
  const selectedQuote = normalizeDenom(quoteDenom);

  if (!poolBase || !poolQuote || !selectedBase || !selectedQuote) return false;

  return (
    (poolBase === selectedBase && poolQuote === selectedQuote) ||
    (poolBase === selectedQuote && poolQuote === selectedBase)
  );
};

interface TokenData {
  token?: {
    tokenId?: string;
    denom?: string;
    symbol?: string;
    name?: string;
    imageUri?: string;
    createdAt?: string;
    description?: string | null;
  };
  symbol?: string;
  name?: string;
  imageUri?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  priceInUsd?: number;
  priceInNative?: number;
  price?: { usd?: number; native?: number; changePct?: Record<string, number> };
  liquidity?: number;
  mcap?: { usd?: number };
  mcapDetail?: { usd?: number; native?: number };
  fdv?: number;
  fdvDetail?: { usd?: number; native?: number };
  mc?: number;
  circulatingSupply?: number;
  supply?: { circulating?: number; max?: number } | number;
  holder?: string | number;
  creationTime?: string;
  priceChange?: Record<string, number>;
  volumeUSD?: Record<string, number>;
  txBuckets?: Record<string, number>;
  buy?: number;
  sell?: number;
  trade?: number;
  tradeCount?: { total?: number };
  vBuyUSD?: number;
  vSellUSD?: number;
  uniqueTraders?: number;
  priceSource?: string;
  dominant?: string;
  pairView?: string;
  poolId?: string;
  pairContract?: string;
}

export default function TokenStats({
  tokenId,
  tokenKey,
  summaryData,
  selectedPair,
}: {
  tokenId?: string | number;
  tokenKey?: string | null;
  summaryData?: TokenData | null;
  selectedPair?: {
    baseSymbol?: string | null;
    quoteSymbol?: string | null;
    baseDenom?: string | null;
    quoteDenom?: string | null;
    pairContract?: string | null;
    poolId?: string | null;
  } | null;
}) {
  const [data, setData] = useState<TokenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const lastGoodDataRef = useRef<TokenData | null>(null);
  
  const selectedPairWithZig = isSelectedPairWithZig(selectedPair);
  const selectedPairContract =
    selectedPair?.pairContract ||
    (isLikelyPairContract(selectedPair?.quoteDenom)
      ? selectedPair?.quoteDenom
      : null) ||
    (isLikelyPairContract(selectedPair?.baseDenom)
      ? selectedPair?.baseDenom
      : null);
  const selectedBaseDenom = isLikelyPairContract(selectedPair?.baseDenom)
    ? null
    : selectedPair?.baseDenom;
  const selectedQuoteDenom = isLikelyPairContract(selectedPair?.quoteDenom)
    ? null
    : selectedPair?.quoteDenom;
  const hasNonZigPairDenoms = Boolean(
    selectedBaseDenom && selectedQuoteDenom
  );
  const hasPairContract = Boolean(selectedPairContract);
  // Use explicit pool pricing for non-ZIG pairs even if the parent forgot poolId;
  // fetchData resolves the pool id from /pools before calling /tokens/:id.
  const shouldUsePoolPricing =
    !selectedPairWithZig &&
    Boolean(selectedPair?.poolId || hasNonZigPairDenoms || hasPairContract);
  // IMPORTANT: Always use the poolId from selectedPair, never from token data
  const selectedKnownPoolId = getKnownPoolIdForPairContract(selectedPairContract);
  const activePoolId = shouldUsePoolPricing
    ? selectedKnownPoolId ?? selectedPair?.poolId ?? null
    : null;

  const resolveTokenId = (): string | null => {
    // Prefer full denoms over symbols. Symbols can repeat across tokens.
    if (selectedBaseDenom) {
      return normalizeFetchRef(selectedBaseDenom);
    }

    if (selectedQuoteDenom) {
      return normalizeFetchRef(selectedQuoteDenom);
    }

    if (selectedPair?.baseSymbol) {
      return selectedPair.baseSymbol.toLowerCase();
    }

    if (selectedPair?.quoteSymbol) {
      return selectedPair.quoteSymbol.toLowerCase();
    }

    if (tokenKey && tokenKey.trim() !== "") {
      return normalizeFetchRef(tokenKey);
    }

    if (summaryData?.token?.denom) {
      return normalizeFetchRef(summaryData.token.denom);
    }
    
    if (summaryData?.token?.symbol) {
      return summaryData.token.symbol.toLowerCase();
    }

    // Numeric ids are a last resort. Denom/symbol refs keep IBC tokens on
    // their real fetch key while the route can still show the clean symbol.
    if (tokenId && String(tokenId).trim() !== "" && !shouldUsePoolPricing) {
      return String(tokenId);
    }
    
    return null;
  };

  // Helper to build token details URL with proper parameters
  const buildTokenDetailsUrl = (fetchTarget: string, poolId: string | null) => {
    const apiTarget = tokenApiRef(fetchTarget);
    if (selectedPairWithZig) {
      return `${API_BASE}/tokens/${encodeURIComponent(apiTarget)}`;
    }

    if (poolId) {
      // When pool is selected, ALWAYS use the poolId from selectedPair
      // This ensures we get the correct pair's data (e.g., STZIG/ZIGMORNING with poolId=10)
      return `${API_BASE}/tokens/${encodeURIComponent(apiTarget)}?priceSource=pool&poolId=${encodeURIComponent(poolId)}&dominant=quote&view=auto`;
    }
    // When no pool selected, fetch with best price source
    return `${API_BASE}/tokens/${encodeURIComponent(apiTarget)}?priceSource=best`;
  };

  const resolvePoolIdFromTokenDetails = async (
    fetchTarget: string
  ): Promise<string | null> => {
    const normalizedSelectedPairContract = normalizeDenom(selectedPairContract);
    if (!normalizedSelectedPairContract) return null;

    try {
      const response = await fetch(
        `${API_BASE}/tokens/${encodeURIComponent(
          tokenApiRef(fetchTarget)
        )}?priceSource=best&includePools=1`,
        { headers: API_HEADERS }
      );
      if (!response.ok) return null;

      const json = await response.json();
      const detail = json?.data ?? {};
      const candidates = [
        detail,
        detail?.price,
        ...(Array.isArray(detail?.poolsDetailed) ? detail.poolsDetailed : []),
        ...(Array.isArray(detail?.pools) ? detail.pools : []),
      ];

        const match = candidates.find((candidate: any) => {
          const candidatePairContract = normalizeDenom(
            candidate?.pairContract ??
              candidate?.pair_contract ??
              candidate?.contract_address
          );
          return candidatePairContract === normalizedSelectedPairContract;
        });

      return getPoolIdFromPool(match);
    } catch (err) {
      console.error("Failed to resolve pool id from token details:", err);
      return null;
    }
  };

  const resolvePoolIdFromTokenId = async (): Promise<string | null> => {
    if (tokenId == null || String(tokenId).trim() === "") return null;
    const tokenIdentity = String(tokenId).trim();
    try {
      const response = await fetch(
        `${API_BASE}/tokens/${encodeURIComponent(
          tokenApiRef(tokenIdentity)
        )}?priceSource=best&includePools=1`,
        { headers: API_HEADERS }
      );
      if (!response.ok) return null;
      const json = await response.json();
      const detail = json?.data ?? {};
      const directPoolId =
        getPoolIdFromPool(detail) ||
        getPoolIdFromPool(detail?.price) ||
        (detail?.poolId != null ? String(detail.poolId) : null) ||
        (detail?.pool_id != null ? String(detail.pool_id) : null) ||
        (detail?.price?.poolId != null ? String(detail.price.poolId) : null) ||
        (detail?.price?.pool_id != null ? String(detail.price.pool_id) : null);
      if (directPoolId) {
        // console.info("[TokenStats] tokenId direct poolId", {
        //   tokenId: tokenIdentity,
        //   directPoolId,
        //   pairContract: detail?.pairContract ?? detail?.price?.pairContract,
        // });
        return directPoolId;
      }
      const candidates = [
        detail,
        detail?.price,
        ...(Array.isArray(detail?.poolsDetailed) ? detail.poolsDetailed : []),
        ...(Array.isArray(detail?.pools) ? detail.pools : []),
      ];
      const match = candidates.find((candidate: any) =>
        isMatchingPool(
          candidate,
          selectedBaseDenom,
          selectedQuoteDenom,
          selectedPairContract
        )
      );
      const resolved = getPoolIdFromPool(match);
      // console.info("[TokenStats] tokenId pool lookup", {
      //   tokenId: tokenIdentity,
      //   resolved,
      //   selectedPairContract,
      //   selectedBaseDenom,
      //   selectedQuoteDenom,
      // });
      return resolved;
    } catch (err) {
      console.error("[TokenStats] Failed tokenId pool lookup", err);
      return null;
    }
  };

  const resolveSelectedPairPoolId = async (
    fetchTarget: string
  ): Promise<string | null> => {
    if (!shouldUsePoolPricing) return null;
    if (activePoolId) return activePoolId;
    const knownPoolId = getKnownPoolIdForPairContract(selectedPairContract);
    if (knownPoolId) return knownPoolId;
    const fromTokenId = await resolvePoolIdFromTokenId();
    if (fromTokenId) return fromTokenId;
    if (!selectedBaseDenom && !selectedQuoteDenom && !selectedPairContract) {
      return null;
    }

    const poolSources = [
      selectedBaseDenom,
      selectedQuoteDenom,
    ].filter((value): value is string => Boolean(value));
    for (const sourceDenom of poolSources) {
      try {
        const response = await fetch(
          buildPoolsLookupUrl(sourceDenom),
          { headers: API_HEADERS }
        );
        if (!response.ok) continue;
        const json = await response.json();
        const pools = Array.isArray(json?.data) ? json.data : [];
        // console.info("[TokenStats] pool lookup candidates", {
        //   sourceDenom,
        //   count: pools.length,
        //   selectedPairContract,
        //   selectedBaseDenom,
        //   selectedQuoteDenom,
        //     poolCandidates: pools.slice(0, 10).map((pool: any) => ({
        //       poolId:
        //         pool?.poolId ??
        //         pool?.pool_id ??
        //         pool?.poolID ??
        //         pool?.poolIdNumber ??
        //         pool?.id,
        //       pairContract:
        //         pool?.pairContract ??
        //         pool?.pair_contract ??
        //         pool?.contract_address,
        //       baseDenom: pool?.base?.denom,
        //       quoteDenom: pool?.quote?.denom,
        //       baseSymbol: pool?.base?.symbol,
        //     quoteSymbol: pool?.quote?.symbol,
        //   })),
        // });
        const match = pools.find((pool: any) =>
          isMatchingPool(
            pool,
            selectedBaseDenom,
            selectedQuoteDenom,
            selectedPairContract
          )
        );
        const resolvedPoolId = getPoolIdFromPool(match);
        if (resolvedPoolId) return resolvedPoolId;
      } catch (err) {
        console.error("Failed to resolve selected pair pool id:", err);
      }
    }

    return resolvePoolIdFromTokenDetails(fetchTarget);
  };

  const fetchData = async (isPolling = false) => {
    // Get the token identifier
    const fetchTarget = resolveTokenId();
    
    if (!fetchTarget) {
      // console.log("No token ID resolved, skipping fetch");
      setLoading(false);
      return;
    }

    try {
      if (!isPolling) {
        setLoading(true);
      }

      const poolId = await resolveSelectedPairPoolId(fetchTarget);
      // console.info("[TokenStats] fetch context", {
      //   fetchTarget,
      //   poolId,
      //   shouldUsePoolPricing,
      //   selectedPairWithZig,
      //   selectedPair,
      //   tokenId,
      //   tokenKey,
      //   summaryDenom: summaryData?.token?.denom,
      //   summarySymbol: summaryData?.token?.symbol,
      // });
      if (shouldUsePoolPricing && !poolId) {
        console.error("[TokenStats] Unable to resolve pool id for selected non-ZIG pair", {
          selectedPair,
          fetchTarget,
          selectedBaseDenom,
          selectedQuoteDenom,
          selectedPairContract,
          activePoolId,
        });
        if (lastGoodDataRef.current) {
          setData(lastGoodDataRef.current);
        }
        return;
      }
      
      // Build the URL with proper parameters
      const tokenUrl = buildTokenDetailsUrl(fetchTarget, poolId);
      // console.info("[TokenStats] request", { tokenUrl });
      
      // console.log("========== TOKEN STATS FETCH ==========");
      // console.log("Fetching token stats from:", tokenUrl);
      // console.log("Using active pool ID:", poolId);
      // console.log("Resolved token target:", fetchTarget);
      // console.log("Should use pool pricing:", shouldUsePoolPricing);
      // console.log("Selected pair has direct ZIG side:", selectedPairWithZig);
      // console.log("Selected pair:", selectedPair);
      // console.log("======================================");
      
      // Fetch token details with pool pricing if pool is selected
      const statsResponse = await fetch(tokenUrl, { headers: API_HEADERS });

      if (statsResponse.ok) {
        const json = await statsResponse.json();
        // console.info("[TokenStats] response", {
        //   status: statsResponse.status,
        //   success: json?.success,
        //   hasData: Boolean(json?.data),
        //   responsePoolId:
        //     json?.data?.poolId ??
        //     json?.data?.pool_id ??
        //     json?.data?.poolID ??
        //     json?.data?.price?.poolId ??
        //     json?.data?.price?.pool_id,
        //   symbol: json?.data?.token?.symbol ?? json?.data?.symbol,
        //   denom: json?.data?.token?.denom,
        // });
        if (json?.success && json?.data) {
          const tokenData = json.data;
          
          // DO NOT override the poolId from response - keep using selectedPair's poolId
          // The response might have a different poolId (like default pool), but we want to show
          // the data for the selected pool
          lastGoodDataRef.current = tokenData;
          setData(tokenData);
          
          // console.log("Token data fetched:", {
          //   symbol: tokenData.symbol,
          //   name: tokenData.name,
          //   priceInUsd: tokenData.priceInUsd,
          //   priceInNative: tokenData.priceInNative,
          //   responsePoolId: tokenData.poolId,
          //   selectedPoolId: poolId,
          //   priceSource: tokenData.priceSource,
          // });
        } else {
          console.error("[TokenStats] API returned empty or success=false", json);
          // Fallback to cached data if available
          if (lastGoodDataRef.current) {
            setData(lastGoodDataRef.current);
          }
        }
      } else {
        console.error("[TokenStats] Failed to fetch token stats", {
          status: statsResponse.status,
          url: tokenUrl,
        });
        // Fallback to cached data if available
        if (lastGoodDataRef.current) {
          setData(lastGoodDataRef.current);
        }
      }
    } catch (err) {
      console.error("[TokenStats] Error fetching token stats", err);
      if (!isPolling && lastGoodDataRef.current) {
        setData(lastGoodDataRef.current);
      }
    } finally {
      if (!isPolling) {
        setLoading(false);
      }
    }
  };

  const resolvedMaskKey = (
    tokenKey ??
    summaryData?.token?.denom ??
    summaryData?.token?.symbol ??
    ""
  )
    .trim()
    .toLowerCase();
  const isStzig = resolvedMaskKey.includes("stzig");
  const shouldMaskForStzig = isStzig && !shouldUsePoolPricing;
  
  const maskText = (
    value?: string,
    options: { hideForStzig?: boolean; fallback?: string } = {}
  ) => {
    const { hideForStzig = true, fallback = "—" } = options;
    const formatted = value ?? fallback;
    if (shouldMaskForStzig && hideForStzig) return fallback;
    return formatted === "" ? fallback : formatted;
  };
  
  const maskNumber = (
    value?: number,
    format: (n: number) => string = (n) => n.toString(),
    hideForStzig = true
  ) => {
    if (value == null || !Number.isFinite(value)) return "—";
    if (shouldMaskForStzig && hideForStzig) return "—";
    return format(value);
  };

  // Apply live summary updates when available (only when no pool selected)
  useEffect(() => {
    if (shouldUsePoolPricing) return;
    if (!summaryData) return;

    const resolvedRef = resolveTokenId();
    const summaryDenom = summaryData.token?.denom;
    const requiresExactDenom =
      resolvedRef &&
      (resolvedRef.includes(".") ||
        resolvedRef.includes("/") ||
        normalizeDenom(resolvedRef) === "uzig");
    if (
      requiresExactDenom &&
      summaryDenom &&
      normalizeDenom(summaryDenom) !== normalizeDenom(resolvedRef)
    ) {
      return;
    }
    
    // For non-pool views, use summary data
    setData(summaryData);
    lastGoodDataRef.current = summaryData;
    setLoading(false);
  }, [shouldUsePoolPricing, summaryData, tokenKey, tokenId, selectedPair]);

  // Initial fetch when selectedPair or token changes
  useEffect(() => {
    // Reset data when selectedPair changes
    setData(null);
    
    // Small delay to ensure state updates
    const timer = setTimeout(() => {
      fetchData();
    }, 100);
    
    return () => clearTimeout(timer);
  }, [
    selectedPair?.poolId,
    selectedPair?.baseSymbol,
    selectedPair?.quoteSymbol,
    selectedPair?.baseDenom,
    selectedPair?.quoteDenom,
    selectedPair?.pairContract,
    tokenId,
    tokenKey,
  ]);

  const handleReload = () => {
    fetchData();
  };

  if (loading) {
    return (
      <div className="bg-black/50 border border-gray-700 rounded-lg p-6 text-center text-gray-400">
        Loading token stats...
      </div>
    );
  }

  if (!data) {
    // console.warn("[TokenStats] rendering no-data state", {
    //   tokenId,
    //   tokenKey,
    //   selectedPair,
    //   shouldUsePoolPricing,
    //   selectedPairWithZig,
    //   activePoolId,
    //   selectedBaseDenom,
    //   selectedQuoteDenom,
    //   selectedPairContract,
    //   summaryHasData: Boolean(summaryData),
    //   lastGoodHasData: Boolean(lastGoodDataRef.current),
    // });
    if (!tokenKey && !tokenId && !selectedPair) {
      return (
        <div className="bg-black/50 border border-gray-700 rounded-lg p-6 text-center text-gray-400">
          Waiting for token details...
        </div>
      );
    }
    return (
      <div className="bg-black/50 border border-gray-700 rounded-lg p-6 text-center text-red-400">
        No data found for token
      </div>
    );
  }

  // local helper (no imports)
  const formatChangePct = (n?: number): string => {
    if (n == null || !Number.isFinite(n)) return "—";
    const v = Math.abs(n) < 0.0005 ? 0 : n;
    const abs = Math.abs(v);
    const maxDp =
      abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : abs >= 0.1 ? 3 : 4;
    const body = new Intl.NumberFormat(undefined, {
      maximumFractionDigits: maxDp,
      signDisplay: "exceptZero",
    }).format(v);
    return `${body}%`;
  };

  const change24h =
    data.priceChange?.["24h"] ?? data.price?.changePct?.["24h"];
  const volume24h = data.volumeUSD?.["24h"];

  const toShort = (num?: number, prefix = ""): string => {
    if (num == null || !Number.isFinite(num)) return "—";
    const r2 = (x: number) => Number(x.toFixed(2));
    const b = r2(num / 1e9);
    if (b >= 1) return `${prefix}${b.toFixed(2)}B`;
    const m = r2(num / 1e6);
    if (m >= 1) return `${prefix}${m.toFixed(2)}M`;
    const k = r2(num / 1e3);
    if (k >= 1) return `${prefix}${k.toFixed(2)}K`;
    return `${prefix}${r2(num).toFixed(2)}`;
  };

  const total = (data?.vBuyUSD ?? 0) + (data?.vSellUSD ?? 0);
  const buyPct = total ? ((data?.vBuyUSD ?? 0) / total) * 100 : 50;
  const sellPct = 100 - buyPct;

  const marketCap = toShort(
    data.mcapDetail?.usd ?? data.mcap?.usd ?? data.mc,
    "$"
  );
  const fdvValue = toShort(data.fdvDetail?.usd ?? data.fdv, "$");
  const change24hValue = formatChangePct(change24h);
  const supplyObj = typeof data.supply === "number" ? null : data.supply;
  const circulatingSupply = toShort(
    supplyObj?.circulating ?? data.circulatingSupply
  );
  const totalSupply = toShort(
    typeof data.supply === "number" ? data.supply : supplyObj?.max
  );
  const maskedMarketCap = maskText(marketCap);
  const maskedLiquidity = maskText(toShort(data.liquidity, "$"), {
    hideForStzig: false,
  });
  const masked24hTrades = maskNumber(
    data.txBuckets?.["24h"] ?? data.trade ?? data.tradeCount?.total,
    (n) => n.toString(),
    false
  );
  const maskedChange24hValue = maskText(change24hValue);
  const maskedFDV = maskText(fdvValue);
  const volume24hText = volume24h ? `$${toShort(volume24h)}` : "—";
  const maskedVolume24h = maskText(volume24hText, { hideForStzig: false });
  const maskedTotalSupply = maskText(totalSupply);
  const maskedCirculatingSupply = maskText(circulatingSupply);
  const change24hClass = shouldMaskForStzig
    ? "text-gray-400"
    : change24h != null && Number(change24h) >= 0
    ? "text-green-400"
    : "text-red-400";
  const txValueClass = shouldMaskForStzig ? "text-gray-400" : "text-green-400";
  const volValueClass = shouldMaskForStzig ? "text-gray-400" : "text-red-400";
  const buyValueClass = shouldMaskForStzig ? "text-gray-400" : "text-green-400";
  const sellValueClass = shouldMaskForStzig ? "text-gray-400" : "text-red-400";

  const changeColor = (v?: number) =>
    v && v > 0 ? "text-green-400" : v && v < 0 ? "text-red-400" : "text-white";

  const formatIntervalChange = (value?: number) =>
    shouldMaskForStzig || value == null ? "—" : `${value.toFixed(2)}%`;
  const formatIntervalVolume = (value?: number) =>
    shouldMaskForStzig ? "—" : value ? `$${toShort(value)}` : "0";

  const maskedBuys = maskNumber(data.buy, (n) => n.toString(), false);
  const maskedSells = maskNumber(data.sell, (n) => n.toString(), false);

  return (
    <div className="text-white w-full">
      <div className="my-3 rounded-lg border border-[#808080]/20">
        <div className="pt-4 px-4 grid grid-cols-2 gap-4">
          <div className="bg-[#171717] rounded-lg p-2">
            <p className="text-[#BCBCBC]/80 text-[.9rem] mb-1 text-center">
              Market Cap
            </p>
            <p className="text-white font-medium text-[1.2rem] text-center">
              {maskedMarketCap}
            </p>
          </div>
          <div className="bg-[#171717] rounded-lg p-2">
            <p className="text-[#BCBCBC]/80 text-[.9rem] mb-1 text-center">
              Liquidity
            </p>
            <p className="text-white font-medium text-[1.2rem] text-center">
              {maskedLiquidity}
            </p>
          </div>
          <div className="bg-[#171717] rounded-lg p-2">
            <p className="text-[#BCBCBC]/80 text-[.9rem] mb-1 text-center">
              24h Trades
            </p>
            <p className="text-white font-medium text-[1.2rem] text-center">
              {masked24hTrades}
            </p>
          </div>
          <div className="bg-[#171717] rounded-lg p-2">
            <p className="text-[#BCBCBC]/80 text-[.9rem] mb-1 text-center">
              Price Change 24h
            </p>
            <p
              className={`font-medium text-[1.2rem] text-center overflow-hidden ${
                change24hClass
              }`}
            >
              {maskedChange24hValue}
            </p>
          </div>
          <div className="bg-[#171717] rounded-lg p-2">
            <p className="text-[#BCBCBC]/80 text-[.9rem] mb-1 text-center">
              FDV
            </p>
            <p className="text-white font-medium text-[1.2rem] text-center">
              {maskedFDV}
            </p>
          </div>
          <div className="bg-[#171717] rounded-lg p-2">
            <p className="text-[#BCBCBC]/80 text-[.9rem] mb-1 text-center">
              24h Volume
            </p>
            <p className="text-white font-medium text-[1.2rem] text-center">
              {maskedVolume24h}
            </p>
          </div>
          <div className="bg-[#171717] rounded-lg p-2">
            <p className="text-[#BCBCBC]/80 text-[.9rem] mb-1 text-center">
              Total Supply
            </p>
            <p className="text-white font-medium text-[1.2rem] text-center">
              {maskedTotalSupply}
            </p>
          </div>
          <div className="bg-[#171717] rounded-lg p-2">
            <p className="text-[#BCBCBC]/80 text-[.9rem] mb-1 text-center">
              Circ Supply
            </p>
            <p className="text-white font-medium text-[1.2rem] text-center">
              {maskedCirculatingSupply}
            </p>
          </div>

          <div
            className={`transition-all duration-300 ease-in-out overflow-hidden col-span-2 ${
              showMoreInfo ? "max-h-[200px] opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-[#171717] rounded-lg p-2">
                <p className="text-[#BCBCBC]/80 text-[.9rem] mb-1 text-center">
                  Holders
                </p>
                <p className="text-white font-medium text-[1.2rem] text-center">
                  {data.holder}
                </p>
              </div>
              <div className="bg-[#171717] rounded-lg p-2">
                <p className="text-gray-400 text-[.9rem] mb-1 text-center">
                  Creation Date
                </p>
                <p className="text-white font-medium text-[1.2rem] text-center">
                  {data.creationTime
                    ? new Date(data.creationTime).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : "N/A"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <button
          className="bg-[#1A5346] rounded-b-lg w-full flex justify-center items-center gap-2 py-3 hover:bg-[#2a6b5a] transition-colors"
          onClick={() => setShowMoreInfo(!showMoreInfo)}
        >
          <p>More Info</p>
          <ChevronDown
            size={16}
            className={`text-white transition-transform duration-200 ${
              showMoreInfo ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>

      <div className="bg-black/60 border border-[#808080]/20 rounded-lg p-4 mb-4">
        <div className="grid grid-cols-4 gap-3 mb-4 text-center">
          {["30m", "1h", "4h", "24h"].map((p) => {
            const changeValue = data.priceChange?.[p];
            const volumeValue = data.volumeUSD?.[p];
            return (
              <div key={p} className="space-y-1">
                <div className="text-gray-400 text-sm">{p}</div>
                <div
                  className={`text-[1rem] font-medium ${
                    isStzig ? "text-gray-400" : changeColor(changeValue)
                  }`}
                >
                  {formatIntervalChange(changeValue)}
                </div>
                <div className="text-gray-400 text-xs">
                  {formatIntervalVolume(volumeValue)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-4 gap-3 mb-4 text-center">
          <div>
            <p className="text-gray-400 text-sm mb-1">Txs</p>
            <p className={`${txValueClass} font-medium`}>{masked24hTrades}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm mb-1">Vol</p>
            <p className={`${volValueClass} font-medium`}>{maskedVolume24h}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm mb-1">Buys</p>
            <p className={`${buyValueClass} font-medium`}>{maskedBuys}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm mb-1">Sells</p>
            <p className={`${sellValueClass} font-medium`}>{maskedSells}</p>
          </div>
        </div>

        <div className="shadow-sm">
          <div
            className="flex justify-between bg-[#0c0c0c] border border-gray-700 p-6 rounded-xl relative overflow-hidden items-start mb-[-10px] text-sm sm:text-base"
            style={{
              boxShadow:
                "0 4px 20px -5px rgba(32, 216, 124, 0.3), 0 4px 20px -5px rgba(246, 79, 57, 0.2)",
            }}
          >
            <div
              className="absolute bottom-0 left-0 right-0 h-1/2"
              style={{
                background: "linear-gradient(90deg, #20D87C 0%, #F64F39 100%)",
                opacity: 0.15,
                filter: "blur(8px)",
                transform: "translateY(50%)",
                zIndex: 0,
              }}
            ></div>
            <div className="text-left">
              <div className="text-gray-300 font-medium">
                Buys:{" "}
                <span className="text-white font-medium">
                  {data.buy ?? "—"}
                </span>
              </div>
              <div className="text-green-400 font-medium text-[0.95rem] sm:text-[1rem]">
                {toShort(data.vBuyUSD)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-gray-300 font-medium">
                Sells:{" "}
                <span className="text-white font-medium">
                  {data.sell ?? "—"}
                </span>
              </div>
              <div className="text-red-400 font-medium text-[0.95rem] sm:text-[1rem]">
                {toShort(data.vSellUSD)}
              </div>
            </div>
          </div>

          <div className="w-full h-[6px] sm:h-[8px] relative">
            <div className="absolute inset-0 rounded-full bg-black/30 border border-white/10"></div>
            <div className="h-full flex relative z-10">
              <div className="relative" style={{ width: `${buyPct}%` }}>
                <div
                  className="absolute -inset-0.5 rounded-full"
                  style={{
                    background:
                      "linear-gradient(90deg, #20D87C 0%, #20D87C 100%)",
                    filter: "blur(4px)",
                    opacity: 0.6,
                    zIndex: -1,
                  }}
                ></div>
                <div className="h-full w-full bg-[#20D87C] rounded-l-full transition-all duration-300 ease-out relative overflow-hidden">
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(90deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 50%)",
                      pointerEvents: "none",
                    }}
                  ></div>
                </div>
              </div>
              <div className="relative" style={{ width: `${sellPct}%` }}>
                <div
                  className="absolute -inset-0.5 rounded-full"
                  style={{
                    background:
                      "linear-gradient(90deg, #F64F39 0%, #FF0000 100%)",
                    filter: "blur(4px)",
                    opacity: 0.6,
                    zIndex: -1,
                  }}
                ></div>
                <div className="h-full w-full bg-[#F64F39] rounded-r-full transition-all duration-300 ease-out relative overflow-hidden">
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(90deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 50%)",
                      pointerEvents: "none",
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
