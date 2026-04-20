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
import { API_BASE_URL, API_HEADERS } from "@/lib/api";
import { useRouter } from "next/navigation";
import { isIbcDenom } from "@/lib/token-routing";

const API_BASE = API_BASE_URL;
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
  offerSymbol?: string;
  offerImage?: string;
  offerAmount: number; // human amount
  askDenom: string;
  askSymbol?: string;
  askImage?: string;
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
  tokenNumericId?: string | number | null;
  pairContract?: string | null;
  selectedPair?: {
    baseSymbol?: string | null;
    quoteSymbol?: string | null;
    baseDenom?: string | null;
    quoteDenom?: string | null;
    pairContract?: string | null;
    poolId?: string | null;
  } | null;
  usePoolTrades?: boolean;
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

const PAIR_CONTRACT_POOL_IDS: Record<string, string> = {
  zig1h72z8ptvcdqvuvy2lqanupwtextjmjmktj2ejgne2padxk0z8zds48shzq: "5",
  zig1jv7v8an78vwyfx409nvrguktz8dl97hg7v0qs59pnc9krlf4en8szqsq8h: "10",
  zig1f2jt3f9gzajp5uupeq6xm20h90uzy6l8klvrx52ujaznc8xu8d7sfnrd87: "12",
};

const isZigAsset = (value?: string | null) => {
  const normalized = normalizeTokenRef(value ?? undefined);
  return normalized === "zig" || normalized === "uzig";
};

const isLikelyPairContract = (value?: string | null) =>
  normalizeTokenRef(value ?? undefined).startsWith("zig1");

const extractTokenRef = (value?: string | null) => {
  const normalized = (value ?? "").trim();
  if (!normalized) return "";
  if (isIbcDenom(normalized)) return normalized;
  const last = normalized.split(".").pop() || normalized;
  if (last === "stzig") return "stzig";
  if (last === "zig") return "zig";
  if (last === "uzig") return "uzig";
  return last || normalized;
};

const getKnownPoolIdForPairContract = (pairContract?: string | null) => {
  const normalized = normalizeTokenRef(pairContract ?? undefined);
  return normalized ? PAIR_CONTRACT_POOL_IDS[normalized] ?? null : null;
};

const getPoolIdFromPool = (pool: any): string | null => {
  const candidates = [
    pool?.poolId,
    pool?.pool_id,
    pool?.poolID,
    pool?.poolIdNumber,
    pool?.pool_id_number,
    pool?.pool_id_numeric,
    pool?.poolIdNumeric,
    pool?.id,
    pool?.pool?.poolIdNumber,
    pool?.pool?.pool_id_number,
    pool?.pool?.pool_id_numeric,
    pool?.pool?.poolIdNumeric,
    pool?.pool?.poolId,
    pool?.pool?.pool_id,
    pool?.pool?.poolID,
    pool?.pool?.id,
  ];
  const value = candidates.find((candidate) => {
    const normalized = String(candidate ?? "").trim();
    return normalized !== "" && /^[0-9]+$/.test(normalized);
  });
  return value == null ? null : String(value);
};

const getPairContractFromPool = (pool: any): string | null =>
  pool?.pairContract ??
  pool?.pair_contract ??
  pool?.pairContractAddress ??
  pool?.pair_contract_address ??
  pool?.contract ??
  pool?.contractAddress ??
  pool?.contract_address ??
  pool?.address ??
  pool?.poolAddress ??
  pool?.pool_address ??
  pool?.pool?.pairContract ??
  pool?.pool?.pair_contract ??
  pool?.pool?.pairContractAddress ??
  pool?.pool?.pair_contract_address ??
  pool?.pool?.contract ??
  pool?.pool?.contractAddress ??
  pool?.pool?.contract_address ??
  pool?.pool?.address ??
  pool?.pool?.poolAddress ??
  pool?.pool?.pool_address ??
  null;

const extractPools = (payload: any): any[] => {
  const candidates = [
    payload?.data,
    payload?.data?.pools,
    payload?.data?.poolsDetailed,
    payload?.pools,
    payload?.poolsDetailed,
    payload,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
};

const poolMatchesSelectedPair = (
  pool: any,
  selected: {
    baseDenom?: string | null;
    quoteDenom?: string | null;
    baseSymbol?: string | null;
    quoteSymbol?: string | null;
    pairContract?: string | null;
  }
) => {
  const selectedPairContractLc = selected.pairContract?.toLowerCase?.() ?? "";
  const candidatePairContract =
    getPairContractFromPool(pool)?.toLowerCase?.() ?? "";
  if (
    selectedPairContractLc &&
    candidatePairContract &&
    candidatePairContract === selectedPairContractLc
  ) {
    return true;
  }

  const selectedBaseDenomLc = selected.baseDenom?.toLowerCase?.() ?? "";
  const selectedQuoteDenomLc = selected.quoteDenom?.toLowerCase?.() ?? "";
  const selectedBaseSymbolLc = selected.baseSymbol?.toLowerCase?.() ?? "";
  const selectedQuoteSymbolLc = selected.quoteSymbol?.toLowerCase?.() ?? "";
  const candidateBaseDenom = pool?.base?.denom?.toLowerCase?.() ?? "";
  const candidateQuoteDenom = pool?.quote?.denom?.toLowerCase?.() ?? "";
  const candidateBaseSymbol = pool?.base?.symbol?.toLowerCase?.() ?? "";
  const candidateQuoteSymbol = pool?.quote?.symbol?.toLowerCase?.() ?? "";

  const baseForward = selectedBaseDenomLc
    ? candidateBaseDenom === selectedBaseDenomLc
    : selectedBaseSymbolLc
    ? candidateBaseSymbol === selectedBaseSymbolLc
    : false;
  const quoteForward = selectedQuoteDenomLc
    ? candidateQuoteDenom === selectedQuoteDenomLc
    : selectedQuoteSymbolLc
    ? candidateQuoteSymbol === selectedQuoteSymbolLc
    : false;

  const baseReverse = selectedBaseDenomLc
    ? candidateQuoteDenom === selectedBaseDenomLc
    : selectedBaseSymbolLc
    ? candidateQuoteSymbol === selectedBaseSymbolLc
    : false;
  const quoteReverse = selectedQuoteDenomLc
    ? candidateBaseDenom === selectedQuoteDenomLc
    : selectedQuoteSymbolLc
    ? candidateBaseSymbol === selectedQuoteSymbolLc
    : false;

  return (baseForward && quoteForward) || (baseReverse && quoteReverse);
};

const buildPoolsLookupUrl = (tokenRef: string) =>
  `${API_BASE}/tokens/${encodeURIComponent(tokenRef)}/pools?includeAllSides=1`;

const buildTokenDetailsLookupUrl = (tokenRef: string) =>
  `${API_BASE}/tokens/${encodeURIComponent(
    tokenRef
  )}?priceSource=best&includePools=1`;

const numericField = (...values: unknown[]) => {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
};

const imageField = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
};

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
  const offerAmount = numericField(
    trade.offerAmount,
    trade.offer_amount,
    trade.offer_amount_human
  );
  const returnAmount = numericField(
    trade.returnAmount,
    trade.return_amount,
    trade.askAmount,
    trade.ask_amount
  );
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
    offerSymbol: trade.offerSymbol ?? trade.offer_symbol ?? undefined,
    offerImage: imageField(
      trade.offerImage,
      trade.offer_image,
      trade.offerIcon,
      trade.offer_icon,
      trade.offerLogo,
      trade.offer_logo,
      trade.offerImageUri,
      trade.offer_image_uri,
      trade.offerImageUrl,
      trade.offer_image_url,
      trade.offer?.imageUri,
      trade.offer?.icon,
      trade.offer?.logo,
      trade.offer?.image
    ),
    offerAmount,
    askDenom: trade.askDenom ?? trade.ask_denom ?? "",
    askSymbol: trade.askSymbol ?? trade.ask_symbol ?? undefined,
    askImage: imageField(
      trade.askImage,
      trade.ask_image,
      trade.askIcon,
      trade.ask_icon,
      trade.askLogo,
      trade.ask_logo,
      trade.askImageUri,
      trade.ask_image_uri,
      trade.askImageUrl,
      trade.ask_image_url,
      trade.ask?.imageUri,
      trade.ask?.icon,
      trade.ask?.logo,
      trade.ask?.image
    ),
    returnAmount,
    valueNative: numericField(
      trade.valueNative,
      trade.value_native,
      trade.valueNativeAmount,
      trade.value_native_amount
    ),
    valueUsd: numericField(
      trade.valueUsd,
      trade.value_usd,
      trade.valueUSD,
      trade.value_in_usd
    ),
    priceUsd: numericField(
      trade.priceUsd,
      trade.price_usd,
      trade.priceUSD,
      trade.price_in_usd
    ),
    priceInZig: numericField(
      trade.priceNative,
      trade.price_native,
      trade.priceInNative,
      trade.price_in_zig,
      trade.priceInZig
    ),
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
    const res = await fetchApi(`${API_BASE}/tokens/${encodeURIComponent(tokenId)}`);
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
const preloadTokenData = async (tokenIds: string[], limit = 20) => {
  const unique = Array.from(new Set(tokenIds))
    .map((tokenId) => tokenId.replace(/^ibc\/\w+\//, "").toLowerCase())
    .filter(Boolean)
    .slice(0, limit);

  const tasks = unique.map(async (cleaned) => {
    const cached = getCachedTokenData(cleaned);
    if (!cached) {
      await fetchTokenMeta(cleaned);
    }
  });

  await Promise.allSettled(tasks);
};

function TradeTokenImage({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/10 text-[7px] font-bold text-gray-400">
        {alt.slice(0, 2).toUpperCase()}
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={16}
      height={16}
      className="w-4 h-4 rounded-full"
      unoptimized
      onError={() => setFailed(true)}
    />
  );
}

const RecentTrades: React.FC<RecentTradesProps> = ({
  tokenId,
  tokenNumericId,
  pairContract,
  selectedPair,
  usePoolTrades = false,
  filteredSigner,
  onSignerFilterChange,
}) => {
  const router = useRouter();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("Trade History");
  const isMounted = useRef(true);
  const [poolId, setPoolId] = useState<string | null>(null);
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
  const fetchRunIdRef = useRef(0);
  const tradesLengthRef = useRef(0);

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
      const offerAmountRaw = numericField(
        tradeData.offer_amount_base,
        tradeData.offerAmountBase,
        tradeData.offer_amount,
        tradeData.offerAmount
      );
      const returnAmountRaw = numericField(
        tradeData.return_amount_base,
        tradeData.returnAmountBase,
        tradeData.return_amount,
        tradeData.returnAmount
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

      const priceInZig = numericField(
        tradeData.priceNative,
        tradeData.price_native,
        tradeData.priceInNative,
        tradeData.price_in_zig,
        tradeData.priceInZig
      );
      const zigUsdAtTrade = numericField(
        tradeData.zig_usd_at_trade,
        tradeData.zigUsdAtTrade
      );
      let priceUsd = numericField(
        tradeData.priceUsd,
        tradeData.price_usd,
        tradeData.priceUSD,
        tradeData.price_in_usd,
        tradeData.priceInUsd
      );
      if (!priceUsd && priceInZig && zigUsdAtTrade) {
        priceUsd = priceInZig * zigUsdAtTrade;
      }

      let valueUsd = numericField(
        tradeData.valueUsd,
        tradeData.value_usd,
        tradeData.valueUSD,
        tradeData.value_in_usd
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
        offerSymbol:
          tradeData.offerSymbol ??
          tradeData.offer_symbol ??
          tradeData.offer_asset_symbol ??
          tradeData.offer?.symbol ??
          undefined,
        offerImage: imageField(
          tradeData.offerImage,
          tradeData.offer_image,
          tradeData.offerIcon,
          tradeData.offer_icon,
          tradeData.offerLogo,
          tradeData.offer_logo,
          tradeData.offerImageUri,
          tradeData.offer_image_uri,
          tradeData.offerImageUrl,
          tradeData.offer_image_url,
          tradeData.offer_asset_image,
          tradeData.offerAssetImage,
          tradeData.offer?.imageUri,
          tradeData.offer?.image,
          tradeData.offer?.icon,
          tradeData.offer?.logo
        ),
        offerAmount,
        askDenom,
        askSymbol:
          tradeData.askSymbol ??
          tradeData.ask_symbol ??
          tradeData.ask_asset_symbol ??
          tradeData.ask?.symbol ??
          undefined,
        askImage: imageField(
          tradeData.askImage,
          tradeData.ask_image,
          tradeData.askIcon,
          tradeData.ask_icon,
          tradeData.askLogo,
          tradeData.ask_logo,
          tradeData.askImageUri,
          tradeData.ask_image_uri,
          tradeData.askImageUrl,
          tradeData.ask_image_url,
          tradeData.ask_asset_image,
          tradeData.askAssetImage,
          tradeData.ask?.imageUri,
          tradeData.ask?.image,
          tradeData.ask?.icon,
          tradeData.ask?.logo
        ),
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

  const resolvedTokenId = pairContract || tokenId || null;
  const resolvedNumericTokenId =
    tokenNumericId != null && String(tokenNumericId).trim() !== ""
      ? String(tokenNumericId).trim()
      : tokenId && /^[0-9]+$/.test(String(tokenId).trim())
      ? String(tokenId).trim()
      : null;
  const selectedPairContract =
    selectedPair?.pairContract ||
    (isLikelyPairContract(selectedPair?.quoteDenom)
      ? selectedPair?.quoteDenom
      : null) ||
    (isLikelyPairContract(selectedPair?.baseDenom)
      ? selectedPair?.baseDenom
      : null);
  const selectedBaseDenom = isLikelyPairContract(selectedPair?.baseDenom)
    ? null
    : selectedPair?.baseDenom;
  const selectedQuoteDenom = isLikelyPairContract(selectedPair?.quoteDenom)
    ? null
    : selectedPair?.quoteDenom;
  const selectedKnownPoolId = getKnownPoolIdForPairContract(selectedPairContract);
  const selectedPairWithZig =
    isZigAsset(selectedPair?.baseSymbol) ||
    isZigAsset(selectedPair?.quoteSymbol) ||
    isZigAsset(selectedBaseDenom) ||
    isZigAsset(selectedQuoteDenom);
  const hasNonZigPairDenoms = Boolean(selectedBaseDenom && selectedQuoteDenom);
  const shouldUsePoolPricing =
    !selectedPairWithZig &&
    Boolean(
      selectedPair?.poolId ||
        selectedKnownPoolId ||
        hasNonZigPairDenoms ||
        selectedPairContract
    );
  const activePoolId = selectedKnownPoolId ?? selectedPair?.poolId ?? poolId;
  const isPoolTradeContext = Boolean(
    usePoolTrades &&
      selectedPair &&
      (selectedPair.poolId ||
        selectedKnownPoolId ||
        hasNonZigPairDenoms ||
        selectedPairContract ||
        selectedPair.baseSymbol ||
        selectedPair.baseDenom)
  );
  const shouldUsePoolTrades = Boolean(isPoolTradeContext && activePoolId);
  const tradesTokenRef =
    extractTokenRef(selectedBaseDenom) ||
    extractTokenRef(resolvedTokenId) ||
    extractTokenRef(selectedPair?.baseSymbol) ||
    "";

  useEffect(() => {
    // console.info("[RecentTrades] pool id context", {
    //   usePoolTrades,
    //   isPoolTradeContext,
    //   shouldUsePoolTrades,
    //   activePoolId,
    //   statePoolId: poolId,
    //   selectedPairPoolId: selectedPair?.poolId ?? null,
    //   selectedKnownPoolId,
    //   selectedPairContract,
    //   selectedBaseDenom,
    //   selectedQuoteDenom,
    //   tokenId,
    //   resolvedTokenId,
    //   resolvedNumericTokenId,
    // });
  }, [
    activePoolId,
    isPoolTradeContext,
    poolId,
    resolvedNumericTokenId,
    resolvedTokenId,
    selectedBaseDenom,
    selectedKnownPoolId,
    selectedPair?.poolId,
    selectedPairContract,
    selectedQuoteDenom,
    shouldUsePoolTrades,
    tokenId,
    usePoolTrades,
  ]);

  const buildPoolTradesUrl = useCallback(
    (poolIdValue: string, options: { tf?: string; limit?: number } = {}) => {
      const tf = options.tf ?? "60d";
      const limit = options.limit ?? 500;
      return `${API_BASE}/trades/pool/${encodeURIComponent(
        poolIdValue
      )}?tf=${encodeURIComponent(tf)}&limit=${limit}`;
    },
    []
  );

  const buildTokenTradesUrl = useCallback(
    (tokenRef: string, options: { tf?: string; limit?: number } = {}) => {
      const tf = options.tf ?? "30d";
      const limit = options.limit ?? 500;
      let url = `${API_BASE}/trades/token/${encodeURIComponent(
        tokenRef
      )}?tf=${encodeURIComponent(tf)}&unit=usd&limit=${limit}`;
      if (shouldUsePoolPricing && activePoolId) {
        url += `&priceSource=pool&poolId=${encodeURIComponent(
          activePoolId
        )}&dominant=quote&view=auto`;
      }
      return url;
    },
    [activePoolId, shouldUsePoolPricing]
  );

  const isTradeForSelectedToken = useCallback(
    (rawItem: any, trade: Trade) => {
      if (!resolvedTokenId) return false;

      const selected = normalizeTokenRef(resolvedTokenId);
      if (!selected) return false;

      const tradeData = unwrapTradePayload(rawItem) ?? rawItem ?? {};
      const candidates = [
        resolvedTokenId,
        selected,
        resolvedTokenId.split(".").pop() || resolvedTokenId,
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
        normalizeTokenRef(resolvedTokenId.split(".").pop() || resolvedTokenId),
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
    [resolvedTokenId]
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

  const resolveDirectPoolIdFromToken = useCallback(async (): Promise<string | null> => {
    if (!resolvedNumericTokenId) return null;
    try {
      const tokenDetailsResponse = await fetchApi(
        buildTokenDetailsLookupUrl(resolvedNumericTokenId),
        { cache: "no-store" }
      );
      if (!tokenDetailsResponse.ok) return null;
      const tokenDetailsJson = await tokenDetailsResponse.json();
      const tokenDetail = tokenDetailsJson?.data ?? {};
      const directPoolId =
        getPoolIdFromPool(tokenDetail) ||
        getPoolIdFromPool(tokenDetail?.price) ||
        (tokenDetail?.poolId != null ? String(tokenDetail.poolId) : null) ||
        (tokenDetail?.pool_id != null ? String(tokenDetail.pool_id) : null) ||
        (tokenDetail?.price?.poolId != null
          ? String(tokenDetail.price.poolId)
          : null) ||
        (tokenDetail?.price?.pool_id != null
          ? String(tokenDetail.price.pool_id)
          : null);

      // console.info("[RecentTrades] direct token pool lookup", {
      //   tokenNumericId: resolvedNumericTokenId,
      //   directPoolId,
      //   pairContract:
      //     tokenDetail?.pairContract ??
      //     tokenDetail?.pair_contract ??
      //     tokenDetail?.price?.pairContract ??
      //     tokenDetail?.price?.pair_contract,
      // });

      return directPoolId;
    } catch (error) {
      console.error("[RecentTrades] direct token pool lookup failed", error);
      return null;
    }
  }, [resolvedNumericTokenId]);

  const resolveSelectedPairPoolId = useCallback(async (): Promise<string | null> => {
    if (!selectedPairContract && !selectedBaseDenom && !selectedPair?.baseSymbol) {
      return null;
    }

    const lookupCandidates = Array.from(
      new Set(
        [
          selectedBaseDenom,
          selectedPair?.baseSymbol,
          resolvedTokenId && resolvedTokenId !== pairContract
            ? resolvedTokenId
            : null,
          tokenId,
        ]
          .map((value) => String(value ?? "").trim())
          .filter(Boolean)
      )
    );

    for (const lookup of lookupCandidates) {
      try {
        const response = await fetchApi(buildPoolsLookupUrl(lookup), {
          cache: "no-store",
        });
        if (!response.ok) continue;
        const json = await response.json();
        const pools = extractPools(json);
        const pool = pools.find((candidate) =>
          poolMatchesSelectedPair(candidate, {
            baseDenom: selectedBaseDenom,
            quoteDenom: selectedQuoteDenom,
            baseSymbol: selectedPair?.baseSymbol,
            quoteSymbol: selectedPair?.quoteSymbol,
            pairContract: selectedPairContract,
          })
        );
        const matchedPoolId =
          getPoolIdFromPool(pool) ||
          getKnownPoolIdForPairContract(getPairContractFromPool(pool));
        if (matchedPoolId) {
          // console.info("[RecentTrades] selected pair pool resolved", {
          //   lookup,
          //   selectedPairContract,
          //   matchedPoolId,
          // });
          return String(matchedPoolId);
        }
        // console.info("[RecentTrades] selected pair pool no match", {
        //   lookup,
        //   selectedPairContract,
        //   selectedBaseDenom,
        //   selectedQuoteDenom,
        //   selectedBaseSymbol: selectedPair?.baseSymbol,
        //   selectedQuoteSymbol: selectedPair?.quoteSymbol,
        //   candidates: pools.slice(0, 12).map((candidate) => ({
        //     poolId: getPoolIdFromPool(candidate),
        //     pairContract: getPairContractFromPool(candidate),
        //     baseDenom: candidate?.base?.denom,
        //     quoteDenom: candidate?.quote?.denom,
        //     baseSymbol: candidate?.base?.symbol,
        //     quoteSymbol: candidate?.quote?.symbol,
        //   })),
        // });
      } catch (error) {
        console.error("[RecentTrades] selected pair pool lookup failed", {
          lookup,
          error,
        });
      }
    }

    return null;
  }, [
    pairContract,
    resolvedTokenId,
    selectedBaseDenom,
    selectedPair?.baseSymbol,
    selectedPair?.quoteSymbol,
    selectedPairContract,
    selectedQuoteDenom,
    tokenId,
  ]);

  const fetch24hTradesFromApi = useCallback(async (): Promise<Trade[]> => {
    if (shouldUsePoolTrades && activePoolId) {
      try {
        const response = await fetchApi(
          buildPoolTradesUrl(activePoolId, { tf: "60d", limit: 500 }),
          { cache: "no-store" }
        );
        if (!response.ok) return [];
        const data = await response.json();
        if (!data?.success || !Array.isArray(data.data)) return [];
        const cutoff = Date.now() - TRADE_LOOKBACK_MS;
        return data.data
          .map(mapApiTradeToLocal)
          .filter((trade: { time: string }) => {
            const ts = Date.parse(trade.time);
            return Number.isFinite(ts) && ts >= cutoff;
          })
          .slice(0, MAX_TRADES);
      } catch (error) {
        console.error("Error fetching pool trades:", error);
        return [];
      }
    }
    if (!resolvedTokenId) return [];

    const candidates = Array.from(
      new Set([
        resolvedTokenId,
        resolvedTokenId.split(".").pop() || resolvedTokenId,
        resolvedTokenId.toUpperCase(),
      ])
    ).filter(Boolean);

    try {
      for (const candidate of candidates) {
        const response = await fetchApi(
          buildTokenTradesUrl(candidate, { tf: "30d", limit: 500 }),
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

      const resolvedSymbol = await resolveSymbolFromTokenId(resolvedTokenId);
      if (resolvedSymbol) {
        const response = await fetchApi(
          buildTokenTradesUrl(resolvedSymbol, { tf: "7d", limit: 500 }),
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
  }, [
    activePoolId,
    buildPoolTradesUrl,
    buildTokenTradesUrl,
    resolvedTokenId,
    resolveSymbolFromTokenId,
    shouldUsePoolTrades,
    tradesTokenRef,
  ]);

  const fetchTokenTradesBatch = useCallback(async (): Promise<Trade[]> => {
    if (!resolvedTokenId) return [];

    const candidates = Array.from(
      new Set([
        resolvedTokenId,
        selectedBaseDenom,
        tradesTokenRef,
        resolvedTokenId.split(".").pop() || resolvedTokenId,
        resolvedTokenId.toUpperCase(),
      ])
    ).filter(Boolean) as string[];

    for (const candidate of candidates) {
      try {
        const response = await fetchApi(
          buildTokenTradesUrl(candidate, { tf: "30d", limit: 500 }),
          { cache: "no-store" }
        );
        if (!response.ok) continue;
        const data = await response.json();
        if (!data?.success || !Array.isArray(data.data) || !data.data.length) {
          continue;
        }
        return data.data.map(mapApiTradeToLocal).slice(0, MAX_TRADES);
      } catch (error) {
        console.error("[RecentTrades] token batch fetch failed", {
          candidate,
          error,
        });
      }
    }

    const resolvedSymbol = await resolveSymbolFromTokenId(resolvedTokenId);
    if (resolvedSymbol) {
      try {
        const response = await fetchApi(
          buildTokenTradesUrl(resolvedSymbol, { tf: "30d", limit: 500 }),
          { cache: "no-store" }
        );
        if (response.ok) {
          const data = await response.json();
          if (data?.success && Array.isArray(data.data) && data.data.length) {
            return data.data.map(mapApiTradeToLocal).slice(0, MAX_TRADES);
          }
        }
      } catch (error) {
        console.error("[RecentTrades] symbol batch fetch failed", error);
      }
    }

    return [];
  }, [
    buildTokenTradesUrl,
    resolvedTokenId,
    resolveSymbolFromTokenId,
    selectedBaseDenom,
    tradesTokenRef,
  ]);

  // Fetch initial batch of trades
  const fetchInitialTrades = useCallback(async () => {
    const runId = ++fetchRunIdRef.current;
    const applyBatch = (rows: Trade[]) => {
      if (fetchRunIdRef.current !== runId || !rows.length) return;
      setTrades(rows.slice(0, MAX_TRADES));
      setLastUpdated(new Date());
      initialLoadDone.current = true;
      setLoading(false);
    };

    if (isPoolTradeContext) {
      setLoading(tradesLengthRef.current === 0);
      if (!activePoolId) {
        void fetchTokenTradesBatch().then(applyBatch);
      }
      try {
        const effectivePoolId =
          activePoolId ||
          (await resolveSelectedPairPoolId()) ||
          (selectedPairContract ? null : await resolveDirectPoolIdFromToken());
        if (effectivePoolId && effectivePoolId !== activePoolId) {
          setPoolId(effectivePoolId);
        }
        if (!effectivePoolId) {
          const fallbackTrades = await fetchTokenTradesBatch();
          applyBatch(fallbackTrades);
          return;
        }
        const response = await fetchApi(
          buildPoolTradesUrl(effectivePoolId, { tf: "60d", limit: 500 }),
          { cache: "no-store" }
        );
        if (!response.ok) throw new Error("Failed to fetch pool trades");
        const data = await response.json();
        if (data?.success && Array.isArray(data.data)) {
          const mappedTrades = data.data.map(mapApiTradeToLocal);
          applyBatch(mappedTrades);
        }
      } catch (error) {
        console.error("Error fetching initial pool trades:", error);
        const fallbackTrades = await fetchTokenTradesBatch();
        applyBatch(fallbackTrades);
      } finally {
        if (fetchRunIdRef.current === runId) setLoading(false);
      }
      return;
    }
    if (!resolvedTokenId) return;

    setLoading(tradesLengthRef.current === 0);
    try {
      const mappedTrades = await fetchTokenTradesBatch();
      applyBatch(mappedTrades);
    } catch (error) {
      console.error("Error fetching initial trades:", error);
    } finally {
      if (fetchRunIdRef.current === runId) setLoading(false);
    }
  }, [
    activePoolId,
    buildPoolTradesUrl,
    fetchTokenTradesBatch,
    isPoolTradeContext,
    resolvedTokenId,
    resolveDirectPoolIdFromToken,
    resolveSelectedPairPoolId,
    selectedPairContract,
    tradesTokenRef,
  ]);

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
      if (shouldUsePoolPricing && selectedKnownPoolId) {
        setPoolId(selectedKnownPoolId);
        return;
      }

      if (
        !resolvedTokenId &&
        !selectedPair?.baseSymbol &&
        !selectedPair?.baseDenom
      ) {
        setLoading(false);
        return;
      }
      if (
        !tokenId &&
        !selectedPair?.baseSymbol &&
        !selectedBaseDenom &&
        pairContract
      ) {
        setPoolId(pairContract);
        setLoading(false);
        return;
      }

      try {
        const tokenIdKey = tokenId ?? null;
        const selectedPairPoolId = await resolveSelectedPairPoolId();
        if (selectedPairPoolId) {
          setPoolId(String(selectedPairPoolId));
          return;
        }
        if (
          !selectedPairContract &&
          resolvedNumericTokenId != null &&
          String(resolvedNumericTokenId).trim() !== ""
        ) {
          const directPoolId = await resolveDirectPoolIdFromToken();
          if (directPoolId) {
            setPoolId(String(directPoolId));
            return;
          }
        }
        if (tokenIdKey != null && String(tokenIdKey).trim() !== "") {
          const tokenIdentity = String(tokenIdKey).trim();
          const tokenDetailsResponse = await fetchApi(
            buildTokenDetailsLookupUrl(tokenIdentity),
            { cache: "no-store" }
          );
          if (tokenDetailsResponse.ok) {
            const tokenDetailsJson = await tokenDetailsResponse.json();
            const tokenDetail = tokenDetailsJson?.data ?? {};
            const tokenCandidates = [
              tokenDetail,
              tokenDetail?.price,
              ...(Array.isArray(tokenDetail?.poolsDetailed)
                ? tokenDetail.poolsDetailed
                : []),
              ...(Array.isArray(tokenDetail?.pools) ? tokenDetail.pools : []),
            ];
            const tokenMatch = tokenCandidates.find((candidate: any) =>
              poolMatchesSelectedPair(candidate, {
                baseDenom: selectedBaseDenom,
                quoteDenom: selectedQuoteDenom,
                baseSymbol: selectedPair?.baseSymbol,
                quoteSymbol: selectedPair?.quoteSymbol,
                pairContract: selectedPairContract,
              })
            );
            const tokenDerivedPoolId = getPoolIdFromPool(tokenMatch);
            // console.info("[RecentTrades] tokenId pool lookup", {
            //   tokenId: tokenIdentity,
            //   resolved: tokenDerivedPoolId,
            //   selectedPairContract,
            //   selectedBaseDenom,
            //   selectedQuoteDenom,
            // });
            if (tokenDerivedPoolId) {
              setPoolId(String(tokenDerivedPoolId));
              return;
            }
          }
        }

        const resolvedKey =
          resolvedTokenId && resolvedTokenId !== pairContract
            ? resolvedTokenId
            : null;
        const baseKey =
          tokenIdKey ||
          selectedBaseDenom ||
          selectedPair?.baseSymbol ||
          resolvedKey ||
          "";
        // console.info("[RecentTrades] resolving pool id", {
        //   baseKey,
        //   tokenId,
        //   pairContract,
        //   resolvedTokenId,
        //   selectedPair: {
        //     poolId: selectedPair?.poolId,
        //     baseSymbol: selectedPair?.baseSymbol,
        //     quoteSymbol: selectedPair?.quoteSymbol,
        //     baseDenom: selectedPair?.baseDenom,
        //     quoteDenom: selectedPair?.quoteDenom,
        //     pairContract: selectedPair?.pairContract,
        //   },
        //   selectedPairContract,
        //   selectedBaseDenom,
        //   selectedQuoteDenom,
        //   shouldUsePoolPricing,
        // });
        const response = await fetchApi(
          buildPoolsLookupUrl(baseKey),
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
        const pools = extractPools(data);
        // console.info("[RecentTrades] pool candidates", {
        //   baseKey,
        //   count: pools.length,
        //   poolCandidates: pools.slice(0, 10).map((pool: any) => ({
        //     poolId:
        //       pool?.poolId ??
        //       pool?.pool_id ??
        //       pool?.poolID ??
        //       pool?.poolIdNumber ??
        //       pool?.id,
        //     pairContract:
        //       getPairContractFromPool(pool),
        //     baseDenom: pool?.base?.denom,
        //     quoteDenom: pool?.quote?.denom,
        //     baseSymbol: pool?.base?.symbol,
        //     quoteSymbol: pool?.quote?.symbol,
        //   })),
        // });
        if (!pools.length) {
          setLoading(false);
          return;
        }
        const pool = selectedPair
          ? pools.find((p: any) =>
              poolMatchesSelectedPair(p, {
                baseDenom: selectedBaseDenom,
                quoteDenom: selectedQuoteDenom,
                baseSymbol: selectedPair?.baseSymbol,
                quoteSymbol: selectedPair?.quoteSymbol,
                pairContract: selectedPairContract,
              })
            )
          : pools?.[0];
        const poolIdValue =
          getPoolIdFromPool(pool) ||
          getKnownPoolIdForPairContract(getPairContractFromPool(pool)) ||
          selectedKnownPoolId ||
          "";

        if (poolIdValue) {
          setPoolId(String(poolIdValue));
        } else {
        console.error("[RecentTrades] no pool id found in pool data", {
          selectedPairContract,
          selectedBaseDenom,
          selectedQuoteDenom,
          candidates: pools.slice(0, 12).map((candidate) => ({
            poolId: getPoolIdFromPool(candidate),
            pairContract: getPairContractFromPool(candidate),
            baseDenom: candidate?.base?.denom,
            quoteDenom: candidate?.quote?.denom,
            baseSymbol: candidate?.base?.symbol,
            quoteSymbol: candidate?.quote?.symbol,
          })),
        });
        setLoading(false);
      }
      } catch (error) {
        console.error("❌ Error fetching pool data:", error);
        setLoading(false);
      }
    };

    fetchPoolData();
  }, [
    pairContract,
    resolvedTokenId,
    resolvedNumericTokenId,
    resolveDirectPoolIdFromToken,
    resolveSelectedPairPoolId,
    selectedBaseDenom,
    selectedKnownPoolId,
    selectedPair?.baseDenom,
    selectedPair?.baseSymbol,
    selectedPair?.pairContract,
    selectedPair?.poolId,
    selectedPair?.quoteDenom,
    selectedPair?.quoteSymbol,
    selectedPairContract,
    selectedQuoteDenom,
    shouldUsePoolPricing,
    tokenId,
  ]);

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
          image?: string;
          imageUrl?: string;
          image_url?: string;
          icon?: string;
          logo?: string;
          logoURI?: string;
          logoUri?: string;
        }> = json?.data ?? [];
        const map: Record<string, string> = {};
        const imageMap: Record<string, string> = {};

        map["uzig"] = "ZIG";
        imageMap["uzig"] = "/zigicon.png";

        for (const it of items) {
          if (it?.denom && it?.symbol) {
            map[it.denom] = it.symbol;
            map[it.denom.toLowerCase()] = it.symbol;
            const icon = imageField(
              it.imageUri,
              it.image,
              it.imageUrl,
              it.image_url,
              it.icon,
              it.logo,
              it.logoURI,
              it.logoUri
            );
            if (icon) {
              imageMap[it.denom] = icon;
              imageMap[it.denom.toLowerCase()] = icon;
            } else {
              imageMap[it.denom] = "/zigicon.png";
              imageMap[it.denom.toLowerCase()] = "/zigicon.png";
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
    if (!trades.length) return;
    const tokenIds = trades.flatMap((trade) => [
      trade.offerDenom.replace(/^ibc\/\w+\//, "").toLowerCase(),
      trade.askDenom.replace(/^ibc\/\w+\//, "").toLowerCase(),
    ]);
    const timeoutId = window.setTimeout(() => {
      preloadTokenData(tokenIds, 20);
    }, 200);
    return () => {
      window.clearTimeout(timeoutId);
    };
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
    tradesLengthRef.current = trades.length;
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
    if (isPoolTradeContext) return;
    if (!resolvedTokenId) return;

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
            token_id: resolvedTokenId, // Assuming the API supports filtering by token_id
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
  }, [
    resolvedTokenId,
    activePoolId,
    fetchInitialTrades,
    isPoolTradeContext,
    markNewTrades,
    isTradeForSelectedToken,
  ]);

  useEffect(() => {
    if (!isPoolTradeContext) return;

    setTrades([]);
    setCurrentPage(1);
    initialLoadDone.current = false;

    fetchInitialTrades();
  }, [activePoolId, fetchInitialTrades, isPoolTradeContext]);

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

  const symbolFor = (denom?: string, explicitSymbol?: string): string => {
    if (explicitSymbol?.trim()) return explicitSymbol.trim().toUpperCase();
    if (!denom) return "";
    const normalized = denom.trim();
    const normalizedLower = normalized.toLowerCase();
    if (normalizedLower === "uzig" || normalizedLower.includes("uzig")) return "ZIG";
    const found = symbolMap[normalized] ?? symbolMap[normalizedLower];
    if (found) return found;
    if (normalizedLower.startsWith("ibc/")) return "IBC";
    const parts = normalized.split(".");
    const last = parts[parts.length - 1] || normalized;
    return last.toUpperCase();
  };

  const getTokenIcon = (denom?: string, explicitImage?: string): string => {
    if (explicitImage?.trim()) return explicitImage.trim();
    if (!denom) return "/zigicon.png";
    const normalized = denom.trim();
    const normalizedLower = normalized.toLowerCase();
    if (normalizedLower === "uzig" || normalizedLower.includes("uzig")) return "/zigicon.png";
    const found = tokenImageMap[normalized] ?? tokenImageMap[normalizedLower];
    if (found) return found;
    const cached =
      getCachedTokenData(normalizedLower) ??
      getCachedTokenData(normalized.replace(/^ibc\/\w+\//, "").toLowerCase());
    if (cached?.icon) return cached.icon;
    const stripped = normalized.replace(/^ibc\/\w+\//, "").toLowerCase();
    if (stripped && stripped !== normalizedLower) {
      const strippedFound = tokenImageMap[stripped];
      if (strippedFound) return strippedFound;
      const strippedCached = getCachedTokenData(stripped);
      if (strippedCached?.icon) return strippedCached.icon;
    }
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
        <td className="px-3 sm:px-4 py-3 text-md sm:text-base lg:text-lg text-gray-400 font-mono whitespace-nowrap">
          {formatTimeAgo(trade.time)}
        </td>
        <td className={`px-3 sm:px-4 py-3 text-md sm:text-base lg:text-lg font-bold ${directionColor} whitespace-nowrap`}>
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
        <td className="px-3 sm:px-4 py-3 text-md sm:text-base lg:text-lg font-mono text-gray-200 whitespace-nowrap">
          <span className={directionColor}>{priceText}</span>
        </td>
        <td className="px-3 sm:px-4 py-3 whitespace-nowrap">
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
        <td className="px-3 sm:px-4 py-3 text-base sm:text-[1.02rem] lg:text-[1.05rem] whitespace-nowrap">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-[#1EA76D] font-medium text-base sm:text-[1.02rem] lg:text-[1.05rem] leading-tight whitespace-nowrap">
              <TradeTokenImage
                src={getTokenIcon(trade.askDenom, trade.askImage)}
                alt={symbolFor(trade.askDenom, trade.askSymbol)}
              />
              +{formatRecentTradeAmount(trade.returnAmount)}{" "}
              {symbolFor(trade.askDenom, trade.askSymbol)}
            </div>
            <div className="flex items-center gap-2 text-[#FF5C5C] font-medium text-base sm:text-[1.02rem] lg:text-[1.05rem] leading-tight whitespace-nowrap">
              <TradeTokenImage
                src={getTokenIcon(trade.offerDenom, trade.offerImage)}
                alt={symbolFor(trade.offerDenom, trade.offerSymbol)}
              />
              -{formatRecentTradeAmount(trade.offerAmount)}{" "}
              {symbolFor(trade.offerDenom, trade.offerSymbol)}
            </div>
          </div>
        </td>
        <td className="px-3 sm:px-4 py-3 text-md sm:text-base lg:text-lg font-mono text-gray-400 whitespace-nowrap">
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
        <td className="px-3 sm:px-4 py-3 text-md sm:text-base lg:text-lg font-mono text-gray-400 whitespace-nowrap">
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
        <td className="px-3 sm:px-4 py-3 text-center whitespace-nowrap">
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
        <div className="mb-4 flex flex-wrap gap-2 p-3 sm:p-4">
          <button
            onClick={() => setActiveFilter(null)}
            className={`rounded-lg px-3 py-1 text-md sm:text-base lg:text-lg font-medium transition-colors ${
              activeFilter === null
                ? "bg-[#1EA76D] text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            All Trades ({trades.length})
          </button>
          <button
            onClick={() => setActiveFilter("whale")}
            className={`flex items-center gap-1 rounded-lg px-3 py-1 text-md sm:text-base lg:text-lg font-medium transition-colors ${
              activeFilter === "whale"
                ? "bg-blue-900/50 text-blue-300"
                : "bg-gray-800 text-blue-400 hover:bg-gray-700"
            }`}
          >
            🐋 Whale ({whaleCount})
          </button>
          <button
            onClick={() => setActiveFilter("shark")}
            className={`flex items-center gap-1 rounded-lg px-3 py-1 text-md sm:text-base lg:text-lg font-medium transition-colors ${
              activeFilter === "shark"
                ? "bg-red-900/50 text-red-300"
                : "bg-gray-800 text-red-400 hover:bg-gray-700"
            }`}
          >
            🦈 Shark ({sharkCount})
          </button>
          <button
            onClick={() => setActiveFilter("shrimp")}
            className={`flex items-center gap-1 rounded-lg px-3 py-1 text-md sm:text-base lg:text-lg font-medium transition-colors ${
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
        <table className="relative z-10 min-w-[1120px] lg:min-w-full w-full text-md sm:text-base lg:text-[1rem] text-white">
          <thead className="bg-black/60 text-white uppercase text-md sm:text-base lg:text-lg tracking-wider">
            <tr>
              <td className="px-3 sm:px-4 py-2 text-left text-gray-400 whitespace-nowrap">Time</td>
              <td className="px-3 sm:px-4 py-2 text-left text-gray-400 whitespace-nowrap">Type</td>
              <td className="px-3 sm:px-4 py-2 text-left text-gray-400 whitespace-nowrap">Price</td>
              <td className="px-3 sm:px-4 py-2 text-left text-gray-400 whitespace-nowrap">Value</td>
              <td className="px-3 sm:px-4 py-2 text-left text-gray-400 whitespace-nowrap">Amount</td>
              <td className="px-3 sm:px-4 py-2 whitespace-nowrap">
                <div className="flex items-center gap-1 text-gray-400">
                  <span className="flex items-center gap-1 text-md sm:text-base lg:text-lg whitespace-nowrap">
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
              <td className="px-3 sm:px-4 py-2 text-left text-gray-400 whitespace-nowrap">Transaction</td>
              <td className="px-3 sm:px-4 py-2 text-left text-gray-400 whitespace-nowrap">Action</td>
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
                    ? "No trades found"
                    : `No data available for ${activeTab}`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex flex-col sm:flex-row justify-end items-center px-3 sm:px-4 py-2 text-white text-md sm:text-base lg:text-lg bg-black/40">
        <div className="flex items-center gap-1 mb-2 sm:mb-0 text-center sm:text-left">
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
                className={`block w-full px-4 py-2 text-lg text-left ${
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
                className={`block w-full px-4 py-2 text-lg text-left ${
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
                className={`block w-full px-4 py-2 text-lg text-left ${
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
                className={`block w-full px-4 py-2 text-lg text-left ${
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
