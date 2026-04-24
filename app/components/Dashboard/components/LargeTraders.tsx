"use client";
import React, { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Clock, ExternalLink } from "lucide-react";
import { API_BASE_URL, API_HEADERS } from "@/lib/api";
import { extractArrayPayload, normalizeTrade } from "./data-normalizers";

// Utility function to format time ago
const timeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  const intervals = {
    y: 31536000,
    mo: 2592000,
    d: 86400,
    h: 3600,
    m: 60,
    s: 1,
  };

  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      return `${interval}${unit}`;
    }
  }
  return "now";
};

interface Trade {
  time: string;
  txHash: string;
  pairContract: string;
  signer: string;
  direction: "buy" | "sell";
  is_router?: boolean;
  offerDenom: string;
  offerAmount: number;
  askDenom: string;
  returnAmount: number;
  priceNative: number;
  priceUsd: number;
  valueNative: number;
  valueUsd: number;
  class: string;
}

const API_BASE = API_BASE_URL;
const LARGE_TRADES_TIMEFRAME = "60m";
const LARGE_TRADES_UNIT = "usd";
const itemsPerPage = 7;
const POLLING_BASE_INTERVAL_MS = 15000;
const POLLING_MAX_INTERVAL_MS = 120000;

const shortSigner = (address: string): string =>
  address ? `${address.slice(0, 4)}...${address.slice(-3)}` : "";

const LargeTradersTable: React.FC = () => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isFilterLoading, setIsFilterLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<"all" | "whale" | "shark" | "shrimp">("all");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalItems, setTotalItems] = useState<number>(0);
  const [symbolMap, setSymbolMap] = useState<Record<string, string>>({});
  const [tokenImageMap, setTokenImageMap] = useState<Record<string, string>>({});
  const [showNoTradesMessage, setShowNoTradesMessage] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const pollingRef = useRef<number | null>(null);
  const isFilterLoadingRef = useRef(false);
  const initialLoadRef = useRef(true);
  const nextIntervalRef = useRef(POLLING_BASE_INTERVAL_MS);
  const mountedRef = useRef(true);

  const fetchTrades = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const shouldShowLoading = isFilterLoadingRef.current || initialLoadRef.current;
    setLoading(shouldShowLoading);

    try {
      const url = `${API_BASE}/trades?tf=${LARGE_TRADES_TIMEFRAME}&unit=${LARGE_TRADES_UNIT}`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: API_HEADERS,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const rawTrades = extractArrayPayload(json);

      const normalizedTrades = rawTrades.map((trade: any) =>
        normalizeTrade(trade)
      );

      const filteredTrades =
        selectedClass === "all"
          ? normalizedTrades
          : normalizedTrades.filter((trade) => trade.class === selectedClass);

      const classPriority = { whale: 3, shark: 2, shrimp: 1 } as const;
      const getClassPriority = (value?: string) =>
        value === "whale" || value === "shark" || value === "shrimp"
          ? classPriority[value]
          : 0;

      const sortedTrades = [...filteredTrades].sort((a, b) => {
        const timeDiff = new Date(b.time).getTime() - new Date(a.time).getTime();
        if (timeDiff !== 0) return timeDiff;
        return getClassPriority(b.class) - getClassPriority(a.class);
      });

      const limitedTrades = sortedTrades.slice(0, itemsPerPage);
      setTrades(limitedTrades);
      setTotalItems(filteredTrades.length);
      setError(null);
      nextIntervalRef.current = POLLING_BASE_INTERVAL_MS;
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      nextIntervalRef.current = Math.min(
        POLLING_MAX_INTERVAL_MS,
        nextIntervalRef.current * 2
      );
      console.error("Error fetching trades:", err);
      setError(null);
      setTrades([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
      setIsFilterLoading(false);
      isFilterLoadingRef.current = false;
      if (initialLoadRef.current) {
        initialLoadRef.current = false;
      }
      if (!mountedRef.current) return;
      if (pollingRef.current) {
        window.clearTimeout(pollingRef.current);
      }
      pollingRef.current = window.setTimeout(() => {
        if (mountedRef.current) {
          fetchTrades();
        }
      }, nextIntervalRef.current);
    }
  }, [selectedClass, trades.length]);

  const handleFilterChange = (filter: "all" | "whale" | "shark" | "shrimp") => {
    setSelectedClass(filter);
    setCurrentPage(1);
    setIsFilterLoading(true);
    isFilterLoadingRef.current = true;
  };

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
        const items: Array<{ denom: string; symbol: string; imageUri?: string }> = json?.data ?? [];
        const map: Record<string, string> = {};
        const imageMap: Record<string, string> = {};

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
      } catch (error) {
        console.error("Failed to fetch token swap list:", error);
        if (!cancelled) {
          setSymbolMap({ uzig: "ZIG" });
          setTokenImageMap({ uzig: "/zigicon.png" });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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

  useEffect(() => {
    mountedRef.current = true;
    fetchTrades();

    return () => {
      mountedRef.current = false;
      if (pollingRef.current) {
        window.clearTimeout(pollingRef.current);
        pollingRef.current = null;
      }
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchTrades]);

  useEffect(() => {
    if (trades.length > 0) {
      setShowNoTradesMessage(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setShowNoTradesMessage(true);
    }, 5500);
    return () => {
      window.clearTimeout(timer);
    };
  }, [trades.length]);

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

  const getClassConfig = (classType: string) => {
    switch (classType) {
      case "whale":
        return { icon: "W", color: "#3B82F6", bgColor: "rgba(59, 130, 246, 0.15)" };
      case "shark":
        return { icon: "S", color: "#8B5CF6", bgColor: "rgba(139, 92, 246, 0.15)" };
      case "shrimp":
        return { icon: "s", color: "#10B981", bgColor: "rgba(16, 185, 129, 0.15)" };
      default:
        return { icon: "?", color: "#6B7280", bgColor: "rgba(107, 114, 128, 0.15)" };
    }
  };

  if (loading) {
    return (
      <div className="bg-black/30 rounded-lg pt-4 px-4 sm:px-6 min-h-[600px] relative border border-[#808080]/20 overflow-hidden">
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

  return (
    <div className="bg-black/40 backdrop-blur-sm rounded-2xl pt-5 sm:pt-6 px-3 sm:px-4 lg:px-5 xl:px-6 min-h-[420px] lg:min-h-[600px] xl:h-[600px] relative border border-white/10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 via-transparent to-emerald-500/5 pointer-events-none"></div>
      <div className="w-[800px] h-[400px] absolute z-[-10] bottom-[-20px] right-[-450px] rounded-xl bg-[radial-gradient(circle,_rgba(250,78,48,0.2)_0%,_rgba(250,78,48,0.3)_10%,_transparent_70%)] blur-2xl shadow-[0_0_40px_rgba(250,78,48,0.5)]"></div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] xl:flex xl:items-center xl:justify-between gap-3 items-start">
        <div className="flex items-center gap-3">
          <Image
            src="/fire.png"
            alt="Fire Icon"
            width={16}
            height={16}
            className="w-5 h-auto rounded-full object-cover"
          />
          <h2 className="text-[#EDEDED] w-auto text-xl sm:text-[24px] font-medium leading-none">
            Large Traders
          </h2>
        </div>

        {/* Class filter buttons */}
        <div className="flex flex-wrap justify-start lg:justify-end xl:justify-end gap-2 text-[11px] sm:text-xs font-normal mt-1 w-full lg:w-auto max-w-full">
          {[
            { id: "all", label: " All", color: "#FF6F00", labelIcon: ">" },
            { id: "shrimp", label: " 1000", color: "#FF6F00", labelIcon: "<" },
            { id: "shark", label: " 10000", color: "#FF6F00", labelIcon: "<" },
            { id: "whale", label: " 10000", color: "#FF6F00", labelIcon: ">" },
          ].map(({ id, label, color, labelIcon }) => (
            <button
              key={id}
              onClick={() => handleFilterChange(id as any)}
              className={`py-1.5 sm:py-1 rounded-lg flex items-center transition-all duration-200 min-w-[60px] ${
                selectedClass === id
                  ? "opacity-100"
                  : "opacity-60 hover:opacity-100"
              }`}
            >
              <div className="bg-[#202020] px-2 py-1 rounded-lg flex items-center">
                <div
                  className="w-2 h-2 ml-[-10px] rounded-sm"
                  style={{
                    backgroundColor:
                      selectedClass === id ? color : "transparent",
                    border: `1px solid ${color}`,
                  }}
                ></div>
                <span className="ml-2">
                  {labelIcon}
                  {label}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Gradient Divider */}
      <div className="absolute left-3 sm:left-6 right-3 sm:right-6 h-[2px] bg-gradient-to-r from-[#FA4E30] via-[#FFA500] to-[#39C8A6] opacity-60 rounded-full"></div>

      {/* Error state */}
      {error && (
        <div className="text-red-400 text-center py-8 text-sm bg-red-500/10 rounded-xl border border-red-500/20 mt-8">
          {error}
        </div>
      )}

      {trades.length === 0 && !loading ? (
        <div className="mt-8 bg-white/5 rounded-xl border border-white/10 min-h-[450px] flex items-center justify-center">
          {showNoTradesMessage ? (
            <div className="text-center px-6">
              <div className="text-4xl mb-4">📊</div>
              <p className="text-white/80 text-lg font-medium">No trades found</p>
              <p className="text-white/50 text-sm mt-2">
                We're monitoring the network—check back soon
              </p>
            </div>
          ) : (
            <div className="space-y-3 w-full px-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse"></div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Enhanced Table */
        <div className="mt-4 overflow-x-auto pb-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10">
          <table className="w-full min-w-[680px] md:min-w-[720px] lg:min-w-[760px] xl:min-w-0 border-collapse">
          <thead>
            <tr className="text-left text-white/60 text-xs sm:text-sm ">
                <th className="pb-1 pl-2 pr-2 w-[52px]">
                  <Clock className="w-4 h-4 text-[#919191]" />
                </th>
                <th className="pb-1 px-3 text-[#919191] text-[11px] xl:text-xs font-medium uppercase tracking-wider w-[118px] xl:w-[132px]">
                  Signer
                </th>
                <th className="pb-1 px-3 text-center text-[#919191] text-[11px] xl:text-xs font-medium uppercase tracking-wider w-[86px]">
                  Type
                </th>
                <th className="pb-1 px-2 text-center text-[#919191] text-[11px] xl:text-xs font-medium uppercase tracking-wider w-[54px]">
                  {/* Class */}
                </th>
                <th className="pb-1 pl-4 pr-3 text-left text-[#919191] text-[11px] xl:text-xs font-medium uppercase tracking-wider">
                  Amount
                </th>
                <th className="pb-1 text-center text-[#919191] text-[11px] xl:text-xs font-medium uppercase tracking-wider w-[46px]">
                  View
                </th>
            </tr>
          </thead>
            <tbody className="divide-y divide-white/15">
              {trades.map((trade, index) => {
                const classConfig = getClassConfig(trade.class);
                
                return (
                  <tr
                    key={trade.txHash + index}
                    className={`group relative transition-all duration-300 hover:bg-white/5 `}
                  >
                    
                    {/* Time */}
                    <td className="py-2 pl-2 pr-2 relative z-10">
                      <span className="text-white/60 text-xs xl:text-sm font-mono tabular-nums">
                        {timeAgo(trade.time)}
                      </span>
                    </td>

                    {/* Signer */}
                    <td className="py-2 px-3 relative z-10">
                      <Link
                        href={`https://zigscan.org/address/${trade.signer}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 text-white hover:text-[#93C5FD] transition-colors font-mono text-xs xl:text-sm group/link"
                      >
                        <span className="group-hover/link:underline">
                          {shortSigner(trade.signer)}
                        </span>
                        <ExternalLink className="w-3 h-3 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                      </Link>
                    </td>

                    {/* Direction Badge */}
                    <td className="py-2 px-3 relative z-10">
                      <div className="flex justify-center">
                        <span
                          className={`inline-flex items-center px-2.5 xl:px-3 py-1 rounded-full text-[11px] xl:text-xs font-bold tracking-wide border ${
                            trade.direction === "buy"
                              ? "text-[#20D87C] border-[#20D87C]/30 bg-[#20D87C]/10"
                              : "text-[#F64F39] border-[#F64F39]/30 bg-[#F64F39]/10"
                          }`}
                        >
                          {trade.direction.toUpperCase()}
                        </span>
                      </div>
                    </td>

                    {/* Class Indicator */}
                    <td className="py-2 px-2 relative z-10">
                      <div className="flex justify-center">
                        {trade.class === "whale" && (
                          <span className="flex items-center gap-1 bg-blue-500/20 px-2 py-0.5 rounded text-blue-300 text-xs">
                            🐋
                          </span>
                        )}
                        {trade.class === "shark" && (
                          <span className="flex items-center gap-1 bg-purple-500/20 px-2 py-0.5 rounded text-purple-300 text-xs">
                            🦈
                          </span>
                        )}
                        {trade.class === "shrimp" && (
                          <span className="flex items-center gap-1 bg-yellow-500/20 px-2 py-0.5 rounded text-green-300 text-xs">
                            🦐
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Amount - Stacked Layout */}
                    <td className="py-2 pl-4 pr-3 relative z-10">

                      <div className="flex flex-col gap-1.5 min-w-0">
                        {/* Received */}

                        <div className="flex items-center gap-2 min-w-0">

                          <div className="relative shrink-0 flex-none w-[18px] h-[18px]">
                            <Image
                              src={getTokenIcon(trade.askDenom)}
                              alt="Token"
                              width={18}
                              height={18}
                              className="w-[18px] h-[18px] rounded-full ring-2 ring-black object-cover shrink-0"
                              unoptimized
                            />
                            <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-[#20D87C] rounded-full border-2 border-black"></div>
                          </div>
                          <span className="text-[#20D87C] font-semibold text-xs xl:text-sm tabular-nums tracking-tight whitespace-nowrap shrink-0">
                            +{compact2(trade.returnAmount)} {symbolFor(trade.askDenom)}
                          </span>
                        </div>
                        
                        {/* Sent */}
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="relative shrink-0 flex-none w-[18px] h-[18px]">
                            <Image
                              src={getTokenIcon(trade.offerDenom)}
                              alt="Token"
                              width={18}
                              height={18}
                              className="w-[18px] h-[18px] rounded-full ring-2 ring-black opacity-70 object-cover shrink-0"
                              unoptimized
                            />
                            <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-[#F64F39] rounded-full border-2 border-black"></div>
                          </div>
                          <span className="text-[#F64F39] font-medium text-xs xl:text-sm tabular-nums tracking-tight opacity-80 whitespace-nowrap shrink-0">
                            -{compact2(trade.offerAmount)} {symbolFor(trade.offerDenom)}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="py-2 relative z-10">
                      <div className="flex justify-center">
                        <Link
                          href={`https://zigscan.org/tx/${trade.txHash}`}
                          target="_blank"
                          className="p-2 rounded-lg hover:bg-white/10 transition-colors group/btn"
                          title="View on Explorer"
                        >
                          <ExternalLink className="w-4 h-4 text-white/40 group-hover/btn:text-white/80 transition-colors" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Loading Overlay */}
      {isFilterLoading && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 rounded-2xl">
          <div className="relative">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-orange-500/30 border-t-orange-500"></div>
            <div className="absolute inset-0 animate-ping rounded-full h-10 w-10 border border-orange-500/20 opacity-20"></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LargeTradersTable;
