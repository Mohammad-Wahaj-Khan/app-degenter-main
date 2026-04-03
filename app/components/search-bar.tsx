/* eslint-disable @next/next/no-img-element */
"use client";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { API_BASE_URL, API_HEADERS } from "@/lib/api";

type ResultType = "token";
type SearchResult = {
  id: string;
  name: string;
  symbol?: string;
  denom?: string;
  type: ResultType;
  icon?: string;
  price?: number;
};
interface SearchBarProps {
  onOpen: () => void;
  onClose?: () => void;
  isOpen?: boolean;
  placeholder?: string;
}

interface Token {
  tx: number;
  id: string; // pair_contract
  name: string;
  symbol: string;
  denom: string;
  icon: string | null;
  price: number; // zig price of primary denom
  liquidity: number;
  marketCap: number;
  volume24: number;
  volume24Buy: number;
  volume24Sell: number;
  volume24Pct: number; // ((buy - sell)/(buy+sell))*100
  txCount: number;
}
const formatNum = (n?: number | null, digits = 2) =>
  n == null
    ? "-"
    : Number(n).toLocaleString(undefined, { maximumFractionDigits: digits });

const WALLET_ADDRESS_REGEX = /^zig1[0-9a-z]{30,}$/i;

const isWalletAddress = (value: string) =>
  WALLET_ADDRESS_REGEX.test(value.trim());

const fmtVol = (n = 0) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `$${(n / 1_000).toFixed(1)}K`
    : `$${n.toFixed(2)}`;

const fmtPct = (n = 0) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const POOL_STORE: { loaded: boolean; tokens: Token[] } = {
  loaded: false,
  tokens: [],
};

const STAKED_ZIG_DENOM =
  "coin.zig109f7g2rzl2aqee7z6gffn8kfe9cpqx0mjkk7ethmx8m2hq4xpe9snmaam2.stzig";

const shouldHideMcap = (t: Token) => {
  const symbolLower = (t.symbol || "").toLowerCase();
  const denomLower = (t.denom || "").toLowerCase();
  const idLower = (t.id || "").toLowerCase();
  return (
    symbolLower === "tzig" ||
    denomLower === "tzig" ||
    idLower === "tzig" ||
    denomLower === STAKED_ZIG_DENOM ||
    idLower === STAKED_ZIG_DENOM
  );
};
const API_BASE = API_BASE_URL;

async function fetchAllPoolsOnce(): Promise<Token[]> {
  if (POOL_STORE.loaded) return POOL_STORE.tokens;

  try {
    const limit = 200;
    let offset = 0;
    let hasMore = true;
    const allTokens: Token[] = [];

    while (hasMore) {
      const response = await fetch(
        `${API_BASE}/tokens?bucket=24h&priceSource=best&sort=volume&dir=desc&includeChange=1&limit=${limit}&offset=${offset}`,
        {
          headers: { Accept: "application/json", ...API_HEADERS },
          cache: "no-store",
        }
      );

      if (!response.ok) {
        console.error("Failed to fetch tokens:", response.statusText);
        break;
      }

      const json = await response.json();
      if (!json.success || !Array.isArray(json.data)) {
        console.error("Invalid API response format");
        break;
      }

      const batch: Token[] = json.data
        .filter((token: any) => {
          const tokenName = (token.name || "").toLowerCase();
          return tokenName !== "zig" && tokenName !== "uzig";
        })
        .map((token: any) => ({
          id: token.denom || token.tokenId,
          name: token.name || "Unknown Token",
          symbol: token.symbol || "UNKNOWN",
          denom: token.denom || "UNKNOWN",
          icon: token.imageUri || null,
          price: token.priceUsd || 0,
          tx: token.tx || 0,
          marketCap: token.mcapUsd || 0,
          volume24: token.volUsd || 0,
          volume24Buy: token.volBuyNative || 0,
          volume24Sell: token.volSellNative || 0,
          volume24Pct: token.change24hPct || 0,
          txCount: token.tx || 0,
        }));

      allTokens.push(...batch);
      hasMore = json.data.length === limit;
      offset += limit;
    }

    const tokens = allTokens.sort((a, b) => b.volume24 - a.volume24);

    POOL_STORE.tokens = tokens;
    POOL_STORE.loaded = true;
    return tokens;
  } catch (error) {
    console.error("Error fetching tokens:", error);
    return [];
  }
}

/* ============================ Debounce hook ============================ */
function useDebounce<T>(value: T, ms = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/* ============================= Recent storage ============================= */
const RECENT_KEY = "dt:recent-searches";
function getRecent(): SearchResult[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr = raw ? (JSON.parse(raw) as SearchResult[]) : [];
    return Array.isArray(arr) ? arr.slice(0, 8) : [];
  } catch {
    return [];
  }
}
function pushRecent(item: SearchResult) {
  if (typeof window === "undefined") return;
  const current = getRecent();
  const filtered = current.filter((r) => r.id !== item.id);
  const next = [item, ...filtered].slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export default function SearchBar({
  onOpen,
  onClose,
  isOpen = false,
  placeholder = "Search Token name...",
}: SearchBarProps) {
  const router = useRouter();

  // Use the prop for modal state if provided, otherwise use local state
  const [localModalOpen, setLocalModalOpen] = useState(false);
  const modalOpen = isOpen !== undefined ? isOpen : localModalOpen;
  const [modalQuery, setModalQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [dataset, setDataset] = useState<Token[]>([]);
  const [recent, setRecent] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const debounced = useDebounce(modalQuery, 150);
  // Add this near other state declarations
  const [selectedTokenPools, setSelectedTokenPools] = useState<any[]>([]);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [loadingPools, setLoadingPools] = useState(false);
  // Mobile menu state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<Token[]>([]);
  // Refs for input elements
  const inputRefModal = useRef<HTMLInputElement>(null);

  // Key shortcuts: "/" opens modal search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      if (e.key === "/" && tag !== "input" && tag !== "textarea") {
        e.preventDefault();
        openSearchModal();
      }
      if (e.key === "Escape") {
        setLocalModalOpen(false);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // lock body scroll while modal or mobile menu open
  useEffect(() => {
    if (modalOpen || mobileMenuOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
      document.body.style.overflow = "hidden";

      return () => {
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.width = "";
        document.body.style.overflow = "";
        window.scrollTo(0, scrollY);
      };
    }
  }, [modalOpen, mobileMenuOpen]);

  // Close mobile menu when clicking outside
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (
        !target.closest(".mobile-menu") &&
        !target.closest(".mobile-menu-button")
      ) {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mobileMenuOpen]);

  // Fetch dataset once for modal (trending + search)
  useEffect(() => {
    if (!modalOpen || dataset.length) return;
    (async () => {
      setLoading(true);
      const tokens = await fetchAllPoolsOnce();
      setDataset(tokens);
      setRecent(getRecent());
      setLoading(false);
      setTimeout(() => inputRefModal.current?.focus(), 0);
    })();
  }, [modalOpen, dataset.length]);

  const openSearchModal = () => {
    if (onOpen) onOpen();
    setLocalModalOpen(true);
    setModalQuery("");
    setActiveIndex(-1);
    setSelectedToken(null);
    setSelectedTokenPools([]);
    setSearchResults([]);
  };

  const modalContentRef = useRef<HTMLDivElement>(null);

  const closeModal = useCallback(
    (e?: React.MouseEvent | React.KeyboardEvent) => {
      try {
        e && "stopPropagation" in e && (e as any).stopPropagation();
      } catch {}
      if (typeof onClose === "function") onClose();
      setLocalModalOpen(false);
    },
    [onClose]
  );

  useEffect(() => {
    if (!modalOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        modalContentRef.current &&
        target &&
        !modalContentRef.current.contains(target)
      ) {
        closeModal();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [modalOpen, closeModal]);

  // Inline search moved to its own component (SearchBar)
  const fetchTokenPools = async (tokenId: string) => {
    try {
      setLoadingPools(true);
      const response = await fetch(
        `${API_BASE}/tokens/${tokenId}/pools?bucket=24h&includeCaps=1`,
        { cache: "no-store", headers: API_HEADERS }
      );

      if (!response.ok) throw new Error("Failed to fetch pools");

      const json = await response.json();
      if (json.success && Array.isArray(json.data)) {
        // console.log(json.data);
        setSelectedTokenPools(json.data);
      }
    } catch (error) {
      console.error("Error fetching token pools:", error);
      setSelectedTokenPools([]);
    } finally {
      setLoadingPools(false);
    }
  };
  // Filtered results for query
  const results: Token[] = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (!q) {
      setSearchResults([]);
      setSelectedTokenPools([]);
      return [];
    }

    const starts = dataset.filter(
      (t) =>
        (t.symbol || "").toLowerCase().startsWith(q) ||
        (t.name || "").toLowerCase().startsWith(q) ||
        (t.denom || "").toLowerCase().startsWith(q)
    );
    const contains = dataset.filter(
      (t) =>
        ((t.symbol || "").toLowerCase().includes(q) ||
          (t.name || "").toLowerCase().includes(q) ||
          (t.denom || "").toLowerCase().includes(q)) &&
        !starts.includes(t)
    );

    const allResults = [...starts, ...contains].slice(0, 25);
    setSearchResults(allResults);

    // If we have exact match, fetch pools for it
    const exactMatch = allResults.find(
      (t) =>
        t.symbol.toLowerCase() === q ||
        t.name.toLowerCase() === q ||
        t.denom.toLowerCase() === q
    );
    if (exactMatch) {
      setSelectedToken(exactMatch);
      fetchTokenPools(exactMatch.id);
    } else if (allResults.length === 1) {
      // If only one result, show its pools
      setSelectedToken(allResults[0]);
      fetchTokenPools(allResults[0].id);
    } else {
      setSelectedToken(null);
      setSelectedTokenPools([]);
    }

    return allResults;
  }, [debounced, dataset]);

  const walletMatch = useMemo(() => {
    const raw = debounced.trim();
    return raw && isWalletAddress(raw) ? raw : "";
  }, [debounced]);

  // Go to a pair
  const goPair = async (e: React.MouseEvent, t: Token) => {
    e?.preventDefault?.();
    const item: SearchResult = {
      id: t.id,
      name: t.name,
      symbol: t.symbol,
      denom: t.denom,
      type: "token",
      icon: t.icon || undefined,
      price: t.price,
    };
    pushRecent(item);
    setRecent(getRecent());
    setSelectedToken(t);

    // Navigate to the token's pair page
    const tokenPath = t.denom?.startsWith("ibc/") ? t.symbol : t.denom;
    window.location.href = `/token/${tokenPath}`;

    await fetchTokenPools(t.id);
  };

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left"
      aria-label="Open search"
    >
      <div className="flex items-center bg-[#24242480] border border-white/10 rounded-lg pl-3 pr-2 h-10">
        <Search className="text-gray-300 shrink-0" size={18} />
        <input
          readOnly
          value={""}
          placeholder={placeholder}
          className="bg-transparent text-[15px] text-white placeholder:text-gray-400 px-2 outline-none w-full pointer-events-none"
          aria-hidden
        />
        <kbd className="ml-2 px-2 py-1 text-[11px] rounded border border-white/10 bg-white/5 text-gray-200">
          /
        </kbd>
      </div>
      {modalOpen &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[100] bg-black/30 backdrop-blur-sm"
              onClick={closeModal}
              style={{
                overflow: "hidden",
                position: "fixed",
                width: "100%",
                height: "100%",
              }}
            />
            <div
              className="fixed inset-0 z-[110] flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto"
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                overflow: "hidden auto",
              }}
            >
              <div
                ref={modalContentRef}
                className="w-full max-w-[1000px] bg-black/60 border border-white/10 rounded-xl overflow-hidden shadow-2xl my-4"
              >
                {/* Fixed height container so only body scrolls */}
                <div className="h-[100vh] md:h-[72vh] flex flex-col">
                  {/* Sticky header – never moves */}
                  <div className="sticky top-0 z-10 flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-4 border-b border-white/10 bg-black/60 backdrop-blur-sm">
                    <Search size={18} className="text-gray-300 shrink-0" />
                    <input
                      ref={inputRefModal}
                      value={modalQuery}
                      onChange={(e) => {
                        setModalQuery(e.target.value);
                        setActiveIndex(-1);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setActiveIndex((p) =>
                            Math.min(
                              p + 1,
                              (results.length || dataset.length) - 1
                            )
                          );
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setActiveIndex((p) => Math.max(p - 1, 0));
                        } else if (e.key === "Enter") {
                          const rawQuery = modalQuery.trim();
                          if (rawQuery && isWalletAddress(rawQuery)) {
                            e.preventDefault();
                            closeModal();
                            router.push(
                              `/portfolio?address=${encodeURIComponent(
                                rawQuery
                              )}`
                            );
                            return;
                          }
                          const list = results.length ? results : dataset;
                          if (list[activeIndex]) {
                            const event = {
                              preventDefault: () => {},
                            } as React.MouseEvent;
                            goPair(event, list[activeIndex]);
                          }
                        } else if (e.key === "Escape") {
                          setLocalModalOpen(false);
                        }
                      }}
                      placeholder="Search for Tokens, Markets, or Wallet Addresses"
                      className="bg-transparent text-white placeholder:text-gray-400 text-[15px] outline-none w-full"
                    />
                    <button
                      className="text-xs px-2 py-1 rounded-lg border border-white/10 text-white/80 hover:bg-white/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeModal(e);
                      }}
                    >
                      ESC
                    </button>
                  </div>

                  {/* Scrollable body */}
                  <div className="flex-1 overflow-auto lp-scroll">
                    {walletMatch && (
                      <div className="px-1 sm:px-3 pt-3">
                        <div className="rounded-lg border border-white/10 bg-black/50">
                          <div className="px-3 py-2 text-white/50 text-xs uppercase tracking-wide flex items-center justify-between">
                            <span>TRADER</span>
                            <span>PNL</span>
                          </div>
                          <div className="border-t border-white/10 px-3 py-3 flex items-center justify-between gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                router.push(
                                  `/portfolio?address=${encodeURIComponent(
                                    walletMatch
                                  )}`
                                )
                              }
                              className="text-left text-sky-400 text-sm truncate hover:text-sky-300"
                              title={walletMatch}
                            >
                              {walletMatch}
                            </button>
                            <span className="text-white/50 text-sm">--</span>
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Results / Trending table (on top) */}
                    <div className="px-1 sm:px-3 pt-3 pb-2">
                      <div className="px-3 sm:px-2 text-white/80 text-sm mb-2">
                        {debounced ? "Results" : "Trending"}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-white/90">
                          <thead className="text-white/50 border-t border-b border-white/10">
                            <tr>
                              <th className="text-left font-normal px-3 py-2">
                                TOKEN
                              </th>
                              <th className="text-right font-normal px-3 py-2">
                                PRICE (USD)
                              </th>
                              <th className="text-right font-normal px-2 py-2">
                                24H VOL / % CHG
                              </th>
                              <th className="text-right font-normal px-3 py-2">
                                MCAP
                              </th>
                              <th className="text-right font-normal px-3 py-2">
                                Tx
                              </th>
                              {/* <th className="px-2" /> */}
                            </tr>
                          </thead>
                          <tbody>
                            {(debounced ? results : dataset).map(
                              (t, i) => (
                                <tr
                                  key={`${t.id}-${t.symbol}-${t.name}-${i}`}
                                  onClick={(e) => goPair(e, t)}
                                  onMouseEnter={() => setActiveIndex(i)}
                                  className={`cursor-pointer border-b border-white/5 hover:bg-white/5 ${
                                    i === activeIndex ? "bg-white/10" : ""
                                  }`}
                                >
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <img
                                        src={
                                          t.icon ||
                                          "https://www.lcx.com/wp-content/uploads/buy-zigchain-token-1.webp"
                                        }
                                        alt={t.symbol}
                                        className="w-6 h-6 rounded-full object-cover"
                                      />
                                      <div className="min-w-0">
                                        <div className="truncate">{t.name}</div>
                                        <div className="text-white/60 text-xs truncate">
                                          {t.symbol}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    {formatNum(t.price, 6)}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <span className="mr-2">
                                      {fmtVol(t.volume24)}
                                    </span>
                                    <span
                                      className={
                                        t.volume24Pct >= 0
                                          ? "text-emerald-400"
                                          : "text-red-400"
                                      }
                                    >
                                      {fmtPct(t.volume24Pct)}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    {shouldHideMcap(t) ? "--" : fmtVol(t.marketCap)}
                                  </td>

                                  <td className="px-3 py-2 text-right">
                                    {t.tx}
                                  </td>
                                  {/* <td className="px-2 py-2 text-right">
                                    <button className="opacity-70 hover:opacity-100">
                                      ☆
                                    </button>
                                  </td> */}
                                </tr>
                              )
                            )}
                            {!loading && !dataset.length && (
                              <tr>
                                <td
                                  colSpan={6}
                                  className="px-3 py-4 text-center text-white/60"
                                >
                                  Nothing to show
                                </td>
                              </tr>
                            )}
                            {loading && (
                              <tr>
                                <td
                                  colSpan={6}
                                  className="px-3 py-4 text-center text-white/60"
                                >
                                  Loading…
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Recent searches (moved to bottom so typing doesn’t shift the top) */}
                    <div className="px-4 sm:px-5 pb-4">
                      <div className="text-white/80 text-sm mb-2">
                        Recent searches
                      </div>
                      {recent.length ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {recent.map((r) => (
                            <button
                              key={r.id}
                              onClick={() => router.push(`/token/${r.id}`)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/90 text-[13px]"
                            >
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                              {r.symbol || r.name}
                            </button>
                          ))}
                          <button
                            onClick={() => {
                              localStorage.removeItem(RECENT_KEY);
                              setRecent([]);
                            }}
                            className="ml-2 text-xs text-white/60 hover:text-white/80"
                          >
                            Clear all
                          </button>
                        </div>
                      ) : (
                        <div className="text-white/50 text-xs">
                          No recent searches
                        </div>
                      )}
                    </div>
                    {/* Add this right after the search results table */}
                    {(searchResults.length > 0 ||
                      selectedTokenPools.length > 0) && (
                      <div className="mt-6 px-4 sm:px-5 pb-4">
                        <div className="text-white/80 text-sm mb-3">
                          {selectedToken
                            ? `Pools for ${selectedToken.symbol}`
                            : searchResults.length === 1
                            ? `Pools for ${searchResults[0].symbol}`
                            : "Matching Pools"}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm text-white/90">
                            <thead className="text-white/50 border-t border-b border-white/10">
                              <tr>
                                <th className="text-left font-normal px-3 py-2">
                                  PAIR
                                </th>
                                <th className="text-right font-normal px-3 py-2">
                                  PRICE
                                </th>
                                <th className="text-right font-normal px-2 py-2">
                                  24H VOLUME
                                </th>
                                <th className="text-right font-normal px-3 py-2">
                                  TVL
                                </th>
                                <th className="text-right font-normal px-3 py-2">
                                  TXs
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {loadingPools ? (
                                <tr>
                                  <td
                                    colSpan={5}
                                    className="px-3 py-4 text-center text-white/60"
                                  >
                                    Loading pools...
                                  </td>
                                </tr>
                              ) : selectedTokenPools.length > 0 ? (
                                selectedTokenPools.map((pool, i) => (
                                  <tr
                                    key={pool.pairContract}
                                    className="border-b border-white/5"
                                  >
                                    <td className="px-3 py-2">
                                      <div className="flex items-center gap-2">
                                        <div className="flex -space-x-1">
                                          <img
                                            src={
                                              pool.base.imageUri ||
                                              "https://www.lcx.com/wp-content/uploads/buy-zigchain-token-1.webp"
                                            }
                                            alt={pool.base.symbol}
                                            className="w-5 h-5 rounded-full border border-white/10"
                                          />
                                          <img
                                            src={
                                              pool.quote.imageUri ||
                                              "https://www.lcx.com/wp-content/uploads/buy-zigchain-token-1.webp"
                                            }
                                            alt={pool.quote.symbol}
                                            className="w-5 h-5 rounded-full border border-white/10"
                                          />
                                        </div>
                                        <span>
                                          {pool.base.symbol}/{pool.quote.symbol}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      {pool.priceUsd
                                        ? formatNum(pool.priceUsd, 6)
                                        : "N/A"}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      {fmtVol(pool.volumeNative || 0)}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      {fmtVol(pool.tvlNative || 0)}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      {pool.tx || 0}
                                    </td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td
                                    colSpan={5}
                                    className="px-3 py-4 text-center text-white/60"
                                  >
                                    No pools found
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>,
          document.body
        )}
    </button>
  );
}
