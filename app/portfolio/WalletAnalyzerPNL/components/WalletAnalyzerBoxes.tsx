"use client";

import React from "react";
import { useChain } from "@cosmos-kit/react";
import { CHAIN_NAME } from "../../../config/chain";
import { API_BASE_URL, API_HEADERS } from "@/lib/api";
import ValidatorsDelegationsPanel from "./ValidatorsDelegationsPanel";
import {
  Bar,
  BarChart,
  Line,
  ComposedChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";

export const analyzerTabs = [
  { id: "trading", label: "Trading PNL" },
  { id: "portfolio", label: "Portfolio" },
  { id: "activities", label: "Activities" },
  // { id: "defi", label: "DeFi" },
] as const;

export type AnalyzerTabId = (typeof analyzerTabs)[number]["id"];
export type TradingTimeframe = "24h" | "7d" | "10d" | "1M";

const defiOptions = [
  { id: "valdaro", label: "Valdaro", locked: true },
  { id: "permapod", label: "Permapod", locked: true },
  { id: "nawa", label: "Nawa Finance", locked: true },
  { id: "validators", label: "Validators", locked: false },
] as const;

type DefiOptionId = (typeof defiOptions)[number]["id"];

const timeframeOptions: TradingTimeframe[] = ["24h", "7d", "10d", "1M"];
const timeframeToWin: Record<TradingTimeframe, string> = {
  "24h": "24h",
  "7d": "7d",
  "10d": "10d",
  "1M": "30d",
};

const normalizeWalletApiBase = (value?: string) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed || /undefined|null/i.test(trimmed)) return API_BASE_URL;
  return trimmed;
};

type PnlTokenItem = {
  last_active?: string;
  token_balance?: string;
  position_value_usd?: string;
  realized_pnl_usd?: string;
  unrealized_pnl_usd?: string;
  total_pnl_usd?: string;
  bought_usd?: string;
  sold_usd?: string;
  net_usd?: string;
  avg_buy_price_usd?: string;
  avg_sell_price_usd?: string;
  txs_buy?: number;
  txs_sell?: number;
  hold_duration_sec?: number | string;
};

type WalletAnalyzerBoxesProps = {
  activeTab: AnalyzerTabId;
  onTabChange: (tab: AnalyzerTabId) => void;
  addressOverride?: string;
  timeframe: TradingTimeframe;
  onTimeframeChange: (timeframe: TradingTimeframe) => void;
};

export default function WalletAnalyzer({
  activeTab,
  onTabChange,
  addressOverride,
  timeframe,
  onTimeframeChange,
}: WalletAnalyzerBoxesProps) {
  const showTradingDetails = activeTab === "trading";
  const [isDefiDrawerOpen, setIsDefiDrawerOpen] = React.useState(false);
  const [activeDefiOption, setActiveDefiOption] =
    React.useState<DefiOptionId>("validators");
  const { address: connectedAddress } = useChain(CHAIN_NAME || "zigchain-1");
  const address = addressOverride?.trim() || connectedAddress;
  const apiEndpoints = React.useMemo(
    () => [normalizeWalletApiBase(process.env.NEXT_PUBLIC_WALLET_HOLDINGS_API)],
    []
  );
  const [distribution, setDistribution] = React.useState<
    { label: string; count: number }[]
  >([]);
  const [distributionLoading, setDistributionLoading] = React.useState(false);
  const [distributionError, setDistributionError] = React.useState<
    string | null
  >(null);
  const [pnlTokens, setPnlTokens] = React.useState<PnlTokenItem[]>([]);
  const [pnlLoading, setPnlLoading] = React.useState(false);
  const [pnlError, setPnlError] = React.useState<string | null>(null);
  // Inside export default function WalletAnalyzer(...) {

  // Inside export default function WalletAnalyzer(...)
  const [portfolioSeries, setPortfolioSeries] = React.useState<{
    points: Array<{ t: string; value_usd: number }>;
    loading: boolean;
    error: string | null;
  }>({ points: [], loading: false, error: null });

  // Inside WalletAnalyzer component
  React.useEffect(() => {
    // We remove the activeTab check so it fetches whenever a new wallet is searched
    if (!address) {
      setPortfolioSeries({ points: [], loading: false, error: null });
      return;
    }

    const controller = new AbortController();
    let active = true;

    const loadPortfolioSeries = async () => {
      setPortfolioSeries((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const win = timeframeToWin[timeframe];
        const response = await fetchFromEndpoints(
          apiEndpoints,
          `wallets/${encodeURIComponent(
            address
          )}/portfolio/value-series?win=${encodeURIComponent(win)}&tf=1h`,
          {
            signal: controller.signal,
            headers: { Accept: "application/json" },
            cache: "no-store",
          },
          "portfolio series"
        );

        if (active) {
          setPortfolioSeries({
            points: response.points || [],
            loading: false,
            error: null,
          });
        }
      } catch (err) {
        if (!active) return;
        setPortfolioSeries({
          points: [],
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load",
        });
      }
    };

    loadPortfolioSeries();

    return () => {
      active = false;
      controller.abort();
    };
  }, [address, timeframe, apiEndpoints]); // address is the primary trigger here
  // PNL Summary state
  const [pnlSummary, setPnlSummary] = React.useState<{
    totalPnl: number;
    winCount: number;
    lossCount: number;
    winRate: number;
  }>({ totalPnl: 0, winCount: 0, lossCount: 0, winRate: 0 });

  // PNL Series state
  const [pnlSeries, setPnlSeries] = React.useState<{
    points: Array<{
      t: string;
      realized_pnl_usd: number;
      total_pnl_usd: number;
      pnl: number;
    }>;
    loading: boolean;
    error: string | null;
  }>({ points: [], loading: false, error: null });

  // React.useEffect(() => {
  //   if (activeTab !== "defi" && isDefiDrawerOpen) {
  //     setIsDefiDrawerOpen(false);
  //   }
  // }, [activeTab, isDefiDrawerOpen]);

  // React.useEffect(() => {
  //   if (activeTab === "defi") {
  //     setIsDefiDrawerOpen(true);
  //     setActiveDefiOption("validators");
  //   } else {
  //     setIsDefiDrawerOpen(false);
  //   }
  // }, [activeTab]);

  const safeNumber = (value: unknown): number => {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  const buildUrl = (base: string, path: string) => {
    const normalizedBase = base.replace(/\/+$/, "");
    const normalizedPath = path.replace(/^\/+/, "");
    return `${normalizedBase}/${normalizedPath}`;
  };

  const fetchFromEndpoints = async (
    endpoints: string[],
    path: string,
    init: RequestInit = {},
    label: string
  ) => {
    let lastError: string | null = null;
    for (const endpoint of endpoints) {
      try {
        const url = buildUrl(endpoint, path);
        const headers = new Headers(init.headers || undefined);
        const apiHeaders = new Headers(API_HEADERS || undefined);
        apiHeaders.forEach((value, key) => headers.set(key, value));
        const res = await fetch(url, {
          ...init,
          headers,
        });
        if (res.ok) {
          return res.json();
        }
        lastError = `HTTP ${res.status} ${res.statusText}`;
      } catch (err) {
        lastError =
          err instanceof Error
            ? err.message
            : typeof err === "string"
            ? err
            : "request failed";
      }
    }
    throw new Error(
      lastError
        ? `Unable to load ${label} (${lastError})`
        : `Unable to load ${label}`
    );
  };

  // Calculate PNL summary from series data
  const updatePnlSummary = (points: Array<{ pnl: number }>) => {
    const summary = points.reduce(
      (acc, point) => {
        const pnl = point.pnl || 0;
        if (pnl > 0) acc.winCount++;
        if (pnl < 0) acc.lossCount++;
        acc.totalPnl += pnl;
        return acc;
      },
      { totalPnl: 0, winCount: 0, lossCount: 0 }
    );

    const totalTrades = summary.winCount + summary.lossCount;
    const winRate =
      totalTrades > 0 ? (summary.winCount / totalTrades) * 100 : 0;

    setPnlSummary({
      totalPnl: summary.totalPnl,
      winCount: summary.winCount,
      lossCount: summary.lossCount,
      winRate: parseFloat(winRate.toFixed(2)),
    });
  };

  // Fetch PNL series data
  React.useEffect(() => {
    if (!showTradingDetails || !address) {
      setPnlSeries({ points: [], loading: false, error: null });
      setPnlSummary({ totalPnl: 0, winCount: 0, lossCount: 0, winRate: 0 });
      return;
    }

    const controller = new AbortController();
    let active = true;

    const loadPnlSeries = async () => {
      setPnlSeries((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const win = timeframeToWin[timeframe];
        const response = (await fetchFromEndpoints(
          apiEndpoints,
          `wallets/${encodeURIComponent(
            address
          )}/pnl/series?win=${encodeURIComponent(win)}&tf=1d`,
          {
            cache: "no-store",
            signal: controller.signal,
            headers: { Accept: "application/json" },
          },
          "pnl series"
        )) as {
          points: Array<{
            t: string;
            realized_pnl_usd: number;
            total_pnl_usd: number;
          }>;
          win: string;
          tf: string;
          unrealized_pnl_usd: number;
        };

        if (!active) return;

        // Process points to calculate daily PNL changes
        let prevTotal = 0;
        const processedPoints = (response.points || []).map((point, index) => {
          const currentTotal = Number(point.total_pnl_usd) || 0;
          // For the first point, use the total as is
          // For subsequent points, calculate the difference from previous total
          const dailyChange =
            index === 0 ? currentTotal : currentTotal - prevTotal;
          prevTotal = currentTotal;

          return {
            ...point,
            pnl: dailyChange,
          };
        });

        setPnlSeries({
          points: processedPoints,
          loading: false,
          error: null,
        });
        updatePnlSummary(processedPoints);
      } catch (err) {
        if (!active) return;
        const message =
          err instanceof Error ? err.message : "Failed to load PNL series";
        setPnlSeries({
          points: [],
          loading: false,
          error: message,
        });
      }
    };

    loadPnlSeries();

    return () => {
      active = false;
      controller.abort();
    };
  }, [address, apiEndpoints, showTradingDetails, timeframe]);

  React.useEffect(() => {
    if (!showTradingDetails) return;
    if (!address) {
      setPnlTokens([]);
      setPnlError(null);
      setPnlLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;

    const loadPnlTokens = async () => {
      setPnlLoading(true);
      setPnlError(null);
      setPnlTokens([]);

      try {
        const win = timeframeToWin[timeframe];
        const payload = await fetchFromEndpoints(
          apiEndpoints,
          `wallets/${encodeURIComponent(
            address
          )}/pnl/tokens?win=${encodeURIComponent(
            win
          )}&sort=total_pnl_desc&limit=100`,
          {
            cache: "no-store",
            signal: controller.signal,
            headers: { Accept: "application/json" },
          },
          "pnl tokens"
        );

        const items = Array.isArray(payload?.items) ? payload.items : [];
        if (!active) return;
        setPnlTokens(items);
      } catch (err) {
        if (!active) return;
        const message =
          err instanceof Error ? err.message : "Failed to load pnl tokens";
        setPnlError(message);
      } finally {
        if (active) {
          setPnlLoading(false);
        }
      }
    };

    loadPnlTokens();

    return () => {
      active = false;
      controller.abort();
    };
  }, [address, apiEndpoints, showTradingDetails, timeframe]);

  React.useEffect(() => {
    if (!showTradingDetails) return;
    if (!address) {
      setDistribution([]);
      setDistributionError(null);
      setDistributionLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;

    const loadDistribution = async () => {
      setDistributionLoading(true);
      setDistributionError(null);
      setDistribution([]);

      try {
        const win = timeframeToWin[timeframe];
        const payload = await fetchFromEndpoints(
          apiEndpoints,
          `wallets/${encodeURIComponent(
            address
          )}/pnl/distribution?win=${encodeURIComponent(win)}`,
          {
            cache: "no-store",
            signal: controller.signal,
            headers: { Accept: "application/json" },
          },
          "pnl distribution"
        );

        const buckets = Array.isArray(payload?.buckets) ? payload.buckets : [];
        const prepared = buckets.map((bucket: any) => ({
          label: typeof bucket?.label === "string" ? bucket.label : "N/A",
          count: safeNumber(bucket?.count),
        }));

        if (!active) return;
        setDistribution(prepared);
      } catch (err) {
        if (!active) return;
        const message =
          err instanceof Error ? err.message : "Failed to load distribution";
        setDistributionError(message);
      } finally {
        if (active) {
          setDistributionLoading(false);
        }
      }
    };

    loadDistribution();

    return () => {
      active = false;
      controller.abort();
    };
  }, [address, apiEndpoints, showTradingDetails, timeframe]);

  const distributionTotal = distribution.reduce(
    (sum, bucket) => sum + bucket.count,
    0
  );

  const formatPercent = (value: number) => {
    if (!Number.isFinite(value) || distributionTotal === 0) return "0%";
    return `${value.toFixed(2)}%`;
  };

  const formatPercentValue = (value: number) => {
    if (!Number.isFinite(value)) return "0%";
    return `${value.toFixed(2)}%`;
  };

  const formatCurrencyCompact = (value: number) => {
    if (!Number.isFinite(value)) return "N/A";
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatSignedCurrency = (value: number) => {
    if (!Number.isFinite(value)) return "N/A";
    if (value === 0) return formatCurrencyCompact(value);
    const prefix = value > 0 ? "+" : "-";
    return `${prefix}${formatCurrencyCompact(Math.abs(value))}`;
  };

  const formatCurrencySmart = (value: number) => {
    if (!Number.isFinite(value)) return "N/A";
    if (Math.abs(value) >= 1000) return formatCurrencyCompact(value);
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 6,
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatNumberCompact = (value: number) => {
    if (!Number.isFinite(value)) return "0";
    return new Intl.NumberFormat(undefined, {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatHoldMinutes = (seconds: number, totalCount: number) => {
    if (!Number.isFinite(seconds) || totalCount <= 0) return "0m";
    const minutes = Math.round(seconds / 60 / totalCount);
    return `${minutes}m`;
  };

  const totals = React.useMemo(() => {
    const stats = {
      count: pnlTokens.length,
      bought: 0,
      sold: 0,
      realized: 0,
      unrealized: 0,
      total: 0,
      txsBuy: 0,
      txsSell: 0,
      holdSeconds: 0,
      avgBuySum: 0,
      avgBuyCount: 0,
      avgWinBuySum: 0,
      avgWinBuyCount: 0,
      avgLossBuySum: 0,
      avgLossBuyCount: 0,
      wins: 0,
      soldGreater: 0,
      didntBuy: 0,
      instantSell: 0,
    };

    pnlTokens.forEach((item) => {
      const bought = safeNumber(item.bought_usd);
      const sold = safeNumber(item.sold_usd);
      const realized = safeNumber(item.realized_pnl_usd);
      const unrealized = safeNumber(item.unrealized_pnl_usd);
      const total = safeNumber(item.total_pnl_usd);
      const avgBuy = safeNumber(item.avg_buy_price_usd);
      const holdSeconds = safeNumber(item.hold_duration_sec);
      const txsBuy = safeNumber(item.txs_buy);
      const txsSell = safeNumber(item.txs_sell);

      stats.bought += bought;
      stats.sold += sold;
      stats.realized += realized;
      stats.unrealized += unrealized;
      stats.total += total;
      stats.txsBuy += txsBuy;
      stats.txsSell += txsSell;
      if (Number.isFinite(holdSeconds)) {
        stats.holdSeconds += holdSeconds;
      }
      if (avgBuy > 0) {
        stats.avgBuySum += avgBuy;
        stats.avgBuyCount += 1;
      }
      if (total > 0) {
        stats.wins += 1;
        if (avgBuy > 0) {
          stats.avgWinBuySum += avgBuy;
          stats.avgWinBuyCount += 1;
        }
      } else if (total < 0 && avgBuy > 0) {
        stats.avgLossBuySum += avgBuy;
        stats.avgLossBuyCount += 1;
      }
      if (sold > bought) {
        stats.soldGreater += 1;
      }
      if (bought === 0) {
        stats.didntBuy += 1;
      }
      if (sold > 0 && holdSeconds > 0 && holdSeconds <= 60) {
        stats.instantSell += 1;
      }
    });

    return stats;
  }, [pnlTokens]);

  const winRate = totals.count ? (totals.wins / totals.count) * 100 : 0;
  const realizedPercent = totals.bought
    ? (totals.realized / Math.abs(totals.bought)) * 100
    : 0;
  const avgCost = totals.avgBuyCount
    ? totals.avgBuySum / totals.avgBuyCount
    : 0;
  const avgWinCost = totals.avgWinBuyCount
    ? totals.avgWinBuySum / totals.avgWinBuyCount
    : 0;
  const avgLossCost = totals.avgLossBuyCount
    ? totals.avgLossBuySum / totals.avgLossBuyCount
    : 0;

  const isPnlLoadingEmpty = pnlLoading && !pnlTokens.length;
  const isPnlErrorEmpty = Boolean(pnlError && !pnlTokens.length);
  const winRateDisplay = isPnlLoadingEmpty
    ? "Loading..."
    : isPnlErrorEmpty
    ? "N/A"
    : formatPercentValue(winRate);
  const realizedDisplay = isPnlLoadingEmpty
    ? "Loading..."
    : isPnlErrorEmpty
    ? "N/A"
    : formatSignedCurrency(totals.realized);
  const totalPnlDisplay = isPnlLoadingEmpty
    ? "Loading..."
    : isPnlErrorEmpty
    ? "N/A"
    : formatSignedCurrency(totals.total);
  const unrealizedDisplay = isPnlLoadingEmpty
    ? "Loading..."
    : isPnlErrorEmpty
    ? "N/A"
    : formatSignedCurrency(totals.unrealized);
  const realizedPercentDisplay =
    isPnlLoadingEmpty || isPnlErrorEmpty
      ? ""
      : formatPercentValue(realizedPercent);
  const boughtLabel = formatCurrencyCompact(totals.bought);
  const soldLabel = formatCurrencyCompact(totals.sold);
  const txsBuyLabel = formatNumberCompact(totals.txsBuy);
  const txsSellLabel = formatNumberCompact(totals.txsSell);

  const analyticsRows = [
    {
      label: "Trading Volume",
      value: formatCurrencyCompact(totals.bought + totals.sold),
      color: "text-[#00ff9e]",
    },
    {
      label: "Txs",
      value: `${formatNumberCompact(totals.txsBuy)} / ${formatNumberCompact(
        totals.txsSell
      )}`,
      color: "text-[#22d3ee]",
    },
    {
      label: "Avg Holding Duration",
      value: formatHoldMinutes(totals.holdSeconds, totals.count),
      color: "text-white",
    },
    {
      label: "Bought/Sold",
      value: `${formatCurrencyCompact(totals.bought)} / ${formatCurrencyCompact(
        totals.sold
      )}`,
      color: "text-[#00ff9e]",
    },
    {
      label: "Avg Cost",
      value: formatCurrencySmart(avgCost),
      color: "text-white",
    },
    {
      label: "Avg Win Cost",
      value: formatCurrencySmart(avgWinCost),
      color: "text-white",
    },
  ];

  // Assuming the API response is available as `suspiciousData`
  const suspiciousData = {
    sold_more_than_bought_pct: 25,
    didnt_buy_pct: 0,
    instant_sell_pct: 25,
    scam_rug_pct: 50,
  };

  const suspiciousActions = [
    {
      label: "Sold > Bought",
      value: formatPercentValue(suspiciousData.sold_more_than_bought_pct),
      color:
        suspiciousData.sold_more_than_bought_pct > 0
          ? "text-[#ff4d4d]"
          : "text-white",
    },
    {
      label: "Didn't Buy",
      value: formatPercentValue(suspiciousData.didnt_buy_pct),
      color: suspiciousData.didnt_buy_pct > 0 ? "text-[#ff4d4d]" : "text-white",
    },
    {
      label: "Instant Sell",
      value: formatPercentValue(suspiciousData.instant_sell_pct),
      color:
        suspiciousData.instant_sell_pct > 0 ? "text-[#ff4d4d]" : "text-white",
    },
    {
      label: "Scam/Rug tokens",
      value: formatPercentValue(suspiciousData.scam_rug_pct),
      color: "text-[#ff4d4d]",
    },
  ];

  return (
    <div className="px-4 pt-4 pb-8 font-sans text-white">
      {/* Top Header Navigation */}
      <div className=" flex flex-col gap-4 relative border-b border-white/20 text-gray-400 text-xs uppercase tracking-wider after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1px] after:bg-gradient-to-r after:from-[#FA4E30] after:to-[#39C8A6] after:content-[''] pb-4 md:flex-row md:items-center ">
        <nav className="flex flex-wrap gap-3 text-sm font-medium text-gray-400">
          {analyzerTabs.map((tab) => {
            // if (tab.id === "defi") {
            //   return (
            //     <button
            //       key={tab.id}
            //       onClick={() => {
            //         setIsDefiDrawerOpen((prev) => !prev);
            //         onTabChange(tab.id);
            //       }}
            //       className={`px-4 py-2 rounded-lg transition tracking-wide flex items-center gap-2 ${
            //         activeTab === tab.id
            //           ? "bg-black/60 text-white border border-white/40"
            //           : "text-gray-400 hover:text-white"
            //       }`}
            //     >
            //       <span>{tab.label}</span>
            //       <span
            //         className={`text-xs transition-transform ${
            //           isDefiDrawerOpen ? "rotate-180" : ""
            //         }`}
            //       >
            //         ▾
            //       </span>
            //     </button>
            //   );
            // }

            return (
              <button
                key={tab.id}
                onClick={() => {
                  setIsDefiDrawerOpen(false);
                  onTabChange(tab.id);
                }}
                className={`px-4 py-2 rounded-lg transition tracking-wide ${
                  activeTab === tab.id
                    ? "bg-black/60 text-white border border-white/40"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        {showTradingDetails && (
          <div className="mt-2 flex w-full flex-wrap justify-between gap-1 bg-black/40 p-1 rounded-lg border border-white/10 md:ml-auto md:mt-0 md:w-auto md:justify-center">
            {timeframeOptions.map((t) => (
              <button
                key={t}
                onClick={() => onTimeframeChange(t)}
                className={`px-3 py-1 text-xs rounded ${
                  t === timeframe
                    ? "bg-[#1a1a1a] text-white border border-[#FFEF3C]"
                    : "text-white/70"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {isDefiDrawerOpen && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/60 p-4 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              DeFi Options
            </div>
            {/* <button
              type="button"
              onClick={() => setIsDefiDrawerOpen(false)}
              className="text-zinc-400 transition hover:text-white"
            >
              X
            </button> */}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
            {defiOptions.map((option) => {
              const isActive = activeDefiOption === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={option.locked}
                  onClick={() => {
                    if (option.locked) return;
                    setActiveDefiOption(option.id);
                  }}
                  className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${
                    option.locked
                      ? "cursor-not-allowed border-white/5 bg-white/5 text-zinc-500"
                      : isActive
                      ? "border-white/30 bg-white/10 text-white"
                      : "border-white/10 bg-white/5 text-zinc-300 hover:border-white/30 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{option.label}</span>
                    {option.locked ? (
                      <span className="text-[11px] uppercase tracking-widest text-zinc-500">
                        Locked
                      </span>
                    ) : isActive ? (
                      <span className="text-[11px] uppercase tracking-widest text-emerald-300">
                        Active
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
          {activeDefiOption === "validators" && (
            <ValidatorsDelegationsPanel address={address} />
          )}
        </div>
      )}

      {showTradingDetails && (
        <div className="grid grid-cols-1 gap-4">
          {/* Right Section: Charts & Analytics */}
          <div className="lg:col-span-9 space-y-4">
            {/* md:grid-cols-2 md:auto-rows-fr */}
            <div className="grid grid-cols-1 gap-4  mt-6">
              {/* Trading PNL / Win Rate Section */}
              <div className="rounded-2xl border border-white/10 bg-[#0d0d0d] overflow-hidden shadow-2xl h-full flex flex-col">
                {/* PNL Summary Line */}
                {/* <div className="px-4 pt-4 pb-2 border-b border-white/5">
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <div className="flex items-center gap-2">
                      <span>Total PNL:</span>
                      <span
                        className={`font-medium ${
                          pnlSummary.totalPnl >= 0
                            ? "text-green-500"
                            : "text-red-500"
                        }`}
                      >
                        {pnlSummary.totalPnl >= 0 ? "+" : ""}
                        {pnlSummary.totalPnl.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <span className="text-green-500">▲</span>
                        <span>{pnlSummary.winCount} Wins</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-red-500">▼</span>
                        <span>{pnlSummary.lossCount} Losses</span>
                      </div>
                      <div className="text-amber-400">
                        {pnlSummary.winRate}% Win Rate
                      </div>
                    </div>
                  </div>
                </div> */}
                {/* Header Row */}
                <div className="flex items-center justify-between px-5 pt-4 pb-2">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-lg font-bold tracking-tight text-white">
                      PNL History
                    </h3>
                    <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-zinc-800 text-[10px] text-zinc-400">
                      i
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xl font-bold text-white">
                      {winRateDisplay}
                    </span>
                    <svg
                      className={`h-4 w-4 ${
                        isPnlLoadingEmpty || isPnlErrorEmpty
                          ? "text-zinc-500"
                          : totals.total >= 0
                          ? "text-[#4ADE80]"
                          : "text-[#F64F39]"
                      }`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <path
                        d="M7 17L17 7M17 7H7M17 7V17"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>

                {/* PNL Chart */}
                <div className="flex-1 p-2 h-32">
                  {pnlSeries.loading ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="animate-pulse text-sm text-gray-400">
                        Loading chart...
                      </div>
                    </div>
                  ) : pnlSeries.error ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-sm text-red-400">
                        Chart unavailable
                      </div>
                    </div>
                  ) : pnlSeries.points.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={pnlSeries.points}
                        margin={{ top: 5, right: 5, bottom: 0, left: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="colorWin"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#4ADE80"
                              stopOpacity={0.8}
                            />
                            <stop
                              offset="100%"
                              stopColor="#4ADE80"
                              stopOpacity={0.2}
                            />
                          </linearGradient>
                          <linearGradient
                            id="colorLoss"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#F64F39"
                              stopOpacity={0.8}
                            />
                            <stop
                              offset="100%"
                              stopColor="#F64F39"
                              stopOpacity={0.2}
                            />
                          </linearGradient>
                          <linearGradient
                            id="lineGradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#60A5FA"
                              stopOpacity={0.6}
                            />
                            <stop
                              offset="100%"
                              stopColor="#3B82F6"
                              stopOpacity={0.1}
                            />
                          </linearGradient>
                        </defs>

                        <XAxis
                          dataKey="t"
                          hide={true} // Cleaner look for a small spark-chart, or keep if preferred
                        />
                        <YAxis hide={true} domain={["auto", "auto"]} />

                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#0d0d0d",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: "8px",
                            fontSize: "12px",
                          }}
                          labelFormatter={(value) =>
                            new Date(value).toLocaleDateString()
                          }
                          formatter={(value: number | undefined) => {
                            const amount =
                              value == null ? 0 : Number(value.toFixed(4));
                            const label = value == null || value >= 0 ? "Profit" : "Loss";
                            return [`$${amount.toFixed(4)}`, label];
                          }}
                        />

                        {/* Cumulative Line: Shows overall trend */}
                        <Line
                          type="monotone"
                          dataKey="total_pnl_usd"
                          stroke="#60A5FA"
                          strokeWidth={1.5}
                          dot={false}
                          strokeDasharray="3 3"
                        />

                        {/* Daily Change Bars: Uses standard Recharts mapping */}
                        <Bar dataKey="pnl" radius={[2, 2, 0, 0]} barSize={6}>
                          {pnlSeries.points.map((entry, index) => (
                            <React.Fragment key={`cell-${index}`}>
                              <rect
                                fill={
                                  entry.pnl >= 0
                                    ? "url(#colorWin)"
                                    : "url(#colorLoss)"
                                }
                              />
                            </React.Fragment>
                          ))}
                        </Bar>

                        <ReferenceLine y={0} stroke="#333" strokeWidth={1} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-sm text-zinc-500">
                        No data available
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 border-y border-white/5 bg-black/20">
                  <div className="p-5 border-r border-white/5">
                    <p className="text-[12px] text-zinc-500 mb-1">Realized</p>
                    <p
                      className={`text-xl font-bold ${
                        isPnlLoadingEmpty || isPnlErrorEmpty
                          ? "text-zinc-500"
                          : totals.realized >= 0
                          ? "text-[#4ADE80]"
                          : "text-[#F64F39]"
                      }`}
                    >
                      {realizedDisplay}
                    </p>
                    {realizedPercentDisplay && (
                      <p
                        className={`text-[11px] font-medium ${
                          totals.realized >= 0
                            ? "text-[#4ADE80]/80"
                            : "text-[#F64F39]/80"
                        }`}
                      >
                        {realizedPercentDisplay}
                      </p>
                    )}
                  </div>
                  <div className="p-5 border-r border-white/5">
                    <p className="text-[12px] text-zinc-500 mb-1">Total PNL</p>
                    <p
                      className={`text-xl font-bold ${
                        isPnlLoadingEmpty || isPnlErrorEmpty
                          ? "text-zinc-500"
                          : totals.total >= 0
                          ? "text-[#4ADE80]"
                          : "text-[#F64F39]"
                      }`}
                    >
                      {totalPnlDisplay}
                    </p>
                  </div>
                  <div className="p-5">
                    <p className="text-[12px] text-zinc-500 mb-1">Unrealized</p>
                    <p
                      className={`text-xl font-bold ${
                        isPnlLoadingEmpty || isPnlErrorEmpty
                          ? "text-zinc-500"
                          : totals.unrealized >= 0
                          ? "text-[#4ADE80]"
                          : "text-[#F64F39]"
                      }`}
                    >
                      {unrealizedDisplay}
                    </p>
                  </div>
                </div>

                <div className="relative h-32 w-full px-5 pb-4 pt-6">
                  {/* Decorative background gradient */}
                  <div className="absolute inset-0 bg-gradient-to-r from-[#4ADE80]/5 via-transparent to-[#FFEF3C]/5 pointer-events-none" />

                  <div className="flex h-full items-end gap-[2px] relative z-10">
                    {portfolioSeries.points.length > 0 ? (
                      portfolioSeries.points.map((point, i) => {
                        // Find the highest value in the response to scale the bars correctly
                        const maxVal =
                          Math.max(
                            ...portfolioSeries.points.map((p) => p.value_usd)
                          ) || 1;

                        // Calculate percentage height based on the value_usd field
                        const heightPercent = (point.value_usd / maxVal) * 100;

                        return (
                          <div
                            key={i}
                            className="chart-bar flex-1 rounded-t-[1px] bg-[#4ADE80]"
                            style={{
                              // Ensure even small values (like your 0.005 USD) have a tiny 2% sliver visible
                              height: `${Math.max(heightPercent, 2)}%`,
                              opacity: heightPercent > 10 ? 0.9 : 0.4, // Dimmer opacity for very low values
                              animationDelay: `${i * 20}ms`,
                            }}
                          />
                        );
                      })
                    ) : (
                      <div className="flex w-full items-center justify-center text-zinc-600 text-[10px] uppercase tracking-widest">
                        {portfolioSeries.loading
                          ? "Loading Portfolio Data..."
                          : "No Portfolio Data"}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {/* RIGHT COLUMN: PNL Distribution & Actions */}
              {/* <div className="relative overflow-hidden border border-white/10 rounded-2xl h-full">
                <div
                  className="rounded-2xl p-6 overflow-hidden relative shadow-2xl h-full flex flex-col"
                  style={{
                    backgroundImage:
                      "linear-gradient(140deg, #000000 50%, #500a3cff 100%)",
                  }}
                >
                  <h3 className="text-[15px] font-bold text-white mb-8 tracking-tight relative z-10">
                    PNL Distribution ({distributionTotal} Tokens)
                  </h3>

                  <div className="flex items-center justify-between gap-8 relative z-10">
                    <div className="flex-1 space-y-4 font-bold text-[13px] text-white">
                      {distributionLoading && !distribution.length && (
                        <div className="text-zinc-400 text-[12px]">
                          Loading distribution...
                        </div>
                      )}
                      {distributionError && !distribution.length && (
                        <div className="text-red-400 text-[12px]">
                          {distributionError}
                        </div>
                      )}
                      {!distributionLoading &&
                        !distributionError &&
                        !distribution.length && (
                          <div className="text-zinc-400 text-[12px]">
                            No distribution data available.
                          </div>
                        )}
                      {distribution.map((bucket) => {
                        const percent =
                          distributionTotal > 0
                            ? (bucket.count / distributionTotal) * 100
                            : 0;
                        const valueColor =
                          bucket.label.includes("<") ||
                          bucket.label.includes("-")
                            ? "text-[#F64F39]"
                            : "text-[#20D87C]";
                        return (
                          <div key={bucket.label} className="flex gap-6">
                            <span className="text-zinc-500 w-12 font-medium">
                              {bucket.label}
                            </span>
                            <span className={valueColor}>
                              {bucket.count} ({formatPercent(percent)})
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="relative w-56 h-28 self-end overflow-visible">
                      <svg
                        viewBox="0 0 100 50"
                        className="w-full h-full overflow-visible"
                      >
                        <path
                          d="M 10,50 A 40,40 0 0,1 35,12"
                          fill="none"
                          stroke="#F64F39"
                          strokeWidth="14"
                          strokeLinecap="butt"
                          className="pie-path drop-shadow-[0_0_10px_rgba(246,79,57,0.6)]"
                          style={{ animationDelay: "0.05s" }}
                        />
                        <path
                          d="M 35,12 A 40,40 0 0,1 90,50"
                          fill="none"
                          stroke="#20D87C"
                          strokeWidth="14"
                          strokeLinecap="butt"
                          className="pie-path drop-shadow-[0_0_15px_rgba(32,216,124,0.7)]"
                          style={{ animationDelay: "0.25s" }}
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </div> */}
            </div>
{/* md:grid-cols-2 md:auto-rows-fr */}
            <div className="grid grid-cols-1 gap-4 ">
              <div className="relative overflow-hidden border border-white/10 rounded-2xl h-full">
                <div
                  className="rounded-2xl p-6 overflow-hidden relative shadow-2xl h-full flex flex-col"
                  style={{
                    backgroundImage:
                      "linear-gradient(150deg, #000000 50%, #500a3cff 100%)",
                  }}
                >
                  <h3 className="relative z-10 text-[15px] font-bold text-white mb-6 tracking-tight">
                    Analytics
                  </h3>
                  <div className="relative z-10">
                    {analyticsRows.map((row) => (
                      <div
                        key={row.label}
                        className="flex justify-between items-center text-[13px] pb-2 mb-2"
                      >
                        <span className="text-zinc-500 font-medium">
                          {row.label}
                        </span>
                        {row.label === "Bought/Sold" ? (
                          <div className="font-bold flex gap-1">
                            <span className="text-[#20D87C]">
                              {isPnlLoadingEmpty
                                ? "Loading..."
                                : isPnlErrorEmpty
                                ? "N/A"
                                : boughtLabel}
                            </span>
                            <span className="text-zinc-600">/</span>
                            <span className="text-[#F64F39]">
                              {isPnlLoadingEmpty
                                ? "Loading..."
                                : isPnlErrorEmpty
                                ? "N/A"
                                : soldLabel}
                            </span>
                          </div>
                        ) : row.label === "Txs" ? (
                          <div className="font-bold flex gap-1">
                            <span className="text-[#20D87C]">
                              {isPnlLoadingEmpty
                                ? "Loading..."
                                : isPnlErrorEmpty
                                ? "N/A"
                                : txsBuyLabel}
                            </span>
                            <span className="text-zinc-600">/</span>
                            <span className="text-[#F64F39]">
                              {isPnlLoadingEmpty
                                ? "Loading..."
                                : isPnlErrorEmpty
                                ? "N/A"
                                : txsSellLabel}
                            </span>
                          </div>
                        ) : (
                          <span className={`font-bold ${row.color}`}>
                            {isPnlLoadingEmpty
                              ? "Loading..."
                              : isPnlErrorEmpty
                              ? "N/A"
                              : row.value}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* <div className="relative rounded-2xl border border-white/10 h-full">
                <div
                  className="rounded-2xl p-6 overflow-hidden relative shadow-2xl h-full flex flex-col"
                  style={{
                    backgroundImage:
                      "linear-gradient(145deg, #000000 60%, #1d804eff 100%)",
                  }}
                >
                  <div className="relative z-10 flex justify-between items-center mb-6">
                    <h3 className="text-[15px] text-white tracking-tight">
                      Suspicious Actions
                    </h3>
                  </div>
                  <div className="relative z-10">
                    {suspiciousActions.map((action) => (
                      <div
                        key={action.label}
                        className="flex justify-between items-center text-[13px] pb-2 mb-2"
                      >
                        <span className="text-zinc-500 font-medium">
                          {action.label}
                        </span>
                        <span className={`font-bold ${action.color}`}>
                          {isPnlLoadingEmpty
                            ? "Loading..."
                            : isPnlErrorEmpty
                            ? "N/A"
                            : action.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div> */}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
