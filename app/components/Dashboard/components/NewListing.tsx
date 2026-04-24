"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import React from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { DashboardToken } from "@/types/dashboard";
import NewTokenBadge from "./NewTokenBadge";
import { isTokenNew } from "@/lib/tokenUtils";
import { storeTokenRoute } from "@/lib/token-routing";
import LowLiquidityBadge, { hasLowLiquidity } from "./LiquidityWarning";

const NewListing: React.FC<{ LatestListing: DashboardToken[] }> = ({
  LatestListing,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const cards = cardsRef.current;
    const scrollContainer = scrollContainerRef.current;

    if (!scrollContainer || cards.length === 0) return;

    // Small performance-friendly tweaks: use a short scrub to make the
    // animation feel responsive and avoid heavy layout thrashing.
    const ctx = gsap.context(() => {
      cards.forEach((card, index) => {
        const nextCard = cards[index + 1];
        if (!nextCard) return;

        gsap.to(card, {
          scale: 0.92,
          opacity: 0,
          ease: "power1.out",
          overwrite: true,
          immediateRender: false,
          scrollTrigger: {
            trigger: nextCard,
            scroller: scrollContainer,
            start: "top 130px",
            end: "top 20px",
            // use a small scrub value for smooth, natural follow-through
            scrub: 0.2,
            // make scroll handling more forgiving on fast flicks
            fastScrollEnd: true,
          },
        });
      });
    }, scrollContainerRef); // Scope to container

    return () => ctx.revert();
  }, [LatestListing]); // Re-run if list changes

  const formatZigShort = (value: string) => {
    if (/^zig/i.test(value) && value.length > 12) {
      return `${value.slice(0, 6)}...${value.slice(-4)}`;
    }
    return value;
  };

  const formatDenom = (denom: string) => {
    const zigShort = formatZigShort(denom);
    if (zigShort !== denom) return zigShort;
    if (denom.length <= 10) return denom;
    return denom.substring(0, 16) + "..." + denom.slice(-8);
  };

  const getDisplayName = (token: DashboardToken) => {
    const name = token.name || "";
    const symbol = token.symbol || "";
    if (name.toLowerCase().includes("coin") && symbol) return symbol;
    const display = name || symbol;
    return formatZigShort(display);
  };

  // Sort tokens by creationTime in descending order (newest first)
  const sortedTokens = [...LatestListing].sort((a, b) => {
    const timeA = new Date(a.creationTime || 0).getTime();
    const timeB = new Date(b.creationTime || 0).getTime();
    return timeB - timeA;
  });
  const latestTen = sortedTokens.slice(0, 10);

  if (!latestTen.length) {
    return (
      <div className="bg-black/30 rounded-lg border border-[#808080]/20 shadow-2xl relative overflow-hidden">
        <div
          className="relative z-10 mx-auto w-full py-4 px-2 sm:px-3 min-h-[560px] flex items-center justify-center"
          style={{
            background:
              "linear-gradient(110deg, #000000 0%, #0a2e1f 80%, #095c39ff 100%)",
          }}
        >
          <div className="text-center">
            <p className="text-white/80 text-lg font-medium">No tokens found</p>
            <p className="text-white/50 text-sm mt-2">
              No new listings are available right now.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-black/30 rounded-lg border border-[#808080]/20 shadow-2xl relative overflow-hidden">
    {/* //   <div className="w-[1000px] h-[600px] absolute z-[-10] top-[-80px] right-[-350px] rounded-xl bg-[radial-gradient(circle,_rgba(57,200,166,0.2)_0%,_rgba(57,200,166,0.6)_10%,_transparent_70%)] blur-2xl shadow-[0_0_40px_rgba(57,200,166,0.5)]"></div> */}
    <div className="relative z-10 mx-auto w-full py-4 px-2 sm:px-3"
      style={{ background: `linear-gradient(110deg, #000000 0%, #0a2e1f 80%, #095c39ff 100%)` }}>
      <div className="flex items-center justify-between pl-2">
        <div className="flex items-center space-x-2">
          <Image
            src="/startNewListing.png"
            alt="Fire Icon"
            width={16}
            height={16}
            className="w-5 h-5 rounded-full object-cover "
          />
          <h2 className="text-white text-lg sm:text-xl font-medium">New Listing</h2>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        // enable iOS momentum and hint to browser for smoother scrolling
        style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", scrollbarGutter: "stable", overscrollBehavior: "contain" }}
        className="space-y-4 mt-2 h-[460px] sm:h-[525px] px-1 sm:px-2 overflow-y-auto overflow-hidden rounded-xl scroll-smooth
      [&::-webkit-scrollbar]:w-2
      [&::-webkit-scrollbar-track]:bg-transparent
      [&::-webkit-scrollbar-thumb]:bg-[#FDFDFD]/10
      [&::-webkit-scrollbar-thumb:hover]:bg-[#FDFDFD]/5
      [&::-webkit-scrollbar-thumb]:rounded-full
      [&::-webkit-scrollbar-thumb]:border-0"
      >
        {latestTen.map((token, index) => (
          <div
            key={token.id || index}
            ref={(el) => {
              if (el) cardsRef.current[index] = el;
            }}
            // hint to the browser to use GPU for transforms & opacity changes
            style={{ willChange: "transform, opacity", transform: "translateZ(0)", backfaceVisibility: "hidden" }}
            className="sticky top-0 bg-black rounded-lg p-2 sm:p-3 hover:bg-black/90 transition-colors origin-top z-20"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 w-full">
              <div className="w-[72px] h-[72px] sm:w-[88px] sm:h-[88px] 2xl:w-[104px] 2xl:h-[104px] overflow-hidden rounded-lg bg-white shrink-0 self-center sm:self-auto">
                <Image
                  src={token.image || "/Bitcoin.webp"}
                  alt={getDisplayName(token)}
                  className="w-full h-full object-cover"
                  width={104}
                  height={104}
                />
              </div>

              <div className="flex flex-col justify-between w-full min-w-0">
                <div className="flex flex-col lg:flex-row lg:justify-between gap-3 w-full">
                  <div className="flex flex-col justify-center min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <div className="text-white font-medium text-xl sm:text-[1.35rem] break-words">
                        {getDisplayName(token)}
                      </div>
                      {hasLowLiquidity(token) && <LowLiquidityBadge />}
                      {isTokenNew(token.creationTime) && <NewTokenBadge />}
                    </div>
                    <div className="text-[#919191] text-sm break-all">
                      {formatZigShort(token.symbol || "")}
                    </div>
                    <div className="text-[#919191] text-xs break-all">
                      {formatDenom(token.denom || "")}
                    </div>
                  </div>
                  <div className="flex flex-col items-stretch sm:items-start overflow-hidden w-full lg:w-auto">
                    <Link
                      href={`/token/${storeTokenRoute(token.denom, token.symbol)}`}
                      className="w-full lg:w-auto"
                    >
                      <button className="bg-[#FA4E30] text-[#FFFFFF] w-full lg:w-auto px-6 sm:px-12 py-2 rounded-lg">
                        Trade
                      </button>
                    </Link>
                    <div className="flex flex-col justify-start gap-1 w-full mt-2">
                      <div className="flex items-center justify-between w-full font-normal">
                        <div className="text-white text-xs ">MCap</div>
                        {/* <div className="text-white text-xs">
                          {token.market_cap
                            ? `$${(token.market_cap / 1000000).toFixed(1)}M`
                            : "N/A"}
                        </div> */}
                        <div className="text-white text-xs">
                          {token.market_cap.toFixed(2)}
                        </div>
                      </div>
                      <div className="flex items-center justify-between w-full font-normal">
                        <div className="text-white text-xs">24h Chg</div>
                        {token.denom?.startsWith("ibc/") ? (
                          <span className="text-gray-400 text-xs">-</span>
                        ) : (
                          <div
                            className={`text-xs ${token.price_change_percentage_24h >= 0
                                ? "text-green-400"
                                : "text-red-400"
                              }`}
                          >
                            {token.price_change_percentage_24h
                              ? `${token.price_change_percentage_24h >= 0
                                ? "+"
                                : ""
                              }${token.price_change_percentage_24h.toFixed(
                                2
                              )}%`
                              : "-"}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between w-full font-normal">
                        <div className="text-white text-xs">Holders</div>
                        <div className="text-white text-xs">
                          {token.holders || "-"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {/* progress bar (no finishing badge by design) */}
                <div className="w-full mt-3 flex items-center gap-2">
                  <div className="flex-1 h-[6px] rounded-full bg-[#1A1A1A] overflow-hidden">
                    <div
                      className={`h-full rounded-full [background-image:linear-gradient(to_right,#FA4E30_37%,#39C8A6_67%)]`}
                      style={{ width: "100%" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[300px] z-20 bg-gradient-to-t from-black/90 to-transparent pointer-events-none" />
    </div>
    </div>
  );
};

export default NewListing;
