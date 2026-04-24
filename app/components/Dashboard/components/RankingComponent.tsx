"use client";

import Image from "next/image";
import React from "react";
import LOGO from "../../public/degenterminalLogo.svg";

export interface RankingItem {
  id: string;
  rank: number;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  total_volume: number;
  image: string;
  tx: number;
  tokenId?: string;
  color?: string;
  textGradient?: string;
  // Add other token properties as needed
}

export interface Token {
  id: string;
  rank?: number;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  total_volume: number;
  image: string;
  tx: number;
  tokenId?: string;
}

const RankingComponent: React.FC<{
  rankedTokens: Token[];
  loading?: boolean;
}> = ({ rankedTokens, loading = false }) => {
  const getQuoteSymbol = (symbol?: string) =>
    symbol?.trim().toUpperCase() === "ZIG" ? "USDC" : "ZIG";

  // Ensure rankedTokens is valid and has at least 5 items
  const safeRankedTokens = rankedTokens || [];
  const top5Tokens = safeRankedTokens.slice(0, 5);

  // Fill with default data if we don't have enough tokens
  const defaultToken: RankingItem = {
    id: "0",
    rank: 0,
    name: "Loading...",
    symbol: "N/A",
    current_price: 0,
    price_change_percentage_24h: 0,
    market_cap: 0,
    total_volume: 0,
    image: "",
    tx: 0,
    color: "from-gray-500 to-gray-600",
    textGradient: "from-gray-400 to-gray-500",
  };

  while (top5Tokens.length < 5) {
    top5Tokens.push({ ...defaultToken, rank: top5Tokens.length + 1 });
  }

  const rankings: RankingItem[] = top5Tokens.map((token, index) => ({
    id: token.id || `${index + 1}`,
    rank: index + 1,
    name: token.name || "N/A",
    symbol: token.symbol || "N/A",
    current_price: token.current_price || 0,
    price_change_percentage_24h: token.price_change_percentage_24h || 0,
    market_cap: token.market_cap || 0,
    total_volume: token.total_volume || 0,
    image: token.image || "",
    tx: token.tx || 0,
    tokenId: token.tokenId,
    color:
      index === 0
        ? "from-[#FF4D00]/30 via-[#FA4E30]/60 to-[#FF4D00]/90"
        : index === 1
        ? "from-[#0D0604] via-[#0A2C1F] to-[#0CC383]/80"
        : index === 2
        ? "from-[#0D0604] via-[#0A2C1F] to-[#0CC383]/80"
        : index === 3
        ? "from-[#0D0604] via-[#0A2C1F] to-[#0CC383]/80"
        : "from-[#0D0604] via-[#0A2C1F] to-[#0CC383]/80",
    textGradient:
      index === 0
        ? "from-[#FFD700] to-[#FFA500]"
        : index === 1
        ? "from-[#2AE5AA] to-[#104D35]"
        : index === 2
        ? "from-[#9C5E83] to-[#171717]"
        : index === 3
        ? "from-[#737373] to-[#111111]"
        : "from-[#737373] to-[#111111]",
  }));

  const getRankDisplay = (rank: number) => {
    const suffixes = ["st", "nd", "rd", "th"];
    const suffix = rank <= 3 ? suffixes[rank - 1] : suffixes[3];
    return { number: rank, suffix };
  };

  if (loading) {
    return (
      <div className="bg-black/30 rounded-lg border border-[#808080]/20 px-6 py-6 lg:min-h-[500px] lg:max-h-[500px] overflow-hidden relative">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center justify-center space-x-2 w-full">
            <div className="w-5 h-5 bg-white/10 rounded-full animate-pulse"></div>
            <h2 className="h-6 bg-white/10 rounded w-32 animate-pulse"></h2>
          </div>
        </div>

        <div className="space-y-6">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="relative h-[70px] rounded-3xl overflow-visible"
            >
              <div className="absolute inset-0 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 z-10" />
              <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-white/10 rounded-2xl" />

              <div className="relative z-20 p-4 h-full">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 w-full">
                    <div className="w-16 h-16 bg-white/10 rounded-full animate-pulse"></div>
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-white/10 rounded animate-pulse w-24"></div>
                      <div className="h-3 bg-white/10 rounded animate-pulse w-16"></div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-4 bg-white/10 rounded animate-pulse w-20"></div>
                      <div className="h-3 bg-white/10 rounded animate-pulse w-12 ml-auto"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-black/30 rounded-lg border border-[#808080]/20 px-4 md:px-12 py-6 lg:min-h-[500px] lg:max-h-[500px] overflow-hidden relative">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center justify-center space-x-2 w-full">
          <Image src="/startRanking.png" width={14} height={14} alt="star" />
          <h2 className="text-white text-[1.4rem] font-medium">Hot Pairs</h2>
        </div>
      </div>

      <div className="space-y-10">
        {rankings.map((item, index) => {
          const rankDisplay = getRankDisplay(item.rank);
          return (
            <div
              key={index}
              className={`relative h-[70px] rounded-3xl overflow-visible ${
                index === 0 ? "shadow-[0_0_30px_5px_rgba(239,68,68,0.3)]" : ""
              }`}
            >
              {/* Glass border effect */}
              <div
                className={`absolute inset-0 bg-gradient-to-r from-white/5 to-white/10 backdrop-blur-sm rounded-2xl border border-white/10 z-10 ${
                  index === 0 ? "shadow-[0_0_56px_2px_rgba(239,68,68,0.5)]" : ""
                }`}
                style={index === 0 ? { transform: "translateZ(0)" } : {}}
              />

              {/* Main gradient background */}
              <div
                className={`absolute inset-0 bg-gradient-to-r ${item.color} rounded-2xl`}
              />

              <div className="relative z-20 p-4 h-full">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-3 w-full">
                    <span className="relative">
                      <span
                        className={`text-[8.5rem] font-normal absolute top-[-110px] left-[0px] md:left-[30px] z-20 bg-clip-text text-transparent bg-gradient-to-b ${item.textGradient}`}
                      >
                        {item.rank}
                      </span>
                      <span
                        className={`absolute z-20 bg-clip-text text-transparent bg-gradient-to-b ${
                          item.textGradient
                        } ${
                          item.rank === 1
                            ? "text-[2.2rem] left-[45px] md:left-[70px] top-[-9px]"
                            : item.rank === 2
                            ? "text-[2rem] left-[65px] md:left-[85px] top-[-11px]"
                            : item.rank === 3
                            ? "text-[1.8rem] left-[70px] md:left-[100px] top-[-2px]"
                            : item.rank === 4
                            ? "text-[1.6rem] left-[80px] md:left-[110px] top-[-2px]"
                            : "text-[1.5rem] left-[80px] md:left-[105px] top-[-2px]" // for rank 5
                        }`}
                      >
                        {getRankDisplay(item.rank).suffix}
                      </span>
                    </span>
                    <div className="flex items-center w-full">
                      <div className="flex items-center justify-between ml-28 md:ml-36 w-full">
                        <div className="flex items-center space-x-3">
                          {item.image ? (
                            <Image
                              src={item.image}
                              width={40}
                              height={40}
                              className="rounded-full"
                              alt="Token Image"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-black/50 animate-pulse"></div>
                          )}
                          <div className="text-white text-[1.1rem] flex flex-col justify-start gap-0 font-medium">
                            {item.symbol}
                            <span className="text-[#CECECE] text-xs font-normal">
                              {" "}
                              / {getQuoteSymbol(item.symbol)}
                            </span>
                          </div>
                        </div>
                        <div className="text-xs font-normal text-white flex flex-col items-end">
                          <div>{item.current_price.toFixed(6)}</div>
                          <div>
                            {item.price_change_percentage_24h.toFixed(2)}%
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Background pattern */}
              <div className="absolute top-0 right-0 w-20 h-20 opacity-10">
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  <path
                    d="M20,20 L80,20 L80,80 L20,80 Z"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                  />
                  <path
                    d="M30,40 L70,40 M30,50 L70,50 M30,60 L70,60"
                    stroke="white"
                    strokeWidth="1"
                  />
                </svg>
              </div>
            </div>
          );
        })}
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[200px] z-20 bg-gradient-to-t from-black/90 to-transparent pointer-events-none" />
    </div>
  );
};

export default RankingComponent;
