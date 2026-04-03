"use client";

import { useState } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  LayoutGrid,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import BubbleMapPanel from "./BubbleMapPanel";
import Coin360Panel from "./Coin360Panel";
import NativeTokenPerformancePanel from "./NativeTokenPerformancePanel";
import IndustriesPanel from "./IndustriesPanel";
import { Token } from "@/types/token";
import MemesToken from "./MemesToken";

type InsightsContentProps = {
  tokens: Token[];
};

const InsightsContent: React.FC<InsightsContentProps> = ({ tokens }) => {
  const [activeSection, setActiveSection] = useState<"market" | "industries">(
    "market"
  );
  const [activeMarketView, setActiveMarketView] = useState<
    "bubble" | "coin360" | "native-performance"
  >("bubble");
  const [activeIndustryView, setActiveIndustryView] = useState<
    "memes-token" | "capital-flow"
  >("memes-token");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMarketTrendsOpen, setIsMarketTrendsOpen] = useState(true);
  const [isIndustriesOpen, setIsIndustriesOpen] = useState(false);
  const isMarketSectionActive = activeSection === "market";
  const isIndustriesSectionActive = activeSection === "industries";
  const sectionLabel =
    activeSection === "market" ? "Market Trends" : "Industries";
  const insightName =
    activeSection === "market"
      ? activeMarketView === "bubble"
        ? "Bubble Map"
        : activeMarketView === "coin360"
        ? "Coin 360"
        : "Token Performance"
      : activeIndustryView === "memes-token"
      ? "Meme Tokens"
      : "Capital flow snapshot";

  const normalizedTokens = tokens.map((token) => ({
    ...token,
    name: token.name ?? token.symbol,
    volume:
      typeof token.volume === "number"
        ? { default: token.volume }
        : token.volume,
    volumeUSD:
      typeof token.volumeUSD === "number"
        ? { default: token.volumeUSD }
        : token.volumeUSD,
  }));

  return (
    <div className="flex flex-1 min-h-0 flex-col px-6">
      <header className="flex items-center gap-3 px-4 py-3  relative z-20  py-8">
        <button
          className="text-zinc-400 hover:text-white"
          onClick={() => setIsSidebarOpen((prev) => !prev)}
          aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
        >
          {isSidebarOpen ? (
            <PanelLeftClose size={18} />
          ) : (
            <PanelLeftOpen size={18} />
          )}
        </button>
        <h2 className="text-white font-semibold uppercase text-sm">Insights</h2>
        <span className="text-zinc-400 text-sm">
          / {sectionLabel} / {insightName}
        </span>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside
          className={`hidden md:flex flex-col transition-[width] duration-200 ${
            isSidebarOpen ? "w-64 border-r border-zinc-800" : "w-0"
          }`}
        >
          <div
            className={`flex-1 p-4 transition-opacity duration-200 ${
              isSidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <h2 className="text-white font-bold mb-6 flex items-center gap-2">
              <LayoutGrid size={20} /> INSIGHTS
            </h2>

            {/* <div className="relative mb-6">
              <Search className="absolute left-3 top-2.5 text-zinc-500" size={16} />
              <input
                placeholder="Search insight"
                className="w-full bg-zinc-900 border-none rounded py-2 pl-10 text-sm focus:ring-1 ring-orange-500"
              />
            </div> */}

            <nav className="space-y-4 text-sm">
              <div>
                <button
                  className={`w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wider mb-2 ${
                    isMarketSectionActive ? "text-white" : "text-zinc-300"
                  } hover:text-zinc-400`}
                  onClick={() => {
                    setActiveSection("market");
                    setIsMarketTrendsOpen((prev) => !prev);
                  }}
                  aria-expanded={isMarketTrendsOpen}
                  aria-controls="market-trends-list"
                >
                  <span>Market Trends</span>
                  {isMarketTrendsOpen ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </button>
                {isMarketTrendsOpen ? (
                  <div id="market-trends-list" className="space-y-1">
                    <button
                      className={`w-full flex items-center gap-3 p-2 rounded text-left ${
                        activeMarketView === "bubble"
                          ? "bg-zinc-900 text-[#39C8A6]"
                          : "hover:bg-zinc-900 text-zinc-400"
                      }`}
                      onClick={() => {
                        setActiveSection("market");
                        setActiveMarketView("bubble");
                      }}
                    >
                      <div
                        className={`w-1 h-4 rounded-full ${
                          activeMarketView === "bubble"
                            ? "bg-[#39C8A6]"
                            : "bg-zinc-700"
                        }`}
                      />
                      Bubble map
                    </button>
                    <button
                      className={`w-full flex items-center gap-3 p-2 rounded text-left ${
                        activeMarketView === "coin360"
                          ? "bg-zinc-900 text-[#FA4E30]"
                          : "hover:bg-zinc-900 text-zinc-400"
                      }`}
                      onClick={() => {
                        setActiveSection("market");
                        setActiveMarketView("coin360");
                      }}
                    >
                      <div
                        className={`w-1 h-4 rounded-full ${
                          activeMarketView === "coin360"
                            ? "bg-[#FA4E30]"
                            : "bg-zinc-700"
                        }`}
                      />
                      Coin 360
                    </button>
                    <button
                      className={`w-full flex items-center gap-3 p-2 rounded text-left ${
                        activeMarketView === "native-performance"
                          ? "bg-zinc-900 text-[#51179cff]"
                          : "hover:bg-zinc-900 text-zinc-400"
                      }`}
                      onClick={() => {
                        setActiveSection("market");
                        setActiveMarketView("native-performance");
                      }}
                    >
                      <div
                        className={`w-1 h-4 rounded-full ${
                          activeMarketView === "native-performance"
                            ? "bg-[#51179cff]"
                            : "bg-zinc-700"
                        }`}
                      />
                      Token performances
                    </button>
                  </div>
                ) : null}
              </div>
              <div>
                <button
                  className={`w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wider mb-2 ${
                    isIndustriesSectionActive ? "text-white" : "text-zinc-300"
                  } hover:text-zinc-400`}
                  onClick={() => {
                    setActiveSection("industries");
                    setIsIndustriesOpen((prev) => !prev);
                  }}
                  aria-expanded={isIndustriesOpen}
                  aria-controls="industries-list"
                >
                  <span>Industries</span>
                  {isIndustriesOpen ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </button>
                {isIndustriesOpen ? (
                  <div
                    id="industries-list"
                    className="space-y-1"
                  >
                    <button
                      className={`w-full flex items-center gap-3 p-2 rounded text-left ${
                        activeIndustryView === "memes-token"
                          ? "bg-zinc-900 text-[#8CBCF8]"
                          : "hover:bg-zinc-900 text-zinc-400"
                      }`}
                      onClick={() => {
                        setActiveSection("industries");
                        setActiveIndustryView("memes-token");
                      }}
                    >
                      <div
                        className={`w-1 h-4 rounded-full ${
                          activeIndustryView === "memes-token"
                            ? "bg-[#8CBCF8]"
                            : "bg-zinc-700"
                        }`}
                      />
                      Meme Tokens
                    </button>
                  </div>
                ) : null}
              </div>
            </nav>
        </div>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {activeSection === "market" ? (
            activeMarketView === "bubble" ? (
              <BubbleMapPanel data={normalizedTokens} />
            ) : activeMarketView === "coin360" ? (
              <Coin360Panel data={normalizedTokens} />
            ) : (
              <NativeTokenPerformancePanel data={normalizedTokens} />
            )
          ) : (
            // <IndustriesPanel data={tokens} view={activeIndustryView} />
            <MemesToken/>
          )}
        </main>
      </div>
    </div>
  );
};

export default InsightsContent;
