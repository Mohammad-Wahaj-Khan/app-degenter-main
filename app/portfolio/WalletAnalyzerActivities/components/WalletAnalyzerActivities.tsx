"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Clock,
  Download,
  Filter,
  ArrowUpRight,
  ExternalLink,
} from "lucide-react";
import Image from "next/image";
import { useChain } from "@cosmos-kit/react";
import { CHAIN_NAME } from "@/app/config/chain";
import { API_BASE_URL, API_HEADERS } from "@/lib/api";

// Types
interface Swap {
  time: string;
  txHash: string;
  direction: string;
  offerDenom: string;
  offerAmount: number;
  askDenom: string;
  returnAmount: number;
  priceUsd: number;
  valueUsd: number;
}

const normalizeWalletApiBase = (value?: string) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed || /undefined|null/i.test(trimmed)) return API_BASE_URL;
  return trimmed;
};

const ACTIVITY_API_BASE = normalizeWalletApiBase(
  process.env.NEXT_PUBLIC_WALLET_HOLDINGS_API ??
    process.env.API_BASE_URL
);
const FALLBACK_TOKEN_IMAGE = "/zigicon.png";
const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_FILTER_OPTIONS: Record<string, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "60d": 60,
};

type WalletAnalyzerActivitiesProps = {
  addressOverride?: string;
};

export default function WalletAnalyzerActivities({
  addressOverride,
}: WalletAnalyzerActivitiesProps) {
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const [symbolMap, setSymbolMap] = useState<Record<string, string>>({});
  const [tokenImageMap, setTokenImageMap] = useState<Record<string, string>>(
    {}
  );
  const { address: connectedAddress, connect } = useChain(
    CHAIN_NAME || "zigchain-1"
  );
  const address = addressOverride?.trim() || connectedAddress;
  const isSearchResult = Boolean(addressOverride?.trim());
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);
  const [isTokenFilterOpen, setIsTokenFilterOpen] = useState<boolean>(false);
  const [timeFilter, setTimeFilter] = useState<string>("24h");
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [availableTokens, setAvailableTokens] = useState<
    { denom: string; symbol: string }[]
  >([]);

  const itemsPerPage = 10;
  const filteredSwaps = selectedToken
    ? swaps.filter(
        (swap) =>
          swap.offerDenom.toLowerCase() === selectedToken.toLowerCase() ||
          swap.askDenom.toLowerCase() === selectedToken.toLowerCase()
      )
    : swaps;
  const totalPages = Math.max(
    1,
    Math.ceil(filteredSwaps.length / itemsPerPage)
  );
  const currentItems = filteredSwaps.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedToken, timeFilter]);

  // Format time to relative time
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400)
      return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  // Format number with commas and 2 decimal places
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  // Load available tokens
  const loadAvailableTokens = useCallback(async () => {
    try {
      const response = await fetch(`${ACTIVITY_API_BASE}/tokens/swap-list`, {
        headers: API_HEADERS,
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data?.data)) {
          const tokens = data.data.map((token: any) => ({
            denom: token.denom,
            symbol: token.symbol || token.denom,
          }));
          setAvailableTokens(tokens);
        }
      }
    } catch (error) {
      console.error("Error loading tokens:", error);
    }
  }, []);

  // Fetch swaps data
  const fetchSwaps = useCallback(async () => {
    if (!address) return;

    setLoading(true);
    setError(null);

    try {
    const spanDays = TIME_FILTER_OPTIONS[timeFilter] ?? 1;
    const now = new Date();
    const startTime = new Date(now.getTime() - spanDays * DAY_MS).toISOString();
    const params = new URLSearchParams({
      win: timeFilter,
      limit: "50",
      startTime,
      endTime: now.toISOString(),
    });

      const url = `${ACTIVITY_API_BASE}/wallets/${encodeURIComponent(
        address
      )}/activities?${params.toString()}`;
      const response = await fetch(url, {
        headers: { Accept: "application/json", ...API_HEADERS },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch swaps: ${response.statusText}`);
      }

      const result = await response.json();

      const items = Array.isArray(result?.items) ? result.items : [];
      if (items.length > 0) {
        const mapped = items.map((item: any) => ({
          time: item?.ts ?? "",
          txHash: item?.tx_hash ?? "",
          direction: item?.direction ?? "",
          offerDenom: item?.token_in?.denom ?? "",
          offerAmount: Number(item?.amount_in ?? 0),
          askDenom: item?.token_out?.denom ?? "",
          returnAmount: Number(item?.amount_out ?? 0),
          priceUsd: Number(item?.price_usd ?? 0),
          valueUsd: Number(item?.value_usd ?? 0),
        }));
        setSwaps(mapped);
      } else {
        setSwaps([]);
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to fetch swaps";
      console.error("[fetchSwaps] Error:", errorMsg, err);
      setError(errorMsg);
      setSwaps([]);
    } finally {
      setLoading(false);
    }
  }, [address, timeFilter]);

  // Wallet connection handler
  const connectWallet = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      if (!connect) {
        throw new Error("Wallet connection not available");
      }

      await connect();
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to connect wallet";
      console.error("[connectWallet] Error:", errorMsg, err);
      setError(errorMsg);
    } finally {
      setIsConnecting(false);
    }
  }, [connect]);

  // Load token symbols and images
  useEffect(() => {
    let cancelled = false;

    const loadTokenData = async () => {
      try {
        const res = await fetch(
          `${ACTIVITY_API_BASE}/tokens/swap-list?q=zig&bucket=24h&unit=usd`,
          { headers: API_HEADERS }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json();
        const items = json?.data ?? [];
        const newSymbolMap: Record<string, string> = {};
        const newImageMap: Record<string, string> = {};

        // Add default ZIG token
        newSymbolMap["uzig"] = "ZIG";
        newImageMap["uzig"] = "/zigicon.png";

        // Add tokens from API
        for (const it of items) {
          if (it?.denom && it?.symbol) {
            newSymbolMap[it.denom] = it.symbol;
            newSymbolMap[it.denom.toLowerCase()] = it.symbol;
            newImageMap[it.denom] = it.imageUri || FALLBACK_TOKEN_IMAGE;
          }
        }

        if (!cancelled) {
          setSymbolMap(newSymbolMap);
          setTokenImageMap(newImageMap);
        }
      } catch (err) {
        console.error("Error loading token data:", err);
        if (!cancelled) {
          setSymbolMap({ uzig: "ZIG" });
          setTokenImageMap({ uzig: "/zigicon.png" });
        }
      }
    };

    loadTokenData();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load available tokens on mount
  useEffect(() => {
    loadAvailableTokens();
  }, [loadAvailableTokens]);

  // Fetch swaps when wallet connects or time filter changes
  useEffect(() => {
    if (address) {
      fetchSwaps();
    }
  }, [address, fetchSwaps]);

  // Download CSV function
  const downloadCSV = () => {
    if (swaps.length === 0) return;

    const headers = [
      "Time",
      "Transaction",
      "Direction",
      "From",
      "To",
      "Amount In",
      "Amount Out",
      "Value (USD)",
    ];

    const csvRows = [
      headers.join(","),
      ...swaps.map((swap) => {
        const fromSymbol = symbolMap[swap.offerDenom] || swap.offerDenom;
        const toSymbol = symbolMap[swap.askDenom] || swap.askDenom;

        return [
          `"${new Date(swap.time).toISOString()}"`,
          `"${swap.txHash}"`,
          `"${swap.direction}"`,
          `"${fromSymbol}"`,
          `"${toSymbol}"`,
          swap.offerAmount.toString(),
          swap.returnAmount.toString(),
          `$${swap.valueUsd.toFixed(2)}`,
        ].join(",");
      }),
    ];

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.setAttribute("hidden", "");
    a.setAttribute("href", url);
    a.setAttribute(
      "download",
      `wallet-swaps-${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Render connect wallet state
  if (!address && !isSearchResult) {
    return (
      <section className="rounded-3xl text-white py-2 px-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-2xl font-semibold text-white/90">
              Trading Activities
            </p>
            <p className="text-base text-white/70 mb-4">
              Connect your wallet to view your trading activities
            </p>
            <button
              onClick={connectWallet}
              disabled={isConnecting}
              className="px-4 py-2 bg-[#32816E] rounded-md hover:bg-[#3a9a82] transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isConnecting ? "Connecting..." : "Connect Wallet"}
            </button>
          </div>
        </div>
      </section>
    );
  }

  // Render loading state
  if (loading && swaps.length === 0) {
    return (
      <section className="rounded-3xl text-white py-2 px-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-2xl font-semibold text-white/90">
              Trading Activities
            </p>
            <p className="text-base text-white/70">Loading activities...</p>
          </div>
        </div>
        <div className="mt-6 h-64 flex items-center justify-center">
          <div className="animate-pulse text-white/50">
            Loading swap data...
          </div>
        </div>
      </section>
    );
  }

  // Render error state
  if (error) {
    return (
      <section className="rounded-3xl text-white py-2 px-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-2xl font-semibold text-white/90">
              Trading Activities
            </p>
            <p className="text-base text-white/70">
              Error loading swap history
            </p>
          </div>
        </div>
        <div className="mt-6 p-4 bg-red-900/20 border border-red-500/50 rounded-lg">
          <p className="text-red-300">{error}</p>
          <button
            onClick={fetchSwaps}
            className="mt-2 text-sm bg-red-900/50 hover:bg-red-900/70 px-3 py-1 rounded"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  // Render empty state
  if (swaps.length === 0) {
    return (
      <section className="rounded-3xl text-white py-2 px-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-2xl font-semibold text-white/90">
              Trading Activities
            </p>
            <p className="text-base text-white/70">
              No swap history found for this wallet
            </p>
          </div>
        </div>
        <div className="mt-6 h-64 flex flex-col items-center justify-center text-white/50">
          <p>No swap transactions found</p>
          <button
            onClick={fetchSwaps}
            className="mt-4 text-sm bg-[#32816E] hover:bg-[#3a9a80] px-4 py-2 rounded-md transition-colors"
          >
            Refresh
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl text-white py-2 px-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-2xl font-semibold text-white/90">
            Trading Activities
          </p>
          <p className="text-base text-white/70">
            {isSearchResult
              ? "Swap history for searched wallet"
              : "Swap history for your connected wallet"}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className="flex items-center justify-center gap-2 bg-[#32816E] rounded-md border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-wider transition hover:border-white/40 hover:bg-white/10"
            >
              <Clock size={14} />
              {timeFilter === "24h"
                ? "24h"
                : timeFilter === "7d"
                ? "7d"
                : timeFilter === "30d"
                ? "30d"
                : "60d"}
            </button>
            {isFilterOpen && (
              <div className="absolute right-0 mt-1 w-32 bg-[#0a1a15] border border-white/10 rounded-md shadow-lg z-50">
                <button
                  onClick={() => {
                    setTimeFilter("24h");
                    setIsFilterOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm ${
                    timeFilter === "24h"
                      ? "bg-[#32816E]/30"
                      : "hover:bg-white/5"
                  }`}
                >
                  Last 24 hours
                </button>
                <button
                  onClick={() => {
                    setTimeFilter("7d");
                    setIsFilterOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm ${
                    timeFilter === "7d" ? "bg-[#32816E]/30" : "hover:bg-white/5"
                  }`}
                >
                  Last 7 days
                </button>
                <button
                  onClick={() => {
                    setTimeFilter("30d");
                    setIsFilterOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm ${
                    timeFilter === "30d"
                      ? "bg-[#32816E]/30"
                      : "hover:bg-white/5"
                  }`}
                >
                  Last 30 days
                </button>
                <button
                  onClick={() => {
                    setTimeFilter("60d");
                    setIsFilterOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm ${
                    timeFilter === "60d"
                      ? "bg-[#32816E]/30"
                      : "hover:bg-white/5"
                  }`}
                >
                  Last 60 days
                </button>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setIsTokenFilterOpen(!isTokenFilterOpen)}
              className="flex items-center justify-center gap-2 bg-[#32816E] rounded-md border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-wider transition hover:border-white/40 hover:bg-white/10"
            >
              <Filter size={14} />
              {selectedToken
                ? symbolMap[selectedToken] || selectedToken
                : "All Tokens"}
            </button>
            {isTokenFilterOpen && (
              <div className="absolute right-0 mt-1 w-48 max-h-60 overflow-y-auto bg-[#0a1a15] border border-white/10 rounded-md shadow-lg z-50">
                <button
                  onClick={() => {
                    setSelectedToken(null);
                    setIsTokenFilterOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm ${
                    !selectedToken ? "bg-[#32816E]/30" : "hover:bg-white/5"
                  }`}
                >
                  All Tokens
                </button>
                {availableTokens.map((token) => (
                  <button
                    key={token.denom}
                    onClick={() => {
                      setSelectedToken(token.denom);
                      setIsTokenFilterOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm ${
                      selectedToken === token.denom
                        ? "bg-[#32816E]/30"
                        : "hover:bg-white/5"
                    }`}
                  >
                    {token.symbol}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={downloadCSV}
            disabled={swaps.length === 0}
            className="flex items-center justify-center gap-2 bg-[#32816E] rounded-md border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider transition hover:border-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={14} />
            CSV
          </button>
        </div>
      </div>

      <div className="mt-6">
        <div
          className="my-6 relative z-10 mx-auto w-full rounded-xl overflow-hidden border border-white/20 shadow-[0_20px_80px_rgba(0,0,0,0.8)]"
          style={{
            backgroundImage: `radial-gradient(circle at 80% 96%, #851400ff, #140401ff 55%), linear-gradient(160deg, #050505 35%, #050505 70%, #020a0b 100%)`,
            backgroundSize: "cover",
            backgroundRepeat: "no-repeat",
          }}
        >
          <div className="overflow-x-auto w-full">
            <table className="mx-auto w-full border-collapse text-sm text-white">
              <thead className="bg-[#000000]/50 text-white/70 relative border-b border-white/20 text-xs uppercase tracking-wider">
                <tr className="border-b border-white/10 text-left text-[13px] font-semibold uppercase tracking-[0.35em] text-white/50">
                  <th className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Clock size={14} />
                      Time
                    </div>
                  </th>
                  <th className="px-6 py-4">Transaction</th>
                  <th className="px-6 py-4">From</th>
                  <th className="px-6 py-4">To</th>
                  <th className="px-6 py-4 text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredSwaps.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-12 text-center text-white/60"
                    >
                      <div className="flex flex-col items-center justify-center gap-2">
                        <p className="text-lg font-medium">
                          {selectedToken
                            ? `No activity found for ${
                                symbolMap[selectedToken] || selectedToken
                              }`
                            : "No activity found"}
                        </p>
                        {selectedToken && (
                          <button
                            onClick={() => setSelectedToken(null)}
                            className="mt-2 px-4 py-1.5 text-sm bg-[#32816E] rounded-md hover:bg-[#3a9a82] transition-colors"
                          >
                            Show all tokens
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  currentItems.map((swap, index) => {
                    const fromSymbol =
                      symbolMap[swap.offerDenom] || swap.offerDenom;
                    const toSymbol = symbolMap[swap.askDenom] || swap.askDenom;
                    const fromImage =
                      tokenImageMap[swap.offerDenom] || FALLBACK_TOKEN_IMAGE;
                    const toImage =
                      tokenImageMap[swap.askDenom] || FALLBACK_TOKEN_IMAGE;
                    const isBuy = swap.direction.toLowerCase() === "buy";

                    return (
                      <tr
                        key={`${swap.txHash}-${index}`}
                        className="border-b border-transparent transition hover:bg-white/5"
                      >
                        <td className="px-6 py-4 text-sm text-white/80">
                          {formatTimeAgo(swap.time)}
                        </td>
                        <td className="px-6 py-4">
                          <a
                            href={`https://zigscan.org/tx/${swap.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[#39C8A6] hover:underline text-sm"
                          >
                            View
                            <ArrowUpRight size={14} className="ml-1" />
                          </a>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full overflow-hidden bg-white/10 flex items-center justify-center">
                              <Image
                                src={fromImage}
                                alt={fromSymbol}
                                width={20}
                                height={20}
                                className="w-5 h-5 object-contain"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.src = FALLBACK_TOKEN_IMAGE;
                                }}
                              />
                            </div>
                            <span className="font-medium">
                              {formatNumber(swap.offerAmount)} {fromSymbol}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full overflow-hidden bg-white/10 flex items-center justify-center">
                              <Image
                                src={toImage}
                                alt={toSymbol}
                                width={20}
                                height={20}
                                className="w-5 h-5 object-contain"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.src = FALLBACK_TOKEN_IMAGE;
                                }}
                              />
                            </div>
                            <span className="font-medium">
                              {formatNumber(swap.returnAmount)} {toSymbol}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex flex-col items-end">
                            <span
                              className={`font-semibold ${
                                isBuy ? "text-green-400" : "text-red-400"
                              }`}
                            >
                              {isBuy ? "Bought" : "Sold"}
                            </span>
                            {/* <span className="text-xs text-white/60">${formatNumber(swap.valueUsd)}</span> */}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-6 py-3 text-[11px] uppercase tracking-[0.4em] text-white/60">
            <span>
              {selectedToken
                ? `Showing ${currentItems.length} of ${filteredSwaps.length} ${
                    symbolMap[selectedToken] || selectedToken
                  } swaps`
                : `Showing ${currentItems.length} of ${filteredSwaps.length} swaps`}{" "}
              (Page {currentPage} of {totalPages})
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                  setCurrentPage((p) => Math.max(1, p - 1));
                }}
                disabled={currentPage === 1 || loading}
                className={`px-3 py-1 rounded border border-white/10 ${
                  currentPage === 1 || loading
                    ? "opacity-30 cursor-not-allowed"
                    : "hover:bg-white/5"
                }`}
              >
                Previous
              </button>

              {/* Page numbers */}
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (pageNum) => (
                  <button
                    key={pageNum}
                    onClick={() => {
                      window.scrollTo({ top: 0, behavior: "smooth" });
                      setCurrentPage(pageNum);
                    }}
                    className={`px-2 py-1 rounded min-w-[32px] ${
                      currentPage === pageNum
                        ? "bg-[#32816E] text-white"
                        : "border border-white/10 hover:bg-white/5"
                    }`}
                  >
                    {pageNum}
                  </button>
                )
              )}

              <button
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                  setCurrentPage((p) => Math.min(totalPages, p + 1));
                }}
                disabled={currentPage >= totalPages || loading}
                className={`px-3 py-1 rounded border border-white/10 ${
                  currentPage >= totalPages || loading
                    ? "opacity-30 cursor-not-allowed"
                    : "hover:bg-white/5"
                }`}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
