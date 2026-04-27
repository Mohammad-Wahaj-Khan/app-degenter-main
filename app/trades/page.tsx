// app/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { tokenAPI } from "@/lib/api";
import { applyTokenPageMetadata } from "@/lib/token-page-metadata";
import { applyPageMetadata } from "@/lib/page-metadata";
import Navbar from "@/app/components/navbar";
import TopMarketToken from "@/app/components/TopMarketToken";
import FeatureLaunchGate from "@/app/components/feature-launch-gate";
import NotFoundPage from "@/app/not-found";
import AssetsFilter from "./components/AssetsFilter";
import Trades, { TokenOption, TradesFilter, Trade } from "./components/Trades";
import FilterTradesTop from "./components/FindTradesTop";

const API_BASE = process.env.API_BASE_URL;
const LIVE_PRICE_REFRESH_MS = 5000;

/* ---------------- Types ---------------- */
interface Token {
  id: number;
  name: string;
  symbol: string;
  pair_contract: string;
  price: number;
  priceUsd: number;
  change24h: number;
  icon: string | null;
  liquidity: number;
  marketCap: number;
  fdv: number;
  volume: {
    "30m": number;
    "1h": number;
    "4h": number;
    "24h": number;
  };
  txCount: {
    "30m": number;
    "1h": number;
    "4h": number;
    "24h": number;
    "30d": number;
  };
  circulatingSupply: number;
  totalSupply: number;
  maxSupply: number;
  holders: number;
  txBuy: number;
  txSell: number;
}

/* ---------------- Fetch Token ---------------- */
async function fetchTokenBySymbol(symbol: string): Promise<Token | null> {
  try {
    const res = await tokenAPI.getTokenSummaryBySymbol(symbol, "best", true);
    const token = res?.data;
    if (!token) return null;

    return {
      id: Number(token.tokenId || 0),
      pair_contract: token.denom
        ? token.denom.startsWith("ibc/")
          ? token.symbol || token.name || token.tokenId || ""
          : token.denom
        : token.symbol || token.name || token.tokenId || "",
      name: token.name || "Unknown Token",
      symbol: token.symbol || "",
      price: token.priceInNative || 0,
      priceUsd: token.priceInUsd || 0,
      change24h: token.priceChange?.["24h"] || 0,
      icon: token.imageUri || null,
      liquidity: token.liquidity || 0,
      marketCap: token.mc || 0,
      fdv: token.fdv || 0,
      maxSupply: token.maxSupply || 0,
      volume: {
        "30m": token.volume?.["30m"] || 0,
        "1h": token.volume?.["1h"] || 0,
        "4h": token.volume?.["4h"] || 0,
        "24h": token.volume?.["24h"] || 0,
      },
      txCount: {
        "30m": token.txBuckets?.["30m"] || 0,
        "1h": token.txBuckets?.["1h"] || 0,
        "4h": token.txBuckets?.["4h"] || 0,
        "24h": token.txBuckets?.["24h"] || 0,
        "30d": 0,
      },
      circulatingSupply: token.circulatingSupply || 0,
      totalSupply: token.supply || 0,
      holders: Number(token.holder || 0),
      txBuy: token.tradeCount?.buy || 0,
      txSell: token.tradeCount?.sell || 0,
    };
  } catch (error) {
    console.error("Error fetching token by symbol:", error);
    return null;
  }
}

const getDefaultFilters = (): TradesFilter => ({
  assetMode: "all",
  timeRange: "24H",
  valueRange: "",
  tokenDenom: "",
  wallet: "",
});

/* ---------------- Main Page ---------------- */
export default function FindTrades() {
  const { tokenDetails } = useParams();
  const [token, setToken] = useState<Token | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuditPanelVisible, setIsAuditPanelVisible] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "trades" | "holders" | "security" | "mySwaps" | "topTrades"
  >("trades");
  const [filters, setFilters] = useState<TradesFilter>(getDefaultFilters());
  const [tokenOptions, setTokenOptions] = useState<TokenOption[]>([]);
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [filteredTradesForExport, setFilteredTradesForExport] = useState<Trade[]>([]);

  const updateFilters = useCallback((values: Partial<TradesFilter>) => {
    setFilters((prev) => ({ ...prev, ...values }));
  }, []);

  const handleResetFilters = useCallback(() => {
    setFilters(getDefaultFilters());
  }, []);
  const handleClearTokenSearch = useCallback(() => {
    updateFilters({ tokenDenom: "" });
  }, [updateFilters]);

  const handleAvailableTokens = useCallback((options: TokenOption[]) => {
    setTokenOptions(options);
  }, []);
  const toggleFiltersOpen = useCallback(() => {
    setFiltersVisible((prev) => !prev);
  }, []);

  const handleFilteredTradesUpdate = useCallback((trades: Trade[]) => {
    setFilteredTradesForExport(trades);
  }, []);

  const handleExportCsv = useCallback(() => {
    if (
      typeof window === "undefined" ||
      typeof document === "undefined" ||
      !filteredTradesForExport.length
    )
      return;

    const headers = [
      "Time",
      "Direction",
      "ValueUSD",
      "ReturnAmount",
      "ReturnDenom",
      "OfferAmount",
      "OfferDenom",
      "Trader",
      "TxHash",
    ];

    const escapeCell = (value: string | number) =>
      `"${String(value).replace(/"/g, '""')}"`;

    const rows = filteredTradesForExport.map((trade) => [
      new Date(trade.time).toISOString(),
      trade.direction,
      trade.valueUsd.toFixed(2),
      trade.returnAmount.toFixed(4),
      trade.askDenom,
      trade.offerAmount.toFixed(4),
      trade.offerDenom,
      trade.signer,
      trade.txHash,
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => escapeCell(cell)).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `degenter-trades-${new Date().toISOString()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [filteredTradesForExport]);

  useEffect(() => {
    applyPageMetadata({
      pageName: "Find Trades",
      description: "Find Trades | Degenter.io",
    });
  }, []);

  // Add this to a page component
  // useEffect(() => {
  //   console.log('API_BASE:', process.env.API_BASE_URL);
  // }, []);
  /* -------- Fetch token by route param -------- */
  useEffect(() => {
    if (!tokenDetails) return;

    const tokenSymbol = Array.isArray(tokenDetails)
      ? tokenDetails[0]
      : tokenDetails;
    if (!tokenSymbol || tokenSymbol === "undefined" || tokenSymbol === "null")
      return;

    let active = true;

    const loadToken = async (showLoader = false) => {
      if (showLoader) setLoading(true);
      try {
        const tokenData = await fetchTokenBySymbol(tokenSymbol);
        if (!active) return;
        if (tokenData) {
          setToken({
            ...tokenData,
            icon: tokenData.icon || "/zigicon.png",
          });
          setError(null);
        } else {
          setError("Token not found");
        }
      } catch (err) {
        if (!active) return;
        setError("Failed to load token");
      } finally {
        if (showLoader && active) setLoading(false);
      }
    };

    loadToken(true);
    const intervalId = window.setInterval(() => {
      loadToken(false);
    }, LIVE_PRICE_REFRESH_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [tokenDetails]);

  const toggleAuditPanel = () => {
    setIsAuditPanelVisible((v) => !v);
  };

  useEffect(() => {
    if (!token) return;

    applyTokenPageMetadata({
      tokenKey: token.pair_contract || token.symbol,
      symbol: token.symbol,
      price: token.priceUsd || token.price || 0,
    });
  }, [token]);

  /* -------- UI -------- */
  if (!loading && (!token || error)) {
    return <NotFoundPage />;
  }

  return (
    <FeatureLaunchGate feature="trades">
      <main className="flex min-h-screen flex-col bg-black relative overflow-hidden">
        <div
          className="absolute inset-0 z-1 h-60"
          style={{
            backgroundImage: `
            linear-gradient(
              120deg,
              #14624F 0%,
              #39C8A6 36.7%,
              #FA4E30 66.8%,
              #2D1B45 100%
            )
          `,
            backgroundSize: "cover",
            backgroundRepeat: "no-repeat",
            filter: "saturate(120%) contrast(110%) brightness(0.9)",
          }}
        >
          {/* Soft darkening/vignette to match the reference look */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(to bottom, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.65) 70%, rgba(0,0,0,0.9) 100%), radial-gradient(120% 120% at 50% 0%, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.45) 70%, rgba(0,0,0,0.75) 100%)",
              mixBlendMode: "multiply",
            }}
          />
          {/* Grain/Noise Overlay */}
          <div
            className="absolute inset-0 opacity-40 mix-blend-overlay pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGZpbHRlciBpZD0ibm9pc2UiIHg9IjAlIiB5PSIwJSIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSI+PGZlVHVyYnVsZW5jZSB0eXBlPSJmcmFjdGFsTm9pc2UiIGJhc2VGcmVxdWVuY3k9IjAuOTgiIG51bU9jdGF2ZXM9IjUiIHN0aXRjaFRpbGVzPSJzdGl0Y2giLz48L2ZpbHRlcj48cmVjdCB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgZmlsdGVyPSJ1cmwoI25vaXNlKSIvPjwvc3ZnPg==")`,
              backgroundRepeat: "repeat",
              backgroundSize: "96px 96px",
              filter: "contrast(120%)",
            }}
          />

          {/* Fade overlay to blend bottom edge */}
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-b from-transparent to-black"></div>
        </div>
      <div className="animate-header relative z-20">
        <Navbar />
        <TopMarketToken />
        <FilterTradesTop
          filters={filters}
          filtersOpen={filtersVisible}
          onToggleFilters={toggleFiltersOpen}
          onExport={handleExportCsv}
          hasFilteredTrades={filteredTradesForExport.length > 0}
        />
      </div>

      <div className="relative z-10 w-full px-8 pb-8">
        <div className="mx-auto w-full ">
          <section className="flex w-full flex-col gap-6 md:flex-row">
            <div
              className={`${filtersVisible ? "block" : "hidden"} ${
                filtersVisible ? "md:block" : "md:hidden"
              } md:w-[340px] animate-sidebar`}
            >
              <AssetsFilter
                selectedAssetMode={filters.assetMode}
                onAssetModeChange={(value) => updateFilters({ assetMode: value })}
                selectedTime={filters.timeRange}
                onTimeChange={(value) => updateFilters({ timeRange: value })}
                selectedValue={filters.valueRange}
                onValueChange={(value) => updateFilters({ valueRange: value })}
                selectedToken={filters.tokenDenom}
                onTokenSearch={(value) => updateFilters({ tokenDenom: value })}
                onClearSearch={handleClearTokenSearch}
                tokenOptions={tokenOptions}
                isSearching={false}
                walletAddress={filters.wallet}
                onWalletAddressChange={(value) => updateFilters({ wallet: value })}
                onReset={handleResetFilters}
              />
            </div>
            <div className="flex-1 animate-table">
              <Trades
                filters={filters}
                onAvailableTokens={handleAvailableTokens}
                onFilteredTradesChange={handleFilteredTradesUpdate}
              />
            </div>
          </section>
        </div>
      </div>

      </main>
    </FeatureLaunchGate>
  );
}
