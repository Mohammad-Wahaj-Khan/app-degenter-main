"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { tokenAPI, API_BASE_URL, API_HEADERS } from "@/lib/api";
import Navbar from "@/app/components/navbar";
import SwapPanel from "@/app/components/swap-panel";
import TopMarketToken from "@/app/components/TopMarketToken";
import TradingChart from "@/app/components/tradingchart";
import AuditPanel from "@/app/components/audit-panel";
import Footer from "@/app/components/footer";
import RecentTrades, { type SignerFilterSummary } from "@/app/components/RecentTrades";
import TopHolders from "@/app/components/TopHolders";
import Security from "@/app/components/Security";
import TopTrades from "@/app/components/TopTrades";
import AddLeft from "@/app/components/add-left";
import MySwaps from "@/app/components/MySwaps";
import NotFoundPage from "@/app/not-found";
import Markets from "@/app/components/Markets";
// import  HoldersBubble from "@/app/components/HoldersBubble";

interface Token {
  id: number;
  name: string;
  symbol: string;
  denom?: string;
  pair_contract: string;
  price: number;
  priceUsd: number;
  change24h: number;
  icon: string | null;
  liquidity: number;
  marketCap: number;
  fdv: number;
  volume: Record<string, number>;
  txCount: Record<string, number>;
  circulatingSupply: number;
  totalSupply: number;
  maxSupply: number;
  holders: number;
  txBuy: number;
  txSell: number;
}

const isLikelyPairContract = (value: string) =>
  value.toLowerCase().startsWith("zig1");

const API_BASE = API_BASE_URL.replace(/\/+$/, "");

const normalizeDenom = (value?: string | null) =>
  decodeURIComponent(value ?? "").trim().toLowerCase();

const getPoolId = (pool: any): string | null =>
  pool?.poolId != null
    ? String(pool.poolId)
    : pool?.pool_id != null
    ? String(pool.pool_id)
    : pool?.poolIdNumber != null
    ? String(pool.poolIdNumber)
    : pool?.id != null
    ? String(pool.id)
    : null;

const buildPoolsUrl = (tokenRef: string) =>
  `${API_BASE}/tokens/${encodeURIComponent(
    tokenRef
  )}/pools?dominant=base&bucket=24h&limit=100`;

const getPairContract = (pool: any): string | null =>
  pool?.pairContract ?? pool?.pair_contract ?? null;

const fetchTokenBySymbol = async (
  symbol: string,
  options: { skipPairFallback?: boolean; poolId?: string | null } = {}
): Promise<Token | null> => {
  const resolveFromPools = async () => {
    if (options.skipPairFallback) return null;
    try {
      const res = await fetch(
        `${API_BASE}/tokens/${encodeURIComponent(symbol)}/pools`,
        { headers: API_HEADERS }
      );
      if (!res.ok) return null;
      const pools = await res.json();
      const pool = pools?.data?.[0] || null;
      const resolved =
        pool?.base?.denom ||
        pool?.base?.tokenId ||
        pools?.token?.denom ||
        pools?.token?.tokenId;
      if (resolved && resolved !== symbol) {
        return await fetchTokenBySymbol(resolved, { skipPairFallback: true });
      }
      return null;
    } catch (poolErr) {
      console.error("Error resolving pair contract:", poolErr);
      return null;
    }
  };

  try {
    if (isLikelyPairContract(symbol) && !options.skipPairFallback) {
      const fallback = await resolveFromPools();
      if (fallback) return fallback;
      return null;
    }
    const res = await tokenAPI.getTokenDetailsBySymbol(
      symbol,
      options.poolId ? "pool" : "best",
      true,
      {},
      options.poolId
    );
    const detail = res?.data;
    if (!detail) {
      const fallback = await resolveFromPools();
      if (fallback) return fallback;
      return null;
    }

    const token = detail.token || {};
    const denom = token.denom;
    const fallback = token.symbol || token.name || token.tokenId || symbol;
    const priceChange = detail.price?.changePct || detail.priceChange;

    return {
      id: Number(token.tokenId || 0),
      pair_contract: denom ? (denom.startsWith("ibc/") ? fallback : denom) : fallback,
      name: token.name || "Unknown Token",
      symbol: token.symbol || symbol,
      price: detail.price?.native || detail.priceInNative || 0,
      priceUsd: detail.price?.usd || detail.priceInUsd || 0,
      change24h: priceChange?.["24h"] || 0,
      icon: token.imageUri || null,
      liquidity: detail.liquidity || 0,
      marketCap: detail.mcapDetail?.usd || detail.mc || 0,
      fdv: detail.fdvDetail?.usd || detail.fdv || 0,
      maxSupply: detail.supply?.max || detail.circulatingSupply || 0,
      volume: {
        "30m": detail.volume?.["30m"] || 0,
        "1h": detail.volume?.["1h"] || 0,
        "4h": detail.volume?.["4h"] || 0,
        "24h": detail.volume?.["24h"] || 0,
      },
      txCount: {
        "30m": detail.txBuckets?.["30m"] || 0,
        "1h": detail.txBuckets?.["1h"] || 0,
        "4h": detail.txBuckets?.["4h"] || 0,
        "24h": detail.txBuckets?.["24h"] || 0,
        "30d": 0,
      },
      circulatingSupply: detail.supply?.circulating || detail.circulatingSupply || 0,
      totalSupply: detail.supply?.max || detail.circulatingSupply || 0,
      holders: Number(detail.holder || 0),
      txBuy: detail.buy || 0,
      txSell: detail.sell || 0,
    };
  } catch (error) {
    if (!options.skipPairFallback) {
      const fallback = await resolveFromPools();
      if (fallback) return fallback;
    }
    console.error("Error fetching token details:", error);
    return null;
  }
};

type ViewTab =
  | "trades"
  | "holders"
  | "topTrades"
  | "security"
  | "mySwaps"
  | "markets";

export default function PairDetails() {
  const { tokenDetails } = useParams();
  const router = useRouter();
  const [token, setToken] = useState<Token | null>(null);
  const [resolvedDenom, setResolvedDenom] = useState<string | null>(null);
  const [resolvedQuoteDenom, setResolvedQuoteDenom] = useState<string | null>(
    null
  );
  const [resolvedBaseSymbol, setResolvedBaseSymbol] = useState<string | null>(
    null
  );
  const [resolvedQuoteSymbol, setResolvedQuoteSymbol] = useState<string | null>(
    null
  );
  const [isAuditPanelVisible, setIsAuditPanelVisible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>("trades");
  const [signerSummary, setSignerSummary] = useState<SignerFilterSummary | null>(null);
  const [showHolderModal, setShowHolderModal] = useState(false);
  const [selectedPairOverride, setSelectedPairOverride] = useState<{
    baseSymbol?: string | null;
    quoteSymbol?: string | null;
    baseDenom?: string | null;
    quoteDenom?: string | null;
    pairContract?: string | null;
    poolId?: string | null;
  } | null>(null);
  const selectedPairOverrideRef = useRef<typeof selectedPairOverride>(null);
  const [resolvedRoutePair, setResolvedRoutePair] = useState<{
    baseSymbol?: string | null;
    quoteSymbol?: string | null;
    baseDenom?: string | null;
    quoteDenom?: string | null;
    pairContract?: string | null;
    poolId?: string | null;
  } | null>(null);
  const [selectedPairUrl, setSelectedPairUrl] = useState<string | null>(null);
  const routeParts = Array.isArray(tokenDetails)
    ? tokenDetails
    : [tokenDetails];
  const routeBaseSymbol = routeParts[0] ?? null;
  const routeQuoteSymbol = routeParts[1] ?? null;
  const routePairContract =
    routeParts[1] && isLikelyPairContract(String(routeParts[1]))
      ? String(routeParts[1])
      : null;
  const displayBaseSymbol = resolvedBaseSymbol || routeBaseSymbol;
  const displayQuoteSymbol = resolvedQuoteSymbol || (routePairContract ? null : routeQuoteSymbol);
  const selectedPairForSidebar =
    displayBaseSymbol && displayQuoteSymbol
      ? {
          baseSymbol: displayBaseSymbol,
          quoteSymbol: displayQuoteSymbol,
          baseDenom: resolvedDenom,
          quoteDenom: resolvedQuoteDenom,
          pairContract: routePairContract,
          poolId: null,
        }
      : resolvedDenom || resolvedQuoteDenom
      ? {
          baseDenom: resolvedDenom,
          quoteDenom: resolvedQuoteDenom,
          pairContract: routePairContract,
          poolId: null,
        }
      : null;
  const effectiveSelectedPair =
    selectedPairOverride || resolvedRoutePair || selectedPairForSidebar;
  const effectiveQuoteSymbol =
    selectedPairOverride?.quoteSymbol ??
    resolvedQuoteSymbol ??
    (routePairContract ? null : routeQuoteSymbol) ??
    null;

  useEffect(() => {
    if (!tokenDetails) return;
    const parts = Array.isArray(tokenDetails) ? tokenDetails : [tokenDetails];
    const raw = parts[0];
    if (!raw || raw === "undefined" || raw === "null") return;
    const currentOverride = selectedPairOverrideRef.current;
    const currentOverrideMatchesRoute =
      currentOverride &&
      normalizeDenom(currentOverride.baseDenom) === normalizeDenom(parts[0]) &&
      (parts.length < 2 ||
        normalizeDenom(currentOverride.pairContract) ===
          normalizeDenom(parts[1]) ||
        normalizeDenom(currentOverride.quoteDenom) ===
          normalizeDenom(parts[1]));
    if (!currentOverrideMatchesRoute) {
      selectedPairOverrideRef.current = null;
      setSelectedPairOverride(null);
    }
    setResolvedRoutePair(null);
    setSelectedPairUrl(null);

    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      setResolvedDenom(null);
      setResolvedQuoteDenom(null);
      setResolvedBaseSymbol(null);
      setResolvedQuoteSymbol(null);

      let lookupKey = raw;
      let baseDenom: string | null = null;
      let quoteDenom: string | null = null;
      let matchedPoolId: string | null = null;
      let matchedPairContract: string | null = null;
      let poolRedirectDone = false;
      if (parts.length >= 2 && parts[0] && parts[1]) {
        baseDenom = parts[0];
        const secondSegment = parts[1];
        const secondSegmentIsPairContract = isLikelyPairContract(String(secondSegment));
        quoteDenom = secondSegmentIsPairContract ? null : secondSegment;
        if (active) {
          setResolvedDenom(baseDenom);
          setResolvedQuoteDenom(quoteDenom);
        }
        lookupKey = baseDenom;
        try {
          const res = await fetch(buildPoolsUrl(baseDenom), {
            headers: API_HEADERS,
          });
          if (res.ok) {
            const pools = await res.json();
            const data = pools?.data ?? [];
            if (Array.isArray(data) && data.length) {
              const match = data.find((p: any) => {
                const pairContractMatch =
                  secondSegmentIsPairContract &&
                  normalizeDenom(getPairContract(p)) === normalizeDenom(secondSegment);
                const baseMatch =
                  normalizeDenom(p?.base?.denom) === normalizeDenom(baseDenom);
                const quoteMatch =
                  normalizeDenom(p?.quote?.denom) === normalizeDenom(quoteDenom);
                const reverseBaseMatch =
                  normalizeDenom(p?.base?.denom) === normalizeDenom(quoteDenom);
                const reverseQuoteMatch =
                  normalizeDenom(p?.quote?.denom) === normalizeDenom(baseDenom);
                return (
                  pairContractMatch ||
                  (baseMatch && quoteMatch) ||
                  (reverseBaseMatch && reverseQuoteMatch)
                );
              });
              if (match && active) {
                matchedPoolId = getPoolId(match);
                matchedPairContract = getPairContract(match);
                quoteDenom = match?.quote?.denom || quoteDenom;
                setResolvedDenom(match?.base?.denom || baseDenom);
                setResolvedQuoteDenom(quoteDenom);
                setResolvedBaseSymbol(match?.base?.symbol || null);
                setResolvedQuoteSymbol(match?.quote?.symbol || null);
                setResolvedRoutePair({
                  baseSymbol: match?.base?.symbol || null,
                  quoteSymbol: match?.quote?.symbol || null,
                  baseDenom: match?.base?.denom || baseDenom,
                  quoteDenom: match?.quote?.denom || quoteDenom,
                  pairContract: matchedPairContract,
                  poolId: matchedPoolId,
                });
              }
            }
          }
        } catch (err) {
          console.error("Failed to resolve pool symbols:", err);
        }
      } else if (isLikelyPairContract(raw)) {
        try {
          const res = await fetch(buildPoolsUrl(raw), { headers: API_HEADERS });
          if (res.ok) {
            const pools = await res.json();
            const pool = pools?.data?.[0] || null;
            baseDenom = pool?.base?.denom || pools?.token?.denom || null;
            quoteDenom = pool?.quote?.denom || null;
            if (active) {
              setResolvedDenom(baseDenom);
              setResolvedQuoteDenom(quoteDenom);
              setResolvedBaseSymbol(pool?.base?.symbol || null);
              setResolvedQuoteSymbol(pool?.quote?.symbol || null);
            }
            if (baseDenom) {
              lookupKey = baseDenom;
            } else if (quoteDenom) {
              lookupKey = quoteDenom;
            } else {
              if (active) {
                setError("Token not found");
                setLoading(false);
              }
              return;
            }
          }
        } catch (err) {
          console.error("Failed to resolve pair contract pools:", err);
          if (active) {
            setError("Token not found");
            setLoading(false);
          }
          return;
        }
      } else {
        try {
          const res = await fetch(buildPoolsUrl(raw), { headers: API_HEADERS });
          if (res.ok) {
            const pools = await res.json();
            const data = pools?.data ?? [];
            if (Array.isArray(data) && data.length) {
              const zigPool = data.find((p: any) => {
                const quoteSym = String(p?.quote?.symbol || "").toLowerCase();
                const quoteDen = String(p?.quote?.denom || "").toLowerCase();
                return quoteSym === "zig" || quoteDen === "uzig";
              });
              if (zigPool && active) {
                matchedPoolId = getPoolId(zigPool);
                matchedPairContract = getPairContract(zigPool);
                setResolvedDenom(zigPool?.base?.denom || null);
                setResolvedQuoteDenom(zigPool?.quote?.denom || null);
                setResolvedBaseSymbol(zigPool?.base?.symbol || null);
                setResolvedQuoteSymbol(zigPool?.quote?.symbol || null);
                setResolvedRoutePair({
                  baseSymbol: zigPool?.base?.symbol || null,
                  quoteSymbol: zigPool?.quote?.symbol || null,
                  baseDenom: zigPool?.base?.denom || null,
                  quoteDenom: zigPool?.quote?.denom || null,
                  pairContract: matchedPairContract,
                  poolId: matchedPoolId,
                });
              }
              if (!zigPool) {
                const fallbackPool = data[0];
                const baseDen = fallbackPool?.base?.denom;
                const quoteDen = fallbackPool?.quote?.denom;
                if (baseDen && quoteDen && parts.length < 2) {
                  poolRedirectDone = true;
                  router.replace(
                    `/token/${encodeURIComponent(baseDen)}/${encodeURIComponent(
                      quoteDen
                    )}`
                  );
                  return;
                }
              }
            }
          }
        } catch (err) {
          console.error("Failed to resolve pools for redirect:", err);
        }
      }

      let data: Token | null = null;
      if (poolRedirectDone) return;
      if (parts.length >= 2) {
        if (baseDenom) {
          data = await fetchTokenBySymbol(baseDenom, { poolId: matchedPoolId });
        }
        if (!data && quoteDenom) {
          data = await fetchTokenBySymbol(quoteDenom);
        }
        if (baseDenom || quoteDenom) {
          const symbolResults = await Promise.allSettled(
            [baseDenom, quoteDenom]
              .filter((v): v is string => typeof v === "string" && v.length > 0)
              .map((c) => fetchTokenBySymbol(c))
          );
          const resolved = symbolResults
            .filter(
              (
                r
              ): r is PromiseFulfilledResult<Token | null> =>
                r.status === "fulfilled"
            )
            .map((r) => r.value)
            .filter(Boolean) as Token[];
          if (active) {
            const baseSym =
              resolved.find((t) => t.denom === baseDenom)?.symbol ||
              resolved.find((t) => t.pair_contract === baseDenom)?.symbol ||
              resolved.find((t) => t.symbol)?.symbol ||
              null;
            const quoteSym =
              resolved.find((t) => t.denom === quoteDenom)?.symbol ||
              resolved.find((t) => t.pair_contract === quoteDenom)?.symbol ||
              resolved.find((t) => t.symbol && t.symbol !== baseSym)?.symbol ||
              null;
            setResolvedBaseSymbol(baseSym);
            setResolvedQuoteSymbol(quoteSym);
          }
        }
      } else {
        data = await fetchTokenBySymbol(lookupKey);
        if (!data && baseDenom && baseDenom !== lookupKey) {
          data = await fetchTokenBySymbol(baseDenom);
        }
        if (!data && quoteDenom && quoteDenom !== lookupKey) {
          data = await fetchTokenBySymbol(quoteDenom);
        }
      }
      if (!active) return;
      if (data) {
        setToken(data);
      } else {
        setError("Token not found");
      }
      setLoading(false);
    };

    load().catch(() => {
      if (!active) return;
      setError("Failed to load token");
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [tokenDetails]);

  const handleSelectPair = (pair: {
    baseSymbol?: string | null;
    quoteSymbol?: string | null;
    baseDenom?: string | null;
    quoteDenom?: string | null;
    pairContract?: string | null;
    poolId?: string | null;
  }) => {
    selectedPairOverrideRef.current = pair;
    setSelectedPairOverride(pair);
    setResolvedRoutePair(pair);
    const baseDen = pair.baseDenom;
    const quoteDen = pair.quoteDenom;
    const pairContract = pair.pairContract;
    const quoteSym = String(pair.quoteSymbol || "").toLowerCase();
    const quoteDenLc = String(quoteDen || "").toLowerCase();
    if (baseDen) {
      if (quoteSym === "zig" || quoteDenLc === "uzig") {
        const url = `/token/${encodeURIComponent(baseDen)}`;
        if (selectedPairUrl !== url) {
          setSelectedPairUrl(url);
          router.replace(url);
        }
        return;
      }
    }
    if (baseDen && pairContract) {
      const url = `/token/${encodeURIComponent(baseDen)}/${encodeURIComponent(
        pairContract
      )}`;
      if (selectedPairUrl !== url) {
        setSelectedPairUrl(url);
        router.replace(url);
      }
      return;
    }
    if (baseDen && quoteDen) {
      const url = `/token/${encodeURIComponent(baseDen)}/${encodeURIComponent(
        quoteDen
      )}`;
      if (selectedPairUrl !== url) {
        setSelectedPairUrl(url);
        router.replace(url);
      }
    }
  };

  if (!loading && (error || !token)) {
    return <NotFoundPage />;
  }

  const tabButtons = [
    { key: "trades", label: "Recent Trades" },
    { key: "holders", label: "Top Holders" },
    { key: "topTrades", label: "Top Trades" },
    { key: "security", label: "Security" },
    { key: "mySwaps", label: "My Swaps" },
    { key: "markets", label: "Markets" },
  ];
  const toggleAuditPanel = () => {
    setIsAuditPanelVisible((v) => !v);
  };
  const auditTokenKey = token?.denom || token?.pair_contract || null;
  return (
    <main className="flex min-h-screen flex-col bg-black relative overflow-hidden">
      <div
        className="absolute inset-0 z-1 h-60"
        style={{
          backgroundImage: `
            linear-gradient(
              120deg,
              #14624F 0%,
              #39C8A6 36.7%,
              #FA4E30 66.8%,
              #2D1B45 100%
            )
          `,
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
          filter: "saturate(120%) contrast(110%) brightness(0.9)",
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(to bottom, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.65) 70%, rgba(0,0,0,0.9) 100%), radial-gradient(120% 120% at 50% 0%, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.45) 70%, rgba(0,0,0,0.75) 100%)",
            mixBlendMode: "multiply",
          }}
        />
        <div
          className="absolute inset-0 opacity-40 mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGZpbHRlciBpZD0ibm9pc2UiIHg9IjAlIiB5PSIwJSIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSI+PGZlVHVyYnVsZW5jZSB0eXBlPSJmcmFjdGFsTm9pc2UiIGJhc2VGcmVxdWVuY3k9IjAuOTgiIG51bU9jdGF2ZXM9IjUiIHN0aXRjaFRpbGVzPSJzdGl0Y2giLz48L2ZpbHRlcj48cmVjdCB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgZmlsdGVyPSJ1cmwoI25vaXNlKSIvPjwvc3ZnPg==")`,
            backgroundRepeat: "repeat",
            backgroundSize: "96px 96px",
            filter: "contrast(120%)",
          }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-b from-transparent to-black" />
      </div>

      <Navbar />
      <TopMarketToken />

      <div className="flex flex-col max-w-8xl mx-auto w-full px-4 md:px-6 lg:px-8 py-4 space-y-4">
        {/* Wrapper: On large screens → row layout, on mobile → stacked */}
        <div
          className={`flex flex-col lg:flex-row gap-4 w-full ${isAuditPanelVisible}`}
        >
          {/* Left / Sidebar: Swap Panel */}
          <div className="hidden lg:block lg:order-1 w-full lg:w-80 flex-shrink-0">
            {token ? (
              <SwapPanel
                params={{ token: token.pair_contract }}
                selectedPair={effectiveSelectedPair}
              />
            ) : (
              <AddLeft selectedPair={effectiveSelectedPair} />
            )}
          </div>

          {/* Main Content */}
          <div className="order-1 lg:order-2 flex-1 flex flex-col">
            {/* Chart + Audit */}
            <div
              className={`flex flex-col lg:flex-row  w-full px-2 md:p-0 ${
                isAuditPanelVisible ? "lg:gap-4" : ""
              }`}
            >
              {/* Trading Chart */}
              <div className="flex-1 ">
                {token ? (
                  <TradingChart
                    token={token.pair_contract}
                    quoteSymbol={effectiveQuoteSymbol}
                    tokenId={token.id}
                    selectedPair={effectiveSelectedPair}
                    onToggleAuditPanel={toggleAuditPanel}
                    isAuditPanelVisible={isAuditPanelVisible}
                    signerSummary={signerSummary}
                  />
                ) : (
                  <div className="flex items-center justify-center h-[400px] text-gray-400">
                    Loading chart...
                  </div>
                )}
              </div>

              <div className="flex-1 lg:hidden ">
                {token ? (
                  <SwapPanel
                    params={{ token: token.pair_contract }}
                    selectedPair={effectiveSelectedPair}
                  />
                ) : (
                  <AddLeft selectedPair={effectiveSelectedPair} />
                )}
              </div>

              {/* Audit Panel */}
              <div
                className={`transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden flex-shrink-0 block 
                ${
                  isAuditPanelVisible
                    ? "w-full lg:w-80 opacity-100 ml-0"
                    : "w-0 lg:w-0 opacity-0 "
                }`}
                style={{
                  transitionProperty: "width, opacity, margin-left",
                  willChange: "width, opacity, margin-left",
                }}
              >
                <div className="w-full lg:w-80">
                  <AuditPanel tokenKey={auditTokenKey} />
                </div>
              </div>
            </div>

            {/* Tabs + Tables */}
            <div className="mt-4 w-full p-2 md:p-0">
              {/* <div className="relative mb-1 border-t border-x border-[#808080]/20 rounded-t-md py-2 px-4 overflow-x-auto">
                <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-[#FA4E30] to-[#39C8A6]" />
                <div className="flex space-x-4 min-w-max">
                  {[
                    { key: "trades", label: "Recent Trades" },
                    { key: "holders", label: "Top Holders" },
                    { key: "topTrades", label: "Top Trades" },
                    { key: "security", label: "Security" },
                    { key: "mySwaps", label: "My Swaps" },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      data-tab={tab.key}
                      onClick={() => setActiveTab(tab.key as any)}
                      className={`px-4 py-2 font-medium whitespace-nowrap ${
                        activeTab === tab.key
                          ? "text-white bg-[#1C1C1C] p-2 rounded my-2"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div> */}

              <div className="relative mb-1 border-t border-x border-[#808080]/20 rounded-t-md py-2 px-4 overflow-x-auto">
                <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-[#FA4E30] to-[#39C8A6]" />
                <div className="flex items-center justify-between min-w-max gap-4">
                  <div className="flex space-x-4">
                  {tabButtons.map((tab) => (
                    <button
                      key={tab.key}
                      data-tab={tab.key}
                      onClick={() => setActiveTab(tab.key as ViewTab)}
                      className={`px-4 py-2 font-medium whitespace-nowrap ${
                        activeTab === tab.key
                          ? "text-white bg-[#1C1C1C] p-2 rounded my-2"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                  </div>
                  {/* <button
                    type="button"
                    aria-label="Open holder bubble map"
                    onClick={() => setShowHolderModal(true)}
                    className="flex items-center justify-center h-10 w-10 rounded-full bg-white/5 border border-white/15 transition hover:bg-white/10"
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <defs>
                        <linearGradient id="bubbleIconGradient" x1="0" y1="0" x2="18" y2="18">
                          <stop offset="0%" stopColor="#39C8A6" />
                          <stop offset="100%" stopColor="#FA4E30" />
                        </linearGradient>
                      </defs>
                      <circle cx="6.2" cy="7.8" r="3" fill="#39C8A6" />
                      <circle cx="10.8" cy="6.5" r="2.4" fill="#FA4E30" />
                      <circle cx="11" cy="11" r="1.8" fill="#5EFFC8" />
                    </svg>
                  </button> */}
                </div>
              </div>


              <div className="min-h-[400px]">
                {activeTab === "trades" ? (
                  <RecentTrades
                    tokenId={token?.pair_contract}
                    selectedPair={effectiveSelectedPair}
                    onSignerFilterChange={setSignerSummary}
                  />
                ) : activeTab === "holders" ? (
                  <TopHolders tokenId={token?.pair_contract} />
                ) : activeTab === "security" ? (
                  <Security
                    tokenId={token?.id}
                    tokenKey={token?.pair_contract}
                  />
                ) : activeTab === "topTrades" ? (
                  <TopTrades tokenId={token?.pair_contract} />
                ) : activeTab === "mySwaps" ? (
                  <MySwaps tokenId={token?.pair_contract} />
                ) : activeTab === "markets" ? (
                  <Markets
                    denom={token?.denom || token?.pair_contract}
                    onSelectPair={handleSelectPair}
                  />
                ) : (
                  <AuditPanel tokenKey={auditTokenKey} />
                )}
              </div>
          </div>
        </div>
        </div>
      </div>

      <Footer />

      {/* {showHolderModal && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-stretch justify-center">
          <div className="relative h-full w-full overflow-hidden">
            <button
              type="button"
              className="absolute top-5 right-6 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 border border-white/30 text-2xl leading-none text-white hover:bg-black/80"
              aria-label="Close holder bubble"
              onClick={() => setShowHolderModal(false)}
            >
              ×
            </button>
            <div className="h-full w-full overflow-hidden">
              <HoldersBubble tokenId={token?.pair_contract ?? token?.symbol ?? "stzig"} />
            </div>
          </div>
        </div>
      )} */}
    </main>
  );
}
