"use client";

import Image from "next/image";
import FilterIcon from "@/public/filter.svg";
import { TradesFilter } from "./Trades";

interface FilterTradesTopProps {
  filters: TradesFilter;
  filtersOpen: boolean;
  onToggleFilters: () => void;
  onExport: () => void;
  hasFilteredTrades: boolean;
}

export default function FilterTradesTop({
  filters,
  filtersOpen,
  onToggleFilters,
  onExport,
  hasFilteredTrades,
}: FilterTradesTopProps) {
  return (
    <div className="relative z-10 w-full px-4 pb-2">
      <div className="mx-auto w-full">
        <div className="flex w-full flex-col gap-4 rounded-[32px]  px-6 py-6  sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold leading-tight text-white sm:text-3xl">
              Find Traders
            </h1>
            <p className="mt-2 text-sm text-gray-300">
              Time window: <span className="text-white">{filters.timeRange}</span>{" "}
              • Value range:{" "}
              <span className="text-white">
                {filters.valueRange || "All trades"}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onToggleFilters}
              className={`flex items-center gap-2 rounded-lg border px-6 py-2 text-sm font-semibold transition ${
                filtersOpen
                  ? "border-[#FF4B2B] bg-[#19080a]/90 text-white"
                  : "border-white/30 bg-[#000]/40 text-gray-200"
              }`}
            >
              <Image
                src={FilterIcon}
                alt="filter"
                width={16}
                height={16}
                className="w-4 h-4 object-cover"
              />
              Filters
            </button>
            <button
              type="button"
              onClick={onExport}
              disabled={!hasFilteredTrades}
              className="flex items-center justify-center rounded-md bg-gradient-to-r from-[#05C8A1] to-[#01A77C] px-8 py-2 text-sm text-black shadow-[0_10px_25px_rgba(5,199,161,0.4)] transition hover:opacity-90 disabled:opacity-40"
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
