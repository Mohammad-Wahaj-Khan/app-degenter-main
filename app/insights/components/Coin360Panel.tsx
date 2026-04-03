"use client";

import { useMemo, useState } from "react";
import { Info, TrendingUp, TrendingDown, Activity } from "lucide-react";

type Token = {
  symbol: string;
  name: string;
  imageUri?: string;
  mcapUsd?: number;
  priceChange?: Record<string, number> | number;
  priceUsd?: number;
  volume?: Record<string, number>;
  volumeUSD?: Record<string, number>;
  volUsd?: number;
};

type Coin360PanelProps = {
  data: Token[];
};

const normalizeTimeFrame = (value: string) => value.trim().toLowerCase();

const getVolumeUsd = (token: Token, frame: string) => {
  const key = normalizeTimeFrame(frame);
  const frameVolume = token.volumeUSD?.[key];
  if (typeof frameVolume === "number") return frameVolume;
  if (typeof token.volUsd === "number") return token.volUsd;
  return token.volume?.[key] ?? 0;
};

const getPriceChange = (token: Token, frame: string) => {
  if (typeof token.priceChange === "number") return token.priceChange;
  if (!token.priceChange) return 0;
  const key = normalizeTimeFrame(frame);
  return token.priceChange?.[key] ?? 0;
};

const formatPct = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

const formatCurrency = (value: number) => {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return `$${value.toLocaleString()}`;
};

const Coin360Panel = ({ data }: Coin360PanelProps) => {
  const [hoveredSymbol, setHoveredSymbol] = useState<string | null>(null);
  const timeFrame = "24h";

  const tokens = useMemo(() => {
    const filtered = data
      .map((token) => {
        const volume = getVolumeUsd(token, timeFrame);
        return {
          ...token,
          volume,
          change: getPriceChange(token, timeFrame),
        };
      })
      .filter((token) => token.volume > 0);

    const totalVolume = filtered.reduce((sum, token) => sum + token.volume, 0);

    return filtered
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 24) // Focused selection for better UI
      .map((token) => ({
        ...token,
        share: totalVolume ? (token.volume / totalVolume) * 100 : 0,
      }));
  }, [data]);

  return (
    <div className="flex flex-col h-full bg-[#050505] text-zinc-100 font-sans selection:bg-orange-500/30">
      {/* Premium Header */}
      <header className="sticky top-0 z-20 backdrop-blur-md bg-black/40 p-5 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-500 rounded-lg shadow-[0_0_20px_rgba(249,115,22,0.4)]">
            <Activity size={18} className="text-black" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-zinc-500 bg-clip-text text-transparent">
              Market Heatmap
            </h1>
            <p className="text-[10px] text-zinc-500 font-medium tracking-widest uppercase">Real-time Analytics</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-bold text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            LIVE MARKET
          </div>
          <button className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
            <Info size={18} className="text-zinc-400" />
          </button>
        </div>
      </header>

      {/* Main Visual Grid */}
      <section className="flex-1 p-6 overflow-y-auto custom-scrollbar">
        {tokens.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-50">
            <div className="w-12 h-12 border-2 border-dashed border-zinc-700 rounded-full animate-spin" />
            <p className="text-sm font-medium">Scanning blockchain for data...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {tokens.map((token) => {
              const isPositive = token.change >= 0;
              const isHovered = hoveredSymbol === token.symbol;

              return (
                <article
                  key={token.symbol}
                  onMouseEnter={() => setHoveredSymbol(token.symbol)}
                  onMouseLeave={() => setHoveredSymbol(null)}
                  className={`relative group cursor-pointer overflow-hidden rounded-3xl border transition-all duration-500 ease-out
                    ${isPositive 
                      ? 'border-emerald-500/20 bg-emerald-500/[0.02] hover:bg-emerald-500/[0.08]' 
                      : 'border-rose-500/20 bg-rose-500/[0.02] hover:bg-rose-500/[0.08]'
                    }
                    ${isHovered ? 'scale-[1.02] -translate-y-1 shadow-2xl' : 'scale-100'}
                  `}
                >
                  {/* Performance Glow */}
                  <div className={`absolute -right-8 -top-8 w-32 h-32 blur-[60px] opacity-20 transition-opacity duration-700
                    ${isPositive ? 'bg-emerald-500' : 'bg-rose-500'}
                    ${isHovered ? 'opacity-40' : 'opacity-20'}
                  `} />

                  <div className="relative p-5 flex flex-col h-full justify-between gap-6">
                    {/* Top Row: Identity */}
                    <div className="flex justify-between items-start">
                      <div className="flex gap-3 items-center">
                        {token.imageUri ? (
                          <img src={token.imageUri} alt={token.symbol} className="w-10 h-10 rounded-full bg-zinc-800 p-0.5" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-xs">
                            {token.symbol[0]}
                          </div>
                        )}
                        <div>
                          <h2 className="text-base font-bold text-white tracking-tight">{token.name}</h2>
                          <span className="text-[10px] font-black text-zinc-500 tracking-tighter uppercase">{token.symbol}</span>
                        </div>
                      </div>
                      
                      <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold
                        ${isPositive ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}
                      `}>
                        {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {formatPct(token.change)}
                      </div>
                    </div>

                    {/* Middle Row: Volume Stats */}
                    <div>
                      <div className="flex justify-between items-end mb-2">
                        <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">24H Volume</span>
                        <span className="text-sm font-mono font-medium text-white">{formatCurrency(token.volume)}</span>
                      </div>
                      
                      {/* Custom Progress Bar */}
                      <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden border border-white/5">
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(255,255,255,0.1)]
                            ${isPositive ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' : 'bg-gradient-to-r from-rose-600 to-rose-400'}
                          `}
                          style={{ width: `${Math.max(token.share, 2)}%` }}
                        />
                      </div>
                    </div>

                    {/* Bottom Row: Market Share */}
                    <div className="flex justify-between items-center pt-2">
                       <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-tight">Dominance</span>
                       <span className="text-xs font-bold text-zinc-300 bg-white/5 px-2 py-0.5 rounded-md">
                        {token.share.toFixed(2)}%
                       </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
};

export default Coin360Panel;