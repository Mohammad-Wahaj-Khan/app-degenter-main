"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { tokenAPI } from "@/lib/api";
import Navbar from "@/app/components/navbar";
import SwapPanel from "@/app/components/swap-panel";
import TopMarketToken from "@/app/components/TopMarketToken";
import TradingChart from "@/app/components/tradingchart";
import AuditPanel from "@/app/components/audit-panel";
import Footer from "@/app/components/footer";
import RecentTrades, { type SignerFilterSummary } from "@/app/components/RecentTrades";
import TopHolders from "@/app/components/TopHolders";
import Security from "@/app/components/Security";
import TopTrades from "@/app/components/TopTrades";
import AddLeft from "@/app/components/add-left";
import MySwaps from "@/app/components/MySwaps";
import NotFoundPage from "@/app/not-found";
import Markets from "@/app/components/Markets";
// import  HoldersBubble from "@/app/components/HoldersBubble";

interface Token {
  id: number;
  name: string;
  symbol: string;
  denom?: string;
  pair_contract: string;
  price: number;
  priceUsd: number;
  change24h: number;
  icon: string | null;
  liquidity: number;
  marketCap: number;
  fdv: number;
  volume: Record<string, number>;
  txCount: Record<string, number>;
  circulatingSupply: number;
  totalSupply: number;
  maxSupply: number;
  holders: number;
  txBuy: number;
  txSell: number;
}

const fetchTokenBySymbol = async (symbol: string): Promise<Token | null> => {
  try {
    const res = await tokenAPI.getTokenDetailsBySymbol(symbol, "best", true);
    const detail = res?.data;
    if (!detail) return null;

    const token = detail.token || {};
    const denom = token.denom;
    const fallback = token.symbol || token.name || token.tokenId || symbol;
    const priceChange = detail.price?.changePct || detail.priceChange;

    return {
      id: Number(token.tokenId || 0),
      pair_contract: denom ? (denom.startsWith("ibc/") ? fallback : denom) : fallback,
      name: token.name || "Unknown Token",
      symbol: token.symbol || symbol,
      price: detail.price?.native || detail.priceInNative || 0,
      priceUsd: detail.price?.usd || detail.priceInUsd || 0,
      change24h: priceChange?.["24h"] || 0,
      icon: token.imageUri || null,
      liquidity: detail.liquidity || 0,
      marketCap: detail.mcapDetail?.usd || detail.mc || 0,
      fdv: detail.fdvDetail?.usd || detail.fdv || 0,
      maxSupply: detail.supply?.max || detail.circulatingSupply || 0,
      volume: {
        "30m": detail.volume?.["30m"] || 0,
        "1h": detail.volume?.["1h"] || 0,
        "4h": detail.volume?.["4h"] || 0,
        "24h": detail.volume?.["24h"] || 0,
      },
      txCount: {
        "30m": detail.txBuckets?.["30m"] || 0,
        "1h": detail.txBuckets?.["1h"] || 0,
        "4h": detail.txBuckets?.["4h"] || 0,
        "24h": detail.txBuckets?.["24h"] || 0,
        "30d": 0,
      },
      circulatingSupply: detail.supply?.circulating || detail.circulatingSupply || 0,
      totalSupply: detail.supply?.max || detail.circulatingSupply || 0,
      holders: Number(detail.holder || 0),
      txBuy: detail.buy || 0,
      txSell: detail.sell || 0,
    };
  } catch (error) {
    console.error("Error fetching token details:", error);
    return null;
  }
};

type ViewTab = "trades" | "holders" | "topTrades" | "security" | "mySwaps";

export default function PairDetails() {
  const { tokenDetails } = useParams();
  const [token, setToken] = useState<Token | null>(null);
  const [isAuditPanelVisible, setIsAuditPanelVisible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>("trades");
  const [signerSummary, setSignerSummary] = useState<SignerFilterSummary | null>(null);
  const [showHolderModal, setShowHolderModal] = useState(false);

  useEffect(() => {
    if (!tokenDetails) return;
    const symbol = Array.isArray(tokenDetails) ? tokenDetails[0] : tokenDetails;
    if (!symbol || symbol === "undefined" || symbol === "null") return;

    setLoading(true);
    setError(null);
    fetchTokenBySymbol(symbol)
      .then((data) => {
        if (data) {
          setToken(data);
        } else {
          setError("Token not found");
        }
      })
      .catch(() => setError("Failed to load token"))
      .finally(() => setLoading(false));
  }, [tokenDetails]);

  if (!loading && (error || !token)) {
    return <NotFoundPage />;
  }

  const tabButtons = [
    { key: "trades", label: "Recent Trades" },
    { key: "holders", label: "Top Holders" },
    { key: "topTrades", label: "Top Trades" },
    { key: "security", label: "Security" },
    { key: "mySwaps", label: "My Swaps" },
    // { key: "markets", label: "Markets" },
  ];
  const toggleAuditPanel = () => {
    setIsAuditPanelVisible((v) => !v);
  };
  const auditTokenKey = token?.denom || token?.pair_contract || null;
  return (
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
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(to bottom, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.65) 70%, rgba(0,0,0,0.9) 100%), radial-gradient(120% 120% at 50% 0%, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.45) 70%, rgba(0,0,0,0.75) 100%)",
            mixBlendMode: "multiply",
          }}
        />
        <div
          className="absolute inset-0 opacity-40 mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGZpbHRlciBpZD0ibm9pc2UiIHg9IjAlIiB5PSIwJSIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSI+PGZlVHVyYnVsZW5jZSB0eXBlPSJmcmFjdGFsTm9pc2UiIGJhc2VGcmVxdWVuY3k9IjAuOTgiIG51bU9jdGF2ZXM9IjUiIHN0aXRjaFRpbGVzPSJzdGl0Y2giLz48L2ZpbHRlcj48cmVjdCB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgZmlsdGVyPSJ1cmwoI25vaXNlKSIvPjwvc3ZnPg==")`,
            backgroundRepeat: "repeat",
            backgroundSize: "96px 96px",
            filter: "contrast(120%)",
          }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-b from-transparent to-black" />
      </div>

      <Navbar />
      <TopMarketToken />

      <div className="flex flex-col max-w-8xl mx-auto w-full px-4 md:px-6 lg:px-8 py-4 space-y-4">
        {/* Wrapper: On large screens → row layout, on mobile → stacked */}
        <div
          className={`flex flex-col lg:flex-row gap-4 w-full ${isAuditPanelVisible}`}
        >
          {/* Left / Sidebar: Swap Panel */}
          <div className="hidden lg:block lg:order-1 w-full lg:w-80 flex-shrink-0">
            {token ? (
              <SwapPanel params={{ token: token.pair_contract }} />
            ) : (
              <AddLeft />
            )}
          </div>

          {/* Main Content */}
          <div className="order-1 lg:order-2 flex-1 flex flex-col">
            {/* Chart + Audit */}
            <div
              className={`flex flex-col lg:flex-row  w-full px-2 md:p-0 ${
                isAuditPanelVisible ? "lg:gap-4" : ""
              }`}
            >
              {/* Trading Chart */}
              <div className="flex-1 ">
                {token ? (
                  <TradingChart
                    token={token.pair_contract}
                    onToggleAuditPanel={toggleAuditPanel}
                    isAuditPanelVisible={isAuditPanelVisible}
                    signerSummary={signerSummary}
                  />
                ) : (
                  <div className="flex items-center justify-center h-[400px] text-gray-400">
                    Loading chart...
                  </div>
                )}
              </div>

              <div className="flex-1 lg:hidden ">
                {token ? (
                  <SwapPanel params={{ token: token.pair_contract }} />
                ) : (
                  <AddLeft />
                )}
              </div>

              {/* Audit Panel */}
              <div
                className={`transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden flex-shrink-0 block 
                ${
                  isAuditPanelVisible
                    ? "w-full lg:w-80 opacity-100 ml-0"
                    : "w-0 lg:w-0 opacity-0 "
                }`}
                style={{
                  transitionProperty: "width, opacity, margin-left",
                  willChange: "width, opacity, margin-left",
                }}
              >
                <div className="w-full lg:w-80">
                  <AuditPanel tokenKey={auditTokenKey} />
                </div>
              </div>
            </div>

            {/* Tabs + Tables */}
            <div className="mt-4 w-full p-2 md:p-0">
              {/* <div className="relative mb-1 border-t border-x border-[#808080]/20 rounded-t-md py-2 px-4 overflow-x-auto">
                <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-[#FA4E30] to-[#39C8A6]" />
                <div className="flex space-x-4 min-w-max">
                  {[
                    { key: "trades", label: "Recent Trades" },
                    { key: "holders", label: "Top Holders" },
                    { key: "topTrades", label: "Top Trades" },
                    { key: "security", label: "Security" },
                    { key: "mySwaps", label: "My Swaps" },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      data-tab={tab.key}
                      onClick={() => setActiveTab(tab.key as any)}
                      className={`px-4 py-2 font-medium whitespace-nowrap ${
                        activeTab === tab.key
                          ? "text-white bg-[#1C1C1C] p-2 rounded my-2"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div> */}

              <div className="relative mb-1 border-t border-x border-[#808080]/20 rounded-t-md py-2 px-4 overflow-x-auto">
                <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-[#FA4E30] to-[#39C8A6]" />
                <div className="flex items-center justify-between min-w-max gap-4">
                  <div className="flex space-x-4">
                  {tabButtons.map((tab) => (
                    <button
                      key={tab.key}
                      data-tab={tab.key}
                      onClick={() => setActiveTab(tab.key as ViewTab)}
                      className={`px-4 py-2 font-medium whitespace-nowrap ${
                        activeTab === tab.key
                          ? "text-white bg-[#1C1C1C] p-2 rounded my-2"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                  </div>
                  {/* <button
                    type="button"
                    aria-label="Open holder bubble map"
                    onClick={() => setShowHolderModal(true)}
                    className="flex items-center justify-center h-10 w-10 rounded-full bg-white/5 border border-white/15 transition hover:bg-white/10"
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <defs>
                        <linearGradient id="bubbleIconGradient" x1="0" y1="0" x2="18" y2="18">
                          <stop offset="0%" stopColor="#39C8A6" />
                          <stop offset="100%" stopColor="#FA4E30" />
                        </linearGradient>
                      </defs>
                      <circle cx="6.2" cy="7.8" r="3" fill="#39C8A6" />
                      <circle cx="10.8" cy="6.5" r="2.4" fill="#FA4E30" />
                      <circle cx="11" cy="11" r="1.8" fill="#5EFFC8" />
                    </svg>
                  </button> */}
                </div>
              </div>


              <div className="min-h-[400px]">
                {activeTab === "trades" ? (
                  <RecentTrades
                    tokenId={token?.pair_contract}
                    onSignerFilterChange={setSignerSummary}
                  />
                ) : activeTab === "holders" ? (
                  <TopHolders tokenId={token?.pair_contract} />
                ) : activeTab === "security" ? (
                  <Security
                    tokenId={token?.id}
                    tokenKey={token?.pair_contract}
                  />
                ) : activeTab === "topTrades" ? (
                  <TopTrades tokenId={token?.pair_contract} />
                ) : activeTab === "mySwaps" ? (
                  <MySwaps tokenId={token?.pair_contract} />
                // ) : activeTab === "markets" ? (
                //   <Markets denom={token?.denom || token?.pair_contract} />
                ) : (
                  <AuditPanel tokenKey={auditTokenKey} />
                )}
              </div>
          </div>
        </div>
        </div>
      </div>

      <Footer />

      {/* {showHolderModal && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-stretch justify-center">
          <div className="relative h-full w-full overflow-hidden">
            <button
              type="button"
              className="absolute top-5 right-6 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 border border-white/30 text-2xl leading-none text-white hover:bg-black/80"
              aria-label="Close holder bubble"
              onClick={() => setShowHolderModal(false)}
            >
              ×
            </button>
            <div className="h-full w-full overflow-hidden">
              <HoldersBubble tokenId={token?.pair_contract ?? token?.symbol ?? "stzig"} />
            </div>
          </div>
        </div>
      )} */}
    </main>
  );
}
