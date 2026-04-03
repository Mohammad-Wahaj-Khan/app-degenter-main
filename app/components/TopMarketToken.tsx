"use client";
import { MdRocketLaunch } from "react-icons/md";
import TrendingToken from "./trending-token";
import { tokenAPI, Token as APIToken } from "@/lib/api";
import { useEffect, useRef, useState } from "react";

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
  holders: string;
}

export default function TopMarketToken() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalItems, setTotalItems] = useState<number>(0);
  const [volumeChanges, setVolumeChanges] = useState<
    Record<string, "increase" | "decrease" | "same">
  >({});
  const prevTokensRef = useRef<Token[]>([]);
  const itemsPerPage = 10;

  useEffect(() => {
    const fetchTokens = async () => {
      try {
        setLoading(true);
        const response = await tokenAPI.getTopMarketTokens(
          "24h", // bucket
          "best", // priceSource
          "volume", // limit (increased to get more data)
          12, // offset
          0 // offset
        );

        // // console.log("Raw API response:", response);
        // // console.log("Response is array:", Array.isArray(response.data));
        // // console.log("Response length:", response.data?.length);

        const respAny: any = response;
        const rawTokens: any[] = Array.isArray(respAny)
          ? respAny
          : respAny?.data ?? respAny?.tokens ?? respAny?.results ?? [];

        // Filter out ZIG and uzig tokens
        const filteredTokens = rawTokens.filter((token: APIToken) => {
          // console.log(
          //   "Checking token:",
          //   token.symbol,
          //   "holders:",
          //   token.holders
          // );
          return (
            token.symbol &&
            !["zig", "uzig"].includes(token.symbol.toLowerCase()) &&
            token.holders > 0
          ); // Only include tokens with holders
        });

        // // console.log("Filtered tokens count:", filteredTokens.length);
        // console.log(
        //   "Filtered token symbols:",
        //   filteredTokens.map(
        //     (t: APIToken) => `${t.symbol} (${t.holders} holders)`
        //   )
        // );

        // Transform API data to match component interface
        const tokensData: Token[] = filteredTokens.map((token: APIToken) => ({
          id: token.tokenId?.toString() || "",
          symbol: token.symbol || "",
          name: token.name || "",
          current_price: token.priceUsd || token.priceNative || 0,
          price_change_percentage_24h: token.change24hPct || 0,
          market_cap: token.mcapUsd || token.mcapNative || 0,
          total_volume: token.volUsd || token.volNative || 0,
          image: token.imageUri || "",
          tx: token.tx || 0,
          denom: token.denom || "",
          holders: token.holders?.toString() || "0",
        }));

        // console.log(
        //   "Final tokens data:",
        //   tokensData.map((t) => t.symbol)
        // );

        // Process volume changes
        const newVolumeChanges = tokensData.reduce(
          (
            acc: Record<string, "increase" | "decrease" | "same">,
            token: Token
          ) => {
            const prevToken = prevTokensRef.current.find(
              (t) => t.id === token.id
            );
            if (prevToken) {
              if (token.total_volume > prevToken.total_volume) {
                acc[token.id] = "increase";
              } else if (token.total_volume < prevToken.total_volume) {
                acc[token.id] = "decrease";
              } else {
                acc[token.id] = "same";
              }
            }
            return acc;
          },
          {}
        );

        setVolumeChanges((prev) => ({ ...prev, ...newVolumeChanges }));
        // Sort by 24h volume (desc) and limit to top 10
        const top10Tokens = [...tokensData]
          .sort((a, b) => (b.total_volume || 0) - (a.total_volume || 0))
          .slice(0, 10);
        setTokens(top10Tokens);
        setTotalItems(top10Tokens.length);
        prevTokensRef.current = top10Tokens;
        setError(null);
      } catch (err) {
        console.error("Error fetching tokens:", err);
        setError("Failed to load tokens. Please try again later.");
        setTokens([]);
      } finally {
        setLoading(false);
      }
    };

    fetchTokens();
    // const interval = setInterval(fetchTokens, 30000); // Refresh every 30 seconds
    // return () => clearInterval(interval);
  }, [currentPage]);

  // // console.log("Trending Tokens Top Market page", tokens);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <section className="flex items-center  gap-2 max-w-full mx-auto px-6 lg:px-8  z-10 w-full ">
      <div className="flex items-center gap-4 bg-black/50 px-4 py-2 rounded-lg w-full">
        <div className="flex items-center gap-2 shrink-0">
          <div className="bg-gradient-to-r from-[#4E0C00] to-[#FFC300] bg-clip-text text-transparent">
            <MdRocketLaunch size={16} className="text-[#FA4E30]" />
          </div>
          <span className="text-[#FFC300]">Trending</span>
        </div>
        <div className="flex-1 min-w-0">
          <TrendingToken tokens={tokens} loading={loading} />
        </div>
      </div>
    </section>
  );
}
