"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type MouseEvent as ReactMouseEvent } from "react";
import dynamic from "next/dynamic";
import {
  Activity,
  BarChart3,
  Plus,
  Waves,
  X,
  TrendingUp,
  TrendingDown,
  Zap,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Search,
  RefreshCw,
  GripVertical,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Gem,
  Wallet,
  Coins,
  Radar,
  ExternalLink,
  Crown,
} from "lucide-react";
import TradingChart from "@/app/components/tradingchart";
import { API_BASE_URL, API_HEADERS } from "@/lib/api";
import { storeTokenRoute } from "@/lib/token-routing";
import { motion, AnimatePresence } from "framer-motion";
import { createChart, ColorType, UTCTimestamp } from "lightweight-charts";

type TokenWidgetType = "charts" | "recent-trades" | "token-stats" | "find-gems";
type AppWidgetType =
  | "findgems"
  | "portfolio"
  | "wallet-details"
  | "create-token"
  | "wallet-tracker";
type WidgetType = TokenWidgetType | AppWidgetType;

type TokenOption = {
  id: string;
  tokenId?: string;
  tokenKey: string;
  denom?: string;
  symbol: string;
  name: string;
  imageUri?: string;
};

type FindGemsCandle = {
  ts_sec: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  trades?: number;
};

type FindGemsCardToken = {
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
  changePct: {
    "30m"?: number;
    "4h"?: number;
    "24h"?: number;
  };
  candles: FindGemsCandle[];
};

type SlotItem = {
  id: string;
  token?: TokenOption;
  type: WidgetType;
  width: number;
  height: number;
  x: number;
  y: number;
};

type ApiTrade = {
  pool_id: any;
  poolId: any;
  poolID: any;
  pair_contract: any;
  pairContract: any;
  denom: any;
  tradeId?: string;
  trade_id?: string;
  txHash?: string;
  tx_hash?: string;
  time?: string;
  created_at?: string;
  direction?: "buy" | "sell" | "provide" | "withdraw";
  valueUsd?: number;
  priceUsd?: number;
  value_usd?: number;
  price_usd?: number;
  value_in_usd?: number;
  price_in_usd?: number;
  offerAmount?: number;
  returnAmount?: number;
  offer_amount_base?: string | number;
  return_amount_base?: string | number;
  offerDenom?: string;
  askDenom?: string;
  offer_asset_denom?: string;
  ask_asset_denom?: string;
  offer_amount?: number;
  return_amount?: number;
  offer_denom?: string;
  ask_denom?: string;
  signer?: string;
  tokenId?: string;
  token_id?: string;
  tokenKey?: string;
  token_key?: string;
  symbol?: string;
};

const resolveChartTokenRef = (token: Pick<TokenOption, "denom" | "symbol" | "tokenKey">) => {
  const denom = token.denom?.trim();
  return denom || token.tokenKey || token.symbol;
};

const baseAmountToDisplay = (amount: unknown, denom?: string) => {
  const n = Number(amount);
  if (!Number.isFinite(n)) return undefined;
  return n / 1_000_000;
};

const normalizeTrade = (trade: ApiTrade): ApiTrade => ({
  ...trade,
  tradeId: trade.tradeId ?? trade.trade_id,
  txHash: trade.txHash ?? trade.tx_hash,
  time: trade.time ?? trade.created_at,
  priceUsd: trade.priceUsd ?? trade.price_usd ?? trade.price_in_usd,
  valueUsd: trade.valueUsd ?? trade.value_usd ?? trade.value_in_usd,
  offerDenom: trade.offerDenom ?? trade.offer_denom ?? trade.offer_asset_denom,
  askDenom: trade.askDenom ?? trade.ask_denom ?? trade.ask_asset_denom,
  offerAmount:
    trade.offerAmount ??
    trade.offer_amount ??
    baseAmountToDisplay(
      trade.offer_amount_base,
      trade.offerDenom ?? trade.offer_denom ?? trade.offer_asset_denom
    ),
  returnAmount:
    trade.returnAmount ??
    trade.return_amount ??
    baseAmountToDisplay(
      trade.return_amount_base,
      trade.askDenom ?? trade.ask_denom ?? trade.ask_asset_denom
    ),
});

type WsListener = (rows: ApiTrade[]) => void;
type WsStatusListener = (connected: boolean) => void;
type StatsListener = (payload: any) => void;

const MAX_SLOTS = 15;
const MAX_RECENT_TRADES = 20;
const HIGHLIGHT_DURATION_MS = 4000;
const API_BASE = API_BASE_URL;
const TRADES_WS_URL = process.env.NEXT_PUBLIC_TRADES_WS_URL || "";
const MULTICHARTS_SLOTS_CACHE_KEY = "multicharts_slots_v4_canvas";

const MIN_WIDTH = 280;
const MIN_HEIGHT = 200;
const MAX_WIDTH = 1400;
const MAX_HEIGHT = 1000;
const GRID_SIZE = 20; // Snap to grid for cleaner layout
const WIDGET_GAP = 16; // Minimum gap between widgets

const typeLabel: Record<WidgetType, string> = {
  charts: "Live Chart",
  "recent-trades": "Live Trades",
  "token-stats": "Token Stats",
  "find-gems": "FindGems Format",
  findgems: "FindGems",
  portfolio: "Portfolio",
  "wallet-details": "Wallet Details",
  "create-token": "Create Token",
  "wallet-tracker": "Wallet Tracker",
};

const typeIcon: Record<WidgetType, ReactNode> = {
  charts: <BarChart3 size={14} />,
  "recent-trades": <Waves size={14} />,
  "token-stats": <Activity size={14} />,
  "find-gems": <Gem size={14} />,
  findgems: <Gem size={14} />,
  portfolio: <Wallet size={14} />,
  "wallet-details": <Search size={14} />,
  "create-token": <Coins size={14} />,
  "wallet-tracker": <Radar size={14} />,
};

const typeGradient: Record<WidgetType, string> = {
  charts: "from-blue-500/20 via-purple-500/20 to-pink-500/20",
  "recent-trades": "from-emerald-500/20 via-teal-500/20 to-cyan-500/20",
  "token-stats": "from-amber-500/20 via-orange-500/20 to-red-500/20",
  "find-gems": "from-fuchsia-500/20 via-emerald-500/20 to-yellow-500/20",
  findgems: "from-fuchsia-500/20 via-emerald-500/20 to-yellow-500/20",
  portfolio: "from-emerald-500/20 via-sky-500/20 to-white/10",
  "wallet-details": "from-cyan-500/20 via-zinc-500/20 to-emerald-500/20",
  "create-token": "from-orange-500/20 via-emerald-500/20 to-zinc-500/20",
  "wallet-tracker": "from-teal-500/20 via-lime-500/20 to-zinc-500/20",
};

const quickOpenOptions: Array<{ type: TokenWidgetType; label: string; description: string }> = [
  { type: "recent-trades", label: "Trades", description: "Open live trades for this token" },
  { type: "charts", label: "Candles", description: "Open the candle chart for this token" },
  { type: "token-stats", label: "Summary", description: "Open the token summary widget" },
  { type: "find-gems", label: "FindGems", description: "Show this token in discovery format" },
];

const tokenWidgetTypes: TokenWidgetType[] = [
  "charts",
  "recent-trades",
  "token-stats",
  "find-gems",
];

const isTokenWidgetType = (type: WidgetType): type is TokenWidgetType =>
  tokenWidgetTypes.includes(type as TokenWidgetType);

const appWidgetOptions: Array<{
  type: AppWidgetType;
  label: string;
  description: string;
}> = [
  {
    type: "findgems",
    label: "FindGems",
    description: "Open the full FindGems discovery board.",
  },
  {
    type: "portfolio",
    label: "Portfolio",
    description: "Open wallet holdings, PNL, and activities.",
  },
  {
    type: "wallet-details",
    label: "Wallet Details",
    description: "Enter an address and jump into its portfolio or profile.",
  },
  {
    type: "create-token",
    label: "Create Token",
    description: "Launch a new token from the canvas.",
  },
  {
    type: "wallet-tracker",
    label: "Wallet Tracker",
    description: "Search and track top wallets.",
  },
];

const appWidgetRoutes: Record<AppWidgetType, string> = {
  findgems: "/findgems",
  portfolio: "/portfolio",
  "wallet-details": "/portfolio",
  "create-token": "/createtoken",
  "wallet-tracker": "/wallet-tracker",
};

const isWidgetType = (value: unknown): value is WidgetType =>
  typeof value === "string" &&
  (isTokenWidgetType(value as WidgetType) ||
    appWidgetOptions.some((option) => option.type === value));

const CanvasWidgetLoading = ({ label }: { label: string }) => (
  <div className="flex h-full items-center justify-center">
    <div className="flex items-center gap-2 text-zinc-400">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
      <span className="text-xs">Loading {label}...</span>
    </div>
  </div>
);

const CanvasCreateToken = dynamic(
  () => import("@/app/createtoken/components/launchToken"),
  {
    ssr: false,
    loading: () => <CanvasWidgetLoading label="Create Token" />,
  }
);

const CanvasFindGems = dynamic(() => import("@/app/findgems/components/findgems"), {
  ssr: false,
  loading: () => <CanvasWidgetLoading label="FindGems" />,
});

const CanvasWalletTrackerPage = dynamic(() => import("@/app/wallet-tracker/page"), {
  ssr: false,
  loading: () => <CanvasWidgetLoading label="Wallet Tracker" />,
});

const CanvasWalletAnalyzerSidebar = dynamic(
  () => import("@/app/portfolio/WalletAnalyzerPNL/components/WalletAnalyzesSideBar"),
  {
    ssr: false,
    loading: () => <CanvasWidgetLoading label="Wallet Sidebar" />,
  }
);

const CanvasWalletAnalyzerBoxes = dynamic(
  () => import("@/app/portfolio/WalletAnalyzerPNL/components/WalletAnalyzerBoxes"),
  {
    ssr: false,
    loading: () => <CanvasWidgetLoading label="Wallet Analyzer" />,
  }
);

const CanvasWalletAnalyzerTable = dynamic(
  () => import("@/app/portfolio/WalletAnalyzerPNL/components/WalletAnalyzerTable"),
  {
    ssr: false,
    loading: () => <CanvasWidgetLoading label="Wallet Table" />,
  }
);

const CanvasWalletAnalyzerPortfolio = dynamic(
  () => import("@/app/portfolio/WalletAnalyzerPortfolio/components/WalletAnalyzerPortfolio"),
  {
    ssr: false,
    loading: () => <CanvasWidgetLoading label="Portfolio" />,
  }
);

const CanvasWalletAnalyzerActivities = dynamic(
  () => import("@/app/portfolio/WalletAnalyzerActivities/components/WalletAnalyzerActivities"),
  {
    ssr: false,
    loading: () => <CanvasWidgetLoading label="Activities" />,
  }
);

const normalizeTokenRef = (v?: string) =>
  (v ?? "").replace(/^ibc\/\w+\//, "").trim().toLowerCase();

const compactUsd = (v?: number) =>
  Number.isFinite(v)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: v && v < 1 ? 6 : 2,
      }).format(Number(v))
    : "—";

const formatFindGemsPercent = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

const formatFindGemsPrice = (value: number) => {
  if (!Number.isFinite(value)) return "—";
  if (value >= 100) return `$${value.toFixed(2)}`;
  if (value >= 1) return `$${value.toFixed(4)}`;
  if (value >= 0.01) return `$${value.toFixed(6)}`;
  return `$${value.toFixed(8)}`;
};

const getFindGemsIntensityColor = (change: number) => {
  const absChange = Math.abs(change);
  if (change >= 0) {
    if (absChange > 20) return "from-emerald-600 to-emerald-400";
    if (absChange > 10) return "from-emerald-700 to-emerald-500";
    if (absChange > 5) return "from-emerald-800 to-emerald-600";
    return "from-emerald-900 to-emerald-700";
  }
  if (absChange > 20) return "from-rose-600 to-rose-400";
  if (absChange > 10) return "from-rose-700 to-rose-500";
  if (absChange > 5) return "from-rose-800 to-rose-600";
  return "from-rose-900 to-rose-700";
};

const shortNum = (num?: number) => {
  if (num == null || !Number.isFinite(num)) return "—";
  const abs = Math.abs(num);
  if (abs >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toFixed(2);
};

const formatTimeAgo = (dateString?: string) => {
  if (!dateString) return "--";
  const ts = Date.parse(dateString);
  if (!Number.isFinite(ts)) return "--";
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const shortAddress = (v?: string) =>
  v ? `${v.slice(0, 6)}...${v.slice(-4)}` : "—";

const denomLabel = (denom?: string) => {
  if (!denom) return "";
  if (denom.includes("uzig")) return "ZIG";
  const cleaned = denom.replace(/^ibc\/\w+\//, "");
  return cleaned.split(".").pop()?.toUpperCase() || cleaned.toUpperCase();
};

const rowEmoji = (usd?: number) => {
  const v = Number(usd ?? 0);
  if (v >= 10000) return "🐋";
  if (v >= 1000) return "🦈";
  return "🦐";
};

const getTradeKey = (trade: ApiTrade) =>
  trade.tradeId ||
  trade.trade_id ||
  trade.txHash ||
  trade.tx_hash ||
  (trade.time
    ? `${trade.time}-${trade.direction ?? "unk"}-${Math.round(
        Number(trade.valueUsd ?? trade.value_usd ?? trade.value_in_usd ?? 0)
      )}-${Math.round(Number(trade.priceUsd ?? trade.price_usd ?? trade.price_in_usd ?? 0))}`
    : undefined);

type TradeSubscriptionRef = {
  tokenKey?: string;
  tokenId?: string;
  poolId?: string;
  pairContract?: string;
};

type TradeKeyType = "token_key" | "token_id" | "pool_id" | "pair_contract";

class TradesWsHub {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private listeners = new Map<string, Set<WsListener>>();
  private statusListeners = new Set<WsStatusListener>();
  private keyTypeCounts = new Map<string, Map<TradeKeyType, number>>();
  private keyTypeRaw = new Map<TradeKeyType, Map<string, string>>();
  private connected = false;

  subscribe(refs: TradeSubscriptionRef, cb: WsListener) {
    const entries: Array<{ key: string; type: TradeKeyType }> = [];
    const add = (type: TradeKeyType, value?: string) => {
      if (!value) return;
      const trimmed = value.trim();
      if (!trimmed) return;
      const key = normalizeTokenRef(trimmed);
      if (!key) return;
      entries.push({ key, type });
      if (!this.listeners.has(key)) this.listeners.set(key, new Set());
      this.listeners.get(key)?.add(cb);
      this.incrementKeyType(key, type);
      const rawMap = this.keyTypeRaw.get(type) ?? new Map();
      rawMap.set(key, trimmed);
      this.keyTypeRaw.set(type, rawMap);
    };
    add("token_key", refs.tokenKey);
    add("token_id", refs.tokenId);
    add("pool_id", refs.poolId);
    add("pair_contract", refs.pairContract);
    if (!entries.length) return () => {};
    this.ensureSocket();
    this.syncSubs();
    return () => {
      for (const entry of entries) {
        this.decrementKeyType(entry.key, entry.type);
      }
      const uniqueKeys = new Set(entries.map((e) => e.key));
      uniqueKeys.forEach((key) => {
        const set = this.listeners.get(key);
        set?.delete(cb);
        if (!set?.size) this.listeners.delete(key);
      });
      if (this.listeners.size === 0) {
        this.close();
      } else {
        this.syncSubs();
      }
    };
  }

  onStatus(cb: WsStatusListener) {
    this.statusListeners.add(cb);
    cb(this.connected);
    return () => this.statusListeners.delete(cb);
  }

  private incrementKeyType(key: string, type: TradeKeyType) {
    const counts = this.keyTypeCounts.get(key) ?? new Map();
    counts.set(type, (counts.get(type) ?? 0) + 1);
    this.keyTypeCounts.set(key, counts);
  }

  private decrementKeyType(key: string, type: TradeKeyType) {
    const counts = this.keyTypeCounts.get(key);
    if (!counts) return;
    const next = (counts.get(type) ?? 0) - 1;
    if (next <= 0) {
      counts.delete(type);
      const rawMap = this.keyTypeRaw.get(type);
      rawMap?.delete(key);
    } else {
      counts.set(type, next);
    }
    if (!counts.size) {
      this.keyTypeCounts.delete(key);
    } else {
      this.keyTypeCounts.set(key, counts);
    }
  }

  private ensureSocket() {
    if (!TRADES_WS_URL || this.ws) return;
    this.ws = new WebSocket(TRADES_WS_URL);

    this.ws.onopen = () => {
      this.connected = true;
      this.emitStatus(true);
      this.syncSubs();
    };

    this.ws.onerror = () => {
      this.connected = false;
      this.emitStatus(false);
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.emitStatus(false);
      this.ws = null;
      if (this.listeners.size > 0) {
        this.reconnectTimer = window.setTimeout(() => this.ensureSocket(), 1500);
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const rows = this.extractRows(msg).map(normalizeTrade);
        if (!rows.length) return;

        const msgToken =
          normalizeTokenRef(
            String(msg?.token_id ?? msg?.tokenId ?? msg?.token?.tokenId ?? "")
          ) || "";
        const msgTokenKey =
          normalizeTokenRef(
            msg?.tokenKey ?? msg?.token_key ?? msg?.symbol ?? msg?.token?.symbol
          ) || "";
        const msgTokens = Array.isArray(msg?.token_ids)
          ? msg.token_ids
              .map((t: string) => normalizeTokenRef(t))
              .filter(Boolean)
          : [];
        const msgTokenKeys = Array.isArray(msg?.token_keys)
          ? msg.token_keys
              .map((t: string) => normalizeTokenRef(t))
              .filter(Boolean)
          : [];
        const msgPoolId =
          normalizeTokenRef(String(msg?.pool_id ?? msg?.poolId ?? msg?.poolID ?? "")) ||
          "";
        const msgPairContract =
          normalizeTokenRef(
            msg?.pair_contract ?? msg?.pairContract ?? msg?.denom ?? ""
          ) || "";

        for (const row of rows) {
          const rowTokens = [
            normalizeTokenRef(row?.token_id),
            normalizeTokenRef(row?.tokenId),
            normalizeTokenRef(row?.token_key),
            normalizeTokenRef(row?.tokenKey),
            normalizeTokenRef(row?.symbol),
            normalizeTokenRef(String(row?.pool_id ?? row?.poolId ?? row?.poolID ?? "")),
            normalizeTokenRef(row?.pair_contract ?? row?.pairContract ?? row?.denom),
            normalizeTokenRef(row?.offerDenom),
            normalizeTokenRef(row?.offer_denom),
            normalizeTokenRef(row?.offer_asset_denom),
            normalizeTokenRef(row?.askDenom),
            normalizeTokenRef(row?.ask_denom),
            normalizeTokenRef(row?.ask_asset_denom),
            msgToken,
            msgTokenKey,
            msgPoolId,
            msgPairContract,
            ...msgTokens.map((t: string | undefined) => normalizeTokenRef(t)),
            ...msgTokenKeys.map((t: string | undefined) => normalizeTokenRef(t)),
          ].filter(Boolean);

          if (!rowTokens.length) continue;

          for (const [listenerKey, fns] of this.listeners.entries()) {
            const normalizedListener = normalizeTokenRef(listenerKey);
            const isMatch = rowTokens.some(
              (token) =>
                token === normalizedListener ||
                token.includes(normalizedListener) ||
                normalizedListener.includes(token)
            );
            if (!isMatch) continue;
            fns.forEach((fn) => fn([row]));
          }
        }
      } catch {
        // ignore malformed frames
      }
    };
  }

  private extractRows(msg: any): ApiTrade[] {
    const data = msg?.data;
    if (msg?.type === "trade") return [data ?? msg];
    if (msg?.type === "snapshot" && Array.isArray(data)) return data;
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object") return [data];
    return [];
  }

  private collectRaw(type: TradeKeyType) {
    return Array.from(this.keyTypeRaw.get(type)?.values() ?? []).filter(Boolean);
  }

  private syncSubs() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const tokenKeys = this.collectRaw("token_key");
    const tokenIds = this.collectRaw("token_id");
    const poolIds = this.collectRaw("pool_id");
    const pairContracts = this.collectRaw("pair_contract");
    if (
      !tokenKeys.length &&
      !tokenIds.length &&
      !poolIds.length &&
      !pairContracts.length
    ) {
      return;
    }
    const payload: Record<string, any> = {
      type: "sub",
      stream: "trades",
    };
    if (tokenKeys.length) payload.token_keys = tokenKeys;
    if (tokenIds.length) payload.token_ids = tokenIds;
    if (poolIds.length) payload.pool_ids = poolIds;
    if (pairContracts.length) payload.pair_contracts = pairContracts;
    this.ws.send(JSON.stringify(payload));
  }

  private emitStatus(v: boolean) {
    this.statusListeners.forEach((cb) => cb(v));
  }

  private close() {
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.emitStatus(false);
  }
}

const tradesWsHub = new TradesWsHub();

type StatsSubscriptionRef = {
  tokenKey?: string;
  tokenId?: string;
  poolId?: string;
  pairContract?: string;
};

type StatsKeyType = "token_key" | "token_id" | "pool_id" | "pair_contract";

class StatsWsHub {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private listeners = new Map<string, Set<StatsListener>>();
  private keyTypeCounts = new Map<string, Map<StatsKeyType, number>>();

  subscribe(refs: StatsSubscriptionRef, cb: StatsListener) {
    const entries: Array<{ key: string; type: StatsKeyType }> = [];
    const add = (type: StatsKeyType, value?: string) => {
      if (!value) return;
      const normalized = normalizeTokenRef(value);
      if (!normalized) return;
      entries.push({ key: normalized, type });
      if (!this.listeners.has(normalized)) this.listeners.set(normalized, new Set());
      this.listeners.get(normalized)?.add(cb);
      this.incrementKeyType(normalized, type);
    };
    add("token_key", refs.tokenKey);
    add("token_id", refs.tokenId);
    add("pool_id", refs.poolId);
    add("pair_contract", refs.pairContract);
    if (!entries.length) return () => {};
    this.ensureSocket();
    this.syncSubs();
    return () => {
      for (const entry of entries) {
        this.decrementKeyType(entry.key, entry.type);
      }
      const uniqueKeys = new Set(entries.map((e) => e.key));
      uniqueKeys.forEach((key) => {
        const set = this.listeners.get(key);
        set?.delete(cb);
        if (!set?.size) this.listeners.delete(key);
      });
      if (this.listeners.size === 0) {
        this.close();
      } else {
        this.syncSubs();
      }
    };
  }

  private incrementKeyType(key: string, type: StatsKeyType) {
    const counts = this.keyTypeCounts.get(key) ?? new Map();
    counts.set(type, (counts.get(type) ?? 0) + 1);
    this.keyTypeCounts.set(key, counts);
  }

  private decrementKeyType(key: string, type: StatsKeyType) {
    const counts = this.keyTypeCounts.get(key);
    if (!counts) return;
    const next = (counts.get(type) ?? 0) - 1;
    if (next <= 0) {
      counts.delete(type);
    } else {
      counts.set(type, next);
    }
    if (!counts.size) {
      this.keyTypeCounts.delete(key);
    } else {
      this.keyTypeCounts.set(key, counts);
    }
  }

  private ensureSocket() {
    if (!TRADES_WS_URL || this.ws) return;
    this.ws = new WebSocket(TRADES_WS_URL);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.syncSubs();
    };
    this.ws.onclose = () => {
      this.ws = null;
      if (this.listeners.size > 0 && this.reconnectAttempts < 5) {
        this.reconnectAttempts += 1;
        this.reconnectTimer = window.setTimeout(() => this.ensureSocket(), 1500);
      }
    };
    this.ws.onerror = () => {
      try {
        this.ws?.close();
      } catch {}
    };
    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const rows = this.extractRows(msg);
        if (!rows.length) return;

        const msgToken =
          normalizeTokenRef(msg?.token_id) ||
          normalizeTokenRef(msg?.tokenId) ||
          normalizeTokenRef(msg?.token?.tokenId) ||
          "";
        const msgTokenKey =
          normalizeTokenRef(msg?.tokenKey) ||
          normalizeTokenRef(msg?.token_key) ||
          normalizeTokenRef(msg?.symbol) ||
          normalizeTokenRef(msg?.token?.symbol) ||
          "";
        const msgPoolId =
          normalizeTokenRef(String(msg?.pool_id ?? msg?.poolId ?? msg?.poolID ?? "")) ||
          "";
        const msgPairContract =
          normalizeTokenRef(msg?.pair_contract ?? msg?.pairContract ?? msg?.denom) ||
          "";

        for (const row of rows) {
          const rowTokens = [
            normalizeTokenRef(row?.token_id),
            normalizeTokenRef(row?.tokenId),
            normalizeTokenRef(row?.token_key),
            normalizeTokenRef(row?.tokenKey),
            normalizeTokenRef(row?.symbol),
            normalizeTokenRef(row?.pair_contract),
            normalizeTokenRef(row?.pairContract),
            normalizeTokenRef(row?.denom),
            normalizeTokenRef(row?.token?.denom),
            normalizeTokenRef(String(row?.pool_id ?? row?.poolId ?? row?.poolID ?? "")),
            msgToken,
            msgTokenKey,
            msgPoolId,
            msgPairContract,
          ].filter(Boolean);

          if (!rowTokens.length) continue;

          for (const [listenerKey, fns] of this.listeners.entries()) {
            const normalizedListener = normalizeTokenRef(listenerKey);
            const isMatch = rowTokens.some(
              (token) =>
                token === normalizedListener ||
                token.includes(normalizedListener) ||
                normalizedListener.includes(token)
            );
            if (!isMatch) continue;
            fns.forEach((fn) => fn(row));
          }
        }
      } catch {
        // ignore malformed messages
      }
    };
  }

  private extractRows(msg: any): any[] {
    if (msg?.type !== "token_summary" && msg?.stream !== "token_summary") return [];
    const data = msg?.data;
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object") return [data];
    return [];
  }

  private collectKeys(type: StatsKeyType) {
    return Array.from(this.keyTypeCounts.entries())
      .filter(([, counts]) => counts.has(type))
      .map(([key]) => key);
  }

  private syncSubs() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const tokenKeys = this.collectKeys("token_key");
    const tokenIds = this.collectKeys("token_id");
    const poolIds = this.collectKeys("pool_id");
    const pairContracts = this.collectKeys("pair_contract");
    if (
      !tokenKeys.length &&
      !tokenIds.length &&
      !poolIds.length &&
      !pairContracts.length
    ) {
      return;
    }
    const payload: Record<string, any> = {
      type: "sub",
      stream: "token_summary",
    };
    if (tokenKeys.length) payload.token_keys = tokenKeys;
    if (tokenIds.length) payload.token_ids = tokenIds;
    if (poolIds.length) payload.pool_ids = poolIds;
    if (pairContracts.length) payload.pair_contracts = pairContracts;
    this.ws.send(JSON.stringify(payload));
  }

  private close() {
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

const statsWsHub = new StatsWsHub();

// Enhanced Stat Card Component
const StatCard = ({ label, value, subValue, trend, delay = 0 }: { 
  label: string; 
  value: string; 
  subValue?: string;
  trend?: "up" | "down" | "neutral";
  delay?: number;
}) => (
  <motion.div 
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.3 }}
    className="group relative overflow-hidden rounded-xl border border-white/[0.2] bg-white/[0.02] p-3 backdrop-blur-sm transition-all duration-300"
  >
    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 transition-opacity duration-300" />
    <p className="relative text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
    <p className="relative mt-1 text-sm font-bold text-white">{value}</p>
    {subValue && (
      <p className={`relative mt-0.5 text-[10px] font-medium ${
        trend === "up" ? "text-emerald-400" : trend === "down" ? "text-rose-400" : "text-zinc-400"
      }`}>
        {subValue}
      </p>
    )}
  </motion.div>
);

const FindGemsSparkline = ({
  data,
  isPositive,
  width = 120,
  height = 32,
  opacity = 0.8,
  strokeWidth = 1.5,
  showArea = true,
}: {
  data: FindGemsCandle[];
  isPositive: boolean;
  width?: number;
  height?: number;
  opacity?: number;
  strokeWidth?: number;
  showArea?: boolean;
}) => {
  const gradientId = useMemo(
    () => `findgems-gradient-${Math.random().toString(36).slice(2, 9)}`,
    []
  );

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
          points={`${pad},${height - pad} ${points.join(" ")} ${
            width - pad
          },${height - pad}`}
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

const FindGemsTradingViewChart = ({
  data,
  currentPrice,
  height = 200,
}: {
  data: FindGemsCandle[];
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
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(255,255,255,0.75)",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.06)" },
        horzLines: { color: "rgba(255,255,255,0.06)" },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.2, bottom: 0.2 },
      },
      timeScale: { borderVisible: false },
      crosshair: { mode: 0 },
    });

    const series = chart.addCandlestickSeries({
      upColor: "#10b981",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
      priceFormat: {
        type: "price",
        precision: currentPrice && currentPrice < 1 ? 8 : 6,
        minMove: currentPrice && currentPrice < 1 ? 0.00000001 : 0.000001,
      },
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
    const scale =
      needsScale && currentPrice && medianClose ? currentPrice / medianClose : 1;

    series.setData(
      slice.map((d) => ({
        time: d.ts_sec as UTCTimestamp,
        open: d.open * scale,
        high: d.high * scale,
        low: d.low * scale,
        close: d.close * scale,
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

  return <div ref={containerRef} className="h-full w-full" />;
};

function MultiTokenStats({ token }: { token: TokenOption }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const subscriptionRefs = useMemo<StatsSubscriptionRef>(() => {
    const refs: StatsSubscriptionRef = {
      tokenKey: token.tokenKey,
      tokenId: token.tokenId,
      pairContract: token.denom,
    };
    if (token.id && /^[0-9]+$/.test(token.id)) {
      refs.poolId = token.id;
    }
    return refs;
  }, [token.tokenKey, token.tokenId, token.denom, token.id]);

  useEffect(() => {
    let cancelled = false;

    const fetchInitial = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/tokens/${encodeURIComponent(
            token.tokenKey
          )}?priceSource=best&includePools=1`,
          { headers: API_HEADERS, cache: "no-store" }
        );
        const json = await res.json();
        if (!cancelled) setData(json?.data ?? null);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    setLoading(true);
    fetchInitial();
    const normalizedRefs = new Set(
      Object.values(subscriptionRefs)
        .map((value) => normalizeTokenRef(value))
        .filter(Boolean)
    );
    const matchesPayload = (payload: any) => {
      if (!normalizedRefs.size) return false;
      const tokens = [
        normalizeTokenRef(payload?.token_id),
        normalizeTokenRef(payload?.tokenId),
        normalizeTokenRef(payload?.token_key),
        normalizeTokenRef(payload?.tokenKey),
        normalizeTokenRef(payload?.symbol),
        normalizeTokenRef(payload?.token?.symbol),
        normalizeTokenRef(payload?.pair_contract),
        normalizeTokenRef(payload?.pairContract),
        normalizeTokenRef(payload?.denom),
        normalizeTokenRef(payload?.token?.denom),
        normalizeTokenRef(String(payload?.pool_id ?? payload?.poolId ?? payload?.poolID ?? "")),
      ].filter(Boolean);
      return tokens.some((token) => normalizedRefs.has(token));
    };
    const off = statsWsHub.subscribe(subscriptionRefs, (payload) => {
      if (cancelled || !payload) return;
      if (!matchesPayload(payload)) return;
      setData((prev: any) => ({ ...(prev || {}), ...payload }));
      setLoading(false);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [subscriptionRefs, token.tokenKey]);

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <div className="flex items-center gap-2 text-zinc-400">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-400" />
        <span className="text-xs">Loading stats...</span>
      </div>
    </div>
  );
  
  if (!data) return (
    <div className="flex h-full items-center justify-center">
      <p className="text-xs text-zinc-500">No stats available.</p>
    </div>
  );

  const price = data?.price?.usd ?? data?.priceInUsd;
  const ch24 = data?.priceChange?.["24h"] ?? data?.price?.changePct?.["24h"];
  const mcap = data?.mcapDetail?.usd ?? data?.mcap?.usd ?? data?.mc;
  const liq = data?.liquidity;
  const fdv = data?.fdvDetail?.usd ?? data?.fdv;
  const vol24 = data?.volumeUSD?.["24h"];
  const tx24 = data?.txBuckets?.["24h"] ?? data?.tradeCount?.total;
  const supplyObj = typeof data?.supply === "number" ? null : data?.supply;
  const totalSupply = typeof data?.supply === "number" ? data.supply : supplyObj?.max;
  const circSupply = supplyObj?.circulating ?? data?.circulatingSupply;
  const holders = data?.holder;
  const createdAt = data?.creationTime ?? data?.token?.createdAt;
  const buys = Number(data?.buy);
  const sells = Number(data?.sell);
  const vBuyUsd = Number(data?.vBuyUSD ?? 0);
  const vSellUsd = Number(data?.vSellUSD ?? 0);
  const totalVs = vBuyUsd + vSellUsd;
  const buyPct = totalVs > 0 ? (vBuyUsd / totalVs) * 100 : 50;
  const sellPct = 100 - buyPct;

  const fmtPct = (v?: number) =>
    Number.isFinite(v)
      ? `${Number(v) > 0 ? "+" : ""}${Number(v).toFixed(2)}%`
      : "—";

  const fmtDate = (v?: string) => {
    if (!v) return "—";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="h-full space-y-3 overflow-y-auto pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-800">
      {/* Price Header */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative overflow-hidden rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-emerald-900/10 to-transparent p-4"
      >
        <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-emerald-500/10 blur-2xl" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-400/80">Live Price</p>
            <p className="mt-1 text-2xl font-bold text-white tracking-tight">{compactUsd(price)}</p>
          </div>
          <div className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${
            (ch24 ?? 0) > 0 ? "bg-emerald-500/20 text-emerald-400" : 
            (ch24 ?? 0) < 0 ? "bg-rose-500/20 text-rose-400" : "bg-zinc-500/20 text-zinc-400"
          }`}>
            {(ch24 ?? 0) > 0 ? <TrendingUp size={12} /> : (ch24 ?? 0) < 0 ? <TrendingDown size={12} /> : null}
            {fmtPct(ch24)}
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Market Cap" value={`$${shortNum(mcap)}`} delay={0.1} />
        <StatCard label="Liquidity" value={`$${shortNum(liq)}`} delay={0.15} />
        <StatCard label="24h Volume" value={`$${shortNum(vol24)}`} delay={0.2} />
        <StatCard label="24h Trades" value={Number.isFinite(tx24) ? Number(tx24).toString() : "—"} delay={0.25} />
        <StatCard label="Total Supply" value={shortNum(totalSupply)} delay={0.3} />
        <StatCard label="Circulating" value={shortNum(circSupply)} delay={0.35} />
        <StatCard label="Holders" value={shortNum(holders)} delay={0.4} />
        <StatCard label="Created" value={fmtDate(createdAt)} delay={0.45} />
      </div>

      {/* Timeframe Changes */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="rounded-xl border border-white/5 bg-white/[0.02] p-3"
      >
        <div className="mb-2 flex items-center gap-2">
          <Clock size={12} className="text-zinc-500" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Performance</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {["30m", "1h", "4h", "24h"].map((tf, i) => {
            const change = data?.priceChange?.[tf] ?? data?.price?.changePct?.[tf] ?? data?.priceChange?.[tf.toLowerCase()];
            const vol = data?.volumeUSD?.[tf] ?? data?.volumeUSD?.[tf.toLowerCase()];
            return (
              <div key={tf} className="text-center">
                <p className="text-[10px] font-medium text-zinc-600">{tf}</p>
                <p className={`text-sm font-bold ${
                  (change ?? 0) > 0 ? "text-emerald-400" : (change ?? 0) < 0 ? "text-rose-400" : "text-zinc-300"
                }`}>
                  {fmtPct(change)}
                </p>
                <p className="text-[9px] text-zinc-600">${shortNum(vol)}</p>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Buy/Sell Pressure */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="rounded-xl border border-white/5 bg-white/[0.02] p-3"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={12} className="text-amber-400" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Buy/Sell Pressure</span>
          </div>
          <span className="text-[10px] text-zinc-600">{buyPct.toFixed(1)}% Buy</span>
        </div>
        
        <div className="mb-3 flex items-center justify-between text-sm">
          <div className="flex items-center gap-1.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20">
              <ArrowUpRight size={14} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500">Buys</p>
              <p className="font-bold text-emerald-400">${shortNum(vBuyUsd)}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-right">
            <div>
              <p className="text-[10px] text-zinc-500">Sells</p>
              <p className="font-bold text-rose-400">${shortNum(vSellUsd)}</p>
            </div>
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/20">
              <ArrowDownRight size={14} className="text-rose-400" />
            </div>
          </div>
        </div>

        <div className="relative h-2 w-full overflow-hidden rounded-full bg-zinc-800">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${buyPct}%` }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-500 to-emerald-400"
          />
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${sellPct}%` }}
            transition={{ delay: 0.9, duration: 0.5 }}
            className="absolute right-0 top-0 h-full bg-gradient-to-l from-rose-500 to-rose-400"
          />
        </div>
        
        <div className="mt-2 flex justify-between text-[10px] text-zinc-600">
          <span>{Number.isFinite(buys) ? Number(buys) : "—"} orders</span>
          <span>{Number.isFinite(sells) ? Number(sells) : "—"} orders</span>
        </div>
      </motion.div>
    </div>
  );
}

function FindGemsTokenWidget({ token }: { token: TokenOption }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `${API_BASE}/tokens/${encodeURIComponent(
            token.tokenKey
          )}?priceSource=best&includePools=1`,
          { headers: API_HEADERS, cache: "no-store" }
        );
        const json = await res.json();
        if (!cancelled) setData(json?.data ?? null);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [token.tokenKey]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-zinc-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-fuchsia-400" />
          <span className="text-xs">Building FindGems view...</span>
        </div>
      </div>
    );
  }

  const price = data?.price?.usd ?? data?.priceInUsd ?? data?.priceUsd;
  const change24h =
    data?.priceChange?.["24h"] ??
    data?.price?.changePct?.["24h"] ??
    data?.change24hPct;
  const volume =
    data?.volumeUSD?.["24h"] ?? data?.volume?.["24h"] ?? data?.volUsd;
  const holders = data?.holder ?? data?.holders;
  const liquidity = data?.liquidity;
  const marketCap = data?.mcapDetail?.usd ?? data?.mcap?.usd ?? data?.mc ?? data?.mcapUsd;
  const pools = Array.isArray(data?.pools) ? data.pools.length : data?.poolCount;
  const change24hNumber = Number(change24h);
  const positive = Number(change24h ?? 0) >= 0;
  const scoreParts = [
    Number(volume ?? 0) > 0,
    Number(liquidity ?? 0) > 0,
    Number(holders ?? 0) > 0,
    Number(change24h ?? 0) > 0,
  ].filter(Boolean).length;
  const gemScore = Math.min(100, 48 + scoreParts * 13);
  const tokenHref = `/token/${encodeURIComponent(
    storeTokenRoute(token.denom, token.symbol, token.tokenKey)
  )}`;

  return (
    <div className="h-full overflow-y-auto pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-800">
      <div className="relative overflow-hidden rounded-xl border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/10 via-emerald-500/10 to-transparent p-4">
        <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-fuchsia-500/10 blur-2xl" />
        <div className="relative flex items-start gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
            {token.imageUri ? (
              <img src={token.imageUri} alt={token.symbol} className="h-full w-full object-cover" />
            ) : (
              <span className="text-sm font-bold text-white">{token.symbol.slice(0, 2)}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-xl font-black text-white">{token.symbol}</p>
              <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-fuchsia-300">
                Gem Score {gemScore}
              </span>
            </div>
            <p className="truncate text-xs text-zinc-500">{token.name}</p>
          </div>
        </div>

        <div className="relative mt-4 grid grid-cols-2 gap-2">
          <StatCard label="Price" value={compactUsd(price)} />
          <StatCard
            label="24h Move"
            value={
              Number.isFinite(change24hNumber)
                ? `${change24hNumber > 0 ? "+" : ""}${change24hNumber.toFixed(2)}%`
                : "—"
            }
            trend={positive ? "up" : "down"}
          />
          <StatCard label="Volume" value={`$${shortNum(volume)}`} />
          <StatCard label="Liquidity" value={`$${shortNum(liquidity)}`} />
          <StatCard label="Market Cap" value={`$${shortNum(marketCap)}`} />
          <StatCard label="Holders" value={shortNum(holders)} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          { label: "Momentum", value: positive ? "Heating up" : "Cooling off" },
          { label: "Discovery", value: Number(volume ?? 0) > 0 ? "Active tape" : "Quiet tape" },
          { label: "Pools", value: pools != null ? String(pools) : "Best route" },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{item.label}</p>
            <p className="mt-1 text-sm font-semibold text-zinc-100">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">FindGems Idea</p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-300">
          Use this format when you want a discovery-first read: price, momentum,
          volume, liquidity, and holders in one fast card before opening the full
          token page.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={tokenHref}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
          >
            Open Token <ExternalLink size={12} />
          </a>
          <a
            href="/findgems"
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-white/10"
          >
            Full FindGems <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}

function FindGemsHeatmapWidget({ token }: { token: TokenOption }) {
  const [cardToken, setCardToken] = useState<FindGemsCardToken | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const normalizeCandle = (candle: any): FindGemsCandle => ({
      ts_sec: Math.floor(new Date(candle?.ts ?? candle?.time ?? Date.now()).getTime() / 1000),
      open: Number(candle?.o ?? candle?.open ?? 0),
      high: Number(candle?.h ?? candle?.high ?? 0),
      low: Number(candle?.l ?? candle?.low ?? 0),
      close: Number(candle?.c ?? candle?.close ?? 0),
      volume: candle?.v ?? candle?.volume,
      trades: candle?.trades,
    });

    const mapDetailsToCard = (detail: any): FindGemsCardToken => {
      const tokenData = detail?.token ?? detail ?? {};
      const changePct = detail?.priceChange ?? detail?.price?.changePct ?? {};
      const rawCandles =
        detail?.candles1d ?? detail?.candles ?? detail?.ohlcv ?? tokenData?.candles1d ?? [];

      return {
        rank: 1,
        symbol: tokenData?.symbol ?? token.symbol,
        name: tokenData?.name ?? token.name,
        priceUsd: Number(
          detail?.price?.usd ?? detail?.priceInUsd ?? detail?.priceUsd ?? tokenData?.priceUsd ?? 0
        ),
        holders: Number(detail?.holder ?? detail?.holders ?? tokenData?.holders ?? 0),
        mcapUsd:
          detail?.mcapDetail?.usd ??
          detail?.mcap?.usd ??
          detail?.mc ??
          detail?.mcapUsd ??
          tokenData?.mcapUsd ??
          null,
        volUsd: Number(
          detail?.volumeUSD?.["24h"] ??
            detail?.volume?.["24h"] ??
            detail?.volUsd ??
            tokenData?.volUsd ??
            0
        ),
        imageUri: tokenData?.imageUri ?? token.imageUri ?? "",
        change24hPct: changePct?.["24h"] ?? detail?.change24hPct,
        tokenId: tokenData?.tokenId ? String(tokenData.tokenId) : token.tokenId,
        changePct: {
          "30m": Number(changePct?.["30m"] ?? 0),
          "4h": Number(changePct?.["4h"] ?? 0),
          "24h": Number(changePct?.["24h"] ?? detail?.change24hPct ?? 0),
        },
        candles: Array.isArray(rawCandles)
          ? rawCandles.map(normalizeCandle).filter((c) => Number.isFinite(c.close) && c.close > 0)
          : [],
      };
    };

    const mapMoverToCard = (item: any, index: number): FindGemsCardToken => ({
      rank: index + 1,
      symbol: item?.symbol || token.symbol,
      name: item?.name || token.name,
      priceUsd: Number(item?.priceUsd || 0),
      holders: Number(item?.holders || 0),
      mcapUsd: item?.mcapUsd ?? null,
      volUsd: Number(item?.volUsd || 0),
      imageUri: item?.imageUri || token.imageUri || "",
      change24hPct: item?.change24hPct ?? item?.changePct?.["24h"],
      tokenId: item?.tokenId ? String(item.tokenId) : token.tokenId,
      changePct: item?.changePct || {},
      candles: Array.isArray(item?.candles1d)
        ? item.candles1d
            .map(normalizeCandle)
            .filter((c: FindGemsCandle) => Number.isFinite(c.close) && c.close > 0)
        : [],
    });

    const load = async () => {
      try {
        setLoading(true);
        const [detailsRes, moversRes] = await Promise.all([
          fetch(
            `${API_BASE}/tokens/${encodeURIComponent(
              token.tokenKey
            )}?priceSource=best&includePools=1`,
            { headers: API_HEADERS, cache: "no-store" }
          ),
          fetch(
            `${API_BASE}/tokens/movers?chartTf=24h&includeCandles=1&sparkLimit=30`,
            { headers: API_HEADERS, cache: "no-store" }
          ),
        ]);

        const detailsJson = await detailsRes.json();
        const moversJson = await moversRes.json();
        const movers = [
          ...(Array.isArray(moversJson?.data?.gainers) ? moversJson.data.gainers : []),
          ...(Array.isArray(moversJson?.data?.losers) ? moversJson.data.losers : []),
        ];
        const tokenRefs = new Set(
          [token.tokenId, token.tokenKey, token.symbol, token.denom]
            .map((value) => normalizeTokenRef(value))
            .filter(Boolean)
        );
        const moverIndex = movers.findIndex((item) =>
          [item?.tokenId, item?.symbol, item?.denom, item?.token?.denom]
            .map((value) => normalizeTokenRef(String(value ?? "")))
            .some((value) => tokenRefs.has(value))
        );
        const detailCard = mapDetailsToCard(detailsJson?.data ?? null);
        const moverCard =
          moverIndex >= 0 ? mapMoverToCard(movers[moverIndex], moverIndex) : null;

        if (!cancelled) {
          setCardToken({
            ...detailCard,
            ...(moverCard ?? {}),
            candles: moverCard?.candles?.length ? moverCard.candles : detailCard.candles,
            changePct: {
              ...detailCard.changePct,
              ...(moverCard?.changePct ?? {}),
            },
          });
        }
      } catch {
        if (!cancelled) {
          setCardToken({
            rank: 1,
            symbol: token.symbol,
            name: token.name,
            priceUsd: 0,
            holders: 0,
            mcapUsd: null,
            volUsd: 0,
            imageUri: token.imageUri ?? "",
            tokenId: token.tokenId,
            changePct: { "24h": 0 },
            candles: [],
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [token.denom, token.imageUri, token.name, token.symbol, token.tokenId, token.tokenKey]);

  if (loading || !cardToken) {
    return (
      <div className="relative h-full min-h-[220px] w-full overflow-hidden rounded-2xl">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-800 to-emerald-600 opacity-75" />
        <div className="absolute inset-0 animate-pulse rounded-2xl bg-black/20" />
        <div className="relative flex h-full flex-col justify-between p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-white/20 ring-2 ring-white/10" />
              <div className="h-4 w-14 rounded-full bg-white/20" />
            </div>
          </div>
          <div className="space-y-3">
            <div className="h-7 w-20 rounded-full bg-white/20" />
            <div className="h-8 w-full rounded-2xl bg-white/10" />
          </div>
        </div>
      </div>
    );
  }

  const change = Number(cardToken.changePct?.["24h"] ?? cardToken.change24hPct ?? 0);
  const isPos = change >= 0;
  const intensity = getFindGemsIntensityColor(change);
  const tokenPath = encodeURIComponent(
    storeTokenRoute(token.denom, cardToken.symbol || token.symbol, cardToken.tokenId)
  );

  return (
    <motion.div
      key={`${cardToken.tokenId || cardToken.symbol}-24h`}
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className="relative group h-full min-h-[220px] cursor-pointer rounded-2xl transition-all duration-500 [perspective:1200px]"
    >
      <div className="relative h-full w-full overflow-hidden rounded-2xl">
        <div className="relative h-full w-full transition-transform duration-700 [transform-style:preserve-3d] group-hover:[transform:rotateY(180deg)]">
          <div className="absolute inset-0 rounded-2xl [backface-visibility:hidden]">
            <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${intensity} opacity-90 transition-opacity group-hover:opacity-100`} />
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full transition-transform duration-1000 group-hover:translate-x-full" />

            <div className="relative flex h-full flex-col justify-between p-4">
              <div className="flex items-start justify-between">
                <a href={`/token/${tokenPath}`} className="flex min-w-0 items-center gap-2">
                  {cardToken.imageUri ? (
                    <img
                      src={cardToken.imageUri}
                      className="h-8 w-8 rounded-full ring-2 ring-white/20"
                      alt={cardToken.symbol}
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white ring-2 ring-white/20">
                      {cardToken.symbol.slice(0, 2)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="block truncate text-lg font-bold text-white">
                      {cardToken.symbol}
                    </span>
                  </div>
                </a>

                {cardToken.rank <= 3 && (
                  <div className="flex items-center gap-1 rounded-full border border-yellow-400/30 bg-yellow-400/20 px-2 py-1">
                    <Crown size={14} className="text-yellow-300" />
                    <span className="text-xs font-bold text-yellow-300">#{cardToken.rank}</span>
                  </div>
                )}
              </div>

              <div className="mt-auto">
                <div className="text-2xl font-bold text-white drop-shadow-lg">
                  {formatFindGemsPercent(change)}
                </div>

                <div className="mt-2 h-8">
                  {cardToken.candles.length ? (
                    <FindGemsSparkline
                      data={cardToken.candles}
                      isPositive={isPos}
                      width={120}
                      height={32}
                      opacity={0.8}
                      showArea
                    />
                  ) : (
                    <div className="flex h-full items-center text-xs text-white/40">No data</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="absolute inset-0 rounded-2xl [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${intensity} opacity-95`} />
            <div className="absolute inset-0 rounded-2xl bg-black/35" />

            <div className="relative grid h-full grid-rows-[auto_1fr] gap-2 p-3">
              <div className="relative flex items-start justify-between gap-2">
                <a href={`/token/${tokenPath}`} className="flex min-w-0 items-center gap-2">
                  {cardToken.imageUri ? (
                    <img
                      src={cardToken.imageUri}
                      className="h-8 w-8 rounded-full ring-2 ring-white/20"
                      alt={cardToken.symbol}
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white ring-2 ring-white/20">
                      {cardToken.symbol.slice(0, 2)}
                    </div>
                  )}
                  <div className="truncate font-bold text-white">{cardToken.symbol}</div>
                </a>
                <div className="text-right">
                  <div className="text-[9px] text-white/60">24H</div>
                  <div className="text-[11px] font-semibold text-white/90">
                    {formatFindGemsPrice(cardToken.priceUsd)}
                  </div>
                </div>
              </div>

              <div className="min-h-0">
                {cardToken.candles.length ? (
                  <div className="h-full min-h-[76px] w-full overflow-hidden">
                    <FindGemsTradingViewChart
                      data={cardToken.candles}
                      height={110}
                      currentPrice={cardToken.priceUsd}
                    />
                  </div>
                ) : (
                  <div className="text-sm text-white/60">No trading data</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function AppLauncherWidget({ type }: { type: AppWidgetType }) {
  const [address, setAddress] = useState("");
  const option = appWidgetOptions.find((item) => item.type === type);
  const href = appWidgetRoutes[type];
  const isWalletDetails = type === "wallet-details";
  const cleanedAddress = address.trim();
  const portfolioHref = cleanedAddress
    ? `/portfolio?address=${encodeURIComponent(cleanedAddress)}`
    : "/portfolio";
  const profileHref = cleanedAddress
    ? `/profile?handle=${encodeURIComponent(cleanedAddress)}`
    : "/profile";

  return (
    <div className="flex h-full flex-col justify-between overflow-hidden">
      <div>
        <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br ${typeGradient[type]} text-zinc-100`}>
          {typeIcon[type]}
        </div>
        <p className="text-xl font-black text-white">{option?.label ?? typeLabel[type]}</p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          {option?.description ?? "Open this Degenter tool from your canvas."}
        </p>
      </div>

      {isWalletDetails && (
        <div className="my-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Wallet Address
          </label>
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="zig1..."
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-500/40"
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a
              href={portfolioHref}
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-center text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
            >
              Portfolio
            </a>
            <a
              href={profileHref}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center text-xs font-semibold text-zinc-300 transition hover:bg-white/10"
            >
              Profile
            </a>
          </div>
        </div>
      )}

      {!isWalletDetails && (
        <a
          href={href}
          className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-300 transition hover:bg-emerald-500/20"
        >
          Open {option?.label ?? typeLabel[type]}
          <ExternalLink size={14} />
        </a>
      )}
    </div>
  );
}

function EmbeddedRouteFrame({ src, title }: { src: string; title: string }) {
  return (
    <iframe
      title={title}
      src={src}
      className="h-full w-full rounded-lg border-0 bg-black"
    />
  );
}

type CanvasPortfolioTab = "trading" | "portfolio" | "activities";
type CanvasTradingTimeframe = "24h" | "7d" | "10d" | "1M";

function CanvasPortfolioWidget({ initialAddress = "" }: { initialAddress?: string }) {
  const [address, setAddress] = useState(initialAddress);
  const [activeTab, setActiveTab] = useState<CanvasPortfolioTab>("trading");
  const [timeframe, setTimeframe] = useState<CanvasTradingTimeframe>("1M");
  const addressOverride = address.trim() || undefined;

  return (
    <div className="h-full overflow-y-auto bg-black p-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-800">
      <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">
          Wallet Address
        </label>
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="zig1..."
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-500/40"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(280px,360px),1fr]">
        <CanvasWalletAnalyzerSidebar addressOverride={addressOverride} />
        <div className="min-w-0">
          <CanvasWalletAnalyzerBoxes
            activeTab={activeTab}
            onTabChange={setActiveTab}
            addressOverride={addressOverride}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
          />
          {activeTab === "portfolio" && (
            <CanvasWalletAnalyzerPortfolio addressOverride={addressOverride} />
          )}
          {activeTab === "activities" && (
            <CanvasWalletAnalyzerActivities addressOverride={addressOverride} />
          )}
        </div>
      </div>

      {activeTab === "trading" && (
        <div className="mt-4">
          <CanvasWalletAnalyzerTable
            addressOverride={addressOverride}
            timeframe={timeframe}
          />
        </div>
      )}
    </div>
  );
}

function AppToolWidget({ type }: { type: AppWidgetType }) {
  if (type === "create-token") {
    return (
      <div className="h-full overflow-y-auto bg-black scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-800">
        <CanvasCreateToken />
      </div>
    );
  }

  if (type === "findgems") {
    return (
      <div className="h-full overflow-y-auto bg-black scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-800">
        <CanvasFindGems />
      </div>
    );
  }

  if (type === "portfolio") {
    return <CanvasPortfolioWidget />;
  }

  if (type === "wallet-details") {
    return <CanvasPortfolioWidget />;
  }

  if (type === "wallet-tracker") {
    return (
      <div className="h-full overflow-y-auto bg-black scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-800">
        <CanvasWalletTrackerPage />
      </div>
    );
  }

  return null;
}

// Enhanced Trade Row Component
const TradeRow = ({
  trade,
  index,
  isHighlighted = false,
}: {
  trade: ApiTrade;
  index: number;
  isHighlighted?: boolean;
}) => {
  const direction = trade.direction === "sell" ? "sell" : "buy";
  const timeAgo = formatTimeAgo(trade.time);
  const value = trade.valueUsd ?? trade.value_usd ?? trade.value_in_usd;
  const price = trade.priceUsd ?? trade.price_usd ?? trade.price_in_usd;
  const offerAmount = Number(trade.offerAmount ?? trade.offer_amount ?? 0);
  const returnAmount = Number(trade.returnAmount ?? trade.return_amount ?? 0);
  const offerDenom = trade.offerDenom ?? trade.offer_denom;
  const askDenom = trade.askDenom ?? trade.ask_denom;

  const tokenAmount = direction === "buy" ? returnAmount : offerAmount;
  const tokenDenom = direction === "buy" ? askDenom : offerDenom;
  const zigAmount = direction === "buy" ? offerAmount : returnAmount;
  const zigDenom = direction === "buy" ? offerDenom : askDenom;

  const tokenText = Number.isFinite(tokenAmount) && tokenAmount > 0
    ? `${direction === "buy" ? "+" : "-"}${shortNum(tokenAmount)} ${denomLabel(tokenDenom)}`
    : "—";
  const zigText = Number.isFinite(zigAmount) && zigAmount > 0
    ? `${direction === "buy" ? "-" : "+"}${shortNum(zigAmount)} ${denomLabel(zigDenom)}`
    : "";
  const txShort = shortAddress(trade.txHash);
  const signerShort = shortAddress(trade.signer);

  const highlightClasses = isHighlighted
    ? "ring-1 ring-emerald-400/40 shadow-[0_0_15px_rgba(16,185,129,0.35)] bg-white/5"
    : "";

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{
        opacity: 1,
        x: 0,
        scale: isHighlighted ? 1.01 : 1,
      }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
      className={`group relative grid grid-cols-12 items-center gap-x-2 gap-y-1 rounded-lg border px-2.5 py-2 text-[11px] transition-all duration-200 ${
        direction === "buy"
          ? "border-emerald-500/10 bg-emerald-500/[0.03]"
          : "border-rose-500/10 bg-rose-500/[0.03]"
      } ${highlightClasses}`}
    >
      <div className={`absolute left-0 top-0 h-full w-0.5 ${
        direction === "buy" ? "bg-emerald-500" : "bg-rose-500"
      }`} />
      
      <span className="col-span-2 truncate font-medium text-zinc-500">{timeAgo}</span>
      
      <span className={`col-span-2 flex items-center gap-1 truncate font-bold uppercase ${
        direction === "buy" ? "text-emerald-400" : "text-rose-400"
      }`}>
        {direction === "buy" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        {direction}
      </span>
      
      <span className="col-span-2 truncate font-semibold text-white">{compactUsd(price)}</span>
      
      <span className="col-span-2 flex min-w-0 items-center gap-1.5 truncate font-medium text-zinc-200">
        <span className="text-lg">{rowEmoji(value)}</span>
        <span className="truncate">{compactUsd(value)}</span>
      </span>
      
      <div className="col-span-2 min-w-0 leading-tight">
        <span className={`block truncate font-semibold ${
          direction === "buy" ? "text-emerald-300" : "text-rose-300"
        }`}>{tokenText}</span>
        {zigText && <span className="block truncate text-zinc-500">{zigText}</span>}
      </div>
      
      <a
        href={trade.signer ? `https://www.zigscan.org/address/   ${trade.signer}` : undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="col-span-1 truncate font-mono text-zinc-400"
      >
        {signerShort}
      </a>
      <a
        href={trade.txHash ? `https://www.zigscan.org/tx/   ${trade.txHash}` : undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="col-span-1 truncate text-right font-mono text-zinc-600"
      >
        {txShort}
      </a>
    </motion.div>
  );
};

const buildTradeRefs = (token: TokenOption): Set<string> => {
  const refs = new Set<string>();
  const add = (value?: string) => {
    if (!value) return;
    const normalized = normalizeTokenRef(value);
    if (normalized) refs.add(normalized);
  };
  add(token.tokenKey);
  add(token.tokenId);
  add(token.symbol);
  add(token.name);
  add(token.denom);
  if (token.id && /^[0-9]+$/.test(token.id)) {
    add(token.id);
  }
  return refs;
};

const buildTradeSubscriptionRefs = (token: TokenOption): TradeSubscriptionRef => {
  const refs: TradeSubscriptionRef = {};
  if (token.tokenKey) refs.tokenKey = token.tokenKey;
  if (token.tokenId) refs.tokenId = token.tokenId;
  if (token.denom) refs.pairContract = token.denom;
  if (token.id && /^[0-9]+$/.test(token.id)) refs.poolId = token.id;
  return refs;
};

function MultiRecentTrades({ token }: { token: TokenOption }) {
  const [trades, setTrades] = useState<ApiTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [, setNowTick] = useState(0);
  const tradeRefs = useMemo(
    () => buildTradeRefs(token),
    [token.tokenKey, token.tokenId, token.symbol, token.name, token.denom, token.id]
  );
  const tradeSubscriptionRefs = useMemo(
    () => buildTradeSubscriptionRefs(token),
    [token.tokenKey, token.tokenId, token.denom, token.id]
  );
  const subscriptionId = token.denom || token.tokenKey || token.tokenId || token.id;

  const highlightTimers = useRef<Map<string, number>>(new Map());
  const [highlightedTradeIds, setHighlightedTradeIds] = useState<Record<string, boolean>>(
    {}
  );
  const markTradesAsHighlighted = useCallback((ids: string[]) => {
    if (!ids.length) return;
    setHighlightedTradeIds((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        if (!id) return;
        const existingTimer = highlightTimers.current.get(id);
        if (existingTimer) {
          window.clearTimeout(existingTimer);
        }
        next[id] = true;
        if (typeof window === "undefined") return;
        const timeout = window.setTimeout(() => {
          setHighlightedTradeIds((current) => {
            if (!current[id]) return current;
            const updated = { ...current };
            delete updated[id];
            return updated;
          });
          highlightTimers.current.delete(id);
        }, HIGHLIGHT_DURATION_MS);
        highlightTimers.current.set(id, timeout);
      });
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      highlightTimers.current.forEach((timer) => window.clearTimeout(timer));
      highlightTimers.current.clear();
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowTick((v) => v + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const matchesTrade = (trade: ApiTrade) => {
      if (!tradeRefs.size) return false;
      const tokens = [
        normalizeTokenRef(trade?.token_id),
        normalizeTokenRef(trade?.tokenId),
        normalizeTokenRef(trade?.token_key),
        normalizeTokenRef(trade?.tokenKey),
        normalizeTokenRef(trade?.symbol),
        normalizeTokenRef(trade?.pair_contract),
        normalizeTokenRef(trade?.pairContract),
        normalizeTokenRef(trade?.denom),
        normalizeTokenRef(trade?.offerDenom),
        normalizeTokenRef(trade?.askDenom),
        normalizeTokenRef(String(trade?.pool_id ?? trade?.poolId ?? trade?.poolID ?? "")),
      ].filter(Boolean);
      return tokens.some((tokenRef) => tradeRefs.has(tokenRef));
    };

    const addTrades = (incoming: ApiTrade[]) => {
      const filtered = incoming.filter(matchesTrade);
      if (!filtered.length) return;
      setTrades((prev) => {
        const seen = new Set(
          prev.map((t) => getTradeKey(t)).filter(Boolean)
        );
        const normalizedIncoming = filtered.map(normalizeTrade);
        const unique = normalizedIncoming.filter((trade) => {
          const id = getTradeKey(trade);
          return id ? !seen.has(id) : true;
        });
        if (!unique.length) return prev;
        markTradesAsHighlighted(
          unique
            .map((trade) => getTradeKey(trade))
            .filter((id): id is string => Boolean(id))
        );
        const merged = [...unique, ...prev];
        merged.sort(
          (a, b) =>
            Date.parse(b.time || "") - Date.parse(a.time || "")
        );
        return merged.slice(0, MAX_RECENT_TRADES);
      });
    };

    const upsertTrades = (rows: ApiTrade[]) => {
      const normalized = rows.map(normalizeTrade);
      setTrades((prev) => {
        const seen = new Set(
          prev.map((t) => getTradeKey(t)).filter(Boolean)
        );
        const unique = normalized.filter((trade) => {
          const id = getTradeKey(trade);
          return id ? !seen.has(id) : true;
        });
        if (!unique.length) return prev;
        markTradesAsHighlighted(
          unique
            .map((trade) => getTradeKey(trade))
            .filter((id): id is string => Boolean(id))
        );
        const merged = [...unique, ...prev];
        merged.sort((a, b) => Date.parse(b.time || "") - Date.parse(a.time || ""));
        return merged.slice(0, MAX_RECENT_TRADES);
      });
    };

    const fetchInitial = async () => {
      if (!subscriptionId) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(
          `${API_BASE}/trades/token/${encodeURIComponent(subscriptionId)}?limit=${MAX_RECENT_TRADES}`,
          { headers: API_HEADERS, cache: "no-store" }
        );
        const json = await res.json();
        const rows = Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json)
          ? json
          : [];
        if (!cancelled) upsertTrades(rows);
      } catch {
        if (!cancelled) {
          setTrades((prev) => (prev.length ? prev : []));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    setLoading(true);
    fetchInitial();

    const offStatus = tradesWsHub.onStatus((v) => !cancelled && setWsConnected(v));
    const offTrades = tradesWsHub.subscribe(tradeSubscriptionRefs, addTrades);

    return () => {
      cancelled = true;
      offStatus();
      offTrades();
    };
  }, [subscriptionId, tradeRefs]);

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="relative h-8 w-8">
          <div className="absolute inset-0 animate-ping rounded-full bg-emerald-500/20" />
          <div className="relative h-full w-full animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
        </div>
        <span className="text-xs text-zinc-500">Loading trades...</span>
      </div>
    </div>
  );
  
  if (!trades.length) return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <Waves size={24} className="mx-auto mb-2 text-zinc-700" />
        <p className="text-xs text-zinc-500">No recent trades.</p>
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-hidden">
      {/* Connection Status */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`relative flex h-2 w-2 items-center justify-center`}>
            <div className={`absolute h-full w-full animate-ping rounded-full ${wsConnected ? "bg-emerald-400" : "bg-amber-400"}`} />
            <div className={`relative h-2 w-2 rounded-full ${wsConnected ? "bg-emerald-400" : "bg-amber-400"}`} />
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-wider ${wsConnected ? "text-emerald-400" : "text-amber-400"}`}>
            {wsConnected ? "Live Stream" : "Syncing..."}
          </span>
        </div>
      </div>

      {/* Trades List */}
      <div className="h-[calc(100%-2rem)] space-y-1.5 overflow-y-auto pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-800">
        <AnimatePresence>
          {trades.slice(0, 50).map((trade, idx) => {
            const tradeId = getTradeKey(trade) ?? `${idx}-${trade.time ?? idx}`;
            const isHighlighted = Boolean(highlightedTradeIds[tradeId]);
            return (
              <TradeRow
                key={tradeId}
                trade={trade}
                index={idx}
                isHighlighted={isHighlighted}
              />
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Optimized Resizable Widget Component
const ResizableWidget = ({
  slot,
  onUpdate,
  onRemove,
  containerRef,
  allSlots,
}: {
  slot: SlotItem;
  onUpdate: (updates: Partial<SlotItem>) => void;
  onRemove: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  allSlots: SlotItem[];
}) => {
  const [isResizing, setIsResizing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  
  const resizeStartPos = useRef({ x: 0, y: 0 });
  const resizeStartSize = useRef({ width: 0, height: 0 });
  const dragStartPos = useRef({ x: 0, y: 0 });
  const dragStartOffset = useRef({ x: 0, y: 0 });
  const animationFrameRef = useRef<number | null>(null);
  const pendingMouseEventRef = useRef<globalThis.MouseEvent | null>(null);
  const dragContainerBounds = useRef<DOMRect | null>(null);

  const isChart = slot.type === "charts";
  const headerLabel = slot.token?.symbol ?? typeLabel[slot.type];
  const headerSubLabel = slot.token?.name ?? typeLabel[slot.type];

  // Snap to grid helper
  const snapToGrid = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE;

  // Check collision with other widgets
  const checkCollision = (x: number, y: number, width: number, height: number, excludeId: string) => {
    const rect1 = { x, y, width, height };
    return allSlots.some((other) => {
      if (other.id === excludeId) return false;
      const rect2 = { x: other.x, y: other.y, width: other.width, height: other.height };
      return (
        rect1.x < rect2.x + rect2.width + WIDGET_GAP &&
        rect1.x + rect1.width + WIDGET_GAP > rect2.x &&
        rect1.y < rect2.y + rect2.height + WIDGET_GAP &&
        rect1.y + rect1.height + WIDGET_GAP > rect2.y
      );
    });
  };

  // Find valid position (simple push strategy)
  const findValidPosition = (targetX: number, targetY: number, width: number, height: number) => {
    if (!checkCollision(targetX, targetY, width, height, slot.id)) {
      return { x: targetX, y: targetY };
    }
    
    // Try positions below existing widgets
    const sortedSlots = [...allSlots].sort((a, b) => a.y - b.y);
    for (const other of sortedSlots) {
      if (other.id === slot.id) continue;
      const testY = other.y + other.height + WIDGET_GAP;
      if (!checkCollision(targetX, testY, width, height, slot.id)) {
        return { x: targetX, y: testY };
      }
    }
    
    return { x: targetX, y: targetY };
  };

  // Handle resize start
  const handleResizeStart = (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStartPos.current = { x: e.clientX, y: e.clientY };
    resizeStartSize.current = { width: slot.width, height: slot.height };
    
    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';
  };

  // Handle drag start
  const handleDragStart = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest(".resize-handle") ||
        (e.target as HTMLElement).closest(".remove-btn")) return;

    e.preventDefault();
    setIsDragging(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartOffset.current = { x: slot.x, y: slot.y };

    dragContainerBounds.current = containerRef.current?.getBoundingClientRect() ?? null;

    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const setPreviewIfChanged = (next: {
      x: number;
      y: number;
      width: number;
      height: number;
    }) => {
      setPreview((prev) => {
        if (
          prev &&
          prev.x === next.x &&
          prev.y === next.y &&
          prev.width === next.width &&
          prev.height === next.height
        ) {
          return prev;
        }
        return next;
      });
    };

    const processMove = (event: globalThis.MouseEvent) => {
      if (isResizing) {
        const dx = event.clientX - resizeStartPos.current.x;
        const dy = event.clientY - resizeStartPos.current.y;

        const rawWidth = resizeStartSize.current.width + dx;
        const rawHeight = resizeStartSize.current.height + dy;

        const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, snapToGrid(rawWidth)));
        const newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, snapToGrid(rawHeight)));

        if (!checkCollision(slot.x, slot.y, newWidth, newHeight, slot.id)) {
          setPreviewIfChanged({ x: slot.x, y: slot.y, width: newWidth, height: newHeight });
        }
      } else if (isDragging) {
        const dx = event.clientX - dragStartPos.current.x;
        const dy = event.clientY - dragStartPos.current.y;

        const rawX = dragStartOffset.current.x + dx;
        const rawY = dragStartOffset.current.y + dy;

        const containerRect =
          dragContainerBounds.current ?? containerRef.current?.getBoundingClientRect();
        const maxX = containerRect ? Math.max(0, containerRect.width - slot.width) : rawX;
        const snappedX = snapToGrid(Math.max(0, Math.min(maxX, rawX)));
        const snappedY = snapToGrid(Math.max(0, rawY));

        setPreviewIfChanged({ x: snappedX, y: snappedY, width: slot.width, height: slot.height });
      }
    };

    const handleMouseMove = (event: globalThis.MouseEvent) => {
      pendingMouseEventRef.current = event;
      if (animationFrameRef.current === null) {
        animationFrameRef.current = window.requestAnimationFrame(() => {
          animationFrameRef.current = null;
          const nextEvent = pendingMouseEventRef.current;
          if (!nextEvent) return;
          pendingMouseEventRef.current = null;
          processMove(nextEvent);
        });
      }
    };

    const handleMouseUp = () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      pendingMouseEventRef.current = null;

      if (preview) {
        if (isResizing) {
          onUpdate({ width: preview.width, height: preview.height });
        } else if (isDragging) {
          const validPos = findValidPosition(preview.x, preview.y, slot.width, slot.height);
          onUpdate({ x: validPos.x, y: validPos.y });
        }
        setPreview(null);
      }

      setIsResizing(false);
      setIsDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      dragContainerBounds.current = null;
    };

    if (isResizing || isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        if (animationFrameRef.current) {
          window.cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        pendingMouseEventRef.current = null;
      };
    }
  }, [isResizing, isDragging, slot, preview, onUpdate, containerRef, allSlots]);

  const displayX = preview?.x ?? slot.x;
  const displayY = preview?.y ?? slot.y;
  const displayWidth = preview?.width ?? slot.width;
  const displayHeight = preview?.height ?? slot.height;

  return (
    <div
      style={{
        position: 'absolute',
        left: displayX,
        top: displayY,
        width: displayWidth,
        height: displayHeight,
        zIndex: isDragging || isResizing ? 50 : 10,
        willChange: isDragging || isResizing ? 'transform' : 'auto',
      }}
      className="group"
    >
      <div 
        className={`relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-white/[0.2] bg-[#0a0c10]/90 shadow-2xl backdrop-blur-xl transition-shadow ${
          isResizing || isDragging ? 'ring-2 ring-emerald-500/50 shadow-emerald-500/20' : 'hover:border-white/30'
        }`}
      >
        {/* Header / Drag Handle */}
        <div 
          className="relative z-10 flex items-center justify-between border-b border-white/5 p-3 cursor-grab active:cursor-grabbing select-none"
          onMouseDown={handleDragStart}
        >
          <div className="flex items-center gap-2">
            <GripVertical size={14} className="text-zinc-600" />
            <div className={`flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br ${typeGradient[slot.type]}`}>
              {slot.token?.imageUri ? (
                <img src={slot.token.imageUri} alt={headerLabel} className="h-full w-full object-cover" />
              ) : (
                <span className="text-white text-xs">{typeIcon[slot.type]}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{headerLabel}</p>
              <p className="text-[9px] font-medium uppercase tracking-wider text-zinc-500">
                {headerSubLabel} • {Math.round(displayWidth)}×{Math.round(displayHeight)}
              </p>
            </div>
          </div>
          
          {/* Remove Button */}
          <button
            onClick={onRemove}
            className="remove-btn flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-400 opacity-0 transition-all hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className={`relative z-10 min-h-0 flex-1 overflow-hidden ${isChart ? 'p-0' : 'p-3'}`}>
          {slot.type === "charts" && (
            <div className="h-full min-h-0">
              {slot.token && (
                <TradingChart
                  key={`chart-${slot.token.id}-${slot.id}`}
                  token={resolveChartTokenRef(slot.token)}
                  denom={slot.token.denom}
                  compact
                />
              )}
            </div>
          )}
          {slot.type === "recent-trades" && slot.token && (
            <MultiRecentTrades token={slot.token} />
          )}
          {slot.type === "token-stats" && slot.token && (
            <MultiTokenStats token={slot.token} />
          )}
          {slot.type === "find-gems" && slot.token && (
            <FindGemsHeatmapWidget token={slot.token} />
          )}
          {!isTokenWidgetType(slot.type) && (
            <AppToolWidget type={slot.type} />
          )}
        </div>

        {/* Resize Handle */}
        <div
          className="resize-handle absolute bottom-0 right-0 z-20 h-8 w-8 cursor-nwse-resize opacity-0 transition-opacity group-hover:opacity-100"
          onMouseDown={handleResizeStart}
        >
          <div className="absolute bottom-2 right-2 flex items-end justify-end">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-zinc-500">
              <path d="M9 9L13 13M5 13L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
        </div>
        
        {/* Dimension Indicator */}
        {(isResizing || isDragging) && (
          <div className="absolute bottom-2 right-10 z-20 rounded bg-black/80 px-2 py-1 text-[10px] font-mono text-emerald-400 border border-emerald-500/20">
            {Math.round(displayWidth)} × {Math.round(displayHeight)} @ {Math.round(displayX)}, {Math.round(displayY)}
          </div>
        )}
      </div>
    </div>
  );
};

// Animated Token Logo Loop Component
const TokenLogoLoop = ({ tokens, onTokenClick }: { tokens: TokenOption[]; onTokenClick: (token: TokenOption) => void }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const sequenceRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const lastTimestampRef = useRef<number | null>(null);
  const [sequenceWidth, setSequenceWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const measure = () => {
      setContainerWidth(containerRef.current?.clientWidth ?? 0);
      setSequenceWidth(sequenceRef.current?.scrollWidth ?? 0);
    };

    measure();
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => measure())
        : null;

    if (containerRef.current) resizeObserver?.observe(containerRef.current);
    if (sequenceRef.current) resizeObserver?.observe(sequenceRef.current);

    window.addEventListener("resize", measure);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [tokens]);

  const repeatCount = useMemo(() => {
    if (sequenceWidth <= 0) return 3;
    return Math.max(3, Math.ceil((containerWidth * 2) / sequenceWidth) + 1);
  }, [containerWidth, sequenceWidth]);

  useEffect(() => {
    offsetRef.current = 0;
    lastTimestampRef.current = null;
    if (trackRef.current) {
      trackRef.current.style.transform = "translate3d(0, 0, 0)";
    }
  }, [tokens, sequenceWidth, containerWidth]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || sequenceWidth <= 0) return;

    let frameId: number;
    const speed = isHovered ? 0 : 48;

    const animate = (timestamp: number) => {
      if (lastTimestampRef.current == null) {
        lastTimestampRef.current = timestamp;
      }

      const deltaSeconds = (timestamp - lastTimestampRef.current) / 1000;
      lastTimestampRef.current = timestamp;

      offsetRef.current = (offsetRef.current - speed * deltaSeconds + sequenceWidth) % sequenceWidth;
      track.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;

      frameId = window.requestAnimationFrame(animate);
    };

    frameId = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(frameId);
      lastTimestampRef.current = null;
      track.style.transform = "translate3d(0, 0, 0)";
    };
  }, [isHovered, sequenceWidth]);

  return (
    <div className="relative overflow-hidden border-b border-white/10 bg-black/30 backdrop-blur-sm">
      <div
        ref={containerRef}
        className="overflow-hidden"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div ref={trackRef} className="flex w-max will-change-transform">
          {Array.from({ length: repeatCount }, (_, copyIndex) => (
            <div
              key={copyIndex}
              ref={copyIndex === 0 ? sequenceRef : undefined}
              className="flex items-center gap-6 px-4 py-3"
            >
              {tokens.map((token) => (
                <motion.button
                  key={`${copyIndex}-${token.id}`}
                  onClick={() => onTokenClick(token)}
                  whileHover={{ scale: 1.1, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  className="group flex shrink-0 cursor-pointer flex-col items-center gap-1.5 rounded-xl p-2 transition-all hover:bg-white/5"
                  draggable
                  onDragStartCapture={(e: React.DragEvent<HTMLButtonElement>) => {
                    e.dataTransfer.setData("text/plain", JSON.stringify(token));
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                >
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-emerald-500/0 to-emerald-500/0 opacity-0 blur-xl transition-all duration-300 group-hover:opacity-100 group-hover:from-emerald-500/30 group-hover:to-emerald-500/10" />
                    <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5 p-0.5 shadow-lg transition-all group-hover:border-emerald-500/30 group-hover:shadow-emerald-500/20">
                      {token.imageUri ? (
                        <img
                          src={token.imageUri}
                          alt={token.symbol}
                          className="h-full w-full rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-zinc-800 to-zinc-900 text-xs font-bold text-white">
                          {token.symbol.slice(0, 2)}
                        </div>
                      )}
                    </div>
                    <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[8px] font-bold text-white opacity-0 transition-all group-hover:opacity-100">
                      +
                    </div>
                  </div>
                  <span className="max-w-[64px] truncate text-[10px] font-medium text-zinc-400 transition-all group-hover:text-white">
                    {token.symbol}
                  </span>
                </motion.button>
              ))}
            </div>
          ))}
        </div>
      </div>
      
      <div className="pointer-events-none absolute left-0 top-0 h-full w-12 bg-gradient-to-r from-black/80 to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 h-full w-12 bg-gradient-to-l from-black/80 to-transparent" />
    </div>
  );
};

// Animated Modal Component
const AnimatedModal = ({ isOpen, onClose, children }: { isOpen: boolean; onClose: () => void; children: ReactNode }) => {
  if (!isOpen) return null;
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 30 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-3xl border border-white/10 bg-[#0a0c10] shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
};

export default function Multicharts() {
  const TOKEN_BAR_LIMIT = 15;
  const TOKEN_MODAL_LIMIT = 50;

  const [slots, setSlots] = useState<SlotItem[]>([]);
  const [cacheReady, setCacheReady] = useState(false);
  const [tokens, setTokens] = useState<TokenOption[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<TokenWidgetType | null>(null);
  const [selectedTokenForModal, setSelectedTokenForModal] = useState<TokenOption | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasScrollRef = useRef<HTMLDivElement>(null);
  const cacheSaveTimer = useRef<number | null>(null);
  const [canvasHeight, setCanvasHeight] = useState(1800);
  const [canvasWidth, setCanvasWidth] = useState(1200);
  const [showTokenBar, setShowTokenBar] = useState(true);

  const leftCount = useMemo(() => MAX_SLOTS - slots.length, [slots.length]);
  const scrollCanvasToEdge = (edge: "start" | "end") => {
    const container = canvasScrollRef.current;
    if (!container) return;
    const left = edge === "start" ? 0 : container.scrollWidth;
    container.scrollTo({ left, behavior: "smooth" });
  };

  // Load from cache
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(MULTICHARTS_SLOTS_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const restored = parsed
            .filter((item: any) => {
              if (
                !item ||
                !isWidgetType(item.type) ||
                typeof item.id !== "string" ||
                typeof item.width !== "number" ||
                typeof item.height !== "number" ||
                typeof item.x !== "number" ||
                typeof item.y !== "number"
              ) {
                return false;
              }
              if (!isTokenWidgetType(item.type)) return true;
              return (
                item.token &&
                typeof item.token.id === "string" &&
                typeof item.token.tokenKey === "string" &&
                typeof item.token.symbol === "string" &&
                typeof item.token.name === "string"
              );
            })
            .slice(0, MAX_SLOTS) as SlotItem[];
          setSlots(restored);
        }
      }
    } catch {
      // ignore invalid cache
    } finally {
      setCacheReady(true);
    }
  }, []);

  // Save to cache with a debounce to keep storage calls lightweight
  useEffect(() => {
    if (typeof window === "undefined" || !cacheReady) return;
    if (cacheSaveTimer.current) {
      window.clearTimeout(cacheSaveTimer.current);
    }
    cacheSaveTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(MULTICHARTS_SLOTS_CACHE_KEY, JSON.stringify(slots));
      } catch {
        // ignore storage write issues
      } finally {
        cacheSaveTimer.current = null;
      }
    }, 700);

    return () => {
      if (cacheSaveTimer.current) {
        window.clearTimeout(cacheSaveTimer.current);
        cacheSaveTimer.current = null;
      }
    };
  }, [slots, cacheReady]);

  // Update canvas height based on content
  useEffect(() => {
    if (slots.length > 0) {
      const maxY = Math.max(...slots.map(s => s.y + s.height));
      setCanvasHeight(Math.max(800, maxY + 100));
    } else {
      setCanvasHeight(800);
    }
  }, [slots]);

  useEffect(() => {
    if (slots.length === 0) {
      setCanvasWidth(1200);
      return;
    }
    const maxX = Math.max(...slots.map((s) => s.x + s.width));
    setCanvasWidth(Math.max(1200, maxX + 40));
  }, [slots]);

  // Fetch tokens
  useEffect(() => {
    const fetchTokens = async () => {
      try {
        setLoadingTokens(true);
        const res = await fetch(`${API_BASE}/tokens?bucket=24h&priceSource=best&dir=desc&includeChange=1&limit=100&offset=0&sort=volume`, {
          headers: API_HEADERS,
          cache: "no-store",
        });
        const json = await res.json();
        const list = Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json)
          ? json
          : [];

        const mapped: TokenOption[] = list
          .map((item: any, idx: number) => ({
            id: String(
              item?.tokenId || item?.token?.tokenId || item?.id || item?.denom || `${idx}`
            ),
            tokenId: item?.tokenId
              ? String(item.tokenId)
              : item?.token?.tokenId
              ? String(item.token.tokenId)
              : undefined,
            denom: item?.denom || item?.token?.denom,
            symbol: item?.symbol || item?.token?.symbol || item?.name || "UNKNOWN",
            tokenKey:
              (() => {
                const denom = item?.denom || item?.token?.denom;
                const symbol = item?.symbol || item?.token?.symbol || item?.name || "UNKNOWN";
                return String(denom || symbol);
              })(),
            name: item?.name || item?.token?.name || item?.symbol || "Unknown",
            imageUri: item?.imageUri || item?.token?.imageUri || item?.icon || item?.token?.icon,
          }))
          .filter((item: TokenOption) => item.id && item.tokenKey);

        setTokens(mapped);
      } catch (error) {
        console.error("Failed to fetch tokens:", error);
      } finally {
        setLoadingTokens(false);
      }
    };

    fetchTokens();
  }, []);

  // Find next available position
  const findNextPosition = () => {
    if (slots.length === 0) return { x: 20, y: 20 };
    
    const maxX = Math.max(...slots.map(s => s.x + s.width));
    const maxY = Math.max(...slots.map(s => s.y + s.height));
    const containerWidth = canvasRef.current?.clientWidth || 1200;
    
    // Try to place next to existing widgets
    let bestX = 20;
    let bestY = 20;
    let found = false;
    
    // Simple grid search for empty space
    for (let y = 20; y < maxY + 400 && !found; y += GRID_SIZE * 2) {
      for (let x = 20; x < containerWidth - 400 && !found; x += GRID_SIZE * 2) {
        const testWidth = 400;
        const testHeight = 320;
        const hasCollision = slots.some((slot) => {
          return (
            x < slot.x + slot.width + WIDGET_GAP &&
            x + testWidth + WIDGET_GAP > slot.x &&
            y < slot.y + slot.height + WIDGET_GAP &&
            y + testHeight + WIDGET_GAP > slot.y
          );
        });
        if (!hasCollision) {
          bestX = x;
          bestY = y;
          found = true;
        }
      }
    }
    
    // Fallback: place below all widgets
    if (!found) {
      bestX = 20;
      bestY = maxY + 40;
    }
    
    return { x: bestX, y: bestY };
  };

  const createSlot = (
    token: TokenOption,
    type: TokenWidgetType,
    position?: { x: number; y: number }
  ) => {
    if (slots.length >= MAX_SLOTS) return;

    const nextPosition = position ?? findNextPosition();
    const newSlot: SlotItem = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      token,
      type,
      width: 400,
      height: 320,
      x: nextPosition.x,
      y: nextPosition.y,
    };

    setSlots((prev) => [...prev, newSlot]);
  };

  const createAppSlot = (type: AppWidgetType) => {
    if (slots.length >= MAX_SLOTS) return;

    const nextPosition = findNextPosition();
    const isWide =
      type === "wallet-details" ||
      type === "portfolio" ||
      type === "findgems" ||
      type === "create-token";
    const newSlot: SlotItem = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      width: isWide ? 760 : 520,
      height: isWide ? 560 : 420,
      x: nextPosition.x,
      y: nextPosition.y,
    };

    setSlots((prev) => [...prev, newSlot]);
    closeModal();
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedType(null);
    setSelectedTokenForModal(null);
    setSearchQuery("");
  };

  const openWidgetForToken = (token: TokenOption, type: TokenWidgetType) => {
    createSlot(token, type);
    closeModal();
  };

  const addToSlot = (token: TokenOption) => {
    if (!selectedType || slots.length >= MAX_SLOTS) return;

    openWidgetForToken(token, selectedType);
  };

  const updateSlot = (slotId: string, updates: Partial<SlotItem>) => {
    setSlots((prev) =>
      prev.map((slot) => (slot.id === slotId ? { ...slot, ...updates } : slot))
    );
  };

  const removeSlot = (slotId: string) => {
    setSlots((prev) => prev.filter((slot) => slot.id !== slotId));
  };

  const filteredTokens = useMemo(() => {
    const modalTokens = tokens.slice(0, TOKEN_MODAL_LIMIT);
    if (!searchQuery) return modalTokens;
    const query = searchQuery.toLowerCase();
    return modalTokens.filter(t => 
      t.symbol.toLowerCase().includes(query) || 
      t.name.toLowerCase().includes(query) ||
      (t.denom ?? "").toLowerCase().includes(query)
    );
  }, [tokens, searchQuery, TOKEN_MODAL_LIMIT]);

  const tokenBarTokens = useMemo(
    () => tokens.slice(0, TOKEN_BAR_LIMIT),
    [tokens, TOKEN_BAR_LIMIT]
  );

  const handleTokenClick = (token: TokenOption) => {
    setSelectedTokenForModal(token);
    setIsModalOpen(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const tokenData = JSON.parse(e.dataTransfer.getData("text/plain"));
      if (tokenData && tokenData.id) {
        const canvasRect = canvasRef.current?.getBoundingClientRect();
        const scrollLeft = canvasScrollRef.current?.scrollLeft ?? 0;
        const scrollTop = canvasScrollRef.current?.scrollTop ?? 0;
        const rawX = canvasRect ? e.clientX - canvasRect.left + scrollLeft - 200 : undefined;
        const rawY = canvasRect ? e.clientY - canvasRect.top + scrollTop - 40 : undefined;
        const dropPosition =
          rawX != null && rawY != null
            ? {
                x: Math.max(20, Math.round(rawX / GRID_SIZE) * GRID_SIZE),
                y: Math.max(20, Math.round(rawY / GRID_SIZE) * GRID_SIZE),
              }
            : undefined;

        createSlot(tokenData, "charts", dropPosition);
      }
    } catch (error) {
      console.error("Failed to parse drop data:", error);
    }
  };

  return (
    <section className="min-h-screen w-full pb-8 pt-4" onDragOver={handleDragOver} onDrop={handleDrop}>
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 h-full w-full rounded-full bg-blue-500/5 blur-3xl" />
        <div className="absolute -bottom-1/2 -right-1/2 h-full w-full rounded-full bg-purple-500/5 blur-3xl" />
      </div>

      {/* Animated Token Bar */}
      {tokenBarTokens.length > 0 && showTokenBar && (
        <div className="relative mb-4">
          <TokenLogoLoop tokens={tokenBarTokens} onTokenClick={handleTokenClick} />
          <button
            onClick={() => setShowTokenBar(false)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-zinc-400 hover:bg-white/10 hover:text-white transition-all z-10"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative mb-4 flex flex-col gap-4 px-8 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-green-400" />
            <h1 className="bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-2xl font-bold text-transparent md:text-3xl">
              Trading Canvas
            </h1>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Drag tokens from the bar, or click + to add widgets. Drag to move, drag corner to resize.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {!showTokenBar && tokenBarTokens.length > 0 && (
            <button
              onClick={() => setShowTokenBar(true)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-400 transition-all hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-400"
            >
              Show Token Bar
            </button>
          )}
          <button
            type="button"
            onClick={() => scrollCanvasToEdge("start")}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-400 transition-all hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-400"
            title="Jump to the first widgets"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={() => scrollCanvasToEdge("end")}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-400 transition-all hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-400"
            title="Jump to the latest widgets"
          >
            <ChevronRight size={20} />
          </button>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-sm">
            <div className="flex h-2 w-2 items-center justify-center">
              <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            </div>
            <span className="text-sm font-medium text-zinc-300">
              {leftCount} <span className="text-zinc-500">slots available</span>
            </span>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            disabled={slots.length >= MAX_SLOTS}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-400 transition-all hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={20} />
          </button>
        </div>
      </motion.div>

      {/* Canvas Area */}
      <div
        ref={canvasScrollRef}
        className="relative overflow-x-auto scroll-smooth px-8"
      >
        <div 
          ref={canvasRef}
          className="relative w-full rounded-2xl border border-white/10 bg-transparent backdrop-blur-sm"
          style={{ height: canvasHeight, minHeight: 600, minWidth: canvasWidth }}
        >
          {/* Grid Background */}
          <div 
            className="absolute inset-0 opacity-[0.05] pointer-events-none"
            style={{
              backgroundImage: `
                linear-gradient(to right, rgb(255,255,255) 1px, transparent 1px),
                linear-gradient(to bottom, rgb(255,255,255) 1px, transparent 1px)
              `,
              backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`
            }}
          />

          {/* Widgets */}
          {slots.map((slot) => (
            <ResizableWidget
              key={slot.id}
              slot={slot}
              onUpdate={(updates) => updateSlot(slot.id, updates)}
              onRemove={() => removeSlot(slot.id)}
              containerRef={canvasRef}
              allSlots={slots}
            />
          ))}

          {/* Empty State */}
          {slots.length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center"
            >
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-white/5">
                <BarChart3 size={40} className="text-zinc-600" />
              </div>
              <h3 className="text-xl font-bold text-white">Your canvas is empty</h3>
              <p className="mt-2 max-w-md text-center text-sm text-zinc-500">
                Drag any token from the bar above, or click the + button to add widgets.
              </p>
            </motion.div>
          )}
        </div>
      </div>

      {/* Animated Modal */}
      <AnimatedModal isOpen={isModalOpen} onClose={closeModal}>
        {/* Modal Header */}
        <div className="relative border-b border-white/5 p-6 flex-shrink-0">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 opacity-50" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5">
                <Plus className="h-5 w-5 text-zinc-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  {selectedTokenForModal ? `Open ${selectedTokenForModal.symbol}` : "Create Widget"}
                </h2>
                <p className="text-sm text-zinc-500">
                  {selectedTokenForModal ? "Choose what to open for this token" : "Configure your trading view"}
                </p>
              </div>
            </div>
            <button
              onClick={closeModal}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-400 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto">
          {selectedTokenForModal ? (
            <div className="space-y-6">
              <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/5">
                  {selectedTokenForModal.imageUri ? (
                    <img
                      src={selectedTokenForModal.imageUri}
                      alt={selectedTokenForModal.symbol}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-bold text-zinc-300">
                      {selectedTokenForModal.symbol.slice(0, 2)}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold text-white">{selectedTokenForModal.symbol}</p>
                  <p className="truncate text-sm text-zinc-500">{selectedTokenForModal.name}</p>
                </div>
              </div>

              <div>
                <label className="mb-4 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Select What To Open
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  {quickOpenOptions.map((option) => (
                    <button
                      key={option.type}
                      onClick={() => openWidgetForToken(selectedTokenForModal, option.type)}
                      className="group flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-center transition-all duration-300 hover:border-emerald-500/30 hover:bg-emerald-500/[0.05]"
                    >
                      <div className={`flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br ${typeGradient[option.type]} text-zinc-200 transition-all duration-300 group-hover:scale-105`}>
                        {typeIcon[option.type]}
                      </div>
                      <span className="text-sm font-semibold text-zinc-200">{option.label}</span>
                      <span className="text-xs text-zinc-500">{option.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
          {/* Type Selection */}
          <div className="mb-8">
            <label className="mb-4 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              1. Select Token Widget Type
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              {tokenWidgetTypes.map(
                (type) => (
                  <button
                    key={type}
                    onClick={() => setSelectedType(type)}
                    className={`group relative flex flex-col items-center gap-3 rounded-2xl border p-5 transition-all duration-300 ${
                      selectedType === type
                        ? "border-emerald-500/50 bg-emerald-500/10 shadow-lg shadow-emerald-500/10"
                        : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className={`flex h-14 w-14 items-center justify-center rounded-xl border transition-all duration-300 ${
                      selectedType === type 
                        ? "border-emerald-500/30 bg-emerald-500/20 text-emerald-400 scale-110" 
                        : "border-white/10 bg-white/5 text-zinc-500 group-hover:scale-105"
                    }`}>
                      {typeIcon[type]}
                    </div>
                    <span className={`text-sm font-semibold ${
                      selectedType === type ? "text-emerald-400" : "text-zinc-300"
                    }`}>
                      {typeLabel[type]}
                    </span>
                    {selectedType === type && (
                      <motion.div 
                        layoutId="selected-ring"
                        className="absolute inset-0 rounded-2xl ring-2 ring-emerald-500/50"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="mb-8">
            <label className="mb-4 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              Add App Tools To Canvas
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {appWidgetOptions.map((option) => (
                <button
                  key={option.type}
                  onClick={() => createAppSlot(option.type)}
                  disabled={slots.length >= MAX_SLOTS}
                  className="group flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-left transition-all duration-300 hover:border-emerald-500/30 hover:bg-emerald-500/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br ${typeGradient[option.type]} text-zinc-200 transition-all group-hover:scale-105`}>
                    {typeIcon[option.type]}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-100">{option.label}</p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-500">{option.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Token Selection */}
          <AnimatePresence>
            {selectedType && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4 overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500">
                    2. Select Token
                  </label>
                  <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-zinc-500">
                    {filteredTokens.length} available
                  </span>
                </div>
                
                {/* Search */}
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">
                    <Search size={18} />
                  </div>
                  <input
                    type="text"
                    placeholder="Search by name or symbol..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-3.5 pl-12 pr-4 text-sm text-white placeholder-zinc-600 outline-none transition-all focus:border-emerald-500/50 focus:bg-white/[0.05] focus:ring-1 focus:ring-emerald-500/20"
                    autoFocus
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-600 hover:bg-white/10 hover:text-zinc-400"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Token Grid */}
                <div className="grid max-h-[320px] grid-cols-2 gap-2 overflow-y-auto pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-800 sm:grid-cols-3 md:grid-cols-4">
                  {loadingTokens && (
                    <div className="col-span-full flex h-40 items-center justify-center">
                      <div className="flex flex-col items-center gap-3">
                        <RefreshCw size={24} className="animate-spin text-zinc-600" />
                        <span className="text-sm text-zinc-500">Loading tokens...</span>
                      </div>
                    </div>
                  )}
                  {!loadingTokens && filteredTokens.length === 0 && (
                    <div className="col-span-full py-12 text-center">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800/50">
                        <Search size={20} className="text-zinc-600" />
                      </div>
                      <p className="text-sm text-zinc-500">No tokens found</p>
                      <p className="mt-1 text-xs text-zinc-600">Try a different search term</p>
                    </div>
                  )}
                  {!loadingTokens &&
                    filteredTokens.map((token, idx) => (
                      <motion.button
                        key={token.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.01 }}
                        onClick={() => addToSlot(token)}
                        className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition-all hover:border-emerald-500/30 hover:bg-emerald-500/[0.05]"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5">
                          {token.imageUri ? (
                            <img src={token.imageUri} alt={token.symbol} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-xs font-bold text-zinc-600">{token.symbol.slice(0, 2)}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="truncate font-bold text-white">
                              {token.symbol}
                            </span>
                            <ArrowUpRight size={14} className="text-zinc-600 opacity-0 transition-all group-hover:text-emerald-400 group-hover:opacity-100" />
                          </div>
                          <span className="line-clamp-1 text-xs text-zinc-500">
                            {token.name}
                          </span>
                        </div>
                      </motion.button>
                    ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
            </>
          )}
        </div>
      </AnimatedModal>
    </section>
  );
}
