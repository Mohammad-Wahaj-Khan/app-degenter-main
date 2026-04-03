"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

export interface Trade {
  time: string;
  txHash: string;
  pairContract: string;
  signer: string;
  direction: "buy" | "sell";
  offerDenom: string;
  offerAmount: number;
  askDenom: string;
  returnAmount: number;
  priceUsd: number;
  class: string;
}

const TradesTable = () => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400)
      return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  const getTokenSymbol = (denom: string) => {
    if (denom === "uzig") return "ZIG";
    // Extract symbol from denom if it follows a pattern like 'coin.zig109f7g2rzl2aqee7z6gffn8kfe9cpqx0mjkk7ethmx8m2hq4xpe9snmaam2.stzig'
    const match = denom.match(/\.([^.]+)$/);
    return match ? match[1].toUpperCase() : denom.slice(0, 6) + "...";
  };

  const getTokenImage = (denom: string) => {
    if (denom === "uzig") return "/zig.png"; // Replace with actual path to ZIG token icon
    // Default token icon or handle other tokens
    return "/token-default.png";
  };

  const fetchTrades = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/trades?tf=24h&unit=zig`);
      if (!response.ok) throw new Error("Failed to fetch trades");
      const data = await response.json();

      if (data.success && Array.isArray(data.data)) {
        setTrades(data.data);
      }
    } catch (error) {
      console.error("Error fetching trades:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  // Filter trades based on active filter
  const filteredTrades = activeFilter
    ? trades.filter((trade) => trade.class === activeFilter)
    : trades;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <h2 className="text-lg font-semibold">Recent Trades</h2>

        {/* Filter Dropdown */}
        <div className="relative" ref={filterDropdownRef}>
          <button
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            className="flex items-center space-x-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm font-medium"
          >
            <span>
              {activeFilter ? `Class: ${activeFilter}` : "All Classes"}
            </span>
            <ChevronDown className="w-4 h-4" />
          </button>

          {showFilterDropdown && (
            <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-gray-800 rounded-md shadow-lg z-10">
              <button
                onClick={() => {
                  setActiveFilter(null);
                  setShowFilterDropdown(false);
                }}
                className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                All Trades
              </button>
              <button
                onClick={() => {
                  setActiveFilter("whale");
                  setShowFilterDropdown(false);
                }}
                className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Whale Trades
              </button>
              <button
                onClick={() => {
                  setActiveFilter("shark");
                  setShowFilterDropdown(false);
                }}
                className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Shark Trades
              </button>
              <button
                onClick={() => {
                  setActiveFilter("shrimp");
                  setShowFilterDropdown(false);
                }}
                className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Shrimp Trades
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-4 text-center">Loading trades...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Price (USD)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Tx
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredTrades.map((trade, index) => (
                <tr
                  key={`${trade.txHash}-${index}`}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                    {formatTimeAgo(trade.time)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          trade.direction === "buy"
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                        }`}
                      >
                        {trade.direction.toUpperCase()}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-5 w-5 mr-2">
                        <Image
                          className="h-5 w-5 rounded-full"
                          src={getTokenImage(trade.offerDenom)}
                          alt={getTokenSymbol(trade.offerDenom)}
                          width={20}
                          height={20}
                        />
                      </div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {trade.direction === "buy"
                          ? `${trade.returnAmount} ${getTokenSymbol(
                              trade.askDenom
                            )}`
                          : `${trade.offerAmount} ${getTokenSymbol(
                              trade.offerDenom
                            )}`}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                    ${trade.priceUsd?.toFixed(6) || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                    <a
                      href={`https://explorer.zenchainlabs.io/transactions/${trade.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      <Image
                        src="/explorer.png"
                        alt="View on Explorer"
                        width={16}
                        height={16}
                        className="inline-block"
                      />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TradesTable;
