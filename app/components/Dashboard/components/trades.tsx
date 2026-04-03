// "use client";
// import React, { useEffect, useState, useRef } from "react";
// import Image from "next/image";
// import Link from "next/link";
// import explorer from "@/public/explorer.png";
// import { Clock, ExternalLink } from "lucide-react";

// // Utility function to format time ago
// const timeAgo = (dateString: string): string => {
//   const date = new Date(dateString);
//   const now = new Date();
//   const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

//   const intervals = {
//     y: 31536000, // year
//     mo: 2592000, // month (30 days)
//     d: 86400, // day
//     h: 3600, // hour
//     m: 60, // minute
//     s: 1, // second
//   };

//   for (const [unit, secondsInUnit] of Object.entries(intervals)) {
//     const interval = Math.floor(seconds / secondsInUnit);
//     if (interval >= 1) {
//       return `${interval}${unit}`;
//     }
//   }

//   return "now";
// };

// interface Trade {
//   time: string;
//   txHash: string;
//   pairContract: string;
//   signer: string;
//   direction: "buy" | "sell";
//   is_router: boolean;
//   offerDenom: string;
//   offerAmount: number;
//   askDenom: string;
//   returnAmount: number;
//   priceNative: number;
//   priceUsd: number;
//   valueNative: number;
//   valueUsd: number;
//   class: "whale" | "shark" | "shrimp";
// }
// const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;
// const API_KEY =
//   process.env.NEXT_PUBLIC_X_API_KEY || process.env.NEXT_PUBLIC_API_KEY;
// const API_HEADERS: HeadersInit = API_KEY ? { "x-api-key": API_KEY } : {};
// const LARGE_TRADES_TIMEFRAME = "60m";
// const LARGE_TRADES_UNIT = "usd";
// const LARGE_TRADES_LIMIT = 5000;

// const LargeTradersTable: React.FC = () => {
//   const [trades, setTrades] = useState<Trade[]>([]);
//   const [loading, setLoading] = useState<boolean>(true);
//   const [isFilterLoading, setIsFilterLoading] = useState<boolean>(false);
//   const [error, setError] = useState<string | null>(null);
//   const [selectedClass, setSelectedClass] = useState<
//     "all" | "whale" | "shark" | "shrimp"
//   >("all");
//   const [currentPage, setCurrentPage] = useState<number>(1);
//   const [totalItems, setTotalItems] = useState<number>(0);
//   const [symbolMap, setSymbolMap] = useState<Record<string, string>>({});
//   const [tokenImageMap, setTokenImageMap] = useState<Record<string, string>>(
//     {}
//   );
//   const [showNoTradesMessage, setShowNoTradesMessage] = useState(false);

//   const itemsPerPage = 8;
//   const abortRef = useRef<AbortController | null>(null);

//   const fetchTrades = async () => {
//     if (abortRef.current) abortRef.current.abort();
//     const controller = new AbortController();
//     abortRef.current = controller;

//     // If it's a filter change, only set isFilterLoading
//     if (isFilterLoading) {
//       setLoading(false);
//     } else {
//       // If it's initial load, set loading
//       setLoading(true);
//     }

//     try {
//       const queryParams = new URLSearchParams();
//       // queryParams.set("limit", LARGE_TRADES_LIMIT.toString());

//       const url = `${API_BASE}/trades?tf=${LARGE_TRADES_TIMEFRAME}&unit=${LARGE_TRADES_UNIT}&${queryParams.toString()}`;
//       const res = await fetch(url, {
//         signal: controller.signal,
//         headers: API_HEADERS,
//       });
//       if (!res.ok) throw new Error(`HTTP ${res.status}`);
//       const json = await res.json();

//       if (!json?.success || !Array.isArray(json.data)) {
//         throw new Error("Invalid data format");
//       }

//       const classifyTrade = (trade: Trade): Trade["class"] => {
//         const valueNative = Number.isFinite(trade.valueNative)
//           ? trade.valueNative
//           : 0;
//         if (valueNative < 1000) return "shrimp";
//         if (valueNative < 10000) return "shark";
//         return "whale";
//       };

//       const normalizedTrades = (json.data as Trade[]).map((trade) => ({
//         ...trade,
//         class: classifyTrade(trade),
//       }));

//       const filteredTrades =
//         selectedClass === "all"
//           ? normalizedTrades
//           : normalizedTrades.filter((trade) => trade.class === selectedClass);

//       // Sort trades by time (newest first) and then by class
//       const classPriority = { whale: 3, shark: 2, shrimp: 1 } as const;
//       const getClassPriority = (value?: string) =>
//         value && value in classPriority
//           ? classPriority[value as Trade["class"]]
//           : 0;
//       const sortedTrades = [...filteredTrades].sort((a, b) => {
//         const timeDiff =
//           new Date(b.time).getTime() - new Date(a.time).getTime();
//         if (timeDiff !== 0) return timeDiff;
//         return getClassPriority(b.class) - getClassPriority(a.class);
//       });

//       // Get only the first page items if there are more
//       const limitedTrades = sortedTrades.slice(0, itemsPerPage);

//       setTrades(limitedTrades);
//       setTotalItems(filteredTrades.length);
//       setError(null);
//     } catch (err: any) {
//       if (err?.name === "AbortError") return;
//       console.error("Error fetching trades:", err);
//       setError("Failed to load trades. Please try again later.");
//     } finally {
//       setLoading(false);
//       setIsFilterLoading(false);
//     }
//   };

//   // Update the filter change handler
//   const handleFilterChange = (filter: "all" | "whale" | "shark" | "shrimp") => {
//     setSelectedClass(filter);
//     setCurrentPage(1); // Reset to first page when changing filters
//     setIsFilterLoading(true);
//   };

//   // Fetch token swap list for symbol mapping
//   useEffect(() => {
//     let cancelled = false;
//     (async () => {
//       try {
//         const res = await fetch(
//           `${API_BASE}/tokens/swap-list?q=zig&bucket=24h&unit=usd`,
//           { headers: API_HEADERS }
//         );
//         if (!res.ok) throw new Error(`HTTP ${res.status}`);
//         const json = await res.json();
//         const items: Array<{
//           denom: string;
//           symbol: string;
//           imageUri?: string;
//         }> = json?.data ?? [];
//         const map: Record<string, string> = {};
//         const imageMap: Record<string, string> = {};

//         // Always include ZIG
//         map["uzig"] = "ZIG";
//         imageMap["uzig"] = "/zigicon.png";

//         for (const it of items) {
//           if (it?.denom && it?.symbol) {
//             map[it.denom] = it.symbol;
//             if (it.imageUri) {
//               imageMap[it.denom] = it.imageUri;
//             }
//           }
//         }

//         if (!cancelled) {
//           setSymbolMap(map);
//           setTokenImageMap(imageMap);
//         }
//       } catch (error) {
//         console.error("Failed to fetch token swap list:", error);
//         // Fallback to just ZIG if the request fails
//         if (!cancelled) {
//           setSymbolMap({ uzig: "ZIG" });
//           setTokenImageMap({ uzig: "/zigicon.png" });
//         }
//       }
//     })();

//     return () => {
//       cancelled = true;
//     };
//   }, []);

//   // Helper: return display symbol for a denom using map; fallback to last segment uppercase
//   const symbolFor = (denom?: string): string => {
//     if (!denom) return "";
//     if (denom === "uzig" || denom.includes("uzig")) return "ZIG";
//     const found = symbolMap[denom];
//     if (found) return found;
//     const parts = denom.split(".");
//     const last = parts[parts.length - 1] || denom;
//     return last.toUpperCase();
//   };

//   const getTokenIcon = (denom?: string): string => {
//     if (!denom) return "/zigicon.png";
//     const found = tokenImageMap[denom];
//     if (found) return found;
//     return "/zigicon.png";
//   };

//   // initial + refetch on filter/page
//   useEffect(() => {
//     fetchTrades();

//     return () => {
//       if (abortRef.current) abortRef.current.abort();
//     };
//   }, [selectedClass, currentPage]);

//   useEffect(() => {
//     if (trades.length > 0) {
//       setShowNoTradesMessage(false);
//       return;
//     }

//     const timer = window.setTimeout(() => {
//       setShowNoTradesMessage(true);
//     }, 5500);

//     return () => {
//       window.clearTimeout(timer);
//     };
//   }, [trades.length]);

//   // Pagination helpers
//   const handlePageChange = (page: number) => {
//     if (page < 1) return;
//     setCurrentPage(page);
//   };
//   const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
//   const compact2 = (n?: number): string => {
//     if (n == null || !Number.isFinite(n)) return "—";
//     const r2 = (x: number) => Number(x.toFixed(2));

//     const tryUnit = (scale: number, unit: "K" | "M" | "B" | "T") => {
//       const v = r2(n / scale);
//       return Math.abs(v) >= 1 ? `${v.toFixed(2)}${unit}` : null;
//     };

//     return (
//       tryUnit(1e12, "T") ??
//       tryUnit(1e9, "B") ??
//       tryUnit(1e6, "M") ??
//       tryUnit(1e3, "K") ??
//       new Intl.NumberFormat(undefined, {
//         minimumFractionDigits: 2,
//         maximumFractionDigits: 2,
//       }).format(r2(n))
//     );
//   };

//   if (loading) {
//     return (
//       <div className="bg-black/30 rounded-lg pt-4 px-6 min-h-[600px] relative border border-[#808080]/20 overflow-hidden">
//         <div className="flex items-start justify-between gap-3">
//           <div className="flex items-start gap-3">
//             <div className="w-5 h-5 bg-white/10 rounded-full animate-pulse"></div>
//             <div className="h-6 bg-white/10 rounded w-32 animate-pulse"></div>
//           </div>
//         </div>
//         <div className="overflow-x-auto">
//           <table className="w-full mt-4 table-fixed">
//             <thead>
//               <tr className="text-left text-white/60 text-sm border-b border-white/10">
//                 {[1, 2, 3, 4, 5].map((i) => (
//                   <th key={i} className="pb-4">
//                     <div className="h-4 bg-white/10 rounded w-3/4 animate-pulse"></div>
//                   </th>
//                 ))}
//               </tr>
//             </thead>
//             <tbody>
//               {Array.from({ length: 10 }).map((_, rowIndex) => (
//                 <tr key={rowIndex} className="border-b border-[#AEB9E1]/20">
//                   {[1, 2, 3, 4, 5].map((colIndex) => (
//                     <td key={colIndex} className="py-3">
//                       <div className="h-4 bg-white/10 rounded w-3/4 animate-pulse ml-auto"></div>
//                     </td>
//                   ))}
//                 </tr>
//               ))}
//             </tbody>
//           </table>
//         </div>
//       </div>
//     );
//   }

//   if (error) {
//     return <div className="text-red-500 text-center py-8">Error: {error}</div>;
//   }

//   return (
//     <div className="bg-black/30 rounded-lg pt-4 px-6 h-[600px] relative border border-[#808080]/20 overflow-hidden">
//       {/* Header */}
//       <div className="w-[800px] h-[400px] absolute z-[-10] bottom-[-20px] right-[-450px] rounded-xl bg-[radial-gradient(circle,_rgba(250,78,48,0.2)_0%,_rgba(250,78,48,0.3)_10%,_transparent_70%)] blur-2xl shadow-[0_0_40px_rgba(250,78,48,0.5)]"></div>
//       <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
//         <div className="flex items-center gap-3">
//           <Image
//             src="/fire.png"
//             alt="Fire Icon"
//             width={16}
//             height={16}
//             className="w-5 h-auto rounded-full object-cover"
//           />
//           <h2 className="text-[#EDEDED] w-auto text-[24px] font-medium">
//             Large Traders
//           </h2>
//         </div>

//         {/* Class filter buttons */}
//         <div className="flex flex-wrap justify-start gap-2 text-xs font-normal mt-1 w-full sm:w-auto">
//           {[
//             { id: "all", label: " All", color: "#FF6F00", labelIcon: ">" },
//             { id: "shrimp", label: " 1000", color: "#FF6F00", labelIcon: "<" },
//             { id: "shark", label: " 10000", color: "#FF6F00", labelIcon: "<" },
//             { id: "whale", label: " 10000", color: "#FF6F00", labelIcon: ">" },
//           ].map(({ id, label, color, labelIcon }) => (
//             <button
//               key={id}
//               onClick={() => handleFilterChange(id as any)}
//               className={`py-1.5 sm:py-1 rounded-lg flex items-center transition-all duration-200 min-w-[60px] ${
//                 selectedClass === id
//                   ? "opacity-100"
//                   : "opacity-60 hover:opacity-100"
//               }`}
//             >
//               <div className="bg-[#202020] px-2 py-1 rounded-lg flex items-center">
//                 <div
//                   className="w-2 h-2 ml-[-10px] rounded-sm"
//                   style={{
//                     backgroundColor:
//                       selectedClass === id ? color : "transparent",
//                     border: `1px solid ${color}`,
//                   }}
//                 ></div>
//                 <span className="ml-2">
//                   {labelIcon}
//                   {label}
//                 </span>
//               </div>
//             </button>
//           ))}
//         </div>
//       </div>

//       {/* Error state */}
//       {error && (
//         <div className="text-red-500 text-center py-4 text-sm">{error}</div>
//       )}
//       {trades.length === 0 && (
//         <div className="bg-black/30 rounded-lg pt-4 px-6 min-h-[600px] relative border border-[#808080]/20 overflow-hidden">
//           {showNoTradesMessage ? (
//             <div className="flex h-[520px] items-center justify-center text-center px-6">
//               <div>
//                 <p className="text-white/80 text-lg font-medium">
//                   No trades found.
//                 </p>
//                 <p className="text-white/60 text-sm mt-2">
//                   We're still listening for new activity—check back soon.
//                 </p>
//               </div>
//             </div>
//           ) : (
//             <div className="overflow-x-auto">
//               <table className="w-full mt-4 table-fixed">
//                 <thead>
//                   <tr className="text-left text-white/60 text-sm border-b border-white/10">
//                     {[1, 2, 3, 4, 5].map((i) => (
//                       <th key={i} className="pb-4">
//                         <div className="h-4 bg-white/10 rounded w-3/4 animate-pulse"></div>
//                       </th>
//                     ))}
//                   </tr>
//                 </thead>
//                 <tbody>
//                   {Array.from({ length: 10 }).map((_, rowIndex) => (
//                     <tr key={rowIndex} className="border-b border-[#AEB9E1]/20">
//                       {[1, 2, 3, 4, 5].map((colIndex) => (
//                         <td key={colIndex} className="py-3">
//                           <div className="h-4 bg-white/10 rounded w-3/4 animate-pulse ml-auto"></div>
//                         </td>
//                       ))}
//                     </tr>
//                   ))}
//                 </tbody>
//               </table>
//             </div>
//           )}
//         </div>
//       )}

//       {/* Table */}
//       <div className="overflow-x-auto mt-4">
//         <table className="w-full min-w-[500px] md:min-w-auto">
//           <thead>
//             <tr className="text-left text-white/60 text-sm">
//               <th className="pb-3 font-normal text-left text-[#919191] pl-2">
//                 <Clock className="w-4 h-4" />
//               </th>
//               <th className="pb-3 font-normal text-left text-[#919191]">
//                 Signer
//               </th>
//               <th className="pb-3 font-normal text-center text-[#919191] pr-0">
//                 Direction
//               </th>
//               <th className="pb-3 font-normal text-center text-[#919191] pl-1 pr-4">
//                 Amount
//               </th>
//               <th className="pb-3 font-normal text-left text-[#919191] pl-2 pr-2">
//                 Action
//               </th>
//             </tr>
//           </thead>
//           <tbody className="divide-y divide-white/5">
//             {loading && trades.length === 0
//               ? Array.from({ length: itemsPerPage }).map((_, i) => (
//                   <tr key={i}>
//                     {Array.from({ length: 10 }).map((__, j) => (
//                       <td key={j} className="py-2 border-t border-[#AEB9E1]/20">
//                         <div
//                           className="h-4 bg-white/10 rounded animate-pulse"
//                           style={{ width: `${60 + j * 8}%` }}
//                         ></div>
//                       </td>
//                     ))}
//                   </tr>
//                 ))
//               : trades.map((trade, index) => (
//                   <tr
//                     key={trade.txHash + index}
//                     className={`relative overflow-hidden ${
//                       trade.class === "whale" && selectedClass === "all"
//                         ? 'before:content-[""] before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_center,_rgba(250,78,48,0.15)_0%,_transparent_70%)] before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-300'
//                         : ""
//                     }`}
//                   >
//                     <td className="py-2 text-left text-white/90 text-sm border-t border-[#AEB9E1]/20 pl-2 relative z-10">
//                       {timeAgo(trade.time)}
//                     </td>
//                     <td className="py-2 text-white/90 text-sm border-t border-[#AEB9E1]/20 relative z-10">
//                       <Link
//                         href={`https://zigscan.org/address/${trade.signer}`}
//                         target="_blank"
//                         className="text-white hover:underline"
//                       >
//                         {trade.signer.slice(0, 6)}...{trade.signer.slice(-4)}
//                       </Link>
//                     </td>
//                     <td className="py-2 text-center border-t border-[#AEB9E1]/20 relative z-10">
//                       <div
//                         className={`inline-block text-sm font-medium px-3 py-1 rounded-lg ${
//                           trade.direction === "buy"
//                             ? "bg-[#20D87C] text-white"
//                             : "bg-[#F64F39] text-white"
//                         }`}
//                       >
//                         {trade.direction.toUpperCase()}
//                       </div>
//                     </td>
//                     <td className="py-2 pl-16 text-center text-white/90 text-sm border-t border-[#AEB9E1]/20 ">
//                       <div className="flex items-center justify-start gap-2">
//                         {trade.class === "whale" && (
//                           <span className="flex items-center gap-1 bg-blue-500/20 px-2 py-0.5 rounded text-blue-300 text-xs">
//                             🐋
//                           </span>
//                         )}
//                         {trade.class === "shark" && (
//                           <span className="flex items-center gap-1 bg-purple-500/20 px-2 py-0.5 rounded text-purple-300 text-xs">
//                             🦈
//                           </span>
//                         )}
//                         {trade.class === "shrimp" && (
//                           <span className="flex items-center gap-1 bg-yellow-500/20 px-2 py-0.5 rounded text-green-300 text-xs">
//                             🦐
//                           </span>
//                         )}
//                         {/* ${trade.valueUsd.toFixed(2)} */}
//                         <div className="flex items-center gap-2">
//                           <div className="flex flex-col">
//                             <div className="flex items-center gap-1">
//                               <Image
//                                 src={getTokenIcon(trade.askDenom)}
//                                 alt="Token"
//                                 width={16}
//                                 height={16}
//                                 className="w-4 h-4 rounded-full"
//                                 unoptimized
//                               />
//                               <span className="text-[#20D87C] whitespace-nowrap">
//                                 +{compact2(trade.returnAmount)}{" "}
//                                 {symbolFor(trade.askDenom)}
//                               </span>
//                             </div>
//                             <div className="flex items-center gap-1">
//                               <Image
//                                 src={getTokenIcon(trade.offerDenom)}
//                                 alt="Token"
//                                 width={16}
//                                 height={16}
//                                 className="w-4 h-4 rounded-full"
//                                 unoptimized
//                               />
//                               <span className="text-[#F64F39] whitespace-nowrap">
//                                 -{compact2(trade.offerAmount)}{" "}
//                                 {symbolFor(trade.offerDenom)}
//                               </span>
//                             </div>
//                           </div>
//                         </div>
//                       </div>
//                     </td>
//                     <td className="py-2 px-3 items-center justify-center text-white/90 text-sm border-t border-[#AEB9E1]/20 ">
//                       <Link
//                         href={`https://zigscan.org/tx/${trade.txHash}`}
//                         target="_blank"
//                         title="View on Explorer"
//                       >
//                         <ExternalLink className="w-4 h-4" />
//                       </Link>
//                     </td>
//                   </tr>
//                 ))}
//           </tbody>
//         </table>
//       </div>
//       <div className="absolute top-[3.3rem] left-6 right-6 h-[1px] [background-image:linear-gradient(to_right,#FA4E30_37%,#39C8A6_67%)]"></div>

//       {isFilterLoading && (
//         <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
//           <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
//         </div>
//       )}
//     </div>
//   );
// };

// export default LargeTradersTable;