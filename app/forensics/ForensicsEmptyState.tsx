"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

const STORAGE_KEY = "zigscan_forensics_recent";

const FEATURE_CARDS = [
  {
    title: "Graph layout",
    description:
      "Left nodes show addresses sending funds into the searched wallet; right nodes show addresses it pays out.",
  },
  {
    title: "Context panel",
    description:
      "Click a node to inspect bilateral transfers without losing the graph context or scrolling away from the canvas.",
  },
  {
    title: "Controls",
    description:
      "Use the counterparty limit and search again controls to focus noisy wallets and keep the graph readable.",
  },
];

type ForensicsEmptyStateProps = {
  onSearch: (address: string) => void;
  loading?: boolean;
  error?: string | null;
};

export default function ForensicsEmptyState({
  onSearch,
  loading,
  error,
}: ForensicsEmptyStateProps) {
  const [value, setValue] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      setRecentSearches(Array.isArray(parsed) ? parsed.slice(0, 5) : []);
    } catch {
      setRecentSearches([]);
    }
  }, []);

  const helperText = useMemo(() => "Search any public ZigChain address", []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSearch(trimmed);
  };

  const handleRecentClick = (address: string) => {
    setValue(address);
    onSearch(address);
  };

  return (
    <div className="relative w-full overflow-hidden px-4 py-6 text-white md:px-10 md:py-10">
      <div className="mx-auto max-w-4xl text-center">
        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-3xl">
          <div className="group relative flex items-center rounded-lg border border-white/10 bg-black/70 px-6 py-3 backdrop-blur-2xl transition-all hover:border-[#39C8A6]/50 focus-within:border-[#39C8A6] focus-within:ring-1 focus-within:ring-[#39C8A6]/30">
            <button
              type="submit"
              disabled={loading}
              className="mr-4 text-white/45 transition-colors hover:text-[#39C8A6] disabled:opacity-50"
            >
              <Search size={24} strokeWidth={1.5} />
            </button>
            <input
              type="text"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Enter account address"
              className="w-full min-w-0 flex-1 bg-transparent text-lg font-light text-white placeholder:text-white/30 focus:outline-none"
            />
          </div>

          <p className="forensics-blink-cursor mt-4 text-sm text-white/55">
            {helperText}
          </p>

          {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
        </form>

        {recentSearches.length > 0 ? (
          <div className="mt-6">
            <p className="text-xs uppercase tracking-[0.18em] text-white/45">
              Recent Searches
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {recentSearches.map((address) => (
                <button
                  key={address}
                  type="button"
                  onClick={() => handleRecentClick(address)}
                  className="rounded-lg border border-white/10 bg-black/55 px-4 py-2 text-sm text-white/80 transition hover:border-[#39C8A6]/45 hover:text-[#39C8A6]"
                >
                  {address}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-10 grid max-w-6xl grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
          {FEATURE_CARDS.map((card) => (
            <div
              key={card.title}
              className="rounded-lg border border-white/10 bg-black/60 p-6 text-left transition-all hover:border-[#39C8A6]/25 hover:bg-black/75"
            >
              <div className="mb-4 h-1 w-8 rounded-full bg-[#39C8A6]/50" />
              <h3 className="text-lg text-white font-helveticaMedium">
                {card.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-white/58">
                {card.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
