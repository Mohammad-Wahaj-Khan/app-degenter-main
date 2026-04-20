"use client";
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { tokenAPI } from "@/lib/api";
import { isTokenNew } from "@/lib/tokenUtils";
import NewTokenBadge from "./NewTokenBadge";
import LowLiquidityBadge, { hasLowLiquidity } from "./LiquidityWarning";

export interface Token {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  total_volume: number;
  image: string;
  tx: number;
  tokenId?: string;
  denom: string;
  holders: number | string;
  fdvUsd?: number;
  creationTime?: number;
  liquidity?: number;
}

const ITEMS_PER_PAGE = 10;
const POLL_INTERVAL = 15000; // 15 seconds for near real-time
const STAKED_ZIG_DENOM =
  "coin.zig109f7g2rzl2aqee7z6gffn8kfe9cpqx0mjkk7ethmx8m2hq4xpe9snmaam2.stzig";

type FilterId = "topVolume" | "topGainers" | "findMore";
const FIND_GEMS_FILTERS: {
  id: FilterId;
  label: string;
  color: string;
}[] = [
  { id: "topVolume", label: "Top Volume", color: "#FA4E30" },
  { id: "topGainers", label: "Top Gainers", color: "#FA4E30" },
  // { id: "findMore", label: "Find More", color: "#4285F4" },
];
const FIND_GEMS_SORT_MAP: Record<
  FilterId,
  { key: keyof Token; direction: "asc" | "desc" }
> = {
  topVolume: { key: "total_volume", direction: "desc" },
  topGainers: { key: "price_change_percentage_24h", direction: "desc" },
  findMore: { key: "creationTime", direction: "desc" },
};

const FindGems: React.FC = () => {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalItems, setTotalItems] = useState<number>(0);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Token | null;
    direction: "asc" | "desc";
  }>({ key: "total_volume", direction: "desc" });
  const [activeFilter, setActiveFilter] = useState<FilterId>("topVolume");

  const abortRef = useRef<AbortController | null>(null);
  const pollingRef = useRef<number | null>(null);

  const fetchTokens = useCallback(
    async (isPolling = false) => {
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const controller = new AbortController();
      abortRef.current = controller;

      if (!isPolling) {
        setLoading(true);
      }

      try {
        const response = await tokenAPI.getTopTokensForDashboard(
          "24h",
          "best",
          "volume",
          ITEMS_PER_PAGE,
          (currentPage - 1) * ITEMS_PER_PAGE,
          { signal: controller.signal }
        );

        const respAny: any = response;
        const rawTokens: any[] = Array.isArray(respAny)
          ? respAny
          : respAny?.data ?? respAny?.tokens ?? respAny?.results ?? [];

        const filteredTokens = rawTokens.filter(
          (token: any) => token && token.symbol
        );

        const tokensData: Token[] = filteredTokens.map((token: any) => ({
          id: token.tokenId?.toString() || token.id?.toString() || "",
          symbol: token.symbol || "",
          name: token.name || "",
          current_price: token.priceUsd || token.priceNative || 0,
          price_change_percentage_24h: token.change24hPct || 0,
          market_cap: token.mcapUsd || token.mcapNative || 0,
          total_volume: token.volUsd || token.volNative || 0,
          fdvUsd: token.fdvUsd || 0,
          image: token.imageUri || token.image || "",
          tx: token.tx || 0,
          denom: token.denom || "",
          holders: token.holders || 0,
          creationTime: token.createdAt || 0,
          liquidity:
            token.liquidity ??
            token.liquidityUsd ??
            token.volUsd ??
            token.volNative ??
            0,
        }));

        setTokens(tokensData);
        const highVolumeCount = tokensData.filter(
          (token) => (token.total_volume ?? 0) > 0
        ).length;
        setTotalItems(highVolumeCount);
        setError(null);
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.error("Error fetching tokens:", err);
          setError("Failed to load tokens. Please try again later.");
        }
      } finally {
        if (!isPolling) {
          setLoading(false);
        }
      }
    },
    [currentPage]
  );

  // Set up polling
  useEffect(() => {
    // Initial fetch
    fetchTokens();

    // Set up polling
    pollingRef.current = window.setInterval(() => {
      fetchTokens(true);
    }, POLL_INTERVAL);

    // Cleanup
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [fetchTokens]);

  const handleSort = (key: keyof Token) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const handleFilterSelect = (filterId: FilterId) => {
    const sort = FIND_GEMS_SORT_MAP[filterId];
    setActiveFilter(filterId);
    setSortConfig(sort);
  };

  // const handleFilterSelect = (filterId: FilterId) => {
  //   const sort = FIND_GEMS_SORT_MAP[filterId];
  //   setActiveFilter(filterId);
  //   setSortConfig(sort);
  // };

  const shouldHideMcap = useCallback((token: Token) => {
    const denom = token.denom?.toLowerCase?.();
    const symbol = token.symbol?.toLowerCase?.();
    return (
      symbol === "stzig" ||
      denom === STAKED_ZIG_DENOM
    );
  }, []);

  const isStakedZig = useCallback(
    (token: Token) => {
      const denom = token.denom?.toLowerCase?.();
      const symbol = token.symbol?.toLowerCase?.();
      return symbol === "stzig" || denom === STAKED_ZIG_DENOM;
    },
    []
  );

  const highVolumeTokens = useMemo(() => {
    const filtered = tokens.filter(
      (token) => (token.total_volume ?? 0) > 0
    );
    return [...filtered].sort(
      (a, b) => (b.total_volume ?? 0) - (a.total_volume ?? 0)
    );
  }, [tokens]);

  const sortedTokens = useMemo(() => {
    if (!sortConfig.key) return highVolumeTokens.slice(0, ITEMS_PER_PAGE);

    return [...highVolumeTokens]
      .sort((a, b) => {
        const aValue = a[sortConfig.key as keyof Token];
        const bValue = b[sortConfig.key as keyof Token];
        if (aValue === undefined || bValue === undefined) return 0;
        if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      })
      .slice(0, ITEMS_PER_PAGE);
  }, [highVolumeTokens, sortConfig]);

  if (loading || tokens.length === 0) {
    return (
      <div className="bg-black/30 rounded-lg pt-4 px-6 min-h-[600px] relative border border-[#808080]/20 overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 bg-white/10 rounded-full animate-pulse"></div>
            <div className="h-6 bg-white/10 rounded w-32 animate-pulse"></div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full mt-4 table-fixed text-base">
            <thead>
              <tr className="text-left text-white/60 text-base border-b border-white/10">
                {[1, 2, 3, 4, 5].map((i) => (
                  <th key={i} className="pb-4">
                    <div className="h-4 bg-white/10 rounded w-3/4 animate-pulse"></div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 10 }).map((_, rowIndex) => (
                <tr key={rowIndex} className="border-b border-[#AEB9E1]/20">
                  {[1, 2, 3, 4, 5].map((colIndex) => (
                    <td key={colIndex} className="py-3">
                      <div className="h-4 bg-white/10 rounded w-3/4 animate-pulse ml-auto"></div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500 text-center py-8">Error: {error}</div>;
  }

  return (
    <div className="bg-black/30 rounded-lg pt-4 px-6 min-h-[600px] relative border border-[#808080]/20 overflow-hidden">
      <div className="w-[800px] h-[400px] absolute z-[-10] bottom-[-20px] right-[-450px] rounded-xl bg-[radial-gradient(circle,_rgba(250,78,48,0.2)_0%,_rgba(250,78,48,0.3)_10%,_transparent_70%)] blur-2xl shadow-[0_0_40px_rgba(250,78,48,0.5)]"></div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Image
            src="/fire.png"
            alt="Fire Icon"
            width={16}
            height={16}
            className="w-5 h-auto rounded-full object-cover"
          />
          <h2 className="text-[#EDEDED] text-[24px] font-medium">Find Gems</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {FIND_GEMS_FILTERS.map((filter) => {
            const isActive = activeFilter === filter.id;
            return (
              <button
                key={filter.id}
                onClick={() => handleFilterSelect(filter.id)}
                className={`transition duration-200 ${
                  isActive ? "opacity-100" : "opacity-60 hover:opacity-100"
                }`}
              >
                <div
                  className="flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 backdrop-blur-sm bg-black/60"
                  style={{
                    boxShadow: isActive
                      ? `0 0 12px ${filter.color}80`
                      : undefined,
                  }}
                >
                  <span
                    className={`w-2 h-2 rounded-full border`}
                    style={{
                      backgroundColor: isActive ? filter.color : "transparent",
                      borderColor: filter.color,
                    }}
                  />
                  <span className="text-[13px] text-white/80 font-semibold">
                    {filter.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto px-1">
          <table className="w-full mt-4 table-fixed text-base min-w-[600px]">
            <thead>
              <tr className="text-left text-white/60 text-base border-b border-white/10">
                <th
                  className="pb-4 font-normal text-right cursor-pointer hover:text-white transition-colors w-[40%]"
                  onClick={() => handleSort("symbol")}
                >
                  <div className="flex items-center justify-start text-[#919191]">
                    Token
                  </div>
                </th>
                <th
                  className="pb-4 font-normal text-right cursor-pointer hover:text-white transition-colors w-[25%]"
                  onClick={() => handleSort("current_price")}
                >
                  <div className="flex items-center justify-end text-[#919191]">
                    Price (USD)
                    {sortConfig.key === "current_price" && (
                      <span className="ml-1">
                        {sortConfig.direction === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
                <th
                  className="pb-4 font-normal text-right cursor-pointer hover:text-white transition-colors w-[15%]"
                  onClick={() => handleSort("price_change_percentage_24h")}
                >
                  <div className="flex items-center justify-end text-[#919191]">
                    24h Ch.
                    {sortConfig.key === "price_change_percentage_24h" && (
                      <span className="ml-1">
                        {sortConfig.direction === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
                <th
                  className="pb-4 font-normal text-right cursor-pointer hover:text-white transition-colors w-[20%]"
                  onClick={() => handleSort("total_volume")}
                >
                  <div className="flex items-center justify-end text-[#919191]">
                    24h Vol
                    {sortConfig.key === "total_volume" && (
                      <span className="ml-1">
                        {sortConfig.direction === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
                <th className="pb-4 font-normal text-right text-[#919191] w-[15%]">
                  {/* placeholder to balance spacing */}
                  &nbsp;
                </th>
              </tr>
            </thead>
          <tbody className="divide-y divide-white/5">
            {sortedTokens.map((token, index) => (
              <tr key={`${token.id}-${index}`} className="transition-colors">
                <td className="py-2 border-b border-[#AEB9E1]/20 w-[40%]">
                  <div className="flex items-center space-x-3">
                    <div className="w-6 h-6 bg-white/10 flex items-center justify-center rounded-full flex-shrink-0">
                      {token.image ? (
                        <Image
                          src={token.image}
                          alt={token.symbol}
                          width={24}
                          height={24}
                          className="w-6 h-6 rounded-full"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = "none";
                            const parent = target.parentElement;
                            if (parent) {
                              const fallback = document.createElement("span");
                              fallback.className = "text-white text-xs";
                              fallback.textContent =
                                token.symbol?.[0]?.toUpperCase() || "?";
                              parent.appendChild(fallback);
                            }
                          }}
                        />
                      ) : (
                        <span className="text-white text-xs">
                          {token.symbol?.[0]?.toUpperCase() || "?"}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <Link
                          href={`/token/${
                            token.denom.startsWith("ibc/")
                              ? token.symbol
                              : token.denom
                          }`}
                        >
                          <div className="text-white font-medium truncate">
                            {isStakedZig(token)
                              ? `${token.symbol?.toUpperCase()} (Liquid Staked Token)`
                              : token.symbol?.toUpperCase() || "N/A"}
                          </div>
                        </Link>
                        {hasLowLiquidity(token) && <LowLiquidityBadge />}
                        {isTokenNew(token.creationTime) && <NewTokenBadge />}
                      </div>
                    </div>
                  </div>
                </td>

                <td className="py-2 text-right text-[15px] font-normal border-b border-[#AEB9E1]/20 w-[25%]">
                  <div className="text-white truncate">
                    {token.current_price?.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 6,
                    })}
                  </div>
                </td>

                <td className="py-2 text-right text-[15px] font-normal border-b border-[#AEB9E1]/20 w-[15%]">
                  <div
                    className={`${
                      (token.price_change_percentage_24h ?? 0) >= 0
                        ? "text-green-400"
                        : "text-red-500"
                    }`}
                  >
                    {(token.price_change_percentage_24h ?? 0).toFixed(2)}%
                  </div>
                </td>

                <td className="py-2 border-b border-[#AEB9E1]/20 text-[15px] w-[20%]">
                  <div className="flex flex-col items-end font-normal">
                    <div className="text-white truncate">
                      {(() => {
                        const vol = token.total_volume;
                        if (!vol) return "--";
                        if (vol >= 1_000_000)
                          return `${(vol / 1_000_000).toFixed(
                            vol >= 10_000_000 ? 0 : 1
                          )}M`;
                        if (vol >= 1_000)
                          return `${(vol / 1_000).toFixed(
                            vol >= 10_000 ? 0 : 1
                          )}K`;
                        return vol.toFixed(0);
                      })()}
                    </div>
                  </div>
                </td>

                <td className="py-2 text-right text-[15px] font-normal border-b border-[#AEB9E1]/20 w-[15%]">
                  &nbsp;
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="absolute top-[3.3rem] left-6 right-6 h-[1px] [background-image:linear-gradient(to_right,#FA4E30_37%,#39C8A6_67%)]"></div>
      </div>
    </div>
  );
};

export default FindGems;
