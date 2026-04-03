/* eslint-disable @next/next/no-img-element */
"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
// import Header from "./components/Header";
// import TrendingTicker from "./components/TrendingTicker";
import TopTokensTable from "./components/TopTokensTable";
import RankingComponent from "./components/RankingComponent";
import NewListing from "./components/NewListing";
import FindGems from "./components/FindGems";
import LargeTradersTable from "./components/LargeTraders";
import { API_BASE_URL, tokenAPI } from "@/lib/api";
import { Trade } from "@/lib/api";

interface Token {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  total_volume: number;
  image: string;
  tx: number;
  denom: string;
  holders: number;
  fdvUsd?: number;
  creationTime: number;
}

const DASHBOARD_TOP_TOKENS_CACHE_KEY = "degenter_dashboard_top_tokens";
const DASHBOARD_TOP_TOKENS_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const API_BASE = API_BASE_URL;

type DashboardTokensCache = {
  tokens: Token[];
  trades: Trade[];
  volumeChanges: Record<string, "increase" | "decrease" | "same">;
  totalItems: number;
  page: number;
  newListings: Token[];
  timestamp: number;
};

const readDashboardCache = (): DashboardTokensCache | null => {
  if (typeof window === "undefined") return null;
  try {
    const cached = window.localStorage.getItem(
      DASHBOARD_TOP_TOKENS_CACHE_KEY
    );
    if (!cached) return null;
    const parsed: DashboardTokensCache = JSON.parse(cached);
    if (!parsed || typeof parsed.timestamp !== "number") return null;
    // if (Date.now() - parsed.timestamp > DASHBOARD_TOP_TOKENS_CACHE_DURATION) {
    //   window.localStorage.removeItem(DASHBOARD_TOP_TOKENS_CACHE_KEY);
    //   return null;
    // }
    return parsed;
  } catch (error) {
    console.error("Dashboard cache read failed:", error);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DASHBOARD_TOP_TOKENS_CACHE_KEY);
    }
    return null;
  }
};

const writeDashboardCache = (
  payload: Omit<DashboardTokensCache, "timestamp">
) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      DASHBOARD_TOP_TOKENS_CACHE_KEY,
      JSON.stringify({ ...payload, timestamp: Date.now() })
    );
  } catch (error) {
    console.error("Dashboard cache write failed:", error);
  }
};

const Dashboard: React.FC = () => {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalItems, setTotalItems] = useState<number>(0);
  const [newListings, setNewListings] = useState<Token[]>([]);
  const [volumeChanges, setVolumeChanges] = useState<
    Record<string, "increase" | "decrease" | "same">
  >({});
  const prevTokensRef = useRef<Token[]>([]);
  const volumeChangesRef = useRef<
    Record<string, "increase" | "decrease" | "same">
  >({});
  const skipLoadingRef = useRef(false);
  const pollingRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const TOP_TOKENS_FETCH_LIMIT = 500;
  const newListingsLimit = 100; // show all new listings (up to API limit)
  const POLL_INTERVAL = 30000; // 30s
  const MAX_RETRY = 3;

  // Helper to parse total items from a variety of API shapes:
  function extractTotalCount(resp: any, fallbackCount: number) {
    if (!resp) return fallbackCount;
    if (typeof resp.total === "number") return resp.total;
    if (resp.meta && typeof resp.meta.total === "number")
      return resp.meta.total;
    if (resp.pagination && typeof resp.pagination.total === "number")
      return resp.pagination.total;
    if (resp.page && resp.limit && typeof resp.total === "number")
      return resp.total;
    // sometimes response returns {count, results}
    if (typeof resp.count === "number") return resp.count;
    // fallback to provided fallback
    return fallbackCount;
  }

  // Merge incoming tokens into existing tokens by id.
  // This avoids replacing the entire array and reduces re-renders / flicker.
  const mergeTokens = (existing: Token[], incoming: Token[]) => {
    const map = new Map<string, Token>();
    // put existing first so we keep references for unchanged items
    for (const t of existing) map.set(t.id, t);
    for (const t of incoming) {
      const prev = map.get(t.id);
      if (!prev) {
        // new token, add it
        map.set(t.id, t);
      } else {
        // if something changed, replace; else keep same reference
        const hasChanged =
          prev.current_price !== t.current_price ||
          prev.total_volume !== t.total_volume ||
          prev.price_change_percentage_24h !== t.price_change_percentage_24h ||
          prev.tx !== t.tx ||
          prev.market_cap !== t.market_cap;
        map.set(t.id, hasChanged ? t : prev);
      }
    }
    // maintain sorting same as incoming order where possible:
    const ordered: Token[] = [];
    for (const t of incoming) {
      const v = map.get(t.id);
      if (v) ordered.push(v);
    }
    // include any existing tokens that weren't in incoming (rare for paging)
    for (const [id, t] of map.entries()) {
      if (!incoming.find((x) => x.id === id)) ordered.push(t);
    }
    return ordered;
  };

  useEffect(() => {
    const cached = readDashboardCache();
    if (cached && cached.page === currentPage && cached.tokens.length > 0) {
      prevTokensRef.current = cached.tokens;
      const cachedVolumeChanges = cached.volumeChanges || {};
      volumeChangesRef.current = cachedVolumeChanges;
      setVolumeChanges(cachedVolumeChanges);
      setTokens(cached.tokens);
      setTrades(cached.trades || []);
      setTotalItems(cached.totalItems || cached.tokens.length);
      setNewListings(cached.newListings || []);
      setLoading(false);
      skipLoadingRef.current = true;
    }
  }, [currentPage]);

  const fetchTokens = useCallback(
    async (opts?: { isPolling?: boolean; tryNum?: number }) => {
      const tryNum = opts?.tryNum ?? 0;
      // Cancel previous controller (shouldn't be needed usually) and create a new one
      if (abortRef.current) {
        try {
          abortRef.current.abort();
        } catch {}
      }
      const controller = new AbortController();
      abortRef.current = controller;

      if (!opts?.isPolling) {
        if (skipLoadingRef.current) {
          skipLoadingRef.current = false;
        } else {
          setLoading(true);
        }
      }

      try {
        // Primary tokens (sorted by volume)
        const response = await tokenAPI.getTopTokensForDashboard(
          "24h",
          "best",
          "volume",
          TOP_TOKENS_FETCH_LIMIT,
          0,
          { signal: controller.signal } // pass signal if your API wrapper supports it
        );

        // New listings (created sort)
        const responseForNewlisting = await tokenAPI.getTopTokensForDashboard(
          "24h",
          "best",
          "created",
          newListingsLimit,
          0,
          { signal: controller.signal }
        );

        // Raw arrays from several common shapes
        const respAny: any = response;
        const rawTokens: any[] = Array.isArray(respAny)
          ? respAny
          : respAny?.data ?? respAny?.tokens ?? respAny?.results ?? [];

        const respNL: any = responseForNewlisting;
        const rawNL: any[] = Array.isArray(respNL)
          ? respNL
          : respNL?.data ?? respNL?.tokens ?? respNL?.results ?? [];

        // remove ZIG/UZIG from new listing
        const filteredNL = rawNL.filter(
          (t: any) =>
            t.symbol &&
            !["zig", "uzig"].includes(String(t.symbol).toLowerCase())
        );

        const newListingsData: Token[] = filteredNL.map((t: any) => ({
          id: t.tokenId?.toString() || t.id?.toString() || "",
          symbol: t.symbol || "",
          name: t.name || "",
          current_price: t.priceUsd || t.priceNative || 0,
          price_change_percentage_24h: t.change24hPct || 0,
          market_cap: t.mcapUsd || t.mcapNative || 0,
          total_volume: t.volUsd || t.volNative || 0,
          fdvUsd: t.fdvUsd || 0,
          image: t.imageUri || t.image || "",
          tx: t.tx || 0,
          denom: t.denom || "",
          holders: t.holders || 0,
          creationTime: t.createdAt || 0,
          liquidity:
            t.liquidity ??
            t.liquidityUsd ??
            t.volUsd ??
            t.volNative ??
            0,
        }));

        newListingsData.sort((a, b) => {
          const aTime = Date.parse(String(a.creationTime ?? 0)) || 0;
          const bTime = Date.parse(String(b.creationTime ?? 0)) || 0;
          return bTime - aTime;
        });
        setNewListings(newListingsData.slice(0, 10));

        // Filter out ZIG and uzig tokens
        const filteredTokens = rawTokens.filter(
          (token: any) =>
            token &&
            token.symbol &&
            !["zig", "uzig"].includes(String(token.symbol).toLowerCase())
        );

        const tokensData: Token[] = filteredTokens.map((token: any) => ({
          id: token.tokenId?.toString() || token.id?.toString() || "",
          symbol: token.symbol || "",
          name: token.name || "",
          current_price: token.priceUsd || token.priceNative || 0,
          price_change_percentage_24h: token.change24hPct || 0,
          market_cap: token.mcapUsd || token.mcapNative || 0,
          total_volume: token.volUsd || token.volNative || 0,
          fdvUsd: token.fdvUsd || 0,
          image: token.imageUri || token.image || "",
          tx: token.tx || 0,
          denom: token.denom || "",
          holders: token.holders || 0,
          creationTime: token.createdAt || 0,
          liquidity:
            token.liquidity ??
            token.liquidityUsd ??
            token.volUsd ??
            token.volNative ??
            0,
        }));

        // Trades (don't block token rendering if this fails)
        let filteredTrades: Trade[] = [];
        try {
          const tradesResponse = await tokenAPI.getLargeTrades(
            "24h",
            "usd",
            { signal: controller.signal }
          );
          const tradesAny: any = tradesResponse;
          const tradesArr: any[] = Array.isArray(tradesAny)
            ? tradesAny
            : tradesAny?.data ?? tradesAny?.tokens ?? tradesAny?.results ?? [];

          filteredTrades = tradesArr
            .filter((trade: any) => trade && trade.valueUsd && trade.valueUsd > 0)
            .sort((a: any, b: any) => (b.valueUsd || 0) - (a.valueUsd || 0))
            .slice(0, 10);
        } catch (tradeErr) {
          console.error("Error fetching trades:", tradeErr);
        }

        // Compute volume changes compared to prevTokensRef
        const newVolumeChanges = tokensData.reduce(
          (
            acc: Record<string, "increase" | "decrease" | "same">,
            token: Token
          ) => {
            const prevToken = prevTokensRef.current.find(
              (t) => t.id === token.id
            );
            if (prevToken) {
              if (token.total_volume > prevToken.total_volume)
                acc[token.id] = "increase";
              else if (token.total_volume < prevToken.total_volume)
                acc[token.id] = "decrease";
              else acc[token.id] = "same";
            }
            return acc;
          },
          {}
        );

        const updatedVolumeChanges = {
          ...volumeChangesRef.current,
          ...newVolumeChanges,
        };
        volumeChangesRef.current = updatedVolumeChanges;
        setVolumeChanges(updatedVolumeChanges);
        setTrades(filteredTrades);

        // Attempt to extract total items from response metadata
        const possibleTotal =
          extractTotalCount(response, tokensData.length) ||
          extractTotalCount(responseForNewlisting, tokensData.length) ||
          tokensData.length;
        setTotalItems(possibleTotal);

        const mergedTokens = mergeTokens(prevTokensRef.current, tokensData);
        prevTokensRef.current = mergedTokens;
        setTokens(mergedTokens);

        setError(null);

        writeDashboardCache({
          tokens: mergedTokens,
          trades: filteredTrades,
          totalItems: possibleTotal,
          volumeChanges: updatedVolumeChanges,
          page: currentPage,
          newListings: newListingsData,
        });
      } catch (err: any) {
        // If aborted, don't treat as failure
        if (err?.name === "AbortError") {
          // ignore
          return;
        }

        console.error("Error fetching tokens:", err);

        // Do not clear tokens on error; keep previous UI visible.
        setError("Failed to load tokens. Please try again later.");

        // exponential backoff retry if transient and we haven't exceeded MAX_RETRY
        if (opts?.tryNum === undefined || opts.tryNum < MAX_RETRY) {
          const nextTry = (opts?.tryNum ?? 0) + 1;
          const backoffMs = Math.min(2000 * Math.pow(2, nextTry), 15000);
          setTimeout(() => {
            fetchTokens({ isPolling: true, tryNum: nextTry });
          }, backoffMs);
        }
      } finally {
        setLoading(false);
      }
    },
    [currentPage]
  );

  // set up polling only once (when component mounts) and when currentPage changes we trigger immediate fetch
  useEffect(() => {
    // initial fetch
    fetchTokens({ isPolling: false });

    // clear any existing interval
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    // create interval
    const id = window.setInterval(() => {
      fetchTokens({ isPolling: true });
    }, POLL_INTERVAL);
    pollingRef.current = id;

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      if (abortRef.current) {
        try {
          abortRef.current.abort();
        } catch {}
        abortRef.current = null;
      }
    };
  }, [fetchTokens]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <div className="min-h-screen w-full text-slate-100/90 font-medium tracking-[0.01em] text-[14px]">
      {/* Main Content */}
      <div className="w-full max-w-screen-6xl mx-auto p-4 md:px-8 mb-8">
        {/* Top Section - Main Table and Ranking */}
        <div className="lg:flex grid 2xl:grid grid-cols-1 lg:grid-cols-10 gap-3 mb-3 w-full">
          <div className="col-span-1 lg:col-span-7 w-auto lg:w-[50%] 2xl:w-[auto]">
            <TopTokensTable
              tokens={tokens}
              loading={loading}
              error={error}
              volumeChanges={volumeChanges}
              totalItems={totalItems}
              currentPage={currentPage}
              onPageChange={handlePageChange}
            />
            {/* <TopTokens /> */}
          </div>
          <div className="lg:col-span-3 w-auto lg:w-[50%] 2xl:w-[auto]  md:block">
            <RankingComponent rankedTokens={tokens} />
          </div>
        </div>

        {/* Bottom Section - Three Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div>
            <NewListing LatestListing={newListings} />
          </div>
          <div>
            <FindGems />
          </div>
          <div>
            <LargeTradersTable />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
