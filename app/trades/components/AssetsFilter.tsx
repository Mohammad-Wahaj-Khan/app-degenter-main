"use client";

import type { ValueRangeLabel } from "./Trades";
import { RefreshCw, X, Search } from "lucide-react";
import { useState } from "react";

type AssetMode = "all" | "token";
const assetModes: { label: string; value: AssetMode }[] = [
  { label: "All", value: "all" },
  { label: "Token", value: "token" },
];
type TimeRange = "24H" | "7D" | "30D";
const timeRanges: TimeRange[] = ["24H", "7D", "30D"];
const valueRanges: { label: ValueRangeLabel; icon: string }[] = [
  { label: "< 1K ZIG", icon: "🦐" },
  { label: "1K - 10K ZIG", icon: "🦈" }, // Using closer emojis to the icons🐬
  { label: "> 10K ZIG", icon: "🐋" },
];

interface AssetsFilterProps {
  selectedAssetMode: AssetMode;
  onAssetModeChange: (value: AssetMode) => void;
  selectedTime: TimeRange;
  onTimeChange: (value: TimeRange) => void;
  onClearSearch: () => void;
  selectedValue: ValueRangeLabel | "";
  onValueChange: (value: ValueRangeLabel | "") => void;
  selectedToken: string;
  onTokenSearch: (searchQuery: string) => void;
  tokenOptions: { denom: string; label: string }[];
  isSearching: boolean;
  walletAddress: string;
  onWalletAddressChange: (value: string) => void;
  onReset: () => void;
}

export default function AssetsFilter({
  selectedAssetMode,
  onAssetModeChange,
  selectedTime,
  onTimeChange,
  selectedValue,
  onValueChange,
  selectedToken,
  onTokenSearch,
  onClearSearch,
  tokenOptions = [],
  walletAddress,
  onWalletAddressChange,
  onReset,
  isSearching = false,
}: AssetsFilterProps) {
  const [localQuery, setLocalQuery] = useState(selectedToken);
  const [showSuggestions, setShowSuggestions] = useState(false);

  return (
    <div className="w-full max-w-[380px] overflow-hidden rounded-2xl border border-white/10 bg-black text-white shadow-2xl">
      {/* Top Gradient Section */}
      <div
        className="relative px-5 pt-6 pb-5"
        style={{
          backgroundImage: `linear-gradient(135deg, rgba(0,0,0,1) 0%, rgba(74,222,128,0.4) 34%, rgba(102,45,145,0.4) 70%)`,
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-b from-[#05010c]/90 via-[#030106]/80 to-[#010103]/95" />
          <div
            className="absolute -left-8 -top-12 h-28 w-52 rounded-full opacity-30 blur-[20px]"
            style={{ backgroundColor: "#4ADE80" }}
          />
          <div
            className="absolute -right-4 -top-12 h-28 w-52 rounded-full opacity-30 blur-[20px]"
            style={{ backgroundColor: "#662D91" }}
          />
          {/* <div
            className="absolute -right-12 -bottom-12 h-32 w-48 rounded-full opacity-25 blur-[40px]"
            style={{ backgroundColor: "#F64F39" }}
          />
          <div
            className="absolute -left-12 -bottom-12 h-32 w-48 rounded-full opacity-25 blur-[40px]"
            style={{ backgroundColor: "#662D91" }}
          /> */}
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/80" />

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium tracking-wide">Assets</h2>
            <button 
              onClick={onClearSearch} // Attach the clear function here
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
            >
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-600">
                <X className="h-3 w-3 text-black stroke-[3]" />
              </div>
              Remove
            </button>
          </div>

          <div className="flex gap-6 mb-5">
            {assetModes.map(({ label, value }) => (
              <label key={value} className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="radio"
                  name="assetMode"
                  checked={selectedAssetMode === value}
                  onChange={() => onAssetModeChange(value)}
                  className="peer hidden"
                />
                <div className="h-4 w-4 rounded-full border-2 border-gray-500 flex items-center justify-center peer-checked:border-[#FF4D2D] transition-all">
                  <div className={`h-2 w-2 rounded-full bg-[#FF4D2D] transition-transform ${selectedAssetMode === value ? 'scale-100' : 'scale-0'}`} />
                </div>
                <span className="text-sm font-medium text-gray-300 peer-checked:text-white">{label}</span>
              </label>
            ))}
          </div>

          <div className="relative">
            <div className="relative flex gap-2">
              <input
                type="text"
                placeholder="SEARCH TOKEN (SYMBOL/DENOM)"
                className="flex-1 rounded-lg border border-white/10 bg-[#1a1a1a]/60 px-4 py-2.5 text-sm text-gray-300 outline-none"
                value={localQuery}
                onChange={(e) => {
                  const value = e.target.value;
                  setLocalQuery(value);
                  setShowSuggestions(!!value);
                  
                  // Clear search when input is empty
                  if (!value.trim()) {
                    onClearSearch();
                  }
                }}
                onFocus={() => localQuery && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onTokenSearch(localQuery);
                }}
              />
              <button
                onClick={() => onTokenSearch(localQuery)}
                className="bg-[#FF4D2D] text-white rounded-lg  flex items-center justify-center w-10"
                disabled={isSearching}
              >
                {isSearching ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white"></div>
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </button>
            </div>
            {selectedToken && (
              <div className="mt-2 text-xs text-gray-400 flex justify-between items-center">
                <span>Showing trades for: <span className="font-medium">
                  {selectedToken.length > 20 
                    ? `${selectedToken.slice(0, 10)}...${selectedToken.slice(-7)}`
                    : selectedToken}
                </span></span>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearSearch();
                    setLocalQuery('');
                  }}
                  className="text-[#FF4D2D] hover:underline text-xs"
                >
                  Clear
                </button>
              </div>
            )}
            {showSuggestions && localQuery && tokenOptions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-[#1a1a1a] border border-white/10 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {tokenOptions.length === 0 && (
                  <div className="px-4 py-2 text-sm text-gray-400">No tokens found</div>
                )}
                {tokenOptions
                  .filter(option => 
                    option.label.toLowerCase().includes(localQuery.toLowerCase()) ||
                    option.denom.toLowerCase().includes(localQuery.toLowerCase())
                  )
                  .slice(0, 5)
                  .map((option) => (
                    <div
                      key={option.denom}
                      className="px-4 py-2 text-sm text-gray-300 hover:bg-white/5 cursor-pointer flex items-center gap-2"
                      onMouseDown={() => {
                        setLocalQuery(option.label);
                        onTokenSearch(option.denom);
                        setShowSuggestions(false);
                      }}
                    >
                      <span className="font-medium">{option.label}</span>
                      <span className="text-xs text-gray-500">{option.denom}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Sections */}
      <div className="divide-y divide-white/5 px-5">
        {/* Time Section */}
        <div className="py-6">
          <h3 className="mb-4 text-sm font-medium tracking-wide">Time</h3>
          <div className="flex gap-8">
            {timeRanges.map((range) => (
              <label key={range} className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="radio"
                  name="time"
                  checked={selectedTime === range}
                  onChange={() => onTimeChange(range)}
                  className="peer hidden"
                />
                <div className="h-4 w-4 rounded-full border-2 border-gray-500 flex items-center justify-center peer-checked:border-[#FF4D2D]">
                  <div className={`h-2 w-2 rounded-full bg-[#FF4D2D] transition-transform ${selectedTime === range ? 'scale-100' : 'scale-0'}`} />
                </div>
                <span className="text-sm text-gray-400 peer-checked:text-white">{range}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Value Section */}
        <div className="pt-6 pb-4">
          <h3 className="mb-4 text-sm font-medium tracking-wide">Value (ZIG)</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 ">
            {valueRanges.map(({ label, icon }) => (
              <label key={label} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="value"
                  checked={selectedValue === label}
                  onChange={() => onValueChange(label)}
                  className="peer hidden"
                />
                <div className="h-4 w-4 rounded-full border-2 border-gray-500 flex items-center justify-center peer-checked:border-[#FF4D2D]">
                  <div className={`h-2 w-2 rounded-full bg-[#FF4D2D] transition-transform ${selectedValue === label ? 'scale-100' : 'scale-0'}`} />
                </div>
                <span className="text-lg">{icon}</span>
                <span className="text-sm font-medium text-gray-300 peer-checked:text-white">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Traders Section */}
        <div className="py-6">
          <h3 className="mb-1 text-lg  tracking-wide">Traders</h3>
          <p className="mb-3 text-sm  text-white">Wallet</p>
          <input
            type="text"
            placeholder="Enter wallet address"
            className="w-full rounded-lg border border-white/10 bg-[#121212] px-4 py-3 text-sm text-white placeholder:text-gray-600 outline-none focus:border-white/20"
            value={walletAddress}
            onChange={(event) => onWalletAddressChange(event.target.value)}
          />
        </div>
      </div>
          {/* <div
            className="absolute -right-12 -bottom-12 h-32 w-48 rounded-full opacity-25 blur-[40px]"
            style={{ backgroundColor: "#F64F39" }}
          />
          <div
            className="absolute -left-12 -bottom-12 h-32 w-48 rounded-full opacity-25 blur-[40px]"
            style={{ backgroundColor: "#662D91" }}
          /> */}
      {/* Reset Footer */}
      <button 
        className="flex w-full items-center justify-center gap-2 border-t border-white/5 py-5 transition-colors hover:bg-white/5"
        onClick={onReset}
        style={{
          background: "linear-gradient(to right, #11051bff 10%, transparent 40%, rgba(161,28,24,0.15)) "
        }}
      >
        <RefreshCw className="h-4 w-4 text-[#FF4D2D]" />
        <span className="text-sm font-medium text-white">Reset all</span>
      </button>
    </div>
  );
}
