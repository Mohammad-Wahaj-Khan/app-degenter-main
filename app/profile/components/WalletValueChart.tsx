"use client";

import React, { useCallback, useEffect, useId, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Area,
  ReferenceDot,
} from "recharts";
import { Loader2, WifiOff } from "lucide-react";

type WalletValueChartProps = {
  walletAddress: string;
  className?: string;
  apiKey?: string;
};

const formatCurrencyCompact = (value: number) => {
  if (!Number.isFinite(value)) return "N/A";

  const formatter = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });

  return `$${formatter.format(value)}`;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-2xl border border-[rgba(57,200,166,0.24)] bg-[rgba(8,8,8,0.88)] p-3 text-xs shadow-[0_18px_40px_rgba(0,0,0,0.45)] backdrop-blur-[20px]">
        <p className="font-mono uppercase tracking-[0.14em] text-zinc-400">
          {new Date(label).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
        <p className="mt-1 font-bold text-[#cafff0]">
          {formatCurrencyCompact(payload[0].value)}
        </p>
      </div>
    );
  }
  return null;
};

export default function WalletValueChart({
  walletAddress,
  className = "",
  apiKey,
}: WalletValueChartProps) {
  const gradientId = useId().replace(/:/g, "");
  const [chartData, setChartData] = useState<{ time: string; value: number }[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentValue, setCurrentValue] = useState<number | null>(null);
  const [change24h, setChange24h] = useState<number | null>(null);

  const fetchChartData = useCallback(async (walletAddress: string) => {
    if (!walletAddress) return;

    setIsLoading(true);
    setError(null);

    try {
      const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
      const response = await fetch(
        `${baseUrl}/wallets/${encodeURIComponent(
          walletAddress
        )}/portfolio/value-series?win=30d&tf=1h`,
        {
          cache: "no-store",
          headers: {
            Accept: "application/json",
            ...(apiKey ? { "x-api-key": apiKey } : {}),
          },
        }
      );
      // /wallets/zig1h27gp9zy4w93ky98y54gzm9sq5t4p8xt442llq/portfolio/value-series?win=30d&tf=1h
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseData = await response.json();

      // Handle the new API response format
      if (responseData && Array.isArray(responseData.points)) {
        const formattedData = responseData.points
          .filter((point: any) => point?.t && point?.value_usd !== undefined)
          .map((point: any) => ({
            time: new Date(point.t).getTime(),
            value: parseFloat(point.value_usd),
          }))
          .sort((a: any, b: any) => a.time - b.time);

        setChartData(formattedData);

        // Calculate 24h change if we have enough data points
        if (formattedData.length >= 2) {
          const current = formattedData[formattedData.length - 1].value;
          const prev24h = formattedData[0].value;
          const change =
            prev24h !== 0 ? ((current - prev24h) / prev24h) * 100 : 0;
          setCurrentValue(current);
          setChange24h(change);
        } else if (formattedData.length === 1) {
          // If we only have one data point, use it for current value
          setCurrentValue(formattedData[0].value);
          setChange24h(0);
        }
      } else {
        console.warn("Unexpected API response format:", responseData);
        setError("No portfolio history data available");
      }
    } catch (err) {
      console.error("Error fetching chart data:", err);
      setError("Failed to load portfolio history. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  }, [apiKey]);

  // Fetch data when walletAddress changes
  useEffect(() => {
    if (walletAddress) {
      fetchChartData(walletAddress);
    }
  }, [walletAddress, fetchChartData]);

  if (isLoading) {
    return (
      <div className={`flex h-full min-h-[220px] flex-col ${className}`}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-mono text-[11px] uppercase tracking-[0.28em] text-zinc-500">
              Portfolio Value
            </h3>
            <div className="mt-2 h-8 w-36 animate-pulse rounded bg-white/10"></div>
          </div>
          <div className="h-5 w-20 animate-pulse rounded bg-white/10"></div>
        </div>
        <div className="flex h-full items-center justify-center rounded-[22px] border border-white/[0.03] bg-white/[0.02]">
          <div className="flex flex-col items-center space-y-2">
            <Loader2 className="h-8 w-8 animate-spin text-[#39c8a6]" />
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              Loading chart
            </span>
          </div>
        </div>
      </div>
    );
  }

  const peakPoint = chartData.length
    ? chartData.reduce((peak, point) => (point.value > peak.value ? point : peak), chartData[0])
    : null;

  if (!chartData.length) {
    return (
      <div className={`flex h-full min-h-[220px] flex-col ${className}`}>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h3 className="font-mono text-[11px] uppercase tracking-[0.28em] text-zinc-500">
              Portfolio Value
            </h3>
            <p className="mt-2 text-3xl font-bold tracking-[-0.04em] text-[#f4efe3]">
              -
            </p>
          </div>
          {error ? (
            <div className="rounded-full border border-amber-400/20 bg-amber-500/8 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-amber-100/80">
              {error}
            </div>
          ) : null}
        </div>
        <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-white/[0.05] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.008))]">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[rgba(57,200,166,0.18)] bg-[rgba(57,200,166,0.08)] text-[#39c8a6]">
              <WifiOff size={20} />
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                Waiting for portfolio history
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                The rest of the profile remains available while analytics recover.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isPositive = change24h !== null ? change24h >= 0 : true;
  const changeColor = isPositive ? "text-emerald-400" : "text-rose-400";
  const changeIcon = isPositive ? "↑" : "↓";

  return (
    <div className={`flex h-full w-full min-h-[220px] flex-col ${className}`}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h3 className="font-mono text-[11px] uppercase tracking-[0.28em] text-zinc-500">
            Portfolio Value
          </h3>
          <div className="mt-2 flex items-baseline gap-3">
            <p className="text-3xl font-bold tracking-[-0.04em] text-[#f4efe3]">
              {currentValue !== null ? formatCurrencyCompact(currentValue) : "-"}
            </p>
            {change24h !== null && (
              <span
                className={`flex items-center font-mono text-xs uppercase tracking-[0.16em] ${changeColor}`}
              >
                {changeIcon} {Math.abs(change24h).toFixed(2)}%
              </span>
            )}
          </div>
        </div>
        <div className="rounded-full border border-[rgba(57,200,166,0.18)] bg-[rgba(57,200,166,0.08)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#90f0d5]">
          30D Flow
        </div>
      </div>

      <div className="h-full w-full min-h-[160px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
          >
            <defs>
              <linearGradient id={`${gradientId}-line`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#0ecf8f" />
                <stop offset="58%" stopColor="#46b58f" />
                <stop offset="100%" stopColor="#fa4e30" />
              </linearGradient>
              <linearGradient id={`${gradientId}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fa4e30" stopOpacity={0.14} />
                <stop offset="55%" stopColor="#12b981" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#0a0a0a" stopOpacity={0} />
              </linearGradient>
              <filter id={`${gradientId}-shadow`} x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
                <feColorMatrix
                  in="blur"
                  type="matrix"
                  values="1 0 0 0 0.16  0 1 0 0 0.68  0 0 1 0 0.58  0 0 0 0.28 0"
                />
              </filter>
            </defs>
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              stroke="rgba(255, 255, 255, 0.04)"
            />
            <XAxis
              dataKey="time"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "rgba(161, 161, 170, 0.75)", fontSize: 10 }}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                });
              }}
              padding={{ left: 4, right: 4 }}
              minTickGap={20}
              tickMargin={10}
            />
            <YAxis
              domain={["auto", "auto"]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "rgba(161, 161, 170, 0.75)", fontSize: 10 }}
              tickFormatter={(value) => {
                if (value >= 1000000)
                  return `$${(value / 1000000).toFixed(1)}M`;
                if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
                return `$${value}`;
              }}
              width={36}
              tickMargin={8}
            />
            <Tooltip
              content={<CustomTooltip />}
              wrapperStyle={{ outline: "none" }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={`url(#${gradientId}-line)`}
              strokeWidth={8}
              strokeOpacity={0.16}
              dot={false}
              activeDot={false}
              filter={`url(#${gradientId}-shadow)`}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={`url(#${gradientId}-line)`}
              strokeWidth={3}
              dot={false}
              activeDot={{
                r: 5,
                fill: "#fa7e68",
                stroke: "#fff3f0",
                strokeWidth: 2,
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              fill={`url(#${gradientId}-fill)`}
              stroke="none"
            />
            {peakPoint ? (
              <ReferenceDot
                x={peakPoint.time}
                y={peakPoint.value}
                r={4}
                fill="#fa7e68"
                stroke="#fff3f0"
                strokeWidth={2}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
