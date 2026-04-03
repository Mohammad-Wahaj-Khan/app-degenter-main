"use client";

import { useMemo, useState, useCallback } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { Info, Activity, Zap } from "lucide-react";

type Token = {
  symbol: string;
  name: string;
  priceChange?: Record<string, number> | number;
};

type Props = {
  data: Token[];
};

const FRAMES = ["30m", "1h", "4h", "24h"] as const;
const FRAME_LABELS = ["30M", "1H", "4H", "24H"];

const normalizeTimeFrame = (value: string) => value.trim().toLowerCase();

const getPriceChange = (token: Token, frame: string) => {
  if (typeof token.priceChange === "number") return token.priceChange;
  if (!token.priceChange) return 0;
  return token.priceChange?.[normalizeTimeFrame(frame)] ?? 0;
};

const getVolumeUsd = (token: Token, frame: string) => {
  const key = normalizeTimeFrame(frame);
  const volumeUSD = (token as any).volumeUSD?.[key];
  if (typeof volumeUSD === "number") return volumeUSD;
  if (typeof (token as any).volUsd === "number") return (token as any).volUsd;
  return (token as any).volume?.[key] ?? 0;
};

const PALETTE = [
  "#38bdf8", "#fbbf24", "#818cf8", "#34d399", "#f472b6", 
  "#fb7185", "#a78bfa", "#22d3ee", "#fb923c", "#94a3b8", "#6EE7B7"
];

const NativeTokenPerformancePanel = ({ data }: Props) => {
  const [selectedFrame, setSelectedFrame] = useState<(typeof FRAMES)[number]>("24h");
  const [hoveredLine, setHoveredLine] = useState<string | null>(null);

  const series = useMemo(() => {
    const normalized = data.map((token) => ({
      ...token,
      change: getPriceChange(token, selectedFrame),
      volume24h: getVolumeUsd(token, "24h"),
    }));

    const sorted = normalized
      .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0))
      .slice(0, 20);

    const chartData = FRAMES.map((f) => {
      const row: any = { name: f.toUpperCase() };
      sorted.forEach((t) => {
        row[t.symbol] = typeof t.priceChange === "number" ? t.priceChange : (t.priceChange?.[normalizeTimeFrame(f)] ?? 0);
      });
      return row;
    });

    return { chartData, sorted };
  }, [data, selectedFrame]);

  // Performance optimization: memoize hover handlers
  const onHover = useCallback((symbol: string | null) => setHoveredLine(symbol), []);

  return (
    <div className="flex flex-col h-full bg-[#030303] text-zinc-400 font-sans select-none overflow-hidden">
      {/* Dynamic Header */}
      <header className="px-6 py-5 flex items-center justify-between border-b border-white/[0.04] bg-gradient-to-b from-white/[0.02] to-transparent">
        {/* <div className="flex items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-indigo-500 blur-lg opacity-20 animate-pulse" />
            <div className="relative p-2.5 bg-zinc-900 border border-white/10 rounded-xl">
              <Zap size={18} className="text-indigo-400" />
            </div>
          </div>
          <div>
            <h2 className="text-sm font-black text-white tracking-widest flex items-center gap-2">
              QUANTUM PERFORMANCE
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-[8px] border border-emerald-500/20">LIVE</span>
            </h2>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em]">Asset Volatility Heatmap</p>
          </div>
        </div> */}

        <div className="flex bg-zinc-900/80 p-1 rounded-xl border border-white/5 backdrop-blur-xl">
          {FRAMES.map((frame, i) => (
            <button
              key={frame}
              onClick={() => setSelectedFrame(frame)}
              className={`px-5 py-2 rounded-lg text-[10px] font-black transition-all duration-200 ${
                selectedFrame === frame 
                ? " text-white shadow-[0_0_20px_rgba(79,70,229,0.4)]" 
                : "text-zinc-500 hover:text-zinc-300 "
              }`}
            >
              {FRAME_LABELS[i]}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-1 min-h-0 relative">
        {/* Main Chart Area */}
        <section className="flex-1 relative mt-4 ml-4">
          <ResponsiveContainer width="98%" height="95%">
            <LineChart 
              data={series.chartData}
              margin={{ top: 20, right: 80, left: 0, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.02)" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#444', fontSize: 10, fontWeight: 800 }}
              />
              <YAxis 
                hide 
                domain={['auto', 'auto']}
              />
              
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />

              {series.sorted.map((token, index) => {
                const isHovered = hoveredLine === token.symbol;
                const color = PALETTE[index % PALETTE.length];
                
                return (
                  <Line
                    key={token.symbol}
                    type="monotone"
                    dataKey={token.symbol}
                    stroke={color}
                    strokeWidth={isHovered ? 4 : 1.5}
                    dot={false}
                    isAnimationActive={false} // Prevents lag on frame switch
                    connectNulls
                    style={{ 
                      opacity: hoveredLine ? (isHovered ? 1 : 0.1) : 0.7,
                      filter: isHovered ? `drop-shadow(0 0 8px ${color})` : 'none',
                      transition: 'stroke-width 0.2s, opacity 0.2s',
                    }}
                  />
                );
              })}
              
              {/* Dynamic Labels that track the end of the line */}
              {series.sorted.map((token, index) => {
                const lastVal = series.chartData[series.chartData.length - 1][token.symbol];
                const isHovered = hoveredLine === token.symbol;
                if (hoveredLine && !isHovered) return null;

                return (
                  <ReferenceLine
                    key={`label-${token.symbol}`}
                    x="24H"
                    y={lastVal}
                    label={{
                      position: 'right',
                      value: `${token.symbol} ${lastVal >= 0 ? '+' : ''}${lastVal.toFixed(1)}%`,
                      fill: PALETTE[index % PALETTE.length],
                      fontSize: 10,
                      fontWeight: 900,
                      className: "transition-all duration-300"
                    }}
                    stroke="none"
                  />
                );
              })}

              <Tooltip
                content={() => null} // Hide tooltip to reduce lag
                // cursor={{ stroke: 'rgba(255,255,255,0.05)', strokeWidth: 40 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </section>

        {/* Right Rankings Sidebar */}
        <aside className="w-72 border-l border-white/[0.04] bg-[#080808]/50 backdrop-blur-md p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-6 border-b border-white/5 pb-4">
            <Activity size={14} className="text-zinc-500" />
            <span className="text-[10px] font-black text-white uppercase tracking-widest">Market Hierarchy</span>
          </div>
          
          <div className="space-y-1 overflow-y-auto flex-1 custom-scrollbar pr-2">
            {series.sorted.map((token, i) => (
              <div 
                key={token.symbol}
                onMouseEnter={() => onHover(token.symbol)}
                onMouseLeave={() => onHover(null)}
                className={`group flex items-center justify-between p-3 rounded-xl transition-all duration-200 cursor-crosshair border ${
                  hoveredLine === token.symbol 
                  ? 'bg-white/5 border-white/10 translate-x-1' 
                  : 'bg-transparent border-transparent opacity-60 hover:opacity-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-[9px] font-mono text-zinc-600 w-4">0{i + 1}</span>
                  <div className="w-1.5 h-1.5 rounded-full shadow-[0_0_8px_currentColor]" style={{ color: PALETTE[i % PALETTE.length], backgroundColor: 'currentColor' }} />
                  <span className="text-xs font-black text-zinc-200 group-hover:text-white transition-colors">{token.symbol}</span>
                </div>
                <div className={`text-[11px] font-mono font-bold ${
                  token.change >= 0 ? "text-emerald-400" : "text-rose-500"
                }`}>
                  {token.change >= 0 ? "▲" : "▼"} {Math.abs(token.change).toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* <footer className="px-6 py-3 border-t border-white/[0.03] bg-white/[0.01] flex items-center justify-between text-[9px] font-bold text-zinc-600 uppercase tracking-widest">
        <div className="flex gap-6">
          <span className="flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-emerald-500" /> Engine: WebGL Accelerated</span>
          <span>Refresh: 1000ms</span>
        </div>
        <div className="flex items-center gap-2">
          <Info size={12} className="opacity-50" />
          Sorted by Price Performance
        </div>
      </footer> */}
    </div>
  );
};

export default NativeTokenPerformancePanel;
