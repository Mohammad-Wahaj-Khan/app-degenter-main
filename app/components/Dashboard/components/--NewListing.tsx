"use client";

import Image from "next/image";
import React from "react";
import { Token } from "./TopTokensTable";
import Link from "next/link";

interface NewListingItem {
  name: string;
  denom?: string;
  symbol: string;
  price: string;
  change: string;
  volume: string;
  market_cap: string;
  image?: string;
  holders: string;
}

const NewListing: React.FC<{ LatestListing: Token[] }> = ({
  LatestListing,
}) => {
  const formatDenom = (denom: string) => {
    if (denom.length <= 10) return denom;
    return denom.substring(0, 16) + "..." + denom.slice(-8);
  };

  return (
    <div className="bg-black/50 rounded-lg border border-[#808080]/20 py-4 px-2 relative overflow-hidden  min-h-[600px]">
      <div className="w-[1000px] h-[600px] absolute z-[-10] top-[-80px] right-[-350px] rounded-xl bg-[radial-gradient(circle,_rgba(57,200,166,0.2)_0%,_rgba(57,200,166,0.6)_10%,_transparent_70%)] blur-2xl shadow-[0_0_40px_rgba(57,200,166,0.5)]"></div>
      <div className="flex items-center justify-between pl-2">
        <div className="flex items-center space-x-2">
          <Image
            src="/startNewListing.png"
            alt="Fire Icon"
            width={16}
            height={16}
            className="w-5 h-5 rounded-full object-cover "
          />
          <h2 className="text-white text-lg font-medium">New Listing</h2>
        </div>
      </div>

      <div
        className="space-y-4 mt-2 h-[500px] min-w-auto sm:min-w-[500px] px-2 overflow-y-auto overflow-hidden rounded-xl scroll-smooth
      [&::-webkit-scrollbar]:w-2
      [&::-webkit-scrollbar-track]:bg-transparent
      [&::-webkit-scrollbar-thumb]:bg-[#FDFDFD]/10
      [&::-webkit-scrollbar-thumb:hover]:bg-[#FDFDFD]/20
      [&::-webkit-scrollbar-thumb]:rounded-full
      [&::-webkit-scrollbar-thumb]:border-0"
      >
        {LatestListing.map((token, index) => (
          <div
            key={token.id || index}
            className="bg-black/50 rounded-lg p-2 hover:bg-black/50 transition-colors "
          >
            <div className="flex sm:flex-row flex-col items-center gap-8 w-full">
              <Image
                src={token.image || "/Bitcoin.webp"}
                alt={token.name}
                className="rounded-lg bg-white"
                width={120}
                height={120}
              />

              <div className="flex flex-col justify-between w-full">
                <div className="flex justify-between w-full">
                  <div className="flex flex-col justify-center">
                    <div className="text-white font-medium text-[1.35rem] mb-2">
                      {token.name}
                    </div>
                    <div className="text-[#919191] text-sm">{token.symbol}</div>
                    <div className="text-[#919191] text-xs">
                      {formatDenom(token.denom || "")}
                    </div>
                  </div>
                  <div className="flex flex-col items-start overflow-hidden">
                    <Link href={`/token/${token.denom}`}>
                      <button className="bg-[#FA4E30] text-[#FFFFFF] px-12 py-2 rounded-lg">
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
                        <div
                          className={`text-xs ${
                            token.price_change_percentage_24h >= 0
                              ? "text-green-400"
                              : "text-red-400"
                          }`}
                        >
                          {token.price_change_percentage_24h
                            ? `${
                                token.price_change_percentage_24h >= 0
                                  ? "+"
                                  : ""
                              }${token.price_change_percentage_24h.toFixed(2)}%`
                            : "N/A"}
                        </div>
                      </div>
                      <div className="flex items-center justify-between w-full font-normal">
                        <div className="text-white text-xs">Hldrs</div>
                        <div className="text-white text-xs">
                          {token.holders || "N/A"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="w-full h-[3px] mt-3 rounded-full [background-image:linear-gradient(to_right,#FA4E30_37%,#39C8A6_67%)]"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[300px] z-20 bg-gradient-to-t from-black/90 to-transparent pointer-events-none" />
    </div>
  );
};

export default NewListing;
