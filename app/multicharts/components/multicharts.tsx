"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type MouseEvent as ReactMouseEvent } from "react";
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
} from "lucide-react";
import TradingChart from "@/app/components/tradingchart";
import { API_BASE_URL } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";

type WidgetType = "charts" | "recent-trades" | "token-stats";

type TokenOption = {
  id: string;
  tokenId?: string;
  tokenKey: string;
  denom?: string;
  symbol: string;
  name: string;
  imageUri?: string;
};

type SlotItem = {
  id: string;
  token: TokenOption;
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
const MAX_RECENT_TRADES = 50;
const HIGHLIGHT_DURATION_MS = 4000;
const API_BASE = API_BASE_URL;
const API_KEY =
  process.env.NEXT_PUBLIC_X_API_KEY || process.env.NEXT_PUBLIC_API_KEY;
const API_HEADERS: HeadersInit = API_KEY ? { "x-api-key": API_KEY } : {};
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
};

const typeIcon: Record<WidgetType, ReactNode> = {
  charts: <BarChart3 size={14} />,
  "recent-trades": <Waves size={14} />,
  "token-stats": <Activity size={14} />,
};

const typeGradient: Record<WidgetType, string> = {
  charts: "from-blue-500/20 via-purple-500/20 to-pink-500/20",
  "recent-trades": "from-emerald-500/20 via-teal-500/20 to-cyan-500/20",
  "token-stats": "from-amber-500/20 via-orange-500/20 to-red-500/20",
};

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
  const subscriptionId = token.tokenId || token.id;

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
              {slot.token.imageUri ? (
                <img src={slot.token.imageUri} alt={slot.token.symbol} className="h-full w-full object-cover" />
              ) : (
                <span className="text-white text-xs">{typeIcon[slot.type]}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{slot.token.symbol}</p>
              <p className="text-[9px] font-medium uppercase tracking-wider text-zinc-500">
                {typeLabel[slot.type]} • {Math.round(displayWidth)}×{Math.round(displayHeight)}
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
              <TradingChart
                key={`chart-${slot.token.id}-${slot.id}`}
                token={slot.token.tokenKey}
                denom={slot.token.denom}
                compact
              />
            </div>
          )}
          {slot.type === "recent-trades" && (
            <MultiRecentTrades token={slot.token} />
          )}
          {slot.type === "token-stats" && (
            <MultiTokenStats token={slot.token} />
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

export default function Multicharts() {
  const [slots, setSlots] = useState<SlotItem[]>([]);
  const [cacheReady, setCacheReady] = useState(false);
  const [tokens, setTokens] = useState<TokenOption[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<WidgetType | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasScrollRef = useRef<HTMLDivElement>(null);
  const cacheSaveTimer = useRef<number | null>(null);
  const prevSlotCountRef = useRef(0);
  const [canvasHeight, setCanvasHeight] = useState(800);
  const [canvasWidth, setCanvasWidth] = useState(1200);

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
            .filter(
              (item: any) =>
                item &&
                item.token &&
                typeof item.token.id === "string" &&
                typeof item.token.tokenKey === "string" &&
                typeof item.token.symbol === "string" &&
                typeof item.token.name === "string" &&
                (item.type === "charts" ||
                  item.type === "recent-trades" ||
                  item.type === "token-stats") &&
                typeof item.id === "string" &&
                typeof item.width === "number" &&
                typeof item.height === "number" &&
                typeof item.x === "number" &&
                typeof item.y === "number"
            )
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

  useEffect(() => {
    if (!canvasScrollRef.current) return;
    const container = canvasScrollRef.current;
    if (slots.length > prevSlotCountRef.current) {
      container.scrollTo({ left: container.scrollWidth, behavior: "smooth" });
    }
    prevSlotCountRef.current = slots.length;
  }, [slots.length]);

  // Fetch tokens
  useEffect(() => {
    const fetchTokens = async () => {
      try {
        setLoadingTokens(true);
        const res = await fetch(`${API_BASE}/tokens?bucket=24h&priceSource=best&sort=volume&dir=desc&includeChange=1`, {
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
            tokenKey:
              item?.symbol ||
              item?.token?.symbol ||
              item?.denom ||
              item?.token?.denom ||
              item?.name ||
              "UNKNOWN",
            denom: item?.denom || item?.token?.denom,
            symbol: item?.symbol || item?.token?.symbol || item?.name || "UNKNOWN",
            name: item?.name || item?.token?.name || item?.symbol || "Unknown",
            imageUri: item?.imageUri || item?.token?.imageUri || item?.icon || item?.token?.icon,
          }))
          .filter((item: TokenOption) => item.id && item.tokenKey);

        setTokens(mapped);
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

  const addToSlot = (token: TokenOption) => {
    if (!selectedType || slots.length >= MAX_SLOTS) return;
    
    const position = findNextPosition();
    const newSlot: SlotItem = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      token,
      type: selectedType,
      width: 400,
      height: 320,
      x: position.x,
      y: position.y,
    };
    
    setSlots((prev) => [...prev, newSlot]);
    setIsModalOpen(false);
    setSelectedType(null);
    setSearchQuery("");
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
    if (!searchQuery) return tokens;
    const query = searchQuery.toLowerCase();
    return tokens.filter(t => 
      t.symbol.toLowerCase().includes(query) || 
      t.name.toLowerCase().includes(query)
    );
  }, [tokens, searchQuery]);

  return (
    <section className="min-h-screen w-full px-8 pb-8 pt-4 ">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 h-full w-full rounded-full bg-blue-500/5 blur-3xl" />
        <div className="absolute -bottom-1/2 -right-1/2 h-full w-full rounded-full bg-purple-500/5 blur-3xl" />
      </div>

      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-green-400" />
            <h1 className="bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-2xl font-bold text-transparent md:text-3xl">
              Trading Canvas
            </h1>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Drag to move, drag corner to resize. Auto-snaps to grid.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => scrollCanvasToEdge("start")}
            className=" rounded-xl border border-white/10 bg-white/5 text-zinc-400 transition-all hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-400"
            title="Jump to the first widgets"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={() => scrollCanvasToEdge("end")}
            className=" rounded-xl border border-white/10 bg-white/5 text-zinc-400 transition-all hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-400"
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
        className="relative overflow-x-auto scroll-smooth"
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
                Click the + button to add widgets. Drag to move them around, drag the bottom-right corner to resize.
              </p>
            </motion.div>
          )}
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-3xl border border-white/10 bg-[#0a0c10] shadow-2xl flex flex-col"
            >
              {/* Modal Header */}
              <div className="relative border-b border-white/5 p-6 flex-shrink-0">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 opacity-50" />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5">
                      <Plus className="h-5 w-5 text-zinc-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">Create Widget</h2>
                      <p className="text-sm text-zinc-500">Configure your trading view</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setIsModalOpen(false);
                      setSelectedType(null);
                      setSearchQuery("");
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-400 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto">
                {/* Type Selection */}
                <div className="mb-8">
                  <label className="mb-4 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                    1. Select Widget Type
                  </label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {(["charts", "recent-trades", "token-stats"] as WidgetType[]).map(
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
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
