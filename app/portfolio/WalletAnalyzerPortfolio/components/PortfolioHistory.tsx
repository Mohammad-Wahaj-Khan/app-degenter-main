"use client";

import React from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Info } from "lucide-react";
import { useChain } from "@cosmos-kit/react";
import { CHAIN_NAME } from "../../../config/chain";
import { API_BASE_URL, API_HEADERS } from "@/lib/api";

const normalizeWalletApiBase = (value?: string) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed || /undefined|null/i.test(trimmed)) return API_BASE_URL;
  return trimmed;
};

const HOLDINGS_API_ENDPOINTS = Array.from(
  new Set([normalizeWalletApiBase(process.env.NEXT_PUBLIC_WALLET_HOLDINGS_API)])
);
const MAX_DONUT_ITEMS = 7;

const CUSTOM_COLORS = [
  "#0A87D9", // WSOL - Blue
  "#FAB558", // SOL - Orange
  "#56C229", // LOOKSMAX - Green
  "#46C8F5", // PUMP2 - Cyan
  "#ea580c", // PEPE - Darker Orange
  "#862ADA", // UGANDA - Purple
  "#1E17C0", // POPFROG - Indigo
  "#E7A0E6", // Others - Pink
];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type TimeframeKey = "24h" | "7d" | "10d" | "1M";

const formatHourLabel = (date: Date) =>
  `${date.getHours().toString().padStart(2, "0")}:00`;

const formatDayLabel = (date: Date) => {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${month}/${day}`;
};

const buildTimeLabels = (timeframe: TimeframeKey) => {
  const now = new Date();
  if (timeframe === "24h") {
    return Array.from({ length: 24 }, (_, i) => {
      const date = new Date(now.getTime() - (23 - i) * HOUR_MS);
      return formatHourLabel(date);
    });
  }
  if (timeframe === "7d") {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(now.getTime() - (6 - i) * DAY_MS);
      return formatDayLabel(date);
    });
  }
  if (timeframe === "10d") {
    return Array.from({ length: 10 }, (_, i) => {
      const date = new Date(now.getTime() - (9 - i) * DAY_MS);
      return formatDayLabel(date);
    });
  }
  return Array.from({ length: 30 }, (_, i) => {
    const date = new Date(now.getTime() - (29 - i) * DAY_MS);
    return formatDayLabel(date);
  });
};

interface HoldingSlice {
  name: string;
  usdValue: number;
}

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
      const res = await fetch(url, {
        ...init,
        headers: { ...API_HEADERS, ...(init.headers || {}) },
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

const formatTokenName = (name: string) => {
  if (!name) return "";
  if (!name.includes(".")) return name;
  const parts = name.split(".");
  const lastPart = parts[parts.length - 1];
  return lastPart ? lastPart.toUpperCase() : name;
};

const formatCurrencyCompact = (value: number) => {
  if (!Number.isFinite(value)) return "$0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
};

const formatPercent = (value: number) => {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(2)}%`;
};

const TimeButton = ({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) => (
  <button
    onClick={onClick}
    className={`text-xs font-medium rounded-md w-[34.32px] h-[34.32px] flex items-center justify-center transition-all ${
      active
        ? "border-2 border-[#FFEF3C] bg-[#300000]"
        : "hover:text-gray-300 bg-[#1a1a1a]"
    }`}
  >
    {label}
  </button>
);

const LegendItem = ({
  color,
  name,
  value,
  icon,
}: {
  color: string;
  name: string;
  value: string;
  icon?: React.ReactNode;
}) => (
  <div className="flex items-center justify-between gap-4 text-xs w-full py-0.5">
    <div className="flex items-center gap-2">
      <div
        className="w-2.5 h-2.5 rounded-[2px]"
        style={{ backgroundColor: color }}
      />
      {icon && <span className="mr-1">{icon}</span>}
      <span className="text-gray-300 font-medium">{name}</span>
    </div>
    <span className="text-gray-400 text-left font-mono">{value}</span>
  </div>
);

type PortfolioHistoryProps = {
  addressOverride?: string;
};

export default function PortfolioHistory({
  addressOverride,
}: PortfolioHistoryProps) {
  const { address: connectedAddress } = useChain(CHAIN_NAME || "zigchain-1");
  const address = addressOverride?.trim() || connectedAddress;
  const [holdings, setHoldings] = React.useState<HoldingSlice[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [timeframe, setTimeframe] = React.useState<TimeframeKey>("24h");

  React.useEffect(() => {
    if (!address) {
      setHoldings([]);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;

    const loadHoldings = async () => {
      setLoading(true);
      setError(null);

      try {
        const holdingsPayload = await fetchFromEndpoints(
          HOLDINGS_API_ENDPOINTS,
          `wallets/${encodeURIComponent(address)}/portfolio/holdings?source=chain`,
          {
            cache: "no-store",
            signal: controller.signal,
            headers: { Accept: "application/json" },
          },
          "wallet holdings"
        );
        const items = Array.isArray(holdingsPayload?.items)
          ? holdingsPayload.items
          : [];
        const prepared = items
          .map((entry: any): HoldingSlice | null => {
            const token = entry?.token ?? {};
            const symbol =
              token?.symbol ??
              token?.denom ??
              token?.token_id ??
              token?.tokenId ??
              "UNKNOWN";
            const displayName = formatTokenName(symbol);
            const usdValue = safeNumber(entry?.value_usd ?? entry?.valueUsd);
            if (usdValue <= 0) return null;
            const cleanedName = (displayName || symbol).trim();
            if (!cleanedName) return null;
            return {
              name: cleanedName,
              usdValue,
            };
          })
          .filter((item: HoldingSlice | null): item is HoldingSlice =>
            Boolean(item)
          );

        if (!active) return;
        setHoldings(prepared);
      } catch (err) {
        if (!active) return;
        const message =
          err instanceof Error ? err.message : "Failed to load holdings";
        setError(message);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadHoldings();

    return () => {
      active = false;
      controller.abort();
    };
  }, [address]);

  const totalUsdValue = holdings.reduce(
    (sum, item) => sum + item.usdValue,
    0
  );
  const sortedHoldings = [...holdings].sort(
    (a, b) => b.usdValue - a.usdValue
  );
  const topHoldings = sortedHoldings.slice(0, MAX_DONUT_ITEMS);
  const otherTotal = sortedHoldings
    .slice(MAX_DONUT_ITEMS)
    .reduce((sum, item) => sum + item.usdValue, 0);
  const donutData = [
    ...topHoldings.map((item) => ({
      name: item.name,
      value: totalUsdValue > 0 ? (item.usdValue / totalUsdValue) * 100 : 0,
    })),
    ...(otherTotal > 0
      ? [
          {
            name: "Others",
            value: totalUsdValue > 0 ? (otherTotal / totalUsdValue) * 100 : 0,
          },
        ]
      : []),
  ];
  const timeLabels = React.useMemo(
    () => buildTimeLabels(timeframe),
    [timeframe]
  );
  const areaData = timeLabels.map((time) => ({
    time,
    value: totalUsdValue,
  }));
  const walletValueLabel = error
    ? "—"
    : loading && !holdings.length
    ? "Loading..."
    : formatCurrencyCompact(totalUsdValue);

  return (
    <div className="w-full mx-auto bg-[#050505] border border-[#353231] rounded-xl text-white overflow-hidden shadow-2xl relative">
      {/* Background gradient effects */}
      <div className="w-full h-full pointer-events-none" />

      {/* Header */}
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-[#353231] px-4 md:px-5 py-3 gap-3 sm:gap-0">
        <h2 className="text-md font-bold text-gray-100">Portfolio history</h2>
        <div className="flex gap-2 w-full sm:w-auto overflow-x-auto no-scrollbar">
          <TimeButton
            label="24h"
            active={timeframe === "24h"}
            onClick={() => setTimeframe("24h")}
          />
          <TimeButton
            label="7d"
            active={timeframe === "7d"}
            onClick={() => setTimeframe("7d")}
          />
          <TimeButton
            label="10d"
            active={timeframe === "10d"}
            onClick={() => setTimeframe("10d")}
          />
          <TimeButton
            label="1M"
            active={timeframe === "1M"}
            onClick={() => setTimeframe("1M")}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* Left Section: Donut + Legends */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-10 w-full border-r-0 lg:border-r border-[#353231] bg-gradient-to-t from-[#1E2914]/60 to-[#000000]/40 p-4 lg:p-0">
          {/* Left Legend Column */}
          <div className="w-full md:w-auto min-w-[120px] space-y-0.5">
            {donutData.slice(0, 4).map((item, index) => (
              <LegendItem
                key={item.name}
                color={CUSTOM_COLORS[index]}
                name={item.name}
                value={formatPercent(item.value)}
              />
            ))}
          </div>

          {/* Donut Chart Center */}
          <div className="relative w-[220px] h-[220px] flex items-center justify-center shrink-0 ">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  {donutData.map((entry, index) => (
                    <filter key={`shadow-${index}`} id={`shadow-${index}`}>
                      <feDropShadow
                        dx="0"
                        dy="0"
                        stdDeviation="2"
                        floodColor={CUSTOM_COLORS[index % CUSTOM_COLORS.length]}
                      />
                    </filter>
                  ))}
                </defs>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={95}
                  paddingAngle={0}
                  dataKey="value"
                  stroke="none"
                >
                  {donutData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={CUSTOM_COLORS[index % CUSTOM_COLORS.length]}
                      stroke="none"
                      style={{
                        filter: `url(#shadow-${index})`,
                      }}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            {/* Center Text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xs text-gray-500 font-medium mb-1">
                Wallet Value
              </span>
              <span className="text-2xl font-bold text-white tracking-tight">
                {walletValueLabel}
              </span>
            </div>
          </div>

          {/* Right Legend Column */}
          <div className="w-full md:w-auto min-w-[120px] space-y-0.5">
            {donutData.slice(4).map((item, index) => (
              <LegendItem
                key={item.name}
                color={CUSTOM_COLORS[index + 4]}
                name={item.name}
                value={formatPercent(item.value)}
              />
            ))}
          </div>
        </div>

        {/* Right Section: Area Chart */}
        <div className="relative flex items-center justify-center pl-1 h-[200px] md:h-[240px] w-full rounded-lg bg-gradient-to-tl from-[#2B091F]/60 to-[#000000]/40">
          {/* Floating MDD Box */}
          <div className="absolute top-3 left-3 bg-[#0F483A] border border-green-900/50 rounded-md p-3 z-10 shadow-lg w-[112px] h-[64px] flex flex-col justify-center">
            <div className="flex items-center gap-1 text-[14px] font-bold mb-0.5 uppercase tracking-wide">
              MDD <Info size={16} className="text-gray-500" />
            </div>
            <div className="text-lg font-bold text-white">14.63%</div>
          </div>

          <ResponsiveContainer height="80%">
            <AreaChart
              data={areaData}
              margin={{ top: 10, right: 0, left: 25, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="35%" stopColor="#00C785" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#00C785" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#6b7280", fontSize: 10 }}
                dy={10}
              />
              <YAxis
                orientation="right"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#6b7280", fontSize: 10 }}
                domain={["dataMin - 5000", "dataMax + 5000"]}
                tickFormatter={(value) => `${value / 1000}K`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111827",
                  borderColor: "#374151",
                  color: "#fff",
                  fontSize: "12px",
                }}
                itemStyle={{ color: "#fff" }}
                formatter={(value) => {
                  const formattedValue =
                    typeof value === "number"
                      ? `$${value.toLocaleString()}`
                      : (value as string | undefined);
                  return [formattedValue ?? "$0", "Value"];
                }}
                labelStyle={{ color: "#9ca3af" }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#22c55e"
                fillOpacity={1}
                fill="url(#colorValue)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
