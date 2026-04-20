"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { Zap, Layers, BarChart3, Users, ChevronRight } from "lucide-react";
import { storeTokenRoute } from "@/lib/token-routing";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://main-api.degenter.io"
).replace(/\/+$/, "");
const TOKENS_URL = `${API_BASE}/tokens?bucket=24h&priceSource=best&dir=desc&includeChange=1&limit=200&offset=0&sort=volume`;
const MISS_EDIT_URL = `${API_BASE}/tokens/missedit`;

type MemeTokenRow = {
  symbol: string;
  tokenId: string; // Added to fetch OHLCV
  denom: string;
  name: string;
  imageUri: string;
  marketCap: number;
  price: number;
  change24h: number;
  volume24h: number;
  tvl: number;
  txns: number;
  traders: number;
  fdv: number;
};

/**
 * NEW: Component to fetch and render actual performance data
 */
const TokenSparkline = ({ tokenId, color }: { tokenId: string; color: string }) => {
  const [data, setData] = useState<{ v: number }[]>([]);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`${API_BASE}/tokens/${encodeURIComponent(tokenId)}/ohlcv`);
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          // Map API "close" prices to the chart format
          const points = json.data.map((item: any) => ({
            v: item.close,
          }));
          setData(points);
        }
      } catch (e) {
        console.error("Failed to fetch sparkline", e);
      }
    };
    fetchHistory();
  }, [tokenId]);

  if (data.length === 0) return <div className="h-full w-full bg-white/5 animate-pulse rounded" />;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id={`g-${tokenId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis domain={["dataMin", "dataMax"]} hide />
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#g-${tokenId})`}
          isAnimationActive={true}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

const parseTokensPayload = (payload: any) => {
  if (!payload) return [];
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
};

const parseNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const EXCLUDED_SYMBOLS = new Set([
  "stzig",
  "st-zig",
  "usdc",
  "usdt",
  "statom",
  "atom",
  "wbtc",
  "weth",
  "eth",
  "neiro",
]);

const shouldExcludeToken = (token: any) => {
  const normalizedSymbol = (token.symbol ?? token.tokenId ?? "").toString().toLowerCase();
  const denom = (token.denom ?? "").toString().toLowerCase();
  return EXCLUDED_SYMBOLS.has(normalizedSymbol) || denom.includes("stzig");
};

const normalizeToken = (token: any): MemeTokenRow => {
  const symbol = token.symbol ?? token.tokenId ?? "N/A";
  const denom = (token.denom ?? token.tokenId ?? symbol).toString();
  const tokenId = denom; // API fetch key should stay denom-first, including ibc/... denoms.
  
  return {
    symbol: symbol.toString().toUpperCase(),
    tokenId,
    name: token.name ?? symbol,
    imageUri: token.imageUri ?? "",
    marketCap: parseNumber(token.mcapUsd) || parseNumber(token.mcap) || 0,
    price: parseNumber(token.priceUsd) || parseNumber(token.priceInUsd) || 0,
    change24h: parseNumber(token.change24hPct) || parseNumber(token.priceChange?.["24h"]) || 0,
    volume24h: parseNumber(token.volUsd) || parseNumber(token.volumeUSD?.["24h"]) || 0,
    tvl: parseNumber(token.liquidityUsd) || 0,
    txns: parseNumber(token.tx),
    traders: parseNumber(token.uniqueTraders) || parseNumber(token.holders) || 0,
    fdv: parseNumber(token.fdvUsd) || 0,
    denom,
  };
};

const isVisibleTokenRow = (token: MemeTokenRow) => {
  return token.symbol !== "N/A" && token.tokenId !== "N/A";
};

const formatLargeCurrency = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  return `$${value.toLocaleString()}`;
};

const formatExactPrice = (value: number) => {
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value === 0) return "$0.00";
  return `$${value.toFixed(8)}`;
};

const MemesToken = () => {
  const [rows, setRows] = useState<MemeTokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [tokensJson, misseditJson] = await Promise.all([
          fetch(TOKENS_URL).then((res) => res.json()),
          fetch(MISS_EDIT_URL).then((res) => res.json()),
        ]);
        if (!active) return;

        const tokensPayload = parseTokensPayload(tokensJson);
        let normalized = tokensPayload
          .filter((token: any) => token && token.symbol && !shouldExcludeToken(token))
          .map(normalizeToken)
          .filter(isVisibleTokenRow);

        const misseditRow = misseditJson?.success && misseditJson.data ? normalizeToken(misseditJson.data) : null;
        if (misseditRow && !shouldExcludeToken(misseditRow) && isVisibleTokenRow(misseditRow)) {
          normalized = [misseditRow, ...normalized.filter((t: { symbol: string; }) => t.symbol !== misseditRow.symbol)];
        }

        setRows(normalized.sort((a: { volume24h: number; }, b: { volume24h: number; }) => b.volume24h - a.volume24h).slice(0, 10));
      } catch (err) {
        console.error("Board error", err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-[#030303] font-black tracking-tighter animate-pulse">
      INITIALIZING PERFORMANCE TERMINAL...
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-[#030303] text-zinc-300 font-sans p-6 overflow-hidden">
      
      {/* --- STATS BAR --- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Active Memes", value: rows.length, icon: <Layers size={14}/>, color: "text-indigo-400" },
          { label: "24h Volume", value: formatLargeCurrency(rows.reduce((a,b)=>a+b.volume24h,0)), icon: <Zap size={14}/>, color: "text-amber-400" },
          { label: "Market Cap", value: formatLargeCurrency(rows.reduce((a,b)=>a+b.marketCap,0)), icon: <BarChart3 size={14}/>, color: "text-rose-400" },
          { label: "Holders", value: rows.reduce((a,b)=>a+b.traders,0).toLocaleString(), icon: <Users size={14}/>, color: "text-emerald-400" },
        ].map((s, i) => (
          <div key={i} className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-5 backdrop-blur-md group hover:bg-white/[0.04] transition-all">
            <div className="flex items-center gap-2 mb-2 text-zinc-500">
              <span className={s.color}>{s.icon}</span>
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">{s.label}</span>
            </div>
            <div className="text-2xl font-black text-white">{s.value}</div>
          </div>
        ))}
      </div>

      {/* --- TABLE --- */}
      <div className="flex-1 bg-white/[0.01] border border-white/[0.05] rounded-[2.5rem] overflow-hidden backdrop-blur-3xl flex flex-col shadow-2xl">
        <div className="grid grid-cols-6 gap-4 px-8 py-6 border-b border-white/[0.05] text-[10px] font-black text-zinc-500 uppercase tracking-widest bg-white/[0.02]">
          <div className="">Asset</div>
          <div className="">24h Performance</div>
          <div className=" text-right">Price</div>
          <div className=" text-right">24h Volume</div>
          <div className=" text-right">Market Cap</div>
          <div className=" text-right">Activity</div>



                    {/*<div className="col-span-4">Asset</div> <div className="col-span-2">24h Performance</div>
          <div className="col-span-2 text-right">Price</div>
          <div className="col-span-2 text-right">24h Volume</div>
          <div className="col-span-2 text-right">Market Cap</div>
          <div className="col-span-2 text-right">Activity</div> */}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {rows.map((token, idx) => {
            const chartColor = token.change24h >= 0 ? "#10b981" : "#f43f5e";
            
            return (
              <div
                key={token.symbol}
                onMouseEnter={() => setHoveredRow(token.symbol)}
                onMouseLeave={() => setHoveredRow(null)}
                className={`grid grid-cols-6 gap-4 px-8 py-5 items-center transition-all duration-300 border-b border-white/[0.02] group cursor-pointer ${
                  hoveredRow === token.symbol ? "bg-white/[0.05] translate-x-1" : ""
                }`}
              >
                {/* Asset Info col-span-4*/}
                <div className=" flex items-center gap-4">
                  <span className="text-[10px] font-mono text-zinc-600 w-4">{idx + 1}</span>
                  <div className="relative w-11 h-11">
                    <div className="absolute inset-0 bg-indigo-500/20 blur-lg rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                    {token.imageUri ? (
                      <img 
                        src={token.imageUri} 
                        alt="" 
                        className="relative w-full h-full rounded-2xl object-cover border border-white/10 group-hover:scale-110 transition-transform duration-500" 
                      />
                    ) : (
                      <div className="relative w-full h-full rounded-2xl bg-gradient-to-br from-zinc-700 to-zinc-900 flex items-center justify-center border border-white/10 text-xs font-black text-white">
                        {token.symbol[0]}
                      </div>
                    )}
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/token/${encodeURIComponent(
                            storeTokenRoute(token.denom, token.symbol, token.tokenId)
                          )}`
                        )
                      }
                      className="text-sm font-black text-white  transition-colors text-left"
                    >
                      {token.symbol}
                    </button>
                    <div className="text-[10px] font-bold text-zinc-500 uppercase truncate max-w-[120px]">{token.name}</div>
                  </div>
                </div>

                {/* Performance Sparkline (Live Data) */}
                <div className=" h-10 w-full pr-4">
                  <TokenSparkline tokenId={token.tokenId} color={chartColor} />
                </div>

                {/* Price */}
                <div className=" text-right">
                  <div className="text-xs font-black text-white font-mono">{formatExactPrice(token.price)}</div>
                  <div className={`text-[10px] font-black ${token.change24h >= 0 ? "text-emerald-400" : "text-rose-500"}`}>
                    {token.change24h >= 0 ? "▲" : "▼"} {Math.abs(token.change24h).toFixed(2)}%
                  </div>
                </div>

                {/* Volume */}
                <div className=" text-right">
                  <div className="text-xs font-bold text-zinc-300 font-mono">{formatLargeCurrency(token.volume24h)}</div>
                </div>

                {/* Mcap */}
                <div className=" text-right">
                  <div className="text-xs font-bold text-zinc-300 font-mono">{formatLargeCurrency(token.marketCap)}</div>
                </div>

                {/* Activity */}
                <div className=" text-right flex items-center justify-end gap-3">
                  <div className="text-right">
                    <div className="text-[11px] font-black text-white">{token.traders.toLocaleString()}</div>
                    <div className="text-[8px] font-black text-zinc-600 uppercase">Holders</div>
                  </div>
                  <ChevronRight size={14} className="text-zinc-800 group-hover:text-indigo-500 transition-colors" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MemesToken;
