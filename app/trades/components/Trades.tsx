/* eslint-disable @next/next/no-img-element */
"use client";

import {
  startTransition,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import Image from "next/image";
import { Copy, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { API_BASE_URL, API_HEADERS } from "@/lib/api";
import ZIG_ICON from "@/public/oroswap.png";
const Degenter_ICON = "/degen.png";
const Degenter_Label = "Degenter";
const API_BASE = API_BASE_URL;
const TRADES_WS_URL = process.env.NEXT_PUBLIC_TRADES_WS_URL || "";
const MAX_TRADES = 500;
const HIGHLIGHT_DURATION_MS = 800;
const FALLBACK_POLL_INTERVAL_MS = 8000;
const WS_BATCH_WINDOW_MS = 64;
const JUST_NOW_THRESHOLD_MS = 5_000;
const TOKEN_OPTIONS_CACHE: { loaded: boolean; options: TokenOption[] } = {
  loaded: false,
  options: [],
};
type TradesWsListener = (event: MessageEvent) => void;
const tradesWsHub = {
  ws: null as WebSocket | null,
  reconnectTimeout: null as NodeJS.Timeout | null,
  reconnectAttempts: 0,
  connecting: false,
  allowReconnect: true,
  listeners: new Set<TradesWsListener>(),
};

const notifyTradesWsListeners = (event: MessageEvent) => {
  tradesWsHub.listeners.forEach((listener) => listener(event));
};

const ensureTradesWs = () => {
  if (!TRADES_WS_URL) return;
  if (
    tradesWsHub.ws &&
    (tradesWsHub.ws.readyState === WebSocket.OPEN ||
      tradesWsHub.ws.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  if (tradesWsHub.connecting) return;

  tradesWsHub.connecting = true;

  try {
    const ws = new WebSocket(TRADES_WS_URL);
    tradesWsHub.ws = ws;

    ws.onopen = () => {
      tradesWsHub.connecting = false;
      tradesWsHub.reconnectAttempts = 0;
      ws.send(JSON.stringify({ type: "sub", stream: "trades" }));
    };

    ws.onmessage = notifyTradesWsListeners;

    ws.onerror = () => {
      tradesWsHub.connecting = false;
    };

    ws.onclose = () => {
      tradesWsHub.ws = null;
      tradesWsHub.connecting = false;
      if (!tradesWsHub.allowReconnect || tradesWsHub.listeners.size === 0)
        return;
      if (tradesWsHub.reconnectAttempts < 5) {
        const delay = Math.min(
          1000 * Math.pow(2, tradesWsHub.reconnectAttempts),
          30000
        );
        tradesWsHub.reconnectAttempts += 1;
        tradesWsHub.reconnectTimeout = setTimeout(() => {
          ensureTradesWs();
        }, delay);
      }
    };
  } catch {
    tradesWsHub.connecting = false;
  }
};

const addTradesWsListener = (listener: TradesWsListener) => {
  tradesWsHub.listeners.add(listener);
  tradesWsHub.allowReconnect = true;
  ensureTradesWs();

  return () => {
    tradesWsHub.listeners.delete(listener);
    if (tradesWsHub.listeners.size > 0) return;
    tradesWsHub.allowReconnect = false;
    if (tradesWsHub.reconnectTimeout) {
      clearTimeout(tradesWsHub.reconnectTimeout);
      tradesWsHub.reconnectTimeout = null;
    }
    if (tradesWsHub.ws) {
      try {
        tradesWsHub.ws.close();
      } catch {}
      tradesWsHub.ws = null;
    }
  };
};

export interface Trade {
  time: string;
  txHash: string;
  direction: "buy" | "sell" | "provide" | "withdraw";
  offerDenom: string;
  offerSymbol?: string;
  offerImage?: string;
  offerAmount: number;
  askDenom: string;
  askSymbol?: string;
  askImage?: string;
  returnAmount: number;
  valueNative?: number;
  valueUsd: number;
  priceUsd: number;
  signer: string;
  class: "whale" | "shark" | "shrimp";
}

export type ValueRangeLabel = "< 1K ZIG" | "1K - 10K ZIG" | "> 10K ZIG";

export interface TradesFilter {
  assetMode: "all" | "token";
  timeRange: "24H" | "7D" | "30D" | "60D";
  valueRange: ValueRangeLabel | "";
  tokenDenom: string;
  wallet: string;
}

export interface TokenOption {
  denom: string;
  label: string;
  tokenId?: string;
}

const TIME_RANGE_MS: Record<TradesFilter["timeRange"], number> = {
  "24H": 24 * 60 * 60 * 1000,
  "7D": 7 * 24 * 60 * 60 * 1000,
  "30D": 30 * 24 * 60 * 60 * 1000,
  "60D": 60 * 24 * 60 * 60 * 1000,
};
const TIME_RANGE_API: Record<TradesFilter["timeRange"], string> = {
  "24H": "24h",
  "7D": "7d",
  "30D": "30d",
  "60D": "60d",
};

const WALLET_ADDRESS_PATTERN = /^zig1[0-9a-z]{20,}$/i;

const parseTradeTimestamp = (time?: string) => {
  if (!time) return NaN;
  const normalized = String(time).trim();
  if (!normalized) return NaN;

  const numeric = Number(normalized);
  if (!Number.isNaN(numeric)) {
    return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  }

  const parsed = Date.parse(normalized);
  if (!Number.isNaN(parsed)) return parsed;

  const normalizedUtc = normalized.includes("T")
    ? `${normalized.replace(" ", "T").replace(/Z?$/, "Z")}`
    : normalized;
  const parsedUtc = Date.parse(normalizedUtc);
  return Number.isNaN(parsedUtc) ? NaN : parsedUtc;
};

const compareTradesByNewest = (a: Trade, b: Trade) => {
  const aTime = parseTradeTimestamp(a.time);
  const bTime = parseTradeTimestamp(b.time);

  if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && aTime !== bTime) {
    return bTime - aTime;
  }
  if (!Number.isNaN(bTime) && Number.isNaN(aTime)) return 1;
  if (!Number.isNaN(aTime) && Number.isNaN(bTime)) return -1;

  if (a.txHash && b.txHash && a.txHash !== b.txHash) {
    return b.txHash.localeCompare(a.txHash);
  }

  return 0;
};

interface TradesProps {
  filters: TradesFilter;
  onAvailableTokens?: (options: TokenOption[]) => void;
  onFilteredTradesChange?: (trades: Trade[]) => void;
}

const Trades = ({
  filters,
  onAvailableTokens,
  onFilteredTradesChange,
}: TradesProps) => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [currentPage, setCurrentPage] = useState(1);
  const tradesPerPage = 10;
  const [symbolMap, setSymbolMap] = useState<Record<string, string>>({});
  const [tokenImageMap, setTokenImageMap] = useState<Record<string, string>>(
    {}
  );
  const [allTokenOptions, setAllTokenOptions] = useState<TokenOption[]>([]);
  const hasWsTradesRef = useRef(false);
  const tradesRef = useRef<Trade[]>([]);
  const wsMessageHandlerRef = useRef<(event: MessageEvent) => void>(() => {});
  const [newTradeKeys, setNewTradeKeys] = useState<Record<string, number>>({});
  const newTradeTimeoutsRef = useRef<Map<string, number>>(new Map());
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrolledRef = useRef(false);
  const pendingWsTradesRef = useRef<Trade[]>([]);
  const pendingWsSnapshotRef = useRef(false);
  const wsFlushTimeoutRef = useRef<number | null>(null);

  // Colors from image_cc0611.png (Figma)
  const COLORS = {
    green: "#4ADE80",
    purple: "#662D91",
    darkBg: "#050505",
    rowHover: "rgba(255, 255, 255, 0.03)",
  };

  const fetchApi = useCallback(
    (url: string, init: RequestInit = {}) =>
      fetch(url, {
        ...init,
        headers: { ...API_HEADERS, ...(init.headers || {}) },
      }),
    []
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/tokens/swap-list?q=zig&unit=usd`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const items: Array<{
          denom: string;
          symbol: string;
          imageUri?: string;
        }> = json?.data ?? [];
        const map: Record<string, string> = {};
        const imageMap: Record<string, string> = {};

        map["uzig"] = "ZIG";
        imageMap["uzig"] = "/zigicon.png";

        for (const it of items) {
          if (it?.denom && it?.symbol) {
            map[it.denom] = it.symbol;
            map[it.denom.toLowerCase()] = it.symbol;
            if (it.imageUri) {
              imageMap[it.denom] = it.imageUri;
              imageMap[it.denom.toLowerCase()] = it.imageUri;
            }
          }
        }

        if (!cancelled) {
          setSymbolMap(map);
          setTokenImageMap(imageMap);
        }
      } catch {
        if (!cancelled) {
          setSymbolMap({ uzig: "ZIG" });
          setTokenImageMap({ uzig: "/zigicon.png" });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (TOKEN_OPTIONS_CACHE.loaded) {
      setAllTokenOptions(TOKEN_OPTIONS_CACHE.options);
      return;
    }

    (async () => {
      try {
        const res = await fetchApi(
          `${API_BASE}/tokens?bucket=24h&priceSource=best&sort=volume&dir=desc&includeChange=1&limit=200&offset=0`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const items: Array<{
          denom?: string;
          tokenId?: string;
          symbol?: string;
        }> = json?.data ?? [];
        const options = items
          .map((token) => {
            const denom = token.denom || token.tokenId || "";
            return {
              denom,
              label: token.symbol || denom,
              tokenId: denom,
            };
          })
          .filter((option) => option.denom);

        if (!cancelled) {
          TOKEN_OPTIONS_CACHE.options = options;
          TOKEN_OPTIONS_CACHE.loaded = true;
          setAllTokenOptions(options);
        }
      } catch (error) {
        console.error("Failed to load token options", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchApi]);

  const formatTime = (timeStr: string) => {
    const diffMs = nowMs - new Date(timeStr).getTime();
    if (diffMs < JUST_NOW_THRESHOLD_MS) return "Just now";
    const diff = Math.floor(diffMs / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}hr ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const getEntityIcon = (tradeClass: Trade["class"]) => {
    switch (tradeClass) {
      case "whale":
        return <span className="text-blue-400">🐋</span>;
      case "shark":
        return <span className="text-cyan-300">🦈</span>;
      default:
        return <span className="text-orange-400">🦐</span>;
    }
  };

  const getEntityLabel = (tradeClass: Trade["class"]) => {
    switch (tradeClass) {
      case "shark":
        return "Shark";
      case "shrimp":
        return "Shrimp";
      default:
        return "Whale";
    }
  };

  const determineEntityClass = (trade: Trade): Trade["class"] => {
    return getTradeClass(trade.valueNative ?? 0);
  };

  const truncateAddress = (addr: string) =>
    `${addr.slice(0, 4)}...${addr.slice(-4)}`;

  const formatAmount = (value?: number) => {
    if (value == null || !Number.isFinite(value)) return "0.00";
    const absValue = Math.abs(value);
    if (absValue > 0 && absValue < 0.01) {
      return value.toFixed(6);
    }
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const tokenOptionSymbolMap = useMemo(() => {
    const map: Record<string, string> = {};
    allTokenOptions.forEach((option) => {
      const denom = String(option.denom ?? "").trim();
      const label = String(option.label ?? "").trim();
      if (!denom || !label) return;
      map[denom] = label;
      map[denom.toLowerCase()] = label;
    });
    return map;
  }, [allTokenOptions]);

  const symbolFor = (denom?: string, explicitSymbol?: string) => {
    if (!denom) return "";
    if (explicitSymbol?.trim()) return explicitSymbol.trim().toUpperCase();
    const lower = denom.toLowerCase();
    if (lower.includes("uzig")) return "ZIG";
    const found =
      symbolMap[denom] ??
      symbolMap[lower] ??
      tokenOptionSymbolMap[denom] ??
      tokenOptionSymbolMap[lower];
    if (found) return found;
    if (lower.startsWith("ibc/")) return "IBC";
    const cleaned = denom.replace(/ibc\/\w+\//i, "");
    const parts = cleaned.split(/[./]/);
    const last = parts[parts.length - 1] || denom;
    return last.toUpperCase();
  };

  const getTokenIcon = (denom?: string): string => {
    if (!denom) return "/zigicon.png";
    return tokenImageMap[denom] ?? tokenImageMap[denom.toLowerCase()] ?? "/zigicon.png";
  };

  const isZigDenom = (denom?: string) => denom?.toLowerCase().includes("uzig");

  const getTradeTokenSymbol = (trade: Trade, side: "ask" | "offer") => {
    if (side === "ask") return symbolFor(trade.askDenom, trade.askSymbol);
    return symbolFor(trade.offerDenom, trade.offerSymbol);
  };

  const getTradeTokenIcon = (trade: Trade, side: "ask" | "offer") => {
    if (side === "ask") return trade.askImage || getTokenIcon(trade.askDenom);
    return trade.offerImage || getTokenIcon(trade.offerDenom);
  };

  const tradeKey = (trade: Trade) =>
    trade.txHash ||
    `${trade.signer}:${trade.time}:${trade.offerDenom}:${trade.askDenom}`;

  const markTradesAsNew = useCallback(
    (incoming: Trade[]) => {
      if (!incoming.length) return;
      const now = Date.now();
      startTransition(() => {
        setNewTradeKeys((prev) => {
          const next = { ...prev };
          incoming.forEach((trade) => {
            next[tradeKey(trade)] = now;
          });
          return next;
        });
        setNowMs(now);
      });

      if (typeof window === "undefined") return;
      incoming.forEach((trade) => {
        const key = tradeKey(trade);
        const existingTimeout = newTradeTimeoutsRef.current.get(key);
        if (existingTimeout) {
          window.clearTimeout(existingTimeout);
        }
        const timeoutId = window.setTimeout(() => {
          setNewTradeKeys((prev) => {
            if (!(key in prev)) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
          });
          newTradeTimeoutsRef.current.delete(key);
        }, HIGHLIGHT_DURATION_MS);
        newTradeTimeoutsRef.current.set(key, timeoutId);
      });
    },
    []
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const mergeIncomingTrades = useCallback(
    (
      prevTrades: Trade[],
      incoming: Trade[],
      isSnapshot: boolean
    ): { trades: Trade[]; incoming: Trade[] } => {
      if (!incoming.length) return { trades: prevTrades, incoming: [] };
      if (isSnapshot && !prevTrades.length) {
        const sliced = incoming
          .slice()
          .sort(compareTradesByNewest)
          .slice(0, MAX_TRADES);
        return { trades: sliced, incoming: sliced };
      }
      const seen = new Set(prevTrades.map(tradeKey));
      const unique = incoming.filter((trade) => !seen.has(tradeKey(trade)));
      if (!unique.length) return { trades: prevTrades, incoming: [] };
      const merged = [...unique, ...prevTrades]
        .sort(compareTradesByNewest)
        .slice(0, MAX_TRADES);
      return { trades: merged, incoming: unique };
    },
    []
  );

  const flushPendingWsTrades = useCallback(() => {
    const pendingTrades = pendingWsTradesRef.current;
    const isSnapshot = pendingWsSnapshotRef.current;

    pendingWsTradesRef.current = [];
    pendingWsSnapshotRef.current = false;
    wsFlushTimeoutRef.current = null;

    if (!pendingTrades.length) return;

    hasWsTradesRef.current = true;
    startTransition(() => {
      setTrades((prev) => {
        const { trades: nextTrades, incoming } = mergeIncomingTrades(
          prev,
          pendingTrades,
          isSnapshot
        );
        if (incoming.length) {
          markTradesAsNew(incoming);
        }
        return nextTrades;
      });
      setLoading(false);
    });
  }, [markTradesAsNew, mergeIncomingTrades]);

  const getZigSideAmount = (
    offerDenom: string,
    askDenom: string,
    direction: Trade["direction"],
    offerAmount: number,
    returnAmount: number
  ) => {
    const offeringZig = isZigDenom(offerDenom);
    const askingZig = isZigDenom(askDenom);

    if (direction === "buy" && offeringZig) return offerAmount;
    if (direction === "sell" && askingZig) return returnAmount;
    if (offeringZig) return offerAmount;
    if (askingZig) return returnAmount;
    return 0;
  };

  const getTradeClass = (zigAmount: number = 0): Trade["class"] => {
    const size = Math.abs(zigAmount);
    if (size >= 10000) return "whale";
    if (size >= 1000) return "shark";
    return "shrimp";
  };

  const normalizeWsAmount = (raw: number, denom: string) => {
    if (!Number.isFinite(raw)) return 0;
    if (isZigDenom(denom)) return raw / 1_000_000;
    return raw / 1_000_000;
  };

  const unwrapTradePayload = (payload: any): any => {
    if (!payload || typeof payload !== "object") return payload;
    if (
      payload.direction ||
      payload.offer_amount_base ||
      payload.offerAmount ||
      payload.offer_amount ||
      payload.return_amount_base ||
      payload.returnAmount ||
      payload.return_amount ||
      payload.action ||
      payload.trade_id ||
      payload.tradeId
    ) {
      return payload;
    }
    if (payload.data) return unwrapTradePayload(payload.data);
    return payload;
  };

  const mapStreamTradeToLocal = (item: any): Trade | null => {
    try {
      const tradeData = unwrapTradePayload(item);
      if (!tradeData) return null;

      const direction = (tradeData.direction as Trade["direction"]) || "buy";
      const offerDenom =
        tradeData.offer_asset_denom ?? tradeData.offerDenom ?? "";
      const askDenom = tradeData.ask_asset_denom ?? tradeData.askDenom ?? "";
      const offerAmountRaw = Number(
        tradeData.offer_amount_base ??
          tradeData.offerAmountBase ??
          tradeData.offer_amount ??
          tradeData.offerAmount ??
          0
      );
      const returnAmountRaw = Number(
        tradeData.return_amount_base ??
          tradeData.returnAmountBase ??
          tradeData.return_amount ??
          tradeData.returnAmount ??
          0
      );

      const offerAmount = tradeData.offerAmount
        ? Number(tradeData.offerAmount)
        : normalizeWsAmount(offerAmountRaw, offerDenom);
      const returnAmount = tradeData.returnAmount
        ? Number(tradeData.returnAmount)
        : normalizeWsAmount(returnAmountRaw, askDenom);

      const zigAmount = getZigSideAmount(
        offerDenom,
        askDenom,
        direction,
        offerAmount,
        returnAmount
      );
      const valueNative = Number(
        tradeData.valueNative ??
          tradeData.value_native ??
          tradeData.valueNativeAmount ??
          tradeData.value_native_amount ??
          0
      );
      const classAmount = zigAmount || valueNative;

      const priceUsd = Number(
        tradeData.price_in_usd ??
          tradeData.priceInUsd ??
          tradeData.price_usd ??
          0
      );
      const valueUsd = Number(
        tradeData.value_in_usd ??
          tradeData.valueUsd ??
          tradeData.value_usd ??
          (priceUsd
            ? priceUsd * (direction === "sell" ? offerAmount : returnAmount)
            : 0)
      );

      return {
        time: tradeData.created_at ?? item?.ts ?? new Date().toISOString(),
        txHash: tradeData.tx_hash ?? tradeData.txHash ?? item?.tx_hash ?? "",
        direction,
        offerDenom,
        offerSymbol: tradeData.offer_symbol ?? tradeData.offerSymbol ?? undefined,
        offerImage: tradeData.offer_image ?? tradeData.offerImage ?? undefined,
        offerAmount,
        askDenom,
        askSymbol: tradeData.ask_symbol ?? tradeData.askSymbol ?? undefined,
        askImage: tradeData.ask_image ?? tradeData.askImage ?? undefined,
        returnAmount,
        valueNative: classAmount || undefined,
        valueUsd,
        priceUsd,
        signer: tradeData.signer ?? "",
        class: getTradeClass(classAmount),
      };
    } catch (error) {
      console.error("Error parsing trade from stream:", error);
      return null;
    }
  };

  const parseTradesFromStreamMessage = (
    msg: any
  ): { trades: Trade[]; isSnapshot: boolean } => {
    if (!msg) return { trades: [], isSnapshot: false };
    const isSnapshot = msg.type === "snapshot";
    let items: any[] = [];

    if (msg.type === "trade") {
      items = [msg.data ?? msg];
    } else if (isSnapshot && Array.isArray(msg.data)) {
      items = msg.data;
    } else if (Array.isArray(msg.data)) {
      items = msg.data;
    }

    if (!items.length) return { trades: [], isSnapshot };

    const mapped = items.map(mapStreamTradeToLocal).filter(Boolean) as Trade[];

    return { trades: mapped, isSnapshot };
  };

  const mapApiTradeToLocal = (trade: any): Trade => {
    const direction = (trade.direction as Trade["direction"]) || "buy";
    const offerDenom = trade.offerDenom ?? trade.offer_denom ?? "";
    const askDenom = trade.askDenom ?? trade.ask_denom ?? "";
    const offerAmount = Number(trade.offerAmount ?? trade.offer_amount ?? 0);
    const returnAmount = Number(trade.returnAmount ?? trade.return_amount ?? 0);
    const zigAmount = getZigSideAmount(
      offerDenom,
      askDenom,
      direction,
      offerAmount,
      returnAmount
    );
    const valueNative = Number(
      trade.valueNative ??
        trade.value_native ??
        trade.valueNativeAmount ??
        trade.value_native_amount ??
        0
    );
    const classAmount = zigAmount || valueNative;

    return {
      time: trade.time ?? trade.created_at ?? "",
      txHash: trade.txHash ?? trade.tx_hash ?? "",
      direction,
      offerDenom,
      offerSymbol: trade.offerSymbol ?? trade.offer_symbol ?? undefined,
      offerImage: trade.offerImage ?? trade.offer_image ?? undefined,
      offerAmount,
      askDenom,
      askSymbol: trade.askSymbol ?? trade.ask_symbol ?? undefined,
      askImage: trade.askImage ?? trade.ask_image ?? undefined,
      returnAmount,
      valueNative: classAmount || undefined,
      valueUsd: Number(trade.valueUsd ?? trade.value_usd ?? 0),
      priceUsd: Number(trade.priceUsd ?? trade.price_usd ?? 0),
      signer: trade.signer ?? "",
      class: getTradeClass(classAmount),
    };
  };

  const tokenOptionsFromTrades = useMemo<TokenOption[]>(() => {
    const uniqueTokens = new Map<string, string>();
    trades.forEach((trade) => {
      [trade.askDenom, trade.offerDenom].forEach((denom) => {
        if (!denom) return;
        if (!uniqueTokens.has(denom)) {
          const explicitSymbol =
            trade.askDenom === denom ? trade.askSymbol : trade.offerSymbol;
          uniqueTokens.set(denom, symbolFor(denom, explicitSymbol));
        }
      });
    });
    return Array.from(uniqueTokens.entries())
      .map(([denom, label]) => ({
        denom,
        label,
        tokenId: undefined,
      }))
      .filter(({ denom }) => denom);
  }, [trades, symbolMap, tokenOptionSymbolMap]);

  const resolvedTokenOption = useMemo(() => {
    const tokenQuery = filters.tokenDenom.trim().toLowerCase();
    if (!tokenQuery) return null;
    const options = allTokenOptions.length ? allTokenOptions : tokenOptionsFromTrades;
    return (
      options.find((option) => {
        const denom = option.denom.toLowerCase();
        const label = option.label.toLowerCase();
        const tokenId = String(option.tokenId ?? "").toLowerCase();
        return denom === tokenQuery || label === tokenQuery || tokenId === tokenQuery;
      }) ?? null
    );
  }, [allTokenOptions, filters.tokenDenom, tokenOptionsFromTrades]);

  const walletApiAddress = useMemo(() => {
    const walletQuery = filters.wallet.trim();
    return WALLET_ADDRESS_PATTERN.test(walletQuery) ? walletQuery : "";
  }, [filters.wallet]);

  const fetchTradesFromApi = useCallback(async () => {
    const timeframe = TIME_RANGE_API[filters.timeRange] ?? "60d";
    const tokenQuery = filters.tokenDenom.trim();
    const tokenRef = resolvedTokenOption?.tokenId || tokenQuery;
    const params = new URLSearchParams({
      tf: timeframe,
      unit: "usd",
      limit: "5000",
      source: "chain",
    });
    let baseEndpoint = `${API_BASE}/trades`;

    if (walletApiAddress) {
      baseEndpoint = `${API_BASE}/trades/wallet/${encodeURIComponent(
        walletApiAddress
      )}`;
      if (tokenRef) {
        params.set("token", tokenRef);
        params.set("search", tokenQuery);
      }
    } else if (tokenRef) {
      baseEndpoint = `${API_BASE}/trades/token/${encodeURIComponent(tokenRef)}`;
    }

    const endpoint = `${baseEndpoint}?${params.toString()}`;
    try {
      if (!tradesRef.current.length) {
        setLoading(true);
      }
      const res = await fetchApi(endpoint);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const apiTrades = Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json?.items)
        ? json.items
        : Array.isArray(json)
        ? json
        : [];
      if (json?.token?.denom && json?.token?.symbol) {
        setSymbolMap((prev) => ({
          ...prev,
          [json.token.denom]: json.token.symbol,
          [String(json.token.denom).toLowerCase()]: json.token.symbol,
        }));
      }
      if (apiTrades.length) {
        setSymbolMap((prev) => {
          const next = { ...prev };
          apiTrades.forEach((trade: any) => {
            const offerDenom = trade?.offerDenom ?? trade?.offer_denom;
            const offerSymbol = trade?.offerSymbol ?? trade?.offer_symbol;
            const askDenom = trade?.askDenom ?? trade?.ask_denom;
            const askSymbol = trade?.askSymbol ?? trade?.ask_symbol;

            if (offerDenom && offerSymbol) {
              next[offerDenom] = offerSymbol;
              next[String(offerDenom).toLowerCase()] = offerSymbol;
            }
            if (askDenom && askSymbol) {
              next[askDenom] = askSymbol;
              next[String(askDenom).toLowerCase()] = askSymbol;
            }
          });
          return next;
        });
        setTokenImageMap((prev) => {
          const next = { ...prev };
          apiTrades.forEach((trade: any) => {
            const offerDenom = trade?.offerDenom ?? trade?.offer_denom;
            const offerImage = trade?.offerImage ?? trade?.offer_image;
            const askDenom = trade?.askDenom ?? trade?.ask_denom;
            const askImage = trade?.askImage ?? trade?.ask_image;

            if (offerDenom && offerImage) {
              next[offerDenom] = offerImage;
              next[String(offerDenom).toLowerCase()] = offerImage;
            }
            if (askDenom && askImage) {
              next[askDenom] = askImage;
              next[String(askDenom).toLowerCase()] = askImage;
            }
          });
          return next;
        });
        const mapped = apiTrades.map(mapApiTradeToLocal).sort(compareTradesByNewest);
        setTrades(mapped);
      } else {
        setTrades([]);
      }
    } catch (err) {
      console.error("Failed to fetch trades", err);
    } finally {
      setLoading(false);
    }
  }, [
    fetchApi,
    filters.timeRange,
    filters.tokenDenom,
    resolvedTokenOption,
    walletApiAddress,
  ]);

  useEffect(() => {
    wsMessageHandlerRef.current = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const { trades: tradesFromMessage, isSnapshot } =
          parseTradesFromStreamMessage(msg);
        if (!tradesFromMessage.length) return;

        if (isSnapshot) {
          pendingWsTradesRef.current = tradesFromMessage;
          pendingWsSnapshotRef.current = true;
        } else {
          pendingWsTradesRef.current = pendingWsTradesRef.current.concat(
            tradesFromMessage
          );
        }

        if (wsFlushTimeoutRef.current != null || typeof window === "undefined") {
          return;
        }

        wsFlushTimeoutRef.current = window.setTimeout(() => {
          flushPendingWsTrades();
        }, WS_BATCH_WINDOW_MS);
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
      }
    };
  }, [flushPendingWsTrades, parseTradesFromStreamMessage]);

  useEffect(() => {
    if (!TRADES_WS_URL) return;
    const listener = (event: MessageEvent) => {
      wsMessageHandlerRef.current(event);
    };
    const unsubscribe = addTradesWsListener(listener);
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!filters.tokenDenom && !walletApiAddress) {
      if (!TRADES_WS_URL) {
        fetchTradesFromApi();
      }
      return;
    }
    fetchTradesFromApi();
  }, [fetchTradesFromApi, filters.tokenDenom, walletApiAddress]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (TRADES_WS_URL && hasWsTradesRef.current) return;
      fetchTradesFromApi();
    }, FALLBACK_POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [fetchTradesFromApi]);

  useEffect(() => {
    return () => {
      if (typeof window === "undefined") return;
      if (wsFlushTimeoutRef.current != null) {
        window.clearTimeout(wsFlushTimeoutRef.current);
        wsFlushTimeoutRef.current = null;
      }
      for (const timeoutId of newTradeTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      newTradeTimeoutsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    tradesRef.current = trades;
  }, [trades]);

  useEffect(() => {
    if (!TRADES_WS_URL) return;
    let cancelled = false;
    const fallbackTimeout = setTimeout(() => {
      if (!hasWsTradesRef.current && !cancelled) {
        fetchTradesFromApi();
      }
    }, 1500);

    return () => {
      cancelled = true;
      clearTimeout(fallbackTimeout);
    };
  }, [fetchTradesFromApi, filters.timeRange]);

  const copyAddress = async (address: string) => {
    if (!address || typeof navigator === "undefined") return;
    try {
      await navigator.clipboard.writeText(address);
    } catch (err) {
      console.error("Failed to copy address", err);
    }
  };

  useEffect(() => {
    if (!onAvailableTokens) return;
    const options = allTokenOptions.length
      ? allTokenOptions
      : tokenOptionsFromTrades;
    onAvailableTokens(options);
  }, [onAvailableTokens, tokenOptionsFromTrades, allTokenOptions]);

  const filteredTrades = useMemo(() => {
    const now = Date.now();
    const walletFilter = filters.wallet.trim().toLowerCase();

    return trades
      .filter((trade) => {
      if (filters.assetMode === "token") {
        if (isZigDenom(trade.askDenom) && isZigDenom(trade.offerDenom)) {
          return false;
        }
      }

      const tradeTimestamp = parseTradeTimestamp(trade.time);
      const timeLimit =
        TIME_RANGE_MS[filters.timeRange] ?? Number.POSITIVE_INFINITY;
      if (!Number.isNaN(tradeTimestamp) && now - tradeTimestamp > timeLimit) {
        return false;
      }

      const value = Math.abs(trade.valueNative ?? 0);
      if (filters.valueRange === "< 1K ZIG" && value >= 1000) return false;
      if (
        filters.valueRange === "1K - 10K ZIG" &&
        (value < 1000 || value >= 10000)
      )
        return false;
      if (filters.valueRange === "> 10K ZIG" && value < 10000) return false;

      if (filters.tokenDenom) {
        const tokenLower = filters.tokenDenom.toLowerCase();
        const resolvedDenom = resolvedTokenOption?.denom.toLowerCase();
        const resolvedSymbol = resolvedTokenOption?.label.toLowerCase();
        const matchesToken =
          trade.askDenom.toLowerCase() === tokenLower ||
          trade.offerDenom.toLowerCase() === tokenLower ||
          trade.askDenom.toLowerCase() === resolvedDenom ||
          trade.offerDenom.toLowerCase() === resolvedDenom ||
          (trade.askSymbol?.toLowerCase() ?? "") === tokenLower ||
          (trade.offerSymbol?.toLowerCase() ?? "") === tokenLower ||
          (trade.askSymbol?.toLowerCase() ?? "") === resolvedSymbol ||
          (trade.offerSymbol?.toLowerCase() ?? "") === resolvedSymbol;
        if (!matchesToken) return false;
      }

      if (walletFilter && !trade.signer.toLowerCase().includes(walletFilter)) {
        return false;
      }

      return true;
    })
      .sort(compareTradesByNewest);
  }, [trades, filters, resolvedTokenOption]);
  useEffect(() => {
    onFilteredTradesChange?.(filteredTrades);
  }, [filteredTrades, onFilteredTradesChange]);
  useEffect(() => {
    const maxPage = Math.max(
      1,
      Math.ceil(filteredTrades.length / tradesPerPage)
    );
    setCurrentPage((prev) => (prev > maxPage ? maxPage : prev));
  }, [filteredTrades.length, tradesPerPage]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredTrades.length / tradesPerPage)
  );
  const paginatedTrades = filteredTrades.slice(
    (currentPage - 1) * tradesPerPage,
    currentPage * tradesPerPage
  );

  // Handle scroll detection to prevent auto-scroll when user is reading
  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Consider user scrolled if not at top
      isUserScrolledRef.current = scrollTop > 10;
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div
      className="relative z-10 mx-auto w-full rounded-2xl overflow-hidden border border-white/20"
      style={{
        backgroundImage: `radial-gradient(circle at 80% 80%, rgba(35, 153, 125, 0.45), rgba(0,0,0,0) 55%), linear-gradient(140deg, #050505 35%, #050505 70%, #020a0b 100%)`,
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
      }}
    >
      <style jsx>{`
        @keyframes highlightPulse {
          0% {
            background-color: rgba(74, 222, 128, 0.08);
          }
          100% {
            background-color: transparent;
          }
        }
        
        .trade-row-new {
          animation: highlightPulse 650ms ease-out forwards;
        }
      `}</style>
      
      <div className="overflow-x-auto  overflow-y-auto" ref={tableContainerRef}>
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="relative border-b border-white/20 bg-[#000000]/90 text-gray-400 text-xs uppercase tracking-wider after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1px] after:bg-gradient-to-r after:from-[#FA4E30] after:to-[#39C8A6] after:content-['']">
              <th className="px-6 py-4 font-medium">Time</th>
              <th className="px-6 py-4 font-medium">Type</th>
              <th className="px-6 py-4 font-medium">Value</th>
              <th className="px-6 py-4 font-medium">Amount</th>
              <th className="px-6 py-4 font-medium">Trader</th>
              <th className="px-6 py-4 font-medium">Source</th>
              <th className="px-6 py-4 font-medium">Platform</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {!paginatedTrades.length ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-10 text-center text-sm text-white/60"
                >
                  No trades found
                </td>
              </tr>
            ) : (
              paginatedTrades.map((trade) => {
                const entityClass = determineEntityClass(trade);
                const rowKeyValue = tradeKey(trade);
                const isNewTrade = rowKeyValue in newTradeKeys;
                return (
                  <tr
                    key={rowKeyValue}
                    className={`group border-b border-white/15 transition-colors duration-150 hover:bg-white/[0.02] ${
                      isNewTrade ? "trade-row-new" : ""
                    }`}
                  >
                    <td className="px-6 py-4 text-sm text-gray-300 border-b border-white/15">
                      {formatTime(trade.time)}
                    </td>
                    <td className="px-6 py-4 border-b border-white/15">
                      <span
                        className={`px-3 py-1 rounded-md text-[11px] font-bold ${
                          trade.direction === "buy"
                            ? "bg-[#20D87C] text-white"
                            : "bg-[#F64F39] text-white"
                        }`}
                      >
                        {trade.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium border-b border-white/15">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          {getEntityIcon(entityClass)}
                        </div>
                        <span>
                          $
                          {trade.valueUsd?.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm border-b border-white/15">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-[#20D87C]">
                          <Image
                            src={getTradeTokenIcon(trade, "ask")}
                            alt={`${getTradeTokenSymbol(trade, "ask")} icon`}
                            width={18}
                            height={18}
                            className="w-4 h-4 rounded-full object-cover"
                            unoptimized
                          />
                          <span className="text-sm font-semibold">
                            +{formatAmount(trade.returnAmount)}{" "}
                            {getTradeTokenSymbol(trade, "ask")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[#F64F39]">
                          <Image
                            src={getTradeTokenIcon(trade, "offer")}
                            alt={`${getTradeTokenSymbol(trade, "offer")} icon`}
                            width={18}
                            height={18}
                            className="w-4 h-4 rounded-full object-cover"
                            unoptimized
                          />
                          <span className="text-sm font-semibold">
                            -{formatAmount(trade.offerAmount)}{" "}
                            {getTradeTokenSymbol(trade, "offer")}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm border-b border-white/15">
                      <div className="flex items-center gap-2 text-blue-400 group">
                        <span className="cursor-pointer hover:text-blue-300">
                          {truncateAddress(trade.signer)}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyAddress(trade.signer)}
                          className="opacity-0 transition-opacity group-hover:opacity-100"
                          aria-label="Copy trader address"
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 border-b border-white/15">
                      <div className="flex items-center">
                        <Image
                          src={ZIG_ICON}
                          alt="Oroswap"
                          width={154}
                          height={51}
                          className="h-auto w-[112px] object-contain"
                          unoptimized
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4 border-b border-white/15">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <Image
                            src={Degenter_ICON}
                            alt="Degenter"
                            width={24}
                            height={24}
                            className="h-6 w-7 object-cover"
                          />
                          <span className="text-sm">{Degenter_Label}</span>
                        </div>
                        <a
                          href={`https://zigscan.org/tx/${trade.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 bg-white/5 rounded-md hover:bg-white/10 transition-colors"
                        >
                          <ExternalLink size={14} className="text-green-400" />
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Custom Pagination as seen in UI footer */}
      <div className="px-6 py-4 flex items-center justify-between border-t border-white/5 bg-black/20">
        <span className="text-xs text-gray-500">
          Showing {(currentPage - 1) * tradesPerPage + 1}-
          {Math.min(currentPage * tradesPerPage, filteredTrades.length)} of{" "}
          {filteredTrades.length}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-colors"
            disabled={currentPage === 1}
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-medium px-3 py-1 bg-white/10 rounded-md">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-colors"
            disabled={currentPage === totalPages}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Trades;
