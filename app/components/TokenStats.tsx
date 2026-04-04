"use client";

import { useEffect, useState, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { API_BASE_URL, API_HEADERS } from "@/lib/api";

const API_BASE = API_BASE_URL;

interface TokenData {
  token?: {
    tokenId?: string;
    denom?: string;
    symbol?: string;
    name?: string;
    imageUri?: string;
    createdAt?: string;
    description?: string | null;
  };
  symbol?: string;
  name?: string;
  imageUri?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  priceInUsd?: number;
  price?: { usd?: number; native?: number; changePct?: Record<string, number> };
  liquidity?: number;
  mcap?: { usd?: number };
  mcapDetail?: { usd?: number; native?: number };
  fdv?: number;
  fdvDetail?: { usd?: number; native?: number };
  mc?: number;
  circulatingSupply?: number;
  supply?: { circulating?: number; max?: number } | number;
  holder?: string | number;
  creationTime?: string;
  priceChange?: Record<string, number>;
  volumeUSD?: Record<string, number>;
  txBuckets?: Record<string, number>;
  buy?: number;
  sell?: number;
  tradeCount?: { total?: number };
  vBuyUSD?: number;
  vSellUSD?: number;
}

export default function TokenStats({
  tokenId,
  tokenKey,
  summaryData,
}: {
  tokenId?: string | number;
  tokenKey?: string | null;
  summaryData?: TokenData | null;
}) {
  const [data, setData] = useState<TokenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const lastGoodDataRef = useRef<TokenData | null>(null);

  const resolveTokenDenom = (
    key?: string | null,
    summary?: TokenData | null
  ) => {
    return (
      summary?.token?.denom ||
      // summary?.denom ||
      (key?.trim() ? key.trim() : null)
    );
  };

  const fetchData = async (isPolling = false) => {
    const fetchTarget = resolveTokenDenom(tokenKey, summaryData);
    if (!fetchTarget) return;

    try {
      if (!isPolling) {
        setLoading(true);
      }

      const res = await fetch(
        `${API_BASE}/tokens/${encodeURIComponent(
          fetchTarget
        )}?priceSource=best&includePools=1`,
        {
          headers: API_HEADERS,
        }
      );
      const json = await res.json();
      if (json?.success && json?.data) {
        lastGoodDataRef.current = json.data;
        setData(json.data);
      } else if (lastGoodDataRef.current) {
        setData(lastGoodDataRef.current);
      }
    } catch (err) {
      console.error("Error fetching token stats:", err);
      if (!isPolling) {
        if (lastGoodDataRef.current) {
          setData(lastGoodDataRef.current);
        }
      }
    } finally {
      if (!isPolling) {
        setLoading(false);
      }
    }
  };

  const resolvedMaskKey = (
    tokenKey ??
    summaryData?.token?.denom ??
    // summaryData?.denom ??
    summaryData?.token?.symbol ??
    ""
  )
    .trim()
    .toLowerCase();
  const isStzig = resolvedMaskKey.includes("stzig");
  const maskText = (
    value?: string,
    options: { hideForStzig?: boolean; fallback?: string } = {}
  ) => {
    const { hideForStzig = true, fallback = "—" } = options;
    const formatted = value ?? fallback;
    if (isStzig && hideForStzig) return fallback;
    return formatted === "" ? fallback : formatted;
  };
  const maskNumber = (
    value?: number,
    format: (n: number) => string = (n) => n.toString(),
    hideForStzig = true
  ) => {
    if (value == null || !Number.isFinite(value)) return "—";
    if (isStzig && hideForStzig) return "—";
    return format(value);
  };

  // Apply live summary updates when available
  useEffect(() => {
    if (!summaryData) return;
    lastGoodDataRef.current = summaryData;
    setData(summaryData);
    setLoading(false);
  }, [summaryData]);

  // Initial fetch and set up polling (fallback)
  useEffect(() => {
    if (!summaryData) fetchData();
  }, [tokenKey, summaryData]);

  const handleReload = () => {
    fetchData();
  };

  if (loading) {
    return (
      <div className="bg-black/50 border border-gray-700 rounded-lg p-6 text-center text-gray-400">
        Loading token stats...
      </div>
    );
  }

  if (!data) {
    if (!tokenKey) {
      return (
        <div className="bg-black/50 border border-gray-700 rounded-lg p-6 text-center text-gray-400">
          Waiting for token details...
        </div>
      );
    }
    return (
      <div className="bg-black/50 border border-gray-700 rounded-lg p-6 text-center text-red-400">
        No data found for token: {tokenKey || tokenId}
      </div>
    );
  }

  // local helper (no imports)
  const formatChangePct = (n?: number): string => {
    if (n == null || !Number.isFinite(n)) return "—";
    // avoid showing "-0%"
    const v = Math.abs(n) < 0.0005 ? 0 : n;
    const abs = Math.abs(v);

    // dynamic precision
    const maxDp =
      abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : abs >= 0.1 ? 3 : 4;

    const body = new Intl.NumberFormat(undefined, {
      maximumFractionDigits: maxDp,
      signDisplay: "exceptZero", // adds "+" for positives
    }).format(v);

    return `${body}%`;
  };

  const change24h =
    data.priceChange?.["24h"] ?? data.price?.changePct?.["24h"];
  const volume24h = data.volumeUSD?.["24h"];

  const toShort = (num?: number, prefix = ""): string => {
    if (num == null || !Number.isFinite(num)) return "—";

    // helper: round to 2 dp as a number (avoids string thresholds)
    const r2 = (x: number) => Number(x.toFixed(2));

    // Try billions first *after rounding*
    const b = r2(num / 1e9);
    if (b >= 1) return `${prefix}${b.toFixed(2)}B`;

    const m = r2(num / 1e6);
    if (m >= 1) return `${prefix}${m.toFixed(2)}M`;

    const k = r2(num / 1e3);
    if (k >= 1) return `${prefix}${k.toFixed(2)}K`;

    return `${prefix}${r2(num).toFixed(2)}`;
  };

  const total = (data?.vBuyUSD ?? 0) + (data?.vSellUSD ?? 0);
  const buyPct = total ? ((data?.vBuyUSD ?? 0) / total) * 100 : 50;
  const sellPct = 100 - buyPct;

  const marketCap = toShort(
    data.mcapDetail?.usd ?? data.mcap?.usd ?? data.mc,
    "$"
  );
  const fdvValue = toShort(data.fdvDetail?.usd ?? data.fdv, "$");
  const change24hValue = formatChangePct(change24h);
  const supplyObj = typeof data.supply === "number" ? null : data.supply;
  const circulatingSupply = toShort(
    supplyObj?.circulating ?? data.circulatingSupply
  );
  const totalSupply = toShort(
    typeof data.supply === "number" ? data.supply : supplyObj?.max
  );
  const maskedMarketCap = maskText(marketCap);
  const maskedLiquidity = maskText(toShort(data.liquidity, "$"), {
    hideForStzig: false,
  });
  const masked24hTrades = maskNumber(
    data.txBuckets?.["24h"],
    (n) => n.toString(),
    false
  );
  const maskedChange24hValue = maskText(change24hValue);
  const maskedFDV = maskText(fdvValue);
  const volume24hText = volume24h ? `$${toShort(volume24h)}` : "—";
  const maskedVolume24h = maskText(volume24hText, { hideForStzig: false });
  const maskedTotalSupply = maskText(totalSupply);
  const maskedCirculatingSupply = maskText(circulatingSupply);
  const change24hClass = isStzig
    ? "text-gray-400"
    : change24h != null && Number(change24h) >= 0
    ? "text-green-400"
    : "text-red-400";
  const txValueClass = isStzig ? "text-gray-400" : "text-green-400";
  const volValueClass = isStzig ? "text-gray-400" : "text-red-400";
  const buyValueClass = isStzig ? "text-gray-400" : "text-green-400";
  const sellValueClass = isStzig ? "text-gray-400" : "text-red-400";

  const changeColor = (v?: number) =>
    v && v > 0 ? "text-green-400" : v && v < 0 ? "text-red-400" : "text-white";

  const formatIntervalChange = (value?: number) =>
    isStzig || value == null ? "—" : `${value.toFixed(2)}%`;
  const formatIntervalVolume = (value?: number) =>
    isStzig ? "—" : value ? `$${toShort(value)}` : "0";

  const maskedBuys = maskNumber(data.buy, (n) => n.toString(), false);
  const maskedSells = maskNumber(data.sell, (n) => n.toString(), false);

  return (
    <div className="text-white w-full">
      <div className="my-3 rounded-lg border border-[#808080]/20">
        <div className="pt-4 px-4 grid grid-cols-2 gap-4">
          <div className="bg-[#171717] rounded-lg p-2">
            <p className="text-[#BCBCBC]/80 text-[.9rem] mb-1 text-center">
              Market Cap
            </p>
            <p className="text-white font-medium text-[1.2rem] text-center">
              {maskedMarketCap}
            </p>
          </div>
          <div className="bg-[#171717] rounded-lg p-2">
            <p className="text-[#BCBCBC]/80 text-[.9rem] mb-1 text-center">
              Liquidity
            </p>
            <p className="text-white font-medium text-[1.2rem] text-center">
              {maskedLiquidity}
            </p>
          </div>
          <div className="bg-[#171717] rounded-lg p-2">
            <p className="text-[#BCBCBC]/80 text-[.9rem] mb-1 text-center">
              24h Trades
            </p>
            <p className="text-white font-medium text-[1.2rem] text-center">
              {masked24hTrades}
            </p>
          </div>
          <div className="bg-[#171717] rounded-lg p-2">
            <p className="text-[#BCBCBC]/80 text-[.9rem] mb-1 text-center">
              Price Change 24h
            </p>
            <p
              className={`font-medium text-[1.2rem] text-center overflow-hidden ${
                change24hClass
              }`}
            >
              {maskedChange24hValue}
            </p>
          </div>
          <div className="bg-[#171717] rounded-lg p-2">
            <p className="text-[#BCBCBC]/80 text-[.9rem] mb-1 text-center">
              FDV
            </p>
            <p className="text-white font-medium text-[1.2rem] text-center">
              {maskedFDV}
            </p>
          </div>
          <div className="bg-[#171717] rounded-lg p-2">
            <p className="text-[#BCBCBC]/80 text-[.9rem] mb-1 text-center">
              24h Volume
            </p>
            <p className="text-white font-medium text-[1.2rem] text-center">
              {maskedVolume24h}
            </p>
          </div>
          <div className="bg-[#171717] rounded-lg p-2">
            <p className="text-[#BCBCBC]/80 text-[.9rem] mb-1 text-center">
              Total Supply
            </p>
            <p className="text-white font-medium text-[1.2rem] text-center">
              {maskedTotalSupply}
            </p>
          </div>
          <div className="bg-[#171717] rounded-lg p-2">
            <p className="text-[#BCBCBC]/80 text-[.9rem] mb-1 text-center">
              Circ Supply
            </p>
            <p className="text-white font-medium text-[1.2rem] text-center">
              {maskedCirculatingSupply}
            </p>
          </div>

          {/* Additional Info Boxes - Collapsible */}
          <div
            className={`transition-all duration-300 ease-in-out overflow-hidden col-span-2 ${
              showMoreInfo ? "max-h-[200px] opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-[#171717] rounded-lg p-2">
                <p className="text-[#BCBCBC]/80 text-[.9rem] mb-1 text-center">
                  Holders
                </p>
                <p className="text-white font-medium text-[1.2rem] text-center">
                  {data.holder}
                </p>
              </div>
              <div className="bg-[#171717] rounded-lg p-2">
                <p className="text-gray-400 text-[.9rem] mb-1 text-center">
                  Creation Date
                </p>
                <p className="text-white font-medium text-[1.2rem] text-center">
                  {data.creationTime
                    ? new Date(data.creationTime).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : "N/A"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <button
          className="bg-[#1A5346] rounded-b-lg w-full flex justify-center items-center gap-2 py-3 hover:bg-[#2a6b5a] transition-colors"
          onClick={() => setShowMoreInfo(!showMoreInfo)}
        >
          <p>More Info</p>
          <ChevronDown
            size={16}
            className={`text-white transition-transform duration-200 ${
              showMoreInfo ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>

      {/* ─── Price Chart Indicators ───────────────────────────── */}
      <div className="bg-black/60 border border-[#808080]/20 rounded-lg p-4 mb-4">
        <div className="grid grid-cols-4  gap-3 mb-4 text-center">
          {["30m", "1h", "4h", "24h"].map((p) => {
            const changeValue = data.priceChange?.[p];
            const volumeValue = data.volumeUSD?.[p];
            return (
              <div key={p} className="space-y-1">
                <div className="text-gray-400 text-sm">{p}</div>
                <div
                  className={`text-[1rem] font-medium ${
                    isStzig ? "text-gray-400" : changeColor(changeValue)
                  }`}
                >
                  {formatIntervalChange(changeValue)}
                </div>
                <div className="text-gray-400 text-xs">
                  {formatIntervalVolume(volumeValue)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-4 gap-3 mb-4 text-center">
          <div>
            <p className="text-gray-400 text-sm mb-1">Txs</p>
            <p className={`${txValueClass} font-medium`}>{masked24hTrades}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm mb-1">Vol</p>
            <p className={`${volValueClass} font-medium`}>{maskedVolume24h}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm mb-1">Buys</p>
            <p className={`${buyValueClass} font-medium`}>{maskedBuys}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm mb-1">Sells</p>
            <p className={`${sellValueClass} font-medium`}>{maskedSells}</p>
          </div>
          {/* <div>
            <p className="text-gray-400 text-sm mb-1">Total</p>
            <p className="text-white font-medium">{data.tradeCount?.total ?? "—"}</p>
          </div> */}
        </div>

        <div className=" shadow-sm">
          {/* Top row */}
          <div
            className="flex justify-between bg-[#0c0c0c] border border-gray-700 p-6 rounded-xl relative overflow-hidden items-start mb-[-10px] text-sm sm:text-base"
            style={{
              boxShadow:
                "0 4px 20px -5px rgba(32, 216, 124, 0.3), 0 4px 20px -5px rgba(246, 79, 57, 0.2)",
            }}
          >
            {/* Glow effect at bottom */}
            <div
              className="absolute bottom-0 left-0 right-0 h-1/2"
              style={{
                background: "linear-gradient(90deg, #20D87C 0%, #F64F39 100%)",
                opacity: 0.15,
                filter: "blur(8px)",
                transform: "translateY(50%)",
                zIndex: 0,
              }}
            ></div>
            <div className="text-left">
              <div className="text-gray-300 font-medium">
                Buys:{" "}
                <span className="text-white font-medium">
                  {data.buy ?? "—"}
                </span>
              </div>
              <div className="text-green-400 font-medium text-[0.95rem] sm:text-[1rem]">
                {toShort(data.vBuyUSD)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-gray-300 font-medium">
                Seller:{" "}
                <span className="text-white font-medium">
                  {data.sell ?? "—"}
                </span>
              </div>
              <div className="text-red-400 font-medium text-[0.95rem] sm:text-[1rem]">
                {toShort(data.vSellUSD)}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className=" w-full h-[6px] sm:h-[8px] relative">
            {/* Track with border */}
            <div className="absolute inset-0 rounded-full bg-black/30 border border-white/10"></div>

            {/* Progress bar with glow */}
            <div className="h-full flex relative z-10">
              {/* Buy section with glow */}
              <div className="relative" style={{ width: `${buyPct}%` }}>
                <div
                  className="absolute -inset-0.5 rounded-full"
                  style={{
                    background:
                      "linear-gradient(90deg, #20D87C 0%, #20D87C 100%)",
                    filter: "blur(4px)",
                    opacity: 0.6,
                    zIndex: -1,
                  }}
                ></div>
                <div className="h-full w-full bg-[#20D87C] rounded-l-full transition-all duration-300 ease-out relative overflow-hidden">
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(90deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 50%)",
                      pointerEvents: "none",
                    }}
                  ></div>
                </div>
              </div>

              {/* Sell section with glow */}
              <div className="relative" style={{ width: `${sellPct}%` }}>
                <div
                  className="absolute -inset-0.5 rounded-full"
                  style={{
                    background:
                      "linear-gradient(90deg, #F64F39 0%, #FF0000 100%)",
                    filter: "blur(4px)",
                    opacity: 0.6,
                    zIndex: -1,
                  }}
                ></div>
                <div className="h-full w-full bg-[#F64F39] rounded-r-full transition-all duration-300 ease-out relative overflow-hidden">
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(90deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 50%)",
                      pointerEvents: "none",
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
