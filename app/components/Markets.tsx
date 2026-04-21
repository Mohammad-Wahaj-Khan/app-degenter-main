"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { 
  TrendingUp, 
  Activity, 
  DollarSign, 
  ArrowUpRight, 
  ArrowDownRight,
  Copy,
  ExternalLink,
  Wallet,
  BarChart3,
  Layers,
  Clock,
  ChevronRight,
  X
} from "lucide-react";
import { API_BASE_URL, API_HEADERS } from "@/lib/api";
import { storeTokenRoute, tokenApiRef } from "@/lib/token-routing";

interface MarketsProps {
  denom?: string;
  onSelectPair?: (pair: {
    baseSymbol?: string | null;
    quoteSymbol?: string | null;
    baseDenom?: string | null;
    quoteDenom?: string | null;
    pairContract?: string | null;
    poolId?: string | null;
  }) => void;
}

interface PoolToken {
  tokenId: string;
  symbol: string;
  denom: string;
  exponent: number;
  imageUri?: string;
  image?: string;
  icon?: string;
  logo?: string;
  logoURI?: string;
  logoUri?: string;
  image_url?: string;
  imageUrl?: string;
}

interface PoolEntry {
  id?: string | number;
  poolId?: string | number;
  pool_id?: string | number;
  poolID?: string | number;
  poolIdNumber?: string | number;
  pairContract?: string;
  pair_contract?: string;
  contract_address?: string;
  base: PoolToken;
  quote: PoolToken;
  isUzigQuote: boolean;
  createdAt: string;
  priceNative: number;
  priceUsd: number;
  tvlNative: number;
  tvlUsd: number;
  volumeNative: number;
  volumeUsd: number;
  tx: number;
  uniqueTraders: number;
}

interface PoolsResponse {
  success: boolean;
  token: { tokenId: string; symbol: string; denom: string; imageUri?: string };
  data: PoolEntry[];
  meta: { bucket: string; includeCaps: number; dominant: string };
}

const API_BASE = API_BASE_URL.replace(/\/+$/, "");

const isZigDenom = (value?: string | null) => {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "zig" || normalized === "uzig";
};

const getTokenRouteRef = (denom?: string | null, symbol?: string | null) => {
  if (!denom) return null;
  return storeTokenRoute(denom, symbol);
};

const buildPoolsUrl = (denom: string) =>
  `${API_BASE}/tokens/${encodeURIComponent(
    tokenApiRef(denom)
  )}/pools?includeAllSides=1`;
  // ?dominant=base&bucket=24h&limit=100

const resolvePoolId = (entry: PoolEntry): string | null => {
  const candidates = [
    entry.poolId,
    entry.pool_id,
    entry.poolID,
    entry.poolIdNumber,
    entry.id,
  ];
  const value = candidates.find((candidate) => {
    const normalized = String(candidate ?? "").trim();
    return normalized !== "" && /^[0-9]+$/.test(normalized);
  });
  return value == null ? null : String(value);
};

const resolvePairContract = (entry: PoolEntry): string | null =>
  entry.pairContract ?? entry.pair_contract ?? entry.contract_address ?? null;

const resolveTokenImage = (
  token?: Partial<PoolToken> | null,
  fallback?: string | null
) =>
  token?.imageUri ||
  token?.image ||
  token?.imageUrl ||
  token?.image_url ||
  token?.icon ||
  token?.logoURI ||
  token?.logoUri ||
  token?.logo ||
  fallback ||
  "";

const tokenMatchesHeader = (
  token?: Partial<PoolToken> | null,
  header?: PoolsResponse["token"] | null
) => {
  if (!token || !header) return false;
  const tokenDenom = token.denom?.trim().toLowerCase();
  const headerDenom = header.denom?.trim().toLowerCase();
  const tokenSymbol = token.symbol?.trim().toLowerCase();
  const headerSymbol = header.symbol?.trim().toLowerCase();
  const tokenId = token.tokenId != null ? String(token.tokenId) : "";
  const headerTokenId = header.tokenId != null ? String(header.tokenId) : "";
  return Boolean(
    (tokenDenom && headerDenom && tokenDenom === headerDenom) ||
      (tokenId && headerTokenId && tokenId === headerTokenId) ||
      (tokenSymbol && headerSymbol && tokenSymbol === headerSymbol)
  );
};

const resolveMarketTokenImage = (
  token?: Partial<PoolToken> | null,
  header?: PoolsResponse["token"] | null
) =>
  resolveTokenImage(
    token,
    tokenMatchesHeader(token, header) ? header?.imageUri : undefined
  );

// Sophisticated number formatting
const formatCurrency = (val: number, compact = true) => {
  if (!Number.isFinite(val)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact && val > 1000 ? "compact" : "standard",
    maximumFractionDigits: compact ? 2 : 6,
  }).format(val);
};

const formatNumber = (val: number) => {
  if (!Number.isFinite(val)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: val > 10000 ? "compact" : "standard",
    maximumFractionDigits: 0,
  }).format(val);
};

export default function Markets({ denom, onSelectPair }: MarketsProps) {
  const router = useRouter();
  const [rawResponse, setRawResponse] = useState<PoolsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPool, setSelectedPool] = useState<PoolEntry | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  useEffect(() => {
    if (!denom) {
      setError("Token denom required");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const fetchPools = async () => {
      try {
        setLoading(true);
        const headers = {
          "Content-Type": "application/json",
          ...API_HEADERS,
        };
        const response = await fetch(buildPoolsUrl(denom), {
          headers,
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data: PoolsResponse = await response.json();
        setRawResponse(data);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError("Failed to load market data");
      } finally {
        setLoading(false);
      }
    };
    fetchPools();
    return () => controller.abort();
  }, [denom]);

  const stats = useMemo(() => {
    if (!rawResponse?.data) return { tvl: 0, vol24h: 0, vol7d: 0, tx: 0, pools: 0, dominant: "-" };
    const data = rawResponse.data;
    return {
      tvl: data.reduce((a, b) => a + b.tvlUsd, 0),
      vol24h: data.reduce((a, b) => a + b.volumeUsd, 0),
      tx: data.reduce((a, b) => a + b.tx, 0),
      pools: data.length,
      dominant: rawResponse.meta.dominant,
    };
  }, [rawResponse]);

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-[#0a0a0f] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-2 border-[#FA4E30]/20" />
            <div className="absolute inset-0 rounded-full border-2 border-t-[#FA4E30] border-r-transparent border-b-transparent border-l-transparent animate-spin" />
          </div>
          <p className="text-xs font-medium tracking-[0.2em] text-slate-500 uppercase animate-pulse">
            Initializing Markets
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen w-full bg-[#0a0a0f] flex items-center justify-center p-4">
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-8 text-center">
          <p className="text-red-400 font-medium">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 text-xs text-slate-400 hover:text-white transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const selectedPoolContract = selectedPool
    ? resolvePairContract(selectedPool)
    : null;

  return (
    <div className="min-h-screen w-full text-slate-300 font-sans selection:bg-[#FA4E30]/30">
      {/* Ambient Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#FA4E30]/5 rounded-full blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-[128px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,black,transparent)]" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
        
        {/* HEADER SECTION */}
        <header className="mb-8">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
            <div className="flex items-center gap-4">
              {rawResponse?.token.imageUri ? (
                <div className="relative h-16 w-16 rounded-2xl overflow-hidden ring-2 ring-white/10 shadow-2xl shadow-[#FA4E30]/10">
                  <Image src={rawResponse.token.imageUri} alt={rawResponse.token.symbol} fill className="object-cover" />
                </div>
              ) : (
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-[#FA4E30] to-orange-600/5 flex items-center justify-center ring-2 ring-[#FA4E30]/20">
                  <span className="text-2xl font-bold text-[#FA4E30]">{rawResponse?.token.symbol?.[0]}</span>
                </div>
              )}
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                    {rawResponse?.token.symbol}
                  </h1>
                  <span className="px-2 py-0.5 rounded-full bg-[#FA4E30]/10 border border-[#FA4E30] text-[10px] font-bold text-orange-400 uppercase tracking-wider">
                    {stats.pools} Pools
                  </span>
                </div>
                <p className="font-mono text-xs text-slate-500 truncate max-w-md">{denom}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 bg-white/5 rounded-full px-4 py-2 border border-white/5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Live Market Data • {rawResponse?.meta.bucket || "24H"}
            </div>
          </div>

          {/* STATS GRID */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard 
              label="Total Value Locked" 
              value={formatCurrency(stats.tvl)} 
              icon={<Layers className="w-4 h-4" />}
              trend="+12.5%"
              positive
            />
            <StatCard 
              label="24h Volume" 
              value={formatCurrency(stats.vol24h)} 
              icon={<BarChart3 className="w-4 h-4" />}
              trend="+8.2%"
              positive
            />
            <StatCard 
              label="Transactions" 
              value={formatNumber(stats.tx)} 
              icon={<Activity className="w-4 h-4" />}
            />
            <StatCard 
              label="Dominant Pair" 
              value={stats.dominant} 
              icon={<TrendingUp className="w-4 h-4" />}
              isText
            />
          </div>
        </header>

        {/* MAIN TABLE */}
        <div className="rounded-2xl border border-white/[0.08]  overflow-hidden shadow-2xl shadow-black/50">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                  <th className="text-left py-4 px-6 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Pool Pair
                  </th>
                  <th className="text-right py-4 px-6 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Price (USD)
                  </th>
                  <th className="text-right py-4 px-6 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    TVL
                  </th>
                  <th className="text-right py-4 px-6 text-[11px] font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">
                    24h Volume
                  </th>
                  <th className="text-right py-4 px-6 text-[11px] font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">
                    Traders/Txs
                  </th>
                  <th className="text-right py-4 px-6 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {rawResponse?.data.map((entry, index) => {
                  const rowPairContract = resolvePairContract(entry);
                  const rowKey =
                    rowPairContract ?? resolvePoolId(entry) ?? `${index}`;
                  const isHovered = hoveredRow === rowKey;
                  const tvlShare = stats.tvl > 0 ? (entry.tvlUsd / stats.tvl) * 100 : 0;
                  
                  return (
                    <tr 
                      key={rowKey}
                      className="group relative transition-all duration-200 hover:bg-white/[0.03]"
                      onMouseEnter={() => setHoveredRow(rowKey)}
                      onMouseLeave={() => setHoveredRow(null)}
                      onClick={() => {
                        const selectedPair = {
                          baseSymbol: entry.base?.symbol ?? null,
                          quoteSymbol: entry.quote?.symbol ?? null,
                          baseDenom: entry.base?.denom ?? null,
                          quoteDenom: entry.quote?.denom ?? null,
                          pairContract: rowPairContract,
                          poolId: resolvePoolId(entry),
                        };
                        if (onSelectPair) {
                          onSelectPair(selectedPair);
                          return;
                        }
                        const baseDenom = selectedPair.baseDenom;
                        const baseSymbol = selectedPair.baseSymbol;
                        const pairContract = selectedPair.pairContract;
                        const quoteDenom = selectedPair.quoteDenom;
                        const tokenRouteRef = getTokenRouteRef(baseDenom, baseSymbol);
                        const targetUrl =
                          tokenRouteRef && pairContract
                            ? `/token/${encodeURIComponent(
                                tokenRouteRef
                              )}/${encodeURIComponent(pairContract)}`
                            : tokenRouteRef
                            ? `/token/${encodeURIComponent(tokenRouteRef)}`
                            : null;
                        if (targetUrl) {
                          router.push(targetUrl);
                        }
                      }}
                    >
                      {/* Hover indicator */}
                      {/* <div className={`absolute left-0 top-0 bottom-0 w-[2px] bg-[#FA4E30] transition-opacity duration-200 ${isHovered ? 'opacity-100' : 'opacity-0'}`} /> */}
                      
                      <td className="py-4 px-6">
                        <div className="flex items-start gap-4">
                          <div className="relative flex -space-x-2">
                            <TokenIcon 
                              symbol={entry.base.symbol} 
                              uri={resolveMarketTokenImage(entry.base, rawResponse.token)}
                              primary
                            />
                            <TokenIcon 
                              symbol={entry.quote.symbol} 
                              uri={resolveMarketTokenImage(entry.quote, rawResponse.token)}
                            />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-semibold text-white text-sm">{entry.base.symbol}</span>
                              <span className="text-slate-600 text-xs">/</span>
                              <span className="text-slate-400 text-sm">{entry.quote.symbol}</span>
                              {entry.isUzigQuote && (
                                <span className="ml-1 px-1.5 py-0.5 rounded bg-[#FA4E30]/10 border border-[#FA4E30] text-[9px] font-bold text-orange-400">
                                  UZIG
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-600 font-mono">
                              <span className="truncate max-w-[120px]">
                                {rowPairContract
                                  ? `${rowPairContract.slice(0, 6)}...${rowPairContract.slice(-4)}`
                                  : "Pool"}
                              </span>
                              <button 
                                className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-orange-400"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (rowPairContract) navigator.clipboard.writeText(rowPairContract);
                                }}
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-6 text-right">
                        <div className="text-sm font-semibold text-white">
                          {formatCurrency(entry.priceUsd, false)}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          {Number.isFinite(entry.priceNative)
                            ? entry.priceNative.toFixed(6)
                            : "—"}{" "}
                          {entry.quote.symbol}
                        </div>
                      </td>

                      <td className="py-4 px-6 text-right">
                        <div className="text-sm font-medium text-slate-200">
                          {formatCurrency(entry.tvlUsd)}
                        </div>
                        <div className="mt-1.5 h-1 w-16 bg-white/5 rounded-full overflow-hidden ml-auto">
                          <div 
                            className="h-full bg-gradient-to-r from-[#FA4E30] to-orange-400 rounded-full"
                            style={{ width: `${Math.max(tvlShare, 2)}%` }}
                          />
                        </div>
                      </td>

                      <td className="py-4 px-6 text-right hidden md:table-cell">
                        <div className={`inline-flex items-center gap-1 text-sm font-medium ${entry.volumeUsd > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {entry.volumeUsd > 0 ? <TrendingUp className="w-3 h-3" /> : null}
                          {formatCurrency(entry.volumeUsd)}
                        </div>
                      </td>

                      <td className="py-4 px-6 text-right hidden lg:table-cell">
                        <div className="text-sm text-slate-300">{entry.uniqueTraders}</div>
                        <div className="text-[10px] text-slate-500">{entry.tx} txs</div>
                      </td>

                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPool(entry);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-medium text-slate-300 hover:bg-[#FA4E30] hover:text-white hover:border-[#FA4E30] transition-all duration-200 group/btn"
                        >
                          Details
                          <ChevronRight className="w-3 h-3 transition-transform group-hover/btn:translate-x-0.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* DETAIL MODAL */}
        {selectedPool && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setSelectedPool(null)}
          >
            <div
              className="relative w-full max-w-4xl rounded-3xl border border-white/[0.08] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
              onClick={(event) => event.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-white/[0.06] bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    <TokenIcon symbol={selectedPool.base.symbol} uri={resolveMarketTokenImage(selectedPool.base, rawResponse?.token)} primary size="md" />
                    <TokenIcon symbol={selectedPool.quote.symbol} uri={resolveMarketTokenImage(selectedPool.quote, rawResponse?.token)} size="md" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {selectedPool.base.symbol}/{selectedPool.quote.symbol}
                    </h3>
                    <p className="text-xs text-slate-500 font-mono">Pool Details</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedPool(null)}
                  className="p-2 rounded-full hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 space-y-6">
                {/* Key Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <DetailBox label="Price USD" value={formatCurrency(selectedPool.priceUsd, false)} />
                  <DetailBox label="TVL" value={formatCurrency(selectedPool.tvlUsd)} />
                  <DetailBox label="24h Volume" value={formatCurrency(selectedPool.volumeUsd)} />
                  <DetailBox label="Native Price" value={selectedPool.priceNative.toFixed(6)} />
                </div>

                {/* Contract Info */}
                <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Contract Address</span>
                    <button 
                      className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 transition-colors"
                      onClick={() => {
                        if (selectedPoolContract) {
                          navigator.clipboard.writeText(selectedPoolContract);
                        }
                      }}
                    >
                      <Copy className="w-3 h-3" />
                      Copy
                    </button>
                  </div>
                  <code className="block text-xs font-mono text-slate-300 break-all bg-black/30 rounded-lg p-3">
                    {selectedPoolContract ?? "Unknown contract"}
                  </code>
                </div>

                {/* Additional Stats */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
                    <div className="flex items-center gap-2 text-slate-500 mb-2">
                      <Activity className="w-4 h-4" />
                      <span className="text-xs font-medium uppercase tracking-wider">Activity</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Transactions</span>
                        <span className="text-white font-medium">{selectedPool.tx}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Unique Traders</span>
                        <span className="text-white font-medium">{selectedPool.uniqueTraders}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
                    <div className="flex items-center gap-2 text-slate-500 mb-2">
                      <Clock className="w-4 h-4" />
                      <span className="text-xs font-medium uppercase tracking-wider">Metadata</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Created</span>
                        <span className="text-white font-medium">
                          {new Date(selectedPool.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Type</span>
                        <span className="text-white font-medium">
                          {selectedPool.isUzigQuote ? "UZIG Quote" : "Standard"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                {/* <div className="flex gap-3 pt-2">
                  <button className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#FA4E30] hover:bg-orange-600 text-white font-medium text-sm transition-colors">
                    <Wallet className="w-4 h-4" />
                    Trade Now
                  </button>
                  <button className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-medium text-sm transition-colors">
                    <ExternalLink className="w-4 h-4" />
                    Explorer
                  </button>
                </div> */}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Subcomponents

function StatCard({ 
  label, 
  value, 
  icon, 
  trend, 
  positive, 
  isText = false 
}: { 
  label: string; 
  value: string; 
  icon: React.ReactNode;
  trend?: string;
  positive?: boolean;
  isText?: boolean;
}) {
  return (
    <div className="relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 hover:bg-white/[0.04] transition-colors group overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#FA4E30]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative flex items-start justify-between mb-3">
        <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">{label}</span>
        <div className="p-1.5 rounded-lg bg-white/5 text-slate-400 group-hover:text-orange-400 transition-colors">
          {icon}
        </div>
      </div>
      <div className="relative">
        <div className={`text-2xl font-bold tracking-tight ${isText ? 'text-slate-300 text-lg' : 'text-white'}`}>
          {value}
        </div>
        {trend && (
          <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
            {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {trend}
          </div>
        )}
      </div>
    </div>
  );
}

function TokenIcon({ 
  symbol, 
  uri, 
  primary = false,
  size = "sm"
}: { 
  symbol: string; 
  uri?: string;
  primary?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12"
  };

  return (
    <div className={`relative ${sizeClasses[size]} rounded-full overflow-hidden border-2 border-[#0a0a0f] ${primary ? 'z-10' : 'z-0'} bg-[#1a1a1f] ring-1 ring-white/10`}>
      {uri ? (
        !failed ? (
          <Image
            src={uri}
            alt={symbol}
            fill
            className="object-cover"
            unoptimized
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-500">
            {symbol.slice(0, 2)}
          </div>
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-500">
          {symbol.slice(0, 2)}
        </div>
      )}
    </div>
  );
}

function DetailBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3">
      <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm font-semibold text-white truncate">{value}</p>
    </div>
  );
}
