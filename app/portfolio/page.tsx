"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { applyPageMetadata } from "@/lib/page-metadata";
import FeatureLaunchGate from "../components/feature-launch-gate";
import Navbar from "../components/navbar";
import TopMarketToken from "../components/TopMarketToken";
import WalletAnalyzerBoxes, {
  analyzerTabs,
  type AnalyzerTabId,
  type TradingTimeframe,
} from "./WalletAnalyzerPNL/components/WalletAnalyzerBoxes";
import WalletAnalyzerTable from "./WalletAnalyzerPNL/components/WalletAnalyzerTable";
import WalletAnalyzerSidebar from "./WalletAnalyzerPNL/components/WalletAnalyzesSideBar";
import WalletAnalyzerPortfolio from "./WalletAnalyzerPortfolio/components/WalletAnalyzerPortfolio";
import WalletAnalyzerActivities from "./WalletAnalyzerActivities/components/WalletAnalyzerActivities";

export default function Home() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<AnalyzerTabId>(analyzerTabs[0].id);
  const [tradingTimeframe, setTradingTimeframe] =
    useState<TradingTimeframe>("1M");
  const showTradingContent = activeTab === "trading";
  const [isAnimationReady, setIsAnimationReady] = useState(false);
  const addressOverride = searchParams.get("address")?.trim() || "";
  const tabOverride = searchParams.get("tab") as AnalyzerTabId | null;

  useEffect(() => {
    applyPageMetadata({
      pageName: "Portfolio",
      description: "Portfolio | Degenter.io",
    });
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsAnimationReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (
      tabOverride &&
      (tabOverride === "trading" ||
        tabOverride === "portfolio" ||
        tabOverride === "activities")
    ) {
      setActiveTab(tabOverride);
    }
  }, [tabOverride]);

  return (
    <>
      <FeatureLaunchGate feature="portfolio">
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
            <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-b from-transparent to-black"></div>
          </div>
          <div className="z-10">
            <Navbar />
            <TopMarketToken />
          </div>
          <section
            className={`mx-auto w-full px-8 pt-10 drop-from-top ${
              isAnimationReady ? "drop-from-top-active" : ""
            }`}
            style={{ animationDelay: "0.14s" }}
          >
            <div className="grid gap-8 lg:grid-cols-[minmax(0,380px),1fr]">
              <div
                className={`drop-from-top ${isAnimationReady ? "drop-from-top-active" : ""}`}
                style={{ animationDelay: "0.18s" }}
              >
                <WalletAnalyzerSidebar
                  addressOverride={addressOverride || undefined}
                />
              </div>
              <div
                className={`drop-from-top ${isAnimationReady ? "drop-from-top-active" : ""}`}
                style={{ animationDelay: "0.22s" }}
              >
                <WalletAnalyzerBoxes
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                  addressOverride={addressOverride || undefined}
                  timeframe={tradingTimeframe}
                  onTimeframeChange={setTradingTimeframe}
                />
                {!showTradingContent && activeTab === "portfolio" && (
                  <WalletAnalyzerPortfolio
                    addressOverride={addressOverride || undefined}
                  />
                )}
                {!showTradingContent && activeTab === "activities" && (
                  <WalletAnalyzerActivities
                    addressOverride={addressOverride || undefined}
                  />
                )}
              </div>
            </div>
            {showTradingContent && (
              <div
                className={`mt-4 space-y-8 drop-from-top ${
                  isAnimationReady ? "drop-from-top-active" : ""
                }`}
                style={{ animationDelay: "0.26s" }}
              >
                <WalletAnalyzerTable
                  addressOverride={addressOverride || undefined}
                  timeframe={tradingTimeframe}
                />
              </div>
            )}
          </section>
        </main>
      </FeatureLaunchGate>
    </>
  );
}
