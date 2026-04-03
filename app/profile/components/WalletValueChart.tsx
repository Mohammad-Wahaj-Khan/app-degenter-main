"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Area,
} from "recharts";
import { TrendingUp, TrendingDown, Loader2 } from "lucide-react";

type ChartDataPoint = {
  t: string;
  value_usd: number;
};

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
      <div className="bg-black/90 backdrop-blur-sm border border-white/10 rounded-lg p-3 text-xs">
        <p className="text-white/80">
          {new Date(label).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
        <p className="font-bold text-white">
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
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/wallets/${encodeURIComponent(
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
        setChartData([]);
        setError("No portfolio history data available");
      }
    } catch (err) {
      console.error("Error fetching chart data:", err);
      setError("Failed to load portfolio history. Please try again later.");
      setChartData([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch data when walletAddress changes
  useEffect(() => {
    if (walletAddress) {
      fetchChartData(walletAddress);
    }
  }, [walletAddress, fetchChartData]);

  if (isLoading) {
    return (
      <div
        className={`p-4 rounded-xl bg-white/5 border border-white/10 ${className}`}
      >
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-sm font-medium text-white/80 mb-1">
              Portfolio Value
            </h3>
            <div className="h-6 w-32 bg-white/10 rounded animate-pulse"></div>
          </div>
          <div className="h-5 w-20 bg-white/10 rounded animate-pulse"></div>
        </div>
        <div className="h-32 w-full bg-white/5 rounded-lg flex items-center justify-center">
          <div className="flex flex-col items-center space-y-2">
            <div className="w-8 h-8 border-4 border-white/20 border-t-white/60 rounded-full animate-spin"></div>
            <span className="text-sm text-white/60">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !chartData.length) {
    return (
      <div
        className={`p-4 rounded-xl bg-white/5 border border-white/10 ${className}`}
      >
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-sm font-medium text-white/80 mb-1">
              Portfolio Value
            </h3>
            <p className="text-2xl font-bold text-white">-</p>
          </div>
        </div>
        <div className="h-32 flex items-center justify-center text-white/50 text-sm">
          {error || "No data available"}
        </div>
      </div>
    );
  }

  const isPositive = change24h ? change24h >= 0 : true;
  const changeColor = isPositive ? "text-emerald-400" : "text-rose-400";
  const changeIcon = isPositive ? "↑" : "↓";

  return (
    <div className={`h-full w-full flex flex-col ${className}`}>
      <div className="h-full w-full min-h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
          >
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              stroke="rgba(255, 255, 255, 0.05)"
            />
            <XAxis
              dataKey="time"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "rgba(255, 255, 255, 0.35)", fontSize: 10 }}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                });
              }}
              padding={{ left: 4, right: 4 }}
              minTickGap={20}
              tickMargin={8}
            />
            <YAxis
              domain={["auto", "auto"]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "rgba(255, 255, 255, 0.35)", fontSize: 10 }}
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
              stroke="#10B981"
              strokeWidth={2}
              dot={false}
              activeDot={{
                r: 4,
                fill: "#10B981",
                stroke: "#fff",
                strokeWidth: 2,
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              fill="url(#chartGradient)"
              stroke="none"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-sm font-medium text-white/80 mb-1">
            Portfolio Value
          </h3>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-white">
              {currentValue ? formatCurrencyCompact(currentValue) : "-"}
            </p>
            {change24h !== null && (
              <span
                className={`text-sm font-medium ${changeColor} flex items-center`}
              >
                {changeIcon} {Math.abs(change24h).toFixed(2)}%
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
