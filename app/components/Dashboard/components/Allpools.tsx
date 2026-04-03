"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  Search as SearchIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

/* =========================
   API + Types
   ========================= */
const API_BASE = "http://144.91.85.132:8003";
const tokensPerPage = 20;

type TokenResponse = {
  tokenId: string;
  denom: string;
  symbol: string;
  name: string | null;
  priceNative: number;
  priceUsd: number;
  mcapNative: number | null;
  mcapUsd: number | null;
  fdvNative: number | null;
  fdvUsd: number | null;
  holders: number;
  volNative: number;
  volUsd: number;
  tx: number;
  createdAt: string;
};

interface Token {
  id: string;
  name: string;
  symbol: string;
  icon: string | null;
  price: number;
  liquidity: number;
  volume: { "24h": number };
  txCount: number;
}

// Removed unused constants

const formatNum = (n?: number | null, digits = 2) =>
  n == null
    ? "-"
    : Number(n).toLocaleString(undefined, { maximumFractionDigits: digits });

const choosePrice = (p: TokenResponse) => p.priceNative ?? 0;

const cleanCoinish = (s?: string | null) => {
  if (!s) return "";
  if (s.startsWith("coin.")) {
    const parts = s.split(".");
    return parts[parts.length - 1] || s;
  }
  return s;
};

// const mapTokens = (tokens: TokenResponse[]): Token[] =>
//   tokens.map((t) => {
//     // const name = t.name || t.denom?.split('.').pop() || 'Token';
//     const symbol = t.symbol || t.denom?.split('.').pop() || '—';

//     return {
//       id: t.symbol,
//       name: t.name?.split('ZIG1').pop() || t.symbol || t.denom?.split('.').pop() || t.denom || 'Token',
//       symbol,
//       icon: null, // Not provided in the new API
//       price: t.priceNative || 0,
//       liquidity: t.mcapNative || 0, // Using mcapNative as liquidity
//       volume: { '24h': t.volNative || 0 },
//       txCount: t.tx || 0,
//     };
//   });
const shortenAddress = (address: string): string => {
  if (!address || address.length <= 10) return address;
  return `${address.substring(0, 6)}...${address.substring(
    address.length - 4
  )}`;
};

const mapTokens = (tokens: TokenResponse[]): Token[] =>
  tokens.map((t) => {
    let symbol = t.symbol || t.denom?.split(".").pop() || "—";
    let name =
      t.name?.split("ZIG1").pop() ||
      t.symbol ||
      t.denom?.split(".").pop() ||
      t.denom ||
      "Token";

    // Shorten any name longer than 5 characters
    if (name && name.length > 5) {
      name = `${name.substring(0, 15)}`;
    }
    if (symbol && symbol.length > 5) {
      symbol = `${symbol.substring(0, 5)}`;
    }

    return {
      id: t.symbol,
      name,
      symbol,
      icon: null,
      price: t.priceNative || 0,
      liquidity: t.mcapNative || 0,
      volume: { "24h": t.volNative || 0 },
      txCount: t.tx || 0,
    };
  });
/* =========================
   Component
   ========================= */
export default function Allpools() {
  const router = useRouter();

  const [allTokens, setAllTokens] = useState<Token[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);

  // search
  const [term, setTerm] = useState("");
  const [appliedTerm, setAppliedTerm] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Token[]>([]);
  const [hi, setHi] = useState(-1);
  const inputWrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // focus with '/'
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      if (e.key === "/" && tag !== "input" && tag !== "textarea") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // close suggestions on click away
  useEffect(() => {
    const onClickAway = (e: MouseEvent) => {
      if (!inputWrapRef.current) return;
      if (!inputWrapRef.current.contains(e.target as Node)) {
        setSuggestionsOpen(false);
        setHi(-1);
      }
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  const fetchPools = useCallback(async (force = false) => {
    try {
      if (!force) setLoading(true);
      setError(null);

      const res = await fetch(
        `${API_BASE}/tokens?bucket=24h&sort=volume&dir=desc&limit=300`,
        {
          headers: { Accept: "application/json" },
        }
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const tokens: TokenResponse[] = json?.data || [];

      // Filter out ZIG and STZIG tokens
      const filtered = tokens.filter((t) => {
        const upperSymbol = t.symbol?.toUpperCase();
        const upperName = t.name?.toUpperCase() || "";
        return (
          upperSymbol !== "ZIG" &&
          upperName !== "ZIG" &&
          upperSymbol !== "STZIG" &&
          !upperName.includes("STZIG")
        );
      });

      setAllTokens(mapTokens(filtered));
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Failed to fetch pools");
      setAllTokens([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPools();
  }, [fetchPools]);

  /* ---------- suggestions ---------- */
  useEffect(() => {
    if (!allTokens) return;
    const q = term.trim().toLowerCase();
    if (!q) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      setHi(-1);
      return;
    }
    const starts = allTokens.filter(
      (t) =>
        (t.symbol || "").toLowerCase().startsWith(q) ||
        (t.name || "").toLowerCase().startsWith(q)
    );
    const contains = allTokens.filter(
      (t) =>
        ((t.symbol || "").toLowerCase().includes(q) ||
          (t.name || "").toLowerCase().includes(q)) &&
        !starts.includes(t)
    );
    const ranked = [...starts, ...contains].slice(0, 8);
    setSuggestions(ranked);
    setSuggestionsOpen(true);
    setHi(ranked.length ? 0 : -1);
  }, [term, allTokens]);

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (!suggestionsOpen || suggestions.length === 0) {
      if (e.key === "Enter") setAppliedTerm(term);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => Math.min(suggestions.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (hi >= 0 && suggestions[hi]) {
        router.push(`/pair/${suggestions[hi].id}`);
        setSuggestionsOpen(false);
        setTerm("");
        setAppliedTerm("");
        setHi(-1);
      } else {
        setAppliedTerm(term);
      }
    } else if (e.key === "Escape") {
      setSuggestionsOpen(false);
      setHi(-1);
    }
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    (e.target as HTMLImageElement).src = "/zigicon.png";
  };

  /* ---------- view (filter + paginate) ---------- */
  const { view, totalPages } = useMemo(() => {
    const base = allTokens ?? [];
    const t = appliedTerm.trim().toLowerCase();
    const filtered = t
      ? base.filter(
          (x) =>
            (x.name || "").toLowerCase().includes(t) ||
            (x.symbol || "").toLowerCase().includes(t)
        )
      : base;

    const tp = Math.max(1, Math.ceil(filtered.length / tokensPerPage));
    const safe = Math.min(page, tp);
    const start = (safe - 1) * tokensPerPage;
    return {
      view: filtered.slice(start, start + tokensPerPage),
      totalPages: tp,
    };
  }, [allTokens, appliedTerm, page]);

  useEffect(() => setPage(1), [appliedTerm]);

  const showLoader = loading && !allTokens;
  const showEmpty = !loading && (allTokens?.length ?? 0) === 0;

  /* =========================
     UI
     ========================= */
  return (
    <div className="rounded-2xl overflow-hidden border border-black/20 bg-[#0a0f12]">
      {/* top strip gradient with exact stops */}
      <div
        className="px-3 sm:px-4 md:px-5 py-4"
        style={{
          backgroundImage:
            "linear-gradient(51deg,rgba(255, 255, 255, 0) 0%, rgba(84,213,136,0.5) 50%, #009597 100%)",
        }}
      >
        <div className="flex items-center justify-between gap-3">
          {/* left: updated + title */}
          <div className="flex flex-col">
            <span className="text-[10px] text-white/70 leading-none mb-2">
              {lastUpdated ? `Updated: ${lastUpdated}` : "\u00A0"}
            </span>
            <span className="text-white font-medium text-[13px] sm:text-[14px] leading-tight">
              Liquidity Pools
            </span>
          </div>
          {/* bg-white/[0.07] */}
          {/* right: search pill + refresh */}
          <div className="flex items-center gap-2">
            <div ref={inputWrapRef} className="relative">
              <div className="flex items-center h-9 rounded-lg pl-9 pr-2 bg-[#24242480] ring-1 ring-white/15 focus-within:ring-white/25 w-[210px] sm:w-[260px] md:w-[320px]">
                <SearchIcon className="w-4 h-4 absolute left-3 text-white/70" />
                <input
                  ref={inputRef}
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Search Token name..."
                  className="bg-transparent outline-none text-white/90 placeholder:text-white/60 text-[12px] w-full"
                />
                <kbd className="ml-2 px-1.5 py-0.5 text-[10px] rounded  text-white/80">
                  /
                </kbd>
              </div>

              {/* suggestions */}
              {suggestionsOpen && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 mt-1 bg-[#0e141b] border border-white/10 rounded-xl shadow-xl overflow-hidden z-20">
                  {suggestions.map((tok, idx) => (
                    <button
                      key={tok.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        router.push(`/pair/${tok.id}`);
                        setSuggestionsOpen(false);
                        setTerm("");
                        setAppliedTerm("");
                        setHi(-1);
                      }}
                      onMouseEnter={() => setHi(idx)}
                      className={`w-full px-3 py-2 flex items-center gap-2 text-left ${
                        idx === hi ? "bg-white/5" : ""
                      }`}
                    >
                      <img
                        src={
                          tok.icon ||
                          "https://www.lcx.com/wp-content/uploads/buy-zigchain-token-1.webp"
                        }
                        alt={tok.symbol}
                        onError={handleImageError}
                        className="w-5 h-5 rounded-full object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-white truncate text-sm">
                            {tok.name}
                          </span>
                          <span className="text-white/70 text-xs">
                            {formatNum(tok.price, 6)}
                          </span>
                        </div>
                        <span className="text-white/60 text-[11px]">
                          {tok.symbol}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => fetchPools(true)}
              disabled={loading}
              className="h-9 w-9 inline-flex items-center justify-center rounded-full bg-white/[0.07] ring-1 ring-white/15 hover:bg-white/[0.1] transition"
              title="Refresh"
            >
              <RefreshCw
                className={`w-4 h-4 text-white ${
                  loading ? "animate-spin" : ""
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* ========== HORIZONTAL SCROLLER (header + body) ========== */}
      <div
        className="overflow-x-auto touch-pan-x overflow-hidden  backdrop-blur-md shadow-[0_10px_40px_-10px_rgba(0,0,0,0.7)]"
        style={{
          background: `
            radial-gradient(circle at left top, #143c24, transparent 20%),
            radial-gradient(circle at right center, rgba(0,0,0,0.7), transparent 70%),
            rgba(0,0,0,0.55)
                    `,
        }}
      >
        {/* set a min width so the table doesn't squish on phones */}
        <div className="min-w-[880px]">
          {/* sticky table header (stays above vertical body scroll) */}
          <div className="sticky top-0 z-10 bg-black/20 py-2">
            <div className="grid grid-cols-[5fr_3fr_3fr_3fr_3fr_3fr] gap-2 px-3 sm:px-5 py-2 text-[11px] sm:text-xs text-white/80 border-b border-white/10">
              <div>Token</div>
              <div className="text-right">Symbol</div>
              <div className="text-right">Liquidity (ZIG)</div>
              <div className="text-right">Price (ZIG)</div>
              <div className="text-right">24h Volume (ZIG)</div>
              <div className="text-right">TXs (24h)</div>
            </div>
          </div>

          {/* vertical scroll just for rows */}
          <div className="lp-scroll max-h-[62vh] overflow-y-auto">
            {loading && !allTokens ? (
              <div className="px-6 py-10 text-center text-white/70 text-sm">
                Loading…
              </div>
            ) : error ? (
              <div className="px-6 py-8 text-center text-red-300 text-sm">
                {error}{" "}
                <button onClick={() => fetchPools(true)} className="underline">
                  Retry
                </button>
              </div>
            ) : !allTokens || allTokens.length === 0 ? (
              <div className="px-6 py-8 text-center text-white/70 text-sm">
                No pools found.
              </div>
            ) : (
              view.map((t) => (
                <Link
                  key={t.id}
                  href={`/pair/${t.id}`}
                  className="grid grid-cols-[5fr_3fr_3fr_3fr_3fr_3fr] gap-2 px-3 sm:px-5 py-3 items-center border-b border-white/20 hover:bg-white/[0.03] transition"
                >
                  {/* Token (icon + name) */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-7 h-7 rounded-full overflow-hidden bg-white/5 ring-1 ring-white/10 shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={
                          t.icon ||
                          "https://s2.coinmarketcap.com/static/img/coins/200x200/9260.png"
                        }
                        alt={t.symbol}
                        onError={handleImageError}
                        className="w-full h-full object-cover"
                      />
                    </span>
                    <span className="text-white truncate uppercase text-sm sm:text-[15px]">
                      {t.name}
                    </span>
                  </div>

                  <div className="text-right truncate whitespace-nowrap uppercase text-white/90">
                    {t.symbol}
                  </div>
                  <div className="text-right text-white tabular-nums">
                    {formatNum(t.liquidity, 2)}
                  </div>
                  <div className="text-right text-white tabular-nums">
                    {formatNum(t.price, 6)}
                  </div>
                  <div className="text-right text-white tabular-nums">
                    {t.volume["24h"] >= 1_000_000
                      ? `${(t.volume["24h"] / 1_000_000).toFixed(1)}M`
                      : `${(t.volume["24h"] / 1_000).toFixed(1)}K`}
                  </div>
                  <div className="text-right text-white/80 tabular-nums">
                    {t.txCount.toLocaleString()}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* pagination (centered) */}
      {!loading && allTokens && allTokens.length > 0 && (
        <div className="flex items-center justify-center gap-1 py-3 text-white/80 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.07] ring-1 ring-white/15 hover:bg-white/[0.1] disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="mx-2">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={loading || page >= totalPages}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.07] ring-1 ring-white/15 hover:bg-white/[0.1] disabled:opacity-50"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* scoped scrollbar styling */}
      <style jsx global>{`
        .lp-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgb(41, 48, 46) #0c1216;
        }
        .lp-scroll::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }
        .lp-scroll::-webkit-scrollbar-track {
          background: #0c1216;
        }
        .lp-scroll::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #23e6d1, #35c77b);
          border-radius: 8px;
          border: 2px solid #0c1216;
        }
        .lp-scroll::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #2af1db, #43d287);
        }
      `}</style>
    </div>
  );
}
