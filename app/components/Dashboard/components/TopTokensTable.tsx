import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { tokenAPI } from "@/lib/api";
import { storeTokenRoute } from "@/lib/token-routing";
import { isTokenNew } from "@/lib/tokenUtils";
import NewTokenBadge from "./NewTokenBadge";
import type { DashboardToken } from "@/types/dashboard";
import LowLiquidityBadge, { hasLowLiquidity } from "./LiquidityWarning";

export type Token = DashboardToken;

interface TopTokensTableProps {
  tokens: Token[];
  loading: boolean;
  error: string | null;
  volumeChanges: Record<string, "increase" | "decrease" | "same">;
  totalItems: number;
  currentPage: number;
  onPageChange: (page: number) => void;
}

const ITEMS_PER_PAGE = 9;
const POLL_INTERVAL = 300000; // 5 minute
const STAKED_ZIG_DENOM =
  "coin.zig109f7g2rzl2aqee7z6gffn8kfe9cpqx0mjkk7ethmx8m2hq4xpe9snmaam2.stzig";

const TopTokensTable: React.FC<TopTokensTableProps> = ({
  tokens,
  loading,
  error,
  volumeChanges,
  totalItems,
  currentPage,
  onPageChange,
}) => {
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Token | null;
    direction: "asc" | "desc";
  }>({ key: "total_volume", direction: "desc" });

  const prevTokensRef = useRef<Token[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const pollingRef = useRef<number | null>(null);
  const volumeChangesRef = useRef(volumeChanges);
  const currentPageRef = useRef(currentPage);

  useEffect(() => {
    volumeChangesRef.current = volumeChanges;
  }, [volumeChanges]);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  const fetchTokens = useCallback(
    async (isPolling = false) => {
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const controller = new AbortController();
      abortRef.current = controller;

      if (!isPolling) {
        // setLoading(true);
      }

      try {
        const response = await tokenAPI.getTopTokensForDashboard(
          "24h",
          "best",
          "volume",
          ITEMS_PER_PAGE,
          (currentPageRef.current - 1) * ITEMS_PER_PAGE,
          { signal: controller.signal }
        );

        const respAny: any = response;
        const rawTokens: any[] = Array.isArray(respAny)
          ? respAny
          : respAny?.data ?? respAny?.tokens ?? respAny?.results ?? [];

        const filteredTokens = rawTokens.filter(
          (token: any) => token && token.symbol
        );

        const tokensData: Token[] = filteredTokens.map((token: any) => {
          const priceValue = Number(
            token.priceUsd ?? token.priceNative ?? token.current_price ?? 0
          );
          return {
            id: token.tokenId?.toString() || token.id?.toString() || "",
            symbol: token.symbol || "",
            name: token.name || "",
            current_price: Number.isNaN(priceValue) ? 0 : priceValue,
            price_change_percentage_24h: token.change24hPct || 0,
            market_cap: token.mcapUsd || token.mcapNative || 0,
            total_volume: token.volUsd || token.volNative || 0,
            fdvUsd: token.fdvUsd || 0,
            image: token.imageUri || token.image || "",
            tx: token.tx || 0,
            denom: token.denom || "",
            holders: token.holders || 0,
            creationTime: token.createdAt || 0,
          };
        });

        // Compute volume changes
        const newVolumeChanges = { ...volumeChangesRef.current };
        tokensData.forEach((token) => {
          const prevToken = prevTokensRef.current.find(
            (t) => t.id === token.id
          );
          if (prevToken) {
            if (token.total_volume > prevToken.total_volume) {
              newVolumeChanges[token.id] = "increase";
            } else if (token.total_volume < prevToken.total_volume) {
              newVolumeChanges[token.id] = "decrease";
            } else {
              newVolumeChanges[token.id] = "same";
            }
          }
        });
        // setVolumeChanges(newVolumeChanges);
        prevTokensRef.current = tokensData;

        // setTokens(tokensData);
        // setTotalItems(respAny?.total || tokensData.length);
        // setError(null);
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.error("Error fetching tokens:", err);
          // setError("Failed to load tokens. Please try again later.");
        }
      } finally {
        if (!isPolling) {
          // setLoading(false);
        }
      }
  },
    []
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

  const shouldHideMcap = useCallback((token: Token) => {
    const denom = token.denom?.toLowerCase?.();
    const symbol = token.symbol?.toLowerCase?.();
    return symbol === "stzig" || denom === STAKED_ZIG_DENOM;
  }, []);

  const isStakedZig = useCallback((token: Token) => {
    const denom = token.denom?.toLowerCase?.();
    const symbol = token.symbol?.toLowerCase?.();
    return symbol === "stzig" || denom === STAKED_ZIG_DENOM;
  }, []);

  const handlePageChange = (page: number) => {
    onPageChange(page);
  };

  const sortedTokens = useMemo(() => {
    if (!sortConfig.key) return tokens;

    return [...tokens].sort((a, b) => {
      const aValue = a[sortConfig.key as keyof Token];
      const bValue = b[sortConfig.key as keyof Token];
      if (aValue === undefined || bValue === undefined) return 0;
      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [tokens, sortConfig]);

  const priceChangeBySymbol = useMemo(() => {
    const map = new Map<string, number>();
    tokens.forEach((token) => {
      const symbol = token.symbol?.toLowerCase?.();
      if (!symbol) return;
      const changeValue = token.price_change_percentage_24h;
      if (token.denom?.startsWith("ibc/")) {
        if (!map.has(symbol)) {
          map.set(symbol, changeValue);
        }
      } else {
        map.set(symbol, changeValue);
      }
    });
    return map;
  }, [tokens]);

  const getPriceChangeValue = (token: Token) => {
    const symbolKey = token.symbol?.toLowerCase?.();
    if (token.denom?.startsWith("ibc/") && symbolKey) {
      const symbolChange = priceChangeBySymbol.get(symbolKey);
      if (typeof symbolChange === "number" && !Number.isNaN(symbolChange)) {
        return symbolChange;
      }
    }
    return token.price_change_percentage_24h;
  };

  const formatTokenPrice = (token: Token) => {
    const priceValue = Number(token.current_price ?? 0);
    if (Number.isNaN(priceValue)) return "--";
    if (token.symbol?.toLowerCase() === "wbtc") {
      return priceValue.toFixed(2);
    }
    return priceValue.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
  };

  const itemsPerPage = ITEMS_PER_PAGE;
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedTokens = sortedTokens.slice(startIndex, endIndex);

  if (loading || tokens.length === 0) {
    return (
      <div className="bg-black/30 rounded-lg pt-4 px-4 sm:px-6 min-h-[400px] relative border border-[#808080]/20 overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 bg-white/10 rounded-full animate-pulse"></div>
            <div className="h-6 bg-white/10 rounded w-32 animate-pulse"></div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full mt-4 table-fixed">
            <thead>
              <tr className="text-left text-white/60 text-sm border-b border-white/10">
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
    <div className="bg-black/30 rounded-lg pt-3 px-3 sm:px-4 lg:px-6 min-h-[420px] xl:min-h-[500px] xl:max-h-[500px] relative border border-[#808080]/20 overflow-hidden flex flex-col">
      <div className="w-[1400px] h-[600px] absolute z-[-10] bottom-0 right-[-450px] rounded-xl bg-[radial-gradient(circle,_rgba(250,78,48,0.2)_0%,_rgba(250,78,48,0.3)_10%,_transparent_70%)] blur-2xl shadow-[0_0_40px_rgba(250,78,48,0.5)]"></div>
      <div className="overflow-x-auto flex-1">
        <table className="w-full min-w-[720px] space-y-4 text-sm sm:text-base">
          <thead className="">
            <tr className="text-left text-white/60 text-xs sm:text-sm lg:text-base">
              <th>
                <div className="flex items-center gap-2 sm:gap-3 pb-4 sm:pb-6">
                  <Image
                    src="/fire.png"
                    alt="Fire Icon"
                    width={16}
                    height={16}
                    className="w-5 h-auto rounded-full object-cover"
                  />

                  <h2 className="text-[#EDEDED] text-lg sm:text-xl lg:text-[22px] font-medium">
                    Top Tokens
                  </h2>
                </div>
              </th>
              <th
                className="font-normal text-right cursor-pointer hover:text-white transition-colors pb-6"
                onClick={() => handleSort("current_price")}
              >
                <div className="flex items-baseline justify-end text-[#EDEDED]">
                  Price (USD)
                  {sortConfig.key === "current_price" && (
                    <span className="ml-1">
                      {sortConfig.direction === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </div>
              </th>
              <th className="font-normal text-right text-[#EDEDED] pb-6">
                24h Ch.
              </th>
              <th
                className="font-normal text-right cursor-pointer hover:text-white transition-colors pb-6"
                onClick={() => handleSort("total_volume")}
              >
                <div className=" items-center justify-end text-[#EDEDED]">
                  24h Vol (USD)
                  {sortConfig.key === "total_volume" && (
                    <span className="ml-1">
                      {sortConfig.direction === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </div>
              </th>
              <th className="font-normal text-right text-white pb-6">Txs</th>
              {/* <th
                className="font-normal text-right cursor-pointer hover:text-white transition-colors pb-6"
                onClick={() => handleSort("market_cap")}
              >
                <div className="flex items-center justify-end text-[#EDEDED]">
                  Liquidity
                  {sortConfig.key === "market_cap" && (
                    <span className="ml-1">
                      {sortConfig.direction === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </div>
              </th> */}
              <th className="font-normal text-right text-[#EDEDED] pb-6">
                MCap
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading
              ? Array.from({ length: ITEMS_PER_PAGE }).map((_, index) => (
                  <tr key={index} className="transition-colors">
                    <td className="py-2 border-b border-[#AEB9E1]/20">
                      <div className="flex items-center space-x-3">
                        <div className="w-6 h-6 bg-white/10 flex items-center justify-center rounded-full animate-pulse"></div>
                        <div className="h-4 bg-white/10 rounded animate-pulse w-16"></div>
                      </div>
                    </td>
                    <td className="py-2 border-b border-[#AEB9E1]/20 text-right">
                      <div className="h-4 bg-white/10 rounded animate-pulse w-12 ml-auto"></div>
                    </td>
                    <td className="py-2 border-b border-[#AEB9E1]/20 text-right">
                      <div className="h-4 bg-white/10 rounded animate-pulse w-12 ml-auto"></div>
                    </td>
                    <td className="py-2 border-b border-[#AEB9E1]/20 text-right">
                      <div className="h-4 bg-white/10 rounded animate-pulse w-8 ml-auto"></div>
                    </td>
                    <td className="py-2 border-b border-[#AEB9E1]/20 text-right">
                      <div className="h-4 bg-white/10 rounded animate-pulse w-12 ml-auto"></div>
                    </td>
                    {/* <td className="py-2 border-b border-[#AEB9E1]/20 text-right">
                      <div className="h-4 bg-white/10 rounded animate-pulse w-12 ml-auto"></div>
                    </td> */}
                  </tr>
                ))
              : paginatedTokens.map((token, index) => (
                  <tr
                    key={`${token.id}-${index}`}
                    className="transition-colors"
                  >
                    {/* <td className="py-4 text-white/60">
                    {(currentPage - 1) * itemsPerPage + index + 1}
                  </td> */}
                    <td className="py-2 border-b border-[#AEB9E1]/20">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className="w-6 h-6 bg-white/10 flex items-center justify-center rounded-full">
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
                                  const fallback =
                                    document.createElement("span");
                                  fallback.textContent = token.symbol
                                    .charAt(0)
                                    .toUpperCase();
                                  fallback.className = "text-white text-xs";
                                  parent.appendChild(fallback);
                                }
                              }}
                            />
                          ) : (
                            <span className="text-white text-xs">
                              {token.symbol.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <Link
                              href={`/token/${storeTokenRoute(
                                token.denom,
                                token.symbol
                              )}`}
                              className="min-w-0"
                            >
                              <span className="text-white font-normal block truncate max-w-[180px] sm:max-w-[240px] lg:max-w-[280px]">
                                {isStakedZig(token)
                                  ? `${token.symbol} (Liquid Staked Token)`
                                  : token.symbol}
                              </span>
                            </Link>
                            {hasLowLiquidity(token) && <LowLiquidityBadge />}
                            {isTokenNew(token.creationTime) && (
                              <NewTokenBadge />
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 border-b border-[#AEB9E1]/20 text-right">
                      <span className="text-white font-normal">
                        ${formatTokenPrice(token)}
                      </span>
                    </td>
                    <td className="py-2 border-b border-[#AEB9E1]/20 text-right">
                      {(() => {
                        const changeValue = getPriceChangeValue(token);
                        if (changeValue === undefined || Number.isNaN(changeValue)) {
                          return <span className="text-gray-500">-</span>;
                        }
                        const positive = changeValue >= 0;
                        return (
                          <span
                            className={`${
                              positive
                                ? "text-green-600 dark:text-green-400"
                                : "text-red-600 dark:text-red-400"
                            }`}
                          >
                            {changeValue.toFixed(2)}%
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-2 border-b border-[#AEB9E1]/20 ">
                      <div className="flex flex-col items-end font-normal">
                        <div className="text-white">
                          {token.total_volume?.toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
                        </div>
                        {/* {volumeChanges[token.id || ""] && (
                        <div  
                          className={`text-xs ${
                            volumeChanges[token.id || ""] === "increase"
                              ? "text-green-500"
                              : volumeChanges[token.id || ""] === "decrease"
                              ? "text-red-500"
                              : "text-white/60"
                          }`}
                        >
                          {volumeChanges[token.id || ""] === "increase"
                            ? "↑"
                            : volumeChanges[token.id || ""] === "decrease"
                            ? "↓"
                            : "→"}
                        </div>
                      )} */}
                      </div>
                    </td>
                    <td className="py-2 text-right text-white dark:text-white font-normal border-b border-[#AEB9E1]/20">
                      {/* Placeholder for transactions data */}
                      {token.tx}
                    </td>
                    {/* <td className="py-2 text-right font-normal border-b border-[#AEB9E1]/20">
                      <div className="text-white">
                        {token.fdvUsd ? (
                          <>
                            {(token.fdvUsd / 1000000).toLocaleString(
                              undefined,
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              }
                            )}
                            M
                          </>
                        ) : (
                          "--"
                        )}
                      </div>
                    </td> */}
                    <td className="py-2 text-right font-normal border-b border-[#AEB9E1]/20">
                      <div className="text-white">
                        {shouldHideMcap(token) ? (
                          "--"
                        ) : token.market_cap ? (
                          <>
                            {(() => {
                              const cap = token.market_cap;
                              if (cap >= 1000000000) {
                                // Billions: 1.5B, 12.3B
                                return `${(cap / 1000000000).toLocaleString(
                                  undefined,
                                  {
                                    minimumFractionDigits: 1,
                                    maximumFractionDigits: 1,
                                  }
                                )}B`;
                              } else if (cap >= 1000000) {
                                // Millions: 1.2M, 15.7M, 150M
                                return `${(cap / 1000000).toLocaleString(
                                  undefined,
                                  {
                                    minimumFractionDigits:
                                      cap >= 10000000 ? 0 : 1,
                                    maximumFractionDigits:
                                      cap >= 10000000 ? 0 : 1,
                                  }
                                )}M`;
                              } else if (cap >= 1000) {
                                // Thousands: 1.5K, 15K, 150K, 999K
                                return `${(cap / 1000).toLocaleString(
                                  undefined,
                                  {
                                    minimumFractionDigits: cap >= 10000 ? 0 : 1,
                                    maximumFractionDigits: cap >= 10000 ? 0 : 1,
                                  }
                                )}K`;
                              } else {
                                // Under 1K: show full number
                                return cap.toLocaleString(undefined, {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 0,
                                });
                              }
                            })()}
                          </>
                        ) : (
                          "--"
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
        <div className="absolute top-[3.2rem] sm:top-[3.4rem] left-3 sm:left-6 right-3 sm:right-6 h-[1px] [background-image:linear-gradient(to_right,#FA4E30_37%,#39C8A6_67%)]"></div>
      </div>

      {/* Footer with Pagination - Fixed at bottom */}
      <div className="-mx-3 sm:-mx-4 lg:-mx-6 mt-auto  bg-[#120706] px-3 py-2 text-[#EDEDED] shadow-[0_-12px_24px_rgba(0,0,0,0.35)] sm:px-4 lg:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
          <span className="text-[#919191] text-xs sm:text-sm text-center sm:text-left">
            Showing {Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)}
            -{Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems}{" "}
            pairs
          </span>
          <div className="flex items-center justify-center gap-1 flex-wrap text-[#EDEDED]">
            <button
              onClick={() => handlePageChange(1)}
              disabled={currentPage === 1}
              aria-label="First page"
              className="inline-flex h-8 w-8 items-center justify-center rounded text-[#EDEDED] hover:bg-white/10 disabled:cursor-not-allowed disabled:text-white/30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronFirst className="w-4 h-4" />
            </button>
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              aria-label="Previous page"
              className="inline-flex h-8 w-8 items-center justify-center rounded text-[#EDEDED] hover:bg-white/10 disabled:cursor-not-allowed disabled:text-white/30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="mx-2 text-sm font-semibold text-white">
              Page {currentPage} of {totalPages || 1}
            </span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              aria-label="Next page"
              className="inline-flex h-8 w-8 items-center justify-center rounded text-[#EDEDED] hover:bg-white/10 disabled:cursor-not-allowed disabled:text-white/30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => handlePageChange(totalPages)}
              disabled={currentPage >= totalPages}
              aria-label="Last page"
              className="inline-flex h-8 w-8 items-center justify-center rounded text-[#EDEDED] hover:bg-white/10 disabled:cursor-not-allowed disabled:text-white/30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronLast className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TopTokensTable;
