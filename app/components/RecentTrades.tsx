/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ChevronFirst,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Filter,
  Search,
  X,
} from "lucide-react";
import explorer from "../../public/explorer.png";
import { API_BASE_URL } from "@/lib/api";
import { useRouter } from "next/navigation";

const API_BASE = API_BASE_URL;
const API_KEY =
  process.env.NEXT_PUBLIC_X_API_KEY || process.env.NEXT_PUBLIC_API_KEY;
const API_HEADERS: HeadersInit = API_KEY ? { "x-api-key": API_KEY } : {};
const TRADES_WS_URL = process.env.NEXT_PUBLIC_TRADES_WS_URL || "";
const MAX_TRADES = 500;
const TRADE_LOOKBACK_DAYS = 7;
const TRADE_LOOKBACK_MS = TRADE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

const fetchApi = (url: string, init: RequestInit = {}) =>
  fetch(url, {
    ...init,
    headers: { ...API_HEADERS, ...(init.headers || {}) },
  });

interface Trade {
  time: string;
  txHash: string;
  tradeId?: string;
  direction: "buy" | "sell" | "provide" | "withdraw";
  offerDenom: string;
  offerAmount: number; // human amount
  askDenom: string;
  returnAmount: number; // human amount
  valueNative: number; // human native (ZIG) or token depending on context
  valueUsd: number;
  priceUsd?: number;
  priceInZig: number;
  signer: string;
  pairContract: string;
  class?: string;
}

export interface SignerFilterTrade {
  time: string;
  direction: "buy" | "sell";
  priceInZig: number;
  priceUsd?: number;
}

export interface SignerFilterSummary {
  signer: string;
  buys: number;
  sells: number;
  latestDirection?: Trade["direction"];
  latestTime?: string;
  latestValueUsd?: number;
  trades?: SignerFilterTrade[];
}

interface RecentTradesProps {
  tokenId?: string;
  filteredSigner?: string | null;
  onSignerFilterChange?: (summary: SignerFilterSummary | null) => void;
}

type TabType =
  | "Trade History"
  | "Top Holders"
  | "Top Traders"
  | "Security"
  | "My Swaps";

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const normalizeDenomForZigCheck = (denom?: string) =>
  (denom ?? "").replace(/^ibc\/\w+\//, "").toLowerCase();

const isZigDenom = (denom?: string) =>
  normalizeDenomForZigCheck(denom).includes("uzig");

const normalizeTokenRef = (value?: string) =>
  (value ?? "").replace(/^ibc\/\w+\//, "").trim().toLowerCase();

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

const getTradeClass = (zigAmount: number = 0): string => {
  if (zigAmount >= 10000) return "whale";
  if (zigAmount >= 1000) return "shark";
  return "shrimp";
};

const mapApiTradeToLocal = (trade: any): Trade => {
  const direction = (trade.direction as Trade["direction"]) || "buy";
  const offerAmount = Number(trade.offerAmount ?? 0);
  const returnAmount = Number(trade.returnAmount ?? 0);
  const zigAmount = getZigSideAmount(
    trade.offerDenom ?? trade.offer_denom ?? "",
    trade.askDenom ?? trade.ask_denom ?? "",
    direction,
    offerAmount,
    returnAmount
  );

  return {
    time: trade.time ?? new Date().toISOString(),
    txHash: trade.txHash ?? trade.tx_hash ?? "",
    tradeId: trade.tradeId ?? trade.trade_id ?? "",
    direction,
    offerDenom: trade.offerDenom ?? trade.offer_denom ?? "",
    offerAmount,
    askDenom: trade.askDenom ?? trade.ask_denom ?? "",
    returnAmount,
    valueNative:
      typeof trade.valueNative === "number"
        ? trade.valueNative
        : trade.value_native ?? 0,
    valueUsd:
      typeof trade.valueUsd === "number"
        ? trade.valueUsd
        : trade.value_usd ?? 0,
    priceUsd:
      typeof trade.priceUsd === "number"
        ? trade.priceUsd
        : trade.price_usd ?? 0,
    priceInZig:
      typeof trade.priceNative === "number"
        ? trade.priceNative
        : typeof trade.price_in_zig === "number"
        ? trade.price_in_zig
        : 0,
    signer: trade.signer ?? "",
    pairContract: trade.pairContract ?? trade.pair_contract ?? "",
    class: trade.class || getTradeClass(zigAmount),
  };
};

interface TokenCache {
  price: number;
  icon: string;
  exponent?: number;
  timestamp: number;
}

const getCachedTokenData = (tokenId: string): TokenCache | null => {
  if (typeof window === "undefined") return null;

  const cached = localStorage.getItem(`token_${tokenId}`);
  if (!cached) return null;

  try {
    const data = JSON.parse(cached) as TokenCache;
    // Check if cache is still valid
    if (Date.now() - data.timestamp < CACHE_DURATION) {
      return data;
    }
  } catch (e) {
    console.error("Error parsing cached token data:", e);
  }
  return null;
};

const cacheTokenData = (
  tokenId: string,
  price: number,
  icon: string,
  exponent = 6
) => {
  if (typeof window === "undefined") return;

  const data: TokenCache = {
    price,
    icon,
    exponent,
    timestamp: Date.now(),
  };

  try {
    localStorage.setItem(`token_${tokenId}`, JSON.stringify(data));
  } catch (e) {
    console.error("Error caching token data:", e);
  }
};

/**
 * Fetch token meta (price, imageUri, exponent) and cache it.
 * Returns { price, icon, exponent } or null on failure.
 */
const fetchTokenMeta = async (tokenId: string) => {
  // Check cache first
  const cached = getCachedTokenData(tokenId);
  if (cached) {
    return {
      price: cached.price ?? 0,
      icon: cached.icon ?? "",
      exponent: cached.exponent ?? 6,
    };
  }

  try {
    const res = await fetchApi(`${API_BASE}/tokens/${tokenId}`);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.success || !json?.data) return null;
    const token = json.data?.token ?? json.data;
    const price = json.data?.price;

    const priceInUsd = token.priceInUsd ?? price?.usd ?? 0;
    const icon = token.imageUri ?? token.icon ?? "";
    const exponent =
      typeof token.exponent === "number"
        ? token.exponent
        : typeof json.data?.exponent === "number"
        ? json.data.exponent
        : 6;

    cacheTokenData(tokenId, priceInUsd, icon, exponent);

    return {
      price: priceInUsd,
      icon,
      exponent,
    };
  } catch (e) {
    console.error("Error fetching token meta:", e);
    return null;
  }
};

/**
 * Convenience: fetch price only (returns priceInUsd, caches meta).
 */
const fetchTokenPrice = async (
  tokenId: string,
  amount: string
): Promise<number> => {
  // amount param kept for compatibility from other parts, but we return price per unit
  const meta = await fetchTokenMeta(tokenId);
  return meta?.price ?? 0;
};

/**
 * Preload token metas for a list of tokenIds (to warm cache).
 */
const preloadTokenData = async (tokenIds: string[]) => {
  for (const tokenId of tokenIds) {
    const cleaned = tokenId.replace(/^ibc\/\w+\//, "").toLowerCase();
    const cached = getCachedTokenData(cleaned);
    if (!cached) {
      // fetch and cache
      await fetchTokenMeta(cleaned);
    }
  }
};

const RecentTrades: React.FC<RecentTradesProps> = ({
  tokenId,
  filteredSigner,
  onSignerFilterChange,
}) => {
  const router = useRouter();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("Trade History");
  const isMounted = useRef(true);
  const [poolId, setPoolId] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [internalAddressFilter, setInternalAddressFilter] = useState<
    string | null
  >(null);
  const appliedAddressFilter = filteredSigner ?? internalAddressFilter;
  const initialLoadDone = useRef(false);
  const lastFilterSummaryRef = useRef<SignerFilterSummary | null>(null);
  const tradesPerPage = 20;
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLTableSectionElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [whaleCount, setWhaleCount] = useState(0);
  const [sharkCount, setSharkCount] = useState(0);
  const [shrimpCount, setShrimpCount] = useState(0);
  const [newTradeKeys, setNewTradeKeys] = useState<Record<string, number>>({});
  const [symbolMap, setSymbolMap] = useState<Record<string, string>>({});
  const symbolMapRef = useRef<Record<string, string>>({});
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const hasLiveTradesRef = useRef(false);

  useEffect(() => {
    symbolMapRef.current = symbolMap;
  }, [symbolMap]);

  const [tokenImageMap, setTokenImageMap] = useState<Record<string, string>>(
    {}
  );

  const summarizeSigner = useCallback(
    (signer: string | null): SignerFilterSummary | null => {
      if (!signer) return null;
      const signerTrades = trades.filter((trade) => trade.signer === signer);
      const buys = signerTrades.filter(
        (trade) => trade.direction === "buy"
      ).length;
      const sells = signerTrades.filter(
        (trade) => trade.direction === "sell"
      ).length;
      const latest = signerTrades[0];
      const tradeHistory = signerTrades
        .filter(
          (trade): trade is Trade & { direction: "buy" | "sell" } =>
            (trade.direction === "buy" || trade.direction === "sell") &&
            Number.isFinite(trade.priceInZig) &&
            trade.priceInZig > 0
        )
        .map((trade) => ({
          time: trade.time,
          direction: trade.direction,
          priceInZig: trade.priceInZig,
          priceUsd: trade.priceUsd,
        }));
      return {
        signer,
        buys,
        sells,
        latestDirection: latest?.direction,
        latestTime: latest?.time,
        latestValueUsd:
          typeof latest?.valueUsd === "number" ? latest.valueUsd : undefined,
        trades: tradeHistory,
      };
    },
    [trades]
  );

  const areSameTrades = useCallback(
    (
      a: SignerFilterTrade[] | undefined,
      b: SignerFilterTrade[] | undefined
    ) => {
      if (a === b) return true;
      if (!a || !b) return false;
      if (a.length !== b.length) return false;
      return a.every((trade, idx) => {
        const other = b[idx];
        if (!other) return false;
        return (
          trade.time === other.time &&
          trade.direction === other.direction &&
          trade.priceInZig === other.priceInZig &&
          trade.priceUsd === other.priceUsd
        );
      });
    },
    []
  );

  const isSameSummary = useCallback(
    (a: SignerFilterSummary | null, b: SignerFilterSummary | null) => {
      if (a === b) return true;
      if (!a || !b) return false;
      return (
        a.signer === b.signer &&
        a.buys === b.buys &&
        a.sells === b.sells &&
        a.latestDirection === b.latestDirection &&
        a.latestTime === b.latestTime &&
        a.latestValueUsd === b.latestValueUsd &&
        areSameTrades(a.trades, b.trades)
      );
    },
    [areSameTrades]
  );

  const toggleAddressFilter = useCallback(
    (signer: string) => {
      if (!signer) return;
      const next = appliedAddressFilter === signer ? null : signer;
      const summary = summarizeSigner(next);
      if (onSignerFilterChange) {
        onSignerFilterChange(summary);
        lastFilterSummaryRef.current = summary;
      }
      if (filteredSigner === undefined) {
        setInternalAddressFilter(next);
      }
    },
    [
      appliedAddressFilter,
      filteredSigner,
      onSignerFilterChange,
      summarizeSigner,
    ]
  );

  const handleWalletNavigate = useCallback(
    (address: string) => {
      const trimmed = address.trim();
      if (!trimmed) return;
      router.push(`/portfolio?address=${encodeURIComponent(trimmed)}`);
    },
    [router]
  );

  useEffect(() => {
    if (!onSignerFilterChange) return;
    const summary = summarizeSigner(appliedAddressFilter);
    if (isSameSummary(lastFilterSummaryRef.current, summary)) return;
    onSignerFilterChange(summary);
    lastFilterSummaryRef.current = summary;
  }, [
    appliedAddressFilter,
    onSignerFilterChange,
    summarizeSigner,
    isSameSummary,
  ]);

  // const tradeKey = (trade: Trade) =>
  //   trade.tradeId
  //     ? `trade:${trade.tradeId}`
  //     : [
  //         trade.txHash,
  //         trade.time,
  //         trade.direction,
  //         trade.offerDenom,
  //         trade.askDenom,
  //         trade.signer,
  //       ].join("|");
  const tradeKey = (trade: Trade) =>
    trade.tradeId ||
    trade.txHash ||
    `${trade.txHash}:${trade.signer}:${trade.time}`;
  // Helper to convert raw websocket amount to human amount using exponent
  const convertAmount = async (
    raw: number,
    denom: string,
    allowFetch = true
  ): Promise<number> => {
    if (!denom) return raw;

    const cleanedDenom = denom.replace(/^ibc\/\w+\//, "").toLowerCase();

    if (cleanedDenom === "uzig" || cleanedDenom.includes("uzig")) {
      return raw / 1_000_000;
    }

    const cached = getCachedTokenData(cleanedDenom);
    if (cached && typeof cached.exponent === "number") {
      const exp = cached.exponent;
      if (exp === 0) return raw;
      return raw / Math.pow(10, exp);
    }

    if (!allowFetch) {
      return raw / 1_000_000;
    }

    const meta = await fetchTokenMeta(cleanedDenom);
    const exp = meta?.exponent ?? 6;
    if (exp === 0) return raw;
    return raw / Math.pow(10, exp);
  };

  const parseTradesFromStreamMessage = async (
    msg: any
  ): Promise<{ trades: Trade[]; isSnapshot: boolean }> => {
    if (!msg) return { trades: [], isSnapshot: false };

    const isSnapshot = msg.type === "snapshot";
    let items: any[] = [];

    if (msg.type === "trade") {
      // ✅ FIX: unwrap data
      items = [msg.data ?? msg];
    } else if (isSnapshot && Array.isArray(msg.data)) {
      items = msg.data;
    } else if (Array.isArray(msg.data)) {
      items = msg.data;
    }

    if (!items.length) return { trades: [], isSnapshot };

    const mapped = await Promise.all(items.map(mapStreamTradeToLocal));

    return {
      trades: mapped.filter(Boolean) as Trade[],
      isSnapshot,
    };
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

  const mapStreamTradeToLocal = async (item: any): Promise<Trade | null> => {
    try {
      const tradeData = unwrapTradePayload(item);
      if (!tradeData) return null;

      const action = tradeData.action ?? tradeData.type ?? "swap";
      if (action !== "swap" && tradeData.direction == null) return null;

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

      const offerAmount = await convertAmount(offerAmountRaw, offerDenom, true);
      const returnAmount = await convertAmount(
        returnAmountRaw,
        askDenom,
        true
      );
      const displayedAmount = direction === "sell" ? offerAmount : returnAmount;

      let zigAmountHuman = 0;
      let tokenAmountHuman = 0;
      if (direction === "buy") {
        zigAmountHuman = offerAmount;
        tokenAmountHuman = returnAmount;
      } else if (direction === "sell") {
        zigAmountHuman = returnAmount;
        tokenAmountHuman = offerAmount;
      }

      const priceInZig = Number(
        tradeData.price_in_zig ?? tradeData.priceInZig ?? 0
      );
      const zigUsdAtTrade = Number(
        tradeData.zig_usd_at_trade ?? tradeData.zigUsdAtTrade ?? 0
      );
      let priceUsd = Number(
        tradeData.price_in_usd ??
          tradeData.priceInUsd ??
          tradeData.price_usd ??
          0
      );
      if (!priceUsd && priceInZig && zigUsdAtTrade) {
        priceUsd = priceInZig * zigUsdAtTrade;
      }

      let valueUsd = Number(
        tradeData.value_in_usd ?? tradeData.valueUsd ?? tradeData.value_usd ?? 0
      );

      if (!valueUsd) {
        const displayedDenom = direction === "sell" ? offerDenom : askDenom;
        if (isZigDenom(displayedDenom)) {
          valueUsd = displayedAmount * (zigUsdAtTrade || 0);
        } else if (priceUsd) {
          valueUsd = displayedAmount * priceUsd;
        }
      }

      return {
        time: tradeData.created_at ?? item?.ts ?? new Date().toISOString(),
        txHash: tradeData.tx_hash ?? tradeData.txHash ?? item?.tx_hash ?? "",
        tradeId:
          tradeData.trade_id ??
          tradeData.tradeId ??
          item?.trade_id ??
          item?.tradeId ??
          "",
        direction,
        offerDenom,
        offerAmount,
        askDenom,
        returnAmount,
        valueNative: displayedAmount,
        valueUsd,
        priceUsd,
        priceInZig:
          priceInZig ||
          (tokenAmountHuman ? zigAmountHuman / tokenAmountHuman : 0),
        signer: tradeData.signer ?? "",
        pairContract:
          item?.pair_contract ??
          tradeData.pair_contract ??
          tradeData.pairContract ??
          "",
        class: getTradeClass(zigAmountHuman),
      };
    } catch (error) {
      console.error("Error parsing trade from stream:", error);
      return null;
    }
  };

  const isTradeForSelectedToken = useCallback(
    (rawItem: any, trade: Trade) => {
      if (!tokenId) return false;

      const selected = normalizeTokenRef(tokenId);
      if (!selected) return false;

      const tradeData = unwrapTradePayload(rawItem) ?? rawItem ?? {};
      const candidates = [
        tokenId,
        selected,
        tokenId.split(".").pop() || tokenId,
        tradeData.token_id,
        tradeData.tokenId,
        tradeData.ask_asset_denom,
        tradeData.offer_asset_denom,
        tradeData.askDenom,
        tradeData.offerDenom,
        trade.askDenom,
        trade.offerDenom,
      ]
        .map((v) => normalizeTokenRef(v))
        .filter(Boolean);

      const selectedParts = new Set([
        selected,
        normalizeTokenRef(tokenId.split(".").pop() || tokenId),
      ]);

      return candidates.some((candidate) =>
        Array.from(selectedParts).some(
          (part) =>
            candidate === part ||
            candidate.includes(part) ||
            part.includes(candidate)
        )
      );
    },
    [tokenId]
  );

  const resolveSymbolFromTokenId = useCallback(
    async (id: string): Promise<string | null> => {
      try {
        const res = await fetchApi(
          `${API_BASE}/tokens/${encodeURIComponent(id)}?priceSource=best`,
          { cache: "no-store" }
        );
        if (!res.ok) return null;
        const json = await res.json();
        if (!json?.success || !json?.data) return null;
        const token = json.data?.token ?? json.data;
        const symbol = token?.symbol;
        return typeof symbol === "string" && symbol.trim()
          ? symbol.trim()
          : null;
      } catch {
        return null;
      }
    },
    []
  );

  const fetch24hTradesFromApi = useCallback(async (): Promise<Trade[]> => {
    if (!tokenId) return [];

    const candidates = Array.from(
      new Set([
        tokenId,
        tokenId.split(".").pop() || tokenId,
        tokenId.toUpperCase(),
      ])
    ).filter(Boolean);

    try {
      for (const candidate of candidates) {
        const response = await fetchApi(
          `${API_BASE}/trades/token/${encodeURIComponent(
            candidate
          )}?tf=30d&unit=usd&limit=500`,
          { cache: "no-store" }
        );
        if (!response.ok) continue;
        const data = await response.json();
        if (!data?.success || !Array.isArray(data.data)) continue;
        if (data.data.length === 0) continue;
        const cutoff = Date.now() - TRADE_LOOKBACK_MS;
        return data.data
          .map(mapApiTradeToLocal)
          .filter((trade: { time: string }) => {
            const ts = Date.parse(trade.time);
            return Number.isFinite(ts) && ts >= cutoff;
          })
          .slice(0, MAX_TRADES);
      }

      const resolvedSymbol = await resolveSymbolFromTokenId(tokenId);
      if (resolvedSymbol) {
        const response = await fetchApi(
          `${API_BASE}/trades/token/${encodeURIComponent(
            resolvedSymbol
          )}?tf=7d&unit=usd&limit=500`,
          { cache: "no-store" }
        );
        if (response.ok) {
          const data = await response.json();
          if (data?.success && Array.isArray(data.data) && data.data.length) {
            const cutoff = Date.now() - TRADE_LOOKBACK_MS;
            return data.data
              .map(mapApiTradeToLocal)
              .filter((trade: { time: string }) => {
                const ts = Date.parse(trade.time);
                return Number.isFinite(ts) && ts >= cutoff;
              })
              .slice(0, MAX_TRADES);
          }
        }
      }

      return [];
    } catch (error) {
      console.error("Error fetching 24h trades from API:", error);
      return [];
    }
  }, [tokenId, resolveSymbolFromTokenId]);

  // Fetch initial batch of trades
  const fetchInitialTrades = useCallback(async () => {
    if (!tokenId) return;

    setLoading(true);
    try {
      const response = await fetchApi(
        `${API_BASE}/trades/token/${encodeURIComponent(tokenId)}?limit=500`,
        { cache: "no-store" }
      );

      if (!response.ok) throw new Error("Failed to fetch trades");

      const data = await response.json();
      if (data?.success && Array.isArray(data.data)) {
        const mappedTrades = data.data.map(mapApiTradeToLocal);
        setTrades(mappedTrades);
        setLastUpdated(new Date());
        initialLoadDone.current = true;
      }
    } catch (error) {
      console.error("Error fetching initial trades:", error);
    } finally {
      setLoading(false);
    }
  }, [tokenId]);

  const processedTrades = useMemo(() => {
    let filtered = trades;
    if (activeFilter) {
      filtered = filtered.filter((trade) => trade.class === activeFilter);
    }
    if (appliedAddressFilter) {
      filtered = filtered.filter(
        (trade) => trade.signer === appliedAddressFilter
      );
    }
    return filtered;
  }, [trades, activeFilter, appliedAddressFilter]);

  useEffect(() => {
    const fetchPoolData = async () => {
      if (!tokenId) return;

      try {
        const response = await fetchApi(
          `${API_BASE}/tokens/${encodeURIComponent(
            tokenId
          )}?priceSource=best&includePools=1`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          console.error("❌ Pool data request failed:", response.status);
          setLoading(false);
          return;
        }
        const data = await response.json();
        if (data?.success === false) {
          console.error("❌ Pool data returned success=false");
          setLoading(false);
          return;
        }
        const detail = data?.data ?? data;
        const tokenPayload = detail?.token ?? detail;
        const pool =
          detail?.poolsDetailed?.[0] ||
          detail?.pools?.[0] ||
          tokenPayload?.poolsDetailed?.[0] ||
          tokenPayload?.pools?.[0];
        const poolIdValue = Number(
          pool?.poolId ||
            pool?.pool_id ||
            detail?.poolId ||
            detail?.pool_id ||
            ""
        );

        if (poolIdValue) {
          // console.log("🎯 Found pool id:", poolIdValue);
          setPoolId(poolIdValue);
        } else {
          console.error("❌ No pool id found in pool data");
          setLoading(false);
        }
      } catch (error) {
        console.error("❌ Error fetching pool data:", error);
        setLoading(false);
      }
    };

    fetchPoolData();
  }, [tokenId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchApi(
          `${API_BASE}/tokens/swap-list?q=zig&bucket=30d&unit=usd`
        );
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
            if (it.imageUri) {
              imageMap[it.denom] = it.imageUri;
            } else {
              imageMap[it.denom] = "/zigicon.png";
            }
          }
        }
        if (!cancelled) {
          setSymbolMap(map);
          setTokenImageMap(imageMap);
          // console.log("✅ Loaded token icons:", Object.keys(imageMap).length);
        }
      } catch (error) {
        console.error("❌ Error fetching token icons:", error);
        setSymbolMap({ uzig: "ZIG" });
        setTokenImageMap({ uzig: "/zigicon.png" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const tokenIds = Array.from(
      new Set(
        trades.flatMap((trade) => [
          trade.offerDenom.replace(/^ibc\/\w+\//, "").toLowerCase(),
          trade.askDenom.replace(/^ibc\/\w+\//, "").toLowerCase(),
        ])
      )
    );
    preloadTokenData(tokenIds);
  }, [trades]);

  useEffect(() => {
    const counts = { whale: 0, shark: 0, shrimp: 0 };
    for (const trade of trades) {
      if (trade.class === "whale") counts.whale += 1;
      else if (trade.class === "shark") counts.shark += 1;
      else if (trade.class === "shrimp") counts.shrimp += 1;
    }
    setWhaleCount(counts.whale);
    setSharkCount(counts.shark);
    setShrimpCount(counts.shrimp);
  }, [trades]);

  // Track previous trades length for detecting new trades
  const prevTradesLengthRef = useRef(trades.length);
  const waterfallRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const newTradeTimeoutsRef = useRef<Map<string, number>>(new Map());

  const getTradeKey = useCallback(
    (trade: Trade) =>
      trade.tradeId ||
      trade.txHash ||
      `${trade.signer}-${trade.time}-${trade.offerDenom}-${trade.askDenom}`,
    []
  );

  const markNewTrades = useCallback(
    (incoming: Trade[]) => {
      if (!incoming.length || typeof window === "undefined") return;

      setNewTradeKeys((prev) => {
        const next = { ...prev };
        const now = Date.now();
        for (const trade of incoming) {
          next[getTradeKey(trade)] = now;
        }
        return next;
      });

      for (const trade of incoming) {
        const key = getTradeKey(trade);
        const existing = newTradeTimeoutsRef.current.get(key);
        if (existing) {
          window.clearTimeout(existing);
        }
        const timeoutId = window.setTimeout(() => {
          setNewTradeKeys((prev) => {
            if (!(key in prev)) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
          });
          newTradeTimeoutsRef.current.delete(key);
        }, 650);
        newTradeTimeoutsRef.current.set(key, timeoutId);
      }
    },
    [getTradeKey]
  );

  useEffect(() => {
    if (trades.length === 0) return;
    prevTradesLengthRef.current = trades.length;
  }, [trades]);

  useEffect(() => {
    return () => {
      for (const timeoutId of newTradeTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      newTradeTimeoutsRef.current.clear();
    };
  }, []);

  // WebSocket setup with proper connection handling
  useEffect(() => {
    if (!tokenId) return;

    // Reset stale trades when selected token changes.
    setTrades([]);
    setCurrentPage(1);
    initialLoadDone.current = false;

    // Fetch initial trades immediately
    if (!initialLoadDone.current) {
      fetchInitialTrades();
    }

    const connectWebSocket = () => {
      try {
        // Close existing connection if any
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }

        const ws = new WebSocket(TRADES_WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
          reconnectAttemptsRef.current = 0;

          // Subscribe to trades stream for this token
          const subscribeMessage = {
            type: "sub",
            stream: "trades",
            token_id: tokenId, // Assuming the API supports filtering by token_id
          };
          ws.send(JSON.stringify(subscribeMessage));
        };

        ws.onmessage = async (event) => {
          try {
            const msg = JSON.parse(event.data);
            const { trades: parsedTrades } =
              await parseTradesFromStreamMessage(msg);
            if (!parsedTrades.length) return;

            const tradesFromMessage = parsedTrades.filter((trade, index) =>
              isTradeForSelectedToken(
                Array.isArray(msg?.data) ? msg.data[index] : msg?.data ?? msg,
                trade
              )
            );
            if (!tradesFromMessage.length) return;

            setTrades((prevTrades) => {
              // Filter out any existing trades with the same ID/hash to prevent duplicates
              const existingTradeIds = new Set(
                prevTrades.map((t) => t.tradeId || t.txHash)
              );
              const uniqueNewTrades = tradesFromMessage.filter(
                (t) => !existingTradeIds.has(t.tradeId || t.txHash)
              );

              if (uniqueNewTrades.length === 0) return prevTrades;
              markNewTrades(uniqueNewTrades);

              // Prepend new trades and keep only the most recent MAX_TRADES
              const updatedTrades = [...uniqueNewTrades, ...prevTrades].slice(
                0,
                MAX_TRADES
              );
              return updatedTrades;
            });

            setLastUpdated(new Date());
          } catch (error) {
            console.error("Error processing WebSocket message:", error);
          }
        };

        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          setWsConnected(false);
        };

        ws.onclose = (event) => {
          setWsConnected(false);
          wsRef.current = null;

          // Attempt to reconnect with exponential backoff
          if (reconnectAttemptsRef.current < 5) {
            const delay = Math.min(
              1000 * Math.pow(2, reconnectAttemptsRef.current),
              30000
            );
            reconnectAttemptsRef.current++;

            reconnectTimeoutRef.current = setTimeout(() => {
              connectWebSocket();
            }, delay);
          } else {
            console.error("Max reconnection attempts reached");
          }
        };
      } catch (error) {
        console.error("Error setting up WebSocket:", error);
      }
    };

    // Connect WebSocket
    connectWebSocket();

    // Cleanup function
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
    };
  }, [tokenId, fetchInitialTrades, markNewTrades, isTradeForSelectedToken]);

  const formatTimeAgo = useCallback((dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "Just now";

      const now = new Date();
      const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

      if (diffInSeconds < 10) return "Just now";
      if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
      if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
      if (diffInSeconds < 86400)
        return `${Math.floor(diffInSeconds / 3600)}h ago`;
      return `${Math.floor(diffInSeconds / 86400)}d ago`;
    } catch (e) {
      return "Just now";
    }
  }, []);

  const shortenAddress = (address?: string) => {
    if (!address) return "—";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const symbolFor = (denom?: string): string => {
    if (!denom) return "";
    if (denom === "uzig" || denom.includes("uzig")) return "ZIG";
    const found = symbolMap[denom];
    if (found) return found;
    const parts = denom.split(".");
    const last = parts[parts.length - 1] || denom;
    return last.toUpperCase();
  };

  const getTokenIcon = (denom?: string): string => {
    if (!denom) return "/zigicon.png";
    if (denom === "uzig" || denom.includes("uzig")) return "/zigicon.png";
    const found = tokenImageMap[denom];
    if (found) return found;
    // Fallback to placeholder
    return "/zigicon.png";
  };

  const getClassEmoji = (tradeClass?: string) => {
    switch (tradeClass) {
      case "whale":
        return "🐋";
      case "shark":
        return "🦈";
      case "shrimp":
        return "🦐";
      default:
        return "";
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(
      Math.max(
        1,
        Math.min(page, Math.ceil(processedTrades.length / tradesPerPage))
      )
    );
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [appliedAddressFilter, activeFilter]);

  const tabs: TabType[] = [
    "Trade History",
    "Top Holders",
    "Top Traders",
    "Security",
    "My Swaps",
  ];

  const amountFormatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const formatRecentTradeAmount = (n?: number): string => {
    if (n == null || !Number.isFinite(n)) return "—";
    const absValue = Math.abs(n);
    if (absValue === 0) return "0";

    if (absValue >= 1) {
      return amountFormatter.format(Number(absValue.toFixed(2)));
    }

    const trimmed = absValue
      .toFixed(12)
      .replace(/\.?0+$/, "")
      .replace(/^$/, "0");
    return trimmed || "0";
  };

  const renderTradeRow = (trade: Trade, rowIndex: number) => {
    const setRowRef = (el: HTMLTableRowElement | null) => {
      waterfallRefs.current[rowIndex] = el;
    };
    const isShark = trade.class === "hello";
    const isSell = trade.direction === "sell";
    const directionColor = isSell
      ? "text-[#FF5C5C]"
      : trade.direction === "buy"
      ? "text-[#1EA76D]"
      : "text-[#F5A524]";

    const priceText =
      typeof trade.priceUsd === "number" && Number.isFinite(trade.priceUsd)
        ? `$${trade.priceUsd.toFixed(6)}`
        : "—";
    const valueText =
      typeof trade.valueUsd === "number" && Number.isFinite(trade.valueUsd)
        ? `$${trade.valueUsd.toFixed(2)}`
        : "—";
    const shortAddress = shortenAddress(trade.signer);
    const shortTx = trade.txHash ? `${trade.txHash.slice(0, 8)}...` : "—";
    const rowKey = getTradeKey(trade);
    const isNewTrade = rowKey in newTradeKeys;

    return (
      <tr
        ref={setRowRef}
        key={rowKey}
        className={`border-b border-[#808080]/10 transition-colors duration-500 ${
          isShark ? "shark-row" : ""
        } ${isNewTrade ? "row-waterfall" : ""} hover:bg-white/5`}
        style={{
          filter: isShark ? "url(#liquid-filter)" : "none",
          // borderLeft: isShark ? "4px solid #1EA76D" : "1px solid transparent",
        }}
      >
        <td className="px-4 py-3 text-sm text-gray-400 font-mono">
          {formatTimeAgo(trade.time)}
        </td>
        <td className={`px-4 py-3 text-sm font-bold ${directionColor}`}>
          <div className="flex items-center gap-2">
            <span className="uppercase tracking-wide">
              {trade.direction.toUpperCase()}
            </span>
            {/* {isShark && (
              <span className="shark-text font-black text-[#1EA76D] text-[0.65rem] uppercase tracking-[0.4em]">
                🦈 SHARK
              </span>
            )} */}
          </div>
        </td>
        <td className="px-4 py-3 text-sm font-mono text-gray-200">
          <span className={directionColor}>{priceText}</span>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center justify-center w-6 h-6 rounded-full `}
              // ${
              //   trade.class === "whale"
              //     ? "bg-blue-500/20"
              //     : trade.class === "shark"
              //     ? "bg-red-500/20"
              //     : trade.class === "shrimp"
              //     ? "bg-yellow-500/20"
              //     : "bg-gray-700/20"
              // }
            >
              {getClassEmoji(trade.class)}
            </span>
            <span className="text-gray-200 font-mono">{valueText}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-base">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-[#1EA76D] font-semibold text-base leading-tight">
              <Image
                src={getTokenIcon(trade.askDenom)}
                alt={symbolFor(trade.askDenom)}
                width={16}
                height={16}
                className="w-4 h-4 rounded-full"
                unoptimized
              />
              +{formatRecentTradeAmount(trade.returnAmount)}{" "}
              {symbolFor(trade.askDenom)}
            </div>
            <div className="flex items-center gap-2 text-[#FF5C5C] font-semibold text-base leading-tight">
              <Image
                src={getTokenIcon(trade.offerDenom)}
                alt={symbolFor(trade.offerDenom)}
                width={16}
                height={16}
                className="w-4 h-4 rounded-full"
                unoptimized
              />
              -{formatRecentTradeAmount(trade.offerAmount)}{" "}
              {symbolFor(trade.offerDenom)}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-sm font-mono text-gray-400">
          <div className="flex items-center gap-2">
            {trade.signer ? (
              <Link
                href={`https://zigscan.org/address/${trade.signer}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white hover:text-[#1EA76D]"
              >
                {shortAddress}
              </Link>
            ) : (
              shortAddress
            )}
            {trade.signer && (
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleWalletNavigate(trade.signer);
                  }}
                  className="p-1 rounded-full bg-white/5 hover:bg-white/20"
                  aria-label="Search wallet"
                >
                  <Search className="w-3 h-3 text-gray-200" />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleAddressFilter(trade.signer);
                  }}
                  className="p-1 rounded-full bg-white/5 hover:bg-white/20"
                  aria-label={
                    appliedAddressFilter === trade.signer
                      ? "Clear signer filter"
                      : "Filter by signer"
                  }
                >
                  {appliedAddressFilter === trade.signer ? (
                    <X className="w-3 h-3 text-white" />
                  ) : (
                    <Filter className="w-3 h-3 text-gray-200" />
                  )}
                </button>
              </>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-sm font-mono text-gray-400">
          {trade.txHash ? (
            <Link
              href={`https://zigscan.org/tx/${trade.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:text-[#1EA76D]"
            >
              {shortTx}
            </Link>
          ) : (
            shortTx
          )}
        </td>
        <td className="px-4 py-3 text-center">
          {trade.txHash ? (
            <Link
              href={`https://zigscan.org/tx/${trade.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/10 transition-colors"
              title="View on Explorer"
            >
              <Image
                src={explorer}
                alt="View on Explorer"
                width={16}
                height={16}
                className="w-4 h-4"
                unoptimized
              />
            </Link>
          ) : (
            <span className="text-gray-500">—</span>
          )}
        </td>
      </tr>
    );
  };

  waterfallRefs.current = [];

  return (
    <div
      className="border-b border-x border-[#808080]/20 rounded-b-md overflow-hidden shadow-md w-full"
      style={{
        backgroundImage: `linear-gradient(120deg,#000000 45%,#14624F 100%)`,
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
      }}
    >
      <svg className="sr-only" aria-hidden="true">
        <filter id="liquid-filter">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.02"
            numOctaves="3"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="0"
            xChannelSelector="R"
            yChannelSelector="G"
            id="liquid-map"
          />
        </filter>
      </svg>
      {/* Filter Buttons */}
      {activeTab === "Trade History" && (
        <div className="flex flex-wrap gap-2 mb-4 p-4">
          <button
            onClick={() => setActiveFilter(null)}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              activeFilter === null
                ? "bg-[#1EA76D] text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            All Trades ({trades.length})
          </button>
          <button
            onClick={() => setActiveFilter("whale")}
            className={`px-3 py-1 rounded-lg text-sm font-medium flex items-center gap-1 transition-colors ${
              activeFilter === "whale"
                ? "bg-blue-900/50 text-blue-300"
                : "bg-gray-800 text-blue-400 hover:bg-gray-700"
            }`}
          >
            🐋 Whale ({whaleCount})
          </button>
          <button
            onClick={() => setActiveFilter("shark")}
            className={`px-3 py-1 rounded-lg text-sm font-medium flex items-center gap-1 transition-colors ${
              activeFilter === "shark"
                ? "bg-red-900/50 text-red-300"
                : "bg-gray-800 text-red-400 hover:bg-gray-700"
            }`}
          >
            🦈 Shark ({sharkCount})
          </button>
          <button
            onClick={() => setActiveFilter("shrimp")}
            className={`px-3 py-1 rounded-lg text-sm font-medium flex items-center gap-1 transition-colors ${
              activeFilter === "shrimp"
                ? "bg-yellow-900/50 text-yellow-300"
                : "bg-gray-800 text-yellow-400 hover:bg-gray-700"
            }`}
          >
            🦐 Shrimp ({shrimpCount})
          </button>
        </div>
      )}
      {/* Table */}
      <div className="relative overflow-x-auto overflow-visible">
        <table className="relative z-10 w-full text-base sm:text-[1rem] text-white">
          <thead className="bg-black/60 text-white uppercase text-sm tracking-wider">
            <tr>
              <td className="px-4 py-2 text-left text-gray-400">Time</td>
              <td className="px-4 py-2 text-left text-gray-400">Type</td>
              <td className="px-4 py-2 text-left text-gray-400">Price</td>
              <td className="px-4 py-2 text-left text-gray-400">Value</td>
              <td className="px-4 py-2 text-left text-gray-400">Amount</td>
              <td className="px-4 py-2">
                <div className="flex items-center gap-1 text-gray-400">
                  <span className="flex items-center gap-1 text-sm">
                    By address
                    <Search className="h-3 w-3 text-gray-500" />
                  </span>
                  {/* <Filter className="w-4 h-4 text-gray-500" />
                  {appliedAddressFilter && (
                    <>
                      <span className="text-[11px] text-[#42F5C3]">
                        {shortenAddress(appliedAddressFilter)}
                      </span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (onSignerFilterChange) {
                            onSignerFilterChange(null);
                            lastFilterSummaryRef.current = null;
                          }
                          if (filteredSigner === undefined) {
                            setInternalAddressFilter(null);
                          }
                        }}
                        className="p-0.5 rounded-full bg-white/10 hover:bg-white/20"
                        aria-label="Clear address filter"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </>
                  )} */}
                </div>
              </td>
              <td className="px-4 py-2 text-left text-gray-400">Transaction</td>
              <td className="px-4 py-2 text-left text-gray-400">Action</td>
            </tr>
          </thead>

          <tbody ref={listRef} className="bg-black/30">
            {loading ? (
              [...Array(10)].map((_, i) => (
                <tr key={i} className="border-b border-gray-800 animate-pulse">
                  <td className="px-3 sm:px-4 py-3">
                    <div className="h-4 bg-gray-700 rounded w-16" />
                  </td>
                  <td className="px-3 sm:px-4 py-3">
                    <div className="h-6 bg-gray-700 rounded w-12" />
                  </td>
                  <td className="px-3 sm:px-4 py-3">
                    <div className="h-4 bg-gray-700 rounded w-20" />
                  </td>
                  <td className="px-3 sm:px-4 py-3">
                    <div className="h-4 bg-gray-700 rounded w-16" />
                  </td>
                  <td className="px-3 sm:px-4 py-3">
                    <div className="h-8 bg-gray-700 rounded w-24" />
                  </td>
                  <td className="px-3 sm:px-4 py-3">
                    <div className="h-4 bg-gray-700 rounded w-20" />
                  </td>
                  <td className="px-3 sm:px-4 py-3">
                    <div className="h-4 bg-gray-700 rounded w-16" />
                  </td>
                  <td className="px-3 sm:px-4 py-3">
                    <div className="h-4 bg-gray-700 rounded w-16" />
                  </td>
                </tr>
              ))
            ) : activeTab === "Trade History" && processedTrades.length > 0 ? (
              processedTrades
                .slice(
                  (currentPage - 1) * tradesPerPage,
                  currentPage * tradesPerPage
                )
                .map((trade, index) => renderTradeRow(trade, index))
            ) : (
              <tr>
                <td colSpan={8} className="text-center  text-gray-500 py-6">
                  {activeTab === "Trade History"
                    ? "No recent trades"
                    : `No data available for ${activeTab}`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex flex-col sm:flex-row justify-end items-center px-4 py-2 text-white text-sm bg-black/40">
        <div className="flex items-center gap-1 mb-2 sm:mb-0">
          <button
            onClick={() => handlePageChange(1)}
            disabled={currentPage === 1}
            className="px-2 py-1 rounded disabled:opacity-50"
          >
            ⏮
          </button>
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-2 py-1 rounded disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="mx-2">
            Page {currentPage} of{" "}
            {Math.ceil(processedTrades.length / tradesPerPage) || 1}
          </span>
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={
              currentPage >= Math.ceil(processedTrades.length / tradesPerPage)
            }
            className="px-2 py-1 rounded disabled:opacity-50"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() =>
              handlePageChange(
                Math.ceil(processedTrades.length / tradesPerPage)
              )
            }
            disabled={
              currentPage >= Math.ceil(processedTrades.length / tradesPerPage)
            }
            className="px-2 py-1 rounded disabled:opacity-50"
          >
            ⏭
          </button>
        </div>
      </div>
      <div className="relative" ref={filterDropdownRef}>
        {showFilterDropdown && (
          <div className="absolute right-0 z-10 w-40 mt-1 origin-top-right bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg">
            <div className="py-1">
              <button
                onClick={() => {
                  setActiveFilter(null);
                  setShowFilterDropdown(false);
                }}
                className={`block w-full px-4 py-2 text-sm text-left ${
                  !activeFilter ? "bg-gray-100 dark:bg-gray-700" : ""
                }`}
              >
                All Trades
              </button>
              <button
                onClick={() => {
                  setActiveFilter("whale");
                  setShowFilterDropdown(false);
                }}
                className={`block w-full px-4 py-2 text-sm text-left ${
                  activeFilter === "whale" ? "bg-gray-100 dark:bg-gray-700" : ""
                }`}
              >
                🐋 Whales
              </button>
              <button
                onClick={() => {
                  setActiveFilter("shark");
                  setShowFilterDropdown(false);
                }}
                className={`block w-full px-4 py-2 text-sm text-left ${
                  activeFilter === "shark" ? "bg-gray-100 dark:bg-gray-700" : ""
                }`}
              >
                🦈 Sharks
              </button>
              <button
                onClick={() => {
                  setActiveFilter("shrimp");
                  setShowFilterDropdown(false);
                }}
                className={`block w-full px-4 py-2 text-sm text-left ${
                  activeFilter === "shrimp"
                    ? "bg-gray-100 dark:bg-gray-700"
                    : ""
                }`}
              >
                🦐 Shrimps
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecentTrades;
