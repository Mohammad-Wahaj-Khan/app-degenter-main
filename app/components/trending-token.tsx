"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, TrendingUp } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";

interface Token {
  id: string;
  name: string;
  symbol: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  total_volume: number;
  image: string;
  tx: number;
  denom: string;
  holders: string;
}

export default function TrendingToken({
  tokens,
  loading,
}: {
  tokens: Token[];
  loading: boolean;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [animationDuration, setAnimationDuration] = useState(20);
  const scrollSpeed = 50; // px per second
  const defaultDuration = 20;

  useLayoutEffect(() => {
    const element = trackRef.current;
    if (!element) return;

    const measureWidth = () => {
      if (!trackRef.current) return;
      const totalWidth = trackRef.current.scrollWidth;
      const singleWidth = totalWidth / 2;
      if (singleWidth > 0) {
        const duration = Math.max(singleWidth / scrollSpeed, 2);
        setAnimationDuration(duration);
      } else {
        setAnimationDuration(defaultDuration);
      }
    };

    measureWidth();

    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(measureWidth);
      resizeObserver.observe(element);
      return () => resizeObserver.disconnect();
    }
  }, [tokens, scrollSpeed]);

  const trackStyle: CSSProperties = {
    animationDuration: `${animationDuration}s`,
  };

  return (
    <div className="relative w-full overflow-hidden">
      {loading ? (
        <div className="flex items-center gap-3">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="h-7 sm:h-8 bg-black/30 rounded-lg animate-pulse w-36 sm:w-40"
            />
          ))}
        </div>
      ) : (
        <div className="relative w-full overflow-x-auto sm:overflow-hidden no-scrollbar">
          {/* ---------------- MOBILE SCROLLABLE VIEW ---------------- */}
          <div className="flex sm:hidden gap-4 px-2 py-1 min-w-max ">
            <div
              className="flex items-center whitespace-nowrap animate-marquee  group-hover:pause-marquee"
              aria-hidden="true"
            >
              {tokens.map((token, index) => (
                <div
                  key={token.id ?? index}
                  className="inline-flex items-center gap-3 rounded-lg px-3 py-1"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-xs">{index + 1}.</span>
                    <Image
                      src={token.image}
                      alt={token.name}
                      width={24}
                      height={24}
                      className="w-6 h-6 rounded-full"
                    />
                    <Link
                      href={`/token/${
                        token.denom.startsWith("ibc/")
                          ? token.symbol
                          : token.denom
                      }`}
                    >
                      <span className="text-white font-normal hover:underline py-1">
                        {token.symbol}
                      </span>
                    </Link>
                  </div>
                  <div className="flex items-center gap-1">
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded ${
                        (token.price_change_percentage_24h || 0) >= 0
                          ? "text-green-400 bg-[#14532D]/50"
                          : "text-red-400 bg-red-900/30"
                      }`}
                    >
                      {(token.price_change_percentage_24h || 0) >= 0 ? (
                        <ArrowUp size={9} className="flex-shrink-0" />
                      ) : (
                        <ArrowDown size={9} className="flex-shrink-0" />
                      )}
                      <span>
                        {Math.abs(
                          token.price_change_percentage_24h || 0
                        ).toFixed(2)}
                        %
                      </span>
                    </span>
                    <TrendingUp
                      size={12}
                      className="text-gray-500 flex-shrink-0"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ---------------- TABLET SCROLLABLE VIEW ---------------- */}
          <div className="hidden md:flex lg:hidden gap-4 px-4 py-2 overflow-x-auto no-scrollbar">
            {tokens.map((token, index) => (
              <div
                key={`tablet-${token.id ?? index}`}
                className="flex-shrink-0 rounded-lg px-3 py-2 min-w-[170px]"
              >
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-sm">{index + 1}.</span>
                  <Image
                    src={token.image}
                    alt={token.symbol}
                    width={20}
                    height={20}
                    className="w-5 h-5 rounded-full"
                  />
                  <span className="text-white font-medium">{token.symbol}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm text-gray-300">
                    ${token.current_price.toFixed(6)}
                  </span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      token.price_change_percentage_24h >= 0
                        ? "text-green-400 bg-green-900/30"
                        : "text-red-400 bg-red-900/30"
                    }`}
                  >
                    {token.price_change_percentage_24h >= 0 ? "↑" : "↓"}{" "}
                    {Math.abs(token.price_change_percentage_24h).toFixed(2)}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* ---------------- DESKTOP SMOOTH INFINITE MARQUEE ---------------- */}
          <div className="hidden lg:flex w-full items-center">
            <div className="marquee-mask w-full">
              <div ref={trackRef} className="marquee-track" style={trackStyle}>
                {[0, 1].map((copyIndex) => (
                  <div
                    className="marquee-segment"
                    key={`marquee-segment-${copyIndex}`}
                  >
                    {tokens.map((token, index) => (
                      <div
                        key={`marquee-${copyIndex}-${token.id ?? index}`}
                        className="inline-flex items-center gap-[2rem] text-sm whitespace-nowrap px-3 py-1.5 rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 text-xs">
                            {index + 1}.
                          </span>
                          <Image
                            src={token.image}
                            alt={token.name}
                            width={24}
                            height={24}
                            className="w-6 h-6 rounded-full"
                          />
                          <Link
                            href={`/token/${
                              token.denom.startsWith("ibc/")
                                ? token.symbol
                                : token.denom
                            }`}
                          >
                            <span className="text-white font-normal hover:underline py-1">
                              {token.symbol}
                            </span>
                          </Link>
                        </div>
                        <div className="flex items-center gap-1">
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ${
                              (token.price_change_percentage_24h || 0) >= 0
                                ? "text-green-400 bg-[#14532D]/50 hover:bg-green-900/40"
                                : "text-red-400 bg-red-900/30 hover:bg-red-900/40"
                            }`}
                          >
                            {(token.price_change_percentage_24h || 0) >= 0 ? (
                              <ArrowUp size={9} className="flex-shrink-0" />
                            ) : (
                              <ArrowDown size={9} className="flex-shrink-0" />
                            )}
                            <span>
                              {Math.abs(
                                token.price_change_percentage_24h || 0
                              ).toFixed(2)}
                              %
                            </span>
                          </span>
                          <TrendingUp
                            size={12}
                            className="text-gray-500 transition-colors flex-shrink-0 animate-pulse"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .marquee-mask {
          overflow: hidden;
          width: 100%;
        }
        .marquee-track {
          display: flex;
          width: max-content;
          animation-name: marqueeScroll;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        .marquee-mask:hover .marquee-track {
          animation-play-state: paused;
        }
        .marquee-segment {
          display: flex;
          gap: 2rem;
        }
        @keyframes marqueeScroll {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }

        .animate-marquee {
          display: inline-flex;
          animation: marquee 40s linear infinite;
          animation-iteration-count: infinite;
          padding-right: 2rem;
          padding-left: 2rem;
          will-change: transform;
          min-width: 100%;
        }

        /* Pause marquee on hover */
        .group:hover .animate-marquee {
          animation-play-state: paused;
        }
        @keyframes marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-100%);
          }
        }
      `}</style>
    </div>
  );
}
