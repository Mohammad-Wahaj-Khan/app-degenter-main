'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Activity, Crown, Clock } from 'lucide-react';
import { createChart, ColorType, UTCTimestamp } from 'lightweight-charts';
import Link from 'next/link';
import { API_BASE_URL, API_HEADERS } from '@/lib/api';
import { storeTokenRoute } from '@/lib/token-routing';

interface Token {
  rank: number;
  symbol: string;
  name: string;
  priceUsd: number;
  holders: number;
  mcapUsd: number | null;
  volUsd: number;
  imageUri: string;
  change24hPct?: number;
  tokenId?: string;
  changePct?: ChangePct;
  candles: OhlcvPoint[];
}

const API_URL = API_BASE_URL;

const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
const formatExactPrice = (value: number) => {
  if (!Number.isFinite(value)) return '—';
  if (value >= 100) return `$${value.toFixed(2)}`;
  if (value >= 1) return `$${value.toFixed(4)}`;
  if (value >= 0.01) return `$${value.toFixed(6)}`;
  return `$${value.toFixed(8)}`;
};

type OhlcvPoint = {
  ts_sec: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  trades?: number;
};

type ChangePct = {
  "30m"?: number;
  "4h"?: number;
  "24h"?: number;
};

type MoversApiToken = {
  tokenId?: number | string;
  denom?: string;
  symbol?: string;
  name?: string;
  priceUsd?: number;
  holders?: number;
  mcapUsd?: number | null;
  volUsd?: number;
  imageUri?: string;
  change24hPct?: number;
  changePct?: ChangePct;
  candles1d?: Array<{
    ts: string;
    o: number;
    h: number;
    l: number;
    c: number;
    v?: number;
    trades?: number;
  }>;
};

type MoversApiResponse = {
  success?: boolean;
  data?: {
    gainers?: MoversApiToken[];
    losers?: MoversApiToken[];
  };
};

const normalizeCandle = (candle: NonNullable<MoversApiToken['candles1d']>[number]): OhlcvPoint => ({
  ts_sec: Math.floor(new Date(candle.ts).getTime() / 1000),
  open: candle.o,
  high: candle.h,
  low: candle.l,
  close: candle.c,
  volume: candle.v,
  trades: candle.trades
});

const mapMoverToken = (token: MoversApiToken, index: number): Token => ({
  rank: index + 1,
  symbol: token.symbol || 'UNKNOWN',
  name: token.name || token.symbol || 'Unknown',
  priceUsd: token.priceUsd || 0,
  holders: token.holders || 0,
  mcapUsd: token.mcapUsd ?? null,
  volUsd: token.volUsd || 0,
  imageUri: token.imageUri || '',
  change24hPct: token.change24hPct ?? token.changePct?.['24h'],
  tokenId: token.tokenId ? String(token.tokenId) : undefined,
  changePct: token.changePct || {},
  candles: Array.isArray(token.candles1d) ? token.candles1d.map(normalizeCandle) : []
});

const getTokenKey = (token: Token) => (token.tokenId || token.symbol || '').toLowerCase();
const getWindowChange = (token: Token, window: keyof ChangePct) => token.changePct?.[window] ?? 0;

const dedupeTokens = (list: Token[], window: keyof ChangePct) => {
  const unique = new Map<string, Token>();

  list.forEach((token) => {
    const key = getTokenKey(token);
    const existing = unique.get(key);
    if (!existing) {
      unique.set(key, token);
      return;
    }

    const currentAbsChange = Math.abs(getWindowChange(token, window));
    const existingAbsChange = Math.abs(getWindowChange(existing, window));

    if (currentAbsChange > existingAbsChange) {
      unique.set(key, token);
      return;
    }

    if (currentAbsChange === existingAbsChange && (token.volUsd || 0) > (existing.volUsd || 0)) {
      unique.set(key, token);
    }
  });

  return Array.from(unique.values());
};

const TradingViewChart = ({
  data,
  currentPrice,
  height = 200
}: {
  data: OhlcvPoint[];
  currentPrice?: number;
  height?: number;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || !data.length) return;
    const container = containerRef.current;
    const chart = createChart(container, {
      height,
      width: container.clientWidth,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(255,255,255,0.75)'
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.06)' },
        horzLines: { color: 'rgba(255,255,255,0.06)' }
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.2, bottom: 0.2 }
      },
      timeScale: { borderVisible: false },
      crosshair: { mode: 0 }
    });

    const series = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
      priceFormat: {
        type: 'price',
        precision: currentPrice && currentPrice < 1 ? 8 : 6,
        minMove: currentPrice && currentPrice < 1 ? 0.00000001 : 0.000001
      }
    });

    const slice = data.slice(-120);
    const closes = slice.map((d) => d.close).filter((v) => Number.isFinite(v));
    const medianClose = closes.length
      ? closes.sort((a, b) => a - b)[Math.floor(closes.length / 2)]
      : 0;
    const needsScale =
      currentPrice &&
      medianClose > 0 &&
      (medianClose / currentPrice > 10 || currentPrice / medianClose > 10);
    const scale = needsScale && currentPrice && medianClose ? currentPrice / medianClose : 1;

    series.setData(
      slice.map((d) => ({
        time: d.ts_sec as UTCTimestamp,
        open: d.open * scale,
        high: d.high * scale,
        low: d.low * scale,
        close: d.close * scale
      }))
    );

    chart.timeScale().fitContent();

    const handleResize = () => {
      chart.applyOptions({ width: container.clientWidth, height });
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [data, height, currentPrice]);

  return <div ref={containerRef} className="w-full h-full" />;
};

const Sparkline = ({
  data,
  isPositive,
  width = 96,
  height = 26,
  opacity = 1,
  strokeWidth = 1.5,
  showArea = false
}: {
  data: OhlcvPoint[];
  isPositive: boolean;
  width?: number;
  height?: number;
  opacity?: number;
  strokeWidth?: number;
  showArea?: boolean;
}) => {
  if (!data.length) {
    const midY = height / 2;
    const stroke = isPositive ? "#10b981" : "#ef4444";
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block"
        style={{ opacity: opacity * 0.6 }}
      >
        <line
          x1="2"
          y1={midY}
          x2={width - 2}
          y2={midY}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </svg>
    );
  }
  const pad = 2;
  const closes = data.map((d) => d.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const step = (width - pad * 2) / (closes.length - 1 || 1);
  const points = closes.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return `${x},${y}`;
  });
  
  const stroke = isPositive ? "#10b981" : "#ef4444";
  const gradientId = `gradient-${Math.random().toString(36).substr(2, 9)}`;
  
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block"
      style={{ opacity }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.3" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {showArea && (
        <polygon
          points={`${pad},${height - pad} ${points.join(' ')} ${width - pad},${height - pad}`}
          fill={`url(#${gradientId})`}
        />
      )}
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const FindGemsMain = () => {
  const [allTokens, setAllTokens] = useState<Token[]>([]);
  const [gainers, setGainers] = useState<Token[]>([]);
  const [losers, setLosers] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [hasRenderedInitialCards, setHasRenderedInitialCards] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [treemapWindow, setTreemapWindow] = useState<'30m' | '4h' | '24h'>('24h');
  const [heatmapTab, setHeatmapTab] = useState<'all' | 'gainers' | 'losers'>('all');
  
  useEffect(() => {
    const fetchTokens = async () => {
      try {
        setLoading(true);
        setError(null);
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(typeof API_HEADERS === 'object' && API_HEADERS !== null ? Object.fromEntries(Object.entries(API_HEADERS).map(([k, v]) => [k, String(v)])) : {}),
        };

        const response = await fetch(
          `${API_URL}/tokens/movers?chartTf=${encodeURIComponent(treemapWindow)}&includeCandles=1&sparkLimit=30`,
          { headers }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch token movers');
        }

        const moversData = (await response.json()) as MoversApiResponse;
        const gainersList = Array.isArray(moversData.data?.gainers) ? moversData.data.gainers : [];
        const losersList = Array.isArray(moversData.data?.losers) ? moversData.data.losers : [];

        const isNativeZig = (token: MoversApiToken) =>
          String(token.symbol || "").toLowerCase() === "zig" ||
          String(token.denom || "").toLowerCase() === "uzig";

        const mappedGainers = gainersList
          .filter((token) => token.symbol && (isNativeZig(token) || (token.priceUsd || 0) > 0))
          .map(mapMoverToken);
        const mappedLosers = losersList
          .filter((token) => token.symbol && (isNativeZig(token) || (token.priceUsd || 0) > 0))
          .map(mapMoverToken);

        const uniq = new Map<string, Token>();
        [...mappedGainers, ...mappedLosers].forEach((token) => {
          const key = getTokenKey(token);
          if (!uniq.has(key)) {
            uniq.set(key, token);
          }
        });
        const mergedAllTokens = Array.from(uniq.values()).sort((a, b) => (b.volUsd || 0) - (a.volUsd || 0));

        setAllTokens(mergedAllTokens);
        setGainers(mappedGainers);
        setLosers(mappedLosers);
      } catch {
        setError('Failed to fetch tokens');
      } finally {
        setLoading(false);
        setHasLoadedOnce(true);
      }
    };
    fetchTokens();
  }, [treemapWindow]);

  const topGainers = useMemo(() => gainers.slice(0, 10), [gainers]);
  const topLosers = useMemo(() => losers.slice(0, 10), [losers]);

  const heatmapTokens = useMemo(() => {
    if (heatmapTab === 'gainers') {
      return dedupeTokens(gainers, treemapWindow)
        .filter((token) => getWindowChange(token, treemapWindow) > 0)
        .sort((a, b) => {
          const changeDiff = getWindowChange(b, treemapWindow) - getWindowChange(a, treemapWindow);
          if (changeDiff !== 0) return changeDiff;
          return (b.volUsd || 0) - (a.volUsd || 0);
        });
    }

    if (heatmapTab === 'losers') {
      return dedupeTokens(losers, treemapWindow)
        .filter((token) => getWindowChange(token, treemapWindow) < 0)
        .sort((a, b) => {
          const changeDiff = getWindowChange(a, treemapWindow) - getWindowChange(b, treemapWindow);
          if (changeDiff !== 0) return changeDiff;
          return (b.volUsd || 0) - (a.volUsd || 0);
        });
    }

    return allTokens;
  }, [allTokens, gainers, losers, heatmapTab, treemapWindow]);

  useEffect(() => {
    if (!loading && heatmapTokens.length > 0 && !hasRenderedInitialCards) {
      setHasRenderedInitialCards(true);
    }
  }, [loading, heatmapTokens.length, hasRenderedInitialCards]);

  const shouldShowSkeleton = loading || !hasLoadedOnce;
  const shouldShowEmptyState =
    hasLoadedOnce && !loading && !error && heatmapTokens.length === 0;

  const getIntensityColor = (change: number) => {
    const absChange = Math.abs(change);
    if (change >= 0) {
      if (absChange > 20) return 'from-emerald-600 to-emerald-400';
      if (absChange > 10) return 'from-emerald-700 to-emerald-500';
      if (absChange > 5) return 'from-emerald-800 to-emerald-600';
      return 'from-emerald-900 to-emerald-700';
    } else {
      if (absChange > 20) return 'from-rose-600 to-rose-400';
      if (absChange > 10) return 'from-rose-700 to-rose-500';
      if (absChange > 5) return 'from-rose-800 to-rose-600';
      return 'from-rose-900 to-rose-700';
    }
  };

  const renderHeatmapSkeleton = (key: string, isTop3: boolean, isPositive: boolean) => {
    const intensity = getIntensityColor(isPositive ? 12 : -12);

    return (
      <div
        key={key}
        className={`relative overflow-hidden rounded-2xl ${isTop3 ? 'col-span-2 row-span-2' : ''}`}
      >
        <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${intensity} opacity-75`} />
        <div className="absolute inset-0 animate-pulse rounded-2xl bg-black/20" />

        <div className="relative flex h-full flex-col justify-between p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className={`rounded-full bg-white/20 ring-2 ring-white/10 ${isTop3 ? 'h-12 w-12' : 'h-8 w-8'}`} />
              <div className="space-y-2">
                <div className={`rounded-full bg-white/20 ${isTop3 ? 'h-5 w-20' : 'h-4 w-14'}`} />
                {isTop3 ? <div className="h-3 w-24 rounded-full bg-white/10" /> : null}
              </div>
            </div>

            {isTop3 ? <div className="h-8 w-14 rounded-full bg-white/15" /> : null}
          </div>

          <div className="space-y-3">
            <div className={`rounded-full bg-white/20 ${isTop3 ? 'h-10 w-28' : 'h-7 w-20'}`} />
            <div className={`rounded-2xl bg-white/10 ${isTop3 ? 'h-12 w-full' : 'h-8 w-full'}`} />
          </div>
        </div>

        {isTop3 ? (
          <div className="absolute bottom-0 right-0 h-32 w-32 rounded-tl-full bg-gradient-to-tl from-white/10 to-transparent" />
        ) : null}
      </div>
    );
  };

  const renderHeatmapCard = (token: Token, index: number, isTop3: boolean) => {
    const changePct = token.changePct || {};
    const change = changePct[treemapWindow] || 0;
    const isPos = change >= 0;
    const intensity = getIntensityColor(change);
    const tokenPath = encodeURIComponent(
      storeTokenRoute(token.tokenId, token.symbol)
    );
    const allowEntranceAnimation = hasRenderedInitialCards;

    return (
      <motion.div
        key={`${getTokenKey(token)}-${treemapWindow}`}
        layout
        initial={allowEntranceAnimation ? { opacity: 0, scale: 0.96 } : false}
        animate={{ opacity: 1, scale: 1 }}
        exit={allowEntranceAnimation ? { opacity: 0, scale: 0.98 } : { opacity: 0 }}
        transition={{ duration: 0.2, delay: allowEntranceAnimation ? index * 0.01 : 0 }}
        className={`relative group rounded-2xl cursor-pointer transition-all duration-500 [perspective:1200px] ${
          isTop3 ? 'col-span-2 row-span-2' : ''
        }`}
      >
        <div className="relative h-full w-full overflow-hidden rounded-2xl">
          <div className="relative h-full w-full transition-transform duration-700 [transform-style:preserve-3d] group-hover:[transform:rotateY(180deg)]">
          {/* Front face */}
          <div className="absolute inset-0 rounded-2xl [backface-visibility:hidden]">
            <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${intensity} opacity-90 group-hover:opacity-100 transition-opacity`} />
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />

            <div className="relative h-full p-4 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <Link href={`/token/${tokenPath}`} className="flex items-center gap-2">
                  <img
                    src={token.imageUri}
                    className={`rounded-full ring-2 ring-white/20 ${isTop3 ? 'w-12 h-12' : 'w-8 h-8'}`}
                    alt={token.symbol}
                  />
                  <div>
                    <span className={`font-bold text-white ${isTop3 ? 'text-2xl' : 'text-lg'}`}>
                      {token.symbol}
                    </span>
                    {isTop3 && (
                      <p className="text-white/70 text-sm">{token.name}</p>
                    )}
                  </div>
                </Link>
                
                {isTop3 && (
                  <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-yellow-400/20 border border-yellow-400/30">
                    <Crown size={16} className="text-yellow-300" />
                    <span className="text-yellow-300 font-bold text-sm">#{index + 1}</span>
                  </div>
                )}
              </div>

              <div className="mt-auto">
                <div className={`font-bold text-white ${isTop3 ? 'text-4xl' : 'text-2xl'} drop-shadow-lg`}>
                  {formatPercent(change)}
                </div>
                
                <div className={`mt-2 ${isTop3 ? 'h-12' : 'h-8'}`}>
                  {token.candles.length ? (
                    <Sparkline
                      data={token.candles}
                      isPositive={isPos}
                      width={isTop3 ? 200 : 120}
                      height={isTop3 ? 48 : 32}
                      opacity={0.8}
                      showArea={true}
                    />
                  ) : (
                    <div className="h-full flex items-center text-white/40 text-xs">No data</div>
                  )}
                </div>
              </div>
            </div>

            {isTop3 && (
              <div className="absolute bottom-0 right-0 w-32 h-32 bg-gradient-to-tl from-white/10 to-transparent rounded-tl-full" />
            )}
          </div>

          {/* Back face */}
          <div className="absolute inset-0 rounded-2xl [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${intensity} opacity-95`} />
            <div className="absolute inset-0 rounded-2xl bg-black/35" />

            <div className={`relative h-full p-3 grid gap-2 ${isTop3 ? 'grid-rows-[auto_1fr_auto]' : 'grid-rows-[auto_1fr]'}`}>
              <div className="relative flex items-start justify-between gap-2">
                <Link href={`/token/${tokenPath}`} className="flex items-center gap-2">
                  <img
                    src={token.imageUri}
                    className="w-8 h-8 rounded-full ring-2 ring-white/20"
                    alt={token.symbol}
                  />
                  <div className="text-white font-bold">{token.symbol}</div>
                </Link>
                {isTop3 ? (
                  <div className="absolute right-0 top-0 z-10 rounded-md bg-black/35 px-2 py-1 text-right sm:static sm:bg-transparent sm:px-0 sm:py-0">
                    <div className="text-[10px] text-white/70">{treemapWindow.toUpperCase()}</div>
                    <div className="text-[11px] sm:text-xs text-white/90 font-semibold">
                      {formatExactPrice(token.priceUsd)}
                    </div>
                  </div>
                ) : (
                  <div className="text-right">
                    <div className="text-[9px] text-white/60">{treemapWindow.toUpperCase()}</div>
                  </div>
                )}
              </div>

              <div className="min-h-0">
                {token.candles.length ? (
                  <div className={`w-full h-full overflow-hidden ${isTop3 ? 'min-h-[120px]' : 'min-h-[76px]'}`}>
                    <TradingViewChart
                      data={token.candles}
                      currentPrice={token.priceUsd}
                      height={isTop3 ? 180 : 110}
                    />
                  </div>
                ) : (
                  <div className="text-white/60 text-sm">No trading data</div>
                )}
              </div>

              {isTop3 && <div />}
            </div>
          </div>
        </div>
        </div>
      </motion.div>
    );
  };


  const renderTableSkeleton = (title: string, isPositive: boolean) => (
    <div className="rounded-lg p-4 border border-white/5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] mt-16">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-[20px] font-semibold tracking-wide text-gray-200">{title}</h3>
      </div>
      <table className="w-full text-[10px]">
        <thead>
          <tr className="text-gray-500 border-b border-white/5">
            <th className="text-left pb-2 font-medium">Name</th>
            <th className="text-left pb-2 font-medium">Current</th>
            <th className="text-left pb-2 font-medium">Chart</th>
            <th className="text-left pb-2 font-medium">30M</th>
            <th className="text-left pb-2 font-medium">4H</th>
            <th className="text-left pb-2 font-medium">24H</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {Array.from({ length: 8 }).map((_, index) => (
            <tr key={`${title}-skeleton-${index}`} className="animate-pulse">
              <td className="py-2">
                <div className="flex items-center gap-2">
                  <div className={`h-4 w-4 rounded-full ${isPositive ? 'bg-emerald-500/20' : 'bg-rose-500/20'}`} />
                  <div className="h-3 w-12 rounded-full bg-white/10" />
                </div>
              </td>
              <td className="py-2">
                <div className={`h-3 w-10 rounded-full ${isPositive ? 'bg-emerald-500/20' : 'bg-rose-500/20'}`} />
              </td>
              <td className="py-2">
                <div className={`h-6 w-20 rounded-full ${isPositive ? 'bg-emerald-500/15' : 'bg-rose-500/15'}`} />
              </td>
              <td className="py-2">
                <div className={`h-3 w-9 rounded-full ${isPositive ? 'bg-emerald-500/20' : 'bg-rose-500/20'}`} />
              </td>
              <td className="py-2">
                <div className={`h-3 w-9 rounded-full ${isPositive ? 'bg-emerald-500/20' : 'bg-rose-500/20'}`} />
              </td>
              <td className="py-2">
                <div className={`h-3 w-9 rounded-full ${isPositive ? 'bg-emerald-500/20' : 'bg-rose-500/20'}`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );


  const renderTable = (list: Token[], title: string) => (
    <div className=" rounded-lg p-4 border border-white/5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] mt-16">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-[20px] font-semibold tracking-wide text-gray-200">{title}</h3>
        {/* <div className="flex bg-black/40 rounded p-0.5 text-[10px] border border-emerald-500/20">
          <button className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded">Δ Absolute (%)</button>
          <button className="px-2 py-1 text-gray-500">Δ Relative (%)</button>
        </div> */}
      </div>
      <table className="w-full text-[10px]">
        <thead>
          {/* Δ */}
          <tr className="text-gray-500 border-b border-white/5">
            <th className="text-left pb-2 font-medium">Name</th>
            <th className="text-left pb-2 font-medium">Current</th>
            <th className="text-left pb-2 font-medium">Chart</th>
            <th className="text-left pb-2 font-medium">30M</th>
            <th className="text-left pb-2 font-medium">4H</th>
            <th className="text-left pb-2 font-medium">24H</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {list.map((t) => {
            const changePct = t.changePct || {};
            const current = changePct["24h"] || 0;
            return (
              <tr key={t.symbol} className="hover:bg-white/5 transition-colors">
                <td className="py-2 flex items-center gap-2">
                  <img src={t.imageUri} className="w-4 h-4 rounded-full bg-gray-800" alt="" />
                  <span className="font-bold text-gray-300">{t.symbol}</span>
                </td>
                <td className="py-2 text-gray-400">{formatPercent(current)}</td>
                <td className="py-2">
                  {t.candles.length ? (
                    <Sparkline
                      data={t.candles}
                      isPositive={current >= 0}
                    />
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
                <td className={(changePct["30m"] || 0) >= 0 ? 'text-emerald-400' : 'text-rose-500'}>
                  {formatPercent(changePct["30m"] || 0)}
                </td>
                <td className={(changePct["4h"] || 0) >= 0 ? 'text-emerald-400' : 'text-rose-500'}>
                  {formatPercent(changePct["4h"] || 0)}
                </td>
                <td className={(changePct["24h"] || 0) >= 0 ? 'text-emerald-400' : 'text-rose-500'}>
                  {formatPercent(changePct["24h"] || 0)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="min-h-screen text-white px-3 py-4 sm:px-4 sm:py-6 lg:px-6 font-sans">
      {error ? <div className="mb-4 text-sm text-rose-400">{error}</div> : null}
      <div className="mx-auto grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="col-span-1 lg:col-span-3 py-2 sm:py-3">
          {shouldShowSkeleton ? renderTableSkeleton('Top Gainer', true) : renderTable(topGainers, 'Top Gainer')}
          {shouldShowSkeleton ? renderTableSkeleton('Top Loser', false) : renderTable(topLosers, 'Top Loser')}
        </div>

        {/* Right Main: Heatmap */}
          <div className="col-span-1 lg:col-span-8 xl:col-span-9">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="relative overflow-hidden "
            >
              <div className="p-6 border-b border-slate-800/50">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {/* <div className="p-2 rounded-xl  text-slate-400">
                      <BarChart3 size={20} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-100">Market Heatmap</h2>
                      <p className="text-sm text-slate-500">Visualize market momentum</p>
                    </div> */}
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <div className="flex w-full sm:w-auto p-1 rounded-xl border border-slate-700/50 overflow-x-auto">
                      {[
                        { key: 'all', label: 'All', icon: Activity },
                        { key: 'gainers', label: 'Gainers', icon: TrendingUp },
                        { key: 'losers', label: 'Losers', icon: TrendingDown }
                      ].map(({ key, label, icon: Icon }) => (
                        <button
                          key={key}
                          onClick={() => setHeatmapTab(key as any)}
                          className={`flex shrink-0 items-center gap-2 whitespace-nowrap px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 ${
                            heatmapTab === key
                              ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                          }`}
                        >
                          <Icon size={16} />
                          <span className="hidden sm:inline">{label}</span>
                        </button>
                      ))}
                    </div>

                    {/* Timeframe selector */}
                    <div className="flex w-full sm:w-auto p-1 rounded-xl border border-slate-700/50 overflow-x-auto">
                      {[
                        { key: '30m', label: '30m', icon: Clock },
                        { key: '4h', label: '4H', icon: Clock },
                        { key: '24h', label: '24H', icon: Clock }
                      ].map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => setTreemapWindow(key as any)}
                          className={`shrink-0 whitespace-nowrap px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 ${
                            treemapWindow === key
                              ? 'bg-slate-700 text-white shadow-lg'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Treemap Grid */}
              <div className="p-4 sm:p-6">
                {shouldShowSkeleton ? (
                  <>
                    {heatmapTab === 'all' ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 auto-rows-[120px] sm:auto-rows-[140px] mb-3">
                        {Array.from({ length: 3 }).map((_, i) =>
                          renderHeatmapSkeleton(`top-skeleton-${i}`, true, i % 2 === 0)
                        )}
                      </div>
                    ) : null}

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5 gap-3 auto-rows-[120px] sm:auto-rows-[140px]">
                      {Array.from({ length: heatmapTab === 'all' ? 10 : 12 }).map((_, i) =>
                        renderHeatmapSkeleton(`skeleton-${i}`, false, i % 2 === 0)
                      )}
                    </div>
                  </>
                ) : null}

                {shouldShowEmptyState ? (
                  <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-slate-800/60 bg-slate-950/40 text-center">
                    <div>
                      <p className="text-lg font-semibold text-slate-100">No tokens found</p>
                      <p className="mt-2 text-sm text-slate-400">
                        No movers are available for this timeframe right now.
                      </p>
                    </div>
                  </div>
                ) : null}

                {!shouldShowSkeleton && !shouldShowEmptyState && heatmapTab === 'all' && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 auto-rows-[120px] sm:auto-rows-[140px] mb-3">
                    <AnimatePresence>
                      {heatmapTokens.slice(0, 3).map((token, i) => renderHeatmapCard(token, i, true))}
                    </AnimatePresence>
                  </div>
                )}

                {!shouldShowSkeleton && !shouldShowEmptyState && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5 gap-3 auto-rows-[120px] sm:auto-rows-[140px]">
                    <AnimatePresence>
                      {(heatmapTab === 'all' ? heatmapTokens.slice(3) : heatmapTokens).map((token, i) =>
                        renderHeatmapCard(token, i, false)
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {/* <div className="px-6 py-4 border-t border-slate-800/50 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-emerald-500" />
                    <span>Gainers</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-rose-500" />
                    <span>Losers</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Zap size={14} className="text-yellow-500" />
                  <span>Updated just now</span>
                </div>
              </div> */}
            </motion.div>
          </div>
      </div>
    </div>
  );
};

export default FindGemsMain;
