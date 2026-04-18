"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronFirst, ChevronRight } from "lucide-react";
import { API_BASE_URL, API_HEADERS } from "@/lib/api";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  API_BASE_URL ||
  "";
const MAX_TRADES = 15;
const MAX_LIMIT = 40;
const TOP_TRADES_CACHE_TTL = 30_000;
const topTradesCache: Record<
  string,
  { trades: Trade[]; timestamp: number; lastUpdated: Date }
> = {};

interface Trade {
  time: string;
  txHash: string;
  direction: "buy" | "sell" | "provide" | "withdraw";
  offerDenom: string;
  offerAmount: number;
  askDenom: string;
  returnAmount: number;
  priceUsd?: number;
  valueUsd: number;
  signer: string;
  pairContract: string;
  class?: string;
}

interface TopTradesProps {
  tokenId?: string;
}

export default function TopTrades({ tokenId }: TopTradesProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [symbolMap, setSymbolMap] = useState<Record<string, string>>({});
  const [tokenImageMap, setTokenImageMap] = useState<Record<string, string>>({});

  // Fetch swap-list once to build denom->symbol map and image map
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/tokens/swap-list?q=zig&bucket=24h&unit=usd`,
          { headers: API_HEADERS }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const items: Array<{
          denom: string;
          symbol: string;
          imageUri?: string;
        }> = json?.data ?? [];
        const map: Record<string, string> = {};
        const imageMap: Record<string, string> = {};

        // Always include ZIG
        map["uzig"] = "ZIG";
        imageMap["uzig"] = "/zigicon.png";

        for (const it of items) {
          if (it?.denom && it?.symbol) {
            map[it.denom] = it.symbol;
            if (it.imageUri) {
              imageMap[it.denom] = it.imageUri;
            }
          }
        }
        if (!cancelled) {
          setSymbolMap(map);
          setTokenImageMap(imageMap);
        }
      } catch {
        // If it fails, we still fall back to parsing the denom
        setSymbolMap({ uzig: "ZIG" });
        setTokenImageMap({ uzig: "/zigicon.png" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Helper: return display symbol for a denom using map; fallback to last segment uppercase
  const symbolFor = (denom?: string): string => {
    if (!denom) return "";
    if (denom === "uzig" || denom.includes("uzig")) return "ZIG";
    const found = symbolMap[denom];
    if (found) return found;
    const parts = denom.split(".");
    const last = parts[parts.length - 1] || denom;
    return last.toUpperCase();
  };

  const getTokenIcon = (denom?: string): string => {
    if (!denom) return "/zigicon.png";
    const found = tokenImageMap[denom];
    if (found) return found;
    return "/zigicon.png";
  };

  const getClassEmoji = (tradeClass?: string) => {
    switch (tradeClass) {
      case "whale":
        return "🐋";
      case "shark":
        return "🦈";
      case "shrimp":
        return "🦐";
      default:
        return "";
    }
  };

  // Compact formatter: K / M / B / T with exactly 2 decimals.
  const compact2 = (n?: number): string => {
    if (n == null || !Number.isFinite(n)) return "—";
    const r2 = (x: number) => Number(x.toFixed(2));

    const tryUnit = (scale: number, unit: "K" | "M" | "B" | "T") => {
      const v = r2(n / scale);
      return Math.abs(v) >= 1 ? `${v.toFixed(2)}${unit}` : null;
    };

    return (
      tryUnit(1e12, "T") ??
      tryUnit(1e9, "B") ??
      tryUnit(1e6, "M") ??
      tryUnit(1e3, "K") ??
      new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(r2(n))
    );
  };

  const fetchTopTrades = async (isPolling = false) => {
    if (!tokenId) return;

    const cacheEntry = topTradesCache[tokenId];
    const hasFreshCache =
      cacheEntry && Date.now() - cacheEntry.timestamp < TOP_TRADES_CACHE_TTL;

    if (hasFreshCache) {
      setTrades(cacheEntry.trades);
      setLastUpdated(cacheEntry.lastUpdated);
      if (!isPolling) setLoading(false);
      // Still refresh in background to keep cache warm
    } else if (!isPolling) {
      setLoading(true);
    }

    try {
      const now = new Date();
      const sevenDaysAgo = new Date(
        now.getTime() - 7 * 24 * 60 * 60 * 1000
      );
      const res = await fetch(
        `${API_BASE}/trades/token/${encodeURIComponent(
          tokenId
        )}?unit=zig&limit=${MAX_LIMIT}&startTime=${sevenDaysAgo.toISOString()}&endTime=${now.toISOString()}&tf=7d&sort=valueUsd:desc`,
        { cache: "no-store", headers: API_HEADERS }
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      if (json?.success && Array.isArray(json.data)) {
        const getClassPriority = (tradeClass?: string) => {
          switch (tradeClass) {
            case "whale":
              return 1;
            case "shark":
              return 2;
            case "shrimp":
              return 3;
            default:
              return 4;
          }
        };

        const topTrades = json.data
          .sort((a: Trade, b: Trade) => {
            const classPriorityA = getClassPriority(a.class);
            const classPriorityB = getClassPriority(b.class);

            if (classPriorityA !== classPriorityB) {
              return classPriorityA - classPriorityB;
            }

            const valueA = a.valueUsd || 0;
            const valueB = b.valueUsd || 0;
            return valueB - valueA;
          })
          .slice(0, MAX_TRADES);

        const timestamp = Date.now();
        const lastUpdatedDate = new Date(timestamp);
        topTradesCache[tokenId] = {
          trades: topTrades,
          timestamp,
          lastUpdated: lastUpdatedDate,
        };

        setTrades(topTrades);
        setLastUpdated(lastUpdatedDate);
      } else {
        setTrades([]);
      }
    } catch (err) {
      console.error("Failed to fetch top trades:", err);
      if (!isPolling) setTrades([]);
    } finally {
      if (!isPolling) setLoading(false);
    }
  };

  // Initial fetch and set up polling
  useEffect(() => {
    fetchTopTrades();

    const intervalId = setInterval(() => {
      fetchTopTrades(true);
    }, 10000); // Refresh every 10 seconds

    return () => clearInterval(intervalId);
  }, [tokenId]);

  const handleReload = () => {
    fetchTopTrades();
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400)
      return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return date.toLocaleDateString();
  };

  const formatPrice = (price?: number) => {
    if (price === undefined) return "—";
    if (price < 0.0001) return price.toExponential(4);
    return price.toFixed(8).replace(/\.?0+$/, "");
  };

  if (!tokenId) {
    return (
      <div className="bg-black/50 border border-gray-700 rounded-lg p-6 text-center text-gray-400">
        No pool selected
      </div>
    );
  }

  return (
    <div
      className="border-b border-x border-[#808080]/20 rounded-b-lg overflow-hidden shadow-md w-full"
      style={{
        backgroundImage: `linear-gradient(120deg,#000000 65%,#14624F 100%)`,
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm sm:text-[0.95rem] text-white">
          <thead className="bg-black/60 text-white uppercase text-xs tracking-wider">
            <tr>
              <td className="px-4 py-2 text-left text-gray-400">Time</td>
              <td className="px-4 py-2 text-left text-gray-400">Type</td>
              <td className="px-4 py-2 text-left text-gray-400">Price</td>
              <td className="px-4 py-2 text-left text-gray-400">Amount</td>
              <td className="px-4 py-2 text-left text-gray-400">Value (USD)</td>
              <td className="px-4 py-2 text-left text-gray-400">TX HASH</td>
              <td className="px-4 py-2 text-left text-gray-400">ACTION</td>
            </tr>
          </thead>
          <tbody className="bg-black/60 divide-y divide-gray-800">
            {loading ? (
              [...Array(10)].map((_, i) => (
                <tr key={i} className="border-b border-gray-800 animate-pulse">
                  <td className="px-3 sm:px-4 py-3">
                    <div className="h-4 bg-gray-700 rounded w-16" />
                  </td>
                  <td className="px-3 sm:px-4 py-3">
                    <div className="h-4 bg-gray-700 rounded w-16" />
                  </td>
                  <td className="px-3 sm:px-4 py-3">
                    <div className="h-4 bg-gray-700 rounded w-16" />
                  </td>
                  <td className="px-3 sm:px-4 py-3">
                    <div className="h-4 bg-gray-700 rounded w-16" />
                  </td>
                  <td className="px-3 sm:px-4 py-3">
                    <div className="h-4 bg-gray-700 rounded w-16" />
                  </td>
                  <td className="px-3 sm:px-4 py-3">
                    <div className="h-4 bg-gray-700 rounded w-16" />
                  </td>
                  <td className="px-3 sm:px-4 py-3">
                    <div className="h-4 bg-gray-700 rounded w-16" />
                  </td>
                </tr>
              ))
            ) : trades.length > 0 ? (
              trades.map((trade, index) => (
                <tr
                  key={`${trade.txHash}-${index}`}
                  className={`hover:bg-black/50`}
                >
                  <td className="px-4 py-2 text-gray-400">
                    {formatTimeAgo(trade.time)}
                  </td>
                  <td
                    className={`px-4 py-2 text-left font-medium ${
                      trade.direction === "buy"
                        ? "text-green-400"
                        : "text-red-400"
                    }`}
                  >
                    {trade.direction.charAt(0).toUpperCase() +
                      trade.direction.slice(1)}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`${
                        trade.direction === "buy"
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      ${trade.priceUsd?.toFixed(5) || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1">
                          <Image
                            src={getTokenIcon(trade.askDenom)}
                            alt="Token"
                            width={16}
                            height={16}
                            className="w-4 h-4 rounded-full"
                            unoptimized
                          />
                          <span className="text-[#20D87C] whitespace-nowrap">
                            +{compact2(trade.returnAmount)}{" "}
                            {symbolFor(trade.askDenom)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Image
                            src={getTokenIcon(trade.offerDenom)}
                            alt="Token"
                            width={16}
                            height={16}
                            className="w-4 h-4 rounded-full"
                            unoptimized
                          />
                          <span className="text-[#F64F39] whitespace-nowrap">
                            -{compact2(trade.offerAmount)}{" "}
                            {symbolFor(trade.offerDenom)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-2 text-left">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center justify-center w-6 ${
                          trade.class === "whale"
                            ? "text-blue-500"
                            : trade.class === "shark"
                            ? "text-red-500"
                            : trade.class === "shrimp"
                            ? "text-yellow-500"
                            : "text-gray-500"
                        }`}
                      >
                        {getClassEmoji(trade.class)}
                      </span>
                      ${trade.valueUsd?.toLocaleString() || "0.00"}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-left">
                    <Link
                      href={`https://zigscan.org/tx/${trade.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-400 hover:underline text-sm"
                      title="View on ZigScan"
                    >
                      {trade.txHash.slice(0, 9)}...
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-left">
                    <Link
                      href={`https://zigscan.org/tx/${trade.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline text-sm"
                      title="View on ZigScan"
                    >
                      🔗
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  No trades found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
